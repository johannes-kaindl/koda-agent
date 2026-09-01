export const MEMORY_HEADER = "# Koda Memory\n\nVon Koda gepflegt — du kannst hier jederzeit editieren oder löschen.";

export function appendMemoryLine(existing: string, text: string, isoDate: string): string {
  const base = existing.trim() === "" ? `${MEMORY_HEADER}\n` : existing.replace(/\n*$/, "\n");
  return `${base}- [${isoDate}] ${text}\n`;
}
