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
export function writePolicy(path: string, kodaFolder: string): WriteDecision {
  // Ordnerzugehoerigkeit aus code-kit `folder-scope`: der Ordner selbst zaehlt mit (`self`), Gross/klein egal (`ignoreCase`), ganze
  // Segmente. Ein leerer Koda-Ordner enthaelt NICHTS (kein `root`) — also Rueckfrage; ein Pfad mit `..` liegt in keinem Ordner.
  const opts = { self: true, ignoreCase: true } as const;
  if (!isInFolder(path, kodaFolder, opts)) return "confirm";
  // Eine Arbeit bestimmt wie ein Skill, was Koda darf (Spec Faehigkeiten § 13). Das Schreiben aus dem Tab
  // („Speichern“) ist eine Nutzerhandlung und laeuft nicht durch diese Policy.
  for (const sub of [SKILLS_SUBFOLDER, ARBEITEN_SUBFOLDER]) {
    if (isInFolder(path, `${kodaFolder}/${sub}`, opts)) return "confirm";
  }
  return "free";
}
