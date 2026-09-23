import type { ContextAttachment } from "../context/types";

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
  /** Arbeitskontext, der mit dieser Nutzer-Nachricht ging. PERSISTIERT — anders als die zwei
   *  Felder darueber. `content` bleibt der reine Nutzertext; eingewoben wird erst in der
   *  Projektion (Spec E2/E4). */
  context?: ContextAttachment;
  /** Nur in der Projektion: der Kontextblock dieser Nachricht ist ein Stub (Stufe 1). Nie persistiert. */
  contextStubbed?: true;
  /** Nur waehrend eines laufenden `runAgent`-Aufrufs (Loop-lokal, NIE persistiert — der Loop
   *  entfernt das Feld vor der Rueckgabe): das Denken, mit dem diese Assistant-Runde ihre
   *  Tool-Calls gewaehlt hat. Manche Endpunkte (Open WebUI/gpt-oss, gemessen 2026-09-21,
   *  llm-configs `docs/reference/openwebui-api.md` § „Mehrrundige Werkzeuglaeufe") brechen
   *  einen mehrrundigen Tool-Lauf nach der zweiten Runde stumm ab, wenn dieses Denken der
   *  Vorrunde nicht zurueckgeschickt wird — nur ueber die naechste(n) Folgerunde(n) desselben
   *  Laufs hinweg relevant, nicht ueber Sitzungsgrenzen. */
  reasoning?: string;
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
  /** Was Stufe 1 gekuerzt hat (Anzahl Tool-Ergebnisse, Zeichen) — fuer die Marke im Chat.
   *  `contexts`: zusaetzlich gekuerzte Kontextbloecke; fehlt bei alten Marken. */
  stats: { stubbed: number; bytes: number; contexts?: number };
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
        // Beide Feldnamen wie llm-benchmark-harness seit `fade3f6` (2026-09-21) — der
        // Konsument entscheidet, welchen er liest, ein Client kann es nicht wissen (gemessen:
        // opencode liest `reasoning`, Open WebUI/gpt-oss ignoriert `reasoning_content`).
        ...(m.reasoning !== undefined && m.reasoning !== ""
          ? { reasoning: m.reasoning, reasoning_content: m.reasoning }
          : {}),
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
