/* Path-Guard: vault-relativ, kein Traversal, nur .md. Die Segmentregeln kommen seit code-kit 0.31.0 aus `rel-path`
 * (Bibliothek ab Eins: sechs lokale Fassungen mit sechs Antworten); hier bleiben die Meldungen an das Modell und die Endungen.
 *
 * Unterschiede zur Fassung vor dem Tausch, je mit Grund (Dach-AGENTS § Kit-first Punkt 3):
 *  - Ein NUL-Byte im Pfad wird abgelehnt (vorher still durchgereicht): kein Dateisystem-Name enthaelt es, es ist nur ein Versuch,
 *    eine Pruefung zu uebergehen.
 *  - Ein Segment, das nach dem Trimmen `.` oder `..` ist (`".. "`), zaehlt als solches (vorher ein Name): ein Dateisystem, das
 *    Leerraum am Ende abschneidet, liest es so, und ein Guard muss der strengeren Lesart folgen.
 *  - Alles andere ist unveraendert: `/` und `\` trennen, leere und `.`-Segmente fallen weg, ein fuehrendes `/` ist beim Notizpfad ein
 *    Fehler und beim Ordner erlaubt (Modelle schreiben `/20_Projekte/`), `..` ist ueberall ein Fehler. */
import { normalizeRelPath, type RelPathProblem } from "../../vendor/kit/rel-path";

/** Die Meldung an das Modell zu einem abgelehnten Pfad — Koda-Wortlaut, das Kit liefert nur den Grund. */
function refusal(problem: RelPathProblem, rel: string): Error {
  switch (problem) {
    case "absolute": return new Error(`Nur vault-relative Pfade erlaubt: "${rel}"`);
    case "nul": return new Error(`Pfad enthält ein NUL-Zeichen: "${rel}"`);
    default: return new Error(`Pfad verlässt den Vault: "${rel}"`);
  }
}

/** Was Koda LESEN darf. Schreiben bleibt `.md` — `.base` (YAML) und `.canvas` (JSON) sind
 *  strukturierte Formate, die ein vom Modell geschriebener Teiltext kaputt macht. Spec E9
 *  Punkt 5: „Lesen erlaubt .md/.base/.canvas, Schreiben bleibt .md." */
export const READ_EXTENSIONS: readonly string[] = [".md", ".base", ".canvas"];

const WRITE_EXTENSIONS: readonly string[] = [".md"];

export function resolveNotePath(rel: string, allow: readonly string[] = WRITE_EXTENSIONS): string {
  const r = normalizeRelPath(rel);
  // Ein Pfad, von dem nichts bleibt (`""`, `"."`), ist kein Fehler dieser Pruefung, sondern scheitert wie bisher an der Endung.
  if (!r.ok && r.problem !== "empty") throw refusal(r.problem, rel);
  const norm = r.ok ? r.path : "";
  const klein = norm.toLowerCase();
  if (!allow.some((ext) => klein.endsWith(ext))) {
    throw new Error(`Nur ${allow.join(", ")} erlaubt: "${rel}"`);
  }
  return norm;
}

/** Ordner-Variante des Guards. Zwei bewusste Unterschiede zu `resolveNotePath`:
 *  kein `.md`-Zwang, und ein fuehrender `/` ist erlaubt statt ein Fehler — Modelle
 *  schreiben Ordner regelmaessig als "/20_Projekte/", das ist Schreibweise und keine
 *  Absicht, aus dem Vault zu zeigen. Der eigentliche Schutz (`..`) bleibt identisch.
 *  Rueckgabe "" bedeutet Vault-Wurzel. */
export function resolveFolderPath(rel: string): string {
  const r = normalizeRelPath(rel, { absolute: "strip", allowEmpty: true });
  if (!r.ok) throw refusal(r.problem, rel);
  return r.path;
}
