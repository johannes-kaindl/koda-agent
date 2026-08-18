import { KodaChatClient, type SseTransport } from "../src/llm/KodaChatClient";
import type { ChatMessage } from "../src/core/agent/types";

const cfg = { endpoint: "http://127.0.0.1:1234", apiKey: "", model: "m", suppressThinking: true };
const msgs: ChatMessage[] = [{ role: "user", content: "Hi" }];
const fakeClock = { now: () => 0, setTimeout: () => 1, clearTimeout: () => {} };

function transportOf(chunks: string[], status = 200): SseTransport {
  return {
    async postStream(_u, _b, _h, onChunk) {
      for (const c of chunks) onChunk(c);
      return status;
    },
  };
}

const line = (obj: unknown): string => `data: ${JSON.stringify(obj)}\n`;

describe("KodaChatClient.complete", () => {
  it("streamt content-Token und liefert das Akkumulat", async () => {
    const client = new KodaChatClient(transportOf([
      line({ choices: [{ delta: { content: "Hal" } }] }),
      line({ choices: [{ delta: { content: "lo" } }] }) + "data: [DONE]\n",
    ]), 1000, fakeClock);
    const tokens: string[] = [];
    const r = await client.complete(cfg, msgs, [], (t) => tokens.push(t), () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: true, content: "Hallo", toolCalls: [] });
    expect(tokens.join("")).toBe("Hallo");
  });

  it("assembliert tool_calls ueber mehrere Chunks", async () => {
    const client = new KodaChatClient(transportOf([
      line({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "read_note", arguments: '{"path":' } }] } }] }),
      line({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"A.md"}' } }] }, }] }) +
        line({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }) + "data: [DONE]\n",
    ]), 1000, fakeClock);
    const r = await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(r).toMatchObject({
      ok: true,
      finishReason: "tool_calls",
      toolCalls: [{ id: "c1", name: "read_note", arguments: '{"path":"A.md"}' }],
    });
  });

  it("routet inline <think> in den reasoning-Kanal statt in den content", async () => {
    const client = new KodaChatClient(transportOf([
      line({ choices: [{ delta: { content: "<think>weil</think>Antwort" } }] }) + "data: [DONE]\n",
    ]), 1000, fakeClock);
    const reasoning: string[] = [];
    const r = await client.complete(cfg, msgs, [], () => {}, (t) => reasoning.push(t), new AbortController().signal);
    expect(r).toMatchObject({ ok: true, content: "Antwort" });
    expect(reasoning.join("")).toBe("weil");
  });

  it("uebersetzt HTTP-Fehlerstatus in kind http mit chatErrorMessage-Detail", async () => {
    const client = new KodaChatClient(transportOf(['{"detail":"Not authenticated"}'], 401), 1000, fakeClock);
    const r = await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, kind: "http" });
    if (!r.ok) expect(r.detail).toMatch(/Schlüssel/);
  });

  it("klassifiziert einen Kontext-Ueberlauf als kind overflow und behaelt den Server-Text", async () => {
    const body = '{"error":{"message":"This model\'s maximum context length is 8192 tokens."}}';
    const client = new KodaChatClient(transportOf([body], 400), 1000, fakeClock);
    const r = await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, kind: "overflow" });
    if (!r.ok) expect(r.detail).toMatch(/8192/);
  });

  it("bereits abgebrochenes Signal startet den Transport gar nicht", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const client = new KodaChatClient(transportOf([]), 1000, fakeClock);
    const r = await client.complete(cfg, msgs, [], () => {}, () => {}, ctrl.signal);
    expect(r).toMatchObject({ ok: false, kind: "aborted" });
  });

  it("behaelt Teil-Content wenn der Stream mitten im Fluss abgebrochen wird", async () => {
    const t: SseTransport = {
      async postStream(_u, _b, _h, onChunk) {
        onChunk(line({ choices: [{ delta: { content: "halb" } }] }));
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      },
    };
    const client = new KodaChatClient(t, 1000, fakeClock);
    const r = await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, kind: "aborted", partial: "halb" });
  });

  it("klassifiziert einen generischen Transport-Fehler als network", async () => {
    const t: SseTransport = { async postStream() { throw new Error("connection refused"); } };
    const client = new KodaChatClient(t, 1000, fakeClock);
    const r = await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, kind: "network" });
    if (!r.ok) expect(r.detail).toMatch(/nicht erreichbar/);
  });

  it("meldet timeout wenn der Transport nie zurueckkehrt und die Clock feuert", async () => {
    let onTimeout: (() => void) | undefined;
    const timeoutClock = {
      now: () => 0,
      setTimeout: (fn: () => void) => { onTimeout = fn; return 1; },
      clearTimeout: () => {},
    };
    const t: SseTransport = {
      postStream(_u, _b, _h, _c, signal) {
        return new Promise<number>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          }, { once: true });
          onTimeout?.();
        });
      },
    };
    const client = new KodaChatClient(t, 20, timeoutClock);
    const r = await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, kind: "timeout" });
  });
  it("zieht den Idle-Timeout bei jedem Chunk neu auf — ein langer Stream laeuft nicht hinein", async () => {
    const set: number[] = [];
    const cleared: number[] = [];
    let next = 0;
    const countingClock = {
      now: () => 0,
      setTimeout: (): number => { next += 1; set.push(next); return next; },
      clearTimeout: (h: number): void => { cleared.push(h); },
    };
    const client = new KodaChatClient(transportOf([
      line({ choices: [{ delta: { content: "a" } }] }),
      line({ choices: [{ delta: { content: "b" } }] }),
      line({ choices: [{ delta: { content: "c" } }] }) + "data: [DONE]\n",
    ]), 1000, countingClock);
    const r = await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: true, content: "abc" });
    // initialer Timer + je ein Nachziehen pro Chunk; jeder abgeloeste Timer wird gecleart,
    // der letzte im finally. Ohne das Nachziehen bliebe es bei einem einzigen setTimeout —
    // und ein Modell, das laenger als timeoutMs am Stueck schreibt, wuerde mitten im Satz
    // abgebrochen (GUI-Smoke-Befund 2026-08-06).
    expect(set).toHaveLength(4);
    expect(cleared).toEqual([1, 2, 3, 4]);
  });
});
