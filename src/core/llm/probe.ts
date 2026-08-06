/* Erreichbarkeits-Probe für eine Endpunkt-Zeile — pure, HTTP injiziert.

   Die Klassifikation selbst kommt aus dem Kit (`classifyEndpointStatus`); hier lebt nur,
   was der Kit-Baustein nicht wissen kann: welche URL gefragt wird, welche Kopfzeilen
   mitgehen und wann aufgegeben wird.

   Abweichung von der Vorlage (`vault-crews`): dort verwirft der Transport den HTTP-Status
   und meldet jede verwertbare Antwort als 200. Ein 401 erscheint dadurch als „kein
   OpenAI-kompatibler Endpunkt", obwohl bloß der Schlüssel fehlt — eine Meldung, die in die
   falsche Richtung schickt. Obsidians `requestUrl` liefert mit `throw: false` den echten
   Status; den geben wir weiter. */
import { normalizeEndpoint } from "../../vendor/kit/endpoint";
import { authHeaders, type EndpointConfig } from "../../vendor/kit/endpoint_config";
import { classifyEndpointStatus, type EndpointStatus, type ProbeInput } from "../../vendor/kit/endpoint_diagnostics";
import type { ClockPort } from "../../vendor/kit-obsidian/clock";

export interface HttpProbe {
  /** Muss den echten Status zurückgeben statt bei 4xx/5xx zu werfen. Nur ein
   *  Transportfehler (kein Server, kein DNS) darf werfen. */
  getJson(url: string, headers: Record<string, string>): Promise<{ status: number; json: unknown }>;
}

export const PROBE_TIMEOUT_MS = 5000;

export async function probeEndpoint(
  ep: EndpointConfig,
  http: HttpProbe,
  clock: ClockPort,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<EndpointStatus> {
  return (await probeModels(ep, http, clock, timeoutMs)).status;
}

/** Dieselbe Probe, aber mit der Modell-Liste aus derselben Antwort. `/v1/models` liefert
 *  beides in einem Aufruf — die Erreichbarkeit UND die Namen. Zwei getrennte Anfragen
 *  dafür wären eine Anfrage zu viel. */
export async function probeModels(
  ep: EndpointConfig,
  http: HttpProbe,
  clock: ClockPort,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<{ status: EndpointStatus; models: string[] }> {
  const url = `${normalizeEndpoint(ep.url)}/v1/models`;
  const headers = authHeaders(ep.apiKey === "" || ep.apiKey === undefined ? undefined : ep.apiKey);

  let timer: number | undefined;
  const timeout = new Promise<ProbeInput>((resolve) => {
    timer = clock.setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
  });
  const attempt = http.getJson(url, headers).then(
    (r): ProbeInput => ({ kind: "response", status: r.status, body: r.json }),
    (e: unknown): ProbeInput => ({ kind: "error", message: e instanceof Error ? e.message : String(e) }),
  );

  try {
    const input = await Promise.race([attempt, timeout]);
    const status = classifyEndpointStatus(input);
    const models = input.kind === "response" ? extractModelIds(input.body) : [];
    return { status, models };
  } finally {
    if (timer !== undefined) clock.clearTimeout(timer);
  }
}

/** Pure Auswertung einer `GET /v1/models`-Antwort.
 *  Übernommen aus `vim-dojo/src/llm/modelList.ts` (dort das erste Exemplar; vault-rag hat
 *  dieselbe Logik inline). Mit Koda ist das n=3 — Kit-Kandidat. */
export function extractModelIds(body: unknown): string[] {
  const data = (body as { data?: unknown } | null | undefined)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((m) =>
      m !== null && typeof m === "object" && typeof (m as { id?: unknown }).id === "string"
        ? (m as { id: string }).id
        : null,
    )
    .filter((id): id is string => id !== null);
}
