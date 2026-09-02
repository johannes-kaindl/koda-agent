import { projectForModel, formatStub, formatContextStub, STUB_MIN_CHARS } from "../src/core/agent/compaction/project";
import type { ChatMessage, CompactionRecord, LogEntry } from "../src/core/agent/types";

const sys: ChatMessage = { role: "system", content: "SYS" };
const u = (c: string): ChatMessage => ({ role: "user", content: c });
const a = (c: string): ChatMessage => ({ role: "assistant", content: c });
const call = (id: string, name: string, args: string): ChatMessage => ({ role: "assistant", content: "", toolCalls: [{ id, name, arguments: args }] });
const tool = (id: string, c: string): ChatMessage => ({ role: "tool", toolCallId: id, content: c });
const big = (tag: string): string => `${tag} ${"x".repeat(STUB_MIN_CHARS + 40)}`;
const s1 = (keep: number): CompactionRecord => ({ kind: "compaction", stage: 1, at: "t", keepToolResults: keep, stats: { stubbed: 0, bytes: 0 } });
const s2 = (summary: string, turns: number): CompactionRecord => ({ kind: "compaction", stage: 2, at: "t", keepToolResults: 3, summary, turns, stats: { stubbed: 0, bytes: 0 } });

/** Ein Verlauf mit zwei abgeschlossenen Runden und einer laufenden. */
function history(): LogEntry[] {
  return [
    sys,
    u("Frage 1"), call("c1", "read_note", '{"path":"A.md"}'), tool("c1", big("A")), a("Antwort 1"),
    u("Frage 2"), call("c2", "list_notes", '{"folder":"P"}'), tool("c2", big("P")), a("Antwort 2"),
    u("Frage 3"), call("c3", "read_note", '{"path":"B.md"}'), tool("c3", big("B")),
    call("c4", "search_notes", '{"query":"q"}'), tool("c4", "kurz"),
  ];
}

describe("projectForModel", () => {
  it("ohne Record ist die Projektion identisch zum Verlauf", () => {
    const h = history();
    expect(projectForModel(h)).toEqual(h);
  });

  it("Stufe 1: die K juengsten Tool-Ergebnisse bleiben, aeltere werden gestubbt, Aufrufe bleiben", () => {
    const out = projectForModel([...history(), s1(1)]);
    const tools = out.filter((m) => m.role === "tool");
    expect(tools).toHaveLength(4);
    // c4 ist juengstes (bleibt woertlich, ist ohnehin kurz), c3 zweitjuengstes -> gestubbt (K=1)
    expect(tools[3]).toMatchObject({ toolCallId: "c4", content: "kurz" });
    expect(tools[2].content).toBe(formatStub("read_note", '{"path":"B.md"}', big("B").length));
    expect(tools[2].stubbed).toBe(true);
    expect(tools[0].content).toContain('read_note "A.md"');
    // Der Aufruf selbst bleibt vollstaendig
    expect(out.find((m) => m.toolCalls?.[0]?.id === "c1")).toEqual(call("c1", "read_note", '{"path":"A.md"}'));
  });

  it("Stufe 1 mit K=0 stubbt alles Lange; kurze Ergebnisse bleiben, weil ein Stub nichts spart", () => {
    const out = projectForModel([...history(), s1(0)]);
    const tools = out.filter((m) => m.role === "tool");
    expect(tools.slice(0, 3).every((m) => m.stubbed === true)).toBe(true);
    expect(tools[3]).toEqual(tool("c4", "kurz"));
  });

  it("Stufe 1 mit K groesser als vorhanden aendert nichts", () => {
    const h = history();
    expect(projectForModel([...h, s1(10)])).toEqual(h);
  });

  it("Stufe 2: abgeschlossene Runden -> ein user(merged) + ein assistant(summary); laufende Runde bleibt", () => {
    const out = projectForModel([...history(), s2("ZUSAMMENFASSUNG", 2)]);
    expect(out[0]).toEqual(sys);
    expect(out[1]).toMatchObject({ role: "user", merged: true });
    expect(out[1].content).toContain("1. Frage 1");
    expect(out[1].content).toContain("2. Frage 2");
    expect(out[2]).toEqual({ role: "assistant", content: "ZUSAMMENFASSUNG" });
    expect(out[3]).toEqual(u("Frage 3"));
    expect(out.slice(3)).toEqual(history().slice(9));
  });

  it("Stufe 2 mit leerer Region (keine abgeschlossene Runde vor dem Record) ist ein No-op", () => {
    const h: LogEntry[] = [sys, u("Frage 1"), call("c1", "read_note", "{}"), tool("c1", big("A"))];
    expect(projectForModel([...h, s2("X", 0)])).toEqual(h);
  });

  it("Stufe 2 ohne summary (kaputte Marke) ist ein No-op", () => {
    const h = history();
    const broken = { ...s2("X", 2) };
    delete broken.summary;
    expect(projectForModel([...h, broken])).toEqual(h);
  });

  it("zwei Stufe-2-Records: der merged-Block bleibt flach, die aeltere Zusammenfassung wird Material", () => {
    const first: LogEntry[] = [...history(), s2("ZF1", 2)];
    const later: LogEntry[] = [...first, a("Antwort 3"), u("Frage 4"), a("laeuft"), s2("ZF2", 3)];
    const out = projectForModel(later);
    expect(out[1]).toMatchObject({ role: "user", merged: true });
    expect(out[1].content).toContain("1. Frage 1");
    expect(out[1].content).toContain("3. Frage 3");
    expect(out[1].content).not.toContain("Frühere Anfragen (wörtlich):\n1. Frühere");
    expect(out[2]).toEqual({ role: "assistant", content: "ZF2" });
    expect(out[3]).toEqual(u("Frage 4"));
  });

  it("Stufe 1 nach Stufe 2 wirkt auf die projizierte Folge (auch auf die laufende Runde)", () => {
    const out = projectForModel([...history(), s2("ZF", 2), s1(0)]);
    const tools = out.filter((m) => m.role === "tool");
    expect(tools).toHaveLength(2);
    expect(tools[0].stubbed).toBe(true);
  });

  it("Invariante: nie zwei user hintereinander, jedes tool hat sein toolCalls-Gegenstueck", () => {
    // deterministischer Pseudo-Zufall, damit der Test reproduzierbar ist
    let seed = 42;
    const rnd = (n: number): number => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed % n; };
    for (let run = 0; run < 200; run++) {
      const entries: LogEntry[] = [sys];
      let id = 0;
      const turns = 1 + rnd(5);
      for (let t = 0; t < turns; t++) {
        entries.push(u(`F${t}`));
        const calls = rnd(4);
        for (let c = 0; c < calls; c++) {
          const cid = `c${id++}`;
          entries.push(call(cid, "read_note", `{"path":"${cid}.md"}`));
          entries.push(tool(cid, rnd(2) === 0 ? "kurz" : big(cid)));
          if (rnd(3) === 0) entries.push(s1(rnd(3)));
        }
        if (t < turns - 1) entries.push(a(`A${t}`));
        if (rnd(3) === 0) entries.push(s2(`ZF${t}`, t));
      }
      const out = projectForModel(entries);
      for (let i = 1; i < out.length; i++) {
        expect(!(out[i - 1].role === "user" && out[i].role === "user")).toBe(true);
      }
      const known = new Set<string>();
      for (const m of out) {
        if (m.role === "assistant" && m.toolCalls) for (const c of m.toolCalls) known.add(c.id);
        if (m.role === "tool") expect(known.has(m.toolCallId ?? "")).toBe(true);
      }
    }
  });
});

describe("formatStub", () => {
  it("nennt Werkzeug, Kernargument und Groesse und sagt, wie man es zurueckbekommt", () => {
    expect(formatStub("read_note", '{"path":"Projekte/X.md"}', 4300)).toBe('[read_note "Projekte/X.md" — 4,2 KB, verdichtet; bei Bedarf erneut aufrufen]');
    expect(formatStub("search_notes", '{"query":"Rezepte"}', 900)).toBe('[search_notes "Rezepte" — 0,9 KB, verdichtet; bei Bedarf erneut aufrufen]');
    expect(formatStub("list_notes", "kaputt", 300)).toBe("[list_notes — 0,3 KB, verdichtet; bei Bedarf erneut aufrufen]");
  });
});

describe("projectForModel mit Kontextbloecken", () => {
  const ctx = (tag: string, len: number) => ({
    mode: "workspace" as const,
    items: [{ source: "active" as const, path: `${tag}.md`, kind: "pointer" as const, chars: len }],
    text: `[Arbeitskontext · Arbeitsplatz]\n${tag} ${"k".repeat(len)}`,
  });
  const uc = (c: string, tag: string, len: number): ChatMessage => ({ role: "user", content: c, context: ctx(tag, len) });

  it("webt den Block VOR den Nutzertext; content der Nachricht selbst bleibt unangetastet", () => {
    const m = uc("Frage", "A", 10);
    const out = projectForModel([sys, m]);
    expect(out[1].content).toBe(`${m.context!.text}\n\nFrage`);
    expect(out[1].context).toBe(m.context);
    expect(m.content).toBe("Frage");
    // Nachrichten ohne Kontext bleiben Referenzen
    expect(out[0]).toBe(sys);
  });

  it("Stufe 1 zaehlt Kontextbloecke und Tool-Ergebnisse in EINER Reihe: die K juengsten bleiben", () => {
    const h: LogEntry[] = [
      sys,
      uc("F1", "A", STUB_MIN_CHARS + 40), a("A1"),
      uc("F2", "B", STUB_MIN_CHARS + 40), call("c1", "read_note", '{"path":"X.md"}'), tool("c1", big("X")), a("A2"),
      uc("F3", "C", 5),
    ];
    const out = projectForModel([...h, s1(2)]);
    const users = out.filter((m) => m.role === "user");
    // K=2: die zwei juengsten Kandidaten in EINER Reihe — Kontext C und Tool-Ergebnis c1 —
    // bleiben woertlich (c1 zaehlt hier als Kandidat mit, obwohl es ein Tool-Ergebnis und kein
    // Kontextblock ist); Block B und Block A liegen dahinter und werden gestubbt.
    expect(out.find((m) => m.role === "tool")!.stubbed).toBeUndefined();
    expect(users[0].contextStubbed).toBe(true);
    expect(users[0].content.startsWith(formatContextStub(users[0].context!))).toBe(true);
    expect(users[0].content.endsWith("\n\nF1")).toBe(true);
    expect(users[1].contextStubbed).toBe(true);
    // Der kurze Block C liegt unter STUB_MIN_CHARS und bleibt woertlich
    expect(users[2].contextStubbed).toBeUndefined();
    expect(users[2].content).toContain("[Arbeitskontext");
  });

  it("Stufe 2 fasst nur den Nutzertext zusammen — Kontextbloecke fallen dabei weg", () => {
    const h: LogEntry[] = [sys, uc("Frage 1", "A", 20), a("Antwort 1"), uc("Frage 2", "B", 20)];
    const out = projectForModel([...h, s2("ZUSAMMENFASSUNG", 1)]);
    expect(out[1].content).toContain("1. Frage 1");
    expect(out[1].content).not.toContain("Arbeitskontext");
  });
});

describe("formatContextStub", () => {
  it("nennt Modus, Anzahl, Groesse und den Rueckweg", () => {
    const text = formatContextStub({ mode: "workspace", items: [{ source: "active", path: "A.md", kind: "pointer", chars: 1 }, { source: "tab", path: "B.md", kind: "pointer", chars: 1 }], text: "x".repeat(2048) });
    expect(text).toBe("[Arbeitskontext · Arbeitsplatz — 2 Einträge, 2,0 KB, verdichtet; bei Bedarf über read_note erneut lesen]");
  });
});
