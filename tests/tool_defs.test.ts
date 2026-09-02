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

describe("toolDefs mit Nutzer-Steuerung", () => {
  it("laesst abgeschaltete Werkzeuge weg — das Modell erfaehrt nichts von ihnen", () => {
    const names = toolDefs({ related: false, disabled: ["write_note", "save_memory"] }).map((d) => d.name);
    expect(names).not.toContain("write_note");
    expect(names).not.toContain("save_memory");
    expect(names).toContain("read_note");
  });
  it("schaltet auch related_notes ab", () => {
    const names = toolDefs({ related: true, disabled: ["related_notes"] }).map((d) => d.name);
    expect(names).not.toContain("related_notes");
  });
  it("ersetzt die Beschreibung, wenn eine eigene da ist", () => {
    const d = toolDefs({ related: false, descriptions: { read_note: "Liest eine Notiz. Sonst nichts." } })
      .find((x) => x.name === "read_note");
    expect(d?.description).toBe("Liest eine Notiz. Sonst nichts.");
  });
  it("nimmt bei leerer eigener Beschreibung den Auslieferungsstand (Spec E2)", () => {
    const d = toolDefs({ related: false, descriptions: { read_note: "   " } }).find((x) => x.name === "read_note");
    expect(d?.description).toContain("Read the full content");
  });
  it("ignoriert eine Beschreibung fuer ein Werkzeug, das es nicht gibt", () => {
    const list = toolDefs({ related: false, descriptions: { gibt_es_nicht: "x" } });
    expect(list.map((d) => d.name)).not.toContain("gibt_es_nicht");
  });
  it("veraendert TOOL_DEFS nicht — auch nicht ueber die ersetzte Beschreibung", () => {
    toolDefs({ related: false, descriptions: { read_note: "geaendert" } });
    expect(TOOL_DEFS.find((d) => d.name === "read_note")?.description).toContain("Read the full content");
  });
  it("bleibt ohne die neuen Angaben rueckwaertskompatibel", () => {
    expect(toolDefs({ related: false }).map((d) => d.name)).toEqual(TOOL_DEFS.map((d) => d.name));
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

describe("Arbeitskontext-Werkzeuge", () => {
  it("get_workspace und edit_active_note stehen in TOOL_DEFS, englisch und ASCII", () => {
    for (const name of ["get_workspace", "edit_active_note"]) {
      const d = TOOL_DEFS.find((t) => t.name === name);
      expect(d?.description).toMatch(/^[\x20-\x7E]+$/);
    }
  });
  it("edit_active_note verlangt Pfad, Modus und Text; der Modus ist ein Enum", () => {
    const d = TOOL_DEFS.find((t) => t.name === "edit_active_note")!;
    const p = d.parameters as { required: string[]; properties: { mode: { enum: string[] } } };
    expect(p.required).toEqual(["path", "mode", "text"]);
    expect(p.properties.mode.enum).toEqual(["replace_selection", "insert_at_cursor"]);
  });
  it("beide sind abschaltbar wie alle anderen", () => {
    const names = toolDefs({ related: false, disabled: ["get_workspace", "edit_active_note"] }).map((d) => d.name);
    expect(names).not.toContain("get_workspace");
    expect(names).not.toContain("edit_active_note");
  });
});
