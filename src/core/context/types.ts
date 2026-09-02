/* Arbeitskontext — was der Nutzer gerade vor sich hat, als Anhang an einer Nutzer-Nachricht.
 * Spec: docs/superpowers/specs/2026-09-02-koda-arbeitskontext-design.md (E2). Pure. */

export const CONTEXT_MODES = ["off", "workspace", "note", "tabs", "vault"] as const;
export type ContextMode = (typeof CONTEXT_MODES)[number];

/** Etappe 1 baut zwei Modi; die uebrigen stehen in der Spec und kommen mit Etappe 2/3.
 *  Ein Modus, der noch nicht geht, wird NICHT angeboten (Spec E6: ein Eintrag, der nie
 *  geht, ist kein Versprechen). */
export const AVAILABLE_MODES: readonly ContextMode[] = ["off", "workspace"];

export type ContextSource =
  | "active" | "selection" | "tab" | "link" | "backlink" | "related" | "vault" | "manual" | "folder" | "base";
export type ContextKind = "pointer" | "full" | "table";

export interface ContextItem {
  source: ContextSource;
  path: string;
  kind: ContextKind;
  /** Zeichen im gerenderten Block — nach Kuerzung. */
  chars: number;
  /** Zeichen vor der Kuerzung; nur gesetzt, wenn gekuerzt wurde. */
  fullChars?: number;
  /** Link-Ebene (1 = direkt), nur bei link/backlink (Etappe 2). */
  depth?: number;
  /** Bases: Base-Pfad + Ansicht, aus der die Zeile stammt (Etappe 3). */
  via?: string;
}

export interface ContextAttachment {
  mode: Exclude<ContextMode, "off">;
  items: ContextItem[];
  /** Der Block, wie er gesendet wurde. Persistiert — Notizen aendern sich, der Beleg nicht. */
  text: string;
}

export function isContextMode(v: unknown): v is ContextMode {
  return typeof v === "string" && (CONTEXT_MODES as readonly string[]).includes(v);
}

function isItem(raw: unknown): raw is ContextItem {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.source === "string" && typeof r.path === "string" && typeof r.kind === "string" && typeof r.chars === "number";
}

/** Minimal geprueft wie die Verdichtungs-Marke in `parseLines`: ein kaputtes Feld kostet
 *  das Feld, nicht die Nachricht. */
export function isContextAttachment(raw: unknown): raw is ContextAttachment {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return isContextMode(r.mode) && r.mode !== "off" && Array.isArray(r.items) && r.items.every(isItem) && typeof r.text === "string";
}
