import { describe, it, expect } from "vitest";
import { t, setLang } from "../src/vendor/kit/i18n";
import "../src/i18n/strings";

const KEYS = [
  "settings.modelControl", "settings.prompt", "settings.prompt.desc", "settings.prompt.reset",
  "settings.prompt.show", "settings.warn.noTools", "settings.warn.missingPlaceholder",
  "settings.warn.noReadingTool", "settings.tools", "settings.tools.desc",
  "settings.tools.needsRag", "settings.tools.descPlaceholder",
  "prompt.modal.title", "prompt.modal.subtitle", "prompt.modal.close",
];

describe("Texte der Modell-Steuerung", () => {
  it("kennt jeden Schluessel in beiden Sprachen", () => {
    for (const lang of ["de", "en"] as const) {
      setLang(lang);
      for (const k of KEYS) {
        expect(t(k), `${k} fehlt in ${lang}`).not.toBe(k);
        expect(t(k).trim(), `${k} ist leer in ${lang}`).not.toBe("");
      }
    }
  });
  it("loest den Fachbegriff auf, statt ihn nur zu nennen (UI-STANDARD §10)", () => {
    setLang("de");
    // Die Beschreibung muss sagen, WAS das Ding tut — nicht bloss "System-Prompt".
    expect(t("settings.prompt.desc").length).toBeGreaterThan(40);
    expect(t("settings.prompt.desc")).toMatch(/Anweisung|Regeln/);
  });
  it("nennt in der Platzhalter-Warnung beide Platzhalter beim Namen", () => {
    for (const lang of ["de", "en"] as const) {
      setLang(lang);
      expect(t("settings.warn.missingPlaceholder")).toContain("{{sprache}}");
      expect(t("settings.warn.missingPlaceholder")).toContain("{{ordner}}");
    }
  });
});
