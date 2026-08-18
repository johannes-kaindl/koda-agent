import { splitTurns, buildSummaryPrompt, summarizeTurns, makeStage2Record, PACK_RATIO } from "../src/core/agent/compaction/stage2";
import type { ChatMessage } from "../src/core/agent/types";

const sys: ChatMessage = { role: "system", content: "SYS" };
const u = (c: string): ChatMessage => ({ role: "user", content: c });
const a = (c: string): ChatMessage => ({ role: "assistant", content: c });
const tool = (id: string, c: string): ChatMessage => ({ role: "tool", toolCallId: id, content: c });

describe("splitTurns", () => {
  it("trennt System-Praefix, abgeschlossene Runden und die laufende", () => {
    const { completed, current } = splitTurns([sys, u("F1"), a("A1"), u("F2"), tool("c", "x"), a("A2"), u("F3"), a("laeuft")]);
    expect(completed).toEqual([[u("F1"), a("A1")], [u("F2"), tool("c", "x"), a("A2")]]);
    expect(current).toEqual([u("F3"), a("laeuft")]);
  });
  it("nur eine Runde: nichts abgeschlossen", () => {
    expect(splitTurns([sys, u("F1"), a("x")]).completed).toEqual([]);
  });
});

describe("buildSummaryPrompt", () => {
  it("englischer Prompt mit Sprachanweisung, Laengengrenze und Behalte/Lass-weg-Liste", () => {
    const p = buildSummaryPrompt("de", 800, null);
    expect(p).toMatch(/Write the summary in German/);
    expect(p).toMatch(/800 characters/);
    expect(p).toMatch(/decisions/i);
    expect(p).toMatch(/paths/i);
    expect(p).not.toMatch(/Summary so far/);
  });
  it("traegt eine Zwischen-Zusammenfassung im System-Prompt weiter (nicht als zweite user-Nachricht)", () => {
    expect(buildSummaryPrompt("en", 800, "CARRY")).toMatch(/Summary so far[\s\S]*CARRY/);
  });
});

describe("summarizeTurns (rollend)", () => {
  const turn = (i: number, size: number): ChatMessage[] => [u(`F${i}`), a("y".repeat(size))];

  it("Normalfall: EIN Aufruf, System-Prompt + Runden + abschliessende user-Anweisung", async () => {
    const calls: ChatMessage[][] = [];
    const out = await summarizeTurns([turn(1, 100), turn(2, 100)], {
      lang: "de", maxChars: 500, packChars: 5000,
      summarize: async (m) => { calls.push(m); return " ZF "; },
    });
    expect(out).toBe("ZF");
    expect(calls).toHaveLength(1);
    expect(calls[0][0].role).toBe("system");
    expect(calls[0][calls[0].length - 1]).toMatchObject({ role: "user" });
    expect(calls[0].filter((m) => m.role === "user").map((m) => m.content)).toEqual(["F1", "F2", expect.stringMatching(/summary/i)]);
  });

  it("Riesenverlauf: mehrere Aufrufe, jeder unter packChars, Zwischenstand wandert in den naechsten Prompt", async () => {
    const calls: ChatMessage[][] = [];
    let n = 0;
    const out = await summarizeTurns([turn(1, 400), turn(2, 400), turn(3, 400)], {
      lang: "en", maxChars: 500, packChars: 900,
      summarize: async (m) => { calls.push(m); n++; return `ZF${n}`; },
    });
    expect(calls.length).toBeGreaterThan(1);
    expect(out).toBe(`ZF${n}`);
    expect(calls[1][0].content).toContain("ZF1");
    // Eine Runde, die allein ueber packChars liegt, wird trotzdem allein geschickt (kein Endlos-Loop)
  });

  it("liefert null, wenn ein Aufruf nichts Brauchbares liefert — dann kein Record", async () => {
    expect(await summarizeTurns([turn(1, 10)], { lang: "de", maxChars: 500, packChars: 5000, summarize: async () => null })).toBeNull();
    expect(await summarizeTurns([turn(1, 10)], { lang: "de", maxChars: 500, packChars: 5000, summarize: async () => "   " })).toBeNull();
  });
  it("PACK_RATIO ist 0.6", () => { expect(PACK_RATIO).toBe(0.6); });
});

describe("makeStage2Record", () => {
  it("zaehlt Runden und Zeichen der Nicht-Nutzer-Anteile", () => {
    const rec = makeStage2Record([[u("F1"), a("abcd")], [u("F2"), tool("c", "xy"), a("z")]], "ZF", 3, "T");
    expect(rec).toEqual({ kind: "compaction", stage: 2, at: "T", keepToolResults: 3, summary: "ZF", turns: 2, stats: { stubbed: 0, bytes: 7 } });
    expect(makeStage2Record([[u("F")]], "ZF", 3, "T", true).forced).toBe(true);
  });
});
