import { normalizeRel } from "./path-guard";

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
  const p = normalizeRel(path).toLowerCase();
  const folder = normalizeRel(kodaFolder).toLowerCase();
  if (folder === "") return "confirm";
  const inKoda = p === folder || p.startsWith(folder + "/");
  if (!inKoda) return "confirm";
  const skills = `${folder}/${SKILLS_SUBFOLDER.toLowerCase()}`;
  return p === skills || p.startsWith(skills + "/") ? "confirm" : "free";
}
