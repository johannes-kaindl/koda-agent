import "../src/i18n/strings";
import { setLang, t } from "../src/vendor/kit/i18n";
import type { EndpointStatusKind } from "../src/vendor/kit/endpoint_diagnostics";

/* Die Zuordnung Status → Textschluessel ist die einzige Stelle, an der ein fehlender
   Eintrag stumm bleibt: `t()` gibt bei unbekanntem Schluessel den Schluessel selbst zurueck,
   und in der Oberflaeche stuende dann "settings.probe.timeout" statt einer Meldung.
   Das Record erzwingt Vollstaendigkeit schon im Typecheck — kommt im Kit eine Status-Art
   dazu, bricht der Build hier, nicht erst die Anzeige. */
const KINDS: Record<EndpointStatusKind, true> = {
  "ok": true,
  "refused": true,
  "unknown-host": true,
  "timeout": true,
  "not-an-llm-api": true,
  "unauthorized": true,
  "unknown": true,
};

describe("Endpunkt-Status-Texte", () => {
  for (const lang of ["de", "en"] as const) {
    it(`hat fuer jede Status-Art einen ${lang.toUpperCase()}-Text`, () => {
      setLang(lang);
      for (const kind of Object.keys(KINDS)) {
        const key = `settings.probe.${kind}`;
        const text = t(key);
        expect(text, `fehlender Text fuer ${key}`).not.toBe(key);
        expect(text.length).toBeGreaterThan(3);
      }
    });
  }

  it("reicht die rohe Serverzeile in den unknown-Text durch", () => {
    setLang("de");
    expect(t("settings.probe.unknown", "ECONNRESET")).toContain("ECONNRESET");
  });
});
