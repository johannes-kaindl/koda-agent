import { planMove } from "../src/core/tools/move";

describe("planMove — Validierung beider Pfade", () => {
  it("normalisiert beide Seiten", () => {
    expect(planMove("./Projekte//a.md", "Archiv/./a.md")).toMatchObject({
      source: "Projekte/a.md", destination: "Archiv/a.md",
    });
  });
  it("lehnt identische Pfade ab, statt einen Nulleffekt zu melden", () => {
    expect(() => planMove("a.md", "./a.md")).toThrow(/gleiche/i);
  });
  it("erbt den Pfad-Guard: kein Traversal", () => {
    expect(() => planMove("a.md", "../ausserhalb/a.md")).toThrow(/verlässt den Vault/i);
  });
  it("erbt den Pfad-Guard: nur .md", () => {
    // Exakte Meldung: prüft, dass Move die schmale Liste nutzt, nicht eine, die .md enthält
    expect(() => planMove("a.md", "Archiv/a.txt")).toThrow('Nur .md erlaubt: "Archiv/a.txt"');
    // Und ein Fall, der trägt unabhängig vom Wortlaut: .canvas ist nicht erlaubt.
    // Unter dem falschen Guard (READ_EXTENSIONS) würde das nicht werfen — genau das soll dieser Test fangen.
    expect(() => planMove("a.md", "Archiv/a.canvas")).toThrow();
  });
});

describe("planMove — Umbenennen und Verschieben sind verschiedene Vorgaenge", () => {
  it("gleicher Ordner, anderer Name = Umbenennen", () => {
    expect(planMove("Projekte/alt.md", "Projekte/neu.md").kind).toBe("rename");
  });
  it("anderer Ordner, gleicher Name = Verschieben", () => {
    expect(planMove("Projekte/a.md", "Archiv/a.md").kind).toBe("move");
  });
  it("anderer Ordner UND anderer Name = Verschieben", () => {
    expect(planMove("Projekte/alt.md", "Archiv/neu.md").kind).toBe("move");
  });
  it("Vault-Wurzel zaehlt als Ordner", () => {
    expect(planMove("alt.md", "neu.md").kind).toBe("rename");
    expect(planMove("alt.md", "Archiv/alt.md").kind).toBe("move");
  });
});
