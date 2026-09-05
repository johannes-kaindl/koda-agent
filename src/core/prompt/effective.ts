import { READING_TOOLS } from "./rules";

/** Welche lesenden Werkzeuge im aktuellen Zustand wirklich angeboten werden. Die Warnung
 *  „Koda kann den Vault nicht mehr lesen" haengt daran, und sie darf nicht anschlagen, weil
 *  vault-rag fehlt — `related_notes` zaehlt nur mit Index (Spec E3). */
export function activeReadingTools(disabled: string[], related: boolean): string[] {
  const aus = new Set(disabled);
  return READING_TOOLS.filter((n) => (n === "related_notes" ? related : true)).filter((n) => !aus.has(n));
}

/** Was im aktuellen Zustand ueberhaupt angeboten werden KOENNTE — ohne Ruecksicht darauf,
 *  was der Nutzer abgeschaltet hat. Gegenstueck zu `activeReadingTools`: erst der
 *  Vergleich beider sagt, ob ein einzelnes Lesewerkzeug fehlt. */
export function availableReadingTools(related: boolean): string[] {
  return READING_TOOLS.filter((n) => (n === "related_notes" ? related : true));
}
