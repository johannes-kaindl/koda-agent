import { isImageGenProviderApi, type ImageGenProviderApi } from "../vendor/kit/image-gen-provider";

/** Besitzer der Faehigkeit „Prompt → Bild“ (Kit-Vertrag `image-gen-provider`). */
export const IMAGE_GEN_PLUGIN_ID = "local-image-generator";

/** Wie `readOcrApi`: frisch je Aufruf, Form-Guard statt Versionskopie, `null` bei jedem
 *  fehlenden Zwischenglied statt einer Ausnahme mitten im Werkzeug-Lauf. */
export function readImageGenApi(app: unknown): ImageGenProviderApi | null {
  const reg = (app as { plugins?: { plugins?: Record<string, unknown> } } | null | undefined)?.plugins?.plugins;
  if (reg === null || typeof reg !== "object") return null;
  const api = (reg[IMAGE_GEN_PLUGIN_ID] as { api?: unknown } | undefined)?.api;
  return isImageGenProviderApi(api) ? api : null;
}
