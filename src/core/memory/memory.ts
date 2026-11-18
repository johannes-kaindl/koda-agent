export const MEMORY_HEADER = "# Koda Memory\n\nVon Koda gepflegt — du kannst hier jederzeit editieren oder löschen.";

/** Genau ein Zeilenumbruch am Ende. Frühere Fassung (Regex aus Zeilenumbruch-Folge vor dem Textende): ein Lauf von Zeilenumbrüchen mitten in der Datei wurde von jeder Startposition
 *  neu bis zu seinem Ende gelesen (quadratisch); der Fuzz in `tests/linear-fuzz.test.ts` fand es. */
function withOneTrailingNewline(text: string): string {
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 10) end--;
  return `${text.slice(0, end)}\n`;
}

export function appendMemoryLine(existing: string, text: string, isoDate: string): string {
  const base = existing.trim() === "" ? `${MEMORY_HEADER}\n` : withOneTrailingNewline(existing);
  return `${base}- [${isoDate}] ${text}\n`;
}
