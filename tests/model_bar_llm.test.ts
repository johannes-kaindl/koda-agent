import { EndpointResolver } from "../src/core/llm/failover";
import { createModelBarLlm, type ModelBarSettingsPort } from "../src/core/llm/model-bar-llm";
import type { EndpointConfig } from "../src/vendor/kit/endpoint_config";
import type { ApiError, LlmEndpointManagerApi, ResolvedEndpoint } from "../src/vendor/kit/endpoint-source";

// Welle 27, K3: die Modellzeile des Kits braucht vier Methoden (`models`, `setModel`, `modelInUse`, `source`). Koda hat keine `LlmConnection`; der Adapter hält
// keinen eigenen Zustand ausser der ausstehenden Wahl: Modell und Liste kommen aus dem Resolver und den Einstellungen, ein Wechsel schreibt in dieselbe Stelle wie der Tab.

interface Port extends ModelBarSettingsPort { settings: { endpoints: EndpointConfig[]; choice: { endpointId?: string; model?: string } }; saved: number }

function setup(over: { endpoints?: EndpointConfig[]; manager?: LlmEndpointManagerApi | null; choice?: { endpointId?: string; model?: string }; reachable?: (url: string) => boolean; lists?: Record<string, string[]> } = {}) {
  const port = {
    settings: { endpoints: over.endpoints ?? [{ url: "http://a", model: "m-a" }, { url: "http://b", model: "m-b" }], choice: over.choice ?? {} },
    saved: 0,
  } as Port;
  const lists = over.lists ?? { "http://a": ["a1", "a2"], "http://b": ["b1", "b2", "b3"] };
  const probes: string[] = [];
  const resolver: EndpointResolver = new EndpointResolver(
    () => port.settings.endpoints,
    async (c) => (over.reachable ?? (() => true))(c.url),
    () => {},
    () => ({ manager: over.manager ?? null, choice: port.settings.choice }),
  );
  port.update = async (patch) => {
    if (patch.endpoints !== undefined) port.settings.endpoints = patch.endpoints;
    if (patch.choice !== undefined) port.settings.choice = patch.choice;
    port.saved += 1;
    resolver.invalidate();               // wie `saveSettings()`: der Zwischenstand des Resolvers fällt
  };
  port.getEndpoints = () => port.settings.endpoints;
  port.getChoice = () => port.settings.choice;
  const llm = createModelBarLlm({
    resolver,
    settings: port,
    listModels: async (ep) => { probes.push(ep.url); return { models: lists[ep.url] ?? [], reachable: true }; },
  });
  return { port, resolver, llm, probes };
}

const claudeEp = { id: "claude", label: "Claude API", config: { url: "https://api.anthropic.com", apiKey: "k" }, defaultModel: "claude-sonnet-5-5", backend: "anthropic" as const, transport: "anthropic" as const, models: [{ id: "claude-sonnet-5-5" }, { id: "claude-haiku-5-5" }] };
function fakeManager(): LlmEndpointManagerApi {
  return {
    version: 1, list: () => [], get: () => null,
    resolve: async () => claudeEp as ResolvedEndpoint | ApiError,
    materialize: async (id) => (id === "claude" ? claudeEp : { error: "not-found" }) as ResolvedEndpoint | ApiError,
    models: async () => [],
    importEndpoints: async () => ({ added: [], merged: [], skipped: [] }),
    on: () => () => {},
  };
}

describe("Modellzeile — Liste", () => {
  it("lokal: die Liste des aufgelösten Endpunkts (die erste erreichbare Zeile), erreichbar", async () => {
    const x = setup({ reachable: (u) => u === "http://b" });
    expect(await x.llm.models()).toEqual({ models: ["b1", "b2", "b3"], reachable: true });
    expect(x.probes).toEqual(["http://b"]);
  });
  it("ohne erreichbaren Endpunkt: leer und nicht erreichbar, kein Wurf", async () => {
    const x = setup({ reachable: () => false });
    expect(await x.llm.models()).toEqual({ models: [], reachable: false });
  });
  it("mit Manager (Claude): die Liste aus der Modelltabelle des Managers, kein Abruf mit Bearer an die Messages-API", async () => {
    const x = setup({ manager: fakeManager(), choice: { endpointId: "claude" } });
    expect(await x.llm.models()).toEqual({ models: ["claude-sonnet-5-5", "claude-haiku-5-5"], reachable: true });
    expect(x.probes).toEqual([]);
  });
});

describe("Modellzeile — Wahl", () => {
  it("lokal: schreibt das Modell in die Zeile des GESENDETEN Endpunkts (die zweite, wenn die erste nicht antwortet), nicht in die erste", async () => {
    const x = setup({ reachable: (u) => u === "http://b" });
    await x.llm.setModel("b2");
    expect(x.port.settings.endpoints).toEqual([{ url: "http://a", model: "m-a" }, { url: "http://b", model: "b2" }]);
    expect(x.port.saved).toBe(1);
  });
  it("lokal: „Automatisch“ (\"\") leert das Modell der Zeile", async () => {
    const x = setup();
    await x.llm.setModel("");
    expect(x.port.settings.endpoints[0]).toEqual({ url: "http://a" });
  });
  it("mit Manager: ändert nur choice.model, behält die übrige Wahl; \"\" nimmt das Modell heraus", async () => {
    const x = setup({ manager: fakeManager(), choice: { endpointId: "claude" } });
    await x.llm.setModel("claude-haiku-5-5");
    expect(x.port.settings.choice).toEqual({ endpointId: "claude", model: "claude-haiku-5-5" });
    expect(x.port.settings.endpoints.length).toBe(2);   // die lokale Liste bleibt unberührt
    await x.llm.setModel("");
    expect(x.port.settings.choice).toEqual({ endpointId: "claude" });
  });
  it("nach der Wahl ist der Endpunkt wieder aufgelöst: das gesendete Modell und das Backend springen nicht auf die erste Zeile zurück", async () => {
    const x = setup({ reachable: (u) => u === "http://b" });
    await x.llm.setModel("b3");
    expect(x.resolver.peek(x.port.settings.endpoints)).toBe("b3");                 // ohne neues Auflösen stünde hier das Modell der ERSTEN Zeile
  });
  it("mit Manager: nach der Wahl stehen Transport und Backend noch da (ohne neues Auflösen: „http“ und „unbekannt“)", async () => {
    const x = setup({ manager: fakeManager(), choice: { endpointId: "claude" } });
    await x.llm.setModel("claude-haiku-5-5");
    expect(x.resolver.peekTransport()).toEqual({ transport: "anthropic", backend: "anthropic" });
  });
  it("ohne aktiven Endpunkt ändert die Wahl nichts", async () => {
    const x = setup({ reachable: () => false });
    await x.llm.setModel("a2");
    expect(x.port.saved).toBe(0);
    expect(x.port.settings.endpoints[0]).toEqual({ url: "http://a", model: "m-a" });
  });
});

describe("Modellzeile — Anzeige", () => {
  it("modelInUse: die Wahl der aktiven Zeile; bis zum Ende von setModel schon die ausstehende", async () => {
    const x = setup({ reachable: (u) => u === "http://b" });
    await x.llm.models();                      // löst auf
    expect(x.llm.modelInUse()).toBe("m-b");
    let during = "";
    const orig = x.port.update;
    x.port.update = async (p) => { during = x.llm.modelInUse(); await orig(p); };
    await x.llm.setModel("b2");
    expect(during).toBe("b2");
    expect(x.llm.modelInUse()).toBe("b2");
  });
  it("mit Manager: modelInUse ist die Wahl, sonst das Standardmodell; source().defaultModel nennt das Standardmodell", async () => {
    const x = setup({ manager: fakeManager(), choice: { endpointId: "claude" } });
    await x.llm.models();
    expect(x.llm.source().defaultModel).toBe("claude-sonnet-5-5");
    expect(x.llm.modelInUse()).toBe("claude-sonnet-5-5");
    await x.llm.setModel("claude-haiku-5-5");
    expect(x.llm.modelInUse()).toBe("claude-haiku-5-5");
  });
  it("lokal ohne Standardmodell: source() trägt kein defaultModel", async () => {
    const x = setup();
    await x.llm.models();
    expect(x.llm.source()).toEqual({});
  });
});
