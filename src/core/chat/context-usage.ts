/* Belegung des Kontextfensters als Prozentzahl fuer die Statuszeile.
 *
 * Gefuettert wird das aus `estimateTokens` — DERSELBEN Schaetzung, auf der die Verdichtung
 * ihre Entscheidung trifft (`src/core/agent/compaction/estimate.ts`), und mit derselben
 * Schwelle (`compactAtPercent`). Das ist Absicht: eine Anzeige, die von der Ausloesung
 * abweicht, waere schlimmer als keine — sie soll erklaeren, warum gleich verdichtet wird.
 *
 * `null` heisst „keine Aussage moeglich", nicht „0 %". Ohne bekanntes Fenster gibt es nichts,
 * wovon man Prozent nehmen koennte; die Zeile zeigt dann nichts statt einer erfundenen Zahl. */

export interface ContextUsage {
  /** 0…100, gekappt. Ein Ueberlauf zeigt 100, nicht 137. */
  percent: number;
  /** Ab der Verdichtungsschwelle: die Zeile faerbt sich. */
  warn: boolean;
}

export function contextUsage(usedTokens: number, windowTokens: number, warnAtPercent: number): ContextUsage | null {
  if (windowTokens <= 0) return null;
  const raw = (Math.max(0, usedTokens) / windowTokens) * 100;
  const percent = Math.min(100, Math.round(raw));
  // Gegen die UNGERUNDETE Zahl vergleichen: bei 74,6 % zeigt die Zeile 75 %, verdichtet wird
  // aber noch nicht — die Warnfarbe folgt der Ausloesung, nicht der Anzeige.
  return { percent, warn: raw >= warnAtPercent };
}
