import { isOcrProviderApi, type OcrProviderApi } from "../vendor/kit/ocr-provider";

/** Besitzer der Faehigkeit „Bild → Text“ (Kit-Vertrag `ocr-provider`). */
export const OCR_PLUGIN_ID = "image-to-markdown";

/** Liest die OCR-API des Besitzers defensiv aus dem Plugin-Register — bei JEDEM Aufruf frisch,
 *  weil das Plugin zur Laufzeit an- oder abgeschaltet werden kann. Der Form-Guard des Kits
 *  ersetzt die Versionskopie (REGISTRY: Form-Guard statt Versionskopie): ein halb
 *  initialisiertes oder fremdes Objekt unter demselben Schluessel ergibt `null`. */
export function readOcrApi(app: unknown): OcrProviderApi | null {
  const reg = (app as { plugins?: { plugins?: Record<string, unknown> } } | null | undefined)?.plugins?.plugins;
  if (reg === null || typeof reg !== "object") return null;
  const api = (reg[OCR_PLUGIN_ID] as { api?: unknown } | undefined)?.api;
  return isOcrProviderApi(api) ? api : null;
}
