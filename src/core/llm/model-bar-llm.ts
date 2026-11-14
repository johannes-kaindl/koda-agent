/** Die Verbindung der Modellzeile (Kit `buildModelBar`) für Koda (Welle 27, K3). Obsidian-frei, in Node getestet.
 *
 *  Warum ein Adapter: die Zeile braucht zehn Methoden (`models`, `setModel`, `modelInUse`, `source`; seit obsidian-kit 0.87.0 dazu `endpoints`, `activeEndpointId`, `modelsOf`, `choice`, `setChoice`, `subscribe`; `ModelBarConnection`). Koda hat keine `LlmConnection`
 *  (kein globales Modell-Feld, ein eigener `EndpointResolver`), und die Einstellungen haben schon eine Stelle, an der ein Modell geschrieben wird: die Zeile des
 *  gesendeten Endpunkts, mit Endpoint Manager `choice.model`. Der Adapter schreibt dorthin und hält keinen zweiten Zustand ausser der ausstehenden Wahl;
 *  Dropdown und Einstellungen zeigen damit dasselbe.
 *
 *  Gruppen nach Endpunkt (Kit 0.87.0, Welle 34): mit dem Manager (Opt-in an und installiert) liefert `endpoints()` die eingeschalteten Endpunkte der Wahl-Liste (Fähigkeit chat, Transporte http und
 *  anthropic, wie der Einstellungs-Tab), die Zeile zeigt alle Modelle gruppiert und schreibt eine Wahl mit `setChoice({ endpointId, model })`. Ohne Manager ist `endpoints()` leer und die Zeile eine flache Liste
 *  (`setModel` wie bisher): `[]` gilt nur dort, mit Manager wäre es eine Umgehung. `subscribe` bedient die Zeile; der Resolver meldet über `notify()` nach jeder neuen Auflösung. Ein Zuhörer ruft nie `resolve()`.
 *
 *  Zwei Fallen am Resolver (Gegenlese 2026-10-25): (i) `saveSettings()` verwirft den Zwischenstand (`invalidate()`); danach liefert `peek` das Modell der ERSTEN Zeile und
 *  `peekTransport` das Backend „unbekannt“, bis wieder aufgelöst wurde. War die zweite Zeile die gesendete, spränge die Anzeige nach jedem Wechsel. Darum löst `setModel`
 *  nach dem Speichern neu auf. (ii) Die Liste: bei einem Manager kommt sie aus dessen Modelltabelle (Claude: eine Messages-API ohne `/v1/models` mit Bearer), lokal aus dem
 *  Abruf des aufgelösten Endpunkts. */
import type { ModelBarEndpoint } from "../../vendor/kit-obsidian/model-bar";
import { applyEndpointEdit, type EndpointConfig } from "../../vendor/kit/endpoint_config";
import type { EndpointChoice, LlmEndpointManagerApi } from "../../vendor/kit/endpoint-source";
import type { ModelBarConnection } from "../../vendor/kit-obsidian/model-bar";
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
  resolver: Pick<EndpointResolver, "resolve" | "peekSelected" | "peekDefault" | "peekKind" | "peekReason" | "peekEndpointId">;
  settings: ModelBarSettingsPort;
  /** Erreichbarkeit und Liste einer lokalen Zeile (ein Abruf, mit Schlüssel aus dem Schlüsselbund). */
  listModels(ep: EndpointConfig): Promise<ModelListResult>;
  /** Der Endpoint Manager, wenn Koda ihn benutzt (Opt-in an UND installiert), sonst `null`. Frisch gelesen: der Manager kann jederzeit kommen und gehen. */
  manager(): Pick<LlmEndpointManagerApi, "list" | "models"> | null;
}

/** Die Verbindung der Modellzeile (obsidian-kit 0.87.0: zehn Methoden) plus `notify` für den Wirt. */
export interface ModelBarLlm extends ModelBarConnection {
  /** Meldet allen Zuhörern der Modellzeile, dass sich Auflösung oder Wahl geändert haben (der Resolver ruft es nach jeder neuen Auflösung). Ruft nie `resolve()`. */
  notify(): void;
}

/** Die Fähigkeit und die Transporte, mit denen Koda den Manager fragt: dieselben wie der Einstellungs-Tab (`buildEndpointSourceSection`) und der Resolver. */
const MANAGER_FILTER = { capability: "chat" as const, transports: ["http", "anthropic"] as ("http" | "anthropic")[] };

export function createModelBarLlm(d: ModelBarLlmDeps): ModelBarLlm {
  let pending: string | null = null;
  const subscribers = new Set<() => void>();

  function notify(): void {
    for (const cb of [...subscribers]) { try { cb(); } catch { /* ein Zuhörer stört die anderen nicht */ } }
  }

  /** Die wählbaren Endpunkte: nur mit Manager (Opt-in). Ohne ihn `[]`, dann zeichnet die Zeile eine flache Liste ohne Gruppen wie vor 0.87.0. */
  function endpoints(): ModelBarEndpoint[] {
    const m = d.manager();
    if (m === null) return [];
    return m.list(MANAGER_FILTER).filter((e) => e.enabled).map((e) => ({ id: e.id, label: e.label, ...(e.defaultModel ? { defaultModel: e.defaultModel } : {}) }));
  }

  /** Der Endpunkt, den die Auflösung wirklich nimmt: die Kennung, die der Manager mitgeliefert hat (obsidian-kit 0.89.0), nicht aus der Liste geraten (vorher band ein nicht erreichbarer erster Eintrag den falschen). */
  function activeEndpointId(): string | undefined {
    return d.manager() === null || d.resolver.peekKind() !== "manager" ? undefined : d.resolver.peekEndpointId();
  }

  async function modelsOf(endpointId: string, opts?: { force?: boolean }): Promise<ModelListResult> {
    const m = d.manager();
    if (m === null) return { models: [], reachable: false };
    try {
      const list = await m.models(endpointId, opts?.force === true ? { force: true } : undefined);
      return "error" in list ? { models: [], reachable: false } : { models: list, reachable: true };
    } catch { return { models: [], reachable: false }; }
  }

  /** Die eine Stelle, die Endpunkt UND Modell für Koda festlegt (Modellzeile); der Einstellungs-Tab schreibt dieselbe Einstellung über `saveSettings()`. */
  async function setChoice(c: EndpointChoice): Promise<void> {
    await d.settings.update({ choice: c });
    await d.resolver.resolve();   // das Speichern hat den Zwischenstand verworfen: wieder auflösen (Transport und Backend, sonst „http“ und „unbekannt“)
    notify();
  }

  async function models(): Promise<ModelListResult> {
    const ep = await d.resolver.resolve();
    if (ep === null) return { models: [], reachable: false };
    if (ep.kind === "manager") {
      const table = (ep.models ?? []).map((m) => m.id);
      if (table.length > 0) return { models: table, reachable: true };
      // Ohne Modelltabelle (ein lokaler Endpunkt am Manager, etwa LM Studio) kennt der Manager die Liste: sonst stünde beim aktiven Endpunkt „keine Modelle gemeldet“.
      const id = activeEndpointId();
      return id === undefined ? { models: [], reachable: true } : modelsOf(id);
    }
    return d.listModels(ep.config);
  }

  async function setModel(model: string): Promise<void> {
    pending = model;
    try {
      const ep = await d.resolver.resolve();
      if (ep === null) return;
      if (ep.kind === "manager") {
        const { model: _old, ...rest } = d.settings.getChoice();
        // Ein Modellname gilt nur auf seinem Endpunkt (obsidian-kit 0.89.0, `applyModel`): die Wahl bindet den aktiven Endpunkt, wenn sie noch keinen trägt, und schreibt eine verwaiste Wahl
        // (abgeschaltet, gelöscht, ohne Schlüssel: die Auflösung ist auf „Automatisch“ gefallen) auf ihn um; sonst bliebe die tote Kennung stehen und die Wahl wirkte nie.
        const active = activeEndpointId();
        const bound = active !== undefined && (rest.endpointId === undefined || d.resolver.peekReason() !== undefined) ? { ...rest, endpointId: active } : rest;
        await d.settings.update({ choice: model !== "" ? { ...bound, model } : bound });
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
      notify();
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
      const reason = d.resolver.peekReason();
      return { ...(def !== undefined && def !== "" ? { defaultModel: def } : {}), ...(reason !== undefined ? { reason } : {}) };
    },
    endpoints,
    activeEndpointId,
    modelsOf,
    choice: () => d.settings.getChoice(),
    setChoice,
    subscribe: (cb) => { subscribers.add(cb); return () => { subscribers.delete(cb); }; },
    notify,
  };
}
