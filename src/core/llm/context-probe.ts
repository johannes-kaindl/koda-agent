// uebernommen aus vim-dojo/src/llm/modelContext.ts, 2026-08-18 — HTTP hier injiziert statt requestUrl (core bleibt obsidian-frei)
/* Best-effort-Abfrage des Kontextfensters: erst LM Studio (`/api/v0/models`, je Modell),
   dann Ollama (`POST /api/show`). Rein informativ — wirft nie; null heisst „dieser Endpunkt
   meldet es nicht“ (OpenWebUI, vLLM, gehostete Anbieter). Reihenfolge wie vault-crews'
   local-llm-client. Dritter Consumer dieses Musters (vault-crews, vim-dojo, koda). */
import { normalizeEndpoint } from "../../vendor/kit/endpoint";
import { authHeaders, type EndpointConfig } from "../../vendor/kit/endpoint_config";
import { parseLmStudioContext, parseOllamaContext } from "../../vendor/kit/model-context";
import { withTimeout } from "../../vendor/kit/timeout";
import type { ClockPort } from "../../vendor/kit-obsidian/clock";
import { PROBE_TIMEOUT_MS, type HttpProbe } from "./probe";

export async function probeModelContext(
  ep: EndpointConfig,
  model: string,
  http: HttpProbe,
  clock: ClockPort,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<number | null> {
  if (model === "") return null;
  const base = normalizeEndpoint(ep.url);
  const headers = authHeaders(ep.apiKey === "" || ep.apiKey === undefined ? undefined : ep.apiKey);

  try {
    const lm = await withTimeout(http.getJson(`${base}/api/v0/models`, headers), timeoutMs, clock);
    if (!lm.timedOut && lm.value.status >= 200 && lm.value.status < 300) {
      const ctx = parseLmStudioContext(lm.value.json, model);
      if (ctx) return ctx.loadedContextLength ?? ctx.maxContextLength ?? null;
    }
  } catch {
    // weiter zu Ollama
  }
  try {
    const oll = await withTimeout(http.postJson(`${base}/api/show`, { model }, headers), timeoutMs, clock);
    if (!oll.timedOut && oll.value.status >= 200 && oll.value.status < 300) {
      const ctx = parseOllamaContext(oll.value.json);
      if (ctx) return ctx.maxContextLength ?? null;
    }
  } catch {
    // niemand meldet ein Fenster
  }
  return null;
}
