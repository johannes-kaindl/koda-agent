import { buildPanelViewModel } from "../src/core/context/panel-vm";
import { itemKey } from "../src/core/context/selection";
import type { WorkspaceSnapshot } from "../src/core/context/ports";

const snap: WorkspaceSnapshot = {
  active: { path: "Notes/Project plan.md", frontmatter: { status: "active" }, selection: "Model control", cursorLine: 9, lineCount: 11 },
  tabs: [
    { path: "Notes/Project plan.md", viewType: "markdown" },
    { path: "Notes/Tools.md", viewType: "markdown" },
  ],
};
const opts = { lang: "de" as const, selectionMax: 600, tabsMax: 12, frontmatterMax: 300, windowTokens: 8192 };

describe("buildPanelViewModel", () => {
  it("zeigt Arbeitsplatz-Chips fuer aktive Notiz, Markierung und Tabs", () => {
    const vm = buildPanelViewModel(snap, new Set(), opts);
    const ws = vm.sections.find((s) => s.id === "workspace");
    expect(ws?.chips.map((c) => c.source)).toEqual(["active", "selection", "tab", "tab"]);
    expect(ws?.chips[0]?.label).toBe("Project plan");
    expect(ws?.chips[1]?.hint).toBe("13 Z.");
  });
  it("zeigt der aktiven Notiz auch ihren eigenen Tab-Chip — abwaehlbar wie jeder andere Tab", () => {
    const vm = buildPanelViewModel(snap, new Set(), opts);
    const ws = vm.sections.find((s) => s.id === "workspace");
    const tabs = ws?.chips.filter((c) => c.source === "tab") ?? [];
    expect(tabs.map((c) => c.path)).toEqual(["Notes/Project plan.md", "Notes/Tools.md"]);
    expect(tabs[0]?.hint).toBe("auch als Tab");
    expect(tabs[1]?.hint).toBe("");
  });
  it("zieht denselben Tab-Pfad ECHT zusammen, wenn er zweimal im Snapshot steht", () => {
    const dup: WorkspaceSnapshot = {
      active: null,
      tabs: [
        { path: "Notes/Tools.md", viewType: "markdown" },
        { path: "Notes/Tools.md", viewType: "markdown" },
      ],
    };
    const vm = buildPanelViewModel(dup, new Set(), opts);
    const tabs = vm.sections.find((s) => s.id === "workspace")?.chips.filter((c) => c.source === "tab") ?? [];
    expect(tabs.map((c) => c.path)).toEqual(["Notes/Tools.md"]);
  });
  it("markiert abgewaehlte Chips, entfernt sie aber nicht — sonst waeren sie unerreichbar", () => {
    const vm = buildPanelViewModel(snap, new Set([itemKey("tab", "Notes/Tools.md")]), opts);
    const chip = vm.sections[0]?.chips.find((c) => c.path === "Notes/Tools.md");
    expect(chip?.off).toBe(true);
    expect(vm.hasOff).toBe(true);
  });
  it("die Messung nimmt den GEFILTERTEN Block, nicht den vollen", () => {
    // Geprueft wird `chars`, nicht `summary`: die Summenzeile rundet auf 0,1 KB, und bei
    // einem Block dieser Groesse liefern ein und zwei Tabs dieselbe Zeichenkette. Der Test
    // waere falsch-rot gewesen, ohne dass am Code etwas falsch ist.
    const voll = buildPanelViewModel(snap, new Set(), opts).chars;
    const knapp = buildPanelViewModel(snap, new Set([itemKey("tab", "Notes/Tools.md")]), opts).chars;
    expect(knapp).toBeLessThan(voll);
  });
  it("meldet is-ok knapp UNTER der 80%-Schwelle", () => {
    // Der volle Block hat 299 Zeichen (chars/4/windowTokens*100, gerundet). Bei
    // windowTokens=95 ergibt das pct=79 — ermittelt durch Auslesen von
    // buildPanelViewModel(...).chars, nicht geraten.
    const knapp = buildPanelViewModel(snap, new Set(), { ...opts, windowTokens: 95 });
    expect(knapp.state).toBe("is-ok");
  });
  it("meldet is-warning knapp UEBER der 80%-Schwelle", () => {
    // Derselbe Block bei windowTokens=94 ergibt pct=80 (is-warning).
    const drueber = buildPanelViewModel(snap, new Set(), { ...opts, windowTokens: 94 });
    expect(drueber.state).toBe("is-warning");
  });
  it("ohne aktive Notiz und ohne Tabs bleibt ein Empty-State statt einer leeren Flaeche", () => {
    const vm = buildPanelViewModel({ active: null, tabs: [] }, new Set(), opts);
    expect(vm.sections[0]?.chips).toEqual([]);
    expect(vm.sections[0]?.empty).not.toBe("");
  });
  it("der Markierungs-Chip zeigt abgewaehlt, wenn die aktive Notiz abgewaehlt ist (Befund 4)", () => {
    // active=off nimmt die Markierung inhaltlich mit (selection.ts) — der Chip muss das
    // ANZEIGEN, auch ohne eigenen contextOff-Eintrag fuer "selection".
    const vm = buildPanelViewModel(snap, new Set([itemKey("active", "Notes/Project plan.md")]), opts);
    const ws = vm.sections.find((s) => s.id === "workspace");
    const selection = ws?.chips.find((c) => c.source === "selection");
    expect(selection?.off).toBe(true);
  });
  it("die Markierungs-Abwahl bleibt eigenstaendig — Notiz wieder an, eigene Abwahl bleibt bestehen", () => {
    const off = new Set([itemKey("selection", "Notes/Project plan.md")]);
    const vm = buildPanelViewModel(snap, off, opts);
    const ws = vm.sections.find((s) => s.id === "workspace");
    expect(ws?.chips.find((c) => c.source === "active")?.off).toBe(false);
    expect(ws?.chips.find((c) => c.source === "selection")?.off).toBe(true);
  });
  it("englisch", () => {
    const vm = buildPanelViewModel(snap, new Set(), { ...opts, lang: "en" });
    expect(vm.sections[0]?.title).toBe("Workspace");
  });
});
