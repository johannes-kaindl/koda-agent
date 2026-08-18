import { probeModelContext } from "../src/core/llm/context-probe";
import type { HttpProbe } from "../src/core/llm/probe";

const clock = { now: () => 0, setTimeout: () => 1, clearTimeout: () => {} };
const ep = { url: "http://127.0.0.1:1234" };

function http(lm: { status: number; json: unknown } | Error, oll: { status: number; json: unknown } | Error): HttpProbe & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async getJson(url) { calls.push(url); if (lm instanceof Error) throw lm; return lm; },
    async postJson(url) { calls.push(url); if (oll instanceof Error) throw oll; return oll; },
  };
}

describe("probeModelContext", () => {
  it("LM Studio: loaded_context_length vor max_context_length, per Modell-Id", async () => {
    const h = http({ status: 200, json: { data: [{ id: "qwen", max_context_length: 32768, loaded_context_length: 8192 }] } }, new Error("nicht gefragt"));
    expect(await probeModelContext(ep, "qwen", h, clock)).toBe(8192);
    expect(h.calls).toEqual(["http://127.0.0.1:1234/api/v0/models"]);
  });
  it("Ollama als Fallback: model_info.<arch>.context_length", async () => {
    const h = http({ status: 404, json: null }, { status: 200, json: { model_info: { "llama.context_length": 4096 } } });
    expect(await probeModelContext(ep, "llama3", h, clock)).toBe(4096);
    expect(h.calls[1]).toBe("http://127.0.0.1:1234/api/show");
  });
  it("meldet keiner etwas (oder wirft alles): null, kein Throw", async () => {
    expect(await probeModelContext(ep, "x", http(new Error("boom"), new Error("boom")), clock)).toBeNull();
    expect(await probeModelContext(ep, "x", http({ status: 200, json: { data: [] } }, { status: 200, json: {} }), clock)).toBeNull();
  });
  it("leerer Modellname: null ohne Anfrage (LM Studio meldet je Modell)", async () => {
    const h = http({ status: 200, json: { data: [] } }, { status: 200, json: {} });
    expect(await probeModelContext(ep, "", h, clock)).toBeNull();
    expect(h.calls).toEqual([]);
  });
});
