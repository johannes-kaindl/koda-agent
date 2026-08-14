import { collectFolderNotes } from "../src/core/tools/list";

const VAULT = [
  "Projekt/_Tasks/B.md",
  "Projekt/_Tasks/A.md",
  "Projekt/_Tasks/Unter/C.md",
  "Projekt/Notiz.md",
  "Anderes/X.md",
  "Wurzel.md",
];

describe("collectFolderNotes", () => {
  it("liefert flach nur die direkten Kinder, alphabetisch", () => {
    expect(collectFolderNotes(VAULT, "Projekt/_Tasks", false)).toEqual([
      "Projekt/_Tasks/A.md",
      "Projekt/_Tasks/B.md",
    ]);
  });
  it("liefert rekursiv auch Unterordner", () => {
    expect(collectFolderNotes(VAULT, "Projekt/_Tasks", true)).toEqual([
      "Projekt/_Tasks/A.md",
      "Projekt/_Tasks/B.md",
      "Projekt/_Tasks/Unter/C.md",
    ]);
  });
  it("behandelt \"\" als Vault-Wurzel — flach nur Notizen ohne Ordner", () => {
    expect(collectFolderNotes(VAULT, "", false)).toEqual(["Wurzel.md"]);
    expect(collectFolderNotes(VAULT, "", true)).toHaveLength(6);
  });
  it("matcht Ordnernamen segmentgenau, nicht als Praefix", () => {
    const v = ["Projekt/A.md", "Projekt-Alt/B.md"];
    expect(collectFolderNotes(v, "Projekt", true)).toEqual(["Projekt/A.md"]);
  });
  it("ist unabhaengig von der Eingabereihenfolge", () => {
    const a = collectFolderNotes(VAULT, "Projekt", true);
    const b = collectFolderNotes([...VAULT].reverse(), "Projekt", true);
    expect(a).toEqual(b);
  });
});
