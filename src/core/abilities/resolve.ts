/* Vorrang und Abbildung der drei Ebenen (Spec § 3): Overlay vor Arbeit vor Grundeinstellung.
 * Alles pure; die Obsidian-Schicht (`src/obsidian/arbeiten.ts`, `main.ts`) liest und schreibt nur. */
import type { ContextMode } from "../context/types";
import { selectSkills, type Selection } from "../skills/select";
import type { Skill } from "../skills/skill";
import type { Arbeit, OnOff, Overlay, SkillMode } from "./types";

/** Skill-Namen sind Dateinamen; eine Arbeit schreibt sie von Hand — Groß/klein zählt nicht. */
function findKey<V>(map: Readonly<Record<string, V>>, name: string): V | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(map)) if (k.toLowerCase() === lower) return v;
  return undefined;
}

function withoutKey<V>(map: Readonly<Record<string, V>>, name: string): Record<string, V> {
  const lower = name.toLowerCase();
  const out: Record<string, V> = {};
  for (const [k, v] of Object.entries(map)) if (k.toLowerCase() !== lower) out[k] = v;
  return out;
}

export function frontmatterMode(s: Skill): SkillMode {
  if (!s.enabled) return "aus";
  return s.pinned ? "ganz" : "beschreibung";
}

/** Der Wert ohne Overlay: ausdrücklich in der Arbeit, sonst `übrige-skills`, sonst das Frontmatter. */
export function baseSkillMode(s: Skill, arbeit: Arbeit | null): SkillMode {
  if (arbeit !== null) {
    const explicit = findKey(arbeit.skills, s.name);
    if (explicit !== undefined) return explicit;
    if (arbeit.uebrigeSkills === "aus") return "aus";
  }
  return frontmatterMode(s);
}

export function effectiveSkillMode(s: Skill, arbeit: Arbeit | null, overlay: Overlay): SkillMode {
  return findKey(overlay.skills, s.name) ?? baseSkillMode(s, arbeit);
}

/** Bildet die Stellungen auf `enabled`/`pinned` ab und ruft `selectSkills` — dieselbe Budget-Meldung wie bisher. */
export function selectEffective(skills: Skill[], arbeit: Arbeit | null, overlay: Overlay, budgetChars: number): Selection {
  return selectSkills(
    skills.map((s) => {
      const mode = effectiveSkillMode(s, arbeit, overlay);
      return { ...s, enabled: mode !== "aus", pinned: mode === "ganz" };
    }),
    budgetChars,
  );
}

/** Name → effektive Stellung; `null` für einen Skill, den es nicht gibt (Groß/klein egal). */
export function skillModeLookup(skills: Skill[], arbeit: Arbeit | null, overlay: Overlay): (name: string) => SkillMode | null {
  return (name) => {
    const lower = name.toLowerCase();
    const s = skills.find((x) => x.name.toLowerCase() === lower);
    return s === undefined ? null : effectiveSkillMode(s, arbeit, overlay);
  };
}

/** Setter: ein Wert gleich dem Wert ohne Overlay (`base`) entfernt den Eintrag. Neue Objekte, der Eingang bleibt. */
function withEntry<V>(map: Readonly<Record<string, V>>, name: string, value: V, base: V): Record<string, V> {
  const rest = withoutKey(map, name);
  return value === base ? rest : { ...rest, [name]: value };
}

export function withOverlaySkill(o: Overlay, name: string, mode: SkillMode, base: SkillMode): Overlay {
  return { ...o, skills: withEntry(o.skills, name, mode, base) };
}
export function withOverlayTool(o: Overlay, name: string, v: OnOff, base: OnOff): Overlay {
  return { ...o, werkzeuge: withEntry(o.werkzeuge, name, v, base) };
}
export function withOverlayProvider(o: Overlay, id: string, v: OnOff, base: OnOff): Overlay {
  return { ...o, anbieter: withEntry(o.anbieter, id, v, base) };
}

export function overlayCount(o: Overlay): number {
  const k = o.kontext;
  return (
    Object.keys(o.skills).length + Object.keys(o.werkzeuge).length + Object.keys(o.anbieter).length +
    [k.modus, k.tiefe, k.nachbarn].filter((v) => v !== undefined).length
  );
}

export interface ProviderTools { id: string; tools: string[] }

/** Die abgeschalteten Werkzeuge dieses Gesprächs. Eigene Werkzeuge: Overlay, sonst Arbeit, sonst Einstellungen
 *  (`aus` fügt hinzu, `an` nimmt heraus). Anbieter: nur `aus` wirkt (alle seine Werkzeuge); `an` heißt „wie in
 *  den Einstellungen“ und schaltet ein dort einzeln abgeschaltetes Werkzeug nicht wieder ein (Spec § 3). */
export function effectiveDisabledTools(
  settingsDisabled: readonly string[],
  ownTools: readonly string[],
  providers: readonly ProviderTools[],
  arbeit: Arbeit | null,
  overlay: Overlay,
): string[] {
  const off = new Set(settingsDisabled);
  for (const t of ownTools) {
    const v = overlay.werkzeuge[t] ?? arbeit?.werkzeuge[t];
    if (v === "aus") off.add(t);
    else if (v === "an") off.delete(t);
  }
  for (const p of providers) {
    if ((overlay.anbieter[p.id] ?? arbeit?.anbieter[p.id]) === "aus") for (const t of p.tools) off.add(t);
  }
  return [...off].sort();
}

export interface ContextDefaults {
  contextModeDefault: ContextMode;
  contextLinkDepth: number;
  contextBudgetChars: number;
  contextAutoK: number;
}
export interface EffectiveContext { mode: ContextMode; depth: number; budget: number; autoK: number }

/** Overlay, sonst Arbeit, sonst Einstellung. Das Budget kennt kein Overlay (kein Regler im Tab). */
export function effectiveContext(d: ContextDefaults, arbeit: Arbeit | null, overlay: Overlay): EffectiveContext {
  const a = arbeit?.kontext;
  return {
    mode: overlay.kontext.modus ?? a?.modus ?? d.contextModeDefault,
    depth: overlay.kontext.tiefe ?? a?.tiefe ?? d.contextLinkDepth,
    budget: a?.budget ?? d.contextBudgetChars,
    autoK: overlay.kontext.nachbarn ?? a?.nachbarn ?? d.contextAutoK,
  };
}

export interface KnownNames { skills: readonly string[]; ownTools: readonly string[]; providers: readonly string[] }

/** Einträge einer Arbeit, die auf nichts zeigen (Skill gelöscht, Werkzeug umbenannt, Plugin fehlt) —
 *  gilt trotzdem, der Tab nennt sie (CORE-DATA-01). */
export function unknownEntries(arbeit: Arbeit, known: KnownNames): string[] {
  const skills = known.skills.map((s) => s.toLowerCase());
  return [
    ...Object.keys(arbeit.skills).filter((n) => !skills.includes(n.toLowerCase())).map((n) => `skills.${n}`),
    ...Object.keys(arbeit.werkzeuge).filter((n) => !known.ownTools.includes(n)).map((n) => `werkzeuge.${n}`),
    ...Object.keys(arbeit.anbieter).filter((n) => !known.providers.includes(n)).map((n) => `anbieter.${n}`),
  ];
}
