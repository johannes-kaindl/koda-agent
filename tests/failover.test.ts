import { EndpointResolver, withFailover } from "../src/core/llm/failover";
import type { EndpointConfig } from "../src/vendor/kit/endpoint_config";

const eps = (...urls: string[]): EndpointConfig[] => urls.map((url) => ({ url }));

describe("EndpointResolver", () => {
  it("nimmt den ersten erreichbaren Eintrag — die Liste IST die Prioritaet", async () => {
    const r = new EndpointResolver(() => eps("http://a", "http://b"), async (c) => c.url.includes("b"));
    expect((await r.resolve())?.url).toBe("http://b");
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
    expect(x?.url).toBe(y?.url);
  });

  it("merkt sich einen Fehlschlag NICHT — das Netz kann zurueck sein", async () => {
    let reachable = false;
    let pings = 0;
    const r = new EndpointResolver(() => eps("http://a"), async () => { pings += 1; return reachable; });
    expect(await r.resolve()).toBeNull();
    reachable = true;
    expect((await r.resolve())?.url).toBe("http://a");
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
      async (ep) => { used.push(ep.url); return ep.url === "http://a" ? "netzfehler" : "ok"; },
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
