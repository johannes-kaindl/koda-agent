import { ARBEITEN_SUBFOLDER } from "../abilities/types";
import { isInFolder } from "../../vendor/kit/folder-scope";

export type WriteDecision = "free" | "confirm";

/** Unterordner des Koda-Ordners, in dem Skills liegen. */
export const SKILLS_SUBFOLDER = "Skills";

/** Schreibregel: im Koda-Ordner frei, sonst Bestaetigung — MIT EINER AUSNAHME.
 *
 *  Der raeumliche Freibrief kodiert "das ist Kodas eigener Kram, dein Vault bleibt
 *  unberuehrt". Ein Skill ist aber kein eigener Kram: er aendert, was das Werkzeug
 *  kuenftig tut. Deshalb entscheidet hier nicht nur WO geschrieben wird, sondern WAS.
 *
 *  Die Grenze sitzt bewusst in der Policy und nicht im write_skill-Tool — sonst waere
 *  sie ueber ein gewoehnliches write_note nach <Koda>/Skills/... umgehbar.
 *
 *  Vergleich case-insensitiv und segment-genau: "Koda-Archiv" matcht "Koda" nicht,
 *  "Skillset.md" matcht "Skills/" nicht. */
/** Die Lesart des strengsten Dateisystems: Windows streicht Leerraum und Punkte am Ende eines Ordnernamens (`Skills ` und `Skills.`
 *  sind dort `Skills`), und ein geschuetztes Leerzeichen (U+00A0, U+202F) ist ein Leerzeichen. Segmente, die nur aus Punkten und
 *  Leerraum bestehen (`.`, `..`), bleiben stehen: sie sind Sache von `rel-path`/`folder-scope`. */
function windowsReading(path: string): string {
  return path.split(/[\\/]/).map((seg) => {
    const spaced = seg.replace(/[\u00a0\u202f]/g, " ");
    const stripped = spaced.replace(/[ .]+$/, "");
    return stripped === "" ? seg : stripped;
  }).join("/");
}

/** Ob `path` in `folder` liegt — in BEIDEN Lesarten (wie geschrieben und wie Windows es liest) ist es nur dann „in“, wenn es in beiden
 *  drin ist; fuer einen geschuetzten Unterordner genuegt EINE. Ein Pfad `Koda/Skills /x.md` landet auf Windows in `Skills`, auf macOS
 *  in einem anderen Ordner: fuer die Rueckfrage zaehlt die vorsichtigere Antwort. */
const inBoth = (path: string, folder: string, opts: { self: true; ignoreCase: true }): boolean =>
  isInFolder(path, folder, opts) && isInFolder(windowsReading(path), windowsReading(folder), opts);
const inEither = (path: string, folder: string, opts: { self: true; ignoreCase: true }): boolean =>
  isInFolder(path, folder, opts) || isInFolder(windowsReading(path), windowsReading(folder), opts);

export function writePolicy(path: string, kodaFolder: string): WriteDecision {
  // Ordnerzugehoerigkeit aus code-kit `folder-scope`: der Ordner selbst zaehlt mit (`self`), Gross/klein egal (`ignoreCase`), ganze
  // Segmente. Ein leerer Koda-Ordner enthaelt NICHTS (kein `root`) — also Rueckfrage; ein Pfad mit `..` liegt in keinem Ordner.
  const opts = { self: true, ignoreCase: true } as const;
  if (!inBoth(path, kodaFolder, opts)) return "confirm";
  // Eine Arbeit bestimmt wie ein Skill, was Koda darf (Spec Faehigkeiten § 13). Das Schreiben aus dem Tab
  // („Speichern“) ist eine Nutzerhandlung und laeuft nicht durch diese Policy.
  for (const sub of [SKILLS_SUBFOLDER, ARBEITEN_SUBFOLDER]) {
    if (inEither(path, `${kodaFolder}/${sub}`, opts)) return "confirm";
  }
  return "free";
}
