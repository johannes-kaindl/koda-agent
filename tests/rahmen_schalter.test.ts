// Die drei internen Schalter des Messrahmens (src/core/agent/rahmen.ts): jeder Test belegt zuerst, dass der Standard
// (Objekt fehlt oder RAHMEN_STANDARD) das Verhalten vor den Schaltern ist, und danach, dass der Schalter wirkt.
import { buildSystemPrompt } from "../src/core/prompt/build";
import { runAgent, type LoopLlm } from "../src/core/agent/loop";
import { RAHMEN_STANDARD, WIEDERHOLUNGS_HINWEIS, type RahmenSchalter } from "../src/core/agent/rahmen";
import { isChatMessage, type ChatMessage, type LogEntry, type ToolRunner } from "../src/core/agent/types";
import type { LlmResult } from "../src/llm/KodaChatClient";
import { VaultTools, type VaultPort } from "../src/obsidian/vault-tools";

const mit = (teil: Partial<RahmenSchalter>): RahmenSchalter => ({ ...RAHMEN_STANDARD, ...teil });
// 2026-09-30 21:45 UTC = 23:45 in Berlin, Mittwoch.
const NOW = Date.UTC(2026, 8, 30, 21, 45);
const ZONE = "Europe/Berlin";

describe("Schalter (a): ## Now als Datum", () => {
  const prompt = (rahmen?: RahmenSchalter): string =>
    buildSystemPrompt({ lang: "de", memory: "", kodaFolder: "Koda", now: NOW, timeZone: ZONE, ...(rahmen ? { rahmen } : {}) });

  it("Standard: die Minute steht im Prompt, mit und ohne Schalter-Objekt gleich", () => {
    expect(prompt()).toContain("## Now\n2026-09-30 (Wednesday) 23:45, Europe/Berlin");
    expect(prompt(mit({}))).toBe(prompt());
  });

  it("an: Datum und Wochentag ohne Uhrzeit", () => {
    const p = prompt(mit({ nowNurDatum: true }));
    expect(p).toContain("## Now\n2026-09-30 (Wednesday), Europe/Berlin");
    expect(p).not.toMatch(/\d{2}:\d{2}/);
  });
});

describe("Schalter (b): Obergrenze für Memory.md und read_note", () => {
  const memory = Array.from({ length: 200 }, (_, i) => `- [2026-09-01] Fakt Nummer ${i}`).join("\n");

  it("Standard: Memory.md steht ganz im Prompt", () => {
    const p = buildSystemPrompt({ lang: "de", memory, kodaFolder: "Koda" });
    expect(p).toContain(memory);
    expect(buildSystemPrompt({ lang: "de", memory, kodaFolder: "Koda", rahmen: mit({}) })).toBe(p);
  });

  it("an: Memory.md wird vorn gekappt, die jüngste Zeile bleibt, die Kappung steht in Zeile 1 des Blocks", () => {
    const p = buildSystemPrompt({ lang: "de", memory, kodaFolder: "Koda", rahmen: mit({ memoryGrenzeZeichen: 500 }) });
    const block = p.slice(p.indexOf("## Memory\n") + "## Memory\n".length);
    expect(block.split("\n")[0]).toMatch(/^\(truncated: older lines omitted/);
    expect(block).toContain("Fakt Nummer 199");
    expect(block).not.toContain("Fakt Nummer 0\n");
    expect(block.length).toBeLessThan(700);
  });

  const lang = "x".repeat(10_000) + "ENDE";
  const vault: VaultPort = {
    listMarkdownPaths: () => ["Lang.md"],
    listFolderPaths: () => [],
    read: async (p) => { if (p !== "Lang.md") throw new Error("fehlt"); return lang; },
    exists: async (p) => p === "Lang.md",
    create: async () => {}, append: async () => {}, overwrite: async () => {},
    frontmatterOf: () => null, move: async () => {}, trash: async () => {}, backlinkCount: () => 0,
  };
  const opts = { kodaFolder: () => "Koda", today: () => "2026-09-30", listMaxRows: () => 150 };

  it("Standard: read_note liefert die ganze Notiz", async () => {
    const r = await new VaultTools(vault, async () => true, opts).run("read_note", { path: "Lang.md" });
    expect(r).toEqual({ ok: true, content: lang });
    const r2 = await new VaultTools(vault, async () => true, { ...opts, rahmen: mit({}) }).run("read_note", { path: "Lang.md" });
    expect(r2).toEqual(r);
  });

  it("an: read_note kappt hinten und sagt es in Zeile 1", async () => {
    const r = await new VaultTools(vault, async () => true, { ...opts, rahmen: mit({ leseGrenzeZeichen: 1000 }) }).run("read_note", { path: "Lang.md" });
    if (!r.ok) throw new Error(r.error);
    expect(r.content.split("\n")[0]).toBe("[gekappt: die ersten 1000 von 10004 Zeichen; der Rest der Notiz fehlt in diesem Ergebnis]");
    expect(r.content).not.toContain("ENDE");
  });
});

describe("Schalter (c): Hinweis nach zwei gleichen Fehlaufrufen", () => {
  const sig = (): AbortSignal => new AbortController().signal;
  const user: ChatMessage[] = [{ role: "user", content: "Lies X" }];
  const call = { id: "c", name: "read_note", arguments: '{"path":"X.md"}' };
  function scripted(results: LlmResult[]): LoopLlm {
    let i = 0;
    return { complete: async () => results[Math.min(i++, results.length - 1)] };
  }
  const failing: ToolRunner = { run: async () => ({ ok: false, error: "Notiz nicht gefunden: \"X.md\"" }) };
  const lauf = async (rahmen?: RahmenSchalter): Promise<string[]> => {
    const out: LogEntry[] = await runAgent(
      {
        llm: scripted([
          { ok: true, content: "", toolCalls: [{ ...call, id: "c1" }] },
          { ok: true, content: "", toolCalls: [{ ...call, id: "c2" }] },
          { ok: true, content: "Gibt es nicht.", toolCalls: [] },
        ]),
        tools: failing, maxRounds: 8, textFallback: false, ...(rahmen ? { rahmen } : {}),
      },
      user, () => {}, () => {}, () => {}, sig(),
    );
    return out.filter(isChatMessage).filter((m) => m.role === "tool").map((m) => m.content);
  };

  it("Standard: beide Fehler gehen unverändert zurück", async () => {
    const tools = await lauf();
    expect(tools).toEqual(['ERROR: Notiz nicht gefunden: "X.md"', 'ERROR: Notiz nicht gefunden: "X.md"']);
    expect(await lauf(mit({}))).toEqual(tools);
  });

  it("an: der zweite gleiche Fehler trägt den Hinweis, der erste nicht", async () => {
    const tools = await lauf(mit({ wiederholungsHinweis: true }));
    expect(tools[0]).toBe('ERROR: Notiz nicht gefunden: "X.md"');
    expect(tools[1]).toBe(`ERROR: Notiz nicht gefunden: "X.md"\n${WIEDERHOLUNGS_HINWEIS}`);
  });

  it("an: andere Argumente beim zweiten Mal bekommen keinen Hinweis", async () => {
    const out: LogEntry[] = await runAgent(
      {
        llm: scripted([
          { ok: true, content: "", toolCalls: [{ ...call, id: "c1" }] },
          { ok: true, content: "", toolCalls: [{ id: "c2", name: "read_note", arguments: '{"path":"Y.md"}' }] },
          { ok: true, content: "Nichts.", toolCalls: [] },
        ]),
        tools: failing, maxRounds: 8, textFallback: false, rahmen: mit({ wiederholungsHinweis: true }),
      },
      user, () => {}, () => {}, () => {}, sig(),
    );
    const tools = out.filter(isChatMessage).filter((m) => m.role === "tool").map((m) => m.content);
    expect(tools.every((t) => !t.includes("HINWEIS"))).toBe(true);
  });
});
