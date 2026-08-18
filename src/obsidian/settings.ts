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
// eine-Wahrheit-Walker"). Die Endpunkt-Liste selbst ist gegenueber vault-rag bewusst
// abgespeckt: kein Erreichbarkeits-Ping, keine Modell-Liste, kein Test-Button (MVP-
// Schnitt, siehe Task-Brief) — jede Zeilen-Aenderung committet synchron und rendert neu.

import {
  PluginSettingTab,
  Setting,
  setIcon,
  setTooltip,
  type App,
  type SettingDefinitionItem,
} from "obsidian";
import { t } from "../vendor/kit/i18n";
import { renderSettingDefinitions, settingBodyHost, refreshSettingsTab } from "../vendor/kit-obsidian/settings_walker";
import { applyEndpointEdit, moveEndpointToFront, type EndpointConfig } from "../vendor/kit/endpoint_config";
import { ENDPOINT_PRESETS } from "../vendor/kit/endpoint_diagnostics";
import type { EndpointStatus } from "../vendor/kit/endpoint_diagnostics";
import { endpointStatusView } from "../core/llm/endpoint-status-view";
import { resolveModelChoice, type ModelOption } from "../core/llm/model-choice";
import {
  DEFAULT_SETTINGS,
  mergeKodaSettings,
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
        desc: t("settings.suppress.desc"),
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
    // Immer durch mergeKodaSettings: das ist die einzige Stelle, die Muellwerte
    // abfaengt (z.B. maxRounds ausserhalb 1..MAX_ROUNDS_LIMIT). Der deklarative
    // Host validiert nur den Typ, nicht unsere Grenzen.
    this.plugin.settings = mergeKodaSettings({ ...this.plugin.settings, [key]: value });
    await this.plugin.saveSettings();
  }

  // ── Rendering (deklarativ ab 1.13, gleiche Struktur im <1.13-Fallback) ───
  private cleanupPrevious: () => void = () => {};

  display(): void {
    this.cleanupPrevious();
    this.containerEl.empty();
    this.cleanupPrevious = renderSettingDefinitions(this.containerEl, this.getSettingDefinitions(), this, this.app);
  }

  /** Re-Render des Tabs nach einer Endpunkt-Mutation. */
  private refreshUi(): void {
    refreshSettingsTab(this, () => this.display());
  }

  // ── Endpunkt-Liste (render-Hatch) ────────────────────────────────────────

  /** render-Hatch: eine `Setting`-Zeile pro Endpunkt (URL · API-Schluessel · Modell-
   *  Override · "nach oben" · Entfernen) plus eine Adder-Zeile darunter. Jede Aenderung
   *  laeuft durch Kit-`applyEndpointEdit`, dann `mergeKodaSettings` + `saveSettings`,
   *  dann kompletter Re-Render (kein Probing/Reconnect wie in vault-rag — hier gibt es
   *  nichts Asynchrones, das den Rebuild rechtfertigen wuerde, den Nutzer aber mitten im
   *  Tippen zu unterbrechen). Committet deshalb bei `blur`, nicht bei jedem Tastendruck —
   *  sonst haengte das Adder-Feld jeden Zwischenstand (h, ht, htt, …) als eigenen Eintrag an. */
  private renderEndpointList(setting: Setting): void {
    const host = settingBodyHost(setting);
    new Setting(host).setName(t("settings.endpoints")).setDesc(t("settings.endpoints.desc"));

    const commit = (index: number, field: "url" | "apiKey" | "model", value: string, isAdder: boolean): void => {
      const next = applyEndpointEdit(this.plugin.settings.endpoints, index, field, value, isAdder);
      this.plugin.settings = mergeKodaSettings({ ...this.plugin.settings, endpoints: next });
      void this.plugin.saveSettings();
      this.refreshUi();
    };

    const eps = this.plugin.settings.endpoints;
    const rows: EndpointConfig[] = [...eps, { url: "" }]; // leeres Adder-Feld am Ende

    rows.forEach((cfg, i) => {
      const isAdder = i >= eps.length;
      const row = new Setting(host);

      row.addText((tx) => {
        tx.setPlaceholder(isAdder ? t("settings.addEndpoint") : "http://127.0.0.1:1234").setValue(cfg.url);
        tx.inputEl.addEventListener("blur", () => commit(i, "url", tx.getValue(), isAdder));
      });

      // Schnellauswahl nur an der leeren Zeile am Ende: dort entsteht eine neue Adresse.
      // An bestehenden Zeilen waere ein Preset-Knopf ein Ueberschreib-Knopf.
      if (isAdder) {
        for (const preset of ENDPOINT_PRESETS) {
          row.addExtraButton((b) =>
            b
              .setIcon("plus-circle")
              .setTooltip(t("settings.endpoints.preset", preset.label))
              .onClick(() => commit(i, "url", preset.url, true)),
          );
        }
      }

      // Schluessel + Modell nur an bestehenden Zeilen — am leeren Adder gaebe es nichts zu tragen.
      if (!isAdder) {
        row.addText((tx) => {
          tx.setPlaceholder(t("settings.endpoints.apiKeyPlaceholder")).setValue(cfg.apiKey ?? "");
          tx.inputEl.type = "password"; // maskiert gegen Schultergucken/Screenshots
          tx.inputEl.setAttribute("autocomplete", "off");
          tx.inputEl.addEventListener("blur", () => commit(i, "apiKey", tx.getValue(), false));
        });
        row.addText((tx) => {
          tx.setPlaceholder(t("settings.endpoints.modelPlaceholder")).setValue(cfg.model ?? "");
          tx.inputEl.addEventListener("blur", () => commit(i, "model", tx.getValue(), false));
        });

        // "Nach oben": die Listenreihenfolge IST die Prioritaet (der erste erreichbare
        // Endpunkt gewinnt). An Platz 1 nicht gezeichnet statt deaktiviert — ein
        // disabled-Element traegt seinen Tooltip in Electron unsichtbar.
        if (i > 0) {
          row.addExtraButton((b) =>
            b
              .setIcon("arrow-up-to-line")
              .setTooltip(t("settings.endpoints.moveToFront"))
              .onClick(() => {
                this.plugin.settings = mergeKodaSettings({
                  ...this.plugin.settings,
                  endpoints: moveEndpointToFront(this.plugin.settings.endpoints, i),
                });
                void this.plugin.saveSettings();
                this.refreshUi();
              }),
          );
        }

        row.addExtraButton((b) =>
          b
            .setIcon("trash-2")
            .setTooltip(t("settings.remove"))
            .onClick(() => commit(i, "url", "", false)),
        );

        // Der Status wird direkt in sein eigenes Element geschrieben statt ueber einen
        // Neuaufbau des Tabs: ein Redraw waehrend des Tippens nimmt den Fokus aus dem Feld.
        // Er ueberlebt bewusst keinen Redraw — ein alter Status neben einer inzwischen
        // geaenderten URL waere eine Behauptung ueber etwas Ungetestetes.
        //
        // Der Punkt sitzt in der Steuerspalte (`controlEl`) und ist ein Icon mit Tooltip,
        // NICHT Text im `descEl`: die Beschreibungsspalte gehoert seit dem eigenen
        // Settings-Fenster (Obsidian 1.13) dem Host. Ein `setText` darauf hat den Renderer
        // beim Klick auf „Testen" in eine Endlosschleife geschickt (2026-08-06, 100 % CPU,
        // beide Fenster tot). Form uebernommen aus `vault-rag/src/settings.ts`.
        const statusEl = row.controlEl.createSpan({ cls: "koda-endpoint-status" });
        /** Setzt den Status als Icon + Tooltip. `null` = Pruefung laeuft. `ctx` haengt das
         *  gemeldete Kontextfenster an den Tooltip an, wenn vorhanden. */
        const showStatus = (s: EndpointStatus | null, ctx: number | null = null): void => {
          const view = endpointStatusView(s, ctx);
          statusEl.empty();
          setIcon(statusEl, view.icon);
          statusEl.toggleClass("is-ok", view.ok === true);
          statusEl.toggleClass("is-bad", view.ok === false);
          setTooltip(statusEl, view.tooltip);
        };
        row.addButton((b) =>
          b
            .setButtonText(t("settings.probe"))
            .setTooltip(t("settings.probe.tooltip"))
            .onClick(() => {
              const current = this.plugin.settings.endpoints[i];
              if (current === undefined) return;
              // `b.buttonEl.disabled` statt `b.setDisabled()`: die Component-Methode hat den
              // Renderer in Obsidian 1.13.5 in eine Endlosschleife geschickt (100 % CPU, beide
              // Fenster tot). Gemessen am 2026-08-06 durch Ausschluss — derselbe Ablauf mit
              // direktem DOM-Zugriff laeuft sauber, mit `setDisabled()` friert er ein.
              b.buttonEl.disabled = true;
              showStatus(null);
              void this.plugin
                .probe(current)
                .then(async (status) => {
                  if (!status.reachable) {
                    showStatus(status);
                    return;
                  }
                  // Erreichbar: zusaetzlich das Fenster erfragen. BERICHTET wird immer;
                  // GESCHRIEBEN nur, wenn das Feld noch auf dem Default steht — wer bewusst
                  // kleiner eingestellt hat, wird nicht ueberschrieben (Regel ohne Flag).
                  const ctx = await this.plugin.probeContext(current);
                  showStatus(status, ctx);
                  if (ctx !== null && this.plugin.settings.contextWindowTokens === DEFAULT_SETTINGS.contextWindowTokens) {
                    await this.setControlValue("contextWindowTokens", ctx);
                    this.refreshUi();
                  }
                })
                .finally(() => {
                  b.buttonEl.disabled = false;
                });
            }),
        );
      }
    });
  }

  // ── Modellauswahl ─────────────────────────────────────────────────────────
  //
  // Drei Zustaende, weil der Endpunkt drei Antworten geben kann: eine Liste (Auswahl),
  // keine Liste trotz Erreichbarkeit (Freitext — manche gehosteten Anbieter sperren
  // /v1/models) und Schweigen (gesperrt, gespeicherter Name bleibt stehen). Ein vierter
  // Zustand liegt davor: noch nie abgerufen. Der zeigt bewusst ein Textfeld statt einer
  // leeren Auswahl — sonst waere das Feld nach frischer Installation unbedienbar, bis
  // jemand einen Knopf findet.

  private modelCache: { url: string; models: string[]; reachable: boolean } | null = null;
  /** Gegen verspaetete Antworten: ein zweiter Abruf entwertet den ersten. */
  private modelGeneration = 0;

  private renderModelPicker(setting: Setting): void {
    const host = settingBodyHost(setting);
    const row = new Setting(host).setName(t("settings.model")).setDesc(t("settings.model.desc"));
    const hintEl = row.descEl.createDiv({ cls: "koda-model-hint" });

    const ep = this.plugin.settings.endpoints[0];
    const url = ep?.url ?? "";
    const cache = this.modelCache !== null && this.modelCache.url === url ? this.modelCache : null;

    const save = (value: string): void => {
      this.plugin.settings = mergeKodaSettings({ ...this.plugin.settings, model: value });
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
          b.setDisabled(true).setButtonText(t("settings.model.fetching"));
          void this.plugin
            .probeModels(ep)
            .then(({ status, models }) => {
              if (gen !== this.modelGeneration) return; // ein neuerer Abruf gilt
              this.modelCache = { url, models, reachable: status.reachable };
              this.refreshUi();
            })
            .catch(() => {
              if (gen !== this.modelGeneration) return;
              this.modelCache = { url, models: [], reachable: false };
              this.refreshUi();
            });
        }),
    );
  }
}

/** Kit-Status → Oberflaechentext. Bewusst ueber `kind` statt ueber das mitgelieferte
 *  `klartext`-Feld: das Kit formuliert nur auf Deutsch, Koda spricht beide Sprachen.
 *  Nur `unknown` traegt eine rohe Serverzeile, die durchgereicht wird. */
