import type { ProviderOffer, ToolLang, ToolProviderApi } from "../vendor/kit/tool-provider";
import { findToolProvider, readProviderOffers } from "../vendor/kit-obsidian/tool-providers";
import { createTaskNotesProvider, isTaskNotesApi, TASKNOTES_ID, type TaskNotesApi } from "../core/tools/tasknotes";

/** Die In-App-Schnittstelle von TaskNotes, frisch aus dem Plugin-Register; `null`, wenn das Plugin fehlt, abgeschaltet ist oder die Form nicht stimmt.
 *  Fremdes Plugin ohne eigenen Werkzeug-Anbieter-Vertrag: Koda adaptiert es selbst (`core/tools/tasknotes.ts`), weich gekoppelt wie vault-rag. */
export function readTaskNotesApi(app: unknown): TaskNotesApi | null {
  const reg = (app as { plugins?: { plugins?: Record<string, { api?: unknown } | undefined> } } | null | undefined)?.plugins?.plugins;
  const api = reg?.[TASKNOTES_ID]?.api;
  return isTaskNotesApi(api) ? api : null;
}

const tasknotes = (app: unknown): ToolProviderApi => createTaskNotesProvider(() => readTaskNotesApi(app));

/** Alle Angebote: die Anbieter nach dem Kit-Vertrag, dann TaskNotes (adaptiert). Ein Plugin mit der Id `tasknotes`, das den Vertrag selbst erfüllt, gewinnt:
 *  sein Angebot steht schon in der Kit-Liste, und die Id wird nicht doppelt montiert. */
export function readOffers(app: unknown, lang: ToolLang): ProviderOffer[] {
  const kit = readProviderOffers(app, lang);
  if (kit.some((o) => o.id === TASKNOTES_ID)) return kit;
  const tools = tasknotes(app).tools({ lang });
  return tools.length > 0 ? [...kit, { id: TASKNOTES_ID, tools }] : kit;
}

/** Der Anbieter hinter einer Route (Id aus `MountedTools.routes`), frisch gelesen. */
export function findProvider(app: unknown, id: string): ToolProviderApi | null {
  const kit = findToolProvider(app, id);
  if (kit !== null || id !== TASKNOTES_ID) return kit;
  return readTaskNotesApi(app) === null ? null : tasknotes(app);
}
