import { resolveNotePath } from "./path-guard";
import { writePolicy } from "./write-policy";

export type MoveDecision = "free" | "confirm";

/** Freigaberegel fuers Verschieben. Sie fragt BEIDE Orte, und das ist der ganze
 *  Unterschied zu `writePolicy`.
 *
 *  Ein Schreibvorgang hat einen Ort, ein Move hat zwei — und der raeumliche
 *  Freibrief des Koda-Ordners ("das ist Kodas eigener Kram, dein Vault bleibt
 *  unberuehrt") gilt nur, solange beide Enden darin liegen. Wer nur die Quelle
 *  pruefte, koennte aus dem Koda-Ordner heraus ueberall hin schreiben; wer nur
 *  das Ziel pruefte, koennte jede Notiz des Vaults ohne Rueckfrage einsammeln.
 *
 *  Umgesetzt als UND ueber `writePolicy`, nicht als eigene Pfadlogik: die
 *  Skills-Ausnahme und der segmentgenaue, case-insensitive Vergleich sind dort
 *  schon entschieden und getestet. Eine zweite Fassung derselben Regel liefe
 *  auseinander, sobald jemand nur eine von beiden anfasst. */
export function movePolicy(source: string, destination: string, kodaFolder: string): MoveDecision {
  const beide = writePolicy(source, kodaFolder) === "free"
    && writePolicy(destination, kodaFolder) === "free";
  return beide ? "free" : "confirm";
}

/** Was ein Move ist, wenn man ihn ausgerechnet hat. `kind` unterscheidet Umbenennen
 *  (gleicher Ordner) von Verschieben — nicht fuer die Mechanik, die ist identisch,
 *  sondern fuer die Meldung an Modell und Nutzer: "umbenannt" und "verschoben"
 *  beschreiben verschiedene Vorgaenge, und wer beides "verschoben" nennt, macht die
 *  Rueckmeldung an genau der Stelle unscharf, an der der Nutzer sie prueft. */
export interface MovePlan {
  source: string;
  destination: string;
  kind: "rename" | "move";
}

/** Ordner eines vault-relativen Pfades; "" ist die Vault-Wurzel und ein gueltiger Wert. */
function folderOf(path: string): string {
  const at = path.lastIndexOf("/");
  return at === -1 ? "" : path.slice(0, at);
}

/** Beide Pfade durch denselben Guard wie `read_note`/`write_note` — kein Traversal,
 *  nur `.md`, vault-relativ. Identische Pfade sind ein Fehler und keine Nulloperation:
 *  das Modell hat sich dann verrechnet, und ein stilles "ok" bestaerkt es darin. */
export function planMove(source: string, destination: string): MovePlan {
  const from = resolveNotePath(source);
  const to = resolveNotePath(destination);
  if (from === to) throw new Error(`Quelle und Ziel sind der gleiche Pfad: "${from}"`);
  return { source: from, destination: to, kind: folderOf(from) === folderOf(to) ? "rename" : "move" };
}
