import { describe, it, expect } from "vitest";
import {
  needsSemantic, SEMANTIC_THRESHOLD, formatSearchResult, formatRelatedResult, hasIndexableText,
} from "../src/core/tools/retrieval";

describe("Schwelle", () => {
  it("fragt semantisch nur unterhalb der Schwelle", () => {
    expect(needsSemantic(0)).toBe(true);
    expect(needsSemantic(SEMANTIC_THRESHOLD - 1)).toBe(true);
    expect(needsSemantic(SEMANTIC_THRESHOLD)).toBe(false);
    expect(needsSemantic(10)).toBe(false);
  });
});

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

  it("sagt bei null Treffern beider Wege deutlich, dass nichts gefunden wurde", () => {
    const out = formatSearchResult([], { ok: true, hits: [] });
    expect(out).toContain("Keine Treffer");
  });

  it("meldet den Ausfall auch dann, wenn die Volltextsuche selbst leer blieb", () => {
    const out = formatSearchResult([], { ok: false, reason: "offline" });
    expect(out).toContain("Keine Treffer");
    expect(out).toContain("Embedding-Endpunkt nicht erreichbar");
  });
});

describe("formatRelatedResult", () => {
  it("listet verwandte Notizen mit Score", () => {
    const out = formatRelatedResult({ ok: true, hits: [{ path: "b.md", score: 0.66 }] }, "a.md");
    expect(out).toBe("Verwandt zu a.md:\nb.md (0.66)");
  });

  it("meldet eine nicht indexierte Notiz als solche", () => {
    expect(formatRelatedResult({ ok: false, reason: "not-indexed", path: "x.md" }, "x.md"))
      .toContain("nicht im Index");
  });

  it("meldet fehlenden Index", () => {
    expect(formatRelatedResult({ ok: false, reason: "no-index" }, "a.md"))
      .toContain("kein Index vorhanden");
  });

  it("sagt bei leerer Trefferliste, dass nichts Verwandtes gefunden wurde", () => {
    expect(formatRelatedResult({ ok: true, hits: [] }, "a.md")).toContain("nichts");
  });
});

describe("formatRelatedResult — not-indexed unterscheiden", () => {
  const notIndexed = { ok: false, reason: "not-indexed", path: "a.md" } as const;

  it("sagt bei vorhandenem Text, dass der Index noch nachzieht", () => {
    const out = formatRelatedResult(notIndexed, "a.md", true);
    expect(out).toContain("noch nicht");
    expect(out).not.toContain("keinen indexierbaren");
  });

  it("sagt bei leerer Notiz, dass es NIE passieren wird — kein Warten auf nichts", () => {
    const out = formatRelatedResult(notIndexed, "a.md", false);
    expect(out).toContain("derzeit keinen indexierbaren");
    expect(out).toContain("solange das so bleibt");
    expect(out).not.toContain("noch nicht");
  });

  it("bleibt vorsichtig, wenn der Inhalt unbekannt ist", () => {
    const out = formatRelatedResult(notIndexed, "a.md", null);
    expect(out).toContain("nicht im Index");
  });

  it("ignoriert das Textwissen bei jedem anderen Ergebnis", () => {
    expect(formatRelatedResult({ ok: true, hits: [] }, "a.md", false)).toContain("nichts");
    expect(formatRelatedResult({ ok: false, reason: "no-index" }, "a.md", false))
      .toContain("kein Index vorhanden");
  });
});

describe("hasIndexableText", () => {
  it("erkennt eine Notiz aus reinem Frontmatter als leer", () => {
    expect(hasIndexableText("---\ndescription: x\nenabled: true\n---\n")).toBe(false);
  });

  it("erkennt eine voellig leere Datei als leer", () => {
    expect(hasIndexableText("")).toBe(false);
    expect(hasIndexableText("   \n\n  ")).toBe(false);
  });

  it("erkennt Text unterhalb des Frontmatters", () => {
    expect(hasIndexableText("---\ndescription: x\n---\nEin Satz.")).toBe(true);
  });

  it("erkennt eine Notiz ohne Frontmatter mit Text", () => {
    expect(hasIndexableText("Nur Fliesstext.")).toBe(true);
  });
});
