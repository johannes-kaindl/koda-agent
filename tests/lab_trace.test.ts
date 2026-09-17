import { describe, it, expect } from "vitest";
import { toLabMessages, describeLlmFailure, readNotePathOf } from "../src/core/agent/lab-trace";

describe("toLabMessages", () => {
  it("laesst system/user/assistant unangetastet, nur role und content", () => {
    const out = toLabMessages([
      { role: "system", content: "Regeln" },
      { role: "user", content: "Frage" },
      { role: "assistant", content: "Antwort", toolCalls: [{ id: "c1", name: "read_note", arguments: "{}" }] },
    ]);
    expect(out).toEqual([
      { role: "system", content: "Regeln" },
      { role: "user", content: "Frage" },
      { role: "assistant", content: "Antwort" },
    ]);
  });

  it("filtert tool-Nachrichten heraus — llm-lab kennt diese Rolle nicht", () => {
    const out = toLabMessages([
      { role: "user", content: "Frage" },
      { role: "tool", content: "Ergebnis", toolCallId: "c1" },
      { role: "assistant", content: "Antwort" },
    ]);
    expect(out).toEqual([
      { role: "user", content: "Frage" },
      { role: "assistant", content: "Antwort" },
    ]);
  });
});

describe("describeLlmFailure", () => {
  it("kombiniert kind und detail zu einer Zeile", () => {
    expect(describeLlmFailure({ kind: "timeout", detail: "keine Antwort seit 120s" }))
      .toBe("timeout: keine Antwort seit 120s");
  });
});

describe("readNotePathOf", () => {
  it("liest den Pfad aus einem read_note-Aufruf", () => {
    expect(readNotePathOf({ id: "c1", name: "read_note", arguments: '{"path":"Notes/A.md"}' }))
      .toBe("Notes/A.md");
  });

  it("liefert null fuer andere Werkzeuge", () => {
    expect(readNotePathOf({ id: "c1", name: "search_notes", arguments: '{"query":"x"}' })).toBeNull();
  });

  it("liefert null bei kaputtem JSON statt zu werfen", () => {
    expect(readNotePathOf({ id: "c1", name: "read_note", arguments: "{" })).toBeNull();
  });

  it("liefert null, wenn path fehlt oder leer ist", () => {
    expect(readNotePathOf({ id: "c1", name: "read_note", arguments: "{}" })).toBeNull();
    expect(readNotePathOf({ id: "c1", name: "read_note", arguments: '{"path":""}' })).toBeNull();
  });
});
