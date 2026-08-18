export interface ToolCall { id: string; name: string; arguments: string }

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  /** Nur in der Projektion (`projectForModel`): dieses Tool-Ergebnis ist ein Stub. Nie persistiert. */
  stubbed?: true;
  /** Nur in der Projektion: zusammengesetzte fruehere Nutzer-Nachrichten (Stufe 2). Nie persistiert. */
  merged?: true;
}

/** Verdichtungs-Marke im Verlauf. Referenziert nichts — ihre POSITION ist die Referenz:
 *  „alles vor mir wird nach dieser Regel verdichtet“. Robust gegen verlorene JSONL-Zeilen,
 *  braucht keine Nachrichten-IDs und keine Migration (Spec § Datenmodell). */
export interface CompactionRecord {
  kind: "compaction";
  stage: 1 | 2;
  /** ISO-Zeitstempel, nur fuer Anzeige/Log. */
  at: string;
  /** Reaktiv nach einem Ueberlauf erzwungen — die Marke im Chat sagt es dazu. */
  forced?: true;
  /** Stufe 1: die K juengsten Tool-Ergebnisse vor mir bleiben woertlich. */
  keepToolResults: number;
  /** Stufe 2: Zusammenfassungstext. Ohne Text kein Record (leer waere schlimmer als keiner). */
  summary?: string;
  /** Stufe 2: wie viele abgeschlossene Runden zusammengefasst wurden (Anzeige). */
  turns?: number;
  /** Was Stufe 1 gekuerzt hat (Anzahl, Zeichen) — fuer die Marke im Chat. */
  stats: { stubbed: number; bytes: number };
}

export type LogEntry = ChatMessage | CompactionRecord;

export function isCompactionRecord(e: LogEntry): e is CompactionRecord {
  return (e as CompactionRecord).kind === "compaction";
}
export function isChatMessage(e: LogEntry): e is ChatMessage {
  return !isCompactionRecord(e);
}

export type ToolOutcome = { ok: true; content: string } | { ok: false; error: string };

export interface ToolRunner {
  run(name: string, args: unknown): Promise<ToolOutcome>;
}

/** Ein Tool-Call, dessen Argumente kein Objekt sind, geht als `{}` auf den Draht.
 *  Modelle brechen einen Tool-Call gelegentlich ab und liefern einen leeren oder halben
 *  Argument-String; LM Studio (Express) quittiert so eine Nachricht im VERLAUF mit
 *  HTTP 500 — und weil der Verlauf mitwaechst, scheitert danach JEDE weitere Anfrage
 *  dieser Sitzung, nicht nur die eine. Gemessen und isoliert am 2026-08-06: derselbe
 *  Verlauf mit `""` → 500, mit `"{}"` → 200. Reparieren gehoert an den Transport-Rand:
 *  die gespeicherte Sitzung bleibt unangetastet und heilt beim naechsten Senden mit. */
function wireArguments(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? raw : "{}";
  } catch {
    return "{}";
  }
}

/** ChatMessage → OpenAI-Wire-Format. Die interne Form bleibt flach und testbar,
 *  die Wire-Form entsteht nur am Transport-Rand. */
export function toWireMessages(msgs: ChatMessage[]): unknown[] {
  return msgs.map((m) => {
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: m.content,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: wireArguments(c.arguments) },
        })),
      };
    }
    if (m.role === "tool") return { role: "tool", content: m.content, tool_call_id: m.toolCallId ?? "" };
    return { role: m.role, content: m.content };
  });
}
