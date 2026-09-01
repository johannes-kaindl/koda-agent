import { describe, it, expect } from "vitest";
import { activeReadingTools } from "../src/core/prompt/effective";

describe("activeReadingTools", () => {
  it("zaehlt die drei festen lesenden Werkzeuge", () => {
    expect(activeReadingTools([], false)).toEqual(["search_notes", "read_note", "list_notes"]);
  });
  it("zaehlt related_notes nur mit Index", () => {
    expect(activeReadingTools([], true)).toContain("related_notes");
  });
  it("laesst Abgeschaltete weg", () => {
    expect(activeReadingTools(["search_notes", "list_notes"], false)).toEqual(["read_note"]);
  });
  it("wird leer, wenn alle abgeschaltet sind — das ist der Warnfall", () => {
    expect(activeReadingTools(["search_notes", "read_note", "list_notes", "related_notes"], true)).toEqual([]);
  });
  it("laesst sich von einem abgeschalteten Schreibwerkzeug nicht beirren", () => {
    expect(activeReadingTools(["write_note"], false)).toHaveLength(3);
  });
});
