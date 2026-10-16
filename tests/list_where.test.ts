import { parseWhere, matchesWhere, describeWhere } from "../src/core/tools/where";
import { VaultTools, type VaultPort } from "../src/obsidian/vault-tools";

const ok = (raw: unknown) => {
  const r = parseWhere(raw);
  if (!r.ok) throw new Error(r.error);
  return r.clauses;
};

describe("parseWhere", () => {
  it("nimmt Feld, Operator und Wert", () => {
    expect(ok([{ field: "status", op: "=", value: "offen" }])).toEqual([{ field: "status", op: "=", value: "offen" }]);
  });
  it("kennt = != contains exists missing", () => {
    for (const op of ["=", "!=", "contains"]) expect(parseWhere([{ field: "a", op, value: "x" }]).ok).toBe(true);
    for (const op of ["exists", "missing"]) expect(parseWhere([{ field: "a", op }]).ok).toBe(true);
  });
  it("lehnt einen unbekannten Operator ab und nennt die erlaubten", () => {
    const r = parseWhere([{ field: "a", op: "~", value: "x" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toContain("~"); expect(r.error).toContain("contains"); }
  });
  it("lehnt fehlendes Feld und fehlenden Wert ab, statt still zu filtern", () => {
    expect(parseWhere([{ op: "=", value: "x" }]).ok).toBe(false);
    expect(parseWhere([{ field: "a", op: "=" }]).ok).toBe(false);
    expect(parseWhere("status=offen").ok).toBe(false);
  });
  it("leere oder fehlende Angabe heißt: kein Filter", () => {
    expect(ok(undefined)).toEqual([]);
    expect(ok([])).toEqual([]);
  });
  it("Zahl und Boolean als Wert werden zu Text", () => {
    expect(ok([{ field: "a", op: "=", value: 3 }])[0].value).toBe("3");
    expect(ok([{ field: "a", op: "=", value: true }])[0].value).toBe("true");
  });
});

describe("matchesWhere", () => {
  const w = (op: string, value?: string, field = "status") => ok([{ field, op, value }]);
  it("= vergleicht ohne Groß-/Kleinschreibung und NFC-normalisiert", () => {
    expect(matchesWhere({ status: "Offen" }, w("=", "offen"))).toBe(true);
    expect(matchesWhere({ status: "Bücher" }, w("=", "Bücher"))).toBe(true);
    expect(matchesWhere({ status: "offen " }, w("=", "offen"))).toBe(true);
    expect(matchesWhere({ status: "erledigt" }, w("=", "offen"))).toBe(false);
  });
  it("= ist auf einer Liste wahr, wenn ein Element passt (tags)", () => {
    expect(matchesWhere({ tags: ["aufgabe", "welle-23"] }, w("=", "welle-23", "tags"))).toBe(true);
    expect(matchesWhere({ tags: ["aufgabe"] }, w("=", "welle-23", "tags"))).toBe(false);
  });
  it("= ist kein Teilstring-Treffer, contains schon", () => {
    expect(matchesWhere({ status: "nicht offen" }, w("=", "offen"))).toBe(false);
    expect(matchesWhere({ status: "nicht offen" }, w("contains", "offen"))).toBe(true);
    expect(matchesWhere({ tags: ["welle-23"] }, w("contains", "welle", "tags"))).toBe(true);
  });
  it("ein fehlendes Feld erfüllt weder = noch contains, wohl aber != und missing", () => {
    expect(matchesWhere({}, w("=", "offen"))).toBe(false);
    expect(matchesWhere(null, w("contains", "o"))).toBe(false);
    expect(matchesWhere({}, w("!=", "offen"))).toBe(true);
    expect(matchesWhere(null, w("missing"))).toBe(true);
    expect(matchesWhere({}, w("exists"))).toBe(false);
  });
  it("leere Werte zählen als nicht gesetzt (wie in der Feldanzeige)", () => {
    expect(matchesWhere({ status: "" }, w("exists"))).toBe(false);
    expect(matchesWhere({ status: [] }, w("exists"))).toBe(false);
    expect(matchesWhere({ status: null }, w("missing"))).toBe(true);
  });
  it("Zahl und Boolean im Frontmatter vergleichen als Text", () => {
    expect(matchesWhere({ n: 3 }, w("=", "3", "n"))).toBe(true);
    expect(matchesWhere({ b: false }, w("=", "false", "b"))).toBe(true);
  });
  it("mehrere Bedingungen gelten zusammen (UND)", () => {
    const c = ok([{ field: "status", op: "=", value: "offen" }, { field: "projekt", op: "contains", value: "koda" }]);
    expect(matchesWhere({ status: "offen", projekt: ["[[25_Coding/koda-agent/koda-agent]]"] }, c)).toBe(true);
    expect(matchesWhere({ status: "offen", projekt: ["[[x]]"] }, c)).toBe(false);
  });
  it("ein geerbter Name ist kein Feld (toString)", () => {
    expect(matchesWhere({}, ok([{ field: "toString", op: "exists" }]))).toBe(false);
  });
});

describe("describeWhere", () => {
  it("schreibt die Bedingungen lesbar für die Kopfzeile", () => {
    expect(describeWhere(ok([{ field: "status", op: "=", value: "offen" }, { field: "due", op: "missing" }])))
      .toBe('status = "offen" UND due fehlt');
  });
});

function fakeVault(files: Record<string, string>, fm: Record<string, Record<string, unknown>>): VaultPort {
  return {
    listMarkdownPaths: () => Object.keys(files),
    listFolderPaths: () => [],
    read: async (p) => files[p] ?? "",
    exists: async (p) => p in files,
    create: async () => undefined, append: async () => undefined, overwrite: async () => undefined,
    frontmatterOf: (p) => fm[p] ?? null,
    move: async () => { throw new Error("nicht erwartet"); },
    trash: async () => { throw new Error("nicht erwartet"); },
    backlinkCount: () => { throw new Error("nicht erwartet"); },
  };
}
const opts = { kodaFolder: () => "Koda", today: () => "2026-10-16", listMaxRows: () => 150 };
const files = { "P/A.md": "", "P/B.md": "", "P/C.md": "", "P/Sub/D.md": "" };
const fm = {
  "P/A.md": { status: "offen", projekt: "koda" },
  "P/B.md": { status: "erledigt", projekt: "koda" },
  "P/C.md": { status: "offen", projekt: "andere" },
  "P/Sub/D.md": { status: "offen", projekt: "koda" },
};

describe("list_notes mit where", () => {
  it("liefert nur passende Notizen, zählt gegen die gefilterte Menge und nennt den Filter", async () => {
    const r = await new VaultTools(fakeVault(files, fm), async () => true, opts)
      .run("list_notes", { folder: "P", recursive: true, fields: ["status"], where: [{ field: "status", op: "=", value: "offen" }, { field: "projekt", op: "=", value: "koda" }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content).toContain("2 von 2 Notizen");
      expect(r.content).toContain('Filter: status = "offen" UND projekt = "koda"');
      expect(r.content).toContain("P/A.md");
      expect(r.content).toContain("P/Sub/D.md");
      expect(r.content).not.toContain("P/B.md");
      expect(r.content).not.toContain("P/C.md");
    }
  });
  it("0 Treffer sagt „keine Notiz erfüllt den Filter“, nicht „Ordner enthält keine Notiz“", async () => {
    const r = await new VaultTools(fakeVault(files, fm), async () => true, opts)
      .run("list_notes", { folder: "P", where: [{ field: "status", op: "=", value: "gibtsnicht" }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content).toContain("0 von 0 Notizen");
      expect(r.content).toContain("keine Notiz erfüllt den Filter");
      expect(r.content).not.toContain("enthält aber keine Notiz");
    }
  });
  it("zeigt bei Filter keine Unterordner-Zählung, die den Filter nicht kennt", async () => {
    const r = await new VaultTools(fakeVault(files, fm), async () => true, opts)
      .run("list_notes", { folder: "P", where: [{ field: "status", op: "=", value: "offen" }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).not.toContain("Unterordner:");
  });
  it("ein ungültiger Filter ist ein Fehler, kein stilles Weglassen", async () => {
    const r = await new VaultTools(fakeVault(files, fm), async () => true, opts)
      .run("list_notes", { folder: "P", where: [{ field: "status", op: "ungefähr", value: "x" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("ungefähr");
  });
  it("ohne where bleibt alles wie vorher", async () => {
    const r = await new VaultTools(fakeVault(files, fm), async () => true, opts).run("list_notes", { folder: "P" });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.content).toContain("3 von 3 Notizen"); expect(r.content).not.toContain("Filter:"); }
  });
});
