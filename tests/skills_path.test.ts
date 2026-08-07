import { sanitizeSkillName, skillPath } from "../src/core/skills/path";

describe("sanitizeSkillName", () => {
  it("laesst einen normalen Namen unveraendert", () => {
    expect(sanitizeSkillName("Projektnotizen")).toBe("Projektnotizen");
  });
  it("entfernt Pfadtrenner und Obsidian-verbotene Zeichen", () => {
    expect(sanitizeSkillName("a/b\\c:d*e?f\"g<h>i|j#k^l[m]n")).toBe("abcdefghijklmn");
  });
  it("streift eine angehaengte .md-Endung", () => {
    expect(sanitizeSkillName("Projektnotizen.md")).toBe("Projektnotizen");
  });
  it("kollabiert Leerraum und trimmt", () => {
    expect(sanitizeSkillName("  Mein   Skill  ")).toBe("Mein Skill");
  });
  it("ein Name aus lauter verbotenen Zeichen wird leer", () => {
    expect(sanitizeSkillName("///")).toBe("");
  });
});

describe("skillPath", () => {
  it("baut den Pfad unter dem Koda-Ordner", () => {
    expect(skillPath("Koda", "Projektnotizen")).toBe("Koda/Skills/Projektnotizen.md");
  });
  it("ein Slash-Suffix am Ordner aendert nichts", () => {
    expect(skillPath("Koda/", "X")).toBe("Koda/Skills/X.md");
  });
});
