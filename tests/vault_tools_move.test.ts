import { VaultTools, type VaultPort, type WriteRequest } from "../src/obsidian/vault-tools";

function fakeVault(files: Record<string, string>, links: Record<string, number> = {}): VaultPort {
  return {
    files,
    listMarkdownPaths: () => Object.keys(files),
    listFolderPaths: () => [],
    read: async (p) => { if (!(p in files)) throw new Error("not found"); return files[p]; },
    exists: async (p) => p in files,
    create: async (p, c) => void (files[p] = c),
    append: async (p, c) => void (files[p] = (files[p] ?? "") + c),
    overwrite: async (p, c) => void (files[p] = c),
    frontmatterOf: () => null,
    move: async (from, to) => { files[to] = files[from]; delete files[from]; },
    trash: async (p) => void delete files[p],
    backlinkCount: (p) => links[p] ?? 0,
  } as VaultPort & { files: Record<string, string> };
}

const opts = { kodaFolder: () => "Koda", today: () => "2026-09-04", listMaxRows: () => 150 };
const yes = async (): Promise<boolean> => true;
const no = async (): Promise<boolean> => false;

function capturing(): { calls: WriteRequest[]; confirm: (r: WriteRequest) => Promise<boolean> } {
  const calls: WriteRequest[] = [];
  return { calls, confirm: async (r) => { calls.push(r); return true; } };
}

describe("move_note", () => {
  it("verschiebt und meldet beide Pfade", async () => {
    const v = fakeVault({ "Projekte/a.md": "Inhalt" });
    const r = await new VaultTools(v, yes, opts).run("move_note", { source_path: "Projekte/a.md", destination_path: "Archiv/a.md" });
    expect(r.ok).toBe(true);
    expect((v as never as { files: Record<string, string> }).files).toEqual({ "Archiv/a.md": "Inhalt" });
    if (r.ok) { expect(r.content).toContain("Projekte/a.md"); expect(r.content).toContain("Archiv/a.md"); }
  });
  it("meldet Umbenennen anders als Verschieben", async () => {
    const v = fakeVault({ "P/alt.md": "x" });
    const r = await new VaultTools(v, yes, opts).run("move_note", { source_path: "P/alt.md", destination_path: "P/neu.md" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toMatch(/umbenannt/i);
  });
  it("eine fehlende Quelle ist ein Fehler, kein stiller Erfolg", async () => {
    const r = await new VaultTools(fakeVault({}), yes, opts).run("move_note", { source_path: "weg.md", destination_path: "Archiv/weg.md" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nicht gefunden/i);
  });
  it("ein belegtes Ziel wird NICHT ueberschrieben", async () => {
    const v = fakeVault({ "a.md": "neu", "Archiv/a.md": "alt" });
    const r = await new VaultTools(v, yes, opts).run("move_note", { source_path: "a.md", destination_path: "Archiv/a.md" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/existiert schon/i);
    expect((v as never as { files: Record<string, string> }).files["Archiv/a.md"]).toBe("alt");
  });
  it("innerhalb des Koda-Ordners ohne Rueckfrage", async () => {
    const c = capturing();
    const v = fakeVault({ "Koda/a.md": "x" });
    const r = await new VaultTools(v, c.confirm, opts).run("move_note", { source_path: "Koda/a.md", destination_path: "Koda/b.md" });
    expect(r.ok).toBe(true);
    expect(c.calls).toHaveLength(0);
    expect((v as never as { files: Record<string, string> }).files).toEqual({ "Koda/b.md": "x" });
  });
  it("aus dem Koda-Ordner heraus mit Rueckfrage, und die nennt die Backlink-Zahl", async () => {
    const c = capturing();
    await new VaultTools(fakeVault({ "Koda/a.md": "x" }, { "Koda/a.md": 3 }), c.confirm, opts)
      .run("move_note", { source_path: "Koda/a.md", destination_path: "Projekte/a.md" });
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0]).toMatchObject({ kind: "move", path: "Koda/a.md", destination: "Projekte/a.md", backlinks: 3 });
  });
  it("eine abgelehnte Rueckfrage laesst die Datei liegen", async () => {
    const v = fakeVault({ "a.md": "x" });
    const r = await new VaultTools(v, no, opts).run("move_note", { source_path: "a.md", destination_path: "Archiv/a.md" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/abgelehnt/i);
    expect((v as never as { files: Record<string, string> }).files).toEqual({ "a.md": "x" });
  });
});

describe("delete_note — Wirkung schlaegt Ort", () => {
  it("fragt AUCH im Koda-Ordner nach", async () => {
    const c = capturing();
    await new VaultTools(fakeVault({ "Koda/a.md": "x" }), c.confirm, opts).run("delete_note", { path: "Koda/a.md" });
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0]).toMatchObject({ kind: "delete", path: "Koda/a.md" });
  });
  it("loescht nach Zustimmung", async () => {
    const v = fakeVault({ "a.md": "x" });
    const r = await new VaultTools(v, yes, opts).run("delete_note", { path: "a.md" });
    expect(r.ok).toBe(true);
    expect((v as never as { files: Record<string, string> }).files).toEqual({});
  });
  it("eine Ablehnung laesst die Datei liegen", async () => {
    const v = fakeVault({ "a.md": "x" });
    const r = await new VaultTools(v, no, opts).run("delete_note", { path: "a.md" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/abgelehnt/i);
    expect((v as never as { files: Record<string, string> }).files).toEqual({ "a.md": "x" });
  });
  it("eine fehlende Datei ist ein Fehler", async () => {
    const r = await new VaultTools(fakeVault({}), yes, opts).run("delete_note", { path: "weg.md" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nicht gefunden/i);
  });
});
