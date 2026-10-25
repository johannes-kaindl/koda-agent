/** Die Verbindung der Modellzeile (Kit `buildModelBar`) für Koda (Welle 27, K3). Obsidian-frei, in Node getestet.
 *
 *  Warum ein Adapter: die Zeile braucht vier Methoden (`models`, `setModel`, `modelInUse`, `source`; obsidian-kit 0.70.0, `ModelBarConnection`). Koda hat keine `LlmConnection`
 *  (kein globales Modell-Feld, ein eigener `EndpointResolver`), und die Einstellungen haben schon eine Stelle, an der ein Modell geschrieben wird: die Zeile des
 *  gesendeten Endpunkts, mit Endpoint Manager `choice.model`. Der Adapter schreibt dorthin und hält keinen zweiten Zustand ausser der ausstehenden Wahl;
 *  Dropdown und Einstellungen zeigen damit dasselbe.
 *
 *  Zwei Fallen am Resolver (Gegenlese 2026-10-25): (i) `saveSettings()` verwirft den Zwischenstand (`invalidate()`); danach liefert `peek` das Modell der ERSTEN Zeile und
 *  `peekTransport` das Backend „unbekannt“, bis wieder aufgelöst wurde. War die zweite Zeile die gesendete, spränge die Anzeige nach jedem Wechsel. Darum löst `setModel`
 *  nach dem Speichern neu auf. (ii) Die Liste: bei einem Manager kommt sie aus dessen Modelltabelle (Claude: eine Messages-API ohne `/v1/models` mit Bearer), lokal aus dem
 *  Abruf des aufgelösten Endpunkts. */
import { applyEndpointEdit, type EndpointConfig } from "../../vendor/kit/endpoint_config";
import type { EndpointChoice } from "../../vendor/kit/endpoint-source";
import type { ModelListResult } from "../../vendor/kit/model-list-cache";
import { normalizeEndpoint } from "../../vendor/kit/endpoint";
import type { EndpointResolver } from "./failover";

/** Was der Adapter von den Einstellungen braucht: lesen, und eine Änderung SYNCHRON in die Einstellungen schreiben und speichern (das Speichern verwirft den Zwischenstand
 *  des Resolvers, wie `saveSettings()`). */
export interface ModelBarSettingsPort {
  getEndpoints(): EndpointConfig[];
  getChoice(): EndpointChoice;
  update(patch: { endpoints?: EndpointConfig[]; choice?: EndpointChoice }): Promise<void>;
}

export interface ModelBarLlmDeps {
  resolver: Pick<EndpointResolver, "resolve" | "peekSelected" | "peekDefault">;
  settings: ModelBarSettingsPort;
  /** Erreichbarkeit und Liste einer lokalen Zeile (ein Abruf, mit Schlüssel aus dem Schlüsselbund). */
  listModels(ep: EndpointConfig): Promise<ModelListResult>;
}

export interface ModelBarLlm {
  models(opts?: { force?: boolean }): Promise<ModelListResult>;
  setModel(model: string): Promise<void>;
  modelInUse(): string;
  source(): { defaultModel?: string };
}

export function createModelBarLlm(d: ModelBarLlmDeps): ModelBarLlm {
  let pending: string | null = null;

  async function models(): Promise<ModelListResult> {
    const ep = await d.resolver.resolve();
    if (ep === null) return { models: [], reachable: false };
    if (ep.kind === "manager") return { models: (ep.models ?? []).map((m) => m.id), reachable: true };
    return d.listModels(ep.config);
  }

  async function setModel(model: string): Promise<void> {
    pending = model;
    try {
      const ep = await d.resolver.resolve();
      if (ep === null) return;
      if (ep.kind === "manager") {
        const { model: _old, ...rest } = d.settings.getChoice();
        await d.settings.update({ choice: model !== "" ? { ...rest, model } : rest });
      } else {
        // Die Zeile NACH dem Auflösen lesen: die gesendete Zeile ist nicht immer die erste.
        const rows = d.settings.getEndpoints();
        const active = normalizeEndpoint(ep.config.url);
        const i = ep.config.id !== undefined
          ? rows.findIndex((r) => (r as { id?: string }).id === ep.config.id)
          : rows.findIndex((r) => normalizeEndpoint(r.url) === active);
        if (i < 0) return;
        await d.settings.update({ endpoints: applyEndpointEdit(rows, i, "model", model, false) });
      }
      await d.resolver.resolve();   // das Speichern hat den Zwischenstand verworfen: wieder auflösen, sonst springt die Anzeige auf die erste Zeile
    } finally {
      if (pending === model) pending = null;
    }
  }

  return {
    models,
    setModel,
    modelInUse: () => pending ?? d.resolver.peekSelected(d.settings.getEndpoints()),
    source: () => {
      const def = d.resolver.peekDefault();
      return def !== undefined && def !== "" ? { defaultModel: def } : {};
    },
  };
}
