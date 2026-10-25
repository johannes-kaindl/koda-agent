import { movePolicy } from "../src/core/tools/move";

describe("movePolicy — ein Move betrifft ZWEI Orte", () => {
  it("innerhalb des Koda-Ordners ist frei", () => {
    expect(movePolicy("Koda/a.md", "Koda/Archiv/a.md", "Koda")).toBe("free");
  });
  it("aus dem Koda-Ordner HERAUS braucht Bestaetigung", () => {
    expect(movePolicy("Koda/a.md", "Projekte/a.md", "Koda")).toBe("confirm");
  });
  it("in den Koda-Ordner HINEIN braucht Bestaetigung", () => {
    expect(movePolicy("Projekte/a.md", "Koda/a.md", "Koda")).toBe("confirm");
  });
  it("ausserhalb braucht Bestaetigung", () => {
    expect(movePolicy("Projekte/a.md", "Archiv/a.md", "Koda")).toBe("confirm");
  });
  it("Gross/klein zaehlt nicht als Unterschied", () => {
    expect(movePolicy("koda/a.md", "KODA/b.md", "Koda")).toBe("free");
  });
  it("Praefix-Kollision ist KEIN Treffer (Koda-Archiv/ vs Koda/)", () => {
    expect(movePolicy("Koda/a.md", "Koda-Archiv/a.md", "Koda")).toBe("confirm");
  });
});

describe("movePolicy — Skills bleiben bestaetigungspflichtig, egal in welche Richtung", () => {
  it("ein Skill als Quelle braucht Bestaetigung", () => {
    expect(movePolicy("Koda/Skills/s.md", "Koda/s.md", "Koda")).toBe("confirm");
  });
  it("ein Skill als Ziel braucht Bestaetigung", () => {
    expect(movePolicy("Koda/s.md", "Koda/Skills/s.md", "Koda")).toBe("confirm");
  });
});

// Entscheidung Johannes 2026-10-25: Verschieben und Umbenennen von <Koda>/Memory.md fragt (das Gedaechtnis verschwindet sonst aus dem
// Prompt, `readMemory` liest nur diese Datei), ein Ziel `Koda/Memory.md` auf freiem Platz (Fall `create`) bleibt frei.
describe("movePolicy — Memory.md als Quelle fragt, als Ziel auf freiem Platz nicht", () => {
  it("Umbenennen und Verschieben der Memory.md innerhalb des Koda-Ordners braucht Bestaetigung", () => {
    expect(movePolicy("Koda/Memory.md", "Koda/Memory-alt.md", "Koda")).toBe("confirm");
    expect(movePolicy("Koda/Memory.md", "Koda/Archiv/Memory.md", "Koda")).toBe("confirm");
  });
  it("die Schreibweisen der Dateisystem-Lesart fragen ebenfalls", () => {
    for (const quelle of ["Koda/memory.md", "Koda/MEMORY.MD", "Koda/Memory.md ", "Koda/Memory.md."]) {
      expect(movePolicy(quelle, "Koda/weg.md", "Koda")).toBe("confirm");
    }
  });
  it("ein Ziel Koda/Memory.md ist frei (die Datei gibt es dann nicht, `create`-artig)", () => {
    expect(movePolicy("Koda/Entwurf.md", "Koda/Memory.md", "Koda")).toBe("free");
  });
  it("eine andere Datei namens Memory.md in einem Unterordner ist keine Memory-Datei", () => {
    expect(movePolicy("Koda/Sub/Memory.md", "Koda/Sub/Memory2.md", "Koda")).toBe("free");
    expect(movePolicy("Koda/Memory2.md", "Koda/Memory3.md", "Koda")).toBe("free");
  });
  it("andere Bewegungen im Koda-Ordner bleiben frei", () => {
    expect(movePolicy("Koda/a.md", "Koda/b.md", "Koda")).toBe("free");
  });
});
