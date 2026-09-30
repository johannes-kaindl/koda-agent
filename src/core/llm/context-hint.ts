/** Kontextfenster-Hinweis aus dem Modellnamen. Die Konvention stammt von EINEM Betreiber
 *  (`gpt-oss:120b-ctx128k`, `gemma4:31b-ctx128k`): das Suffix `-ctxNNNk` nennt das Fenster,
 *  mit dem das Modell dort geladen ist. Es ist eine Heuristik ueber einen Namen, kein
 *  Protokoll — sie liefert nur einen Hinweis, nie einen Wert, der still gespeichert wird.
 *  Gehoert mittelfristig neben `guessFromName` ins code-kit (`capabilities.ts`); hier
 *  repo-lokal, Kit-Kandidat n=1. */
export function contextHintFromModelName(name: string | undefined): number | null {
  if (name === undefined) return null;
  const m = /-ctx(\d{1,4})k(?![a-z0-9])/i.exec(name);
  if (m === null) return null;
  const k = parseInt(m[1], 10);
  // „128k" heisst bei diesen Modellen 131072 (Ollama num_ctx), nicht 128000. Der Hinweis
  // bleibt so auch fuer die zwei gaengigen Einstellungen 128000 und 131072 ohne Fehlalarm.
  return k > 0 ? k * 1024 : null;
}

/** Der kleinste Hinweis unter `current`, sonst `null`. Gewarnt wird nur nach unten: ein
 *  groesseres Fenster beim Modell als in der Einstellung kostet hoechstens Ausnutzung, ein
 *  kleineres laesst Koda mehr schicken, als das Modell aufnimmt. */
export function lowerContextHint(current: number, candidates: Array<number | null | undefined>): number | null {
  const below = candidates.filter((c): c is number => typeof c === "number" && c > 0 && c < current);
  return below.length === 0 ? null : Math.min(...below);
}
