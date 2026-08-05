import type { ChatMessage, ToolCall, ToolOutcome, ToolRunner } from "./types";
import type { LlmResult } from "../../llm/KodaChatClient";
import { parseTextToolCall } from "./text-fallback";

export interface LoopLlm {
  complete(
    messages: ChatMessage[],
    onToken: (t: string) => void,
    onReasoning: (t: string) => void,
    signal: AbortSignal,
  ): Promise<LlmResult>;
}

export type AgentEvent =
  | { kind: "tool-start"; call: ToolCall }
  | { kind: "tool-end"; call: ToolCall; outcome: ToolOutcome }
  | { kind: "final"; text: string }
  | { kind: "error"; message: string; partial: string; errorKind: "aborted" | "http" | "network" | "timeout" }
  | { kind: "round-limit" };

export interface AgentDeps {
  llm: LoopLlm;
  tools: ToolRunner;
  maxRounds: number;
  /** true: JSON-Tool-Objekte im Antworttext werden als Tool-Call behandelt
   *  (Default laut koda-lab-Befund, docs/LAB.md). */
  textFallback: boolean;
}

/** Der Agent-Loop: LLM → Tools → LLM … bis finale Antwort, Fehler oder Runden-Limit.
 *  Pure: kennt nur die Ports. Rueckgabe sind die NEU erzeugten Nachrichten —
 *  der Aufrufer haengt sie an seine Session und persistiert. */
export async function runAgent(
  deps: AgentDeps,
  history: ChatMessage[],
  onToken: (t: string) => void,
  onReasoning: (t: string) => void,
  onEvent: (e: AgentEvent) => void,
  signal: AbortSignal,
): Promise<ChatMessage[]> {
  const appended: ChatMessage[] = [];
  const messages = (): ChatMessage[] => [...history, ...appended];

  for (let round = 0; round < deps.maxRounds; round++) {
    const r = await deps.llm.complete(messages(), onToken, onReasoning, signal);

    if (!r.ok) {
      if (r.partial !== "") appended.push({ role: "assistant", content: r.partial });
      onEvent({ kind: "error", message: r.detail, partial: r.partial, errorKind: r.kind });
      return appended;
    }

    let calls: ToolCall[] = r.toolCalls;
    if (calls.length === 0 && deps.textFallback) {
      const textual = parseTextToolCall(r.content);
      if (textual !== null) calls = [{ id: `text_${round}`, name: textual.name, arguments: textual.arguments }];
    }

    if (calls.length === 0) {
      appended.push({ role: "assistant", content: r.content });
      onEvent({ kind: "final", text: r.content });
      return appended;
    }

    appended.push({ role: "assistant", content: r.content, toolCalls: calls });
    for (const call of calls) {
      onEvent({ kind: "tool-start", call });
      const outcome = await runOne(deps.tools, call);
      onEvent({ kind: "tool-end", call, outcome });
      appended.push({
        role: "tool",
        toolCallId: call.id,
        content: outcome.ok ? outcome.content : `ERROR: ${outcome.error}`,
      });
    }
  }

  onEvent({ kind: "round-limit" });
  return appended;
}

async function runOne(tools: ToolRunner, call: ToolCall): Promise<ToolOutcome> {
  let args: unknown;
  try {
    args = call.arguments === "" ? {} : JSON.parse(call.arguments);
  } catch {
    return { ok: false, error: `ungültige Tool-Argumente (kein JSON): ${call.arguments.slice(0, 120)}` };
  }
  try {
    return await tools.run(call.name, args);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Tool-Ausführung fehlgeschlagen" };
  }
}
