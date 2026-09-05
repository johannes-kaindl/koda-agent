/* Welche Notizen ein Volltext-Modus anbietet. Die drei Regeln, die hier gepinnt werden,
 * stehen so in der Spec (E3): jede Notiz nur einmal, die aktive Notiz nie als eigener
 * Nachbar, unaufgeloeste Links gibt es nicht (der Port liefert sie gar nicht erst). */
import { describe, it, expect } from "vitest";
import { collectCandidates } from "../src/core/context/candidates";
import type { LinkPort, WorkspaceSnapshot } from "../src/core/context/ports";

const LINKS: Record<string, string[]> = {
  "A.md": ["B.md", "C.md"],
  "B.md": ["D.md"],
  "C.md": [],
  "D.md": [],
  "Z.md": ["A.md"],
};

const links: LinkPort = {
  outgoing: (p) => LINKS[p] ?? [],
  backlinks: (p) => Object.keys(LINKS).filter((q) => q !== p && (LINKS[q] ?? []).includes(p)),
};

function snap(activePath: string | null, tabs: string[] = []): WorkspaceSnapshot {
  return {
    active: activePath === null ? null : { path: activePath, frontmatter: null, selection: "", cursorLine: 1, lineCount: 1 },
    tabs: tabs.map((path) => ({ path, viewType: "markdown" })),
  };
}

describe("collectCandidates — Modus Notiz", () => {
  it("nimmt die aktive Notiz, ihre ausgehenden Links und ihre Backlinks auf Ebene 1", () => {
    const out = collectCandidates({ mode: "note", snap: snap("A.md"), links, linkDepth: 1, manual: [] });
    expect(out).toEqual([
      { source: "active", path: "A.md" },
      { source: "link", path: "B.md", depth: 1 },
      { source: "link", path: "C.md", depth: 1 },
      { source: "backlink", path: "Z.md", depth: 1 },
    ]);
  });

  it("geht bei Tiefe 2 eine Ebene weiter und zaehlt jede Notiz nur einmal", () => {
    const out = collectCandidates({ mode: "note", snap: snap("A.md"), links, linkDepth: 2, manual: [] });
    const pfade = out.map((c) => c.path);
    expect(pfade).toContain("D.md");
    expect(new Set(pfade).size).toBe(pfade.length);
    expect(out.find((c) => c.path === "D.md")?.depth).toBe(2);
  });

  it("nimmt die aktive Notiz nie als eigenen Nachbarn auf", () => {
    // A.md ist Backlink-Ziel von Z.md, und Z.md verlinkt auf A.md — bei Tiefe 2 taucht
    // A.md als Nachbar von Z.md wieder auf. Genau das darf nicht passieren.
    const out = collectCandidates({ mode: "note", snap: snap("A.md"), links, linkDepth: 2, manual: [] });
    expect(out.filter((c) => c.path === "A.md")).toHaveLength(1);
    expect(out[0]).toEqual({ source: "active", path: "A.md" });
  });

  it("liefert ohne aktive Notiz nur das Manuelle", () => {
    const out = collectCandidates({ mode: "note", snap: snap(null), links, linkDepth: 2, manual: ["M.md"] });
    expect(out).toEqual([{ source: "manual", path: "M.md" }]);
  });
});

describe("collectCandidates — Modus Alle Tabs", () => {
  it("nimmt jeden offenen Tab, entdoppelt, und die aktive Notiz als aktiv", () => {
    const out = collectCandidates({
      mode: "tabs", snap: snap("A.md", ["A.md", "B.md", "B.md"]), links, linkDepth: 1, manual: [],
    });
    expect(out).toEqual([
      { source: "active", path: "A.md" },
      { source: "tab", path: "B.md" },
    ]);
  });

  it("sammelt keine Links ein", () => {
    const out = collectCandidates({ mode: "tabs", snap: snap("A.md", ["A.md"]), links, linkDepth: 3, manual: [] });
    expect(out.some((c) => c.source === "link" || c.source === "backlink")).toBe(false);
  });
});

describe("collectCandidates — Manuelles quer zu beiden Modi", () => {
  it("stellt Manuelles vor Automatisches, aber hinter die aktive Notiz", () => {
    const out = collectCandidates({ mode: "note", snap: snap("A.md"), links, linkDepth: 1, manual: ["M.md"] });
    expect(out.map((c) => c.source)).toEqual(["active", "manual", "link", "link", "backlink"]);
  });

  it("laesst eine manuell hinzugefuegte Notiz nicht doppelt erscheinen", () => {
    const out = collectCandidates({ mode: "note", snap: snap("A.md"), links, linkDepth: 1, manual: ["B.md"] });
    expect(out.filter((c) => c.path === "B.md")).toEqual([{ source: "manual", path: "B.md" }]);
  });

  it("behaelt die Reihenfolge der manuellen Eintraege", () => {
    const out = collectCandidates({ mode: "tabs", snap: snap(null), links, linkDepth: 1, manual: ["z.md", "a.md"] });
    expect(out.map((c) => c.path)).toEqual(["z.md", "a.md"]);
  });

  it("verkuerzt die Link-Nachbarschaft NICHT, wenn ein Zwischenknoten manuell hinzugefuegt wurde (Befund 1)", () => {
    // Graph A -> B -> C. Ohne manuellen Eintrag liefert Tiefe 2 A, B@1, C@2. Wuerde die
    // BFS den manuell schon eingesammelten Knoten B nicht mehr expandieren, verschwaende
    // C.md aus der Nachbarschaft, obwohl der Nutzer nur einen zusaetzlichen Knoten
    // hinzugefuegt und keinen entfernt hat.
    const kette: Record<string, string[]> = { "A.md": ["B.md"], "B.md": ["C.md"], "C.md": [] };
    const linksKette: LinkPort = {
      outgoing: (p) => kette[p] ?? [],
      backlinks: () => [],
    };
    const out = collectCandidates({
      mode: "note", snap: snap("A.md"), links: linksKette, linkDepth: 2, manual: ["B.md"],
    });
    expect(out).toEqual([
      { source: "active", path: "A.md" },
      { source: "manual", path: "B.md" },
      { source: "link", path: "C.md", depth: 2 },
    ]);
  });
});
