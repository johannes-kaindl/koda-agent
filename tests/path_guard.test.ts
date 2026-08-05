import { resolveNotePath } from "../src/core/tools/path-guard";

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
