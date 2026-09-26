/* Kodas Chat-Aufruf: duenne Schicht ueber dem Kit-Client (`createChatClient`, obsidian-kit 0.43.0).
   Was hier bleibt, ist genau das, was nur Koda weiss: die festen `params` (Sampling-Werte gehoeren
   ins Plugin, nicht in den Kit-Client), der Denk-Schalter, die deutschen Fehlertexte und die
   Form `LlmResult`, an der Loop, Kompaktierung und Lab-Meldung haengen. Streaming, Tool-Call-
   Puffer, Idle-Frist, Abbruch und Fehlerkoerper-Lesen liegen im Kit — Kodas alter Client war die
   Vorlage dieser Extraktion (Welle 11: rueckgetauscht).
   Kein Obsidian-Import: der Transport wird injiziert (`chat-transport` liefert XHR). */
import { createChatClient, type ChatResult, type ChatWireMessage, type SseTransport } from "../vendor/kit-obsidian/chat-client";
import { suppressParams } from "../vendor/kit/reasoning";
// Anzeige- und Request-Seite treffen dieselbe Entscheidung — deshalb EINE Definition,
// im uebernommenen Toggle-Modul (REGISTRY: „wer nur die Anzeige uebernimmt, hat die Haelfte").
import { effectiveSuppress } from "../core/chat/reasoning-toggle";
import { realClock, type ClockPort } from "../vendor/kit-obsidian/clock";
import { toWireMessages, type ChatMessage, type ToolCall } from "../core/agent/types";
import { toWireTools, type ToolDef } from "../core/tools/defs";
import { ChatHttpError, chatErrorMessage } from "../core/llm/chat-error";

export type { SseTransport };

export interface ChatConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  suppressThinking: boolean;
}

export type LlmResult =
  | { ok: true; content: string; toolCalls: ToolCall[]; finishReason?: string; reasoning?: string }
  | { ok: false; kind: "aborted" | "http" | "network" | "timeout" | "overflow" | "truncated"; detail: string; partial: string };

export const DEFAULT_TIMEOUT_MS = 120_000;
/** LM Studio streamt Tool-Call-Argumente nicht, es puffert sie: der Kopf-Chunk (`id`, `name`,
 *  leere Argumente) kommt, sobald der Name feststeht, danach kein Byte, bis die kompletten
 *  Argumente auf einmal folgen — die Stille entspricht der vollen Generierungszeit der
 *  Argumente (llm-setup `6f75737`, `docs/reference/setup.md` § „Tool-Calls im Stream").
 *  Das normale Idle-Timeout wuerde einen gesunden Schreib-Call darin abbrechen; ab dem
 *  Kopf-Chunk gilt deshalb diese laengere Frist — Groessenordnung von OpenCodes
 *  `chunkTimeout`-Default (llm-setup `docs/explanation/qwen3.8-27b-toolcall-loop.md`
 *  § „Gegenmittel"). Der Kit-Client kennt dieselbe Frist (`toolCallIdleTimeoutMs`); sie wird
 *  hier ausdruecklich gesetzt, damit ein Kit-Default sie nicht still verschieben kann. */
export const TOOL_CALL_IDLE_TIMEOUT_MS = 900_000;

/** Kit-Ergebnis → Kodas `LlmResult`. Der Text von `detail` ist hier deutsch und bleibt es: der
 *  Kit-Client liefert Servermeldung bzw. englischen Kurztext, den Satz baut der Konsument. */
function toLlmResult(r: ChatResult): LlmResult {
  if (r.ok) {
    return {
      ok: true,
      content: r.content,
      toolCalls: r.toolCalls,
      ...(r.finishReason !== undefined ? { finishReason: r.finishReason } : {}),
      // Das Kit liefert "" statt fehlend — der Loop und die Sitzung unterscheiden „kein reasoning".
      ...(r.reasoning !== "" ? { reasoning: r.reasoning } : {}),
    };
  }
  const partial = r.partial;
  switch (r.kind) {
    case "aborted":
      return { ok: false, kind: "aborted", detail: "stream aborted", partial };
    case "timeout": {
      const seconds = /^no data for (.+)s$/.exec(r.detail)?.[1];
      return { ok: false, kind: "timeout", detail: seconds !== undefined ? `keine Antwort seit ${seconds}s` : r.detail, partial };
    }
    case "network":
      return { ok: false, kind: "network", detail: chatErrorMessage(new Error(r.detail)), partial };
    case "truncated":
      return { ok: false, kind: "truncated", detail: "finish_reason: length, kein Text", partial: "" };
    case "http":
    case "overflow": {
      // Ein echter Nicht-2xx-Status bekommt Kodas deutschen Text samt Serverbegruendung.
      // Status 2xx heisst „der Server meldete Erfolg, der Koerper ist ein Fehler" — dort waere
      // „Anfrage abgelehnt (HTTP 200)" falsch, die Servermeldung selbst ist die Auskunft.
      const failedStatus = r.status !== undefined && (r.status < 200 || r.status >= 300);
      const detail = failedStatus ? chatErrorMessage(new ChatHttpError(r.status ?? 0, r.body ?? "")) : r.detail;
      return { ok: false, kind: r.kind, detail, partial };
    }
  }
}

export class KodaChatClient {
  private readonly chat: ReturnType<typeof createChatClient>;

  constructor(
    transport: SseTransport,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
    clock: ClockPort = realClock,
  ) {
    // Kein `fallbackTransport`, bewusst: ein Chat, den der Server per Origin-Pruefung (CORS)
    // abweist, soll als „Probe gruen, Chat rot" sichtbar bleiben (`error.chatBlocked`), statt
    // still ohne Stream weiterzulaufen — der Nutzer soll den Server richtig einstellen.
    this.chat = createChatClient({
      transport,
      clock,
      idleTimeoutMs: timeoutMs,
      toolCallIdleTimeoutMs: TOOL_CALL_IDLE_TIMEOUT_MS,
    });
  }

  async complete(
    cfg: ChatConfig,
    messages: ChatMessage[],
    tools: ToolDef[],
    onToken: (t: string) => void,
    onReasoning: (t: string) => void,
    signal: AbortSignal,
    // Nur der Status-Zeile gedacht (UI-STANDARD §8 Status-Indikator): feuert einmal je
    // Tool-Call-Index, sobald dessen Name feststeht — also genau am Kopf-Chunk, bevor die
    // lange Stille der gepufferten Argumente beginnt. Optional, weil kein Aufrufer sie
    // BRAUCHT (der Timeout-Wechsel haengt nicht daran).
    onToolCallHead?: (name: string) => void,
  ): Promise<LlmResult> {
    const result = await this.chat.complete({
      endpoint: { url: cfg.endpoint, ...(cfg.apiKey === "" ? {} : { apiKey: cfg.apiKey }) },
      model: cfg.model,
      messages: toWireMessages(messages) as ChatWireMessage[],
      params: {
        temperature: 0.2,
        // 2048 reichte nicht fuer ein write_note mit ~9 KB Text (~2000 Tokens allein fuer den
        // Inhalt). Vorlaeufiger Wert — die Sampling-Spec (Design-Session obsidian-kit-d8) legt
        // Budgets spaeter je Modus fest; llm-setup empfahl mindestens 8192, siehe Befundnotiz
        // "Tool-Use-Budget und Gemma-Schemas" 2026-09-23.
        max_tokens: 8192,
        ...suppressParams(effectiveSuppress(cfg.model, cfg.suppressThinking)),
      },
      tools: tools.length > 0 ? toWireTools(tools) : [],
      signal,
      onToken,
      onReasoning,
      ...(onToolCallHead !== undefined ? { onToolCallHead } : {}),
    });
    return toLlmResult(result);
  }
}
