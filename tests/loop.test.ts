import { runAgent, type LoopLlm } from "../src/core/agent/loop";
import { isChatMessage, isCompactionRecord, type ChatMessage, type LogEntry, type ToolOutcome, type ToolRunner } from "../src/core/agent/types";
import { STUB_MIN_CHARS } from "../src/core/agent/compaction/project";
import type { LlmResult } from "../src/llm/KodaChatClient";

/** Nur die Nachrichten eines Laufs — Verdichtungs-Marken interessieren die Alt-Tests nicht. */
const msgsOf = (out: LogEntry[]): ChatMessage[] => out.filter(isChatMessage);

const sig = (): AbortSignal => new AbortController().signal;
const user: ChatMessage[] = [{ role: "user", content: "Frage" }];

/** LoopLlm, das eine Skript-Liste von Antworten abspielt. */
function scripted(results: LlmResult[]): LoopLlm {
  let i = 0;
  return { complete: async () => results[Math.min(i++, results.length - 1)] };
}

const okTools: ToolRunner = {
  run: async (name): Promise<ToolOutcome> => ({ ok: true, content: `ergebnis von ${name}` }),
};

describe("runAgent", () => {
  it("ohne Tool-Calls: final-Event + eine assistant-Nachricht", async () => {
    const events: string[] = [];
    const out = msgsOf(await runAgent(
      { llm: scripted([{ ok: true, content: "Antwort", toolCalls: [] }]), tools: okTools, maxRounds: 8, textFallback: false },
      user, () => {}, () => {}, (e) => events.push(e.kind), sig(),
    ));
    expect(events).toEqual(["final"]);
    expect(out).toEqual([{ role: "assistant", content: "Antwort" }]);
  });

  it("eine Tool-Runde: assistant(toolCalls) + tool + finale assistant-Nachricht", async () => {
    const events: string[] = [];
    const out = msgsOf(await runAgent(
      {
        llm: scripted([
          { ok: true, content: "", toolCalls: [{ id: "c1", name: "search_notes", arguments: '{"query":"x"}' }] },
          { ok: true, content: "Fertig", toolCalls: [] },
        ]),
        tools: okTools, maxRounds: 8, textFallback: false,
      },
      user, () => {}, () => {}, (e) => events.push(e.kind), sig(),
    ));
    expect(events).toEqual(["tool-start", "tool-end", "final"]);
    expect(out.map((m) => m.role)).toEqual(["assistant", "tool", "assistant"]);
    expect(out[1]).toMatchObject({ role: "tool", toolCallId: "c1", content: "ergebnis von search_notes" });
  });

  it("Tool-Fehler geht als ERROR-Result zurueck ans Modell, kein Crash", async () => {
    const failing: ToolRunner = { run: async () => ({ ok: false, error: "Pfad geblockt" }) };
    const out = msgsOf(await runAgent(
      {
        llm: scripted([
          { ok: true, content: "", toolCalls: [{ id: "c1", name: "read_note", arguments: "{}" }] },
          { ok: true, content: "Verstanden", toolCalls: [] },
        ]),
        tools: failing, maxRounds: 8, textFallback: false,
      },
      user, () => {}, () => {}, () => {}, sig(),
    ));
    expect(out[1].content).toBe("ERROR: Pfad geblockt");
  });

  it("werfendes Tool geht als ERROR-Result zurueck ans Modell, kein Crash", async () => {
    const throwing: ToolRunner = {
      run: async () => {
        throw new Error("kaputt");
      },
    };
    const out = msgsOf(await runAgent(
      {
        llm: scripted([
          { ok: true, content: "", toolCalls: [{ id: "c1", name: "read_note", arguments: "{}" }] },
          { ok: true, content: "Verstanden", toolCalls: [] },
        ]),
        tools: throwing, maxRounds: 8, textFallback: false,
      },
      user, () => {}, () => {}, () => {}, sig(),
    ));
    expect(out[1].content).toBe("ERROR: kaputt");
    expect(out.map((m) => m.role)).toEqual(["assistant", "tool", "assistant"]);
    expect(out[2]).toEqual({ role: "assistant", content: "Verstanden" });
  });

  it("eine Tool-Runde mit zwei nativen Tool-Calls: beide Tool-Nachrichten in Reihenfolge", async () => {
    const events: string[] = [];
    const out = msgsOf(await runAgent(
      {
        llm: scripted([
          {
            ok: true,
            content: "",
            toolCalls: [
              { id: "c1", name: "search_notes", arguments: '{"query":"x"}' },
              { id: "c2", name: "read_note", arguments: '{"path":"y"}' },
            ],
          },
          { ok: true, content: "Fertig", toolCalls: [] },
        ]),
        tools: okTools, maxRounds: 8, textFallback: false,
      },
      user, () => {}, () => {}, (e) => events.push(e.kind), sig(),
    ));
    expect(events).toEqual(["tool-start", "tool-end", "tool-start", "tool-end", "final"]);
    expect(out.map((m) => m.role)).toEqual(["assistant", "tool", "tool", "assistant"]);
    expect(out[1]).toMatchObject({ role: "tool", toolCallId: "c1", content: "ergebnis von search_notes" });
    expect(out[2]).toMatchObject({ role: "tool", toolCallId: "c2", content: "ergebnis von read_note" });
  });

  it("ungueltiges Argument-JSON wird zum Tool-Fehler, nicht zur Exception", async () => {
    const out = msgsOf(await runAgent(
      {
        llm: scripted([
          { ok: true, content: "", toolCalls: [{ id: "c1", name: "read_note", arguments: "{kaputt" }] },
          { ok: true, content: "Ok", toolCalls: [] },
        ]),
        tools: okTools, maxRounds: 8, textFallback: false,
      },
      user, () => {}, () => {}, () => {}, sig(),
    ));
    expect(out[1].content).toMatch(/^ERROR:/);
  });

  it("round-limit: nach maxRounds Tool-Runden kommt round-limit statt Endlosschleife", async () => {
    const events: string[] = [];
    await runAgent(
      {
        llm: scripted([{ ok: true, content: "", toolCalls: [{ id: "c", name: "search_notes", arguments: "{}" }] }]),
        tools: okTools, maxRounds: 2, textFallback: false,
      },
      user, () => {}, () => {}, (e) => events.push(e.kind), sig(),
    );
    expect(events.filter((k) => k === "tool-start")).toHaveLength(2);
    expect(events[events.length - 1]).toBe("round-limit");
  });

  it("LLM-Fehler: error-Event mit partial, Rueckgabe enthaelt den Teiltext als assistant", async () => {
    const events: { kind: string; partial?: string }[] = [];
    const out = msgsOf(await runAgent(
      { llm: scripted([{ ok: false, kind: "timeout", detail: "zu langsam", partial: "Teil" }]), tools: okTools, maxRounds: 8, textFallback: false },
      user, () => {}, () => {}, (e) => events.push(e as never), sig(),
    ));
    expect(events[0]).toMatchObject({ kind: "error", partial: "Teil", errorKind: "timeout" });
    expect(out).toEqual([{ role: "assistant", content: "Teil" }]);
  });

  it("Abort zwischen Tool-Calls: naechster Call laeuft nicht mehr, Loop stoppt sauber", async () => {
    const ctrl = new AbortController();
    let secondRan = false;
    const abortingTools: ToolRunner = {
      run: async (name): Promise<ToolOutcome> => {
        if (name === "search_notes") {
          ctrl.abort();
          return { ok: true, content: "ergebnis von search_notes" };
        }
        secondRan = true;
        return { ok: true, content: "sollte nie laufen" };
      },
    };
    const events: string[] = [];
    const out = msgsOf(await runAgent(
      {
        llm: scripted([
          {
            ok: true,
            content: "",
            toolCalls: [
              { id: "c1", name: "search_notes", arguments: "{}" },
              { id: "c2", name: "read_note", arguments: "{}" },
            ],
          },
          { ok: true, content: "Fertig", toolCalls: [] },
        ]),
        tools: abortingTools, maxRounds: 8, textFallback: false,
      },
      user, () => {}, () => {}, (e) => events.push(e.kind), ctrl.signal,
    ));
    expect(secondRan).toBe(false);
    expect(out.map((m) => m.role)).toEqual(["assistant", "tool"]);
    expect(events).toEqual(["tool-start", "tool-end", "error"]);
  });

  it("textFallback: erkennt JSON-Tool-Call im content, wenn keine nativen toolCalls kamen", async () => {
    const out = msgsOf(await runAgent(
      {
        llm: scripted([
          { ok: true, content: '{"tool":"search_notes","arguments":{"query":"x"}}', toolCalls: [] },
          { ok: true, content: "Fertig", toolCalls: [] },
        ]),
        tools: okTools, maxRounds: 8, textFallback: true,
      },
      user, () => {}, () => {}, () => {}, sig(),
    ));
    expect(out.map((m) => m.role)).toEqual(["assistant", "tool", "assistant"]);
  });
  it("meldet einen Tool-Call ohne Argumente als solchen, statt am ersten Pflichtfeld zu scheitern", async () => {
    const out = msgsOf(await runAgent(
      {
        llm: scripted([
          { ok: true, content: "", toolCalls: [{ id: "c1", name: "write_note", arguments: "" }] },
          { ok: true, content: "ok", toolCalls: [] },
        ]),
        tools: okTools, maxRounds: 8, textFallback: false,
      },
      user, () => {}, () => {}, () => {}, sig(),
    ));
    const toolMsg = out.find((m) => m.role === "tool");
    // Ein abgeschnittener Tool-Call ist etwas anderes als ein falsch befuelltes Feld — die
    // Rueckmeldung ans Modell muss das sagen, sonst korrigiert es am falschen Ende.
    expect(toolMsg?.content).toMatch(/ohne Argumente/i);
    expect(toolMsg?.content).toContain("write_note");
  });
});

const big = (tag: string): string => `${tag} ${"x".repeat(STUB_MIN_CHARS + 40)}`;
const compaction = (budgetTokens: number, keep = 3) => ({
  budgetTokens, keepToolResults: keep, overheadChars: 0, summarize: null, summaryMaxChars: 400, lang: "de" as const, now: () => "T",
});
const bigTools: ToolRunner = { run: async (name): Promise<ToolOutcome> => ({ ok: true, content: big(name) }) };
const readThenFinal = (n: number): LlmResult[] => [
  ...Array.from({ length: n }, (_, i): LlmResult => ({ ok: true, content: "", toolCalls: [{ id: `c${i}`, name: "read_note", arguments: `{"path":"N${i}.md"}` }] })),
  { ok: true, content: "Fertig", toolCalls: [] },
];

describe("runAgent · Verdichtung (proaktiv)", () => {
  it("ohne compaction-Dep: keine Records, Bestandsverhalten", async () => {
    const out = await runAgent(
      { llm: scripted(readThenFinal(4)), tools: bigTools, maxRounds: 8, textFallback: false },
      user, () => {}, () => {}, () => {}, sig(),
    );
    expect(out.some(isCompactionRecord)).toBe(false);
  });

  it("ueber Budget: Stufe-1-Record im Rueckgabekanal, compaction-Event, das Modell sieht Stubs", async () => {
    const seen: ChatMessage[][] = [];
    const scriptedResults = readThenFinal(4);
    const llm: LoopLlm = { complete: async (m) => { seen.push(m); return scriptedResults[Math.min(seen.length - 1, scriptedResults.length - 1)]; } };
    const events: string[] = [];
    // Budget so klein, dass nach zwei grossen Ergebnissen verdichtet werden muss, K=1
    const out = await runAgent(
      { llm, tools: bigTools, maxRounds: 8, textFallback: false, compaction: compaction(150, 1) },
      user, () => {}, () => {}, (e) => events.push(e.kind), sig(),
    );
    const recs = out.filter(isCompactionRecord);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0]).toMatchObject({ stage: 1, keepToolResults: 1 });
    expect(events).toContain("compaction");
    // Im letzten Aufruf ans Modell sind aeltere Tool-Ergebnisse Stubs, das juengste nicht
    const last = seen[seen.length - 1];
    const tools = last.filter((m) => m.role === "tool");
    expect(tools[tools.length - 1].stubbed).toBeUndefined();
    expect(tools.slice(0, -1).some((m) => m.stubbed === true)).toBe(true);
    // Reihenfolge: Record steht VOR den Nachrichten der Runde, in der er entstand
    const firstRec = out.findIndex(isCompactionRecord);
    expect(out[firstRec + 1]).toMatchObject({ role: "assistant" });
  });

  it("unter Budget: kein Record", async () => {
    const out = await runAgent(
      { llm: scripted(readThenFinal(2)), tools: bigTools, maxRounds: 8, textFallback: false, compaction: compaction(100_000) },
      user, () => {}, () => {}, () => {}, sig(),
    );
    expect(out.some(isCompactionRecord)).toBe(false);
  });
});

describe("runAgent · Verdichtung (reaktiv)", () => {
  const overflow: LlmResult = { ok: false, kind: "overflow", detail: "maximum context length is 8192", partial: "" };

  it("erster Ueberlauf: erzwungene Stufe 1 mit K=0 (forced), dieselbe Runde wiederholt, dann ok", async () => {
    let n = 0;
    const script: LlmResult[] = [
      ...readThenFinal(2).slice(0, 2),        // zwei read_note-Runden
      overflow,                                // dritte Anfrage scheitert am Fenster
      { ok: true, content: "Fertig", toolCalls: [] },
    ];
    const llm: LoopLlm = { complete: async () => script[Math.min(n++, script.length - 1)] };
    const events: string[] = [];
    const out = await runAgent(
      { llm, tools: bigTools, maxRounds: 3, textFallback: false, compaction: compaction(100_000, 3) },
      user, () => {}, () => {}, (e) => events.push(e.kind), sig(),
    );
    const recs = out.filter(isCompactionRecord);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ stage: 1, keepToolResults: 0, forced: true });
    expect(events.filter((k) => k === "error")).toHaveLength(0);
    expect(events[events.length - 1]).toBe("final");
    // maxRounds=3, drei Tool-Runden waeren das Limit — die Wiederholung zaehlt nicht mit
    expect(n).toBe(4);
  });

  it("zweiter Ueberlauf: Fehler-Event overflow mit Server-Text, keine Endlosschleife", async () => {
    let n = 0;
    const script: LlmResult[] = [...readThenFinal(1).slice(0, 1), overflow, overflow];
    const llm: LoopLlm = { complete: async () => script[Math.min(n++, script.length - 1)] };
    const errors: { errorKind: string; message: string }[] = [];
    const out = await runAgent(
      { llm, tools: bigTools, maxRounds: 8, textFallback: false, compaction: compaction(100_000, 3) },
      user, () => {}, () => {},
      (e) => { if (e.kind === "error") errors.push({ errorKind: e.errorKind, message: e.message }); }, sig(),
    );
    expect(errors).toEqual([{ errorKind: "overflow", message: "maximum context length is 8192" }]);
    expect(out.filter(isCompactionRecord)).toHaveLength(1);
    expect(n).toBe(3);
  });

  it("Ueberlauf ohne Verdichtungsmasse (nichts zu stubben, Stufe 2 aus): sofort Fehler-Event", async () => {
    let n = 0;
    const llm: LoopLlm = { complete: async () => { n++; return overflow; } };
    const errors: string[] = [];
    await runAgent(
      { llm, tools: okTools, maxRounds: 8, textFallback: false, compaction: compaction(100_000, 3) },
      user, () => {}, () => {}, (e) => { if (e.kind === "error") errors.push(e.errorKind); }, sig(),
    );
    expect(errors).toEqual(["overflow"]);
    expect(n).toBe(1);
  });

  it("Ueberlauf ohne compaction-Dep: Fehler-Event wie jeder andere Fehler", async () => {
    const errors: string[] = [];
    await runAgent(
      { llm: scripted([overflow]), tools: okTools, maxRounds: 8, textFallback: false },
      user, () => {}, () => {}, (e) => { if (e.kind === "error") errors.push(e.errorKind); }, sig(),
    );
    expect(errors).toEqual(["overflow"]);
  });
});
