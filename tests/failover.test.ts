import { EndpointResolver, withFailover } from "../src/core/llm/failover";
import type { EndpointConfig } from "../src/vendor/kit/endpoint_config";
import type { ApiError, LlmEndpointManagerApi, ResolvedEndpoint } from "../src/vendor/kit/endpoint-source";

const eps = (...urls: string[]): EndpointConfig[] => urls.map((url) => ({ url }));

describe("EndpointResolver", () => {
  it("nimmt den ersten erreichbaren Eintrag — die Liste IST die Prioritaet", async () => {
    const r = new EndpointResolver(() => eps("http://a", "http://b"), async (c) => c.url.includes("b"));
    expect((await r.resolve())?.config.url).toBe("http://b");
  });

  it("merkt sich das Ergebnis, statt vor jeder Frage neu zu pingen", async () => {
    let pings = 0;
    const r = new EndpointResolver(() => eps("http://a"), async () => { pings += 1; return true; });
    await r.resolve();
    await r.resolve();
    expect(pings).toBe(1);
  });

  it("teilt einen laufenden Durchlauf, statt ihn doppelt zu starten", async () => {
    let pings = 0;
    const r = new EndpointResolver(() => eps("http://a"), async () => {
      pings += 1;
      await new Promise((res) => setTimeout(res, 5));
      return true;
    });
    const [x, y] = await Promise.all([r.resolve(), r.resolve()]);
    expect(pings).toBe(1);
    expect(x?.config.url).toBe(y?.config.url);
  });

  it("merkt sich einen Fehlschlag NICHT — das Netz kann zurueck sein", async () => {
    let reachable = false;
    let pings = 0;
    const r = new EndpointResolver(() => eps("http://a"), async () => { pings += 1; return reachable; });
    expect(await r.resolve()).toBeNull();
    reachable = true;
    expect((await r.resolve())?.config.url).toBe("http://a");
    expect(pings).toBe(2);
  });

  it("pingt nach invalidate() erneut", async () => {
    let pings = 0;
    const r = new EndpointResolver(() => eps("http://a"), async () => { pings += 1; return true; });
    await r.resolve();
    r.invalidate();
    await r.resolve();
    expect(pings).toBe(2);
  });
});

describe("EndpointResolver — Modell", () => {
  it("liefert das Modell der Zeile", async () => {
    const r = new EndpointResolver(() => [{ url: "http://a", model: "zeile" }], async () => true);
    expect((await r.resolve())?.model).toBe("zeile");
  });

  it("eine Zeile ohne Modell sendet kein Modell — es gibt keinen globalen Rueckfall mehr", async () => {
    const r = new EndpointResolver(() => [{ url: "http://a", model: "  " }], async () => true);
    expect((await r.resolve())?.model).toBe("");
  });

  it("peek: vor dem Aufloesen das Modell der ersten Zeile, danach das der aufgeloesten", async () => {
    const rows: EndpointConfig[] = [{ url: "http://a", model: "erste" }, { url: "http://b", model: "zweite" }];
    const r = new EndpointResolver(() => rows, async (c) => c.url.includes("b"));
    expect(r.peek(rows)).toBe("erste");
    await r.resolve();
    expect(r.peek(rows)).toBe("zweite");
    r.invalidate();
    expect(r.peek(rows)).toBe("erste");
  });

  it("peek: ohne Zeilen ein leerer Name", () => {
    const r = new EndpointResolver(() => [], async () => true);
    expect(r.peek([])).toBe("");
  });

  it("meldet jede neue Aufloesung, nicht den Treffer aus dem Zwischenspeicher", async () => {
    let n = 0;
    const r = new EndpointResolver(() => [{ url: "http://a", model: "m" }], async () => true, () => { n += 1; });
    await r.resolve();
    await r.resolve();
    expect(n).toBe(1);
    r.invalidate();
    await r.resolve();
    expect(n).toBe(2);
  });
});

describe("withFailover", () => {
  const resolverOf = (...urls: string[]) => {
    let reachable = new Set(urls);
    const r = new EndpointResolver(() => eps(...urls), async (c) => reachable.has(c.url));
    return { r, kill: (u: string) => reachable.delete(u) };
  };

  it("laesst einen erfolgreichen Lauf in Ruhe", async () => {
    const { r } = resolverOf("http://a");
    let runs = 0;
    const out = await withFailover(r, async () => { runs += 1; return "ok"; }, () => false, () => "leer");
    expect(out).toBe("ok");
    expect(runs).toBe(1);
  });

  it("loest nach einem Ausfall neu auf und laeuft auf dem naechsten Endpunkt", async () => {
    const { r, kill } = resolverOf("http://a", "http://b");
    await r.resolve(); // a ist gecacht
    kill("http://a");
    const used: string[] = [];
    const out = await withFailover(
      r,
      async (ep) => { used.push(ep.config.url); return ep.config.url === "http://a" ? "netzfehler" : "ok"; },
      (res) => res === "netzfehler",
      () => "leer",
    );
    expect(used).toEqual(["http://a", "http://b"]);
    expect(out).toBe("ok");
  });

  it("versucht es genau EINMAL erneut, nicht endlos", async () => {
    const { r } = resolverOf("http://a", "http://b");
    let runs = 0;
    const out = await withFailover(r, async () => { runs += 1; return "netzfehler"; }, (res) => res === "netzfehler", () => "leer");
    expect(runs).toBe(2);
    expect(out).toBe("netzfehler");
  });

  it("meldet ohne erreichbaren Endpunkt den Leerfall, statt zu werfen", async () => {
    const { r, kill } = resolverOf("http://a");
    kill("http://a");
    expect(await withFailover(r, async () => "ok", () => false, () => "leer")).toBe("leer");
  });
});

describe("withFailover — Widerspruch zwischen Probe und Chat-Aufruf", () => {
  const resolverOf = (...urls: string[]) => {
    const reachable = new Set(urls);
    const r = new EndpointResolver(() => eps(...urls), async (c) => reachable.has(c.url));
    return { r, kill: (u: string) => reachable.delete(u) };
  };

  it("benennt den Widerspruch, wenn die Probe den Endpunkt erreicht, aber beide Chat-Versuche am Netz scheitern", async () => {
    const { r } = resolverOf("http://a");
    const out = await withFailover(
      r,
      async () => "netzfehler",
      (res) => res === "netzfehler",
      () => "leer",
      (res) => `${res}, obwohl die Probe gruen war`,
    );
    expect(out).toBe("netzfehler, obwohl die Probe gruen war");
  });

  it("benennt ihn NICHT, wenn der Endpunkt beim erneuten Aufloesen wirklich weg ist", async () => {
    const { r, kill } = resolverOf("http://a");
    await r.resolve(); // a ist gecacht
    kill("http://a");
    const out = await withFailover(
      r,
      async () => "netzfehler",
      (res) => res === "netzfehler",
      () => "leer",
      (res) => `${res}, obwohl die Probe gruen war`,
    );
    expect(out).toBe("netzfehler");
  });

  it("benennt ihn NICHT, wenn der zweite Versuch durchkommt", async () => {
    const { r } = resolverOf("http://a", "http://b");
    let runs = 0;
    const out = await withFailover(
      r,
      async () => (runs++ === 0 ? "netzfehler" : "ok"),
      (res) => res === "netzfehler",
      () => "leer",
      (res) => `${res}, obwohl die Probe gruen war`,
    );
    expect(out).toBe("ok");
  });
});

describe("EndpointResolver — LLM Endpoint Manager (Opt-in)", () => {
  const claudeEp = { id: "claude", label: "Claude API", config: { url: "https://api.anthropic.com", apiKey: "k" }, defaultModel: "claude-sonnet-5-5", backend: "anthropic" as const, transport: "anthropic" as const, models: [{ id: "claude-sonnet-5-5" }] };
  function fakeManager(over: { resolve?: ApiError } = {}) {
    const calls: { art: string; opts: unknown }[] = [];
    const api: LlmEndpointManagerApi = {
      version: 1,
      list: () => [],
      get: () => null,
      resolve: async (_c, opts) => { calls.push({ art: "resolve", opts }); return (over.resolve ?? claudeEp) as ResolvedEndpoint | ApiError; },
      materialize: async (id, opts) => { calls.push({ art: "materialize", opts }); return (id === "claude" ? claudeEp : { error: "not-found" }) as ResolvedEndpoint | ApiError; },
      models: async () => [],
      importEndpoints: async () => ({ added: [], merged: [], skipped: [] }),
      on: () => () => {},
    };
    return { api, calls };
  }
  const local = (): EndpointConfig[] => [{ url: "http://lokal", model: "zeile" }];
  const ping = async (): Promise<boolean> => true;

  it("ohne Manager in der Quelle (Opt-in aus) fragt nichts den Manager — es bleibt die lokale Liste", async () => {
    const m = fakeManager();
    const r = new EndpointResolver(local, ping, () => {}, () => ({ manager: null, choice: { endpointId: "claude" } }));
    const ep = await r.resolve();
    expect(m.calls).toEqual([]);
    expect(ep).toMatchObject({ kind: "local", transport: "http", model: "zeile" });
    expect(ep?.config.url).toBe("http://lokal");
  });

  it("eine alte Wahl uebersteuert ohne Manager das Modell der Zeile nicht", async () => {
    const r = new EndpointResolver(local, ping, () => {}, () => ({ manager: null, choice: { model: "fremd" } }));
    expect((await r.resolve())?.model).toBe("zeile");
  });

  it("mit Manager: fragt mit Opt-in auf http und anthropic und liefert Transport, Backend und Familie", async () => {
    const m = fakeManager();
    const r = new EndpointResolver(local, ping, () => {}, () => ({ manager: m.api, choice: {} }));
    const ep = await r.resolve();
    expect(m.calls[0]).toEqual({ art: "resolve", opts: { caller: "koda-agent", transports: ["http", "anthropic"] } });
    expect(ep).toMatchObject({ kind: "manager", transport: "anthropic", backend: "anthropic", family: "claude", model: "claude-sonnet-5-5" });
    expect(r.peekTransport()).toEqual({ transport: "anthropic", backend: "anthropic" });
  });

  it("die gewaehlte Zeile geht ueber materialize, das gewaehlte Modell gilt", async () => {
    const m = fakeManager();
    const r = new EndpointResolver(local, ping, () => {}, () => ({ manager: m.api, choice: { endpointId: "claude", model: "claude-haiku-5-5" } }));
    const ep = await r.resolve();
    expect(m.calls[0]?.art).toBe("materialize");
    expect(ep?.model).toBe("claude-haiku-5-5");
  });

  it("peek: vor der ersten Aufloesung gilt mit Manager das gewaehlte Modell, nicht das der lokalen Zeile", () => {
    const m = fakeManager();
    const r = new EndpointResolver(local, ping, () => {}, () => ({ manager: m.api, choice: { model: "claude-haiku-5-5" } }));
    expect(r.peek(local())).toBe("claude-haiku-5-5");
  });

  it("ein Manager ohne Endpunkt nennt seinen Grund und faellt nicht auf die lokale Liste zurueck", async () => {
    const m = fakeManager({ resolve: { error: "no-endpoint" } });
    const r = new EndpointResolver(local, ping, () => {}, () => ({ manager: m.api, choice: {} }));
    expect(await r.resolve()).toBeNull();
    expect(r.failure()).toBe("no-endpoint");
  });

  it("eine ausgeschaltete Wahl: der Grund ist disabled", async () => {
    const m = fakeManager({ resolve: { error: "no-endpoint" } });
    m.api.materialize = async () => ({ error: "disabled" });
    const r = new EndpointResolver(local, ping, () => {}, () => ({ manager: m.api, choice: { endpointId: "claude" } }));
    expect(await r.resolve()).toBeNull();
    expect(r.failure()).toBe("disabled");
  });

  it("der Grund ist nach einer erfolgreichen Aufloesung wieder leer", async () => {
    const m = fakeManager({ resolve: { error: "no-endpoint" } });
    const r = new EndpointResolver(local, ping, () => {}, () => ({ manager: m.api, choice: {} }));
    await r.resolve();
    m.api.resolve = async () => claudeEp as ResolvedEndpoint;
    await r.resolve();
    expect(r.failure()).toBeNull();
  });
});
