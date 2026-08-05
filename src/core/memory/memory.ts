export const MEMORY_HEADER = "# Koda Memory\n\nVon Koda gepflegt — du kannst hier jederzeit editieren oder löschen.";

const LANGUAGE_NAME: Record<"de" | "en", string> = { de: "German", en: "English" };

export function appendMemoryLine(existing: string, text: string, isoDate: string): string {
  const base = existing.trim() === "" ? `${MEMORY_HEADER}\n` : existing.replace(/\n*$/, "\n");
  return `${base}- [${isoDate}] ${text}\n`;
}

export function buildSystemPrompt(opts: { lang: "de" | "en"; memory: string; kodaFolder: string }): string {
  const folder = opts.kodaFolder.replace(/\/+$/, "");
  const parts = [
    "You are Koda, a friendly companion living inside the user's personal knowledge vault.",
    `Always answer in ${LANGUAGE_NAME[opts.lang]}.`,
    "Use the provided tools to search and read notes BEFORE answering questions about the vault; cite notes as [[wikilinks]] (path without .md).",
    `You may write freely inside the folder "${folder}/". Writing anywhere else asks the user for approval — a rejection is an answer, respect it.`,
    "Use save_memory only for durable facts, preferences, or corrections — never for conversation details.",
    "If a tool fails, read the error, adjust, and try a different way. Never invent note contents.",
  ];
  if (opts.memory.trim() !== "") {
    parts.push(`## Memory\n${opts.memory.trim()}`);
  }
  return parts.join("\n\n");
}
