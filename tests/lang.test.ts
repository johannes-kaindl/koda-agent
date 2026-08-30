import { describe, it, expect, vi } from "vitest";
import { resolveLang } from "../src/core/lang";

describe("resolveLang — eine ausdrueckliche Wahl gewinnt immer", () => {
  it("nimmt die eingestellte Sprache und fragt gar nicht erst", () => {
    const detect = vi.fn(() => "en" as const);
    expect(resolveLang("de", null, detect)).toEqual({ lang: "de", cache: null });
    expect(detect).not.toHaveBeenCalled();
  });

  it("gilt auch, wenn schon eine Auto-Sprache gemerkt ist", () => {
    expect(resolveLang("en", "de", () => "de")).toEqual({ lang: "en", cache: "de" });
  });
});

describe("resolveLang — auto wird genau EINMAL ermittelt", () => {
  it("ermittelt beim ersten Mal und merkt sich das Ergebnis", () => {
    const detect = vi.fn(() => "de" as const);
    expect(resolveLang("auto", null, detect)).toEqual({ lang: "de", cache: "de" });
    expect(detect).toHaveBeenCalledTimes(1);
  });

  it("fragt beim zweiten Mal nicht erneut — das ist der ganze Zweck", () => {
    const detect = vi.fn(() => "en" as const);
    expect(resolveLang("auto", "de", detect)).toEqual({ lang: "de", cache: "de" });
    expect(detect).not.toHaveBeenCalled();
  });
});

// Der Fall, der den Fehler getragen hat: `safeGetLanguage()` fing jeden Fehler ab und gab ""
// zurueck, woraus `pickLang` stillschweigend "en" machte. Ein misslungener Versuch darf
// weder als Ergebnis gelten noch eingefroren werden.
describe("resolveLang — eine misslungene Erkennung ist kein Ergebnis", () => {
  it("faellt auf die bisherige Sprache zurueck, statt Englisch zu behaupten", () => {
    expect(resolveLang("auto", null, () => null, "de")).toEqual({ lang: "de", cache: null });
  });

  it("merkt sich den Fehlschlag NICHT — der naechste Versuch darf es erneut probieren", () => {
    const detect = vi.fn(() => null);
    const erst = resolveLang("auto", null, detect, "de");
    expect(erst.cache).toBeNull();
    const dann = resolveLang("auto", erst.cache, () => "de");
    expect(dann).toEqual({ lang: "de", cache: "de" });
  });

  it("ohne bisherige Sprache bleibt Englisch der letzte Ausweg", () => {
    expect(resolveLang("auto", null, () => null)).toEqual({ lang: "en", cache: null });
  });
});
