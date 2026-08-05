import { VaultTools, type VaultPort } from "../src/obsidian/vault-tools";

function fakeVault(files: Record<string, string>): VaultPort & { files: Record<string, string> } {
  return {
    files,
    listMarkdownPaths: () => Object.keys(files),
    read: async (p) => {
      if (!(p in files)) throw new Error("not found");
      return files[p];
    },
    exists: async (p) => p in files,
    create: async (p, c) => void (files[p] = c),
    append: async (p, c) => void (files[p] = (files[p] ?? "") + c),
    overwrite: async (p, c) => void (files[p] = c),
  };
}

const opts = { kodaFolder: () => "Koda", today: () => "2026-08-05" };
const yes = async (): Promise<boolean> => true;
const no = async (): Promise<boolean> => false;

describe("VaultTools", () => {
  it("search_notes findet Dateinamen- und Volltext-Treffer mit Snippet", async () => {
    const tools = new VaultTools(fakeVault({ "Rezepte/Lasagne.md": "Nudeln und Käse", "Anderes.md": "hier steht lasagne drin" }), yes, opts);
    const r = await tools.run("search_notes", { query: "lasagne" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content).toContain("Rezepte/Lasagne.md");
      expect(r.content).toContain("Anderes.md");
    }
  });
  it("read_note liest ueber den Pfad-Guard (Traversal blockt)", async () => {
    const tools = new VaultTools(fakeVault({ "A.md": "Inhalt" }), yes, opts);
    expect(await tools.run("read_note", { path: "A.md" })).toEqual({ ok: true, content: "Inhalt" });
    const blocked = await tools.run("read_note", { path: "../geheim.md" });
    expect(blocked.ok).toBe(false);
  });
  it("write_note im Koda-Ordner schreibt OHNE confirm", async () => {
    let asked = 0;
    const vault = fakeVault({});
    const tools = new VaultTools(vault, async () => { asked++; return true; }, opts);
    const r = await tools.run("write_note", { path: "Koda/Entwürfe/x.md", content: "Hi", mode: "create" });
    expect(r.ok).toBe(true);
    expect(asked).toBe(0);
    expect(vault.files["Koda/Entwürfe/x.md"]).toBe("Hi");
  });
  it("write_note ausserhalb fragt; Ablehnung wird als Fehler-Result gemeldet", async () => {
    const vault = fakeVault({ "Plan.md": "alt" });
    const tools = new VaultTools(vault, no, opts);
    const r = await tools.run("write_note", { path: "Plan.md", content: "neu", mode: "replace" });
    expect(r).toEqual({ ok: false, error: "vom Nutzer abgelehnt" });
    expect(vault.files["Plan.md"]).toBe("alt");
  });
  it("create auf existierende Datei ist ein Fehler-Result (kein Ueberschreiben)", async () => {
    const tools = new VaultTools(fakeVault({ "Koda/x.md": "da" }), yes, opts);
    const r = await tools.run("write_note", { path: "Koda/x.md", content: "neu", mode: "create" });
    expect(r.ok).toBe(false);
  });
  it("save_memory haengt an Koda/Memory.md an (immer frei)", async () => {
    const vault = fakeVault({});
    const tools = new VaultTools(vault, no, opts);
    const r = await tools.run("save_memory", { text: "Jay mag kurze Antworten" });
    expect(r.ok).toBe(true);
    expect(vault.files["Koda/Memory.md"]).toContain("- [2026-08-05] Jay mag kurze Antworten");
  });
  it("unbekanntes Tool ist ein Fehler-Result", async () => {
    const tools = new VaultTools(fakeVault({}), yes, opts);
    expect((await tools.run("gibt_es_nicht", {})).ok).toBe(false);
  });
});
