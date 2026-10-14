// vendored from obsidian-kit@0.60.1, src/obsidian/tool-providers.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
import {
  isToolProviderApi, toolProviderRejection, type ProviderOffer, type ToolLang, type ToolProviderApi, type ToolProviderRejection,
} from "../kit/tool-provider";

/** Werkzeug-Anbieter aus dem Plugin-Register lesen (Wirtsseite). Gegenstück zu `findEndpointManager`,
 *  nur dass hier KEINE Plugin-Id fest steht: jedes geladene Plugin, dessen `api` den Vertrag erfüllt
 *  (`isToolProviderApi`), ist ein Anbieter. Das ist die weiche Kopplung der Dach-AGENTS.md (ein Wirt ist
 *  Store-Software, registriert wird, was da ist) ohne eine Liste, die mit jedem Anbieter nachzuziehen wäre.
 *
 *  Bei JEDEM Aufruf frisch, nie beim Laden: ein Anbieter kann zur Laufzeit an- oder abgeschaltet werden.
 *  Sortiert nach Plugin-Id, damit eine Namenskollision zweier Anbieter bei jedem Aufruf gleich ausgeht —
 *  die Reihenfolge in `app.plugins.plugins` ist die Ladereihenfolge, und die hängt am Zufall des Startens.
 *
 *  Ein Wirt, der selbst `api.tools` anbietet, schließt sich nicht aus; er montierte sich sonst selbst
 *  (heute kein Fall: koda-agent und vault-crews sind Wirte ohne Anbieter-API). */
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

/** Der Anbieter hinter einer Route (`MountedTools.routes`), frisch gelesen: `null`, wenn das Plugin
 *  zwischen Prompt-Bau und Aufruf deaktiviert wurde. */
export function findToolProvider(app: unknown, id: string): ToolProviderApi | null {
  return readToolProviders(app).find((p) => p.id === id)?.api ?? null;
}

/** Die Angebote aller Anbieter in einer Sprache, bereit für `mountProviderTools`. Ein Anbieter, dessen
 *  `tools({ lang })` wirft oder kein Array liefert, fällt weg, statt die Werkzeugliste des Wirts zu
 *  zerstören (der Form-Guard hat nur `tools()` ohne Sprache gerufen). */
export function readProviderOffers(app: unknown, lang: ToolLang): ProviderOffer[] {
  const out: ProviderOffer[] = [];
  for (const p of readToolProviders(app)) {
    try {
      const tools = p.api.tools({ lang });
      if (Array.isArray(tools)) out.push({ id: p.id, tools });
    } catch {
      // Anbieter bricht den Vertrag: nicht anbieten, nicht abstürzen.
    }
  }
  return out;
}

/** Plugins, die wie ein Werkzeug-Anbieter aussehen (ihr `api` trägt eine Methode `tools`), den Vertrag aber nicht erfüllen — mit dem
 *  Grund. Für eine Diagnose im Wirt („warum fehlen die Werkzeuge von Plugin X?“); `readToolProviders` lässt sie still weg. Plugins ohne
 *  `api.tools` kommen nicht vor: sie bieten nichts an und sind keine Ablehnung. */
export function readToolProviderRejections(app: unknown): { id: string; rejection: ToolProviderRejection }[] {
  const reg = (app as { plugins?: { plugins?: unknown } } | null | undefined)?.plugins?.plugins;
  if (reg === null || reg === undefined || typeof reg !== "object") return [];
  const out: { id: string; rejection: ToolProviderRejection }[] = [];
  const plugins = reg as Record<string, unknown>;
  for (const id of Object.keys(plugins).sort()) {
    const api = (plugins[id] as { api?: unknown } | null | undefined)?.api;
    if (api === null || typeof api !== "object" || typeof (api as { tools?: unknown }).tools !== "function") continue;
    const rejection = toolProviderRejection(api);
    if (rejection !== null) out.push({ id, rejection });
  }
  return out;
}
