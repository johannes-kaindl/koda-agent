/* Failover über die Endpunkt-Liste — pure.

   Der Kit macht bewusst nur EINEN Durchlauf (`resolveActiveEndpointConfig`) und überlässt
   Zwischenspeichern und erneutes Auflösen dem Aufrufer. Das hier ist dieser Aufrufer;
   der Schnitt ist von `vim-dojo/src/llm/endpointResolver.ts` übernommen und von `string`
   auf `EndpointConfig` gehoben (Koda führt Schlüssel und Modell je Zeile mit).

   Warum überhaupt zwischenspeichern: ein lokaler LLM-Server wandert mit dem Netz — daheim
   `localhost`, unterwegs die LAN-Adresse. Vor jeder Frage die ganze Liste anzupingen ließe
   jede Frage diesen Preis zahlen. Also einmal je Sitzung, und erneut erst, wenn eine
   Anfrage wirklich scheitert. */
import { rowModel, type EndpointConfig } from "../../vendor/kit/endpoint_config";
import {
  resolveEndpointSource,
  type ApiErrorCode, type EndpointChoice, type EndpointTransport, type LlmEndpointManagerApi,
} from "../../vendor/kit/endpoint-source";
import type { BackendId, FamilyId } from "../../vendor/kit/sampling-profiles";

/** Der aufgelöste Endpunkt samt dem Modell, das an ihn geht (das Modell der Zeile, in der
 *  gesendeten Schreibweise der Kit-Auflösung). */
export interface ResolvedEndpoint {
  config: EndpointConfig;
  model: string;
  /** Woher die Zeile kam: Manager oder lokale Liste. */
  kind: "manager" | "local";
  /** `"anthropic"` nur vom Manager; lokale Zeilen sind immer HTTP. */
  transport: EndpointTransport;
  family: FamilyId | null;
  backend: BackendId;
}

/** Die Quelle der Auflösung, frisch bei jedem Durchlauf gelesen: Manager (nur mit Opt-in und nur,
 *  wenn er da ist) und die Wahl an ihm. Ohne Manager gilt `choice` nicht — eine alte Wahl darf das
 *  Modell der lokalen Zeile nicht übersteuern. */
export interface EndpointSourceState {
  manager: LlmEndpointManagerApi | null;
  choice: EndpointChoice;
}

export class EndpointResolver {
  private cached: ResolvedEndpoint | null = null;
  /** Laufender Durchlauf, geteilt — sonst pingt jede gleichzeitige Frage die Liste selbst. */
  private pending: Promise<ResolvedEndpoint | null> | null = null;
  /** Grund der letzten Auflösung ohne Endpunkt; nur der Manager nennt einen. */
  private reason: ApiErrorCode | null = null;

  constructor(
    private readonly getEndpoints: () => EndpointConfig[],
    private readonly ping: (ep: EndpointConfig) => Promise<boolean>,
    /** Nach jeder neuen Auflösung (nicht beim Treffer aus dem Zwischenspeicher): wer das
     *  gesendete Modell liest (Thinking-Schalter), zieht damit nach. */
    private readonly onResolved: () => void = () => {},
    private readonly getSource: () => EndpointSourceState = () => ({ manager: null, choice: {} }),
  ) {}

  /** Das Modell, über das der Chat tatsächlich sendet — synchron. Nach einer Auflösung das des
   *  aufgelösten Endpunkts, davor das der ersten Zeile (die Liste ist die Priorität). Es gibt
   *  kein globales Modell mehr; eine Zeile ohne Modell sendet `""`. */
  peek(rows: readonly EndpointConfig[]): string {
    if (this.cached !== null) return this.cached.model;
    const src = this.getSource();
    if (src.manager !== null) return src.choice.model?.trim() ?? "";
    const first = rows[0];
    return first === undefined ? "" : rowModel(first);
  }

  /** Transport und Backend des gemerkten Endpunkts, synchron; davor HTTP und unbekannt. */
  peekTransport(): { transport: EndpointTransport; backend: BackendId } {
    return this.cached === null ? { transport: "http", backend: "unknown" } : { transport: this.cached.transport, backend: this.cached.backend };
  }

  /** Warum die letzte Auflösung keinen Endpunkt fand (`null`: lokal, oder es klappte). */
  failure(): ApiErrorCode | null {
    return this.reason;
  }

  /** Erster erreichbarer Eintrag, sonst `null`. Ein Fehlschlag wird NICHT gemerkt:
   *  beim nächsten Versuch kann das Netz zurück sein.
   *
   *  Die Auflösung ist die des Kits (`resolveEndpointSource`). Der Manager ist Opt-in
   *  (`useEndpointManager`, Entscheidung Johannes 2026-10-21): ohne ihn bleibt es die lokale Liste wie
   *  bisher. Das Zwischenspeichern und genau EINEN Neuversuch (`withFailover`) behält Koda selbst. */
  async resolve(): Promise<ResolvedEndpoint | null> {
    if (this.cached !== null) return this.cached;
    if (this.pending !== null) return this.pending;
    const src = this.getSource();
    this.pending = resolveEndpointSource(
      {
        manager: src.manager,
        local: this.getEndpoints(),
        capability: "chat",
        caller: "koda-agent",
        // Ohne Manager gilt `choice` nicht (sonst übersteuerte eine alte Wahl das Modell der Zeile).
        ...(src.manager !== null ? { choice: src.choice, transports: ["http", "anthropic"] as EndpointTransport[] } : {}),
      },
      this.ping,
    )
      .then((r) => {
        const ep: ResolvedEndpoint | null = r.config === null ? null : {
          config: r.config, model: r.sentModel || r.model, kind: r.kind,
          transport: r.transport ?? "http", family: r.family, backend: r.backend,
        };
        this.reason = r.config === null && r.kind === "manager" ? (r.reason ?? "no-endpoint") : null;
        this.cached = ep;
        this.onResolved();
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
 *
 * `onRefusedDespiteProbe` benennt einen Widerspruch, den nur diese Stelle sehen kann: die
 * Probe hat den Endpunkt gerade eben als erreichbar bewertet, und der eigentliche Aufruf
 * scheitert trotzdem am Netz — zweimal, auf frisch aufgelöstem Endpunkt. Dann ist „Server
 * aus, Adresse falsch" genau der falsche Rat: Probe und Aufruf nehmen verschiedene Wege
 * (Probe über Obsidians `requestUrl` im Main-Prozess ohne `Origin`, Chat als XHR aus dem
 * Renderer mit `Origin: app://obsidian.md`), und ein lokaler Server ohne CORS antwortet dem
 * einen und blockt den anderen. Gemessen 2026-08-18 gegen LM Studio ohne CORS: Probe grün,
 * Chat „nicht erreichbar" (Lesson 2026-08-16/yijing-oracle).
 */
export async function withFailover<R>(
  resolver: Pick<EndpointResolver, "resolve" | "invalidate">,
  run: (ep: ResolvedEndpoint) => Promise<R>,
  isRetryable: (result: R) => boolean,
  onNoEndpoint: () => R,
  onRefusedDespiteProbe?: (result: R) => R,
): Promise<R> {
  const first = await resolver.resolve();
  if (first === null) return onNoEndpoint();

  const result = await run(first);
  if (!isRetryable(result)) return result;

  resolver.invalidate();
  const second = await resolver.resolve();
  if (second === null) return result; // nichts Besseres in Sicht: der echte Fehler zählt
  const retried = await run(second);
  if (onRefusedDespiteProbe !== undefined && isRetryable(retried)) return onRefusedDespiteProbe(retried);
  return retried;
}
