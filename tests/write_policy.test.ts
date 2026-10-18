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

describe("writePolicy — Skills sind trotz Lage bestaetigungspflichtig", () => {
  it("Skill im Koda-Ordner braucht Bestaetigung", () => {
    expect(writePolicy("Koda/Skills/Projektnotizen.md", "Koda")).toBe("confirm");
  });
  it("Gross/klein zaehlt auch hier nicht", () => {
    expect(writePolicy("koda/skills/x.md", "Koda")).toBe("confirm");
  });
  it("der Skills-Ordner selbst zaehlt mit", () => {
    expect(writePolicy("Koda/Skills", "Koda")).toBe("confirm");
  });
  it("tiefere Ebenen unter Skills/ ebenfalls", () => {
    expect(writePolicy("Koda/Skills/alt/x.md", "Koda")).toBe("confirm");
  });
  // Praefix-Falle: "koda/skillset.md".startsWith("koda/skills") ist true.
  it("Praefix-Kollision ist KEIN Skill (Skillset.md vs Skills/)", () => {
    expect(writePolicy("Koda/Skillset.md", "Koda")).toBe("free");
  });
  it("Entwuerfe bleiben frei", () => {
    expect(writePolicy("Koda/Entwürfe/idee.md", "Koda")).toBe("free");
  });
  // Eine Arbeit bestimmt wie ein Skill, was Koda darf.
  it("Arbeiten/ ist bestaetigungspflichtig, case-insensitiv und segment-genau", () => {
    expect(writePolicy("Koda/Arbeiten/Inbox.md", "Koda")).toBe("confirm");
    expect(writePolicy("koda/arbeiten/x.md", "Koda")).toBe("confirm");
    expect(writePolicy("Koda/Arbeiten", "Koda")).toBe("confirm");
    expect(writePolicy("Koda/Arbeitenliste.md", "Koda")).toBe("free");
  });
  // Seit dem Tausch auf code-kit folder-scope: Ordnerzugehoerigkeit ueber ganze Segmente, `..` liegt in keinem Ordner.
  it("ein Pfad mit .. gilt nie als im Koda-Ordner (vorher verglich der Text)", () => {
    expect(writePolicy("Koda/../Projekte/x.md", "Koda")).toBe("confirm");
    expect(writePolicy("Koda/Entwürfe/../x.md", "Koda")).toBe("confirm");
  });
  it("ein leerer Koda-Ordner enthaelt nichts: alles fragt", () => {
    expect(writePolicy("x.md", "")).toBe("confirm");
    expect(writePolicy("Koda/x.md", "/")).toBe("confirm");
  });
  it("ein Schraegstrich am Ende des Koda-Ordners aendert nichts", () => {
    expect(writePolicy("Koda/Notiz.md", "Koda/")).toBe("free");
    expect(writePolicy("Koda/Skills/a.md", "Koda/")).toBe("confirm");
  });
});
