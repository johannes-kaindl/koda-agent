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
    return classifyEndpointStatus(await Promise.race([attempt, timeout]));
  } finally {
    if (timer !== undefined) clock.clearTimeout(timer);
  }
}
