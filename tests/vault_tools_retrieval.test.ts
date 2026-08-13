import { describe, it, expect, vi } from "vitest";
import { VaultTools, type VaultPort } from "../src/obsidian/vault-tools";
import type { RetrievalApi } from "../src/core/tools/retrieval";

function vault(files: Record<string, string>): VaultPort {
  return {
    listMarkdownPaths: () => Object.keys(files),
    read: async (p) => {
      if (!(p in files)) throw new Error("not found");
      return files[p];
    },
    exists: async (p) => p in files,
    create: async () => {},
    append: async () => {},
    overwrite: async () => {},
  };
}

const opts = (retrieval?: () => RetrievalApi | null) => ({
  kodaFolder: () => "Koda",
  today: () => "2026-08-13",
  retrieval,
});

const api = (over: Partial<RetrievalApi> = {}): RetrievalApi => ({
  apiVersion: 1,
  status: () => ({ apiVersion: 1, indexed: true, noteCount: 2 }),
  search: async () => ({ ok: true, hits: [{ path: "sem.md", score: 0.8 }] }),
  related: async () => ({ ok: true, hits: [{ path: "r.md", score: 0.7 }] }),
  ...over,
});

describe("search_notes — hybrid", () => {
  it("laesst die semantische Suche AUS, wenn Volltext genug liefert", async () => {
    const search = vi.fn();
    const t = new VaultTools(
      vault({ "a.md": "plan", "b.md": "plan", "c.md": "plan" }),
      async () => true,
      opts(() => api({ search })),
    );
    const r = await t.run("search_notes", { query: "plan" });
    expect(search).not.toHaveBeenCalled();
    expect(r.ok && r.content).not.toContain("Inhaltlich ähnlich");
  });

  it("fragt semantisch nach, wenn Volltext duenn bleibt", async () => {
    const t = new VaultTools(vault({ "a.md": "plan" }), async () => true, opts(() => api()));
    const r = await t.run("search_notes", { query: "plan" });
    expect(r.ok && r.content).toContain("sem.md (0.80)");
  });

  it("reicht max_results als k an die API durch", async () => {
    const search = vi.fn(async () => ({ ok: true as const, hits: [] }));
    const t = new VaultTools(vault({}), async () => true, opts(() => api({ search })));
    await t.run("search_notes", { query: "x", max_results: 4 });
    expect(search).toHaveBeenCalledWith("x", { k: 4 });
  });

  it("verhaelt sich ohne vault-rag exakt wie bisher — ohne Zusatzmeldung", async () => {
    const t = new VaultTools(vault({ "a.md": "plan" }), async () => true, opts(() => null));
    const r = await t.run("search_notes", { query: "plan" });
    expect(r.ok && r.content).toBe("a.md: …plan…");
  });

  it("verhaelt sich ohne konfiguriertes Retrieval wie bisher (opts-Feld fehlt ganz)", async () => {
    const t = new VaultTools(vault({ "a.md": "plan" }), async () => true, opts());
    const r = await t.run("search_notes", { query: "plan" });
    expect(r.ok && r.content).toBe("a.md: …plan…");
  });

  it("meldet einen Ausfall der semantischen Seite, statt ihn zu verschlucken", async () => {
    const t = new VaultTools(
      vault({ "a.md": "plan" }),
      async () => true,
      opts(() => api({ search: async () => ({ ok: false, reason: "offline" }) })),
    );
    const r = await t.run("search_notes", { query: "plan" });
    expect(r.ok && r.content).toContain("Embedding-Endpunkt nicht erreichbar");
  });

  it("laesst einen Fehler der Fremd-API die Volltextsuche nicht mitreissen", async () => {
    const t = new VaultTools(
      vault({ "a.md": "plan" }),
      async () => true,
      opts(() => api({ search: async () => { throw new Error("boom"); } })),
    );
    const r = await t.run("search_notes", { query: "plan" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.content).toContain("a.md");
  });
});

describe("related_notes", () => {
  it("liefert verwandte Notizen", async () => {
    const t = new VaultTools(vault({ "a.md": "x" }), async () => true, opts(() => api()));
    const r = await t.run("related_notes", { path: "a.md" });
    expect(r.ok && r.content).toContain("r.md (0.70)");
  });

  it("meldet klar, wenn die API zwischenzeitlich verschwunden ist", async () => {
    const t = new VaultTools(vault({ "a.md": "x" }), async () => true, opts(() => null));
    const r = await t.run("related_notes", { path: "a.md" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("nicht verfügbar");
  });

  it("nutzt denselben Pfad-Guard wie read_note — Traversal wird geblockt", async () => {
    const related = vi.fn();
    const t = new VaultTools(vault({}), async () => true, opts(() => api({ related })));
    const r = await t.run("related_notes", { path: "../geheim.md" });
    expect(r.ok).toBe(false);
    expect(related).not.toHaveBeenCalled();
  });

  it("reicht den normalisierten Pfad an die API", async () => {
    const related = vi.fn(async () => ({ ok: true as const, hits: [] }));
    const t = new VaultTools(vault({}), async () => true, opts(() => api({ related })));
    await t.run("related_notes", { path: "Ordner//Notiz.md" });
    expect(related).toHaveBeenCalledWith("Ordner/Notiz.md");
  });

  it("meldet eine nicht indexierte Notiz mit Klartext", async () => {
    const t = new VaultTools(vault({}), async () => true, opts(() => api({
      related: async () => ({ ok: false, reason: "not-indexed", path: "a.md" }),
    })));
    const r = await t.run("related_notes", { path: "a.md" });
    expect(r.ok && r.content).toContain("nicht im Index");
  });
});

describe("related_notes — not-indexed ist nicht immer voruebergehend", () => {
  const notIndexed = api({ related: async () => ({ ok: false, reason: "not-indexed", path: "a.md" }) });

  it("raet bei einer Notiz aus reinem Frontmatter vom Wiederholen AB", async () => {
    const t = new VaultTools(
      vault({ "a.md": "---\ndescription: x\n---\n" }), async () => true, opts(() => notIndexed),
    );
    const r = await t.run("related_notes", { path: "a.md" });
    expect(r.ok && r.content).toContain("derzeit keinen indexierbaren Inhalt");
    // Bedingt, nicht endgueltig: die Notiz ist nicht dauerhaft ausgeschlossen.
    expect(r.ok && r.content).toContain("solange das so bleibt");
    expect(r.ok && r.content).toContain("erst Inhalt schreiben");
  });

  it("raet bei einer Notiz mit Text ZUM Wiederholen", async () => {
    const t = new VaultTools(
      vault({ "a.md": "---\ndescription: x\n---\nEin echter Satz." }), async () => true, opts(() => notIndexed),
    );
    const r = await t.run("related_notes", { path: "a.md" });
    expect(r.ok && r.content).toContain("Gleich noch einmal versuchen");
  });

  it("bleibt unbestimmt, wenn die Notiz nicht lesbar ist", async () => {
    const t = new VaultTools(vault({}), async () => true, opts(() => notIndexed));
    const r = await t.run("related_notes", { path: "a.md" });
    expect(r.ok && r.content).toContain("nicht im Index");
    expect(r.ok && r.content).not.toContain("derzeit keinen indexierbaren");
  });

  it("liest die Notiz NICHT, wenn die Abfrage normal gelingt", async () => {
    let reads = 0;
    const v = vault({ "a.md": "x" });
    const counting = { ...v, read: async (p: string) => { reads++; return v.read(p); } };
    const t = new VaultTools(counting, async () => true, opts(() => api()));
    await t.run("related_notes", { path: "a.md" });
    expect(reads).toBe(0);
  });
});
