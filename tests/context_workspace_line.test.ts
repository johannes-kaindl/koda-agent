import { renderWorkspaceContext, renderWorkspaceReport, renderFrontmatter } from "../src/core/context/workspace-line";
import type { WorkspaceSnapshot } from "../src/core/context/ports";

const snap: WorkspaceSnapshot = {
  active: {
    path: "Notes/Project plan.md",
    frontmatter: { status: "active", area: "plugin", tags: ["koda", "plan"], position: { start: 0 } },
    selection: "Model control",
    cursorLine: 9,
    lineCount: 11,
  },
  tabs: [
    { path: "Notes/Project plan.md", viewType: "markdown" },
    { path: "Notes/Tools.md", viewType: "markdown" },
    { path: "Board.canvas", viewType: "canvas" },
  ],
};
const opts = { lang: "de" as const, selectionMax: 600, tabsMax: 12, frontmatterMax: 300 };

describe("renderWorkspaceContext", () => {
  it("nennt aktive Notiz, Zeile, Kopfdaten, Markierung und Tabs — nur Zeiger, keine Inhalte", () => {
    const ctx = renderWorkspaceContext(snap, opts);
    expect(ctx.mode).toBe("workspace");
    expect(ctx.text).toContain("[Arbeitskontext · Arbeitsplatz]");
    expect(ctx.text).toContain("Aktive Notiz: Notes/Project plan.md · Zeile 9 von 11");
    expect(ctx.text).toContain("Kopfdaten: status: active · area: plugin · tags: koda, plan");
    expect(ctx.text).not.toContain("position");
    expect(ctx.text).toContain("Markierung (13 Zeichen): „Model control“");
    expect(ctx.text).toContain("Offene Tabs (3): Notes/Project plan.md · Notes/Tools.md · Board.canvas");
    expect(ctx.text).toContain("get_workspace()");
    expect(ctx.items).toEqual([
      { source: "active", path: "Notes/Project plan.md", kind: "pointer", chars: expect.any(Number) },
      { source: "selection", path: "Notes/Project plan.md", kind: "pointer", chars: 13 },
      { source: "tab", path: "Notes/Project plan.md", kind: "pointer", chars: 21 },
      { source: "tab", path: "Notes/Tools.md", kind: "pointer", chars: 14 },
      { source: "tab", path: "Board.canvas", kind: "pointer", chars: 12 },
    ]);
  });
  it("kuerzt die Markierung sichtbar und nennt den Weg zum Rest", () => {
    const long = { ...snap, active: { ...snap.active!, selection: "x".repeat(1000) } };
    const ctx = renderWorkspaceContext(long, { ...opts, selectionMax: 100 });
    expect(ctx.text).toContain("Markierung (1000 Zeichen, gekürzt auf 100, vollständig über get_workspace)");
    expect(ctx.items[1]).toMatchObject({ source: "selection", chars: 100, fullChars: 1000 });
  });
  it("kappt die Tab-Liste mit Zaehler und laesst weitere weg", () => {
    const many = { ...snap, tabs: Array.from({ length: 15 }, (_, i) => ({ path: `N${i}.md`, viewType: "markdown" })) };
    const ctx = renderWorkspaceContext(many, { ...opts, tabsMax: 12 });
    expect(ctx.text).toContain("Offene Tabs (15):");
    expect(ctx.text).toContain("… und 3 weitere (vollständig über get_workspace)");
    expect(ctx.items.filter((i) => i.source === "tab")).toHaveLength(12);
  });
  it("ohne aktive Notiz und ohne Tabs sagt der Block das — und liefert trotzdem einen Block", () => {
    const ctx = renderWorkspaceContext({ active: null, tabs: [] }, opts);
    expect(ctx.text).toContain("Aktive Notiz: keine (kein Editor im Hauptbereich)");
    expect(ctx.text).toContain("Offene Tabs: keine");
    expect(ctx.items).toEqual([]);
  });
  it("frontmatterMax 0 laesst die Kopfdaten weg; leere Markierung ergibt keine Markierungszeile", () => {
    const ctx = renderWorkspaceContext({ ...snap, active: { ...snap.active!, selection: "" } }, { ...opts, frontmatterMax: 0 });
    expect(ctx.text).not.toContain("Kopfdaten");
    expect(ctx.text).not.toContain("Markierung");
    expect(ctx.items.some((i) => i.source === "selection")).toBe(false);
  });
  it("englisch", () => {
    const ctx = renderWorkspaceContext(snap, { ...opts, lang: "en" });
    expect(ctx.text).toContain("[Working context · Workspace]");
    expect(ctx.text).toContain("Active note: Notes/Project plan.md · line 9 of 11");
    expect(ctx.text).toContain("Selection (13 chars)");
    expect(ctx.text).toContain("Open tabs (3)");
  });
});

describe("renderFrontmatter", () => {
  it("rendert Skalare, Listen und Objekte, laesst position weg, kappt mit Ellipse", () => {
    expect(renderFrontmatter({ a: 1, b: true, c: ["x", "y"], d: { k: 1 }, position: {} }, 300)).toBe("a: 1 · b: true · c: x, y · d: {\"k\":1}");
    expect(renderFrontmatter({ a: "x".repeat(50) }, 10)).toBe("a: xxxxxx…");
    expect(renderFrontmatter(null, 300)).toBe("");
  });
});

describe("renderWorkspaceReport", () => {
  it("liefert Markierung und Cursor-Umgebung vollstaendig und alle Tabs mit Typ", () => {
    const text = renderWorkspaceReport(snap, { from: 7, lines: ["", "# Project plan", "", "Model control makes"] }, "de");
    expect(text).toContain("Aktive Notiz: Notes/Project plan.md · Zeile 9 von 11");
    expect(text).toContain("Markierung (13 Zeichen):\nModel control");
    expect(text).toContain("Cursor-Umgebung (Zeilen 7–10):");
    expect(text).toContain("    8 | # Project plan");
    expect(text).toContain("- Board.canvas (canvas)");
  });
  it("ohne Editor nennt er das statt zu schweigen", () => {
    const text = renderWorkspaceReport({ active: null, tabs: [] }, null, "de");
    expect(text).toContain("Aktive Notiz: keine");
    expect(text).not.toContain("Cursor-Umgebung");
  });
});
