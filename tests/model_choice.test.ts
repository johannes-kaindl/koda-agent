import { resolveModelChoice } from "../src/core/llm/model-choice";

describe("resolveModelChoice", () => {
  it("bietet die gemeldeten Modelle als Auswahl an", () => {
    const c = resolveModelChoice({ reachable: true, models: ["a", "b"], current: "a" });
    expect(c.mode).toBe("dropdown");
    expect(c.options.map((o) => o.value)).toEqual(["a", "b"]);
    expect(c.value).toBe("a");
  });

  it("hält einen gespeicherten, aber nicht gelisteten Namen sichtbar", () => {
    // Die tragende Invariante: ein <select>, dessen Wert nicht unter seinen Optionen steht,
    // faellt still auf die erste Option zurueck — das naechste Speichern ueberschreibt dann
    // den konfigurierten Namen, ohne dass irgendetwas fehlschlaegt.
    const c = resolveModelChoice({ reachable: true, models: ["a"], current: "alt" });
    expect(c.options.map((o) => o.value)).toContain("alt");
    expect(c.options.find((o) => o.value === "alt")?.suffix).toBe("saved");
  });

  it("sichert die Invariante auch bei leerem Wert", () => {
    const c = resolveModelChoice({ reachable: true, models: ["a"], current: "" });
    expect(c.options.map((o) => o.value)).toContain("");
    expect(c.value).toBe("");
  });

  it("sperrt die Auswahl bei nicht erreichbarem Endpunkt, behaelt aber den Wert", () => {
    const c = resolveModelChoice({ reachable: false, models: [], current: "gemerkt" });
    expect(c.mode).toBe("locked");
    expect(c.value).toBe("gemerkt");
    expect(c.options.map((o) => o.value)).toEqual(["gemerkt"]);
    expect(c.hintKey).toBe("unreachable");
  });

  it("faellt auf Freitext zurueck, wenn der Endpunkt keine Liste herausgibt", () => {
    // Manche gehosteten Anbieter sperren /v1/models — dann ist ein leeres Dropdown eine
    // Sackgasse, ein Textfeld nicht.
    const c = resolveModelChoice({ reachable: true, models: [], current: "gpt-x" });
    expect(c.mode).toBe("freetext");
    expect(c.hintKey).toBe("no-list");
  });

  it("gibt einen i18n-Schluessel statt eines fertigen Satzes zurueck", () => {
    // Abweichung von der vault-rag-Vorlage, die deutschen Klartext liefert: Koda ist
    // zweisprachig. Derselbe Gotcha wie bei den Endpunkt-Statusmeldungen.
    const c = resolveModelChoice({ reachable: false, models: [], current: "" });
    expect(c.hintKey).toBe("unreachable");
    expect(JSON.stringify(c)).not.toMatch(/erreichbar —/);
  });
});
