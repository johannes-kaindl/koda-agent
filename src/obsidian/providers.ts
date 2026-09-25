// Werkzeug-Anbieter aus dem Plugin-Register lesen (Wirtsseite, Spike 2026-09-25).
// Gegenstueck zu `readRetrievalApi` — nur dass hier KEINE Plugin-Id fest steht: jedes
// geladene Plugin, dessen `api` den Vertrag erfuellt, ist ein Anbieter. Das ist die weiche
// Kopplung aus der Dach-AGENTS.md (Koda ist Store-Software, registriert wird, was da ist)
// ohne eine Liste, die mit jedem neuen Anbieter nachgezogen werden muesste.
//
// Bewusst bei JEDEM Aufruf statt einmal beim Laden: ein Anbieter kann zur Laufzeit an- oder
// abgeschaltet werden, und der Zugriff ist ein Objekt-Lookup plus die Form-Pruefung, die
// `tools()` einmal ruft (synchron und netzfrei laut Vertrag). Sortiert nach Plugin-Id, damit
// eine Namenskollision zweier Anbieter bei jedem Aufruf gleich ausgeht — die Reihenfolge in
// `app.plugins.plugins` ist Ladereihenfolge und die haengt am Zufall des Startens.

import { isToolProviderApi, type ToolProviderApi } from "../core/tools/provider";

export interface ToolProvider { id: string; api: ToolProviderApi }

export function readToolProviders(app: unknown): ToolProvider[] {
  const reg = (app as { plugins?: { plugins?: unknown } } | null | undefined)?.plugins?.plugins;
  if (reg === null || reg === undefined || typeof reg !== "object") return [];
  const out: ToolProvider[] = [];
  const plugins = reg as Record<string, unknown>;
  for (const id of Object.keys(plugins).sort()) {
    const api = (plugins[id] as { api?: unknown } | null | undefined)?.api;
    if (isToolProviderApi(api)) out.push({ id, api });
  }
  return out;
}
