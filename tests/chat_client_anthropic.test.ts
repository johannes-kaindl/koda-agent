import { KodaChatClient, type SseTransport } from "../src/llm/KodaChatClient";
import { createAnthropicChatTransport, createAnthropicState } from "../src/vendor/kit-obsidian/anthropic-transport";
import type { ChatMessage } from "../src/core/agent/types";

const fakeClock = { now: () => 0, setTimeout: () => 1, clearTimeout: () => {} };
const msgs: ChatMessage[] = [{ role: "user", content: "Hi" }];
const ev = (name: string, data: unknown): string => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

const MODELS = {
  data: [
    { id: "claude-sonnet-5-5", max_tokens: 64000, capabilities: { effort: { supported: true }, thinking: { types: { adaptive: { supported: true } } } } },
    { id: "claude-sonnet-4-5", max_tokens: 64000, capabilities: { effort: { supported: false }, thinking: { types: { adaptive: { supported: false } } } } },
  ],
};
const getJson = async (): Promise<{ status: number; text: string }> => ({ status: 200, text: JSON.stringify(MODELS) });

const textTurn = (text: string): string[] => [
  ev("message_start", { type: "message_start", message: { id: "m", model: "claude-sonnet-5-5", usage: {} } }),
  ev("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
  ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }),
  ev("content_block_stop", { type: "content_block_stop", index: 0 }),
  ev("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: {} }),
  ev("message_stop", { type: "message_stop" }),
];

const toolTurn = (): string[] => [
  ev("message_start", { type: "message_start", message: { id: "m", model: "claude-sonnet-5-5", usage: {} } }),
  ev("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }),
  ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "ich lese" } }),
  ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "SIG1" } }),
  ev("content_block_stop", { type: "content_block_stop", index: 0 }),
  ev("content_block_start", { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "read_note", input: {} } }),
  ev("content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"path":"A.md"}' } }),
  ev("content_block_stop", { type: "content_block_stop", index: 1 }),
  ev("message_delta", { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: {} }),
  ev("message_stop", { type: "message_stop" }),
];

interface Sent { url: string; body: Record<string, any>; headers: Record<string, string> }

function wire(turns: string[][], sent: Sent[]): SseTransport {
  let i = 0;
  return {
    async postStream(url, body, headers, onChunk) {
      sent.push({ url, body: body as Record<string, any>, headers });
      for (const c of turns[Math.min(i, turns.length - 1)] ?? []) onChunk(c);
      i += 1;
      return 200;
    },
  };
}

function anthropicClient(turns: string[][], sent: Sent[], state = createAnthropicState()): KodaChatClient {
  const primary = createAnthropicChatTransport({ http: wire(turns, sent), state, getJson, clock: fakeClock });
  const never: SseTransport = { async postStream() { throw new Error("HTTP-Transport darf hier nicht laufen"); } };
  return new KodaChatClient(never, 1000, fakeClock, { primary });
}

const claude = { endpoint: "https://api.anthropic.com", apiKey: "k", model: "claude-sonnet-5-5", transport: "anthropic" as const, family: "claude" as const, suppressThinking: true };
const run = (c: KodaChatClient, cfg: Parameters<KodaChatClient["complete"]>[0], messages: ChatMessage[] = msgs) =>
  c.complete(cfg, messages, [], () => {}, () => {}, new AbortController().signal);

describe("KodaChatClient — Parameter je Verbindungsart", () => {
  it("HTTP bleibt unveraendert: temperature 0.2, max_tokens 8192 und die Denk-Aus-Felder", async () => {
    const sent: Sent[] = [];
    const http: SseTransport = {
      async postStream(url, body, headers, onChunk) {
        sent.push({ url, body: body as Record<string, any>, headers });
        onChunk('data: {"choices":[{"delta":{"content":"x"}}]}\ndata: [DONE]\n');
        return 200;
      },
    };
    await run(new KodaChatClient(http, 1000, fakeClock), { endpoint: "http://127.0.0.1:1234", apiKey: "", model: "m", suppressThinking: true });
    expect(sent[0]?.url).toBe("http://127.0.0.1:1234/v1/chat/completions");
    expect(sent[0]?.body).toMatchObject({ temperature: 0.2, max_tokens: 8192, reasoning_effort: "none", reasoning_budget: 0 });
  });

  it("Anthropic: Nachricht geht an /v1/messages, ohne temperature, mit effort low bei ausgeschaltetem Denken", async () => {
    const sent: Sent[] = [];
    const r = await run(anthropicClient([textTurn("Hallo")], sent), { ...claude, suppressThinking: true });
    expect(r).toMatchObject({ ok: true, content: "Hallo" });
    expect(sent[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(sent[0]?.headers["x-api-key"]).toBe("k");
    const b = sent[0]?.body ?? {};
    expect(b.temperature).toBeUndefined();
    expect(b.chat_template_kwargs).toBeUndefined();
    expect(b.reasoning_effort).toBeUndefined();
    expect(b.output_config).toEqual({ effort: "low" });
    expect(b.thinking).toMatchObject({ type: "adaptive" });
  });

  it("Anthropic: angeschaltetes Denken ist effort medium — Schalter an und aus senden Verschiedenes", async () => {
    const sent: Sent[] = [];
    await run(anthropicClient([textTurn("a")], sent), { ...claude, suppressThinking: false });
    expect(sent[0]?.body.output_config).toEqual({ effort: "medium" });
  });

  it("Anthropic: kein festes max_tokens 8192 — es schliesst das Denken ein; der Transport setzt die Grenze des Modells", async () => {
    const sent: Sent[] = [];
    await run(anthropicClient([textTurn("a")], sent), { ...claude, suppressThinking: false });
    expect(sent[0]?.body.max_tokens).toBe(64000);
  });

  it("Anthropic, Modell ohne Familie (Sonnet 4.5): kein effort, kein thinking — ein falsches Feld waere ein 400", async () => {
    const sent: Sent[] = [];
    await run(anthropicClient([textTurn("a")], sent), { ...claude, model: "claude-sonnet-4-5", family: null, suppressThinking: false });
    const b = sent[0]?.body ?? {};
    expect(b.output_config).toBeUndefined();
    expect(b.thinking).toBeUndefined();
    expect(b.temperature).toBeUndefined();
  });

  it("eine Verbindungsart ohne Transport (shortcuts, oder anthropic ohne Anthropic-Transporte) ist ein Fehler, kein stiller Rueckfall auf HTTP", async () => {
    const sent: Sent[] = [];
    const http: SseTransport = { async postStream(url, body, headers) { sent.push({ url, body: body as Record<string, any>, headers }); return 200; } };
    const c = new KodaChatClient(http, 1000, fakeClock);
    const a = await run(c, { ...claude });
    const s = await run(c, { ...claude, transport: "shortcuts" });
    expect(a).toMatchObject({ ok: false, kind: "network" });
    expect(s).toMatchObject({ ok: false, detail: expect.stringContaining("shortcuts") });
    expect(sent).toEqual([]);
  });

  it("bricht der Strom ab, wiederholt der Rueckfall-Transport einmal, mit demselben Zustand", async () => {
    const sent: Sent[] = [];
    const state = createAnthropicState();
    const broken: SseTransport = { async postStream() { const e = new Error("net"); e.name = "StreamNetworkError"; throw e; } };
    const primary = createAnthropicChatTransport({ http: broken, state, getJson, clock: fakeClock });
    // Der Rueckfall fragt ohne Stream: die Antwort ist eine volle Nachricht, kein Strom.
    const message = JSON.stringify({ type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [{ type: "text", text: "ueber requestUrl" }], stop_reason: "end_turn", usage: {} });
    const plain: SseTransport = { async postStream(url, body, headers, onChunk) { sent.push({ url, body: body as Record<string, any>, headers }); onChunk(message); return 200; } };
    const fallback = createAnthropicChatTransport({ http: plain, state, getJson, clock: fakeClock });
    const never: SseTransport = { async postStream() { throw new Error("nicht HTTP"); } };
    const r = await run(new KodaChatClient(never, 1000, fakeClock, { primary, fallback }), claude);
    expect(r).toMatchObject({ ok: true, content: "ueber requestUrl" });
    expect(sent).toHaveLength(1);
  });
});

describe("KodaChatClient — Werkzeug-Runde mit Denken (Anthropic)", () => {
  const history = (): ChatMessage[] => [
    { role: "user", content: "Lies A" },
    { role: "assistant", content: "", toolCalls: [{ id: "toolu_1", name: "read_note", arguments: '{"path":"A.md"}' }] },
    { role: "tool", toolCallId: "toolu_1", name: "read_note", content: "Inhalt von A" } as ChatMessage,
  ];

  it("der Denkblock mit Signatur geht in der zweiten Anfrage vor dem tool_use zurueck", async () => {
    const sent: Sent[] = [];
    const state = createAnthropicState();
    const c1 = anthropicClient([toolTurn()], sent, state);
    const first = await c1.complete(claude, [{ role: "user", content: "Lies A" }], [], () => {}, () => {}, new AbortController().signal);
    expect(first).toMatchObject({ ok: true, toolCalls: [{ id: "toolu_1", name: "read_note" }] });
    // ein neuer Client je Lauf (wie in Koda) — der Zustand lebt mit dem Plugin, nicht mit dem Client
    const c2 = anthropicClient([textTurn("fertig")], sent, state);
    await run(c2, claude, history());
    const assistant = (sent[1]?.body.messages as { role: string; content: Record<string, unknown>[] }[]).find((m) => m.role === "assistant");
    expect(assistant?.content.map((b) => b.type)).toEqual(["thinking", "tool_use"]);
    expect(assistant?.content[0]).toMatchObject({ signature: "SIG1" });
    const last = (sent[1]?.body.messages as { role: string; content: Record<string, unknown>[] }[]).at(-1);
    expect(last).toMatchObject({ role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1" }] });
  });

  it("Gegenprobe: mit einem frischen Zustand je Lauf fehlt der Denkblock", async () => {
    const sent: Sent[] = [];
    await anthropicClient([toolTurn()], sent).complete(claude, [{ role: "user", content: "Lies A" }], [], () => {}, () => {}, new AbortController().signal);
    await run(anthropicClient([textTurn("fertig")], sent), claude, history());
    const assistant = (sent[1]?.body.messages as { role: string; content: Record<string, unknown>[] }[]).find((m) => m.role === "assistant");
    expect(assistant?.content.map((b) => b.type)).toEqual(["tool_use"]);
  });
});
