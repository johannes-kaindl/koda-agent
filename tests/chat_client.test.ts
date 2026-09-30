import { KodaChatClient, TOOL_CALL_IDLE_TIMEOUT_MS, type SseTransport } from "../src/llm/KodaChatClient";
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

  it("reicht das vom Server gemeldete Modell durch (Grundlage des Kontextfenster-Hinweises)", async () => {
    const client = new KodaChatClient(transportOf([
      line({ model: "gpt-oss:120b-ctx128k", choices: [{ delta: { content: "Hi" } }] }) + "data: [DONE]\n",
    ]), 1000, fakeClock);
    const r = await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: true, model: "gpt-oss:120b-ctx128k" });
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
  it("gibt eine abgeschnittene Antwort MIT Text als ok:true zurueck (Fall 2, Hinweis statt Fehler)", async () => {
    const client = new KodaChatClient(transportOf([
      line({ choices: [{ delta: { content: "Halber Sa" } }] }),
      line({ choices: [{ delta: {}, finish_reason: "length" }] }) + "data: [DONE]\n",
    ]), 1000, fakeClock);
    const r = await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: true, content: "Halber Sa", finishReason: "length" });
  });

  it("meldet eine abgeschnittene Antwort OHNE Text als Fehler kind truncated (Fall 3, Reasoning-Normalfall)", async () => {
    const client = new KodaChatClient(transportOf([
      line({ choices: [{ delta: {}, finish_reason: "length" }] }) + "data: [DONE]\n",
    ]), 1000, fakeClock);
    const r = await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, kind: "truncated", partial: "" });
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

  it("schickt max_tokens 8192 (Punkt 4: 2048 reichte nicht fuer ein write_note mit ~9 KB)", async () => {
    let sentBody: Record<string, unknown> | undefined;
    const t: SseTransport = {
      async postStream(_u, b, _h, onChunk) {
        sentBody = b as Record<string, unknown>;
        onChunk("data: [DONE]\n");
        return 200;
      },
    };
    const client = new KodaChatClient(t, 1000, fakeClock);
    await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(sentBody?.max_tokens).toBe(8192);
  });

  it("wechselt ab dem Tool-Call-Kopf auf die lange Idle-Frist (TOOL_CALL_IDLE_TIMEOUT_MS)", async () => {
    const ms: number[] = [];
    let n = 0;
    const capturingClock = {
      now: () => 0,
      setTimeout: (_fn: () => void, m: number): number => { ms.push(m); n += 1; return n; },
      clearTimeout: (): void => {},
    };
    const client = new KodaChatClient(transportOf([
      // Kopf-Chunk: Name da, Argumente noch leer — hier soll die Frist wechseln.
      line({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "write_note", arguments: "" } }] } }] }),
      line({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "{}" } }] } }] })
        + line({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }) + "data: [DONE]\n",
    ]), 1000, capturingClock);
    await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    // Initialer Timer vor dem ersten Byte laeuft noch mit der normalen Frist.
    expect(ms[0]).toBe(1000);
    // Ab dem Kopf-Chunk (und danach) gilt die lange Frist.
    expect(ms[ms.length - 1]).toBe(TOOL_CALL_IDLE_TIMEOUT_MS);
  });

  it("meldet den Tool-Call-Kopf genau einmal je Index ueber onToolCallHead", async () => {
    const heads: string[] = [];
    const client = new KodaChatClient(transportOf([
      line({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "write_note", arguments: "" } }] } }] }),
      // Zweiter Chunk desselben Index traegt keinen neuen Namen — kein zweites Kopf-Event.
      line({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "{}" } }] } }] })
        + line({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }) + "data: [DONE]\n",
    ]), 1000, fakeClock);
    await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal, (name) => heads.push(name));
    expect(heads).toEqual(["write_note"]);
  });

  it("liefert das akkumulierte Reasoning im ok-Ergebnis, damit es der Loop zurueckschicken kann", async () => {
    const client = new KodaChatClient(transportOf([
      line({ choices: [{ delta: { reasoning_content: "Ich ueberlege." } }] })
        + line({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "search_notes", arguments: "{}" } }] } }] })
        + line({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }) + "data: [DONE]\n",
    ]), 1000, fakeClock);
    const r = await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: true, reasoning: "Ich ueberlege." });
  });

  it("liefert kein reasoning-Feld, wenn nichts anfiel", async () => {
    const client = new KodaChatClient(transportOf([
      line({ choices: [{ delta: { content: "Antwort" } }] }) + "data: [DONE]\n",
    ]), 1000, fakeClock);
    const r = await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    if (r.ok) expect(r.reasoning).toBeUndefined();
  });

  // Die drei Reparaturen aus 0.15.0 — nach dem Tausch auf den Kit-Client je EIN Test, der
  // vor dem Tausch lokal gruen war (Welle 11, Verhaltensinventar).
  it("(0.15.0) schickt das reasoning einer Assistenten-Runde mit Tool-Calls als reasoning UND reasoning_content zurueck", async () => {
    let sent: { messages: Record<string, unknown>[] } | undefined;
    const t: SseTransport = {
      async postStream(_u, body, _h, onChunk) {
        sent = body as typeof sent;
        onChunk(line({ choices: [{ delta: { content: "ok" } }] }) + "data: [DONE]\n");
        return 200;
      },
    };
    const history: ChatMessage[] = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "read_note", arguments: "{}" }], reasoning: "Ich lese zuerst." },
      { role: "tool", toolCallId: "c1", content: "Text" },
    ];
    await new KodaChatClient(t, 1000, fakeClock).complete(cfg, history, [], () => {}, () => {}, new AbortController().signal);
    const assistant = sent?.messages[1];
    expect(assistant).toMatchObject({ role: "assistant", reasoning: "Ich lese zuerst.", reasoning_content: "Ich lese zuerst." });
  });

  it("(0.15.0) ein abgeschnittener Tool-Call ohne Text ist kind truncated, nicht ein Aufruf mit halben Argumenten", async () => {
    const client = new KodaChatClient(transportOf([
      line({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "write_note", arguments: '{"path":"A.md","content":"halb' } }] } }] })
        + line({ choices: [{ delta: {}, finish_reason: "length" }] }) + "data: [DONE]\n",
    ]), 1000, fakeClock);
    const r = await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, kind: "truncated", partial: "" });
  });

  it("(0.15.0) die Tool-Call-Frist gilt auch beim Kopf-Chunk OHNE Argumente, danach keine Chunks mehr", async () => {
    const ms: number[] = [];
    const clock = { now: () => 0, setTimeout: (_fn: () => void, m: number) => { ms.push(m); return 1; }, clearTimeout: () => {} };
    const client = new KodaChatClient(transportOf([
      line({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "write_note", arguments: "" } }] } }] }),
    ]), 1000, clock);
    await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(ms[ms.length - 1]).toBe(TOOL_CALL_IDLE_TIMEOUT_MS);
  });

  // Was der Kit-Client dazugibt: kein Verlust, aber sichtbar — CHANGELOG.
  it("HTTP 200 mit JSON-Fehlerkoerper ist kind http und nennt die Servermeldung, nicht „HTTP 200“", async () => {
    const client = new KodaChatClient(transportOf(['{"error":{"message":"model not loaded"}}'], 200), 1000, fakeClock);
    const r = await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, kind: "http" });
    if (!r.ok) {
      expect(r.detail).toContain("model not loaded");
      expect(r.detail).not.toContain("HTTP 200");
    }
  });

  it("formuliert Timeout und Netzfehler deutsch (das Kit liefert englische Kurztexte)", async () => {
    const t: SseTransport = { async postStream() { throw Object.assign(new Error("boom"), { name: "StreamNetworkError" }); } };
    const net = await new KodaChatClient(t, 1000, fakeClock).complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(net).toMatchObject({ ok: false, kind: "network", detail: expect.stringContaining("nicht erreichbar") });

    let fire: (() => void) | undefined;
    const clock = { now: () => 0, setTimeout: (fn: () => void) => { fire = fn; return 1; }, clearTimeout: () => {} };
    const hang: SseTransport = {
      postStream(_u, _b, _h, _c, signal) {
        return new Promise<number>((_res, rej) => {
          signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
          fire?.();
        });
      },
    };
    const to = await new KodaChatClient(hang, 30_000, clock).complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(to).toMatchObject({ ok: false, kind: "timeout", detail: "keine Antwort seit 30s" });
  });
});
