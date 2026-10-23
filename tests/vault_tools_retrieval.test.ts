import { describe, it, expect, vi } from "vitest";
import { VaultTools, type VaultPort } from "../src/obsidian/vault-tools";
import type { RetrievalApi } from "../src/core/tools/retrieval";

function vault(files: Record<string, string>): VaultPort {
  return {
    listMarkdownPaths: () => Object.keys(files),
    listFolderPaths: () => [],
    read: async (p) => {
      if (!(p in files)) throw new Error("not found");
      return files[p];
    },
    exists: async (p) => p in files,
    create: async () => {},
    append: async () => {},
    overwrite: async () => {},
    frontmatterOf: () => null,
    // Von diesen Tests nicht gerufen — ehrlich werfende Stubs statt stillem `undefined`.
    move: async () => { throw new Error("nicht erwartet: move"); },
    trash: async () => { throw new Error("nicht erwartet: trash"); },
    backlinkCount: () => { throw new Error("nicht erwartet: backlinkCount"); },
  };
}

const opts = (retrieval?: () => RetrievalApi | null) => ({
  kodaFolder: () => "Koda",
  today: () => "2026-08-13",
  retrieval,
  listMaxRows: () => 150,
});

const api = (over: Partial<RetrievalApi> = {}): RetrievalApi => ({
  apiVersion: 1,
  status: () => ({ apiVersion: 1, indexed: true, noteCount: 2 }),
  search: async () => ({ ok: true, hits: [{ path: "sem.md", score: 0.8 }] }),
  related: async () => ({ ok: true, hits: [{ path: "r.md", score: 0.7 }] }),
  ...over,
});

describe("search_notes — hybrid", () => {
  // Der Fall, an dem die alte Schwelle (< 3 Volltext-Treffer) gemessen scheiterte:
  // drei woertliche Zufallstreffer schalteten den semantischen Weg komplett ab.
  it("fragt AUCH dann semantisch nach, wenn der Volltext reichlich liefert", async () => {
    const search = vi.fn(async () => ({ ok: true as const, hits: [{ path: "sem.md", score: 0.8 }] }));
    const t = new VaultTools(
      vault({ "a.md": "plan", "b.md": "plan", "c.md": "plan" }),
      async () => true,
      opts(() => api({ search })),
    );
    const r = await t.run("search_notes", { query: "plan" });
    expect(search).toHaveBeenCalled();
    expect(r.ok && r.content).toContain("Inhaltlich ähnlich");
    expect(r.ok && r.content).toContain("sem.md (0.80)");
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

/** `related_notes` gehoert vault-rag (Welle 25): Koda traegt es nicht mehr selbst. Ohne Route zu einem Anbieter gibt es
 *  das Werkzeug nicht — auch dann nicht, wenn die Retrieval-API da ist; es laeuft nie an der Anbieter-Schnittstelle vorbei. */
describe("related_notes — kein eigener Pfad mehr", () => {
  it("antwortet ohne Anbieter-Route mit „nicht mehr verfuegbar“ und fragt die Retrieval-API nicht", async () => {
    const related = vi.fn();
    const t = new VaultTools(vault({ "a.md": "x" }), async () => true, opts(() => api({ related })));
    const r = await t.run("related_notes", { path: "a.md" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/nicht mehr verf/);
    expect(related).not.toHaveBeenCalled();
  });
});
