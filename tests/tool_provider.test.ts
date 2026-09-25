import { describe, it, expect } from "vitest";
import {
  isToolProviderApi,
  mountProviderTools,
  outcomeFromProvider,
  type ProviderToolDef,
  type ToolProviderApi,
} from "../src/core/tools/provider";
import type { ToolDef } from "../src/core/tools/defs";

const def = (name: string, writes = false): ProviderToolDef => ({
  name,
  description: `Werkzeug ${name}`,
  parameters: { type: "object", properties: {}, required: [] },
  writes,
});

const provider = (tools: ProviderToolDef[]): ToolProviderApi => ({
  tools: () => tools,
  execute: async () => ({ ok: true, content: "" }),
});

describe("isToolProviderApi — Form-Pruefung statt Vorhandensein", () => {
  it("nimmt ein Objekt mit tools() und execute() an, dessen Definitionen vollstaendig sind", () => {
    expect(isToolProviderApi(provider([def("a")]))).toBe(true);
  });
  it("nimmt einen Anbieter ohne Werkzeuge an (leer ohne Index ist ein gueltiger Zustand)", () => {
    expect(isToolProviderApi(provider([]))).toBe(true);
  });
  it("lehnt ab, wenn tools oder execute fehlt", () => {
    expect(isToolProviderApi({ tools: () => [] })).toBe(false);
    expect(isToolProviderApi({ execute: async () => ({ ok: true, content: "" }) })).toBe(false);
  });
  it("lehnt Definitionen ohne writes-Kennzeichen ab — calendar-notes 0.2.1 in heutiger Form", () => {
    const ohneWrites = { name: "event_create", description: "x", parameters: { type: "object", properties: {}, required: [] } };
    expect(isToolProviderApi({ tools: () => [ohneWrites], execute: async () => ({ ok: true, content: "" }) })).toBe(false);
  });
  it("lehnt ab, wenn tools() kein Array liefert oder wirft", () => {
    expect(isToolProviderApi({ tools: () => "nein", execute: async () => ({ ok: true, content: "" }) })).toBe(false);
    expect(isToolProviderApi({ tools: () => { throw new Error("kaputt"); }, execute: async () => ({ ok: true, content: "" }) })).toBe(false);
  });
  it("faellt bei Nicht-Objekten auf false statt zu werfen", () => {
    for (const bad of [null, undefined, 3, "api", []]) expect(isToolProviderApi(bad)).toBe(false);
  });
});

describe("mountProviderTools — Stern statt Netz, Name ist Wire-Identitaet", () => {
  const host: ToolDef[] = [
    { name: "search_notes", description: "s", parameters: {} },
    { name: "read_note", description: "r", parameters: {} },
  ];

  it("haengt Anbieter-Werkzeuge hinter die Wirts-Werkzeuge und merkt sich die Route", () => {
    const m = mountProviderTools(host, [{ id: "vault-retrieval", tools: [def("semantic_search"), def("related_notes")] }]);
    expect(m.defs.map((d) => d.name)).toEqual(["search_notes", "read_note", "semantic_search", "related_notes"]);
    expect(m.routes.get("related_notes")).toBe("vault-retrieval");
    expect(m.routes.has("search_notes")).toBe(false);
    expect(m.skipped).toEqual([]);
  });

  it("montiert unveraendert — Beschreibung und Parameter des Anbieters bleiben, writes wird nicht auf den Draht gelegt", () => {
    const d = def("semantic_search");
    const m = mountProviderTools(host, [{ id: "p", tools: [d] }]);
    const montiert = m.defs[2];
    expect(montiert).toEqual({ name: d.name, description: d.description, parameters: d.parameters });
    expect("writes" in montiert).toBe(false);
  });

  it("laesst bei Kollision mit einem Wirts-Werkzeug den Wirt gewinnen und meldet den Anbieter", () => {
    const m = mountProviderTools(host, [{ id: "p", tools: [def("read_note")] }]);
    expect(m.defs.map((d) => d.name)).toEqual(["search_notes", "read_note"]);
    expect(m.skipped).toEqual([{ name: "read_note", providerId: "p", reason: "collision-host" }]);
  });

  it("laesst bei Kollision zweier Anbieter den ersten gewinnen und meldet den zweiten", () => {
    const m = mountProviderTools(host, [
      { id: "erster", tools: [def("list_events")] },
      { id: "zweiter", tools: [def("list_events")] },
    ]);
    expect(m.routes.get("list_events")).toBe("erster");
    expect(m.skipped).toEqual([{ name: "list_events", providerId: "zweiter", reason: "collision-provider" }]);
  });

  it("merkt sich, welche montierten Werkzeuge schreiben", () => {
    const m = mountProviderTools(host, [{ id: "p", tools: [def("list_events"), def("create_event", true)] }]);
    expect(m.writes.has("create_event")).toBe(true);
    expect(m.writes.has("list_events")).toBe(false);
  });

  it("gibt bei keinem Anbieter die Wirts-Liste als Kopie zurueck", () => {
    const m = mountProviderTools(host, []);
    expect(m.defs).toEqual(host);
    expect(m.defs).not.toBe(host);
  });
});

describe("outcomeFromProvider — Anbieter-Ergebnis wird zum Tool-Ergebnis des Loops", () => {
  it("reicht content durch", () => {
    expect(outcomeFromProvider({ ok: true, content: "3 Treffer" })).toEqual({ ok: true, content: "3 Treffer" });
  });
  it("nimmt bei Fehlern die modellgerichtete message des Anbieters", () => {
    expect(outcomeFromProvider({ ok: false, reason: "unavailable", detail: "offline", message: "Endpunkt nicht erreichbar." }))
      .toEqual({ ok: false, error: "Endpunkt nicht erreichbar." });
  });
  it("laesst bei not-indexed den Wirt einen Satz VOR die message setzen, ersetzt sie nicht", () => {
    const r = outcomeFromProvider(
      { ok: false, reason: "not-indexed", path: "a.md", message: "a.md ist nicht im Index." },
      { notIndexedPrefix: (p) => `${p} hat nur Frontmatter.` },
    );
    expect(r).toEqual({ ok: false, error: "a.md hat nur Frontmatter. a.md ist nicht im Index." });
  });
  it("faellt bei einer Antwort ohne message auf einen generischen Satz mit reason zurueck", () => {
    expect(outcomeFromProvider({ ok: false, reason: "failed" } as never)).toEqual({ ok: false, error: "Anbieter-Werkzeug fehlgeschlagen (failed)" });
  });
  it("faellt bei einer Antwort, die kein Objekt ist, auf einen Fehler zurueck statt zu werfen", () => {
    expect(outcomeFromProvider(undefined as never).ok).toBe(false);
  });
});
