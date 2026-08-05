import { normalizeRel } from "./path-guard";

export type WriteDecision = "free" | "confirm";

/** Schreibregel des MVP: im Koda-Ordner frei, sonst Bestaetigung.
 *  Vergleich case-insensitiv und segment-genau ("Koda-Archiv" matcht "Koda" NICHT). */
export function writePolicy(path: string, kodaFolder: string): WriteDecision {
  const p = normalizeRel(path).toLowerCase();
  const folder = normalizeRel(kodaFolder).toLowerCase();
  if (folder === "") return "confirm";
  return p === folder || p.startsWith(folder + "/") ? "free" : "confirm";
}
