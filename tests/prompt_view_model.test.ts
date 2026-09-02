import { describe, it, expect } from "vitest";
import { promptRow, toolRows } from "../src/core/prompt/view-model";
import { DEFAULT_RULES } from "../src/core/prompt/rules";

describe("promptRow", () => {
  const leer = { systemPromptOverride: "", toolsDisabled: [] };

  it("zeigt den Auslieferungsstand als Platzhalter und laesst den Wert leer", () => {
    const m = promptRow(leer, false);
    expect(m.value).toBe("");
    expect(m.placeholder).toBe(DEFAULT_RULES);
  });
  it("gibt den Override als Wert zurueck, der Platzhalter bleibt der Auslieferungsstand", () => {
    const m = promptRow({ ...leer, systemPromptOverride: "Sei knapp. {{sprache}} {{ordner}} tools" }, false);
    expect(m.value).toBe("Sei knapp. {{sprache}} {{ordner}} tools");
    expect(m.placeholder).toBe(DEFAULT_RULES);
  });
  it("warnt nicht beim Auslieferungsstand", () => {
    expect(promptRow(leer, false).warnings).toEqual([]);
  });
  it("prueft den Auslieferungsstand, wenn kein Override da ist — nicht den leeren String", () => {
    // Sonst meldete ein leeres Feld sofort no-tools und missing-placeholder.
    expect(promptRow(leer, false).warnings).not.toContain("no-tools");
  });
  it("warnt, wenn der Override keine Werkzeuge erwaehnt", () => {
    expect(promptRow({ ...leer, systemPromptOverride: "Sei knapp. {{sprache}} {{ordner}}" }, false).warnings)
      .toEqual(["no-tools"]);
  });
  it("warnt, wenn kein lesendes Werkzeug uebrig ist", () => {
    const m = promptRow({ systemPromptOverride: "", toolsDisabled: ["search_notes", "read_note", "list_notes", "get_workspace"] }, false);
    expect(m.warnings).toEqual(["no-reading-tool"]);
  });
  it("zaehlt related_notes nur als lesendes Werkzeug, wenn ein Index da ist", () => {
    const aus = { systemPromptOverride: "", toolsDisabled: ["search_notes", "read_note", "list_notes", "get_workspace"] };
    expect(promptRow(aus, true).warnings).toEqual([]);
    expect(promptRow(aus, false).warnings).toEqual(["no-reading-tool"]);
  });
});

describe("toolRows", () => {
  const leer = { toolsDisabled: [], toolDescriptions: {} };

  it("fuehrt jedes Werkzeug, auch related_notes ohne Index", () => {
    const rows = toolRows(leer, false);
    expect(rows).toHaveLength(9);
    expect(rows.map((r) => r.name)).toContain("related_notes");
  });
  it("markiert related_notes ohne Index als nicht verfuegbar — und sonst nichts", () => {
    const rows = toolRows(leer, false);
    expect(rows.find((r) => r.name === "related_notes")?.unavailable).toBe(true);
    expect(rows.filter((r) => r.unavailable)).toHaveLength(1);
    expect(toolRows(leer, true).filter((r) => r.unavailable)).toHaveLength(0);
  });
  it("zeigt die ausgelieferte Beschreibung als Platzhalter, eigene als Wert", () => {
    const rows = toolRows({ toolsDisabled: [], toolDescriptions: { read_note: "Liest." } }, false);
    const r = rows.find((x) => x.name === "read_note");
    expect(r?.placeholder).toContain("Read the full content");
    expect(r?.own).toBe("Liest.");
  });
  it("laesst own leer, wenn keine eigene Beschreibung da ist", () => {
    expect(toolRows(leer, false).find((r) => r.name === "read_note")?.own).toBe("");
  });
  it("bildet den Schalter-Zustand ab", () => {
    const rows = toolRows({ toolsDisabled: ["write_note"], toolDescriptions: {} }, false);
    expect(rows.find((r) => r.name === "write_note")?.enabled).toBe(false);
    expect(rows.find((r) => r.name === "read_note")?.enabled).toBe(true);
  });
  it("zeigt im Platzhalter IMMER die ausgelieferte Beschreibung, nie die eigene", () => {
    // Sonst saehe der Nutzer nach dem Leeren des Feldes seinen eigenen Text als Vorgabe
    // und koennte den Auslieferungsstand nie mehr nachlesen.
    const rows = toolRows({ toolsDisabled: [], toolDescriptions: { read_note: "Liest." } }, false);
    expect(rows.find((r) => r.name === "read_note")?.placeholder).not.toBe("Liest.");
  });
});
