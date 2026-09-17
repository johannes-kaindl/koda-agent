// Zweigleisige Settings — EINE Wahrheit fuer beide Renderpfade.
//
// Ab Obsidian 1.13 fragt der Host `getSettingDefinitions()` ab und ruft `display()`
// nie; nur so erscheinen die Settings in der Settings-Suche. Kodas `minAppVersion`
// ist 1.8.7, dort gibt es die deklarative API nicht — der Host ruft `display()`.
//
// Deshalb ist `getSettingDefinitions()` die einzige Definition, und `display()`
// zeichnet DIESELBE Struktur mit der klassischen `Setting`-API nach. Kein zweiter
// Definitionsbaum, der auseinanderlaufen kann.
//
// Muster uebernommen aus `3d-codeblocks/src/obsidian/settings.ts` (minimale Form: reine
// Controls) + `vault-rag/src/settings.ts` (render-Hatch fuer die Endpunkt-Liste — dort
// das Erst-Exemplar der Hatch-Mechanik, REGISTRY „Zweigleisige deklarative Settings —
// eine-Wahrheit-Walker").
//
// Die Endpunkt-Liste selbst kommt seit 2026-08-28 aus dem Kit (`buildEndpointList`).
// Hier stand davor ein Eigenbau mit der Begruendung „gegenueber vault-rag bewusst
// abgespeckt: kein Erreichbarkeits-Ping, keine Modell-Liste, kein Test-Button (MVP-
// Schnitt)". Die Begruendung war zu diesem Zeitpunkt seit Wochen hinfaellig — alle drei
// Verzichte hatte die QoL-Schicht zurueckgenommen —, nur hatte sie das niemand nachgeprueft.
// Merksatz fuer den naechsten Sonderweg: eine Ausnahme verfaellt nicht mit ihrem Grund.
// Wer eine deklariert, nennt die Bedingung, unter der sie endet (UI-STANDARD §1a).

import {
  Notice,
  PluginSettingTab,
  Setting,
  type App,
  type SettingDefinitionItem,
} from "obsidian";
import { t, getLang } from "../vendor/kit/i18n";
import { modeLabel } from "../core/context/labels";
import { AVAILABLE_MODES } from "../core/context/types";
import { renderSettingDefinitions, settingBodyHost, refreshSettingsTab } from "../vendor/kit-obsidian/settings_walker";
import type { EndpointConfig } from "../vendor/kit/endpoint_config";
import { buildEndpointList, type EndpointListStrings } from "../vendor/kit-obsidian/endpoint-list";
import { createModelListCache, type ModelListCache, type ModelListClient } from "../vendor/kit/model-list-cache";
import { ENDPOINT_PRESETS } from "../vendor/kit/endpoint_diagnostics";
import type { EndpointStatus } from "../vendor/kit/endpoint_diagnostics";
import { endpointStatusView } from "../core/llm/endpoint-status-view";
import { resolveModelChoice, type ModelOption } from "../vendor/kit/model-choice";
import { renderPromptRow, renderToolList, type ModelControlCtx } from "./model-control";
import { PromptPreviewModal } from "./prompt-modal";
import { readRetrievalApi } from "./retrieval";
import {
  DEFAULT_SETTINGS,
  validateKodaSettings,
  MAX_ROUNDS_LIMIT,
  TIMEOUT_SEC_MIN,
  TIMEOUT_SEC_MAX,
  TIMEOUT_SEC_STEP,
  SKILL_BUDGET_MIN,
  SKILL_BUDGET_MAX,
  SKILL_BUDGET_STEP,
  LIST_ROWS_MIN,
  LIST_ROWS_MAX,
  LIST_ROWS_STEP,
  COMPACT_AT_MIN,
  COMPACT_AT_MAX,
  COMPACT_AT_STEP,
  KEEP_TOOLS_MIN,
  KEEP_TOOLS_MAX,
  SUMMARY_PCT_MIN,
  SUMMARY_PCT_MAX,
  CONTEXT_SELECTION_MIN,
  CONTEXT_SELECTION_MAX,
  CONTEXT_SELECTION_STEP,
  CONTEXT_TABS_MIN,
  CONTEXT_TABS_MAX,
  CONTEXT_FRONTMATTER_MIN,
  CONTEXT_FRONTMATTER_MAX,
  CONTEXT_FRONTMATTER_STEP,
  CONTEXT_BUDGET_MIN,
  CONTEXT_BUDGET_MAX,
  CONTEXT_BUDGET_STEP,
  CONTEXT_LINK_DEPTH_MIN,
  CONTEXT_LINK_DEPTH_MAX,
  type KodaSettings,
} from "../core/settings-types";
import type KodaPlugin from "../main";

export class KodaSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: KodaPlugin,
  ) {
    super(app, plugin);
  }

  // ── Die eine Wahrheit ────────────────────────────────────────────────────
  // Der Generic-Parameter bindet jeden `key` an ein echtes Settings-Feld: ein
  // Tippfehler bricht den Build, statt zur Laufzeit stumm ins Leere zu greifen
  // (der Host liest den Wert nur ueber getControlValue). Die Endpunkt-Liste hat
  // keinen Skalar-`key` (sie ist ein Array komplexer Objekte) und ist deshalb ein
  // `render`-Hatch statt eines `control` — die einzige Stelle in dieser Datei, die
  // die klassische Setting-API direkt aufruft statt vom deklarativen Host bedient
  // zu werden.
  getSettingDefinitions(): SettingDefinitionItem<keyof KodaSettings>[] {
    return [
      {
        name: t("settings.endpoints"),
        desc: t("settings.endpoints.desc"),
        render: (setting) => this.renderEndpointList(setting),
      },
      {
        // Hatch statt `control: text`: die Auswahl haengt davon ab, was der Endpunkt
        // gerade hergibt — das kann eine synchrone Definition nicht wissen.
        name: t("settings.model"),
        desc: t("settings.model.desc"),
        render: (setting) => this.renderModelPicker(setting),
      },
      {
        name: t("settings.suppress"),
        // "Chat" ist Loanword-Stil (Kit-Vorlage: "{feature}-Call" statt "{feature}-Aufruf")
        // und bleibt in beiden Sprachen gleich — kein getLang()-Branch noetig.
        desc: t("settings.suppress.desc", "Chat"),
        control: { type: "toggle", key: "suppressThinking" },
      },
      {
        name: t("settings.folder"),
        desc: t("settings.folder.desc"),
        control: { type: "folder", key: "kodaFolder" },
      },
      {
        name: t("settings.rounds"),
        desc: t("settings.rounds.desc"),
        control: { type: "slider", key: "maxRounds", min: 1, max: MAX_ROUNDS_LIMIT, step: 1 },
      },
      {
        name: t("settings.timeout"),
        desc: t("settings.timeout.desc"),
        control: {
          type: "slider",
          key: "timeoutSec",
          min: TIMEOUT_SEC_MIN,
          max: TIMEOUT_SEC_MAX,
          step: TIMEOUT_SEC_STEP,
        },
      },
      {
        name: t("settings.skillBudget"),
        desc: t("settings.skillBudget.desc"),
        control: {
          type: "slider",
          key: "skillBudgetChars",
          min: SKILL_BUDGET_MIN,
          max: SKILL_BUDGET_MAX,
          step: SKILL_BUDGET_STEP,
        },
      },
      {
        name: t("settings.listRows"),
        desc: t("settings.listRows.desc"),
        control: {
          type: "slider",
          key: "listNotesMaxRows",
          min: LIST_ROWS_MIN,
          max: LIST_ROWS_MAX,
          step: LIST_ROWS_STEP,
        },
      },
      {
        // Eigene Gruppe: alles, was beobachtbares Verdichtungs-Verhalten steuert. Der
        // deklarative Host kennt keine aufklappbaren Gruppen — eine Ueberschrift ist, was
        // beide Renderpfade koennen.
        type: "group",
        heading: t("settings.compaction"),
        items: [
          {
            name: t("settings.contextWindow"),
            desc: t("settings.contextWindow.desc"),
            control: { type: "number", key: "contextWindowTokens" },
          },
          {
            name: t("settings.compactAt"),
            desc: t("settings.compactAt.desc"),
            control: { type: "slider", key: "compactAtPercent", min: COMPACT_AT_MIN, max: COMPACT_AT_MAX, step: COMPACT_AT_STEP },
          },
          {
            name: t("settings.keepTools"),
            desc: t("settings.keepTools.desc"),
            control: { type: "slider", key: "keepToolResults", min: KEEP_TOOLS_MIN, max: KEEP_TOOLS_MAX, step: 1 },
          },
          {
            name: t("settings.summarize"),
            desc: t("settings.summarize.desc"),
            control: { type: "toggle", key: "summarizeEnabled" },
          },
          {
            name: t("settings.summaryLen"),
            desc: t("settings.summaryLen.desc"),
            control: { type: "slider", key: "summaryPercent", min: SUMMARY_PCT_MIN, max: SUMMARY_PCT_MAX, step: 1 },
          },
        ],
      },
      {
        type: "group",
        heading: t("settings.context"),
        items: [
          {
            name: t("settings.contextMode"),
            desc: t("settings.contextMode.desc"),
            control: {
              type: "dropdown",
              key: "contextModeDefault",
              // Dieselben Labels wie das Dropdown im Chat — ein Wortlaut, zwei Bedienstellen.
              // AVAILABLE_MODES statt CONTEXT_MODES: angeboten wird nur, was auch gebaut ist
              // (Spec E6: „ein Eintrag, der nie geht, ist kein Versprechen"). Das Schema in
              // settings-types.ts akzeptiert weiterhin alle fuenf Modi — ein gespeicherter
              // Default aus einer spaeteren Etappe bleibt gueltig, siehe onload()-Guard.
              options: Object.fromEntries(AVAILABLE_MODES.map((m) => [m, modeLabel(m, getLang() === "de" ? "de" : "en")])),
            },
          },
          {
            name: t("settings.contextSelection"),
            desc: t("settings.contextSelection.desc"),
            control: { type: "slider", key: "contextSelectionChars", min: CONTEXT_SELECTION_MIN, max: CONTEXT_SELECTION_MAX, step: CONTEXT_SELECTION_STEP },
          },
          {
            name: t("settings.contextTabs"),
            desc: t("settings.contextTabs.desc"),
            control: { type: "slider", key: "contextTabsMax", min: CONTEXT_TABS_MIN, max: CONTEXT_TABS_MAX, step: 1 },
          },
          {
            name: t("settings.contextFrontmatter"),
            desc: t("settings.contextFrontmatter.desc"),
            control: { type: "slider", key: "contextFrontmatterChars", min: CONTEXT_FRONTMATTER_MIN, max: CONTEXT_FRONTMATTER_MAX, step: CONTEXT_FRONTMATTER_STEP },
          },
          {
            name: t("settings.contextBudget"),
            desc: t("settings.contextBudget.desc"),
            control: { type: "slider", key: "contextBudgetChars", min: CONTEXT_BUDGET_MIN, max: CONTEXT_BUDGET_MAX, step: CONTEXT_BUDGET_STEP },
          },
          {
            name: t("settings.contextLinkDepth"),
            desc: t("settings.contextLinkDepth.desc"),
            control: { type: "slider", key: "contextLinkDepth", min: CONTEXT_LINK_DEPTH_MIN, max: CONTEXT_LINK_DEPTH_MAX, step: 1 },
          },
          {
            name: t("settings.contextKeep"),
            desc: t("settings.contextKeep.desc"),
            control: { type: "toggle", key: "contextKeepChoices" },
          },
        ],
      },
      {
        type: "group",
        heading: t("settings.modelControl"),
        items: [
          // `name` ist bei der nativen 1.13-API Pflicht (Suchindex) — `renderPromptRow`/
          // `renderToolList` setzen ihn intern noch einmal, das ist idempotent (wie bei
          // `renderModelPicker`).
          { name: t("settings.prompt"), render: (setting) => renderPromptRow(setting, this.modelCtx()) },
          // Block-Body statt Ausdrucks-Body: `renderToolList` gibt die Zeilen-Handles
          // zurueck (Fix-Runde 1), die Definition erwartet aber `void | (() => void)` —
          // der Aufrufer hier braucht sie nicht und darf den Rueckgabewert ignorieren.
          { name: t("settings.tools"), render: (setting) => { renderToolList(setting, this.modelCtx()); } },
        ],
      },
      {
        name: t("settings.fallback"),
        desc: t("settings.fallback.desc"),
        control: { type: "toggle", key: "textFallback" },
      },
      {
        name: t("settings.language"),
        control: {
          type: "dropdown",
          key: "language",
          // Sprachnamen bleiben nativ (kein t()) — Konvention fuer Sprachwahl-Dropdowns:
          // "Deutsch" heisst so, egal in welcher UI-Sprache man gerade steht.
          options: { auto: "Auto", de: "Deutsch", en: "English" },
        },
      },
      {
        name: t("settings.startup"),
        desc: t("settings.startup.desc"),
        control: { type: "toggle", key: "openOnStartup" },
      },
    ];
  }

  getControlValue(key: string): unknown {
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    // Immer durch validateKodaSettings: das ist die einzige Stelle, die Muellwerte
    // abfaengt (z.B. maxRounds ausserhalb 1..MAX_ROUNDS_LIMIT). Der deklarative
    // Host validiert nur den Typ, nicht unsere Grenzen.
    // Der zweite Einsatz als SCHREIBpfad ist kein Nebengebrauch: das Kit-Modul
    // dahinter (vendor/kit/settings_schema.ts) ist ausdruecklich idempotent und
    // genau dafuer gebaut — validateSettings(D, { ...settings, [key]: value }).
    this.plugin.settings = validateKodaSettings({ ...this.plugin.settings, [key]: value });
    await this.plugin.saveSettings();
  }

  // ── Rendering (deklarativ ab 1.13, gleiche Struktur im <1.13-Fallback) ───
  private cleanupPrevious: () => void = () => {};

  display(): void {
    this.cleanupPrevious();
    this.containerEl.empty();
    this.cleanupPrevious = renderSettingDefinitions(this.containerEl, this.getSettingDefinitions(), this, this.app);
  }

  /** Kit-Vertrag von `ModelListCache`: der Cache haelt Promises und ueberlebt jeden
   *  Tab-Neuaufbau bewusst — verworfen wird er erst, wenn der Tab wirklich zugeht.
   *  Ohne diesen Aufruf bliebe ein einmal als „nicht erreichbar" gemessener Endpunkt
   *  fuer die restliche Sitzung so stehen: wer seinen LLM-Server erst danach startet
   *  und die Einstellungen erneut oeffnet, saehe dauerhaft den alten Zustand.
   *  NICHT aus `refreshUi()` heraus aufrufen — das ist ein Neuaufbau, kein Schliessen. */
  hide(): void {
    this.modelCache.clear();
    this.globalModelCache = null;
    super.hide();
  }

  /** Re-Render des Tabs nach einer Endpunkt-Mutation. */
  private refreshUi(): void {
    refreshSettingsTab(this, () => this.display());
  }

  /** Kontext fuer die Modell-Steuerung (`renderPromptRow`/`renderToolList`). Eine
   *  Hilfsmethode statt eines Feldes: `relatedAvailable` haengt an `readRetrievalApi`,
   *  das bei JEDEM Aufruf frisch prueft, weil vault-rag zur Laufzeit an- und ausgehen
   *  kann — ein einmal gebauter Kontext wuerde das nicht mehr sehen. */
  private modelCtx(): ModelControlCtx {
    return {
      settings: this.plugin.settings,
      save: () => this.plugin.saveSettings(),
      refresh: () => this.refreshUi(),
      relatedAvailable: readRetrievalApi(this.app)?.status().indexed === true,
      openPreview: () => { new PromptPreviewModal(this.app, this.plugin).open(); },
    };
  }

  // ── Endpunkt-Liste (render-Hatch auf den Kit-Baustein) ───────────────────

  /** render-Hatch: delegiert an `buildEndpointList` (obsidian-kit@0.27.0). Bis 0.7.1 stand
   *  hier ein Eigenbau — begruendet als „gegenueber vault-rag bewusst abgespeckt: kein
   *  Erreichbarkeits-Ping, keine Modell-Liste, kein Test-Knopf (MVP-Schnitt)". Alle drei
   *  Verzichte waren laengst zurueckgenommen (QoL-Schicht), die Begruendung galt also nicht
   *  mehr, waehrend der Eigenbau stehenblieb. Gemessen am 2026-08-28: das Kit-Modul entstand
   *  am 08.08., Kodas Fassung am 05.08. — es war kein Design-Entscheid, sondern die aeltere
   *  Linie, die niemand nachgezogen hat (UI-STANDARD §8 fuehrt den Baustein als verbindlich).
   *
   *  Zwei Kodas-Gotchas sind in der Zentrale bereits richtig geloest und deshalb kein Grund
   *  fuer einen Sonderweg: der Status sitzt in `controlEl` statt als `setText` im `descEl`,
   *  und Knoepfe schalten ueber `buttonEl.disabled` statt `setDisabled()` (beides
   *  Renderer-Endlosschleifen, 2026-08-06, `_docs/docs/obsidian-api-gotchas.md`). */
  private renderEndpointList(setting: Setting): void {
    const host = settingBodyHost(setting);

    buildEndpointList({
      containerEl: host,
      label: t("settings.endpoints"),
      desc: t("settings.endpoints.desc"),
      placeholder: t("settings.addEndpoint"),
      strings: this.endpointStrings(),
      cache: this.modelCache,
      get: () => this.plugin.settings.endpoints,
      set: (eps) => {
        this.plugin.settings = validateKodaSettings({ ...this.plugin.settings, endpoints: eps });
      },
      active: () => this.plugin.settings.endpoints[0]?.url ?? null,
      clientFor: (cfg) => this.endpointClient(cfg),
      globalModel: () => this.plugin.settings.model,
      save: () => this.plugin.saveSettings(),
      // Koda haelt keine stehende Verbindung — es gibt nichts wiederherzustellen. Der
      // Kit-Vertrag verlangt den Callback trotzdem, weil andere Consumer (vault-rag) beim
      // Endpunktwechsel ihren Index neu anbinden muessen.
      reconnect: () => Promise.resolve(),
      rerender: () => { this.refreshUi(); },
      presets: ENDPOINT_PRESETS,
    });
  }

  /** Client GENAU dieser Zeile. `probe()` traegt zusaetzlich Kodas Kontextfenster-Uebernahme:
   *  meldet der Server ein Fenster und steht das Feld noch auf dem Default, wird es
   *  eingetragen (Regel ohne Flag — wer bewusst kleiner eingestellt hat, wird nicht
   *  ueberschrieben). Das haengt hier und nicht im Kit, weil es Kodas Compaction betrifft
   *  und kein Endpunkt-Thema ist: der Kit-Baustein weiss nichts von Verdichtung. */
  private endpointClient(cfg: EndpointConfig): { probe(): Promise<EndpointStatus> } & ModelListClient {
    return {
      probe: async (): Promise<EndpointStatus> => {
        const status = await this.plugin.probe(cfg);
        if (!status.reachable) return status;
        const ctx = await this.plugin.probeContext(cfg);
        if (ctx !== null && this.plugin.settings.contextWindowTokens === DEFAULT_SETTINGS.contextWindowTokens) {
          await this.setControlValue("contextWindowTokens", ctx);
          // Die Notice ueberlebt einen Redraw, das eben gesetzte Status-Icon nicht — sie ist
          // deshalb die einzige Meldung, auf die hier Verlass ist.
          new Notice(t("settings.probe.contextApplied", ctx));
          // BEWUSST kein `refreshUi()`. Bis 0.7.1 stand hier einer, weil der Eigenbau nur
          // auf Klick prüfte und sonst nie neu zeichnete. Der Kit-Editor ruft `clientFor(cfg)`
          // dagegen fuer JEDE Zeile schon beim Zeichnen (Modell-Liste vorladen) — ein Redraw
          // aus dem Probe-Ergebnis heraus traefe damit den Aufbau, der ihn ausgeloest hat,
          // und zwar ungefragt beim blossen Oeffnen der Einstellungen. Ein Flag „gerade im
          // display()" hilft nicht: `probe()` ist asynchron und laeuft lange nach dem
          // Aufbau. Der Wert ist gespeichert, die Notice meldet ihn, das Zahlenfeld zieht
          // beim naechsten Aufbau nach.
        }
        return status;
      },
      listModels: async (): Promise<string[]> => (await this.plugin.probeModels(cfg)).models,
    };
  }

  /** Der Textbaustein-Satz fuer den Kit-Editor — das Kit formuliert nicht selbst.
   *  Wortlaut uebernommen aus `vault-crews/src/obsidian/settings.ts` (2026-08-28): derselbe
   *  Baustein soll in beiden Plugins dasselbe sagen. */
  private endpointStrings(): EndpointListStrings {
    return {
      addPlaceholder: t("settings.addEndpoint"),
      apiKeyPlaceholder: t("settings.endpoints.apiKeyPlaceholder"),
      modelPlaceholder: t("settings.endpoints.modelPlaceholder"),
      ariaUrl: t("settings.endpoints.aria.url"),
      ariaAdd: t("settings.endpoints.aria.add"),
      ariaApiKey: (url) => t("settings.endpoints.aria.apiKey", url),
      ariaModel: (url) => t("settings.endpoints.aria.model", url),
      emptyModelLabel: (globalModel) =>
        globalModel === "" ? t("settings.model.useGlobalUnset") : t("settings.model.useGlobal", globalModel),
      modelHint: (key) => (key === "" ? "" : t(`settings.model.hint.${key}`)),
      savedSuffix: t("settings.model.savedSuffix"),
      refreshModels: t("settings.model.fetch"),
      moveToFront: t("settings.endpoints.moveToFront"),
      remove: t("settings.remove"),
      // {content} ist NICHT sprachneutral (anders als {feature} oben): EN baeckt "your"
      // in die Vorlage ein ("with your {0}"), DE nicht — der deutsche Fuellwert traegt
      // Possessiv+Kasus deshalb selbst (Kit-Kopfkommentar explain-texts.ts).
      thirdParty: t("settings.endpoints.thirdParty", getLang() === "de" ? "deinen Nachrichten" : "messages"),
      probing: t("settings.probe.testing"),
      // Ueber `kind` statt ueber das Kit-Feld `klartext`: das Kit formuliert nur auf
      // Deutsch, Koda spricht beide Sprachen. `endpointStatusView` macht genau das.
      statusTooltip: (status) => endpointStatusView(status).tooltip,
      role: (role) =>
        role.kind === "active"
          ? t("settings.endpoints.role.active")
          : role.kind === "unreachable"
            ? t("settings.endpoints.role.unreachable")
            : role.kind === "skipped-model"
              ? t("settings.endpoints.role.modelMismatch")
              : t("settings.endpoints.role.standby", String(role.position)),
      warnings: (ws) => ws.map((w) => t(`settings.endpoints.warn.${w.rule}`)).join(" · "),
      presetTooltip: (preset) => t("settings.endpoints.preset", preset.label),
      presetLabel: (preset) => t("settings.endpoints.presetAdd", preset.label),
      checkConnection: t("settings.probe"),
      saveFailed: t("settings.endpoints.saveFailed"),
    };
  }

  // ── Modellauswahl ─────────────────────────────────────────────────────────
  //
  // Drei Zustaende, weil der Endpunkt drei Antworten geben kann: eine Liste (Auswahl),
  // keine Liste trotz Erreichbarkeit (Freitext — manche gehosteten Anbieter sperren
  // /v1/models) und Schweigen (gesperrt, gespeicherter Name bleibt stehen). Ein vierter
  // Zustand liegt davor: noch nie abgerufen. Der zeigt bewusst ein Textfeld statt einer
  // leeren Auswahl — sonst waere das Feld nach frischer Installation unbedienbar, bis
  // jemand einen Knopf findet.

  /** Modell-Listen je Endpunkt-Zeile. Gehoert der Lebensdauer des Tabs, nicht dem Render —
   *  deshalb Feld und nicht lokal. Wird in `hide()` verworfen (Kit-Vertrag: sonst bleibt ein
   *  einmal als nicht erreichbar gemessener Endpunkt die ganze Sitzung so stehen). */
  private modelCache: ModelListCache = createModelListCache();
  /** Zustand der GLOBALEN Modell-Zeile (Default fuer Zeilen ohne Override). */
  private globalModelCache: { url: string; models: string[]; reachable: boolean } | null = null;
  /** Gegen verspaetete Antworten: ein zweiter Abruf entwertet den ersten. */
  private modelGeneration = 0;

  private renderModelPicker(setting: Setting): void {
    const host = settingBodyHost(setting);
    const row = new Setting(host).setName(t("settings.model")).setDesc(t("settings.model.desc"));
    const hintEl = row.descEl.createDiv({ cls: "koda-model-hint" });

    const ep = this.plugin.settings.endpoints[0];
    const url = ep?.url ?? "";
    const cache = this.globalModelCache !== null && this.globalModelCache.url === url ? this.globalModelCache : null;

    const save = (value: string): void => {
      this.plugin.settings = validateKodaSettings({ ...this.plugin.settings, model: value });
      void this.plugin.saveSettings();
    };

    if (cache === null) {
      row.addText((tx) => {
        // Kein Platzhalter mit Beispiel-Modellnamen: der Store-Linter liest ihn als
        // UI-Text und verlangt Satzform. Die Beschreibung der Zeile sagt es ohnehin.
        tx.setValue(this.plugin.settings.model);
        tx.inputEl.addEventListener("blur", () => save(tx.getValue()));
      });
      hintEl.setText(t("settings.model.notLoaded"));
    } else {
      const choice = resolveModelChoice({
        reachable: cache.reachable,
        models: cache.models,
        current: this.plugin.settings.model,
      });
      const label = (o: ModelOption): string =>
        o.suffix === "saved" ? t("settings.model.saved", o.label) : o.label;

      if (choice.mode === "freetext") {
        row.addText((tx) => {
          tx.setValue(choice.value);
          tx.inputEl.addEventListener("blur", () => save(tx.getValue()));
        });
      } else {
        row.addDropdown((dd) => {
          for (const o of choice.options) dd.addOption(o.value, label(o));
          dd.setValue(choice.value);
          dd.onChange((v) => save(v));
          // "locked" heisst: der gespeicherte Name bleibt sichtbar, aber es gibt nichts
          // zu waehlen, solange der Endpunkt schweigt.
          if (choice.mode === "locked") dd.selectEl.disabled = true;
        });
      }
      if (choice.hintKey !== "") hintEl.setText(t(`settings.model.hint.${choice.hintKey}`));
    }

    row.addButton((b) =>
      b
        .setButtonText(t("settings.model.fetch"))
        .onClick(() => {
          if (ep === undefined) return;
          const gen = ++this.modelGeneration;
          // `buttonEl.disabled` statt `setDisabled()` — als EINE Form im Repo, nicht als Bugfix.
          // Der Renderer-Freeze vom 2026-08-06 war echt, aber die daraus abgeleitete Regel
          // („setDisabled() aus dem Settings-Fenster friert ein") ist am 2026-08-08 widerlegt
          // worden: derselbe Aufruf lief hier und in vault-rag folgenlos. Gemessen ist nur ein
          // engeres Muster — die Kombination mit `setIcon`/`setTooltip` auf einem Span
          // derselben Zeile. Diese Stelle hatte die Kombination nie. Der Wechsel ist also
          // Vereinheitlichung auf die konservativere Form, kein behobener Defekt.
          b.buttonEl.disabled = true;
          b.setButtonText(t("settings.model.fetching"));
          void this.plugin
            .probeModels(ep)
            .then(({ status, models }) => {
              if (gen !== this.modelGeneration) return; // ein neuerer Abruf gilt
              this.globalModelCache = { url, models, reachable: status.reachable };
              this.refreshUi();
            })
            .catch(() => {
              if (gen !== this.modelGeneration) return;
              this.globalModelCache = { url, models: [], reachable: false };
              this.refreshUi();
            });
        }),
    );
  }
}

/** Kit-Status → Oberflaechentext. Bewusst ueber `kind` statt ueber das mitgelieferte
 *  `klartext`-Feld: das Kit formuliert nur auf Deutsch, Koda spricht beide Sprachen.
 *  Nur `unknown` traegt eine rohe Serverzeile, die durchgereicht wird. */
