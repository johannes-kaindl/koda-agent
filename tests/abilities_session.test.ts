import { describeStateChange, latestSessionState, sessionForNewChat } from "../src/core/abilities/session";
import { emptyOverlay, emptySessionState, type SessionState } from "../src/core/abilities/types";
import { parseLines, serializeLine } from "../src/core/memory/session";
import type { LogEntry } from "../src/core/agent/types";

const st = (o: Partial<SessionState> = {}): SessionState => ({ ...emptySessionState(), ...o });

describe("Sitzungs-Marke im Verlauf", () => {
  it("übersteht Schreiben und Lesen des JSONL, eine kaputte Marke kostet nur die Marke", () => {
    const rec: LogEntry = { kind: "session", at: "2026-10-17T01:00:00Z", state: st({ arbeit: "Inbox", manual: ["A.md"] }) };
    const text = serializeLine(rec) + JSON.stringify({ kind: "session", at: "x", state: { arbeit: 3 } }) + "\n" + serializeLine({ role: "user", content: "hi" });
    const back = parseLines(text);
    expect(back).toEqual([rec, { role: "user", content: "hi" }]);
  });

  it("latestSessionState nimmt die jüngste Marke", () => {
    const log: LogEntry[] = [
      { kind: "session", at: "1", state: st({ arbeit: "A" }) },
      { role: "user", content: "q" },
      { kind: "session", at: "2", state: st({ arbeit: "B" }) },
      { role: "assistant", content: "a" },
    ];
    expect(latestSessionState(log)?.arbeit).toBe("B");
    expect(latestSessionState([{ role: "user", content: "q" }])).toBeNull();
  });
});

describe("sessionForNewChat", () => {
  it("mit Arbeit: Overlay und manuelle Notizen leer, die Arbeit bleibt", () => {
    const s = st({ arbeit: "Inbox", manual: ["A.md"], overlay: { ...emptyOverlay(), skills: { a: "ganz" }, kontext: { modus: "note" } } });
    expect(sessionForNewChat(s)).toEqual({ arbeit: "Inbox", overlay: emptyOverlay(), manual: [] });
  });

  it("ohne Arbeit überlebt der Kontext-Teil des Overlays (wie heute der Modus)", () => {
    const s = st({ overlay: { ...emptyOverlay(), skills: { a: "ganz" }, kontext: { modus: "tabs", tiefe: 2 } } });
    expect(sessionForNewChat(s).overlay).toEqual({ ...emptyOverlay(), kontext: { modus: "tabs", tiefe: 2 } });
  });
});

describe("describeStateChange", () => {
  it("nennt Arbeit und neue Overlay-Werte, null wenn nichts geändert ist", () => {
    const a = st({ arbeit: "Inbox", overlay: { ...emptyOverlay(), skills: { "inbox-triage": "ganz" } } });
    expect(describeStateChange(null, a, "de")).toBe("Arbeit: Inbox · inbox-triage: ganz");
    expect(describeStateChange(a, a, "de")).toBeNull();
  });

  it("ein entfernter Eintrag heißt zurückgesetzt; nach einem Arbeitswechsel zählt das alte Overlay nicht", () => {
    const a = st({ overlay: { ...emptyOverlay(), skills: { x: "aus" }, werkzeuge: { write_skill: "aus" } } });
    const b = st({ overlay: { ...emptyOverlay(), werkzeuge: { write_skill: "aus" } } });
    expect(describeStateChange(a, b, "en")).toBe("x: reset");
    expect(describeStateChange(a, st({ arbeit: "Inbox" }), "de")).toBe("Arbeit: Inbox");
  });
});
