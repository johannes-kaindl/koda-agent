/* ViewModel des Tabs „Fähigkeiten“ (UI-STANDARD §4: DOM ist eine Funktion des Zustands). Pure — das Panel
 * (`src/obsidian/abilities-panel.ts`) zeichnet nur, was hier steht. */
import type { Skill } from "../skills/skill";
import { effectiveDisabledTools, effectiveSkillMode, overlayCount, type ProviderTools } from "./resolve";
import type { Arbeit, Overlay, SkillMode } from "./types";

export interface SkillRowVM { name: string; chars: number; mode: SkillMode; fromOverlay: boolean }
/** Ein Skill, der nicht geladen werden konnte — ausgegraut mit Grund, nicht verschwunden. */
export interface FailedSkillVM { name: string; reason: "no-description" | "read-error" }
export interface ToolRowVM { name: string; on: boolean; fromOverlay: boolean }
export interface ProviderRowVM { id: string; total: number; enabled: number; on: boolean; fromOverlay: boolean }

export interface AbilitiesVM {
  /** Namen aller Arbeiten, sortiert. */
  arbeiten: string[];
  selected: string | null;
  /** Zahl der Abweichungen dieses Gespraechs gegenueber der Arbeit bzw. der Grundeinstellung. */
  changes: number;
  hints: string[];
  skills: SkillRowVM[];
  failed: FailedSkillVM[];
  /** Kodas eigene Werkzeuge, nach Name. */
  tools: ToolRowVM[];
  /** Fremde Plugins, nach Id. */
  providers: ProviderRowVM[];
  /** Summe der Texte, die auf „ganz“ stehen. */
  pinnedChars: number;
  budgetChars: number;
}

export interface AbilitiesInput {
  skills: Skill[];
  failed: FailedSkillVM[];
  arbeiten: string[];
  /** Name der gewaehlten Arbeit, auch wenn die Datei fehlt (dann ist `arbeit` null und ein Hinweis erklaert es). */
  selected: string | null;
  arbeit: Arbeit | null;
  hints: string[];
  overlay: Overlay;
  settingsDisabled: readonly string[];
  ownTools: readonly string[];
  providers: readonly ProviderTools[];
  budgetChars: number;
}

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function abilitiesViewModel(i: AbilitiesInput): AbilitiesVM {
  const overlaySkills = Object.keys(i.overlay.skills).map((k) => k.toLowerCase());
  const skills = [...i.skills].sort((a, b) => byName(a.name, b.name)).map((s): SkillRowVM => ({
    name: s.name,
    chars: s.body.length,
    mode: effectiveSkillMode(s, i.arbeit, i.overlay),
    fromOverlay: overlaySkills.includes(s.name.toLowerCase()),
  }));
  const off = new Set(effectiveDisabledTools(i.settingsDisabled, i.ownTools, i.providers, i.arbeit, i.overlay));
  return {
    arbeiten: [...i.arbeiten].sort(byName),
    selected: i.selected,
    changes: overlayCount(i.overlay),
    hints: i.hints,
    skills,
    failed: [...i.failed].sort((a, b) => byName(a.name, b.name)),
    tools: [...i.ownTools].sort(byName).map((name): ToolRowVM => ({ name, on: !off.has(name), fromOverlay: name in i.overlay.werkzeuge })),
    providers: [...i.providers].sort((a, b) => byName(a.id, b.id)).map((p): ProviderRowVM => ({
      id: p.id,
      total: p.tools.length,
      enabled: p.tools.filter((n) => !off.has(n)).length,
      on: (i.overlay.anbieter[p.id] ?? i.arbeit?.anbieter[p.id]) !== "aus",
      fromOverlay: p.id in i.overlay.anbieter,
    })),
    pinnedChars: skills.reduce((sum, s) => sum + (s.mode === "ganz" ? s.chars : 0), 0),
    budgetChars: i.budgetChars,
  };
}
