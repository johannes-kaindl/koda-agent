/* Failover über die Endpunkt-Liste — pure.

   Der Kit macht bewusst nur EINEN Durchlauf (`resolveActiveEndpointConfig`) und überlässt
   Zwischenspeichern und erneutes Auflösen dem Aufrufer. Das hier ist dieser Aufrufer;
   der Schnitt ist von `vim-dojo/src/llm/endpointResolver.ts` übernommen und von `string`
   auf `EndpointConfig` gehoben (Koda führt Schlüssel und Modell je Zeile mit).

   Warum überhaupt zwischenspeichern: ein lokaler LLM-Server wandert mit dem Netz — daheim
   `localhost`, unterwegs die LAN-Adresse. Vor jeder Frage die ganze Liste anzupingen ließe
   jede Frage diesen Preis zahlen. Also einmal je Sitzung, und erneut erst, wenn eine
   Anfrage wirklich scheitert. */
import { resolveActiveEndpointConfig, type EndpointConfig } from "../../vendor/kit/endpoint_config";

export class EndpointResolver {
  private cached: EndpointConfig | null = null;
  /** Laufender Durchlauf, geteilt — sonst pingt jede gleichzeitige Frage die Liste selbst. */
  private pending: Promise<EndpointConfig | null> | null = null;

  constructor(
    private readonly getEndpoints: () => EndpointConfig[],
    private readonly ping: (ep: EndpointConfig) => Promise<boolean>,
  ) {}

  /** Erster erreichbarer Eintrag, sonst `null`. Ein Fehlschlag wird NICHT gemerkt:
   *  beim nächsten Versuch kann das Netz zurück sein. */
  async resolve(): Promise<EndpointConfig | null> {
    if (this.cached !== null) return this.cached;
    if (this.pending !== null) return this.pending;
    this.pending = resolveActiveEndpointConfig(this.getEndpoints(), this.ping)
      .then((ep) => {
        this.cached = ep;
        return ep;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  /** Verwirft den gemerkten Endpunkt; der nächste `resolve()` pingt die Liste erneut. */
  invalidate(): void {
    this.cached = null;
  }
}

/**
 * Führt `run` auf dem aufgelösten Endpunkt aus und wiederholt **genau einmal** auf einem
 * neu aufgelösten, wenn `isRetryable` das Ergebnis als Ausfall liest.
 *
 * Genau einmal, nicht „bis es klappt": eine Schleife über eine Liste toter Endpunkte
 * würde eine Frage minutenlang hängen lassen, ohne dass jemand sieht, worauf gewartet wird.
 *
 * Der Aufrufer entscheidet über `isRetryable`, was ein Ausfall ist — und muss dabei den
 * Streaming-Fall bedenken: sind bereits Token beim Nutzer angekommen, darf NICHT wiederholt
 * werden, sonst erscheint die halbe Antwort zweimal.
 */
export async function withFailover<R>(
  resolver: Pick<EndpointResolver, "resolve" | "invalidate">,
  run: (ep: EndpointConfig) => Promise<R>,
  isRetryable: (result: R) => boolean,
  onNoEndpoint: () => R,
): Promise<R> {
  const first = await resolver.resolve();
  if (first === null) return onNoEndpoint();

  const result = await run(first);
  if (!isRetryable(result)) return result;

  resolver.invalidate();
  const second = await resolver.resolve();
  if (second === null) return result; // nichts Besseres in Sicht: der echte Fehler zählt
  return run(second);
}
