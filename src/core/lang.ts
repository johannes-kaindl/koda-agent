/* Welche Sprache gilt — und wann sie ermittelt wird.
 *
 * Anlass (gemessen 2026-08-30 im laufenden Obsidian): Koda sprach Englisch, obwohl Obsidian
 * deutsch lief. Der Grund war NICHT die Erkennung, sondern ihr Zeitpunkt: `applyLanguage()`
 * hing an `saveSettings()` und ermittelte die Auto-Sprache dadurch immer wieder neu. Der
 * Kit-Modulkopf von `i18n.ts` schreibt ausdruecklich das Gegenteil vor — „ruft setLang()
 * einmalig beim onload" —, und die Nachbarn halten sich daran (`llm-lab/src/main.ts:20`:
 * `setLang(pickLang(getLanguage()))`, einmal). Auf derselben Maschine, in derselben Sitzung
 * war llm-lab deutsch und Koda englisch.
 *
 * Deshalb: die Auto-Sprache wird EINMAL ermittelt und danach wiederverwendet. Eine
 * ausdrueckliche Einstellung wirkt weiterhin sofort — nur die Erkennung friert ein, und
 * genau so ist sie gedacht.
 *
 * Zweiter Teil derselben Lehre: eine misslungene Erkennung ist kein Ergebnis. Vorher fing
 * `safeGetLanguage()` jeden Fehler ab und gab "" zurueck, woraus `pickLang` stillschweigend
 * "en" machte — ein Fehler wurde so zu einer Aussage. `detect` meldet den Fehlschlag jetzt
 * als `null`, und der wird weder als Sprache ausgegeben noch eingefroren. */

export type Lang = "en" | "de";
export type LanguageSetting = "auto" | Lang;

export interface LangResolution {
  /** Die ab jetzt geltende Sprache. */
  lang: Lang;
  /** Die gemerkte Auto-Sprache — unveraendert durchgereicht, wenn nichts zu merken war. */
  cache: Lang | null;
}

/**
 * @param setting  Nutzerwahl aus den Einstellungen.
 * @param cache    Bereits ermittelte Auto-Sprache, oder null.
 * @param detect   Erkennung; `null` heisst „hat nicht geklappt", nicht „Englisch".
 * @param fallback Was gilt, solange nichts ermittelt werden konnte (typisch die bisherige).
 */
export function resolveLang(
  setting: LanguageSetting,
  cache: Lang | null,
  detect: () => Lang | null,
  fallback: Lang = "en",
): LangResolution {
  if (setting !== "auto") return { lang: setting, cache };
  if (cache !== null) return { lang: cache, cache };
  const erkannt = detect();
  // Fehlschlag NICHT cachen: sonst friert ein einmaliger Fehler die Sprache fuer die
  // restliche Sitzung ein — dieselbe Bauart wie der Modell-Cache ohne `hide()`.
  if (erkannt === null) return { lang: fallback, cache: null };
  return { lang: erkannt, cache: erkannt };
}
