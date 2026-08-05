import type { ToolCall } from "./types";

export interface ToolCallDelta {
  index: number;
  id?: string;
  name?: string;
  argsDelta?: string;
}

export interface AgentSSE {
  content: string[];
  reasoning: string[];
  toolCalls: ToolCallDelta[];
  finishReason?: string;
  rest: string;
  done: boolean;
}

/** SSE-Parser fuer den Agent-Pfad. Gleiche rest-Semantik wie Kit-parseSSE
 *  (unvollstaendige letzte Zeile bleibt liegen), zusaetzlich tool_calls-Deltas
 *  und finish_reason — beides kennt der Kit-Parser nicht. */
export function parseAgentSSE(buffer: string): AgentSSE {
  const out: AgentSSE = { content: [], reasoning: [], toolCalls: [], rest: "", done: false };
  const lastBreak = buffer.lastIndexOf("\n");
  const complete = lastBreak === -1 ? "" : buffer.slice(0, lastBreak + 1);
  out.rest = lastBreak === -1 ? buffer : buffer.slice(lastBreak + 1);

  for (const rawLine of complete.split(/\r?\n/)) {
    const lineText = rawLine.trim();
    if (!lineText.startsWith("data:")) continue;
    const payload = lineText.slice(5).trim();
    if (payload === "[DONE]") {
      out.done = true;
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      continue; // halbes/kaputtes JSON: Zeile verwerfen, Stream weiterlesen
    }
    const choice = firstChoice(parsed);
    if (choice === null) continue;
    const finish = choice.finish_reason;
    if (typeof finish === "string" && out.finishReason === undefined) out.finishReason = finish;
    const delta = isRecord(choice.delta) ? choice.delta : {};
    if (typeof delta.content === "string" && delta.content !== "") out.content.push(delta.content);
    const reasoning = delta.reasoning_content ?? delta.reasoning;
    if (typeof reasoning === "string" && reasoning !== "") out.reasoning.push(reasoning);
    if (Array.isArray(delta.tool_calls)) {
      delta.tool_calls.forEach((tc: unknown, i: number) => {
        if (!isRecord(tc)) return;
        const fn = isRecord(tc.function) ? tc.function : {};
        out.toolCalls.push({
          index: typeof tc.index === "number" ? tc.index : i,
          ...(typeof tc.id === "string" ? { id: tc.id } : {}),
          ...(typeof fn.name === "string" ? { name: fn.name } : {}),
          ...(typeof fn.arguments === "string" ? { argsDelta: fn.arguments } : {}),
        });
      });
    }
  }
  return out;
}

/** Sammelt tool_calls-Deltas eines Streams zu fertigen ToolCalls ein. */
export class ToolCallAssembler {
  private map = new Map<number, { id: string; name: string; args: string }>();

  push(d: ToolCallDelta): void {
    const entry = this.map.get(d.index) ?? { id: "", name: "", args: "" };
    if (d.id !== undefined) entry.id = d.id;
    if (d.name !== undefined) entry.name = d.name;
    if (d.argsDelta !== undefined) entry.args += d.argsDelta;
    this.map.set(d.index, entry);
  }

  finish(): ToolCall[] {
    return [...this.map.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, e]) => e.name !== "")
      .map(([index, e]) => ({ id: e.id !== "" ? e.id : `call_${index}`, name: e.name, arguments: e.args }));
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function firstChoice(res: unknown): Record<string, unknown> | null {
  if (!isRecord(res) || !Array.isArray(res.choices) || res.choices.length === 0) return null;
  return isRecord(res.choices[0]) ? res.choices[0] : null;
}
