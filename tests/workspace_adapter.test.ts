/* Der Obsidian-Adapter des Arbeitskontexts (Spec E3). Bis obsidian-kit 0.31.0 war er nicht
 * als Unit testbar — dem vendorten Mock fehlten `FileView`, der Leaf-Baum und ein Editor,
 * der rechnet. Gepinnt werden hier vor allem die zwei Regeln, die am 2026-09-02 von Hand
 * gegen ein laufendes Obsidian erkauft wurden: Seitenleisten-Ansichten sind keine Tabs, und
 * restaurierte, nie besuchte Tabs tragen ihren Pfad nur im View-State. */
import { describe, it, expect } from "vitest";
import { FileView, MarkdownView, TFile, WorkspaceLeaf, makeFakeApp } from "./vendor/kit/obsidian-mock";
import type { App } from "obsidian";
import { readWorkspace, linesAround, editorPort } from "../src/obsidian/workspace";

const KODA = "koda-chat";

/** Eine Markdown-Ansicht mit Datei, Text und optionaler Markierung. */
function notiz(pfad: string, text = "", auswahl?: { von: { line: number; ch: number }; bis: { line: number; ch: number } }): any {
  const view: any = new MarkdownView();
  view.file = new TFile(pfad);
  view.editor.setValue(text);
  if (auswahl) view.editor.setSelection(auswahl.von, auswahl.bis);
  return view;
}

/** Eine Datei-Ansicht ohne Editor — Canvas, Base, PDF, Bild. */
function ohneEditor(pfad: string, viewType: string): any {
  const view: any = new FileView();
  view.file = new TFile(pfad);
  view.getViewType = () => viewType;
  return view;
}

function leaf(app: any, wurzel: unknown, view: unknown): any {
  const l: any = new WorkspaceLeaf();
  l.parent = wurzel;
  l.view = view;
  return l;
}

/** Registriert Leaves so, wie `iterateAllLeaves` sie findet. */
function mitLeaves(app: any, ...leaves: unknown[]): any {
  app.workspace.__leaves.push(...leaves);
  return app;
}

describe("readWorkspace — die aktive Notiz", () => {
  it("liest Pfad, Frontmatter, Markierung, Cursorzeile und Zeilenzahl", () => {
    const app: any = makeFakeApp();
    const view = notiz("Notizen/A.md", "eins\nzwei\ndrei", { von: { line: 1, ch: 0 }, bis: { line: 1, ch: 4 } });
    app.workspace.getMostRecentLeaf.mockReturnValue(leaf(app, app.workspace.rootSplit, view));
    app.metadataCache.getFileCache.mockReturnValue({ frontmatter: { tags: ["x"] } });

    const snap = readWorkspace(app as App, KODA);

    expect(snap.active).toEqual({
      path: "Notizen/A.md",
      frontmatter: { tags: ["x"] },
      selection: "zwei",
      cursorLine: 2,
      lineCount: 3,
    });
  });

  it("zaehlt die Cursorzeile 1-basiert, waehrend Obsidian 0-basiert zaehlt", () => {
    const app: any = makeFakeApp();
    const view = notiz("A.md", "eins\nzwei\ndrei");
    view.editor.setCursor({ line: 0, ch: 0 });
    app.workspace.getMostRecentLeaf.mockReturnValue(leaf(app, app.workspace.rootSplit, view));

    expect(readWorkspace(app as App, KODA).active?.cursorLine).toBe(1);
  });

  it("eine Ansicht ohne Editor (Canvas) meldet Pfad, aber weder Cursor noch Zeilenzahl", () => {
    const app: any = makeFakeApp();
    const view = ohneEditor("Boards/B.canvas", "canvas");
    app.workspace.getMostRecentLeaf.mockReturnValue(leaf(app, app.workspace.rootSplit, view));

    expect(readWorkspace(app as App, KODA).active).toEqual({
      path: "Boards/B.canvas",
      frontmatter: null,
      selection: "",
      cursorLine: null,
      lineCount: null,
    });
  });

  it("ohne aktives Leaf gibt es keine aktive Notiz", () => {
    const app: any = makeFakeApp();
    expect(readWorkspace(app as App, KODA).active).toBeNull();
  });

  it("eine Datei-Ansicht OHNE Datei ist keine Notiz", () => {
    const app: any = makeFakeApp();
    const view: any = new FileView();
    app.workspace.getMostRecentLeaf.mockReturnValue(leaf(app, app.workspace.rootSplit, view));

    expect(readWorkspace(app as App, KODA).active).toBeNull();
  });
});

describe("readWorkspace — die Tab-Liste", () => {
  it("nimmt geoeffnete Datei-Ansichten mit Pfad und Ansichtstyp", () => {
    const app: any = makeFakeApp();
    mitLeaves(app,
      leaf(app, app.workspace.rootSplit, notiz("A.md")),
      leaf(app, app.workspace.rootSplit, ohneEditor("B.canvas", "canvas")));

    expect(readWorkspace(app as App, KODA).tabs).toEqual([
      { path: "A.md", viewType: "markdown" },
      { path: "B.canvas", viewType: "canvas" },
    ]);
  });

  it("findet restaurierte, nie besuchte Tabs ueber den View-State (DeferredView ohne view.file)", async () => {
    const app: any = makeFakeApp();
    const deferred = leaf(app, app.workspace.rootSplit, null);
    await deferred.setViewState({ type: "markdown", state: { file: "Alt/C.md" } });
    mitLeaves(app, deferred);

    expect(readWorkspace(app as App, KODA).tabs).toEqual([{ path: "Alt/C.md", viewType: "markdown" }]);
  });

  it("schliesst Seitenleisten-Ansichten aus, auch wenn sie die Datei der aktiven Notiz tragen", () => {
    const app: any = makeFakeApp();
    // Backlinks, Gliederung und ausgehende Links tragen `view.file` der aktiven Notiz —
    // gemessen 2026-09-02: ohne diesen Ausschluss stand derselbe Pfad viermal in der Liste.
    mitLeaves(app,
      leaf(app, app.workspace.rootSplit, notiz("A.md")),
      leaf(app, app.workspace.leftSplit, ohneEditor("A.md", "backlink")),
      leaf(app, app.workspace.rightSplit, ohneEditor("A.md", "outline")));

    expect(readWorkspace(app as App, KODA).tabs).toEqual([{ path: "A.md", viewType: "markdown" }]);
  });

  it("laesst Kodas eigenen Leaf aus, auch wenn dessen State eine Datei nennt", async () => {
    const app: any = makeFakeApp();
    const eigener = leaf(app, app.workspace.rootSplit, null);
    await eigener.setViewState({ type: KODA, state: { file: "A.md" } });
    mitLeaves(app, eigener);

    expect(readWorkspace(app as App, KODA).tabs).toEqual([]);
  });

  it("ignoriert Leaves ohne Datei und ohne Pfad im State", async () => {
    const app: any = makeFakeApp();
    const leer = leaf(app, app.workspace.rootSplit, null);
    await leer.setViewState({ type: "graph", state: {} });
    const leerString = leaf(app, app.workspace.rootSplit, null);
    await leerString.setViewState({ type: "markdown", state: { file: "" } });
    mitLeaves(app, leer, leerString);

    expect(readWorkspace(app as App, KODA).tabs).toEqual([]);
  });
});

describe("linesAround", () => {
  it("liefert die Zeilen um den Cursor, `from` 1-basiert", () => {
    const app: any = makeFakeApp();
    const view = notiz("A.md", "a\nb\nc\nd\ne");
    view.editor.setCursor({ line: 2, ch: 0 });
    app.workspace.getMostRecentLeaf.mockReturnValue(leaf(app, app.workspace.rootSplit, view));

    expect(linesAround(app as App, 1)).toEqual({ from: 2, lines: ["b", "c", "d"] });
  });

  it("klemmt an beiden Raendern, statt ueber das Dokument hinauszulaufen", () => {
    const app: any = makeFakeApp();
    const view = notiz("A.md", "a\nb\nc");
    view.editor.setCursor({ line: 0, ch: 0 });
    app.workspace.getMostRecentLeaf.mockReturnValue(leaf(app, app.workspace.rootSplit, view));

    expect(linesAround(app as App, 10)).toEqual({ from: 1, lines: ["a", "b", "c"] });
  });

  it("ohne Editor gibt es keine Umgebung", () => {
    const app: any = makeFakeApp();
    app.workspace.getMostRecentLeaf.mockReturnValue(
      leaf(app, app.workspace.rootSplit, ohneEditor("B.canvas", "canvas")));

    expect(linesAround(app as App, 2)).toBeNull();
  });
});

describe("editorPort", () => {
  it("liest Pfad und Markierung bei JEDEM Aufruf frisch — der Nutzer kann die Notiz wechseln", () => {
    const app: any = makeFakeApp();
    const erste = notiz("A.md", "eins", { von: { line: 0, ch: 0 }, bis: { line: 0, ch: 4 } });
    app.workspace.getMostRecentLeaf.mockReturnValue(leaf(app, app.workspace.rootSplit, erste));
    const port = editorPort(app as App);
    expect(port.path()).toBe("A.md");
    expect(port.selection()).toBe("eins");

    const zweite = notiz("B.md", "zwei", { von: { line: 0, ch: 0 }, bis: { line: 0, ch: 2 } });
    app.workspace.getMostRecentLeaf.mockReturnValue(leaf(app, app.workspace.rootSplit, zweite));

    expect(port.path()).toBe("B.md");
    expect(port.selection()).toBe("zw");
  });

  it("replaceSelection ersetzt den markierten Text", () => {
    const app: any = makeFakeApp();
    const view = notiz("A.md", "eins\nzwei", { von: { line: 1, ch: 0 }, bis: { line: 1, ch: 4 } });
    app.workspace.getMostRecentLeaf.mockReturnValue(leaf(app, app.workspace.rootSplit, view));

    editorPort(app as App).replaceSelection("ZWEI");

    expect(view.editor.getValue()).toBe("eins\nZWEI");
  });

  it("insertAtCursor schreibt ans ENDE der Markierung, ohne sie zu ueberschreiben", () => {
    const app: any = makeFakeApp();
    const view = notiz("A.md", "eins\nzwei", { von: { line: 0, ch: 0 }, bis: { line: 0, ch: 4 } });
    app.workspace.getMostRecentLeaf.mockReturnValue(leaf(app, app.workspace.rootSplit, view));

    editorPort(app as App).insertAtCursor("!");

    expect(view.editor.getValue()).toBe("eins!\nzwei");
  });

  it("ohne aktive Notiz meldet der Port leer und schreibt nichts", () => {
    const app: any = makeFakeApp();
    const port = editorPort(app as App);

    expect(port.path()).toBeNull();
    expect(port.selection()).toBe("");
    expect(() => { port.replaceSelection("x"); port.insertAtCursor("y"); }).not.toThrow();
  });
});
