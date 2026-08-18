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
