import { describe, it, expect } from "vitest";
import { activeReadingTools, availableReadingTools } from "../src/core/prompt/effective";

describe("activeReadingTools", () => {
  it("zaehlt die vier festen lesenden Werkzeuge", () => {
    expect(activeReadingTools([], false)).toEqual(["search_notes", "read_note", "list_notes", "get_workspace"]);
  });
  it("zaehlt related_notes nur mit Index", () => {
    expect(activeReadingTools([], true)).toContain("related_notes");
  });
  it("laesst Abgeschaltete weg", () => {
    expect(activeReadingTools(["search_notes", "list_notes"], false)).toEqual(["read_note", "get_workspace"]);
  });
  it("wird leer, wenn alle abgeschaltet sind — das ist der Warnfall", () => {
    expect(activeReadingTools(["search_notes", "read_note", "list_notes", "get_workspace", "related_notes"], true)).toEqual([]);
  });
  it("laesst sich von einem abgeschalteten Schreibwerkzeug nicht beirren", () => {
    expect(activeReadingTools(["write_note"], false)).toHaveLength(4);
  });
});

describe("availableReadingTools", () => {
  it("nennt, was im aktuellen Zustand ueberhaupt angeboten werden koennte — unabhaengig von Abschaltungen", () => {
    expect(availableReadingTools(false)).toEqual(["search_notes", "read_note", "list_notes", "get_workspace"]);
    expect(availableReadingTools(true)).toContain("related_notes");
  });
});
