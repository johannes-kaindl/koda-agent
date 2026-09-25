import { describe, it, expect } from "vitest";
import { toolSet, toolDefs, TOOL_DEFS } from "../src/core/tools/defs";
import type { ProviderToolDef } from "../src/core/tools/provider";

const pdef = (name: string, writes = false): ProviderToolDef => ({
  name, description: `Anbieter: ${name}`, parameters: { type: "object", properties: {}, required: [] }, writes,
});

describe("toolSet — Wirts-Werkzeuge plus montierte Anbieter, eine Quelle fuer Liste und Route", () => {
  it("ohne Anbieter ist toolSet().defs dasselbe wie toolDefs()", () => {
    const opts = { related: true };
    expect(toolSet(opts).defs).toEqual(toolDefs(opts));
    expect(toolSet(opts).routes.size).toBe(0);
  });

  it("haengt Anbieter-Werkzeuge hinter die Wirts-Werkzeuge und routet sie", () => {
    const s = toolSet({ related: false, providers: [{ id: "vault-retrieval", tools: [pdef("semantic_search")] }] });
    expect(s.defs.map((d) => d.name)).toEqual([...TOOL_DEFS.map((d) => d.name), "semantic_search"]);
    expect(s.routes.get("semantic_search")).toBe("vault-retrieval");
  });

  it("montiert statt handgeschrieben: bietet ein Anbieter related_notes an, entfaellt Kodas eigene Definition", () => {
    const s = toolSet({ related: true, providers: [{ id: "vault-retrieval", tools: [pdef("related_notes")] }] });
    const related = s.defs.filter((d) => d.name === "related_notes");
    expect(related).toHaveLength(1);
    expect(related[0].description).toBe("Anbieter: related_notes");
    expect(s.routes.get("related_notes")).toBe("vault-retrieval");
    expect(s.skipped).toEqual([]);
  });

  it("ohne Anbieter-related_notes bleibt Kodas eigene Definition, solange ein Index da ist", () => {
    const s = toolSet({ related: true, providers: [{ id: "vault-retrieval", tools: [pdef("semantic_search")] }] });
    expect(s.defs.some((d) => d.name === "related_notes")).toBe(true);
    expect(s.routes.has("related_notes")).toBe(false);
  });

  it("Abschaltung und eigene Beschreibung des Nutzers gelten auch fuer montierte Werkzeuge", () => {
    const s = toolSet({
      related: false,
      providers: [{ id: "p", tools: [pdef("list_events"), pdef("create_event", true)] }],
      disabled: ["create_event"],
      descriptions: { list_events: "Meine Beschreibung" },
    });
    expect(s.defs.some((d) => d.name === "create_event")).toBe(false);
    expect(s.defs.find((d) => d.name === "list_events")?.description).toBe("Meine Beschreibung");
    // Die Route bleibt auch fuer ein abgeschaltetes Werkzeug bekannt: der Runner muss ein
    // halluziniertes create_event als "abgeschaltet" ablehnen, nicht als "unbekannt".
    expect(s.routes.get("create_event")).toBe("p");
    expect(s.writes.has("create_event")).toBe(true);
  });

  it("meldet eine Kollision mit einem Wirts-Werkzeug, statt sie zu montieren", () => {
    const s = toolSet({ related: false, providers: [{ id: "p", tools: [pdef("read_note")] }] });
    expect(s.defs.filter((d) => d.name === "read_note")).toHaveLength(1);
    expect(s.defs.find((d) => d.name === "read_note")?.description).not.toBe("Anbieter: read_note");
    expect(s.skipped).toEqual([{ name: "read_note", providerId: "p", reason: "collision-host" }]);
  });
});
