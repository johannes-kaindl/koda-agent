// uebernommen aus vault-rag/src/plugin_api.ts, 2026-08-13
// Bewusst KOPIERT statt importiert: koda-agent und vault-rag sind eigenstaendige Repos
// (PROF-OBS-09), ein Import waere ein Build-Coupling. Aendert vault-rag den Vertrag,
// steigt dort `apiVersion` — `readRetrievalApi` (src/obsidian/retrieval.ts) prueft sie
// und liefert lieber `null` als zu raten.

import { parseFrontmatter } from "../../vendor/kit/frontmatter";

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

/** Ab wie vielen Volltext-Treffern die semantische Suche nicht mehr noetig ist.
 *  Startwert aus der Spec (E4), kein Messergebnis — bewusst eine Konstante an genau
 *  einer Stelle, damit ein Praxisbefund sie ohne Suche korrigieren kann. */
export const SEMANTIC_THRESHOLD = 3;

export function needsSemantic(textHitCount: number): boolean {
  return textHitCount < SEMANTIC_THRESHOLD;
}

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
    case "not-indexed":
      return `(semantisch: "${r.path}" nicht im Index)`;
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
    return ["Keine Treffer.", note].filter((x) => x !== null).join("\n");
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

/** Hat die Notiz ueberhaupt Text, den ein Index erfassen koennte — also etwas ausser
 *  Frontmatter? Notizen ohne solchen Text landen **nie** im Index (vault-rag erzeugt
 *  fuer sie null Chunks), `not-indexed` ist dort also endgueltig statt voruebergehend.
 *  Das trifft ausgerechnet Kodas eigene Schreibfaelle: eine frische `write_skill`-Notiz
 *  besteht anfangs nur aus Frontmatter, `Memory.md` vor dem ersten Eintrag auch.
 *
 *  Bewusst eine eigene Pruefung statt eines zusaetzlichen API-Grundes: die Frage laesst
 *  sich hier billig beantworten, und die fremde Vertragsflaeche schmal zu halten ist mehr
 *  wert. Der Preis ist, dass diese Heuristik vault-rags Chunk-Regel nur annaehert —
 *  deshalb formuliert die Meldung unten eine Feststellung ueber den INHALT, keine
 *  Vorhersage ueber den Index. */
export function hasIndexableText(raw: string): boolean {
  return parseFrontmatter(raw).body.trim() !== "";
}

/** `hasText`: `true`/`false` aus `hasIndexableText`, `null` wenn die Notiz nicht gelesen
 *  werden konnte — dann bleibt die Meldung bewusst unbestimmt statt falsch zuversichtlich. */
export function formatRelatedResult(r: ApiResult, path: string, hasText: boolean | null = null): string {
  if (!r.ok) {
    switch (r.reason) {
      case "no-index":
        return "Semantischer Index: kein Index vorhanden — vault-rag hat den Vault noch nicht indexiert.";
      case "offline":
        return "Semantischer Index: Endpunkt nicht erreichbar.";
      case "not-indexed":
        if (hasText === false) {
          // Bedingt formuliert, nicht endgueltig: die Notiz ist nicht dauerhaft
          // ausgeschlossen, sie hat nur JETZT nichts zu indexieren. Sobald Text darin
          // steht, greift der Live-Indexer normal.
          return `"${r.path}" hat derzeit keinen indexierbaren Inhalt (nur Frontmatter oder leer) — solange das so bleibt, erscheint die Notiz nicht im Index. Ein erneuter Versuch ändert daran nichts; erst Inhalt schreiben, dann greift der Indexer von selbst.`;
        }
        if (hasText === true) {
          return `"${r.path}" ist noch nicht im Index — der Indexer zieht kurz nach dem Speichern nach. Gleich noch einmal versuchen.`;
        }
        return `"${r.path}" ist nicht im Index — verwandte Notizen lassen sich dafür nicht bestimmen.`;
    }
  }
  if (r.hits.length === 0) return `Zu ${path} wurde nichts inhaltlich Verwandtes gefunden.`;
  return `Verwandt zu ${path}:\n${r.hits.map((h) => `${h.path} (${score(h.score)})`).join("\n")}`;
}
