import { probeEndpoint, type HttpProbe } from "../src/core/llm/probe";

const clock = {
  now: () => 0,
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id: number) => clearTimeout(id),
};

const http = (impl: HttpProbe["getJson"]): HttpProbe => ({
  getJson: impl,
  postJson: async () => {
    throw new Error("nicht erwartet");
  },
});

describe("probeEndpoint", () => {
  it("erkennt einen gesunden OpenAI-kompatiblen Endpunkt", async () => {
    const s = await probeEndpoint({ url: "http://127.0.0.1:1234" },
      http(async () => ({ status: 200, json: { data: [{ id: "m" }] } })), clock, 5000);
    expect(s).toMatchObject({ reachable: true, kind: "ok" });
  });

  it("meldet 401 als unauthorized statt als 'kein LLM-Endpunkt'", async () => {
    // Die Vorlage in vault-crews verwirft den HTTP-Status und kann diesen Fall nicht
    // unterscheiden — ein fehlender Schluessel sieht dort aus wie ein falscher Dienst.
    const s = await probeEndpoint({ url: "https://api.example.com" },
      http(async () => ({ status: 401, json: {} })), clock, 5000);
    expect(s).toMatchObject({ reachable: false, kind: "unauthorized" });
  });

  it("meldet eine Antwort ohne Modell-Liste als not-an-llm-api", async () => {
    const s = await probeEndpoint({ url: "http://127.0.0.1:8080" },
      http(async () => ({ status: 200, json: { hello: "world" } })), clock, 5000);
    expect(s).toMatchObject({ reachable: false, kind: "not-an-llm-api" });
  });

  it("uebersetzt eine abgelehnte Verbindung in Klartext", async () => {
    const s = await probeEndpoint({ url: "http://127.0.0.1:9999" },
      http(async () => { throw new Error("net::ERR_CONNECTION_REFUSED"); }), clock, 5000);
    expect(s).toMatchObject({ reachable: false, kind: "refused" });
    expect(s.klartext).toMatch(/Server läuft nicht/);
  });

  it("bricht eine haengende Probe nach der Frist ab", async () => {
    const s = await probeEndpoint({ url: "http://10.0.0.1" },
      http(() => new Promise(() => { /* antwortet nie */ })), clock, 20);
    expect(s).toMatchObject({ reachable: false, kind: "timeout" });
  });

  it("reicht den API-Schluessel der Zeile als Bearer durch", async () => {
    // REGISTRY-Lesson (2026-08-05): die Probe ist der Pfad, dessen stiller Fehlschlag
    // ganze Fehlersuchen begruendet — die Header-Weitergabe braucht einen eigenen Test.
    let seen: Record<string, string> = {};
    await probeEndpoint({ url: "https://api.example.com", apiKey: "geheim" },
      http(async (_u, h) => { seen = h; return { status: 200, json: { data: [] } }; }), clock, 5000);
    expect(seen.Authorization).toBe("Bearer geheim");
  });

  it("fragt die Modell-Liste am normalisierten Endpunkt ab", async () => {
    let url = "";
    await probeEndpoint({ url: "http://127.0.0.1:1234/v1/" },
      http(async (u) => { url = u; return { status: 200, json: { data: [] } }; }), clock, 5000);
    expect(url).toBe("http://127.0.0.1:1234/v1/models");
  });
});
