import { collectSubfolders, knownFolders, nf } from "../src/core/tools/list";
import { collectFolderTree } from "../src/core/tools/tree";

// Die Zaehlung in `collectSubfolders` und `collectFolderTree` kommt aus code-kit `countInFolders` (0.36.0). Vorher zaehlte jede der beiden
// pro Ordner einen Durchlauf mit `startsWith`. Gleichheit gegen genau diese alte Zaehlung ist der Beleg, dass nichts anderes sich aendert.

/** Die alte Zaehlung, Wort fuer Wort: ganze Segmente ueber `${n}/`, Gross/klein unterschieden, NFC. */
const alt = (paths: string[], n: string): number => paths.map(nf).filter((p) => p.startsWith(`${n}/`)).length;

const NFD = "Bücher";
const NOTES = [
  "Koda/a.md", "Koda/Sub/b.md", "Koda/Sub/Tief/c.md", "Koda-Archiv/d.md", "Koda-Archiv/Alt/e.md",
  "koda/klein.md", "Notes/n.md", `${NFD}/Alpha.md`, "Bücher/Beta.md", "Ärger/Ä.md", "Ärger/Tief/Ö.md", "Root.md",
];
const OTHERS = ["Koda/ansicht.base", "Koda/Sub/karte.canvas", "Koda-Archiv/x.base", `${NFD}/w.canvas`, "Notes/y.base"];
const FOLDERS = ["Koda", "Koda/Sub", "Koda/Sub/Tief", "Koda/Leer", "Koda-Archiv", "Koda-Archiv/Alt", "koda", "Notes", "Bücher", "Ärger", "Ärger/Tief"];

describe("Zaehlung ueber countInFolders gleicht der alten startsWith-Zaehlung", () => {
  it("collectSubfolders (flach, Wurzel): Notizen und weitere Dateien je Ordner", () => {
    const got = collectSubfolders(NOTES, FOLDERS, "", false, OTHERS);
    expect(got.length).toBeGreaterThan(5);
    const known = knownFolders(NOTES, FOLDERS);
    for (const s of got) {
      const n = nf(s.path);
      expect(known.has(n)).toBe(true);
      expect(s.notes).toBe(alt(NOTES, n));
      expect(s.others ?? 0).toBe(alt(OTHERS, n));
    }
  });
  it("collectSubfolders: Praefix-Kollision (Koda gegen Koda-Archiv) und Gross/klein bleiben getrennt", () => {
    const got = Object.fromEntries(collectSubfolders(NOTES, FOLDERS, "", false, OTHERS).map((s) => [s.path, s]));
    expect(got["Koda"]).toEqual({ path: "Koda", notes: 3, others: 2 });
    expect(got["Koda-Archiv"]).toEqual({ path: "Koda-Archiv", notes: 2, others: 1 });
    expect(got["koda"]).toEqual({ path: "koda", notes: 1 });
  });
  it("collectSubfolders: NFD- und NFC-Schreibung desselben Ordners zaehlen zusammen", () => {
    const got = collectSubfolders(NOTES, FOLDERS, "", false, OTHERS).find((s) => nf(s.path) === "Bücher");
    expect(got).toEqual({ path: "Bücher", notes: 2, others: 1 });
  });
  it("collectFolderTree: jede Knotenzahl gleicht der alten Zaehlung", () => {
    const tree = collectFolderTree(NOTES, FOLDERS, "", 3, 100);
    expect(tree.nodes.length).toBeGreaterThan(8);
    for (const node of tree.nodes) expect(node.notes).toBe(alt(NOTES, nf(node.path)));
  });
  it("ein Ordner ohne Notiz zaehlt 0 und behaelt seinen Eintrag", () => {
    expect(collectFolderTree(NOTES, FOLDERS, "Koda", 1, 100).nodes.find((n) => n.path === "Koda/Leer")?.notes).toBe(0);
  });
});

describe("Pfade, die nicht lesbar sind, zaehlen in keinem Ordner (neu seit code-kit 0.36.0)", () => {
  const MIT_PUNKTEN = ["Koda/a.md", "Koda/../Geheim/b.md", "Koda/Sub/../c.md", "Koda/NUL\u0000.md"];
  it("collectSubfolders und collectFolderTree zaehlen `..` und NUL nicht mit", () => {
    expect(collectSubfolders(MIT_PUNKTEN, ["Koda"], "", false)).toEqual([{ path: "Koda", notes: 1 }]);
    expect(collectFolderTree(MIT_PUNKTEN, ["Koda"], "", 1, 10).nodes).toEqual([{ path: "Koda", level: 1, notes: 1 }]);
  });
  it("die alte Zaehlung hat `Koda/../Geheim/b.md` noch in Koda gezaehlt (Gegenprobe: der Test sieht den Unterschied)", () => {
    expect(alt(MIT_PUNKTEN, "Koda")).toBe(4);
  });
});
