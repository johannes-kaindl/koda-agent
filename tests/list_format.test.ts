import { formatListResult, type NoteRow } from "../src/core/tools/list";

const rows = (n: number): NoteRow[] =>
  Array.from({ length: n }, (_, i) => ({ path: `P/_Tasks/${i}.md`, fields: { status: "offen" } }));

describe("formatListResult", () => {
  it("nennt die Zaehlung in der Kopfzeile und je Notiz eine Zeile", () => {
    const out = formatListResult({ folder: "P/_Tasks", recursive: false, total: 3, rows: rows(3) });
    expect(out.split("\n")[0]).toBe('3 von 3 Notizen in "P/_Tasks"');
    expect(out).toContain("P/_Tasks/0.md · status=offen");
  });
  it("stellt die Unvollstaendigkeit in ZEILE 1 — nicht als Fussnote", () => {
    const out = formatListResult({ folder: "20_Projekte", recursive: true, total: 512, rows: rows(150) });
    const first = out.split("\n")[0];
    expect(first).toContain("UNVOLLSTÄNDIG");
    expect(first).toContain("512");
    expect(first).toContain("150");
    expect(out).not.toMatch(/UNVOLLSTÄNDIG[\s\S]*UNVOLLSTÄNDIG/);
  });
  it("rät bei rekursivem Aufruf zusaetzlich zu recursive:false", () => {
    const rec = formatListResult({ folder: "A", recursive: true, total: 512, rows: rows(150) });
    const flat = formatListResult({ folder: "A", recursive: false, total: 512, rows: rows(150) });
    expect(rec).toContain("recursive:false");
    expect(flat).not.toContain("recursive:false");
  });
  it("markiert die Vault-Wurzel im Klartext statt als leeren String", () => {
    const out = formatListResult({ folder: "", recursive: false, total: 1, rows: rows(1) });
    expect(out.split("\n")[0]).toBe("1 von 1 Notizen in der Vault-Wurzel");
  });
  it("laesst ohne Felder die reine Pfadliste stehen", () => {
    const out = formatListResult({
      folder: "A", recursive: false, total: 1, rows: [{ path: "A/x.md", fields: {} }],
    });
    expect(out).toContain("A/x.md");
    expect(out).not.toContain("·");
  });
  it("weist auf den rekursiven Aufruf in der Kopfzeile hin", () => {
    const out = formatListResult({ folder: "A", recursive: true, total: 2, rows: rows(2) });
    expect(out.split("\n")[0]).toContain("(rekursiv)");
  });
});
