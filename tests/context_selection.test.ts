import { itemKey, applySelection } from "../src/core/context/selection";
import type { WorkspaceSnapshot } from "../src/core/context/ports";

const snap: WorkspaceSnapshot = {
  active: {
    path: "Notes/Plan.md",
    frontmatter: { status: "active" },
    selection: "Model control",
    cursorLine: 9,
    lineCount: 11,
  },
  tabs: [
    { path: "Notes/Plan.md", viewType: "markdown" },
    { path: "Notes/Tools.md", viewType: "markdown" },
  ],
};

describe("itemKey", () => {
  it("trennt Quelle und Pfad, damit Markierung und Notiz derselben Datei getrennt abwaehlbar sind", () => {
    expect(itemKey("active", "Notes/Plan.md")).not.toBe(itemKey("selection", "Notes/Plan.md"));
    expect(itemKey("tab", "Notes/Plan.md")).not.toBe(itemKey("active", "Notes/Plan.md"));
  });
});

describe("applySelection", () => {
  it("ohne Abwahl gibt es den Snapshot unveraendert zurueck", () => {
    expect(applySelection(snap, new Set())).toEqual(snap);
  });
  it("abgewaehlte Markierung leert NUR die Markierung, die Notiz bleibt", () => {
    const out = applySelection(snap, new Set([itemKey("selection", "Notes/Plan.md")]));
    expect(out.active?.selection).toBe("");
    expect(out.active?.path).toBe("Notes/Plan.md");
  });
  it("abgewaehlte aktive Notiz nimmt die Markierung mit — ohne Notiz gibt es keine Stelle darin", () => {
    const out = applySelection(snap, new Set([itemKey("active", "Notes/Plan.md")]));
    expect(out.active).toBeNull();
  });
  it("abgewaehlter Tab verschwindet aus der Liste, die uebrigen bleiben in Reihenfolge", () => {
    const out = applySelection(snap, new Set([itemKey("tab", "Notes/Plan.md")]));
    expect(out.tabs.map((x) => x.path)).toEqual(["Notes/Tools.md"]);
  });
  it("laesst den Eingabe-Snapshot unangetastet (kein In-Place-Filtern)", () => {
    applySelection(snap, new Set([itemKey("tab", "Notes/Plan.md")]));
    expect(snap.tabs).toHaveLength(2);
  });
  it("ein Schluessel fuer etwas, das es nicht gibt, aendert nichts", () => {
    expect(applySelection(snap, new Set([itemKey("tab", "Weg.md")]))).toEqual(snap);
  });
});
