/* Best-effort-Abfrage des Kontextfensters (LM Studio, dann Ollama). Die Abfolge, das Timeout je
   Versuch und das Lesen der Antworten liegen im Kit (`fetchModelContext`, code-kit 0.23.0);
   hier bleibt, was der Baustein nicht wissen kann: Auth-Kopfzeilen, die Basis-URL aus der Zeile
   und der Statusfilter des Transports (nur 2xx zaehlt, sonst `null`). Rein informativ — wirft nie;
   null heisst „dieser Endpunkt meldet es nicht“ (OpenWebUI, vLLM, gehostete Anbieter). */
import { normalizeEndpoint } from "../../vendor/kit/endpoint";
import { authHeaders, type EndpointConfig } from "../../vendor/kit/endpoint_config";
import type { CapabilityFetch } from "../../vendor/kit/capabilities";
import { effectiveContext, fetchModelContext, type ModelContext } from "../../vendor/kit/model-context";
import type { ClockPort } from "../../vendor/kit-obsidian/clock";
import { PROBE_TIMEOUT_MS, type HttpProbe } from "./probe";

/** Beide Laengen, die der Server nennt (geladen, hoechstens) — die Zeile der Endpunkt-Liste zeigt beide. */
export async function probeModelContextInfo(
  ep: EndpointConfig,
  model: string,
  http: HttpProbe,
  clock: ClockPort,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<ModelContext | null> {
  const headers = authHeaders(ep.apiKey === "" || ep.apiKey === undefined ? undefined : ep.apiKey);
  const fetchJson: CapabilityFetch = async (req) => {
    const r = req.method === "POST"
      ? await http.postJson(req.url, JSON.parse(req.body ?? "null") as unknown, { ...headers, ...req.headers })
      : await http.getJson(req.url, headers);
    return r.status >= 200 && r.status < 300 ? { json: r.json } : null;
  };
  return fetchModelContext(fetchJson, normalizeEndpoint(ep.url), model, { timers: clock, timeoutMs });
}

/** Die eine Zahl (geladen vor hoechstens), die Koda fuer Kontextfenster-Uebernahme und -Warnung braucht. */
export async function probeModelContext(
  ep: EndpointConfig,
  model: string,
  http: HttpProbe,
  clock: ClockPort,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<number | null> {
  return effectiveContext(await probeModelContextInfo(ep, model, http, clock, timeoutMs));
}
