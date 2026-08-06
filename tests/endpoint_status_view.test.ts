import "../src/i18n/strings";
import { setLang, t } from "../src/vendor/kit/i18n";
import type { EndpointStatus } from "../src/vendor/kit/endpoint_diagnostics";
import { endpointStatusView } from "../src/core/llm/endpoint-status-view";

/* Die Statuszeile ist ein Icon mit Tooltip, kein Text im Beschreibungsfeld — uebernommen
   aus `vault-rag/src/settings.ts` (dort erprobt). Der Grund ist kein Geschmack: ein
   `setText` auf dem `descEl` einer Setting-Zeile hat in Obsidian 1.13.5 den Renderer in
   eine Endlosschleife geschickt (2026-08-06, Freeze beim Klick auf „Testen"). Diese
   Funktion haelt die Zuordnung Status → Anzeige an einem Ort, an dem sie pruefbar ist. */

const OK: EndpointStatus = { reachable: true, kind: "ok", klartext: "egal" };
const BAD: EndpointStatus = { reachable: false, kind: "refused", klartext: "egal" };

describe("endpointStatusView", () => {
  it("zeigt fuer einen erreichbaren Endpunkt ein Haekchen", () => {
    const view = endpointStatusView(OK);
    expect(view.icon).toBe("circle-check");
    expect(view.ok).toBe(true);
  });

  it("zeigt fuer einen nicht erreichbaren Endpunkt ein Kreuz", () => {
    const view = endpointStatusView(BAD);
    expect(view.icon).toBe("circle-x");
    expect(view.ok).toBe(false);
  });

  it("zeigt waehrend der Pruefung einen unentschiedenen Zustand", () => {
    const view = endpointStatusView(null);
    expect(view.icon).toBe("loader");
    expect(view.ok).toBe(null);
  });

  it("nimmt den Tooltip aus der uebersetzten Statusmeldung, nicht aus dem Rohtext", () => {
    setLang("de");
    expect(endpointStatusView(OK).tooltip).toBe(t("settings.probe.ok"));
    expect(endpointStatusView(BAD).tooltip).toBe(t("settings.probe.refused"));
  });

  it("haengt bei einem unbekannten Fehler die Rohmeldung an", () => {
    setLang("de");
    const raw = "ERR_SOMETHING_ODD";
    const view = endpointStatusView({ reachable: false, kind: "unknown", klartext: "egal", raw });
    expect(view.tooltip).toBe(t("settings.probe.unknown", raw));
  });
});
