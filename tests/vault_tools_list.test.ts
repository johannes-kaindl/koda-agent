import { VaultTools, type VaultPort } from "../src/obsidian/vault-tools";

function fakeVault(
  files: Record<string, string>,
  fm: Record<string, Record<string, unknown>> = {},
): VaultPort & { fmCalls: string[] } {
  const fmCalls: string[] = [];
  return {
    fmCalls,
    listMarkdownPaths: () => Object.keys(files),
    listFolderPaths: () => [],
    read: async (p) => files[p] ?? "",
    exists: async (p) => p in files,
    create: async () => undefined,
    append: async () => undefined,
    overwrite: async () => undefined,
    frontmatterOf: (p) => {
      fmCalls.push(p);
      return fm[p] ?? null;
    },
    // Von diesen Tests nicht gerufen — ehrlich werfende Stubs statt stillem `undefined`.
    move: async () => { throw new Error("nicht erwartet: move"); },
    trash: async () => { throw new Error("nicht erwartet: trash"); },
    backlinkCount: () => { throw new Error("nicht erwartet: backlinkCount"); },
  };
}

const opts = { kodaFolder: () => "Koda", today: () => "2026-08-14", listMaxRows: () => 150 };

describe("list_notes", () => {
  it("listet einen Ordner mit den angeforderten Frontmatter-Feldern", async () => {
    const vault = fakeVault(
      { "P/_Tasks/A.md": "", "P/_Tasks/B.md": "", "P/Notiz.md": "" },
      { "P/_Tasks/A.md": { status: "offen" }, "P/_Tasks/B.md": { status: "erledigt" } },
    );
    const r = await new VaultTools(vault, async () => true, opts)
      .run("list_notes", { folder: "P/_Tasks", fields: ["status"] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content).toContain("2 von 2 Notizen");
      expect(r.content).toContain("P/_Tasks/A.md · status=offen");
      expect(r.content).not.toContain("P/Notiz.md");
    }
  });
  it("toleriert fuehrende und anhaengende Slashes des Modells", async () => {
    const vault = fakeVault({ "P/A.md": "" });
    const r = await new VaultTools(vault, async () => true, opts).run("list_notes", { folder: "/P/" });
    expect(r.ok).toBe(true);
  });
  it("blockt Traversal", async () => {
    const vault = fakeVault({ "P/A.md": "" });
    const r = await new VaultTools(vault, async () => true, opts).run("list_notes", { folder: "../geheim" });
    expect(r.ok).toBe(false);
  });
  it("nennt die Unterordner, die eine flache Liste nicht zeigt (Fall _Koda, 2026-09-25)", async () => {
    const vault = {
      ...fakeVault({ "_Koda/Memory.md": "", "_Koda/Brain/Patterns.md": "", "_Koda/Lab/Lab.md": "" }),
      listFolderPaths: () => ["/", "_Koda", "_Koda/Brain", "_Koda/Lab", "_Koda/Sessions"],
    };
    const r = await new VaultTools(vault, async () => true, opts).run("list_notes", { folder: "_Koda" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content.split("\n")[0]).toContain("3 Unterordner");
      expect(r.content).toContain("_Koda/Brain (1 Notiz)");
      expect(r.content).toContain("_Koda/Sessions (keine Notiz)");
    }
  });
  it("zeigt mit depth den Ordnerbaum statt der Unterordner-Zeile (Kodas Frage, 2026-09-26)", async () => {
    const vault = {
      ...fakeVault({ "P/A/A.md": "", "P/A/_Tasks/t.md": "", "P/B/B.md": "" }),
      listFolderPaths: () => ["P", "P/A", "P/A/_Tasks", "P/A/_Meilensteine", "P/B"],
    };
    const r = await new VaultTools(vault, async () => true, opts)
      .run("list_notes", { folder: "P", depth: 2 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content).toContain("Ordnerbaum bis Tiefe 2");
      expect(r.content).toContain("  P/A/_Meilensteine/ (keine Notiz)");
      expect(r.content).toContain("P/B/ (1 Notiz)");
      expect(r.content).not.toContain("Unterordner: ");
    }
  });
  it("nimmt depth auch als String an und faellt bei Unsinn auf 1 zurueck", async () => {
    const vault = { ...fakeVault({ "P/A/_Tasks/t.md": "" }), listFolderPaths: () => ["P", "P/A", "P/A/_Tasks"] };
    const tools = new VaultTools(vault, async () => true, opts);
    const asString = await tools.run("list_notes", { folder: "P", depth: "2" });
    const nonsense = await tools.run("list_notes", { folder: "P", depth: "tief" });
    expect(asString.ok && asString.content).toContain("  P/A/_Tasks/");
    expect(nonsense.ok && nonsense.content).toContain("Unterordner: P/A (1 Notiz)");
  });
  it("teilt sich die Zeilengrenze mit der Notizliste und meldet den gekappten Baum in Zeile 1", async () => {
    const folders = ["P"];
    for (let i = 0; i < 4; i++) folders.push(`P/${i}`, `P/${i}/_Tasks`);
    const vault = { ...fakeVault({ "P/0/x.md": "" }), listFolderPaths: () => folders };
    const r = await new VaultTools(vault, async () => true, { ...opts, listMaxRows: () => 5 })
      .run("list_notes", { folder: "P", depth: 2 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content.split("\n")[0]).toContain("ORDNERBAUM GEKAPPT: 8 Ordner bis Tiefe 2, 4 gezeigt — vollständig bis Tiefe 1");
  });
  it("meldet einen existierenden Ordner ohne Notiz als Befund, nicht als Fehler", async () => {
    const vault = { ...fakeVault({ "P/A.md": "" }), listFolderPaths: () => ["P", "P/Leer"] };
    const r = await new VaultTools(vault, async () => true, opts).run("list_notes", { folder: "P/Leer" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toContain("existiert, enthält aber keine Notiz");
  });
  it("meldet einen leeren Ordner als Fehler MIT Vorschlaegen", async () => {
    const vault = fakeVault({ "P/_Tasks/A.md": "" });
    const r = await new VaultTools(vault, async () => true, opts).run("list_notes", { folder: "P/tasks" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("P/_Tasks");
  });
  it("fragt den Frontmatter-Cache NUR fuer die gezeigten Zeilen ab", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 40; i++) files[`P/${String(i).padStart(3, "0")}.md`] = "";
    const vault = fakeVault(files);
    const tools = new VaultTools(vault, async () => true, { ...opts, listMaxRows: () => 10 });
    const r = await tools.run("list_notes", { folder: "P", fields: ["status"] });
    expect(vault.fmCalls).toHaveLength(10);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content.split("\n")[0]).toContain("UNVOLLSTÄNDIG");
  });
  it("nimmt recursive auch als String an — Modelle liefern das gemischt", async () => {
    const vault = fakeVault({ "P/U/A.md": "" });
    const r = await new VaultTools(vault, async () => true, opts)
      .run("list_notes", { folder: "P", recursive: "true" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toContain("P/U/A.md");
  });
  it("nimmt recursive auch als Zahl 1 an — sonst wird ein gemeinter rekursiver Aufruf still flach", async () => {
    const vault = fakeVault({ "P/U/A.md": "" });
    const r = await new VaultTools(vault, async () => true, opts)
      .run("list_notes", { folder: "P", recursive: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toContain("P/U/A.md");
  });
  // Regression Befund 2 (Review 2026-08-14): `str(undefined)` ergibt "", was laut Spec
  // "Vault-Wurzel" bedeutet — ein vergessenes Pflichtfeld wurde dadurch still zum
  // rekursiven Dump des ganzen Vaults statt einer Fehlermeldung.
  it("meldet fehlendes folder als Fehler, statt es zur Vault-Wurzel zu machen", async () => {
    const vault = fakeVault({ "P/A.md": "" });
    const r = await new VaultTools(vault, async () => true, opts)
      .run("list_notes", { recursive: true, fields: ["status"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("folder");
  });
  it("die AUSDRUECKLICH uebergebene Wurzel (folder: \"\") funktioniert weiterhin", async () => {
    const vault = fakeVault({ "P/A.md": "" });
    const r = await new VaultTools(vault, async () => true, opts)
      .run("list_notes", { folder: "", recursive: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toContain("P/A.md");
  });
});
