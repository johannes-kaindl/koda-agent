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
          function: { name: c.name, arguments: c.arguments },
        })),
      };
    }
    if (m.role === "tool") return { role: "tool", content: m.content, tool_call_id: m.toolCallId ?? "" };
    return { role: m.role, content: m.content };
  });
}
