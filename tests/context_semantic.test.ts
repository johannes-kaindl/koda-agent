/* Treffer aus vault-rag als WERT: der Vault-Modus meldet einen Fehler, der Modus Notiz
 * schweigt (Spec, Etappe-3-Zuschnitt Punkte 2 und 4). */
import { describe, it, expect, vi } from "vitest";
import { fetchSemanticHits, semanticNotice, NO_HITS } from "../src/core/context/semantic";
import type { ApiResult, RetrievalApi } from "../src/core/tools/retrieval";

function api(search: ApiResult, related: ApiResult = search, indexed = true): RetrievalApi & { search: ReturnType<typeof vi.fn>; related: ReturnType<typeof vi.fn> } {
  return {
    apiVersion: 1,
    status: () => ({ apiVersion: 1, indexed, noteCount: 3 }),
    search: vi.fn(() => Promise.resolve(search)),
    related: vi.fn(() => Promise.resolve(related)),
  };
}
const ok: ApiResult = { ok: true, hits: [{ path: "V1.md", score: 0.9 }, { path: "V2.md", score: 0.8 }] };

describe("fetchSemanticHits — Modus Vault", () => {
  it("sucht mit der getrimmten Frage und K, liefert die Pfade in Trefferreihenfolge", async () => {
    const a = api(ok);
    const hits = await fetchSemanticHits(a, { mode: "vault", query: "  Wie geht Verdichtung?  ", activePath: null, k: 5 });
    expect(hits).toEqual({ kind: "ok", paths: ["V1.md", "V2.md"] });
    expect(a.search).toHaveBeenCalledWith("Wie geht Verdichtung?", { k: 5 });
  });
  it("fragt bei weniger als drei Zeichen gar nicht erst", async () => {
    const a = api(ok);
    expect(await fetchSemanticHits(a, { mode: "vault", query: "ab", activePath: null, k: 5 })).toEqual(NO_HITS);
    expect(a.search).not.toHaveBeenCalled();
  });
  it("K = 0 schaltet ab, ohne zu fragen", async () => {
    const a = api(ok);
    expect(await fetchSemanticHits(a, { mode: "vault", query: "Frage", activePath: null, k: 0 })).toEqual(NO_HITS);
    expect(a.search).not.toHaveBeenCalled();
  });
  it("ohne vault-rag: failed/absent — der Block soll es sagen", async () => {
    expect(await fetchSemanticHits(null, { mode: "vault", query: "Frage", activePath: null, k: 5 }))
      .toEqual({ kind: "failed", reason: "absent" });
  });
  it("reicht den Grund der API durch", async () => {
    const a = api({ ok: false, reason: "offline" });
    expect(await fetchSemanticHits(a, { mode: "vault", query: "Frage", activePath: null, k: 5 }))
      .toEqual({ kind: "failed", reason: "offline" });
  });
  it("ein Wurf im fremden Plugin wird zu failed/error, nicht zu einer Ausnahme", async () => {
    const a = api(ok);
    a.search.mockImplementation(() => Promise.reject(new Error("kaputt")));
    expect(await fetchSemanticHits(a, { mode: "vault", query: "Frage", activePath: null, k: 5 }))
      .toEqual({ kind: "failed", reason: "error" });
  });
});

describe("fetchSemanticHits — Modus Notiz", () => {
  it("fragt related() fuer die aktive Notiz", async () => {
    const a = api(ok);
    const hits = await fetchSemanticHits(a, { mode: "note", query: "", activePath: "A.md", k: 3 });
    expect(hits).toEqual({ kind: "ok", paths: ["V1.md", "V2.md"] });
    expect(a.related).toHaveBeenCalledWith("A.md", { k: 3 });
  });
  it("schweigt ohne vault-rag, ohne Index, ohne aktive Notiz und bei Fehlern", async () => {
    const req = { mode: "note" as const, query: "", activePath: "A.md", k: 3 };
    expect(await fetchSemanticHits(null, req)).toEqual(NO_HITS);
    expect(await fetchSemanticHits(api(ok, ok, false), req)).toEqual(NO_HITS);
    expect(await fetchSemanticHits(api(ok), { ...req, activePath: null })).toEqual(NO_HITS);
    expect(await fetchSemanticHits(api(ok, { ok: false, reason: "not-indexed", path: "A.md" }), req)).toEqual(NO_HITS);
  });
});

describe("fetchSemanticHits — andere Modi", () => {
  it("fragt in Arbeitsplatz und Alle Tabs nie", async () => {
    const a = api(ok);
    for (const mode of ["off", "workspace", "tabs"] as const) {
      expect(await fetchSemanticHits(a, { mode, query: "Frage", activePath: "A.md", k: 5 })).toEqual(NO_HITS);
    }
    expect(a.search).not.toHaveBeenCalled();
    expect(a.related).not.toHaveBeenCalled();
  });
});

describe("semanticNotice", () => {
  it("nennt den Grund in beiden Sprachen", () => {
    expect(semanticNotice("offline", "de")).toContain("Vault-Suche nicht verfügbar");
    expect(semanticNotice("absent", "de")).toContain("vault-rag");
    expect(semanticNotice("offline", "en")).toContain("Vault search unavailable");
  });
});
