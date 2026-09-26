import { collectFolderTree, formatFolderTree, renderTreeBlock } from "../src/core/tools/tree";
import { formatListResult } from "../src/core/tools/list";

// Nachgestellt ist Kodas Frage vom 2026-09-26: „Hat jeder Projektordner die Standard-Struktur
// (_Tasks, _Meilensteine)?" — mit der flachen Liste kostete das einen Aufruf je Projekt.
const NOTES = [
  "P/P.md",
  "P/A/A.md",
  "P/A/_Tasks/t1.md",
  "P/A/_Tasks/t2.md",
  "P/B/B.md",
  "P/B/_Tasks/t3.md",
  "P/B/_Tasks/Archiv/alt.md",
  "P-x/y.md",
  "Q/z.md",
];
// `P/A/_Meilensteine` und `P/C` tragen keine Notiz — die kennt nur die Ordnerliste.
const FOLDERS = [
  "/", "P", "P/A", "P/A/_Tasks", "P/A/_Meilensteine", "P/B", "P/B/_Tasks", "P/B/_Tasks/Archiv",
  "P/C", "P-x", "Q",
];

describe("collectFolderTree", () => {
  it("liefert die Ordner bis zur Tiefe in Baum-Reihenfolge, mit Notizzahl darunter", () => {
    const t = collectFolderTree(NOTES, FOLDERS, "P", 2, 100);
    expect(t.nodes.map((n) => [n.path, n.level, n.notes])).toEqual([
      ["P/A", 1, 3],
      ["P/A/_Meilensteine", 2, 0],
      ["P/A/_Tasks", 2, 2],
      ["P/B", 1, 3],
      ["P/B/_Tasks", 2, 2],
      ["P/C", 1, 0],
    ]);
    expect(t.total).toBe(6);
    expect(t.completeTo).toBe(2);
  });
  it("nimmt tiefere Ordner nicht mit, zaehlt ihre Notizen aber beim Vorfahren", () => {
    const t = collectFolderTree(NOTES, FOLDERS, "P", 2, 100);
    expect(t.nodes.some((n) => n.path === "P/B/_Tasks/Archiv")).toBe(false);
    expect(t.nodes.find((n) => n.path === "P/B/_Tasks")?.notes).toBe(2);
  });
  it("verwechselt kein Praefix mit einem Ordner (P-x ist kein Kind von P)", () => {
    const t = collectFolderTree(NOTES, FOLDERS, "P", 3, 100);
    expect(t.nodes.some((n) => n.path.startsWith("P-x"))).toBe(false);
  });
  it("ordnet nach Pfadsegmenten, nicht nach Zeichenkette — P-x steht nicht zwischen P und P/…", () => {
    const t = collectFolderTree(NOTES, FOLDERS, "", 2, 100);
    expect(t.nodes.map((n) => n.path)).toEqual([
      "P", "P/A", "P/B", "P/C", "P-x", "Q",
    ]);
  });
  it("kappt ganze Ebenen statt einen Ast halb zu zeigen, und nennt die vollstaendige Tiefe", () => {
    // Tiefe 1 = 3 Ordner, Tiefe 2 = 3 weitere. Bei max 4 passt Ebene 1 ganz, Ebene 2 nicht:
    // ein halber Ebene-2-Stand liesse einen Projektordner ohne _Tasks aussehen, obwohl er eins hat.
    const t = collectFolderTree(NOTES, FOLDERS, "P", 2, 4);
    expect(t.nodes.map((n) => n.path)).toEqual(["P/A", "P/B", "P/C"]);
    expect(t.total).toBe(6);
    expect(t.completeTo).toBe(1);
  });
  it("zeigt bei zu vielen Ordnern schon auf Ebene 1 die ersten und meldet Tiefe 0 als vollstaendig", () => {
    const t = collectFolderTree(NOTES, FOLDERS, "P", 2, 2);
    expect(t.nodes.map((n) => n.path)).toEqual(["P/A", "P/B"]);
    expect(t.completeTo).toBe(0);
  });
  it("vergleicht NFC-normalisiert, gibt aber den Originalpfad aus", () => {
    const nfd = "Bücher";
    const t = collectFolderTree([`${nfd}/Neu/a.md`], [nfd, `${nfd}/Neu`], "Bücher", 2, 100);
    expect(t.nodes).toEqual([{ path: `${nfd}/Neu`, level: 1, notes: 1 }]);
  });
});

describe("formatFolderTree", () => {
  it("rueckt je Ebene ein, schreibt den vollen Pfad mit Schraegstrich und die Notizzahl", () => {
    const out = formatFolderTree(collectFolderTree(NOTES, FOLDERS, "P", 2, 100), 2);
    expect(out.split("\n")).toEqual([
      "Ordnerbaum bis Tiefe 2 (6 Ordner; Zahl = Notizen darin, Unterordner mitgezählt):",
      "P/A/ (3 Notizen)",
      "  P/A/_Meilensteine/ (keine Notiz)",
      "  P/A/_Tasks/ (2 Notizen)",
      "P/B/ (3 Notizen)",
      "  P/B/_Tasks/ (2 Notizen)",
      "P/C/ (keine Notiz)",
    ]);
  });
  it("sagt ausdruecklich, wenn es keine Unterordner gibt", () => {
    const out = formatFolderTree(collectFolderTree(NOTES, FOLDERS, "Q", 3, 100), 3);
    expect(out).toBe("Ordnerbaum bis Tiefe 3: keine Unterordner.");
  });
});

describe("formatListResult mit Baum", () => {
  it("ersetzt die Unterordner-Zeile durch den Baum", () => {
    const tree = collectFolderTree(NOTES, FOLDERS, "P", 2, 100);
    const out = formatListResult({
      folder: "P", recursive: false, total: 1, rows: [{ path: "P/P.md", fields: {} }],
      subfolders: [{ path: "P/A", notes: 3 }, { path: "P/B", notes: 3 }, { path: "P/C", notes: 0 }],
      tree: renderTreeBlock(tree, 2),
    });
    const lines = out.split("\n");
    expect(lines[0]).toContain("3 Unterordner");
    expect(lines[1]).toContain("Ordnerbaum bis Tiefe 2");
    expect(out).not.toContain("Unterordner: ");
    expect(out).toContain("  P/A/_Meilensteine/ (keine Notiz)");
    expect(out).toContain("P/P.md (Ordnernotiz)");
  });
  it("meldet einen gekappten Baum in Zeile 1, mit der Tiefe, bis zu der er vollstaendig ist", () => {
    const tree = collectFolderTree(NOTES, FOLDERS, "P", 2, 4);
    const out = formatListResult({
      folder: "P", recursive: false, total: 1, rows: [{ path: "P/P.md", fields: {} }],
      subfolders: [{ path: "P/A", notes: 3 }], tree: renderTreeBlock(tree, 2),
    });
    const first = out.split("\n")[0];
    expect(first).toContain("⚠ ORDNERBAUM GEKAPPT");
    expect(first).toContain("6 Ordner");
    expect(first).toContain("3 gezeigt");
    expect(first).toContain("vollständig bis Tiefe 1");
  });
  it("stapelt beide Warnungen, wenn Notizliste UND Baum gekappt sind", () => {
    const tree = collectFolderTree(NOTES, FOLDERS, "P", 2, 2);
    const out = formatListResult({
      folder: "P", recursive: false, total: 5, rows: [{ path: "P/P.md", fields: {} }],
      subfolders: [], tree: renderTreeBlock(tree, 2),
    });
    const [a, b] = out.split("\n");
    expect(a).toContain("UNVOLLSTÄNDIG");
    expect(b).toContain("ORDNERBAUM GEKAPPT");
  });
  it("ersetzt auch rekursiv die Zeile „Ordner ohne Notiz“ durch den Baum", () => {
    const tree = collectFolderTree(NOTES, FOLDERS, "P", 2, 100);
    const out = formatListResult({
      folder: "P", recursive: true, total: 6, rows: [{ path: "P/P.md", fields: {} }],
      subfolders: [{ path: "P/A/_Meilensteine", notes: 0 }, { path: "P/C", notes: 0 }], tree: renderTreeBlock(tree, 2),
    });
    expect(out).not.toContain("Ordner ohne Notiz:");
    expect(out).toContain("Ordnerbaum bis Tiefe 2");
  });
});
