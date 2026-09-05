import { resolveNotePath, resolveFolderPath, READ_EXTENSIONS } from "../src/core/tools/path-guard";

describe("resolveNotePath", () => {
  it("normalisiert Backslashes und ./-Segmente", () => {
    expect(resolveNotePath("Ordner\\.\\Note.md")).toBe("Ordner/Note.md");
  });
  it("wirft bei absolutem Pfad", () => {
    expect(() => resolveNotePath("/etc/passwd.md")).toThrow(/vault-relativ/i);
  });
  it("wirft bei ..-Traversal", () => {
    expect(() => resolveNotePath("a/../../geheim.md")).toThrow(/verlässt/);
  });
  it("wirft bei Nicht-Markdown", () => {
    expect(() => resolveNotePath("bild.png")).toThrow(/\.md/);
  });
  it("akzeptiert Gross-Klein-Varianten von .MD", () => {
    expect(resolveNotePath("Note.MD")).toBe("Note.MD");
  });
});

describe("resolveFolderPath", () => {
  it("normalisiert Slashes und schneidet fuehrende/anhaengende ab", () => {
    expect(resolveFolderPath("/20_Projekte/")).toBe("20_Projekte");
    expect(resolveFolderPath("a\\b\\")).toBe("a/b");
  });
  it("laesst die Vault-Wurzel als leeren String zu", () => {
    expect(resolveFolderPath("")).toBe("");
    expect(resolveFolderPath("/")).toBe("");
  });
  it("verlangt KEIN .md", () => {
    expect(resolveFolderPath("Projekt/_Tasks")).toBe("Projekt/_Tasks");
  });
  it("wirft bei ..-Traversal", () => {
    expect(() => resolveFolderPath("a/../../geheim")).toThrow(/verlässt/);
  });
});

describe("resolveNotePath mit erweiterter Erlaubnis (Lese-Haelfte)", () => {
  it("laesst .base und .canvas durch, wenn sie erlaubt sind", () => {
    expect(resolveNotePath("Notes/Overview.base", READ_EXTENSIONS)).toBe("Notes/Overview.base");
    expect(resolveNotePath("Notes/Map.canvas", READ_EXTENSIONS)).toBe("Notes/Map.canvas");
  });

  it("bleibt ohne zweiten Parameter bei .md — der Schreibpfad aendert sich nicht", () => {
    expect(() => resolveNotePath("Notes/Overview.base")).toThrow(/\.md/);
  });

  it("lehnt ein fremdes Format auch mit erweiterter Erlaubnis ab und nennt die erlaubten", () => {
    expect(() => resolveNotePath("Bild.png", READ_EXTENSIONS)).toThrow(/\.md, \.base, \.canvas/);
  });

  it("prueft die Endung ohne Ruecksicht auf Gross-/Kleinschreibung", () => {
    expect(resolveNotePath("Notes/Overview.BASE", READ_EXTENSIONS)).toBe("Notes/Overview.BASE");
  });

  it("schuetzt weiter gegen Traversal, auch mit erweiterter Erlaubnis", () => {
    expect(() => resolveNotePath("../weg.base", READ_EXTENSIONS)).toThrow(/verlässt den Vault/);
  });
});
