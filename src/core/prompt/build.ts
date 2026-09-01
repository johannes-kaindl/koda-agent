import type { Selection } from "../skills/select";
import { effectiveRules, renderRules } from "./rules";

/** Drei Schichten: Regelblock (ersetzbar), Memory, Skills. Die letzten beiden sind
 *  systemgesetzt und haengen auch an einem ueberschriebenen Regelblock — sie sind pro Lauf
 *  erzeugte Anhaenge, keine Prompt-Sprache (Spec E1). */
export function buildSystemPrompt(opts: {
  lang: "de" | "en";
  memory: string;
  kodaFolder: string;
  skills?: Selection;
  rulesOverride?: string;
}): string {
  const parts = [renderRules(effectiveRules(opts.rulesOverride), { lang: opts.lang, folder: opts.kodaFolder })];
  if (opts.memory.trim() !== "") parts.push(`## Memory\n${opts.memory.trim()}`);
  const skillsBlock = renderSkills(opts.skills);
  if (skillsBlock !== "") parts.push(skillsBlock);
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
