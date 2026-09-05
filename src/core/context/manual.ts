/* Der manuell hinzugefuegte Anteil des Kontexts. Pure — der Zustand lebt im Plugin.
 *
 * Beide Funktionen geben bei „nichts geaendert" die EINGANGSLISTE zurueck (Referenz-
 * gleichheit), nicht eine gleiche Kopie: der Aufrufer erkennt daran, ob er die Views
 * neu zeichnen muss. Dieselbe Bauart wie `applySelection` in `selection.ts`. */
export function addPaths(current: readonly string[], zusatz: readonly string[]): string[] {
  const vorhanden = new Set(current);
  const neu: string[] = [];
  for (const p of zusatz) {
    if (vorhanden.has(p)) continue;
    vorhanden.add(p);
    neu.push(p);
  }
  return neu.length === 0 ? (current as string[]) : [...current, ...neu];
}

export function removePath(current: readonly string[], path: string): string[] {
  if (!current.includes(path)) return current as string[];
  return current.filter((p) => p !== path);
}
