import type { Selection } from "../skills/select";
import { renderNow } from "./now";
import { effectiveRules, renderRules } from "./rules";

/** Drei Schichten: Regelblock (ersetzbar), Memory, Skills. Die letzten beiden sind
 *  systemgesetzt und haengen auch an einem ueberschriebenen Regelblock — sie sind pro Lauf
 *  erzeugte Anhaenge, keine Prompt-Sprache (Spec E1). Dazu, wenn `now` gegeben ist, der
 *  Anhang `## Now`: bewusst AUSSERHALB des Regelblocks, weil dieser in den Vorlagen-Hash des
 *  llm-lab und in den Vergleich der Vorschau eingeht und sonst taeglich „geaendert" meldete. */
export function buildSystemPrompt(opts: {
  lang: "de" | "en";
  memory: string;
  kodaFolder: string;
  skills?: Selection;
  rulesOverride?: string;
  /** `ClockPort.now()`; fehlt → kein Anhang. */
  now?: number;
  /** IANA-Zeitzone; fehlt → die des Rechners. */
  timeZone?: string;
}): string {
  const parts = [renderRules(effectiveRules(opts.rulesOverride), { lang: opts.lang, folder: opts.kodaFolder })];
  if (opts.memory.trim() !== "") parts.push(`## Memory\n${opts.memory.trim()}`);
  const skillsBlock = renderSkills(opts.skills);
  if (skillsBlock !== "") parts.push(skillsBlock);
  if (opts.now !== undefined) parts.push(`## Now\n${renderNow(opts.now, opts.timeZone)}`);
  return parts.join("\n\n");
}

function renderSkills(sel: Selection | undefined): string {
  if (sel === undefined) return "";
  const blocks: string[] = [];
  for (const s of sel.loaded) {
    blocks.push(s.body === "" ? `### ${s.name}\n${s.description}` : `### ${s.name}\n${s.description}\n\n${s.body}`);
  }
  for (const s of sel.descriptionOnly) {
    // Ehrlich benennen, dass hier etwas fehlt: Koda kann dem Skill nicht folgen,
    // soll aber wissen, dass es ihn gibt.
    blocks.push(`### ${s.name}\n${s.description}\n(not loaded — skill budget exhausted)`);
  }
  return blocks.length === 0 ? "" : `## Skills\n${blocks.join("\n\n")}`;
}
