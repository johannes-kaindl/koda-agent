import { describe, expect, it, vi } from "vitest";
import { EndpointResolver } from "../src/core/llm/failover";
import { createModelBarLlm, type ModelBarSettingsPort } from "../src/core/llm/model-bar-llm";
import type { EndpointConfig } from "../src/vendor/kit/endpoint_config";
import type { ApiError, LlmEndpointManagerApi, ResolvedEndpoint } from "../src/vendor/kit/endpoint-source";

// Welle 27, K3: die Modellzeile des Kits braucht vier Methoden (`models`, `setModel`, `modelInUse`, `source`). Koda hat keine `LlmConnection`; der Adapter hält
// keinen eigenen Zustand ausser der ausstehenden Wahl: Modell und Liste kommen aus dem Resolver und den Einstellungen, ein Wechsel schreibt in dieselbe Stelle wie der Tab.

interface Port extends ModelBarSettingsPort { settings: { endpoints: EndpointConfig[]; choice: { endpointId?: string; model?: string } }; saved: number }

function setup(over: { endpoints?: EndpointConfig[]; manager?: LlmEndpointManagerApi | null; managerOff?: boolean; choice?: { endpointId?: string; model?: string }; reachable?: (url: string) => boolean; lists?: Record<string, string[]> } = {}) {
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
    manager: () => (over.managerOff === true ? null : over.manager ?? null),
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


// Welle 34: obsidian-kit 0.87.0 gruppiert das Dropdown nach Endpunkt. Sechs Pflichtmethoden an `ModelBarConnection`; mit Manager liefert Koda die Endpunkte seiner Wahl-Liste (Fähigkeit chat,
// Transporte http und anthropic, wie der Einstellungs-Tab), ohne Manager `[]` (dann bleibt die Zeile eine flache Liste, der Fall „Opt-in aus“).
function twoEndpointManager(over: { models?: Record<string, string[] | { error: string }>; disabledId?: string } = {}): LlmEndpointManagerApi {
  const entries = [
    { id: "lm", label: "LM Studio", url: "http://lm", provider: "lmstudio", capabilities: ["chat"], defaultModel: "qwen", enabled: over.disabledId !== "lm", hasSecret: false },
    { id: "claude", label: "Claude API", url: "https://api.anthropic.com", provider: "anthropic", capabilities: ["chat"], defaultModel: "claude-sonnet-5-5", enabled: over.disabledId !== "claude", hasSecret: true, transport: "anthropic" },
  ];
  const lists = over.models ?? { lm: ["qwen", "gemma"], claude: ["claude-sonnet-5-5", "claude-haiku-5-5"] };
  const m = fakeManager();
  return {
    ...m,
    list: (f) => (entries as unknown as ReturnType<LlmEndpointManagerApi["list"]>).filter((e) => f?.capability === undefined || e.capabilities.includes(f.capability)),
    models: async (id) => (lists[id] ?? { error: "not-found" }) as string[] | ApiError,
  };
}

describe("Modellzeile — Gruppen nach Endpunkt (Kit 0.87.0)", () => {
  it("ohne Manager (Opt-in aus oder nicht installiert): endpoints() ist leer, die Zeile bleibt eine flache Liste", () => {
    const x = setup({ managerOff: true });
    expect(x.llm.endpoints()).toEqual([]);
    expect(x.llm.activeEndpointId()).toBeUndefined();
  });
  it("mit Manager: die eingeschalteten Endpunkte der Liste mit Bezeichnung und Standardmodell", () => {
    const x = setup({ manager: twoEndpointManager({ disabledId: "lm" }) });
    expect(x.llm.endpoints()).toEqual([{ id: "claude", label: "Claude API", defaultModel: "claude-sonnet-5-5" }]);
  });
  it("modelsOf: die Modelle des genannten Endpunkts; ein Fehler oder Wurf des Managers ist nicht erreichbar, nie ein Wurf", async () => {
    const x = setup({ manager: twoEndpointManager({ models: { lm: ["qwen"], claude: { error: "unreachable" } } }) });
    expect(await x.llm.modelsOf("lm")).toEqual({ models: ["qwen"], reachable: true });
    expect(await x.llm.modelsOf("claude")).toEqual({ models: [], reachable: false });
    expect(await x.llm.modelsOf("weg")).toEqual({ models: [], reachable: false });
    const kaputt = { ...twoEndpointManager(), models: async () => { throw new Error("boom"); } } as LlmEndpointManagerApi;
    expect(await setup({ manager: kaputt }).llm.modelsOf("lm")).toEqual({ models: [], reachable: false });
  });
  it("modelsOf reicht force an den Manager durch", async () => {
    const seen: unknown[] = [];
    const m = { ...twoEndpointManager(), models: async (_id: string, o?: { force?: boolean }) => { seen.push(o); return ["x"]; } } as LlmEndpointManagerApi;
    const x = setup({ manager: m });
    await x.llm.modelsOf("lm", { force: true });
    await x.llm.modelsOf("lm");
    expect(seen).toEqual([{ force: true }, undefined]);
  });
  it("activeEndpointId: die Wahl, wenn es sie gibt; sonst der erste eingeschaltete (Automatisch); erst nach dem Auflösen", async () => {
    const x = setup({ manager: twoEndpointManager(), choice: { endpointId: "claude" } });
    expect(x.llm.activeEndpointId()).toBeUndefined();            // noch nicht aufgelöst
    await x.resolver.resolve();
    expect(x.llm.activeEndpointId()).toBe("claude");
    const y = setup({ manager: twoEndpointManager({ disabledId: "lm" }), choice: { endpointId: "weg" } });
    await y.resolver.resolve();
    expect(y.llm.activeEndpointId()).toBe("claude");             // verwaiste Wahl: Automatisch nimmt den ersten eingeschalteten
  });
  it("choice() liest die gespeicherte Wahl", () => {
    expect(setup({ manager: twoEndpointManager(), choice: { endpointId: "lm", model: "gemma" } }).llm.choice()).toEqual({ endpointId: "lm", model: "gemma" });
  });
  it("setChoice schreibt Endpunkt UND Modell, löst neu auf und meldet den Zuhörern; Transport und Backend stehen danach noch da", async () => {
    const x = setup({ manager: twoEndpointManager(), choice: { endpointId: "lm" } });
    let calls = 0;
    x.llm.subscribe(() => { calls += 1; });
    await x.llm.setChoice({ endpointId: "claude", model: "claude-haiku-5-5" });
    expect(x.port.settings.choice).toEqual({ endpointId: "claude", model: "claude-haiku-5-5" });
    expect(x.port.saved).toBe(1);
    expect(x.resolver.peekTransport().transport).toBe("anthropic");   // aufgelöst, sonst „http“
    expect(calls).toBeGreaterThan(0);
  });
  it("setChoice: scheitert das Speichern, wirft es (die Zeile zeigt dann wieder die geltende Wahl) und meldet nichts", async () => {
    const x = setup({ manager: twoEndpointManager(), choice: { endpointId: "lm" } });
    x.port.update = async () => { throw new Error("Platte voll"); };
    let calls = 0;
    x.llm.subscribe(() => { calls += 1; });
    await expect(x.llm.setChoice({ endpointId: "claude" })).rejects.toThrow("Platte voll");
    expect(calls).toBe(0);
  });
  it("subscribe: mehrere Zuhörer, die Abmeldung wirkt, ein werfender Zuhörer stört die anderen nicht; setModel meldet auch", async () => {
    const x = setup();
    const a = vi.fn(); const b = vi.fn();
    const offA = x.llm.subscribe(() => { throw new Error("Zuhörer"); });
    x.llm.subscribe(a);
    const offB = x.llm.subscribe(b);
    await x.llm.setModel("a2");
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    offA(); offB();
    const n = a.mock.calls.length;
    x.llm.notify();
    expect(a.mock.calls.length).toBe(n + 1);
    expect(b.mock.calls.length).toBeGreaterThan(0);
    const nb = b.mock.calls.length;
    x.llm.notify();
    expect(b.mock.calls.length).toBe(nb);                         // abgemeldet
  });
  it("verwaiste Wahl (der gewählte Endpunkt ist abgeschaltet): source() trägt den Grund, activeEndpointId ist der Automatisch-Endpunkt, nicht die tote Wahl", async () => {
    const m = twoEndpointManager();
    const abgeschaltet = { ...m, materialize: async (id: string) => (id === "claude" ? { error: "disabled" } : fakeManager().materialize(id)) } as LlmEndpointManagerApi;
    const x = setup({ manager: abgeschaltet, choice: { endpointId: "claude", model: "claude-haiku-5-5" } });
    await x.resolver.resolve();
    expect(x.llm.source().reason).toBe("disabled");
    expect(x.llm.activeEndpointId()).toBe("lm");                       // die erste Zeile der Liste, die „Automatisch“ nimmt (hier fakeManager.resolve → claudeEp, die Liste führt lm zuerst)
    expect(x.llm.choice()).toEqual({ endpointId: "claude", model: "claude-haiku-5-5" });   // die gespeicherte Wahl bleibt unangetastet
  });
  it("ohne verwaiste Wahl trägt source() keinen Grund", async () => {
    const m = twoEndpointManager();
    const vorhanden = { ...m, materialize: async () => claudeEp as ResolvedEndpoint | ApiError } as LlmEndpointManagerApi;
    const x = setup({ manager: vorhanden, choice: { endpointId: "lm" } });
    await x.resolver.resolve();
    expect(x.llm.source().reason).toBeUndefined();
  });
  it("models() mit Manager: trägt die Auflösung keine Modelltabelle, fragt der Adapter den Manager nach der Liste des aktiven Endpunkts (sonst stünde dort „keine Modelle gemeldet“)", async () => {
    const m = twoEndpointManager();
    const ohneTabelle = { ...m, resolve: async () => ({ id: "lm", label: "LM Studio", config: { url: "http://lm" }, defaultModel: "qwen" }) as ResolvedEndpoint, materialize: async () => ({ id: "lm", label: "LM Studio", config: { url: "http://lm" }, defaultModel: "qwen" }) as ResolvedEndpoint } as LlmEndpointManagerApi;
    const x = setup({ manager: ohneTabelle, choice: { endpointId: "lm" } });
    expect(await x.llm.models()).toEqual({ models: ["qwen", "gemma"], reachable: true });
    expect(x.probes).toEqual([]);                                   // kein Abruf mit Bearer am Endpunkt selbst, der Manager kennt den Weg
  });
  it("models() mit Manager: die Tabelle der Auflösung gewinnt, der Manager wird nicht zusätzlich gefragt", async () => {
    let gefragt = 0;
    const m = { ...fakeManager(), models: async () => { gefragt += 1; return ["nie"]; } } as LlmEndpointManagerApi;
    const x = setup({ manager: m, choice: { endpointId: "claude" } });
    expect((await x.llm.models()).models).toEqual(["claude-sonnet-5-5", "claude-haiku-5-5"]);
    expect(gefragt).toBe(0);
  });
});
