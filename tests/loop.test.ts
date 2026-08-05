import { runAgent, type LoopLlm } from "../src/core/agent/loop";
import type { ChatMessage, ToolOutcome, ToolRunner } from "../src/core/agent/types";
import type { LlmResult } from "../src/llm/KodaChatClient";

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
    const out = await runAgent(
      { llm: scripted([{ ok: true, content: "Antwort", toolCalls: [] }]), tools: okTools, maxRounds: 8, textFallback: false },
      user, () => {}, () => {}, (e) => events.push(e.kind), sig(),
    );
    expect(events).toEqual(["final"]);
    expect(out).toEqual([{ role: "assistant", content: "Antwort" }]);
  });

  it("eine Tool-Runde: assistant(toolCalls) + tool + finale assistant-Nachricht", async () => {
    const events: string[] = [];
    const out = await runAgent(
      {
        llm: scripted([
          { ok: true, content: "", toolCalls: [{ id: "c1", name: "search_notes", arguments: '{"query":"x"}' }] },
          { ok: true, content: "Fertig", toolCalls: [] },
        ]),
        tools: okTools, maxRounds: 8, textFallback: false,
      },
      user, () => {}, () => {}, (e) => events.push(e.kind), sig(),
    );
    expect(events).toEqual(["tool-start", "tool-end", "final"]);
    expect(out.map((m) => m.role)).toEqual(["assistant", "tool", "assistant"]);
    expect(out[1]).toMatchObject({ role: "tool", toolCallId: "c1", content: "ergebnis von search_notes" });
  });

  it("Tool-Fehler geht als ERROR-Result zurueck ans Modell, kein Crash", async () => {
    const failing: ToolRunner = { run: async () => ({ ok: false, error: "Pfad geblockt" }) };
    const out = await runAgent(
      {
        llm: scripted([
          { ok: true, content: "", toolCalls: [{ id: "c1", name: "read_note", arguments: "{}" }] },
          { ok: true, content: "Verstanden", toolCalls: [] },
        ]),
        tools: failing, maxRounds: 8, textFallback: false,
      },
      user, () => {}, () => {}, () => {}, sig(),
    );
    expect(out[1].content).toBe("ERROR: Pfad geblockt");
  });

  it("werfendes Tool geht als ERROR-Result zurueck ans Modell, kein Crash", async () => {
    const throwing: ToolRunner = {
      run: async () => {
        throw new Error("kaputt");
      },
    };
    const out = await runAgent(
      {
        llm: scripted([
          { ok: true, content: "", toolCalls: [{ id: "c1", name: "read_note", arguments: "{}" }] },
          { ok: true, content: "Verstanden", toolCalls: [] },
        ]),
        tools: throwing, maxRounds: 8, textFallback: false,
      },
      user, () => {}, () => {}, () => {}, sig(),
    );
    expect(out[1].content).toBe("ERROR: kaputt");
    expect(out.map((m) => m.role)).toEqual(["assistant", "tool", "assistant"]);
    expect(out[2]).toEqual({ role: "assistant", content: "Verstanden" });
  });

  it("eine Tool-Runde mit zwei nativen Tool-Calls: beide Tool-Nachrichten in Reihenfolge", async () => {
    const events: string[] = [];
    const out = await runAgent(
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
    );
    expect(events).toEqual(["tool-start", "tool-end", "tool-start", "tool-end", "final"]);
    expect(out.map((m) => m.role)).toEqual(["assistant", "tool", "tool", "assistant"]);
    expect(out[1]).toMatchObject({ role: "tool", toolCallId: "c1", content: "ergebnis von search_notes" });
    expect(out[2]).toMatchObject({ role: "tool", toolCallId: "c2", content: "ergebnis von read_note" });
  });

  it("ungueltiges Argument-JSON wird zum Tool-Fehler, nicht zur Exception", async () => {
    const out = await runAgent(
      {
        llm: scripted([
          { ok: true, content: "", toolCalls: [{ id: "c1", name: "read_note", arguments: "{kaputt" }] },
          { ok: true, content: "Ok", toolCalls: [] },
        ]),
        tools: okTools, maxRounds: 8, textFallback: false,
      },
      user, () => {}, () => {}, () => {}, sig(),
    );
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
    const out = await runAgent(
      { llm: scripted([{ ok: false, kind: "timeout", detail: "zu langsam", partial: "Teil" }]), tools: okTools, maxRounds: 8, textFallback: false },
      user, () => {}, () => {}, (e) => events.push(e as never), sig(),
    );
    expect(events[0]).toMatchObject({ kind: "error", partial: "Teil" });
    expect(out).toEqual([{ role: "assistant", content: "Teil" }]);
  });

  it("textFallback: erkennt JSON-Tool-Call im content, wenn keine nativen toolCalls kamen", async () => {
    const out = await runAgent(
      {
        llm: scripted([
          { ok: true, content: '{"tool":"search_notes","arguments":{"query":"x"}}', toolCalls: [] },
          { ok: true, content: "Fertig", toolCalls: [] },
        ]),
        tools: okTools, maxRounds: 8, textFallback: true,
      },
      user, () => {}, () => {}, () => {}, sig(),
    );
    expect(out.map((m) => m.role)).toEqual(["assistant", "tool", "assistant"]);
  });
});
