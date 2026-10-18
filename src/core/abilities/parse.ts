import { isContextMode } from "../context/types";
import {
  CONTEXT_AUTO_K_MAX, CONTEXT_AUTO_K_MIN, CONTEXT_BUDGET_MAX, CONTEXT_BUDGET_MIN,
  CONTEXT_LINK_DEPTH_MAX, CONTEXT_LINK_DEPTH_MIN,
} from "../settings-types";
import { SKILL_MODES, type Arbeit, type ArbeitKontext, type OnOff, type SkillMode } from "./types";

export interface ParsedArbeit {
  arbeit: Arbeit;
  /** Einträge, die nicht gelten (`skills.b`, `kontext.tiefe`, …) — der Tab nennt sie, statt sie still zu verwerfen. */
  invalid: string[];
}

function isMap(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Ganzzahl in den Grenzen; Zahl oder Ziffern-String (YAML liefert beides je nach Schreibweise). */
function intIn(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function readMap<T extends string>(raw: unknown, key: string, allowed: readonly T[], invalid: string[]): Record<string, T> {
  const out: Record<string, T> = {};
  if (raw === undefined || raw === null) return out;
  if (!isMap(raw)) {
    invalid.push(key);
    return out;
  }
  for (const [name, v] of Object.entries(raw)) {
    if (typeof v === "string" && (allowed as readonly string[]).includes(v)) out[name] = v as T;
    else invalid.push(`${key}.${name}`);
  }
  return out;
}

/** Liest eine Arbeit aus dem von **Obsidian** geparsten Frontmatter (`metadataCache`), nicht aus dem
 *  Kit-Parser `parseFrontmatter` — der liefert nur flache Strings und kennt keine verschachtelten Maps.
 *  `null`, wenn die Notiz keine Arbeit ist (`koda: arbeit` fehlt). Ein ungültiger Eintrag kostet den
 *  Eintrag, nicht die Arbeit (Spec § 4). */
export function parseArbeit(name: string, fm: unknown): ParsedArbeit | null {
  if (!isMap(fm) || fm["koda"] !== "arbeit") return null;
  const invalid: string[] = [];
  const skills = readMap<SkillMode>(fm["skills"], "skills", SKILL_MODES, invalid);
  let uebrigeSkills: Arbeit["uebrigeSkills"] = "grundeinstellung";
  const u = fm["übrige-skills"];
  if (u === "aus" || u === "grundeinstellung") uebrigeSkills = u;
  else if (u !== undefined && u !== null) invalid.push("übrige-skills");
  const werkzeuge = readMap<OnOff>(fm["werkzeuge"], "werkzeuge", ["an", "aus"], invalid);
  const anbieter = readMap<OnOff>(fm["anbieter"], "anbieter", ["an", "aus"], invalid);

  const kontext: ArbeitKontext = {};
  const k = fm["kontext"];
  if (isMap(k)) {
    if (k["modus"] !== undefined) {
      if (isContextMode(k["modus"])) kontext.modus = k["modus"];
      else invalid.push("kontext.modus");
    }
    const ints: [keyof Pick<ArbeitKontext, "tiefe" | "budget" | "nachbarn">, number, number][] = [
      ["tiefe", CONTEXT_LINK_DEPTH_MIN, CONTEXT_LINK_DEPTH_MAX],
      ["budget", CONTEXT_BUDGET_MIN, CONTEXT_BUDGET_MAX],
      ["nachbarn", CONTEXT_AUTO_K_MIN, CONTEXT_AUTO_K_MAX],
    ];
    for (const [key, min, max] of ints) {
      if (k[key] === undefined) continue;
      const n = intIn(k[key], min, max);
      if (n === null) invalid.push(`kontext.${key}`);
      else kontext[key] = n;
    }
    const nz = k["notizen"];
    if (nz !== undefined && nz !== null) {
      if (Array.isArray(nz)) {
        const list: string[] = [];
        nz.forEach((p, i) => {
          if (typeof p === "string" && p.trim() !== "") list.push(p.trim());
          else invalid.push(`kontext.notizen.${i}`);
        });
        kontext.notizen = list;
      } else invalid.push("kontext.notizen");
    }
  } else if (k !== undefined && k !== null) invalid.push("kontext");

  let base: string | null = null;
  const b = fm["base"];
  if (typeof b === "string" && b.trim() !== "") base = b.trim();
  else if (b !== undefined && b !== null) invalid.push("base");

  return { arbeit: { name, skills, uebrigeSkills, werkzeuge, anbieter, kontext, base }, invalid };
}
