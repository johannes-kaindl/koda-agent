import { ARBEITEN_SUBFOLDER } from "../abilities/types";
import { isInFolder } from "../../vendor/kit/folder-scope";

export type WriteDecision = "free" | "confirm";

/** Was ein Schreibvorgang mit dem Inhalt macht; nur `replace` verliert alten Text. */
export type WriteMode = "create" | "append" | "replace";

/** Dateiname des Gedaechtnisses im Koda-Ordner (`save_memory` haengt an, der Prompt liest es). */
export const MEMORY_FILE = "Memory.md";

/** Unterordner des Koda-Ordners, in dem Skills liegen. */
export const SKILLS_SUBFOLDER = "Skills";

/** Schreibregel: im Koda-Ordner frei, sonst Bestaetigung — MIT ZWEI AUSNAHMEN.
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
export function writePolicy(path: string, kodaFolder: string, mode?: WriteMode): WriteDecision {
  // Ordnerzugehoerigkeit aus code-kit `folder-scope`: der Ordner selbst zaehlt mit (`self`), Gross/klein egal (`ignoreCase`), ganze
  // Segmente. Ein leerer Koda-Ordner enthaelt NICHTS (kein `root`) — also Rueckfrage; ein Pfad mit `..` liegt in keinem Ordner.
  // Die Freizone ist eine Zone, in die ohne Rueckfrage geschrieben wird: sie liest den Pfad, wie er dasteht (`Koda /x.md` liegt
  // nicht in `Koda`, auch wenn Windows ihn dorthin legte) — die engere Lesart.
  if (!isInFolder(path, kodaFolder, { self: true, ignoreCase: true })) return "confirm";
  // Eine Arbeit bestimmt wie ein Skill, was Koda darf (Spec Faehigkeiten § 13). Das Schreiben aus dem Tab
  // („Speichern“) ist eine Nutzerhandlung und laeuft nicht durch diese Policy. Die geschuetzten Unterordner liest `reading:
  // "filesystem"` wie das strengste Dateisystem (`Skills `, `Skills.`, `Skills:x`, `Skillſ` sind dort `Skills`): ein Pfad, den EINE
  // Lesart hineinlegt, fragt.
  for (const sub of [SKILLS_SUBFOLDER, ARBEITEN_SUBFOLDER]) {
    if (isInFolder(path, `${kodaFolder}/${sub}`, { self: true, reading: "filesystem" })) return "confirm";
  }
  // Das Gedaechtnis ersetzt man nicht still: ein `replace` auf <Koda>/Memory.md loescht, was Koda ueber den Nutzer gesammelt hat
  // (Entscheidung Johannes 2026-10-23); Anhaengen bleibt frei. Der Modus ist optional — wer ihn nicht kennt (Verschieben, Bildordner),
  // bekommt die Antwort wie vorher. Die Datei liest `reading: "filesystem"` wie die geschuetzten Unterordner (`Memory.md `, `memory.md`).
  if (mode === "replace" && isInFolder(path, `${kodaFolder}/${MEMORY_FILE}`, { self: true, reading: "filesystem" })) return "confirm";
  return "free";
}
