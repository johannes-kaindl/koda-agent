import { describe, it, expect } from "vitest";
import { toolDefs, TOOL_DEFS } from "../src/core/tools/defs";

describe("toolDefs", () => {
  it("enthaelt ohne Retrieval genau die bisherigen Werkzeuge", () => {
    const names = toolDefs({ related: false }).map((t) => t.name);
    expect(names).toEqual(TOOL_DEFS.map((t) => t.name));
    expect(names).not.toContain("related_notes");
  });

  it("ergaenzt related_notes, wenn ein Index da ist", () => {
    const names = toolDefs({ related: true }).map((t) => t.name);
    expect(names).toContain("related_notes");
    expect(names).toHaveLength(TOOL_DEFS.length + 1);
  });

  it("beschreibt related_notes englisch wie die uebrigen und verlangt einen Pfad", () => {
    const d = toolDefs({ related: true }).find((t) => t.name === "related_notes");
    expect(d?.description).toMatch(/^[\x20-\x7E]+$/);
    expect((d?.parameters as { required: string[] }).required).toEqual(["path"]);
  });

  it("gibt eine eigene Liste zurueck — ein Aufrufer darf TOOL_DEFS nicht veraendern", () => {
    const list = toolDefs({ related: false });
    list.push({ name: "x", description: "x", parameters: {} });
    expect(TOOL_DEFS.map((t) => t.name)).not.toContain("x");
  });
});

describe("list_notes in den Tool-Defs", () => {
  it("ist Teil der festen Werkzeuge — auch ohne vault-rag", () => {
    const names = toolDefs({ related: false }).map((d) => d.name);
    expect(names).toContain("list_notes");
  });
  it("verlangt nur den Ordner", () => {
    const def = toolDefs({ related: false }).find((d) => d.name === "list_notes");
    expect((def?.parameters as { required: string[] }).required).toEqual(["folder"]);
  });
  it("grenzt search_notes gegen list_notes ab, damit die Wahl nicht dem Zufall ueberlassen bleibt", () => {
    const search = toolDefs({ related: false }).find((d) => d.name === "search_notes");
    expect(search?.description).toContain("list_notes");
  });
});
