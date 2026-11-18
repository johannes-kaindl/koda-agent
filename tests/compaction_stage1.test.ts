import { toWireMessages } from "../src/core/agent/types";
import { IMAGE_EST_CHARS } from "../src/core/tools/images";
import { estimateTokens } from "../src/core/agent/compaction/estimate";
import { planStage1 } from "../src/core/agent/compaction/stage1";
import { projectForModel, STUB_MIN_CHARS } from "../src/core/agent/compaction/project";
import type { ChatMessage, LogEntry } from "../src/core/agent/types";

const u = (c: string): ChatMessage => ({ role: "user", content: c });
const call = (id: string, name: string, args: string): ChatMessage => ({ role: "assistant", content: "", toolCalls: [{ id, name, arguments: args }] });
const tool = (id: string, c: string): ChatMessage => ({ role: "tool", toolCallId: id, content: c });
const big = (tag: string): string => `${tag} ${"x".repeat(STUB_MIN_CHARS + 40)}`;

describe("estimateTokens", () => {
  it("ist Zeichen der Wire-Form durch 4, aufgerundet, plus Overhead", () => {
    const msgs: ChatMessage[] = [u("abcd")];
    const wireChars = JSON.stringify([{ role: "user", content: "abcd" }]).length;
    expect(estimateTokens(msgs)).toBe(Math.ceil(wireChars / 4));
    expect(estimateTokens(msgs, 400)).toBe(Math.ceil((wireChars + 400) / 4));
  });
  it("ist monoton: mehr Text, mehr Token", () => {
    expect(estimateTokens([u("a".repeat(100))])).toBeLessThan(estimateTokens([u("a".repeat(1000))]));
  });
});

describe("planStage1", () => {
  const h: LogEntry[] = [
    u("F"), call("c1", "read_note", '{"path":"A.md"}'), tool("c1", big("A")),
    call("c2", "read_note", '{"path":"B.md"}'), tool("c2", big("B")),
    call("c3", "search_notes", '{"query":"q"}'), tool("c3", "kurz"),
  ];
  it("zaehlt genau die Kandidaten jenseits von K, die ein Stub kuerzen wuerde", () => {
    const rec = planStage1(projectForModel(h), 1, "T");
    // K=1 schuetzt c3 (kurz, waere ohnehin nicht gestubbt); c2 und c1 sind Kandidaten
    expect(rec).toMatchObject({ kind: "compaction", stage: 1, at: "T", keepToolResults: 1, stats: { stubbed: 2, bytes: big("A").length + big("B").length } });
    expect(rec?.forced).toBeUndefined();
  });
  it("liefert null, wenn nichts zu kuerzen ist (K deckt alles oder alles ist kurz/gestubbt)", () => {
    expect(planStage1(projectForModel(h), 5, "T")).toBeNull();
    const already = projectForModel([...h, planStage1(projectForModel(h), 0, "T")!]);
    expect(planStage1(already, 0, "T")).toBeNull();
  });
  it("forced setzt das Kennzeichen", () => {
    expect(planStage1(projectForModel(h), 0, "T", true)?.forced).toBe(true);
  });
  it("Record und Projektion stimmen ueberein: nach Anwendung sind genau stats.stubbed Stubs mehr", () => {
    const before = projectForModel(h).filter((m) => m.stubbed).length;
    const rec = planStage1(projectForModel(h), 0, "T")!;
    const after = projectForModel([...h, rec]).filter((m) => m.stubbed).length;
    expect(after - before).toBe(rec.stats.stubbed);
  });
});

describe("planStage1 mit Kontextbloecken", () => {
  const uc = (c: string, len: number): ChatMessage => ({
    role: "user", content: c,
    context: { mode: "workspace", items: [], text: "k".repeat(len) },
  });
  it("zaehlt Kontextbloecke getrennt in stats.contexts und rechnet ihre Zeichen in bytes", () => {
    const h: LogEntry[] = [uc("F1", STUB_MIN_CHARS + 40), call("c1", "read_note", '{"path":"A.md"}'), tool("c1", big("A")), uc("F2", 5)];
    const rec = planStage1(projectForModel(h), 0, "T");
    expect(rec).not.toBeNull();
    expect(rec!.stats.stubbed).toBe(1);
    expect(rec!.stats.contexts).toBe(1);
    expect(rec!.stats.bytes).toBe(big("A").length + STUB_MIN_CHARS + 40);
  });
  it("ohne Kontextbloecke fehlt stats.contexts — alte Marken bleiben, wie sie sind", () => {
    const h: LogEntry[] = [u("F"), call("c1", "read_note", '{"path":"A.md"}'), tool("c1", big("A"))];
    expect(planStage1(projectForModel(h), 0, "T")!.stats.contexts).toBeUndefined();
  });
});

describe("estimateTokens — Differential gegen die eigene Fassung vor dem Kit-Tausch (code-kit model-context)", () => {
  // Die alte Rechnung, wortgleich: Zeichen der Wire-Form + Overhead + Bildzuschlag, durch 4, aufgerundet.
  const alt = (msgs: ChatMessage[], overheadChars = 0): number => {
    const images = msgs.reduce((n, m) => n + (m.images?.length ?? 0), 0);
    return Math.ceil((JSON.stringify(toWireMessages(msgs)).length + overheadChars + images * IMAGE_EST_CHARS) / 4);
  };
  it("liefert dieselbe Zahl fuer Verlaeufe mit Text, Tool-Aufrufen, Bildern, Umlauten und Overhead", () => {
    const img = (n: number): ChatMessage => ({ role: "user", content: "Bild", images: Array.from({ length: n }, (_, i) => ({ path: `b${i}.png` })) });
    const faelle: Array<[ChatMessage[], number]> = [
      [[], 0],
      [[u("")], 0],
      [[u("abcd")], 0],
      [[u("äöü ß 日本語 \u{1F600}")], 7],
      [[u("a".repeat(1001)), call("c1", "read_note", '{"path":"A.md"}'), tool("c1", "b".repeat(333))], 400],
      [[img(1)], 0],
      [[img(3), u("x")], 1234],
    ];
    for (const [msgs, ov] of faelle) expect(estimateTokens(msgs, ov)).toBe(alt(msgs, ov));
  });
  it("deckt viele Laengen ab (jede Rundungsgrenze von 4 Zeichen)", () => {
    for (let n = 0; n < 200; n++) expect(estimateTokens([u("a".repeat(n))], n % 7)).toBe(alt([u("a".repeat(n))], n % 7));
  });
});
