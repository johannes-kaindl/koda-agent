/* Streaming-Call gegen /v1/chat/completions mit Tool-Calling — pure, kein Obsidian-Import.
   Struktur nach dem KuroChatClient-Muster (Transport + ClockPort injiziert, n=4 im Oekosystem). */
import { ThinkSplitter } from "../vendor/kit/think-splitter";
import { normalizeEndpoint } from "../vendor/kit/endpoint";
import { authHeaders } from "../vendor/kit/endpoint_config";
import { suppressParams, isAlwaysOnThinker } from "../vendor/kit/reasoning";
import { realClock, type ClockPort } from "../vendor/kit-obsidian/clock";
import { parseAgentSSE, ToolCallAssembler } from "../core/agent/stream";
import { toWireMessages, type ChatMessage, type ToolCall } from "../core/agent/types";
import { toWireTools, type ToolDef } from "../core/tools/defs";
import { ChatHttpError, chatErrorMessage } from "../core/llm/chat-error";

export interface SseTransport {
  postStream(
    url: string,
    body: unknown,
    headers: Record<string, string>,
    onChunk: (raw: string) => void,
    signal: AbortSignal,
  ): Promise<number>;
}

export interface ChatConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  suppressThinking: boolean;
}

export type LlmResult =
  | { ok: true; content: string; toolCalls: ToolCall[]; finishReason?: string }
  | { ok: false; kind: "aborted" | "http" | "network" | "timeout"; detail: string; partial: string };

const ERROR_BODY_CAP = 2048;
export const DEFAULT_TIMEOUT_MS = 120_000;

export function effectiveSuppress(model: string, wanted: boolean): boolean {
  return wanted && !isAlwaysOnThinker(model);
}

export class KodaChatClient {
  constructor(
    private readonly transport: SseTransport,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
    private readonly clock: ClockPort = realClock,
  ) {}

  async complete(
    cfg: ChatConfig,
    messages: ChatMessage[],
    tools: ToolDef[],
    onToken: (t: string) => void,
    onReasoning: (t: string) => void,
    signal: AbortSignal,
  ): Promise<LlmResult> {
    if (signal.aborted) return { ok: false, kind: "aborted", detail: "stream aborted", partial: "" };

    const url = `${normalizeEndpoint(cfg.endpoint)}/v1/chat/completions`;
    const headers = authHeaders(cfg.apiKey === "" ? undefined : cfg.apiKey);
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages: toWireMessages(messages),
      stream: true,
      temperature: 0.2,
      max_tokens: 2048,
      ...suppressParams(effectiveSuppress(cfg.model, cfg.suppressThinking)),
    };
    if (tools.length > 0) body.tools = toWireTools(tools);

    const ctrl = new AbortController();
    let timedOut = false;
    const onCallerAbort = (): void => ctrl.abort();
    signal.addEventListener("abort", onCallerAbort, { once: true });

    /* Der Timeout ist ein IDLE-Timeout, kein Gesamt-Timeout: er misst die Stille seit dem
       letzten Byte, nicht die Dauer der Antwort. Ein lokales Modell, das zwei Minuten am
       Stueck schreibt, ist gesund — ein Endpoint, der zwei Minuten schweigt, ist es nicht.
       (Als Gesamt-Timeout brach er eine laufende Antwort mitten im Satz ab; GUI-Smoke
       2026-08-06.) Fuer den Abbruch einer gesunden, aber unerwuenschten Antwort ist der
       Stopp-Knopf zustaendig, nicht die Uhr. */
    const fire = (): void => { timedOut = true; ctrl.abort(); };
    let timer = this.clock.setTimeout(fire, this.timeoutMs);
    const bumpIdleTimer = (): void => {
      this.clock.clearTimeout(timer);
      timer = this.clock.setTimeout(fire, this.timeoutMs);
    };

    const splitter = new ThinkSplitter();
    const assembler = new ToolCallAssembler();
    let content = "";
    let finishReason: string | undefined;
    let rest = "";
    let rawBody = "";

    const emit = (c: string, r: string): void => {
      if (c !== "") { content += c; onToken(c); }
      if (r !== "") { onReasoning(r); }
    };
    const drainSplitter = (): void => {
      const tail = splitter.flush();
      emit(tail.content, tail.reasoning);
    };
    const consume = (raw: string): void => {
      bumpIdleTimer();
      if (rawBody.length < ERROR_BODY_CAP) rawBody += raw;
      const p = parseAgentSSE(rest + raw);
      rest = p.rest;
      if (p.finishReason !== undefined && finishReason === undefined) finishReason = p.finishReason;
      for (const r of p.reasoning) emit("", r);
      for (const c of p.content) { const s = splitter.push(c); emit(s.content, s.reasoning); }
      for (const d of p.toolCalls) assembler.push(d);
    };

    let status: number;
    try {
      status = await this.transport.postStream(url, body, headers, consume, ctrl.signal);
    } catch (e) {
      const err = e instanceof Error ? e : new Error("unknown stream error");
      drainSplitter();
      if (err.name === "AbortError") {
        return timedOut
          ? { ok: false, kind: "timeout", detail: `keine Antwort seit ${this.timeoutMs / 1000}s`, partial: content }
          : { ok: false, kind: "aborted", detail: "stream aborted", partial: content };
      }
      return { ok: false, kind: "network", detail: chatErrorMessage(err), partial: content };
    } finally {
      this.clock.clearTimeout(timer);
      signal.removeEventListener("abort", onCallerAbort);
    }

    drainSplitter();

    if (status < 200 || status >= 300) {
      return {
        ok: false,
        kind: "http",
        detail: chatErrorMessage(new ChatHttpError(status, rawBody.slice(0, ERROR_BODY_CAP))),
        partial: content,
      };
    }
    return { ok: true, content, toolCalls: assembler.finish(), ...(finishReason !== undefined ? { finishReason } : {}) };
  }
}
