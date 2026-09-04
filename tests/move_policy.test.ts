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
