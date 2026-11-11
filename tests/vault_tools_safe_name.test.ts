import { VaultTools, type VaultPort, type WriteRequest } from "../src/obsidian/vault-tools";
import { safeFileName } from "../src/vendor/kit-obsidian/safe-file-name";

/** Dateinamen aus dem Modell laufen vor dem Schreiben durch die Richtlinie (obsidian-kit `safeFileName`): write_note (create) und
 *  move_note. Gebildet wird der Name vom Modell; ein vorhandener Name (append/replace, Quelle eines Moves, ein bestehender Ordner)
 *  bleibt, wie er ist, denn sonst fände das Modell seine eigene Notiz nicht mehr. */

type Vault = VaultPort & { files: Record<string, string> };

function fakeVault(files: Record<string, string>, folders: string[] = []): Vault {
  return {
    files,
    listMarkdownPaths: () => Object.keys(files),
    listFolderPaths: () => folders,
    read: async (p) => { if (!(p in files)) throw new Error("not found"); return files[p]; },
    exists: async (p) => p in files,
    create: async (p, c) => void (files[p] = c),
    append: async (p, c) => void (files[p] = (files[p] ?? "") + c),
    overwrite: async (p, c) => void (files[p] = c),
    frontmatterOf: () => null,
    move: async (from, to) => { files[to] = files[from] ?? ""; delete files[from]; },
    trash: async () => { throw new Error("nicht erwartet: trash"); },
    backlinkCount: () => 0,
  };
}

/** Wie `main.ts` es verdrahtet: `safeFileName` mit der Plugin-Id als `caller`, `app` ohne Sanitizer-Plugin (Kit-Regeln). */
const calls: Array<{ name: string; caller: string; kind: string | undefined }> = [];
const app = {};
const safeName = (name: string, kind: "file" | "folder"): string => {
  const r = safeFileName(app, name, { caller: "koda-agent", kind });
  calls.push({ name, caller: "koda-agent", kind });
  return r.name;
};

const base = { kodaFolder: () => "Koda", today: () => "2026-11-11", listMaxRows: () => 150 };
const opts = { ...base, safeName };
const yes = async (): Promise<boolean> => true;

function capturing(): { seen: WriteRequest[]; confirm: (r: WriteRequest) => Promise<boolean> } {
  const seen: WriteRequest[] = [];
  return { seen, confirm: async (r) => { seen.push(r); return true; } };
}

beforeEach(() => { calls.length = 0; });

describe("write_note create: Dateiname durch die Richtlinie", () => {
  it("ersetzt Doppelpunkt und Fragezeichen im Dateinamen und meldet den geschriebenen Pfad samt Hinweis", async () => {
    const v = fakeVault({});
    const r = await new VaultTools(v, yes, opts).run("write_note", { path: "Koda/Plan: Q1?.md", content: "x", mode: "create" });
    expect(Object.keys(v.files)).toEqual(["Koda/Plan — Q1.md"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content).toContain("geschrieben: Koda/Plan — Q1.md (create)");
      expect(r.content).toContain("Plan: Q1?.md");
    }
  });

  it("die Bestätigung zeigt den bereinigten Pfad (approved == written)", async () => {
    const c = capturing();
    const v = fakeVault({});
    await new VaultTools(v, c.confirm, opts).run("write_note", { path: "Notes/Idee [A] #1.md", content: "x", mode: "create" });
    expect(c.seen).toHaveLength(1);
    expect(c.seen[0]?.path).toBe(Object.keys(v.files)[0]);
    expect(c.seen[0]?.path).not.toMatch(/[[\]#]/);
  });

  it("ein neuer Ordner im Pfad wird bereinigt, ein vorhandener bleibt", async () => {
    const v = fakeVault({}, ["Notes", "Notes/Alt: Ordner"]);
    await new VaultTools(v, yes, opts).run("write_note", { path: "Notes/Alt: Ordner/Neu: Ordner/a.md", content: "x", mode: "create" });
    expect(Object.keys(v.files)).toEqual(["Notes/Alt: Ordner/Neu — Ordner/a.md"]);
    expect(calls.filter((c) => c.kind === "folder").map((c) => c.name)).toEqual(["Neu: Ordner"]);
  });

  it("der Dateiname geht als Datei, der Aufrufer ist die Plugin-Id", async () => {
    await new VaultTools(fakeVault({}, ["Koda"]), yes, opts).run("write_note", { path: "Koda/a.md", content: "x", mode: "create" });
    expect(calls).toEqual([{ name: "a.md", caller: "koda-agent", kind: "file" }]);
  });

  it("append und replace auf eine vorhandene Notiz lassen den Namen unberührt", async () => {
    const v = fakeVault({ "Notes/A: B.md": "alt" });
    const t = new VaultTools(v, yes, opts);
    expect((await t.run("write_note", { path: "Notes/A: B.md", content: "mehr", mode: "append" })).ok).toBe(true);
    expect((await t.run("write_note", { path: "Notes/A: B.md", content: "neu", mode: "replace" })).ok).toBe(true);
    expect(Object.keys(v.files)).toEqual(["Notes/A: B.md"]);
    expect(calls).toEqual([]);
  });

  it("trifft der bereinigte Name eine vorhandene Notiz, bleibt es der Fehler 'existiert schon' mit dem bereinigten Pfad", async () => {
    const v = fakeVault({ "Koda/Plan — Q1.md": "alt" });
    const r = await new VaultTools(v, yes, opts).run("write_note", { path: "Koda/Plan: Q1.md", content: "neu", mode: "create" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Koda/Plan — Q1.md");
    expect(v.files["Koda/Plan — Q1.md"]).toBe("alt");
  });

  it("ein Name, den die Richtlinie nicht ändert, geht ohne Hinweis durch", async () => {
    const v = fakeVault({});
    const r = await new VaultTools(v, yes, opts).run("write_note", { path: "Koda/Entwürfe/x.md", content: "x", mode: "create" });
    expect(r).toEqual({ ok: true, content: "geschrieben: Koda/Entwürfe/x.md (create)" });
  });

  it("ohne die Option bleibt der Name, wie das Modell ihn schrieb (Altaufrufer)", async () => {
    const v = fakeVault({});
    await new VaultTools(v, yes, base).run("write_note", { path: "Koda/Plan: Q1.md", content: "x", mode: "create" });
    expect(Object.keys(v.files)).toEqual(["Koda/Plan: Q1.md"]);
  });
});

describe("move_note: Ziel durch die Richtlinie", () => {
  it("bereinigt den neuen Namen und meldet das bereinigte Ziel", async () => {
    const v = fakeVault({ "P/alt.md": "x" });
    const r = await new VaultTools(v, yes, opts).run("move_note", { source_path: "P/alt.md", destination_path: "Archiv: neu/Plan: Q1?.md" });
    expect(Object.keys(v.files)).toEqual(["Archiv — neu/Plan — Q1.md"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toContain("Archiv — neu/Plan — Q1.md");
  });

  it("die Quelle bleibt unberührt, auch mit Sonderzeichen", async () => {
    const v = fakeVault({ "P/A: B.md": "x" });
    const r = await new VaultTools(v, yes, opts).run("move_note", { source_path: "P/A: B.md", destination_path: "P/C.md" });
    expect(r.ok).toBe(true);
    expect(Object.keys(v.files)).toEqual(["P/C.md"]);
  });

  it("wird das Ziel durch die Richtlinie zur Quelle, ist es der Fehler 'gleicher Pfad'", async () => {
    const v = fakeVault({ "P/Plan.md": "x" });
    const r = await new VaultTools(v, yes, opts).run("move_note", { source_path: "P/Plan.md", destination_path: "P/Plan?.md" });
    expect(r.ok).toBe(false);
    expect(Object.keys(v.files)).toEqual(["P/Plan.md"]);
  });

  it("die Bestätigung eines Moves aus dem Koda-Ordner zeigt das bereinigte Ziel", async () => {
    const c = capturing();
    const v = fakeVault({ "Koda/a.md": "x" });
    await new VaultTools(v, c.confirm, opts).run("move_note", { source_path: "Koda/a.md", destination_path: "Notes/b: c.md" });
    const req = c.seen[0];
    expect(req?.kind).toBe("move");
    if (req?.kind === "move") expect(req.destination).toBe("Notes/b — c.md");
  });
});

describe("write_skill: Skill-Name durch die Richtlinie", () => {
  const skill = (name: string): Record<string, unknown> => ({ name, description: "Antworte kurz", body: "Regel", mode: "create" });

  it("ersetzt den Doppelpunkt statt ihn zu löschen und meldet den Pfad", async () => {
    const v = fakeVault({});
    const r = await new VaultTools(v, yes, opts).run("write_skill", skill("Plan: Q1"));
    expect(r.ok).toBe(true);
    expect(Object.keys(v.files)).toEqual(["Koda/Skills/Plan — Q1.md"]);
    if (r.ok) expect(r.content).toContain("Koda/Skills/Plan — Q1.md");
  });

  it("ein Name, den die Richtlinie nicht ändert, bleibt", async () => {
    const v = fakeVault({});
    await new VaultTools(v, yes, opts).run("write_skill", skill("Projektnotizen"));
    expect(Object.keys(v.files)).toEqual(["Koda/Skills/Projektnotizen.md"]);
  });

  it("ein Name nur aus unerlaubten Zeichen bleibt der Fehler, kein Skill namens '---'", async () => {
    const v = fakeVault({});
    const r = await new VaultTools(v, yes, opts).run("write_skill", skill("///"));
    expect(r.ok).toBe(false);
    expect(Object.keys(v.files)).toEqual([]);
  });

  it("ohne die Option bleibt es beim lokalen Bereinigen (Altaufrufer)", async () => {
    const v = fakeVault({});
    await new VaultTools(v, yes, base).run("write_skill", skill("Plan: Q1"));
    expect(Object.keys(v.files)).toEqual(["Koda/Skills/Plan Q1.md"]);
  });
});
