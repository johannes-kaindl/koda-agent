// uebernommen aus vault-rag/src/plugin_api.ts, 2026-08-13
// Bewusst KOPIERT statt importiert: koda-agent und vault-rag sind eigenstaendige Repos
// (PROF-OBS-09), ein Import waere ein Build-Coupling. Aendert vault-rag den Vertrag,
// steigt dort `apiVersion` — `readRetrievalApi` (src/obsidian/retrieval.ts) prueft sie
// und liefert lieber `null` als zu raten.


export interface ApiHit {
  path: string;
  /** Roher Cosinus-Wert, ungerundet — gerundet wird erst bei der Anzeige. */
  score: number;
}

/** Erwartbare Zustaende sind WERTE, keine Ausnahmen. `reason` ist ein maschinenlesbarer
 *  Code ohne uebersetzten Text — die Formulierung gehoert dem Aufrufer, also uns.
 *  Deshalb hier nie ein Textvergleich auf `reason`, sondern immer ein Union-Zweig. */
export type ApiResult =
  | { ok: true; hits: ApiHit[] }
  | { ok: false; reason: "no-index" }
  | { ok: false; reason: "offline" }
  | { ok: false; reason: "paused" }
  | { ok: false; reason: "not-indexed"; path: string };

export interface ApiStatus { apiVersion: number; indexed: boolean; noteCount: number }

export interface RetrievalApi {
  readonly apiVersion: number;
  /** Synchron und netzfrei. Beantwortet NUR „ist ein Index geladen" — nicht, ob der
   *  Embedding-Endpunkt erreichbar ist. Ein `search` kann trotz `indexed: true`
   *  jederzeit `offline` liefern. */
  status(): ApiStatus;
  search(query: string, opts?: { k?: number; minSim?: number }): Promise<ApiResult>;
  /** Nach aussen async, obwohl vault-rag intern synchron rechnet — der Vertrag haelt
   *  einen spaeteren Lazy-Load des Index offen. */
  related(path: string, opts?: { k?: number; minSim?: number }): Promise<ApiResult>;
}

/** Ein Volltext-Treffer, wie ihn Kodas eigene Suche erzeugt. */
export interface TextHit { path: string; snippet: string }

/* Hier stand bis 2026-08-14 eine Schwelle: semantisch nachfragen nur bei < 3
 * Volltext-Treffern (Spec E4). Sie ist ersatzlos entfallen, und das absichtlich —
 * wer sie wieder einfuehren will, sollte zuerst den Messfall kennen:
 *
 * Die Frage „Welche Notizen behandeln den Einsatz lokaler KI-Modelle?" fand in einem
 * Vault mit 1.219 indexierten Notizen genau drei woertliche Treffer (zwei davon aus
 * dem Archiv) — und wurde damit vom semantischen Weg abgeschnitten. Ungenannt blieb
 * ein ganzer Bereichsordner, dessen Notizen „Ollama" und „Modell-Benchmark" heissen
 * und die gesuchte Wortfolge nirgends enthalten. Genau dieser Fall ist der Grund fuer
 * die Anbindung, und die Schwelle verhinderte ihn.
 *
 * Die Schwelle zaehlte Treffer, statt sie zu wiegen — drei schlechte schalteten den
 * zweiten Weg so zuverlaessig ab wie drei gute. Sie zu WIEGEN waere die naheliegende
 * Reparatur und ist trotzdem keine: eine Heuristik ueber Trefferguete IST Retrieval,
 * und Retrieval gehoert vault-rag (Dach-AGENTS, § Zustaendigkeits-Zuschnitt). Bleibt,
 * beide Wege immer zu gehen. Der Preis ist eine Einbettungs-Anfrage je Suche —
 * gegen eine Tool-Runde beim lokalen Modell (> 90 s) nicht der Rede wert, und die
 * Volltextsuche liest ohnehin jede Notiz des Vaults.
 */

const score = (n: number): string => n.toFixed(2);

/** Klartext zu einem Ausfall der semantischen Seite. `null`, solange nichts ausfiel —
 *  ein Nutzer ohne vault-rag soll keine Meldung ueber eine Faehigkeit lesen, die er
 *  nie hatte. */
function outageNote(r: ApiResult | null): string | null {
  if (r === null || r.ok) return null;
  switch (r.reason) {
    case "no-index":
      return "(semantisch: kein Index vorhanden — vault-rag hat den Vault noch nicht indexiert)";
    case "offline":
      return "(semantisch: Embedding-Endpunkt nicht erreichbar — nur Volltext-Treffer)";
    case "paused":
      return "(Die semantische Suche ist pausiert — Treffer stammen nur aus dem Volltext)";
    case "not-indexed":
      return `(semantisch: "${r.path}" nicht im Index)`;
  }
}

/** Die Ausfallnotiz fuer den Fall OHNE jeden Treffer. „Keine Treffer. (semantisch: …)“ las sich schief: die Klammer wirkt wie eine
 *  Randbemerkung zu einer leeren Suche, obwohl nur der Volltext leer blieb und die semantische Seite gar nicht lief. Hier steht
 *  deshalb beides als Satz: was leer war und warum der Rest fehlt. */
function outageNoteWhenEmpty(r: ApiResult | null): string | null {
  if (r === null || r.ok) return null;
  const head = "Keine Volltext-Treffer. ";
  switch (r.reason) {
    case "no-index":
      return `${head}Die semantische Suche lief nicht: kein Index vorhanden — vault-rag hat den Vault noch nicht indexiert.`;
    case "offline":
      return `${head}Die semantische Suche lief nicht: Embedding-Endpunkt nicht erreichbar.`;
    case "paused":
      return `${head}Die semantische Suche ist pausiert — Treffer stammen nur aus dem Volltext.`;
    case "not-indexed":
      return `${head}Die semantische Suche lief nicht: "${r.path}" nicht im Index.`;
  }
}

/** Warum Bloecke statt einer gemischten Rangfolge: Volltext hat keinen Score,
 *  semantische Treffer haben keinen Snippet — eine gemeinsame Sortierung waere
 *  erfunden. Und ein Volltext-Treffer BELEGT ein woertliches Vorkommen, ein
 *  semantischer nicht; diese Unterscheidung ist fuer die Antwort wertvoll. */
export function formatSearchResult(text: TextHit[], semantic: ApiResult | null): string {
  const semHits = semantic?.ok === true ? semantic.hits : [];
  const scoreByPath = new Map(semHits.map((h) => [h.path, h.score]));
  const note = outageNote(semantic);

  const textLines = text.map((h) => {
    const s = scoreByPath.get(h.path);
    return s === undefined ? `${h.path}: ${h.snippet}` : `${h.path}: ${h.snippet} (${score(s)})`;
  });
  // Was schon woertlich getroffen wurde, erscheint nicht zweimal.
  const onlySemantic = semHits.filter((h) => !text.some((t) => t.path === h.path));

  if (textLines.length === 0 && onlySemantic.length === 0) {
    return outageNoteWhenEmpty(semantic) ?? "Keine Treffer.";
  }
  if (onlySemantic.length === 0) {
    return [textLines.join("\n"), note].filter((x) => x !== null).join("\n");
  }

  const blocks: string[] = [];
  if (textLines.length > 0) blocks.push(`Volltext (wörtlich gefunden):\n${textLines.join("\n")}`);
  blocks.push(
    `Inhaltlich ähnlich (semantisch/Index, 0–1):\n${onlySemantic.map((h) => `${h.path} (${score(h.score)})`).join("\n")}`,
  );
  if (note !== null) blocks.push(note);
  return blocks.join("\n");
}
