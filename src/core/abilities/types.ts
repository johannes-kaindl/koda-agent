/* Fähigkeiten und Arbeiten (Spec Vault-Cockpit `_SDD/2026-10-17-koda-faehigkeiten-und-arbeiten-design.md`).
 * Drei Ebenen: Grundeinstellung (Frontmatter der Skills, Einstellungen), Arbeit (Notiz unter
 * `<Koda-Ordner>/Arbeiten/`), Overlay (dieses Gespräch). Pure — kein Obsidian-Import. */
import type { BaseSnapshot } from "../context/bases";
import type { ContextMode } from "../context/types";

export type SkillMode = "aus" | "beschreibung" | "ganz";
export const SKILL_MODES: readonly SkillMode[] = ["aus", "beschreibung", "ganz"];

export type OnOff = "an" | "aus";

/** Unterordner des Koda-Ordners, in dem Arbeiten liegen (Gegenstück zu `SKILLS_SUBFOLDER`). */
export const ARBEITEN_SUBFOLDER = "Arbeiten";

export interface ArbeitKontext {
  modus?: ContextMode;
  tiefe?: number;
  budget?: number;
  nachbarn?: number;
  /** Notizpfade oder Ordner mit "/" am Ende; Ordner löst der Adapter beim Anwenden auf. */
  notizen?: string[];
}

export interface Arbeit {
  /** Dateiname ohne .md — wie bei Skills kein Frontmatter-Feld. */
  name: string;
  skills: Record<string, SkillMode>;
  uebrigeSkills: "aus" | "grundeinstellung";
  /** Kodas eigene Werkzeuge. */
  werkzeuge: Record<string, OnOff>;
  /** Fremde Plugins, Schlüssel ist die Plugin-Id. */
  anbieter: Record<string, OnOff>;
  kontext: ArbeitKontext;
  /** `"<Pfad>.base#<Ansicht>"` oder null — ausgewertet erst in Plan 2. */
  base: string | null;
}

/** Abweichungen dieses Gesprächs. Ein Eintrag, der dem Wert ohne Overlay gleicht, steht
 *  nicht drin (die Setter entfernen ihn) — die Zahl der Einträge ist die Zahl der Änderungen. */
export interface Overlay {
  skills: Record<string, SkillMode>;
  werkzeuge: Record<string, OnOff>;
  anbieter: Record<string, OnOff>;
  kontext: { modus?: ContextMode; tiefe?: number; nachbarn?: number };
}

/** Der Sitzungszustand an EINER Stelle (Spec § 9). Wird mit dem Gespräch gespeichert. */
export interface SessionState {
  /** Name der gewählten Arbeit, null = keine. */
  arbeit: string | null;
  overlay: Overlay;
  /** Entspricht dem bisherigen `contextManual`. */
  manual: string[];
  /** Uebernommene Bases-Schnappschuesse (Plan 2). Optional: eine Marke aus der Zeit davor bleibt gueltig. */
  bases?: BaseSnapshot[];
}

export function emptyOverlay(): Overlay {
  return { skills: {}, werkzeuge: {}, anbieter: {}, kontext: {} };
}

export function emptySessionState(): SessionState {
  return { arbeit: null, overlay: emptyOverlay(), manual: [] };
}
