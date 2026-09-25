/* Semantische Kandidaten aus vault-rag — Treffer zur Frage (Modus Vault) und Nachbarn der
 * aktiven Notiz (Modus Notiz). Pure: die API kommt als Port herein (`readRetrievalApi` im
 * Adapter liefert sie oder null).
 *
 * Zwei Haltungen, bewusst verschieden (Spec, Etappe-3-Zuschnitt Punkte 2 und 4):
 * - Vault: der Modus IST die Suche. Schlaegt sie fehl, meldet der Block es — still leer
 *   waere eine Kappung, die sich nicht nennt.
 * - Notiz: die Nachbarn sind eine Zugabe. Fehlen sie, fehlt der Abschnitt, sonst nichts.
 *
 * Koda beurteilt Treffer nicht (Dach-AGENTS.md, Zustaendigkeits-Zuschnitt): keine Schwelle,
 * kein Score im Block — die Reihenfolge der API ist die Reihenfolge der Kandidaten. */
import type { RetrievalApi } from "../tools/retrieval";
import type { ContextMode } from "./types";

// uebernommen aus vault-rag/src/context_panel.ts:10 (MIN_QUERY), 2026-09-18
export const MIN_QUERY_CHARS = 3;

export type SemanticFailure = "absent" | "no-index" | "offline" | "not-indexed" | "error";
export type SemanticHits =
  | { kind: "none" }
  | { kind: "ok"; paths: string[] }
  | { kind: "failed"; reason: SemanticFailure };

export const NO_HITS: SemanticHits = { kind: "none" };

export interface SemanticRequest {
  mode: ContextMode;
  query: string;
  activePath: string | null;
  k: number;
}

export async function fetchSemanticHits(api: RetrievalApi | null, req: SemanticRequest): Promise<SemanticHits> {
  if (req.k <= 0) return NO_HITS;

  if (req.mode === "vault") {
    const q = req.query.trim();
    if (q.length < MIN_QUERY_CHARS) return NO_HITS;
    if (api === null) return { kind: "failed", reason: "absent" };
    try {
      const res = await api.search(q, { k: req.k });
      return res.ok ? { kind: "ok", paths: res.hits.map((h) => h.path) } : { kind: "failed", reason: res.reason };
    } catch {
      return { kind: "failed", reason: "error" };
    }
  }

  if (req.mode === "note") {
    if (api === null || req.activePath === null) return NO_HITS;
    try {
      if (!api.status().indexed) return NO_HITS;
      const res = await api.related(req.activePath, { k: req.k });
      return res.ok ? { kind: "ok", paths: res.hits.map((h) => h.path) } : NO_HITS;
    } catch {
      return NO_HITS;
    }
  }

  return NO_HITS;
}

const NOTICE = {
  de: {
    head: "Vault-Suche nicht verfügbar",
    absent: "das Plugin vault-rag fehlt oder ist deaktiviert",
    "no-index": "vault-rag hat keinen Index geladen",
    offline: "der Embedding-Endpunkt von vault-rag ist nicht erreichbar",
    "not-indexed": "die Notiz steht nicht im Index von vault-rag",
    error: "vault-rag hat einen Fehler gemeldet",
  },
  en: {
    head: "Vault search unavailable",
    absent: "the vault-rag plugin is missing or disabled",
    "no-index": "vault-rag has no index loaded",
    offline: "vault-rag's embedding endpoint is not reachable",
    "not-indexed": "the note is not in vault-rag's index",
    error: "vault-rag reported an error",
  },
} as const;

/** Eine Zeile fuer Block UND Kontext-Tab — ein Wortlaut, zwei Orte. */
export function semanticNotice(reason: SemanticFailure, lang: "de" | "en"): string {
  const t = NOTICE[lang];
  return `[${t.head}: ${t[reason]}]`;
}
