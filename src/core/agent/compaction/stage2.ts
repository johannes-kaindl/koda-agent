/* Stufe 2: abgeschlossene Runden durch das Modell zusammenfassen. Teuer (lokal Minuten)
 * und die unzuverlaessigste Stelle im System — deshalb zuletzt, selten, abschaltbar, und
 * ohne Ergebnis lieber KEIN Record als ein leerer. Rollend, weil die Eingabe selbst ins
 * Fenster passen muss (sie ist ja der Grund, warum wir ueber Budget sind). */
import type { ChatMessage, CompactionRecord } from "../types";

/** Anteil des Budgets, den ein Zusammenfassungs-Aufruf hoechstens fuellt. Konstante, keine
 *  Einstellung: sie aendert nur, in wie viele Aufrufe eine Zusammenfassung zerfaellt. */
export const PACK_RATIO = 0.6;

const LANGUAGE_NAME: Record<"de" | "en", string> = { de: "German", en: "English" };

/** Runden = ab jeder user-Nachricht bis vor die naechste. Der System-Praefix zaehlt nicht,
 *  die letzte Runde ist die laufende. */
export function splitTurns(projected: ChatMessage[]): { completed: ChatMessage[][]; current: ChatMessage[] } {
  const turns: ChatMessage[][] = [];
  for (const m of projected) {
    if (m.role === "system" && turns.length === 0) continue;
    if (m.role === "user" || turns.length === 0) turns.push([m]);
    else turns[turns.length - 1].push(m);
  }
  const current = turns.pop() ?? [];
  return { completed: turns, current };
}

/** Englischer Prompt mit Sprachanweisung — dieselbe Form wie buildSystemPrompt. */
export function buildSummaryPrompt(lang: "de" | "en", maxChars: number, carry: string | null): string {
  const parts = [
    "You are Koda. Below is your own earlier work in this conversation: the user's requests and what you did (tool calls, tool results, your answers).",
    "Summarize YOUR work so the conversation can continue without the original messages.",
    "Keep: results you obtained, decisions you made, promises you gave the user, open points, and the paths of every note you read or wrote.",
    "Leave out: raw note contents and tool output — they can be fetched again.",
    `Write the summary in ${LANGUAGE_NAME[lang]}. At most ${maxChars} characters. Plain prose or short bullets, no headings.`,
  ];
  if (carry !== null) parts.push(`Summary so far (fold it in, do not repeat it verbatim):\n${carry}`);
  return parts.join("\n\n");
}

const turnChars = (t: ChatMessage[]): number => t.reduce((n, m) => n + m.content.length, 0);

export async function summarizeTurns(
  turns: ChatMessage[][],
  opts: { lang: "de" | "en"; maxChars: number; packChars: number; summarize: (msgs: ChatMessage[]) => Promise<string | null> },
): Promise<string | null> {
  let carry: string | null = null;
  let i = 0;
  while (i < turns.length) {
    const batch: ChatMessage[][] = [];
    let size = carry === null ? 0 : carry.length;
    // Mindestens eine Runde je Aufruf — sonst kaeme eine uebergrosse Runde nie dran.
    while (i < turns.length && (batch.length === 0 || size + turnChars(turns[i]) <= opts.packChars)) {
      size += turnChars(turns[i]);
      batch.push(turns[i]);
      i++;
    }
    const msgs: ChatMessage[] = [
      { role: "system", content: buildSummaryPrompt(opts.lang, opts.maxChars, carry) },
      ...batch.flat(),
      { role: "user", content: "Write the summary now." },
    ];
    const text = await opts.summarize(msgs);
    if (text === null || text.trim() === "") return null;
    carry = text.trim();
  }
  return carry;
}

export function makeStage2Record(turns: ChatMessage[][], summary: string, keep: number, at: string, forced = false): CompactionRecord {
  const bytes = turns.flat().filter((m) => m.role !== "user").reduce((n, m) => n + m.content.length, 0);
  const rec: CompactionRecord = { kind: "compaction", stage: 2, at, keepToolResults: keep, summary, turns: turns.length, stats: { stubbed: 0, bytes } };
  if (forced) rec.forced = true;
  return rec;
}
