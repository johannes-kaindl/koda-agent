import { loadKodaSettings } from "../src/core/settings-migration";

const row = (url: string, model?: string) => (model === undefined ? { url } : { url, model });

describe("loadKodaSettings — globales Modell wandert in die Zeilen", () => {
  it("erster Lauf: der Altwert füllt Zeilen ohne Modell, eine Zeile mit Modell bleibt", () => {
    const raw = { model: " alt ", endpoints: [row("http://a"), row("http://b", "eigen")] };
    const r = loadKodaSettings(raw);
    expect(r.changed).toBe(true);
    expect(r.settings.endpoints).toEqual([row("http://a", "alt"), row("http://b", "eigen")]);
    expect("model" in r.settings).toBe(false);
  });

  it("zweiter Lauf auf dem gespeicherten Ergebnis ändert nichts", () => {
    const first = loadKodaSettings({ model: "alt", endpoints: [row("http://a")] });
    const again = loadKodaSettings(JSON.parse(JSON.stringify(first.settings)));
    expect(again.changed).toBe(false);
    expect(again.settings).toEqual(first.settings);
  });

  it("eine vom Nutzer geleerte Zeile bleibt nach dem Neustart leer", () => {
    const first = loadKodaSettings({ model: "alt", endpoints: [row("http://a")] });
    const cleared = { ...first.settings, endpoints: [row("http://a")] };
    const again = loadKodaSettings(JSON.parse(JSON.stringify(cleared)));
    expect(again.settings.endpoints).toEqual([row("http://a")]);
  });

  it("ein leerer oder kein Text als Altwert ändert die Zeilen nicht, der Schlüssel zählt trotzdem als migriert", () => {
    for (const legacy of ["", "  ", 42, null]) {
      const r = loadKodaSettings({ model: legacy, endpoints: [row("http://a")] });
      expect(r.settings.endpoints).toEqual([row("http://a")]);
      expect(r.changed).toBe(true);
    }
  });

  it("frische Installation und leere Rohdaten bleiben unverändert", () => {
    expect(loadKodaSettings(null).changed).toBe(false);
    expect(loadKodaSettings({}).changed).toBe(false);
  });
});
