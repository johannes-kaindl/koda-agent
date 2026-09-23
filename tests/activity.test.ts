import { describe, it, expect } from "vitest";
import { nextActivity, IDLE, type Activity, type ActivityEvent } from "../src/core/chat/activity";

function run(events: ActivityEvent[]): Activity {
  return events.reduce(nextActivity, IDLE);
}

describe("nextActivity — Grundzustaende", () => {
  it("im Ruhezustand ist nichts zu melden", () => {
    expect(IDLE).toEqual({ busy: false, labelKey: "", labelArg: "" });
  });

  it("Absenden heisst zunaechst: denkt nach", () => {
    expect(run([{ kind: "ask" }])).toEqual({ busy: true, labelKey: "activity.thinking", labelArg: "" });
  });

  it("ein Reasoning-Token heisst weiterhin: denkt nach", () => {
    expect(run([{ kind: "ask" }, { kind: "reasoning" }]).labelKey).toBe("activity.thinking");
  });

  it("ein Antwort-Token heisst: schreibt", () => {
    expect(run([{ kind: "ask" }, { kind: "token" }])).toEqual({ busy: true, labelKey: "activity.writing", labelArg: "" });
  });

  it("Abschluss raeumt in den Ruhezustand zurueck", () => {
    expect(run([{ kind: "ask" }, { kind: "token" }, { kind: "done" }])).toEqual(IDLE);
  });

  it("Verdichtung meldet sich als eigene Taetigkeit", () => {
    expect(run([{ kind: "ask" }, { kind: "summarizing" }]).labelKey).toBe("activity.summarizing");
  });
});

describe("nextActivity — Werkzeuge nennen, was sie tun", () => {
  it("search_notes nennt den Suchbegriff", () => {
    expect(run([{ kind: "ask" }, { kind: "tool-start", name: "search_notes", args: '{"query":"Stress"}' }])).toEqual({
      busy: true,
      labelKey: "activity.tool.search_notes",
      labelArg: "Stress",
    });
  });

  it("read_note nennt den Pfad", () => {
    const a = run([{ kind: "ask" }, { kind: "tool-start", name: "read_note", args: '{"path":"Projekte/Plan.md"}' }]);
    expect(a).toEqual({ busy: true, labelKey: "activity.tool.read_note", labelArg: "Projekte/Plan.md" });
  });

  it("list_notes nennt den Ordner", () => {
    expect(run([{ kind: "ask" }, { kind: "tool-start", name: "list_notes", args: '{"folder":"Projekt/_Tasks"}' }]).labelArg).toBe("Projekt/_Tasks");
  });

  it("write_note nennt den Pfad", () => {
    expect(run([{ kind: "ask" }, { kind: "tool-start", name: "write_note", args: '{"path":"Koda/Notiz.md","content":"x","mode":"create"}' }])).toEqual({
      busy: true,
      labelKey: "activity.tool.write_note",
      labelArg: "Koda/Notiz.md",
    });
  });

  it("write_skill nennt den Skill-Namen", () => {
    expect(run([{ kind: "ask" }, { kind: "tool-start", name: "write_skill", args: '{"name":"aufraeumen","description":"d","body":"b","mode":"create"}' }]).labelArg).toBe("aufraeumen");
  });

  it("related_notes nennt den Pfad", () => {
    expect(run([{ kind: "ask" }, { kind: "tool-start", name: "related_notes", args: '{"path":"A.md"}' }]).labelKey).toBe("activity.tool.related_notes");
  });

  it("save_memory hat kein sinnvoll kurzes Argument und nennt keines", () => {
    expect(run([{ kind: "ask" }, { kind: "tool-start", name: "save_memory", args: '{"text":"ein langer Merksatz"}' }])).toEqual({
      busy: true,
      labelKey: "activity.tool.save_memory",
      labelArg: "",
    });
  });

  it("tool-call-head: Koda schreibt schon den Tool-Aufruf, bevor die Argumente da sind", () => {
    expect(run([{ kind: "ask" }, { kind: "tool-call-head", name: "write_note" }])).toEqual({
      busy: true,
      labelKey: "activity.writingToolCall",
      labelArg: "write_note",
    });
  });

  it("nach dem Werkzeug denkt Koda wieder nach", () => {
    const a = run([
      { kind: "ask" },
      { kind: "tool-start", name: "search_notes", args: '{"query":"Stress"}' },
      { kind: "tool-end" },
    ]);
    expect(a).toEqual({ busy: true, labelKey: "activity.thinking", labelArg: "" });
  });
});

// Die Zeile darf nie leer bleiben, nur weil das Modell etwas Unerwartetes schickt.
describe("nextActivity — unerwartete Eingaben kosten die Beschriftung, nicht die Anzeige", () => {
  it("unbekanntes Werkzeug faellt auf seinen Namen zurueck", () => {
    expect(run([{ kind: "ask" }, { kind: "tool-start", name: "frobnicate", args: "{}" }])).toEqual({
      busy: true,
      labelKey: "activity.tool.generic",
      labelArg: "frobnicate",
    });
  });

  it("kaputtes JSON in den Argumenten faellt auf den Werkzeugnamen zurueck", () => {
    expect(run([{ kind: "ask" }, { kind: "tool-start", name: "search_notes", args: "{nicht: json" }])).toEqual({
      busy: true,
      labelKey: "activity.tool.generic",
      labelArg: "search_notes",
    });
  });

  it("fehlendes Pflichtfeld ebenso", () => {
    expect(run([{ kind: "ask" }, { kind: "tool-start", name: "read_note", args: '{"pfad":"A.md"}' }])).toEqual({
      busy: true,
      labelKey: "activity.tool.generic",
      labelArg: "read_note",
    });
  });

  it("ein sehr langes Argument wird gekappt, damit die Zeile nicht die Sidebar sprengt", () => {
    const long = "x".repeat(120);
    const a = run([{ kind: "ask" }, { kind: "tool-start", name: "search_notes", args: JSON.stringify({ query: long }) }]);
    expect(a.labelArg.length).toBeLessThanOrEqual(41);
    expect(a.labelArg.endsWith("…")).toBe(true);
  });

  it("ein nicht-textliches Argument wird nicht als Text ausgegeben", () => {
    expect(run([{ kind: "ask" }, { kind: "tool-start", name: "search_notes", args: '{"query":42}' }]).labelKey).toBe("activity.tool.generic");
  });
});

describe("nextActivity — ganze Runden", () => {
  it("Werkzeug, Antwort, Abschluss", () => {
    expect(
      run([
        { kind: "ask" },
        { kind: "tool-start", name: "search_notes", args: '{"query":"Stress"}' },
        { kind: "tool-end" },
        { kind: "token" },
        { kind: "done" },
      ]),
    ).toEqual(IDLE);
  });

  it("zwei Werkzeugrunden hintereinander melden beide ihr Werkzeug", () => {
    const a = run([
      { kind: "ask" },
      { kind: "tool-start", name: "search_notes", args: '{"query":"A"}' },
      { kind: "tool-end" },
      { kind: "token" },
      { kind: "tool-start", name: "read_note", args: '{"path":"B.md"}' },
    ]);
    expect(a).toEqual({ busy: true, labelKey: "activity.tool.read_note", labelArg: "B.md" });
  });

  it("done raeumt aus JEDEM Zwischenzustand auf", () => {
    for (const mid of [
      { kind: "tool-start", name: "search_notes", args: '{"query":"A"}' },
      { kind: "summarizing" },
      { kind: "reasoning" },
    ] as ActivityEvent[]) {
      expect(run([{ kind: "ask" }, mid, { kind: "done" }])).toEqual(IDLE);
    }
  });
});
