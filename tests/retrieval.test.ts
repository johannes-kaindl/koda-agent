import { describe, it, expect } from "vitest";
import {
  formatSearchResult,
} from "../src/core/tools/retrieval";

describe("formatSearchResult", () => {
  const t = [{ path: "a.md", snippet: "…Plan…" }];

  it("zeigt ohne semantischen Teil nur die Volltext-Liste ohne Ueberschrift", () => {
    expect(formatSearchResult(t, null)).toBe("a.md: …Plan…");
  });

  it("beschriftet beide Bloecke, wenn semantische Treffer dazukommen", () => {
    const out = formatSearchResult(t, { ok: true, hits: [{ path: "b.md", score: 0.7123 }] });
    expect(out).toContain("Volltext (wörtlich gefunden):");
    expect(out).toContain("a.md: …Plan…");
    expect(out).toContain("Inhaltlich ähnlich (semantisch/Index, 0–1):");
    expect(out).toContain("b.md (0.71)");
  });

  it("nennt einen Pfad nur EINMAL — im Volltext-Block, mit Score-Vermerk", () => {
    const out = formatSearchResult(t, { ok: true, hits: [{ path: "a.md", score: 0.9 }] });
    expect(out.match(/a\.md/g)).toHaveLength(1);
    expect(out).toContain("a.md: …Plan… (0.90)");
    expect(out).not.toContain("Inhaltlich ähnlich");
  });

  it("meldet fehlenden Index als Klartextzeile statt still zu schweigen", () => {
    expect(formatSearchResult(t, { ok: false, reason: "no-index" }))
      .toContain("semantisch: kein Index vorhanden");
  });

  it("meldet einen nicht erreichbaren Embedding-Endpunkt", () => {
    expect(formatSearchResult(t, { ok: false, reason: "offline" }))
      .toContain("semantisch: Embedding-Endpunkt nicht erreichbar");
  });

  it("meldet pausierte semantische Suche ehrlich und bleibt bei Volltext", () => {
    const out = formatSearchResult(t, { ok: false, reason: "paused" });
    expect(out).toContain("Die semantische Suche ist pausiert");
    expect(out).toContain("Volltext");
    expect(out).not.toContain("nicht erreichbar");
  });

  it("nennt die Pause auch bei null Volltext-Treffern", () => {
    const out = formatSearchResult([], { ok: false, reason: "paused" });
    expect(out).toContain("Keine Volltext-Treffer");
    expect(out).toContain("Die semantische Suche ist pausiert");
  });

  it("sagt bei null Treffern beider Wege deutlich, dass nichts gefunden wurde", () => {
    const out = formatSearchResult([], { ok: true, hits: [] });
    expect(out).toContain("Keine Treffer");
  });

  it("meldet den Ausfall auch dann, wenn die Volltextsuche selbst leer blieb", () => {
    const out = formatSearchResult([], { ok: false, reason: "offline" });
    expect(out).toContain("Keine Volltext-Treffer");
    expect(out).toContain("Embedding-Endpunkt nicht erreichbar");
  });

  // Der leere Fall bekommt je Grund einen eigenen Satz: „Keine Treffer. (semantisch: …)“ las sich, als sei die GANZE Suche leer.
  it("im leeren Fall sagt jeder Grund: keine Volltext-Treffer, und warum die semantische Suche fehlt", () => {
    const gruende: [Parameters<typeof formatSearchResult>[1], string][] = [
      [{ ok: false, reason: "no-index" }, "kein Index vorhanden"],
      [{ ok: false, reason: "offline" }, "Embedding-Endpunkt nicht erreichbar"],
      [{ ok: false, reason: "paused" }, "Die semantische Suche ist pausiert"],
      [{ ok: false, reason: "not-indexed", path: "x.md" }, '"x.md" nicht im Index'],
    ];
    const texte = gruende.map(([r, teil]) => {
      const out = formatSearchResult([], r);
      expect(out).toMatch(/^Keine Volltext-Treffer\. /);
      expect(out).toContain(teil);
      expect(out).not.toContain("Keine Treffer");
      expect(out).not.toMatch(/^\(/m);
      return out;
    });
    expect(new Set(texte).size).toBe(4);
  });

  it("Gegenprobe: mit Volltext-Treffer bleibt die Ausfallnotiz die Klammer unter der Liste", () => {
    for (const reason of ["no-index", "offline", "paused"] as const) {
      const out = formatSearchResult(t, { ok: false, reason });
      expect(out.startsWith("a.md: …Plan…\n(")).toBe(true);
      expect(out).not.toContain("Keine Volltext-Treffer");
    }
  });

  it("ohne Ausfall und ohne Treffer bleibt es bei „Keine Treffer.“", () => {
    expect(formatSearchResult([], null)).toBe("Keine Treffer.");
    expect(formatSearchResult([], { ok: true, hits: [] })).toBe("Keine Treffer.");
  });
});
