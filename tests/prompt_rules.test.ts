import { describe, it, expect } from "vitest";
import { DEFAULT_RULES, renderRules, PLACEHOLDER_LANG, PLACEHOLDER_FOLDER, checkRules } from "../src/core/prompt/rules";

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

describe("checkRules", () => {
  const alle = ["search_notes", "read_note", "list_notes"];

  it("meldet nichts fuer den Auslieferungsstand", () => {
    expect(checkRules(DEFAULT_RULES, alle)).toEqual([]);
  });
  it("meldet nichts fuer einen umformulierten, aber gueltigen Prompt", () => {
    // Der Kern von Spec E5: keine Wort-fuer-Wort-Pruefung. Sonst waere jede
    // Umformulierung ein Fehlalarm — und Fehlalarme erziehen zum Wegsehen.
    const eigen = `Du bist Koda. Antworte auf ${PLACEHOLDER_LANG}. Nutze deine Werkzeuge, bevor du behauptest. Schreibe frei in ${PLACEHOLDER_FOLDER}.`;
    expect(checkRules(eigen, alle)).toEqual([]);
  });
  it("meldet no-tools, wenn von Werkzeugen ueberhaupt nicht die Rede ist", () => {
    expect(checkRules(`Antworte auf ${PLACEHOLDER_LANG} in ${PLACEHOLDER_FOLDER}.`, alle)).toContain("no-tools");
  });
  it("erkennt sowohl das englische als auch das deutsche Wort, ohne Ruecksicht auf Gross-Klein", () => {
    const rumpf = `${PLACEHOLDER_LANG} ${PLACEHOLDER_FOLDER} `;
    expect(checkRules(rumpf + "Benutze TOOLS.", alle)).not.toContain("no-tools");
    expect(checkRules(rumpf + "Benutze Werkzeuge.", alle)).not.toContain("no-tools");
    expect(checkRules(rumpf + "Benutze werkzeuge.", alle)).not.toContain("no-tools");
  });
  it("meldet missing-placeholder, wenn einer der beiden fehlt", () => {
    expect(checkRules(`tools ${PLACEHOLDER_FOLDER}`, alle)).toContain("missing-placeholder");
    expect(checkRules(`tools ${PLACEHOLDER_LANG}`, alle)).toContain("missing-placeholder");
  });
  it("meldet no-reading-tool, wenn kein lesendes Werkzeug mehr aktiv ist", () => {
    expect(checkRules(DEFAULT_RULES, [])).toEqual(["no-reading-tool"]);
  });
  it("meldet mehrere Befunde zugleich und in stabiler Reihenfolge", () => {
    expect(checkRules("nichts", [])).toEqual(["no-tools", "missing-placeholder", "no-reading-tool"]);
  });
});
