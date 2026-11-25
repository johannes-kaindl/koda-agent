import type { Selection } from "../skills/select";
import { renderNow } from "./now";
import { effectiveRules, renderRules } from "./rules";
import { RAHMEN_STANDARD, kappeMemory, type RahmenSchalter } from "../agent/rahmen";

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
  /** Interne Schalter des Messrahmens (`rahmen.ts`); fehlt → `RAHMEN_STANDARD`, das Verhalten vor den Schaltern. */
  rahmen?: Readonly<RahmenSchalter>;
}): string {
  const rahmen = opts.rahmen ?? RAHMEN_STANDARD;
  const parts = [renderRules(effectiveRules(opts.rulesOverride), { lang: opts.lang, folder: opts.kodaFolder })];
  if (opts.memory.trim() !== "") parts.push(`## Memory\n${kappeMemory(opts.memory.trim(), rahmen)}`);
  const skillsBlock = renderSkills(opts.skills);
  if (skillsBlock !== "") parts.push(skillsBlock);
  if (opts.now !== undefined) {
    const now = renderNow(opts.now, opts.timeZone);
    // (a): `2026-09-30 (Wednesday) 23:45, Europe/Berlin` → `2026-09-30 (Wednesday), Europe/Berlin`.
    parts.push(`## Now\n${rahmen.nowNurDatum ? now.replace(/ \d{2}:\d{2},/, ",") : now}`);
  }
  return parts.join("\n\n");
}

function renderSkills(sel: Selection | undefined): string {
  if (sel === undefined) return "";
  const blocks: string[] = [];
  for (const s of sel.loaded) {
    blocks.push(s.body === "" ? `### ${s.name}\n${s.description}` : `### ${s.name}\n${s.description}\n\n${s.body}`);
  }
  for (const s of sel.descriptionOnly) {
    // Ehrlich benennen, dass hier der Body fehlt: Koda soll wissen, dass es den Skill gibt,
    // und den Weg dorthin kennen.
    blocks.push(`### ${s.name}\n${s.description}\n(not loaded — call load_skill to read it)`);
  }
  return blocks.length === 0 ? "" : `## Skills\n${blocks.join("\n\n")}`;
}
