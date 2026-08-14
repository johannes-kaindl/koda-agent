import { suggestFolders, formatEmptyFolder } from "../src/core/tools/list";

const VAULT = [
  "20_Projekte/26-001 Einrichtung/26-001-03 Koda/_Tasks/A.md",
  "20_Projekte/26-001 Einrichtung/26-001-03 Koda/Notiz.md",
  "20_Projekte/26-002 Anderes/Notiz.md",
  "10_Aufgaben/X.md",
];

describe("suggestFolders", () => {
  it("Stufe 1: findet Ordner mit aehnlichem letzten Segment", () => {
    expect(suggestFolders(VAULT, "20_Projekte/26-001 Einrichtung/26-001-03 Koda/tasks"))
      .toEqual(["20_Projekte/26-001 Einrichtung/26-001-03 Koda/_Tasks"]);
  });
  it("Stufe 2: zeigt sonst die Unterordner des laengsten existierenden Praefixes", () => {
    expect(suggestFolders(VAULT, "20_Projekte/26-003 Tippfehler")).toEqual([
      "20_Projekte/26-001 Einrichtung",
      "20_Projekte/26-002 Anderes",
    ]);
  });
  it("Stufe 3: raet nicht, wenn es nichts zu raten gibt", () => {
    expect(suggestFolders(["A.md"], "Voellig/Anderes")).toEqual([]);
  });
  it("liefert hoechstens fuenf Vorschlaege", () => {
    const many = Array.from({ length: 9 }, (_, i) => `Basis/Ordner${i}/N.md`);
    expect(suggestFolders(many, "Basis/Fehlt")).toHaveLength(5);
  });
});

describe("formatEmptyFolder", () => {
  it("behauptet NICHT, dass der Ordner nicht existiert", () => {
    const msg = formatEmptyFolder("A/B", []);
    expect(msg).toContain("keine Notiz");
    expect(msg).not.toMatch(/existiert nicht|gibt es nicht/i);
  });
  it("nennt die Vorschlaege, wenn es welche gibt", () => {
    const msg = formatEmptyFolder("A/tasks", ["A/_Tasks"]);
    expect(msg).toContain("A/_Tasks");
  });
});
