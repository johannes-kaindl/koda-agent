import type { RetrievalApi } from "../core/tools/retrieval";

/** Version, gegen die Koda gebaut ist. Meldet vault-rag eine andere, wird die API
 *  ignoriert statt geraten — genau dafuer traegt sie die Nummer. */
const SUPPORTED_API_VERSION = 1;
const PLUGIN_ID = "vault-retrieval";

/**
 * Liest vault-rags oeffentliche API defensiv aus dem Plugin-Register.
 *
 * Bewusst bei JEDEM Aufruf statt einmal beim Laden: vault-rag kann zur Laufzeit
 * aktiviert oder deaktiviert werden, und der Zugriff ist nur ein Objekt-Lookup.
 * Parameter ist `unknown`, weil `app.plugins` nicht Teil der offiziellen
 * Obsidian-Typen ist — jeder Schritt dorthin wird einzeln geprueft, damit ein
 * fehlendes Zwischenglied `null` ergibt statt einer Ausnahme mitten im Tool-Lauf.
 */
export function readRetrievalApi(app: unknown): RetrievalApi | null {
  const reg = (app as { plugins?: { plugins?: Record<string, unknown> } } | null | undefined)
    ?.plugins?.plugins;
  if (reg === null || typeof reg !== "object") return null;

  const api = (reg[PLUGIN_ID] as { api?: unknown } | undefined)?.api as RetrievalApi | undefined;
  if (!api || api.apiVersion !== SUPPORTED_API_VERSION) return null;

  // Form pruefen, nicht nur Vorhandensein: ein halb initialisiertes oder fremdes
  // Objekt unter demselben Schluessel darf nicht bis in einen Tool-Aufruf durchrutschen.
  const complete = typeof api.status === "function"
    && typeof api.search === "function"
    && typeof api.related === "function";
  return complete ? api : null;
}
