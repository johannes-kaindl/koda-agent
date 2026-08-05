import { writePolicy } from "../src/core/tools/write-policy";

describe("writePolicy", () => {
  it("Koda-Ordner selbst und darunter ist frei", () => {
    expect(writePolicy("Koda/Memory.md", "Koda")).toBe("free");
    expect(writePolicy("Koda/Entwürfe/idee.md", "Koda")).toBe("free");
  });
  it("Gross/klein zaehlt nicht als Unterschied", () => {
    expect(writePolicy("koda/x.md", "Koda")).toBe("free");
  });
  it("Praefix-Kollision ist KEIN Treffer (Koda-Archiv/ vs Koda/)", () => {
    expect(writePolicy("Koda-Archiv/x.md", "Koda")).toBe("confirm");
  });
  it("alles andere braucht Bestaetigung", () => {
    expect(writePolicy("Projekte/plan.md", "Koda")).toBe("confirm");
  });
  it("konfigurierter Ordner mit Slash-Suffix verhaelt sich identisch", () => {
    expect(writePolicy("Koda/x.md", "Koda/")).toBe("free");
  });
});
