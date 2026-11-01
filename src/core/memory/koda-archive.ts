// Der Verlauf vergangener Gespräche (Kit `chat-archive`, Payload `koda-log/1`): hier nur, was Kodas Log betrifft und ohne Obsidian-Import zu prüfen ist.
// Der Kit-Speicher schreibt eine `.json` je Gespräch in einen Vault-Ordner; `current.jsonl` bleibt die Absturzsicherung des laufenden Gesprächs (`SessionStore`).
// Eine Wahrheit je Gespräch: `ConvoArchive` merkt sich, welche Datei zu ihm gehört, damit das Ende einer Runde und dann Neu keine zweite Datei anlegen.
import { isChatMessage, type LogEntry } from "../agent/types";
import type { ChatRecord } from "../../vendor/kit/chat-archive";
import type { JsonValue } from "../../vendor/kit/chat-history";
import { neutralizeModelMarkdown } from "../../vendor/kit/safe-markdown";
import type { ThinkingLevel } from "../../vendor/kit/sampling-profiles";
import { parseLines, serializeLine } from "./session";

export const KODA_LOG_PAYLOAD = "koda-log/1";

/** Das Log als JSON-Wert: eine Kopie, damit spätere Nachrichten die abgelegte Fassung nicht ändern. */
export function toPayload(log: readonly LogEntry[]): JsonValue {
  return JSON.parse(JSON.stringify(log)) as JsonValue;
}

/** Das Log aus einem Payload; derselbe Parser wie für `current.jsonl` (eine kaputte Zeile kostet die Zeile). `null`, wenn nichts Lesbares darin steht. */
export function fromPayload(payload: unknown): LogEntry[] | null {
  if (!Array.isArray(payload)) return null;
  const entries = parseLines(payload.map((e) => serializeLine(e as LogEntry)).join(""));
  return entries.length > 0 ? entries : null;
}

const askedQuestion = (log: readonly LogEntry[]): boolean => log.some((e) => isChatMessage(e) && e.role === "user");

/** Die erste Frage; der Speicher kürzt sie zum Titel. Ohne Frage leer. */
export function archiveTitle(log: readonly LogEntry[]): string {
  for (const e of log) if (isChatMessage(e) && e.role === "user") return e.content;
  return "";
}

export interface KodaNoteTexts { question: string; answer: string; thinking: string }

/** Das Gespräch als Notiz (einweg): je Frage `## Frage`, das Denken zugeklappt, `## Antwort`. Werkzeugschritte und Systemtext bleiben draußen, Modelltext geht durch `neutralizeModelMarkdown`
 *  (kein Fernbild, kein Prozessor-Fence). `null` für einen fremden Payload-Typ oder einen unlesbaren Payload. */
export function renderKodaNote(record: ChatRecord, texts: KodaNoteTexts): string | null {
  if (record.payloadType !== KODA_LOG_PAYLOAD) return null;
  const log = fromPayload(record.payload);
  if (log === null) return null;
  const parts: string[] = [];
  for (const e of log) {
    if (!isChatMessage(e)) continue;
    if (e.role === "user") parts.push(`## ${texts.question}\n\n${e.content}`);
    else if (e.role === "assistant") {
      if (e.thinking !== undefined && e.thinking.trim() !== "") {
        const lines = neutralizeModelMarkdown(e.thinking).split(/\r?\n/).map((l) => `> ${l}`);
        parts.push([`> [!note]- ${texts.thinking}`, ...lines].join("\n"));
      }
      if (e.content.trim() !== "") parts.push(`## ${texts.answer}\n\n${neutralizeModelMarkdown(e.content)}`);
    }
  }
  return parts.length === 0 ? null : `${parts.join("\n\n")}\n`;
}

export interface ArchiveSave {
  name?: string;
  title: string;
  created: string;
  model: string | null;
  thinking: ThinkingLevel | null;
  payloadType: string;
  payload: JsonValue;
}

/** Was `ConvoArchive` vom Speicher braucht (`ChatArchive` des Kits erfüllt es). */
export interface ArchivePort {
  enabled(): boolean;
  save(input: ArchiveSave): Promise<{ name: string } | null>;
}

export interface ConvoRef { name: string; created: string }

/** Der Stand eines Gesprächs gegenüber seiner Datei. Ein Neu oder Öffnen legt ein neues Objekt an; Schreibvorgänge, die noch laufen, tragen ihr altes weiter und können das neue nie berühren. */
interface Convo { ref: ConvoRef | null; savedLen: number | null }

export class ConvoArchive {
  private cur: Convo = { ref: null, savedLen: null };
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly port: ArchivePort, private readonly now: () => Date = () => new Date()) {}

  /** Gibt es etwas Neues für die Datei? Nur mit mindestens einer Frage und nur, wenn sich der Stand seit dem letzten Speichern geändert hat. */
  needsSave(log: readonly LogEntry[]): boolean {
    return askedQuestion(log) && this.cur.savedLen !== log.length;
  }

  /** Legt das Gespräch ab (oder schreibt es in seine Datei zurück). `true`, wenn die Datei den Stand hat (auch wenn nichts zu schreiben war); `false` bei Verlauf aus, Fehler oder Wurf. Wirft nie.
   *  Alle Schreibvorgänge laufen hintereinander: das Ende einer Runde und dann Neu überholen sich nicht und legen nie zwei Dateien für ein Gespräch an. */
  persist(log: readonly LogEntry[], meta: { model: string | null; thinking: ThinkingLevel | null }): Promise<boolean> {
    const snapshot = toPayload(log);
    const len = log.length;
    const title = archiveTitle(log);
    const hasQuestion = askedQuestion(log);
    const c = this.cur;
    const job = this.chain.then(async (): Promise<boolean> => {
      if (!this.port.enabled()) return false;
      if (!hasQuestion || c.savedLen === len) return true;
      const created = c.ref?.created ?? this.now().toISOString();
      const saved = await this.port.save({
        ...(c.ref === null ? {} : { name: c.ref.name }),
        title, created, model: meta.model, thinking: meta.thinking, payloadType: KODA_LOG_PAYLOAD, payload: snapshot,
      });
      if (saved === null) return false;
      c.ref = { name: saved.name, created };
      c.savedLen = len;
      return true;
    }).catch((e: unknown): boolean => { console.warn("Koda: Verlauf konnte nicht abgelegt werden", e); return false; });
    this.chain = job;
    return job;
  }

  /** Ein neues, leeres Gespräch. */
  reset(): void { this.cur = { ref: null, savedLen: null }; }

  /** Ein geöffneter alter Chat: weitere Runden gehen in seine Datei zurück. */
  adopt(ref: ConvoRef, log: readonly LogEntry[]): void { this.cur = { ref: { ...ref }, savedLen: log.length }; }
}
