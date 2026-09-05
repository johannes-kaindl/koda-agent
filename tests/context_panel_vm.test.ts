import { buildPanelViewModel } from "../src/core/context/panel-vm";
import { buildFullContext } from "../src/core/context/build";
import { itemKey } from "../src/core/context/selection";
import type { WorkspaceSnapshot } from "../src/core/context/ports";

const snap: WorkspaceSnapshot = {
  active: { path: "Notes/Project plan.md", frontmatter: { status: "active" }, selection: "Model control", cursorLine: 9, lineCount: 11 },
  tabs: [
    { path: "Notes/Project plan.md", viewType: "markdown" },
    { path: "Notes/Tools.md", viewType: "markdown" },
  ],
};
const opts = {
  lang: "de" as const, selectionMax: 600, tabsMax: 12, frontmatterMax: 300, windowTokens: 8192,
  budget: 20000, linkDepth: 1, manual: [] as string[],
  links: { outgoing: () => [] as string[], backlinks: () => [] as string[] },
  content: { read: () => Promise.resolve(null as string | null) },
};

describe("buildPanelViewModel", () => {
  it("zeigt Arbeitsplatz-Chips fuer aktive Notiz, Markierung und Tabs", async () => {
    const vm = await buildPanelViewModel("workspace", snap, new Set(), opts);
    const ws = vm.sections.find((s) => s.id === "workspace");
    expect(ws?.chips.map((c) => c.source)).toEqual(["active", "selection", "tab", "tab"]);
    expect(ws?.chips[0]?.label).toBe("Project plan");
    expect(ws?.chips[1]?.hint).toBe("13 Z.");
  });
  it("zeigt der aktiven Notiz auch ihren eigenen Tab-Chip — abwaehlbar wie jeder andere Tab", async () => {
    const vm = await buildPanelViewModel("workspace", snap, new Set(), opts);
    const ws = vm.sections.find((s) => s.id === "workspace");
    const tabs = ws?.chips.filter((c) => c.source === "tab") ?? [];
    expect(tabs.map((c) => c.path)).toEqual(["Notes/Project plan.md", "Notes/Tools.md"]);
    expect(tabs[0]?.hint).toBe("auch als Tab");
    expect(tabs[1]?.hint).toBe("");
  });
  it("zieht denselben Tab-Pfad ECHT zusammen, wenn er zweimal im Snapshot steht", async () => {
    const dup: WorkspaceSnapshot = {
      active: null,
      tabs: [
        { path: "Notes/Tools.md", viewType: "markdown" },
        { path: "Notes/Tools.md", viewType: "markdown" },
      ],
    };
    const vm = await buildPanelViewModel("workspace", dup, new Set(), opts);
    const tabs = vm.sections.find((s) => s.id === "workspace")?.chips.filter((c) => c.source === "tab") ?? [];
    expect(tabs.map((c) => c.path)).toEqual(["Notes/Tools.md"]);
  });
  it("markiert abgewaehlte Chips, entfernt sie aber nicht — sonst waeren sie unerreichbar", async () => {
    const vm = await buildPanelViewModel("workspace", snap, new Set([itemKey("tab", "Notes/Tools.md")]), opts);
    const chip = vm.sections[0]?.chips.find((c) => c.path === "Notes/Tools.md");
    expect(chip?.off).toBe(true);
    expect(vm.hasOff).toBe(true);
  });
  it("die Messung nimmt den GEFILTERTEN Block, nicht den vollen", async () => {
    // Geprueft wird `chars`, nicht `summary`: die Summenzeile rundet auf 0,1 KB, und bei
    // einem Block dieser Groesse liefern ein und zwei Tabs dieselbe Zeichenkette. Der Test
    // waere falsch-rot gewesen, ohne dass am Code etwas falsch ist.
    const voll = (await buildPanelViewModel("workspace", snap, new Set(), opts)).chars;
    const knapp = (await buildPanelViewModel("workspace", snap, new Set([itemKey("tab", "Notes/Tools.md")]), opts)).chars;
    expect(knapp).toBeLessThan(voll);
  });
  it("meldet is-ok knapp UNTER der 80%-Schwelle", async () => {
    // Der volle Block hat 299 Zeichen (chars/4/windowTokens*100, gerundet). Bei
    // windowTokens=95 ergibt das pct=79 — ermittelt durch Auslesen von
    // buildPanelViewModel(...).chars, nicht geraten.
    const knapp = await buildPanelViewModel("workspace", snap, new Set(), { ...opts, windowTokens: 95 });
    expect(knapp.state).toBe("is-ok");
  });
  it("meldet is-warning knapp UEBER der 80%-Schwelle", async () => {
    // Derselbe Block bei windowTokens=94 ergibt pct=80 (is-warning).
    const drueber = await buildPanelViewModel("workspace", snap, new Set(), { ...opts, windowTokens: 94 });
    expect(drueber.state).toBe("is-warning");
  });
  it("ohne aktive Notiz und ohne Tabs bleibt ein Empty-State statt einer leeren Flaeche", async () => {
    const vm = await buildPanelViewModel("workspace", { active: null, tabs: [] }, new Set(), opts);
    expect(vm.sections[0]?.chips).toEqual([]);
    expect(vm.sections[0]?.empty).not.toBe("");
  });
  it("der Markierungs-Chip zeigt abgewaehlt, wenn die aktive Notiz abgewaehlt ist (Befund 4)", async () => {
    // active=off nimmt die Markierung inhaltlich mit (selection.ts) — der Chip muss das
    // ANZEIGEN, auch ohne eigenen contextOff-Eintrag fuer "selection".
    const vm = await buildPanelViewModel("workspace", snap, new Set([itemKey("active", "Notes/Project plan.md")]), opts);
    const ws = vm.sections.find((s) => s.id === "workspace");
    const selection = ws?.chips.find((c) => c.source === "selection");
    expect(selection?.off).toBe(true);
  });
  it("die Markierungs-Abwahl bleibt eigenstaendig — Notiz wieder an, eigene Abwahl bleibt bestehen", async () => {
    const off = new Set([itemKey("selection", "Notes/Project plan.md")]);
    const vm = await buildPanelViewModel("workspace", snap, off, opts);
    const ws = vm.sections.find((s) => s.id === "workspace");
    expect(ws?.chips.find((c) => c.source === "active")?.off).toBe(false);
    expect(ws?.chips.find((c) => c.source === "selection")?.off).toBe(true);
  });
  it("englisch", async () => {
    const vm = await buildPanelViewModel("workspace", snap, new Set(), { ...opts, lang: "en" });
    expect(vm.sections[0]?.title).toBe("Workspace");
  });
});

const links = { outgoing: (p: string) => (p === "A.md" ? ["B.md"] : []), backlinks: () => [] };
const content = { read: (p: string) => Promise.resolve(p === "A.md" ? "Text A" : "Text B") };

function vollOpts(extra: Record<string, unknown> = {}) {
  return {
    lang: "de" as const, selectionMax: 600, tabsMax: 12, frontmatterMax: 300,
    windowTokens: 8192, budget: 20000, linkDepth: 1, manual: [], links, content,
    ...extra,
  };
}

describe("Kontext-Tab im Modus Notiz", () => {
  const snapNote = {
    active: { path: "A.md", frontmatter: null, selection: "", cursorLine: 1, lineCount: 1 },
    tabs: [{ path: "A.md", viewType: "markdown" }],
  };

  it("zeigt aktive Notiz und verlinkte Nachbarn als Chips", async () => {
    const vm = await buildPanelViewModel("note", snapNote, new Set(), vollOpts());
    const notiz = vm.sections.find((s) => s.id === "note");
    expect(notiz?.chips.map((c) => c.path)).toEqual(["A.md", "B.md"]);
    expect(notiz?.chips[1]?.hint).toContain("Ebene 1");
  });

  it("meldet die Groesse jedes GESENDETEN Chips aus demselben Block, der gesendet wird", async () => {
    const vm = await buildPanelViewModel("note", snapNote, new Set(), vollOpts());
    const ctx = await buildFullContext({
      mode: "note", snap: snapNote, links, content, manual: [], off: new Set(),
      linkDepth: 1, budget: 20000, lang: "de",
    });
    const chip = vm.sections.find((s) => s.id === "note")?.chips.find((c) => c.path === "B.md");
    const item = ctx.items.find((i) => i.path === "B.md");
    expect(chip?.hint).toContain(String(item?.chars));
  });

  it("zeigt einen abgewaehlten Chip weiter an — sonst waere er unerreichbar", async () => {
    const off = new Set([itemKey("link", "B.md")]);
    const vm = await buildPanelViewModel("note", snapNote, off, vollOpts());
    const chip = vm.sections.find((s) => s.id === "note")?.chips.find((c) => c.path === "B.md");
    expect(chip?.off).toBe(true);
  });

  it("stellt den Tiefe-Stepper nur im Modus Notiz bereit", async () => {
    expect((await buildPanelViewModel("note", snapNote, new Set(), vollOpts())).depth).toBe(1);
    expect((await buildPanelViewModel("tabs", snapNote, new Set(), vollOpts())).depth).toBeNull();
    expect((await buildPanelViewModel("workspace", snapNote, new Set(), vollOpts())).depth).toBeNull();
  });

  it("ein manueller Eintrag, der zugleich Link-Kandidat waere, steht GENAU EINMAL ueber alle Abschnitte — im Abschnitt Manuell, entfernbar", async () => {
    // B.md ist hier sowohl Link-Nachbar von A.md (linkDepth 1) als auch von Hand
    // hinzugefuegt. `collectCandidates` liefert ihn deshalb als EINEN Kandidaten mit
    // `source: "manual"` (Manuelles kommt vor der Link-Suche und dedupliziert nach Pfad).
    // Ohne die Quelle-Ausblendung in `sourceSection` erschiene derselbe Pfad zweimal: als
    // nicht entfernbarer Chip im Abschnitt "note" (aus der Kandidatenliste) UND als
    // entfernbarer Chip im Abschnitt "manual" — zwei Bedienelemente fuer eine Sache mit
    // verschiedener Wirkung (abwaehlen vs. entfernen).
    const vm = await buildPanelViewModel("note", snapNote, new Set(), vollOpts({ manual: ["B.md"] }));
    const alle = vm.sections.flatMap((s) => s.chips.map((c) => ({ section: s.id, chip: c })));
    const treffer = alle.filter((x) => x.chip.path === "B.md");
    expect(treffer).toHaveLength(1);
    expect(treffer[0]?.section).toBe("manual");
    expect(treffer[0]?.chip.removable).toBe(true);
  });
});

describe("Abschnitt Manuell", () => {
  const snapManual = { active: null, tabs: [] };

  it("fuehrt manuelle Eintraege als entfernbare Chips", async () => {
    const vm = await buildPanelViewModel("note", snapManual, new Set(), vollOpts({ manual: ["M.md"] }));
    const manuell = vm.sections.find((s) => s.id === "manual");
    expect(manuell?.chips).toHaveLength(1);
    expect(manuell?.chips[0]?.removable).toBe(true);
  });

  it("sagt im Modus Arbeitsplatz, dass Manuelles dort nicht wirkt — statt es zu verschweigen", async () => {
    const vm = await buildPanelViewModel("workspace", snapManual, new Set(), vollOpts({ manual: ["M.md"] }));
    const manuell = vm.sections.find((s) => s.id === "manual");
    expect(vm.manualEnabled).toBe(false);
    expect(manuell?.chips[0]?.hint).toContain("Notiz");
  });
});
