import type { Selection } from "../skills/select";

export const MEMORY_HEADER = "# Koda Memory\n\nVon Koda gepflegt — du kannst hier jederzeit editieren oder löschen.";

const LANGUAGE_NAME: Record<"de" | "en", string> = { de: "German", en: "English" };

export function appendMemoryLine(existing: string, text: string, isoDate: string): string {
  const base = existing.trim() === "" ? `${MEMORY_HEADER}\n` : existing.replace(/\n*$/, "\n");
  return `${base}- [${isoDate}] ${text}\n`;
}

export function buildSystemPrompt(opts: {
  lang: "de" | "en";
  memory: string;
  kodaFolder: string;
  skills?: Selection;
}): string {
  const folder = opts.kodaFolder.replace(/\/+$/, "");
  const parts = [
    "You are Koda, a friendly companion living inside the user's personal knowledge vault.",
    `Always answer in ${LANGUAGE_NAME[opts.lang]}.`,
    "Use the provided tools to search and read notes BEFORE answering questions about the vault; cite notes as [[wikilinks]] (path without .md).",
    `You may write freely inside the folder "${folder}/". Writing anywhere else asks the user for approval — a rejection is an answer, respect it.`,
    "Use save_memory only for durable facts, preferences, or corrections — never for conversation details.",
    "If a tool fails, read the error, adjust, and try a different way. Never invent note contents.",
    // Kein Prioritaetssystem: bei 2-10 handgeschriebenen Skills waere jede
    // Aufloesungsregel im Code Overengineering — und eine still getroffene Wahl
    // waere fuer den Nutzer unsichtbar.
    "If two instructions conflict — two skills, or a skill and your memory — say so instead of silently picking one.",
  ];
  if (opts.memory.trim() !== "") {
    parts.push(`## Memory\n${opts.memory.trim()}`);
  }
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
