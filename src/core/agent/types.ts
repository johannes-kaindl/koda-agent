export interface ToolCall { id: string; name: string; arguments: string }

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
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
