import { VaultTools, type VaultPort, type WriteRequest } from "../src/obsidian/vault-tools";

function capturingConfirm(): { calls: WriteRequest[]; confirm: (req: WriteRequest) => Promise<boolean> } {
  const calls: WriteRequest[] = [];
  return {
    calls,
    confirm: async (req) => {
      calls.push(req);
      return true;
    },
  };
}

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
    frontmatterOf: () => null,
  };
}

const opts = { kodaFolder: () => "Koda", today: () => "2026-08-05", listMaxRows: () => 150 };
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
  it("write_note ausserhalb mit Zustimmung (replace) schreibt exakt den bestaetigten Inhalt", async () => {
    const vault = fakeVault({ "Plan.md": "alt" });
    const cap = capturingConfirm();
    const tools = new VaultTools(vault, cap.confirm, opts);
    const r = await tools.run("write_note", { path: "Plan.md", content: "neu", mode: "replace" });
    expect(r.ok).toBe(true);
    expect(cap.calls).toHaveLength(1);
    expect(vault.files["Plan.md"]).toBe(cap.calls[0].newText);
    expect(vault.files["Plan.md"]).toBe("neu");
  });
  it("write_note ausserhalb mit Zustimmung (append) schreibt exakt die Vorschau (inkl. fuehrendem Zeilenumbruch)", async () => {
    const vault = fakeVault({ "Plan.md": "alt" });
    const cap = capturingConfirm();
    const tools = new VaultTools(vault, cap.confirm, opts);
    const r = await tools.run("write_note", { path: "Plan.md", content: "neu", mode: "append" });
    expect(r.ok).toBe(true);
    expect(cap.calls).toHaveLength(1);
    const previewed = cap.calls[0].newText;
    // Die Vorschau MUSS der tatsaechlich angehaengte Effektiv-Inhalt sein — sonst
    // zeigt das Confirm-Modal etwas anderes, als am Ende geschrieben wird.
    expect(vault.files["Plan.md"]).toBe("alt" + previewed);
    expect(previewed).toBe("\nneu");
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

describe("write_skill", () => {
  it("schreibt einen Skill mit wohlgeformtem Frontmatter nach Skills/", async () => {
    const vault = fakeVault({});
    const cap = capturingConfirm();
    const tools = new VaultTools(vault, cap.confirm, opts);
    const r = await tools.run("write_skill", {
      name: "Projektnotizen",
      description: "Zuerst die Hub-Notiz lesen",
      body: "Projekte liegen unter 25_Coding/.",
      mode: "create",
    });
    expect(r.ok).toBe(true);
    const written = vault.files["Koda/Skills/Projektnotizen.md"] ?? "";
    // "true" wird von serializeFrontmatter (vendorter Code, nie handeditiert) als
    // Boolean-Look-alike gequotet — FmValue kennt keinen echten Boolean-Typ. Der Brief
    // erwartete hier ein unquotiertes "enabled: true"; das ist mit der gegebenen,
    // unveraenderlichen Serialisierer-Signatur nicht erreichbar (siehe Report/Concerns).
    expect(written.startsWith('---\ndescription: Zuerst die Hub-Notiz lesen\nenabled: "true"\n---\n')).toBe(true);
    expect(written).toContain("Projekte liegen unter 25_Coding/.");
    expect(cap.calls.length).toBe(1);
  });

  it("fragt IMMER nach, obwohl der Pfad im Koda-Ordner liegt", async () => {
    const vault = fakeVault({});
    const cap = capturingConfirm();
    const tools = new VaultTools(vault, cap.confirm, opts);
    await tools.run("write_skill", { name: "X", description: "d", body: "b", mode: "create" });
    expect(cap.calls.length).toBe(1);
    expect(cap.calls[0].path).toBe("Koda/Skills/X.md");
  });

  it("reicht die description als effect ans Modal durch", async () => {
    const vault = fakeVault({});
    const cap = capturingConfirm();
    const tools = new VaultTools(vault, cap.confirm, opts);
    await tools.run("write_skill", { name: "X", description: "Antworte kurz", body: "b", mode: "create" });
    expect(cap.calls[0].effect).toBe("Antworte kurz");
  });

  it("Ablehnung schreibt nichts und meldet es zurueck", async () => {
    const vault = fakeVault({});
    const tools = new VaultTools(vault, no, opts);
    const r = await tools.run("write_skill", { name: "X", description: "d", body: "b", mode: "create" });
    expect(r.ok).toBe(false);
    expect("Koda/Skills/X.md" in vault.files).toBe(false);
  });

  it("leerer Name nach Sanitizing ist ein Fehler", async () => {
    const tools = new VaultTools(fakeVault({}), yes, opts);
    const r = await tools.run("write_skill", { name: "///", description: "d", body: "b", mode: "create" });
    expect(r.ok).toBe(false);
  });

  it("fehlende description ist ein Fehler", async () => {
    const tools = new VaultTools(fakeVault({}), yes, opts);
    const r = await tools.run("write_skill", { name: "X", description: "  ", body: "b", mode: "create" });
    expect(r.ok).toBe(false);
  });

  it("append gibt es nicht", async () => {
    const tools = new VaultTools(fakeVault({}), yes, opts);
    const r = await tools.run("write_skill", { name: "X", description: "d", body: "b", mode: "append" });
    expect(r.ok).toBe(false);
  });

  it("create auf einen bestehenden Skill schlaegt fehl", async () => {
    const vault = fakeVault({ "Koda/Skills/X.md": "alt" });
    const tools = new VaultTools(vault, yes, opts);
    const r = await tools.run("write_skill", { name: "X", description: "d", body: "b", mode: "create" });
    expect(r.ok).toBe(false);
  });

  it("replace auf einen fehlenden Skill schlaegt fehl", async () => {
    const tools = new VaultTools(fakeVault({}), yes, opts);
    const r = await tools.run("write_skill", { name: "X", description: "d", body: "b", mode: "replace" });
    expect(r.ok).toBe(false);
  });

  // Die Invariante aus der MVP-Spec gilt unveraendert auch hier.
  it("Vorschau ist byte-genau der geschriebene Inhalt", async () => {
    const vault = fakeVault({});
    const cap = capturingConfirm();
    const tools = new VaultTools(vault, cap.confirm, opts);
    await tools.run("write_skill", { name: "X", description: "d", body: "b", mode: "create" });
    expect(cap.calls[0].newText).toBe(vault.files["Koda/Skills/X.md"]);
  });
});
