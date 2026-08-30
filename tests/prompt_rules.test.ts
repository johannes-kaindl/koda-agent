import { describe, it, expect } from "vitest";
import { DEFAULT_RULES, renderRules, PLACEHOLDER_LANG, PLACEHOLDER_FOLDER } from "../src/core/prompt/rules";

describe("DEFAULT_RULES", () => {
  it("traegt beide Platzhalter statt eingesetzter Werte", () => {
    expect(DEFAULT_RULES).toContain(PLACEHOLDER_LANG);
    expect(DEFAULT_RULES).toContain(PLACEHOLDER_FOLDER);
    expect(DEFAULT_RULES).not.toContain("German");
    expect(DEFAULT_RULES).not.toContain("Koda/");
  });
  it("nennt jedes schreibende Werkzeug, das eine eigene Regel hat", () => {
    expect(DEFAULT_RULES).toContain("save_memory");
    // Bis 0.9.0 fehlte write_skill im Prompt vollstaendig — der Anlass dieser Task.
    expect(DEFAULT_RULES).toContain("write_skill");
  });
});

describe("renderRules", () => {
  it("setzt Sprache und Ordner ein", () => {
    const out = renderRules(`Answer in ${PLACEHOLDER_LANG}. Write in "${PLACEHOLDER_FOLDER}/".`, {
      lang: "de",
      folder: "Koda",
    });
    expect(out).toBe('Answer in German. Write in "Koda/".');
  });
  it("setzt jedes Vorkommen ein, nicht nur das erste", () => {
    const out = renderRules(`${PLACEHOLDER_FOLDER} und ${PLACEHOLDER_FOLDER}`, { lang: "en", folder: "A" });
    expect(out).toBe("A und A");
  });
  it("raeumt einen Schraegstrich am Ordnerende weg, damit kein doppelter entsteht", () => {
    expect(renderRules(PLACEHOLDER_FOLDER, { lang: "en", folder: "Koda//" })).toBe("Koda");
  });
  it("laesst einen unbekannten Platzhalter stehen, statt ihn zu verschlucken", () => {
    expect(renderRules("{{unbekannt}}", { lang: "en", folder: "K" })).toBe("{{unbekannt}}");
  });
  it("uebersetzt die Sprachnamen englisch, weil der Prompt englisch ist", () => {
    expect(renderRules(PLACEHOLDER_LANG, { lang: "en", folder: "K" })).toBe("English");
    expect(renderRules(PLACEHOLDER_LANG, { lang: "de", folder: "K" })).toBe("German");
  });
});
