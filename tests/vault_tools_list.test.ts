import { VaultTools, type VaultPort } from "../src/obsidian/vault-tools";

function fakeVault(
  files: Record<string, string>,
  fm: Record<string, Record<string, unknown>> = {},
): VaultPort & { fmCalls: string[] } {
  const fmCalls: string[] = [];
  return {
    fmCalls,
    listMarkdownPaths: () => Object.keys(files),
    read: async (p) => files[p] ?? "",
    exists: async (p) => p in files,
    create: async () => undefined,
    append: async () => undefined,
    overwrite: async () => undefined,
    frontmatterOf: (p) => {
      fmCalls.push(p);
      return fm[p] ?? null;
    },
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
