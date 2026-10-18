/* „Speichern“ (Spec § 5): der effektive Stand aus Arbeit und Overlay als Abweichung von der
 * Grundeinstellung. Pure — der Adapter (`src/obsidian/arbeiten.ts`) schreibt es per `processFrontMatter`. */
import type { Skill } from "../skills/skill";
import {
  effectiveContext, effectiveDisabledTools, effectiveSkillMode, frontmatterMode,
  type ContextDefaults, type ProviderTools,
} from "./resolve";
import type { Arbeit, ArbeitKontext, OnOff, Overlay, SkillMode } from "./types";

export interface SaveInput {
  skills: Skill[];
  arbeit: Arbeit | null;
  overlay: Overlay;
  settings: ContextDefaults & { toolsDisabled: readonly string[] };
  ownTools: readonly string[];
  providers: readonly ProviderTools[];
  /** Die aktuellen Einzelpfade aus `contextManual`. */
  manual: readonly string[];
}

/** Genau diese Schlüssel löscht der Adapter vor dem Schreiben; alles andere im Frontmatter bleibt. */
export const ARBEIT_KEYS = ["koda", "skills", "übrige-skills", "werkzeuge", "anbieter", "kontext", "base"] as const;

export function arbeitFrontmatter(i: SaveInput): Record<string, unknown> {
  const fm: Record<string, unknown> = { koda: "arbeit" };
  const uebrige = i.arbeit?.uebrigeSkills ?? "grundeinstellung";

  // Bei `grundeinstellung` steht jeder Skill drin, der vom Frontmatter abweicht; bei `aus` jeder, der nicht aus ist.
  const skills: Record<string, SkillMode> = {};
  for (const s of [...i.skills].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const mode = effectiveSkillMode(s, i.arbeit, i.overlay);
    if (uebrige === "aus" ? mode !== "aus" : mode !== frontmatterMode(s)) skills[s.name] = mode;
  }
  if (Object.keys(skills).length > 0) fm["skills"] = skills;
  if (uebrige === "aus") fm["übrige-skills"] = "aus";

  const off = new Set(effectiveDisabledTools(i.settings.toolsDisabled, i.ownTools, i.providers, i.arbeit, i.overlay));
  const werkzeuge: Record<string, OnOff> = {};
  for (const t of [...i.ownTools].sort()) {
    const now = off.has(t);
    if (now !== i.settings.toolsDisabled.includes(t)) werkzeuge[t] = now ? "aus" : "an";
  }
  if (Object.keys(werkzeuge).length > 0) fm["werkzeuge"] = werkzeuge;

  const anbieter: Record<string, OnOff> = {};
  for (const p of [...i.providers].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if ((i.overlay.anbieter[p.id] ?? i.arbeit?.anbieter[p.id]) === "aus") anbieter[p.id] = "aus";
  }
  if (Object.keys(anbieter).length > 0) fm["anbieter"] = anbieter;

  const eff = effectiveContext(i.settings, i.arbeit, i.overlay);
  const kontext: ArbeitKontext = {};
  if (eff.mode !== i.settings.contextModeDefault) kontext.modus = eff.mode;
  if (eff.depth !== i.settings.contextLinkDepth) kontext.tiefe = eff.depth;
  if (eff.budget !== i.settings.contextBudgetChars) kontext.budget = eff.budget;
  if (eff.autoK !== i.settings.contextAutoK) kontext.nachbarn = eff.autoK;
  if (i.manual.length > 0) kontext.notizen = [...i.manual];
  if (Object.keys(kontext).length > 0) fm["kontext"] = kontext;

  if (i.arbeit?.base) fm["base"] = i.arbeit.base;
  return fm;
}

/** Die Felder im Frontmatter einer Skill-Datei zu einer Stellung. Der Adapter löscht vorher `enabled` und `pinned`. */
export function skillModeFrontmatter(mode: SkillMode): { pinned?: true; enabled?: false } {
  if (mode === "aus") return { enabled: false };
  if (mode === "ganz") return { pinned: true };
  return {};
}
