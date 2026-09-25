import { describe, it, expect } from "vitest";
import { collectCandidates } from "../src/core/context/candidates";
import type { LinkPort, WorkspaceSnapshot } from "../src/core/context/ports";

const snap: WorkspaceSnapshot = {
  active: { path: "A.md", frontmatter: null, selection: "", cursorLine: 1, lineCount: 1 },
  tabs: [{ path: "A.md", viewType: "markdown" }, { path: "T.md", viewType: "markdown" }],
};
const links: LinkPort = {
  outgoing: (p) => (p === "A.md" ? ["B.md"] : []),
  backlinks: (p) => (p === "A.md" ? ["C.md"] : []),
};

describe("collectCandidates — Modus Vault", () => {
  it("aktive Notiz, dann Manuelles, dann Treffer; Dubletten nur einmal", () => {
    const out = collectCandidates({
      mode: "vault", snap, links, linkDepth: 1, manual: ["M.md"],
      semantic: ["V1.md", "A.md", "M.md", "V2.md"],
    });
    expect(out).toEqual([
      { source: "active", path: "A.md" },
      { source: "manual", path: "M.md" },
      { source: "vault", path: "V1.md" },
      { source: "vault", path: "V2.md" },
    ]);
  });
  it("liefert Treffer auch ohne aktive Notiz", () => {
    const out = collectCandidates({
      mode: "vault", snap: { active: null, tabs: [] }, links, linkDepth: 1, manual: [], semantic: ["V1.md"],
    });
    expect(out).toEqual([{ source: "vault", path: "V1.md" }]);
  });
  it("folgt keinen Links und nimmt keine Tabs", () => {
    const out = collectCandidates({ mode: "vault", snap, links, linkDepth: 2, manual: [], semantic: [] });
    expect(out).toEqual([{ source: "active", path: "A.md" }]);
  });
});

describe("collectCandidates — semantische Nachbarn im Modus Notiz", () => {
  it("haengt related() nach den Backlinks an, ohne depth; ein schon verlinkter Pfad bleibt link", () => {
    const out = collectCandidates({
      mode: "note", snap, links, linkDepth: 1, manual: [], semantic: ["B.md", "R.md"],
    });
    expect(out).toEqual([
      { source: "active", path: "A.md" },
      { source: "link", path: "B.md", depth: 1 },
      { source: "backlink", path: "C.md", depth: 1 },
      { source: "related", path: "R.md" },
    ]);
  });
  it("ohne semantic bleibt alles wie in Etappe 2", () => {
    const out = collectCandidates({ mode: "note", snap, links, linkDepth: 1, manual: [] });
    expect(out.map((c) => c.source)).toEqual(["active", "link", "backlink"]);
  });
  it("Modus Alle Tabs ignoriert semantic", () => {
    const out = collectCandidates({ mode: "tabs", snap, links, linkDepth: 1, manual: [], semantic: ["R.md"] });
    expect(out.map((c) => c.path)).toEqual(["A.md", "T.md"]);
  });
});
