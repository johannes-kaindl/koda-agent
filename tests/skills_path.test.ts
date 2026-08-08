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
  it("entfernt Steuerzeichen ueber den ganzen C0-Bereich", () => {
    expect(sanitizeSkillName("a\u0000b\u001fc")).toBe("abc");
    expect(sanitizeSkillName("Tab\tTrenner")).toBe("TabTrenner");
    expect(sanitizeSkillName("Zeilen\numbruch")).toBe("Zeilenumbruch");
  });
  it("laesst Zeichen ab 0x20 unangetastet, auch ausserhalb der BMP", () => {
    expect(sanitizeSkillName("Skill \u{1F600} Emoji")).toBe("Skill \u{1F600} Emoji");
    expect(sanitizeSkillName("Umlaute \u00e4\u00f6\u00fc")).toBe("Umlaute \u00e4\u00f6\u00fc");
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
