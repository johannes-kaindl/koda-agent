// uebernommen aus vault-rag/src/lab_client.ts, 2026-09-17 (dort selbst uebernommen aus
// koda-agent/src/obsidian/retrieval.ts, 2026-08-22 — derselbe Defensiv-Lese-Bauplan wie
// readRetrievalApi, hier auf llm-lab gewendet). apiVersion auf 4 gehoben (turnId).
/** Liest llm-labs oeffentliche API defensiv aus dem Plugin-Register.
 *
 *  Bewusst bei JEDEM Aufruf statt einmal beim Laden: das Lab kann zur Laufzeit
 *  aktiviert oder deaktiviert werden, und der Zugriff ist nur ein Objekt-Lookup. */
const SUPPORTED_API_VERSION = 4;
const PLUGIN_ID = "llm-lab";

export interface LabLogInput {
  plugin: string;
  feature: string;
  model: string;
  endpointUrl: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  content: string;
  reasoning?: string;
  finishReason?: string;
  latencyMs: number;
  ttftMs?: number;
  error?: string;
  /** Endpunkt-Schluessel zur exakten Maskierung, nie im Record. */
  secrets?: string[];
  /** Pfade der Notizen, die in den Aufruf eingeflossen sind. */
  contextPaths?: string[];
  /** Der stabile Anteil des System-Prompts (ohne Memory, ohne Skills, ohne
   *  Nutzereingabe) — Grundlage des Prompt-Fassungsvergleichs im Lab. */
  promptTemplate?: string;
  /** Klammert mehrere Aufrufe, die zu EINER Nutzer-Handlung gehoeren (Kodas
   *  Agent-Loop macht pro Frage mehrere LLM-Aufrufe mit Tool-Calls dazwischen). */
  turnId?: string;
}

export interface LabApi {
  apiVersion: number;
  status(): { apiVersion: number; recording: boolean };
  log(input: LabLogInput): string;
}

export function readLabApi(app: unknown): LabApi | null {
  const reg = (app as { plugins?: { plugins?: Record<string, unknown> } } | null | undefined)
    ?.plugins?.plugins;
  if (reg === null || typeof reg !== "object") return null;

  const api = (reg[PLUGIN_ID] as { api?: unknown } | undefined)?.api as LabApi | undefined;
  if (!api || api.apiVersion !== SUPPORTED_API_VERSION) return null;

  const complete = typeof api.status === "function" && typeof api.log === "function";
  return complete ? api : null;
}
