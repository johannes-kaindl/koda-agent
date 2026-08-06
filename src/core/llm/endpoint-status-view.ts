/* Status einer Endpunkt-Zeile → Anzeige (Icon · Zustand · Tooltip).
 *
 * Uebernommen aus `vault-rag/src/settings.ts`, wo die Statuszeile seit Monaten laeuft:
 * ein **Icon mit Tooltip in der Steuerspalte**, kein Text in der Beschreibungsspalte.
 * Der Unterschied ist nicht kosmetisch — ein `setText` auf dem `descEl` einer
 * Setting-Zeile hat Obsidian 1.13.5 beim Klick auf „Testen" in eine Endlosschleife
 * geschickt (Renderer bei 100 %, beide Fenster tot; gemessen 2026-08-06). `descEl`
 * gehoert seit dem eigenen Settings-Fenster dem Host, nicht dem Plugin.
 *
 * Hier lebt nur die Zuordnung — pur und damit pruefbar. Das Setzen am DOM bleibt in
 * `settings.ts` und ist bewusst duenn. */
import { t } from "../../vendor/kit/i18n";
import type { EndpointStatus } from "../../vendor/kit/endpoint_diagnostics";

export interface EndpointStatusView {
  /** Lucide-Icon-Name für `setIcon`. */
  icon: string;
  /** `true` erreichbar, `false` nicht, `null` Prüfung läuft noch. */
  ok: boolean | null;
  tooltip: string;
}

/** `null` bedeutet „wird gerade geprüft“ — der Zustand zwischen Klick und Antwort. */
export function endpointStatusView(status: EndpointStatus | null): EndpointStatusView {
  if (status === null) {
    return { icon: "loader", ok: null, tooltip: t("settings.probe.testing") };
  }
  return {
    icon: status.reachable ? "circle-check" : "circle-x",
    ok: status.reachable,
    tooltip:
      status.kind === "unknown"
        ? t("settings.probe.unknown", status.raw ?? "")
        : t(`settings.probe.${status.kind}`),
  };
}
