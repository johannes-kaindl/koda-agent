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
  type SettingControl,
  type SettingDefinitionItem,
} from "obsidian";
import { t } from "../vendor/kit/i18n";
import { FolderSuggest } from "../vendor/kit-obsidian/folder-suggest";
import { applyEndpointEdit, moveEndpointToFront, type EndpointConfig } from "../vendor/kit/endpoint_config";
import { ENDPOINT_PRESETS } from "../vendor/kit/endpoint_diagnostics";
import type { EndpointStatus } from "../vendor/kit/endpoint_diagnostics";
import { endpointStatusView } from "../core/llm/endpoint-status-view";
import { resolveModelChoice, type ModelOption } from "../core/llm/model-choice";
import {
  mergeKodaSettings,
  MAX_ROUNDS_LIMIT,
  TIMEOUT_SEC_MIN,
  TIMEOUT_SEC_MAX,
  TIMEOUT_SEC_STEP,
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
        // `text`, nicht `folder`: der native ≥1.13-Renderer bekommt nur das Textfeld,
        // ohne Ordner-Autocomplete. FolderSuggest haengt sich nur im display()-Fallback
        // dran (renderControl unten) — bewusst akzeptierter Trade-off, wie kuros
        // Collapsibles (siehe Task-14-Brief).
        control: { type: "text", key: "kodaFolder" },
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

  // ── Imperativer Fallback (Obsidian < 1.13) ───────────────────────────────
  display(): void {
    this.containerEl.empty();
    for (const item of this.getSettingDefinitions()) {
      this.renderDefinitionItem(this.containerEl, item);
    }
  }

  /** Re-Render des Tabs nach einer Endpunkt-Mutation. Ab 1.13 exponiert das
   *  deklarative Framework `update()`; auf dem <1.13-Fallback existiert die Methode
   *  nicht → `display()` erneut laufen. Der Cast nimmt `obsidianmd/no-unsupported-api`
   *  die Sicht auf die 1.13-only-Methode. */
  private refreshUi(): void {
    const self = this as unknown as { update?: () => void };
    if (typeof self.update === "function") self.update();
    else this.display();
  }

  private renderDefinitionItem(containerEl: HTMLElement, item: SettingDefinitionItem): void {
    if ((item as { type?: string }).type === "group" || (item as { type?: string }).type === "list") {
      const group = item as { heading?: string; items?: SettingDefinitionItem[] };
      if (group.heading) new Setting(containerEl).setName(group.heading).setHeading();
      for (const sub of group.items ?? []) this.renderDefinitionItem(containerEl, sub);
      return;
    }

    const def = item as {
      name?: string;
      desc?: string;
      control?: SettingControl;
      render?: (setting: Setting) => void | (() => void);
    };
    const setting = new Setting(containerEl);
    if (def.name) setting.setName(def.name);
    if (typeof def.desc === "string") setting.setDesc(def.desc);
    if (typeof def.render === "function") {
      def.render(setting);
      return;
    }
    if (def.control) this.renderControl(setting, def.control);
  }

  private renderControl(setting: Setting, control: SettingControl): void {
    const current = this.getControlValue(control.key);
    const save = (value: unknown): void => {
      void this.setControlValue(control.key, value);
    };

    switch (control.type) {
      case "toggle":
        setting.addToggle((toggle) => toggle.setValue(current as boolean).onChange(save));
        break;
      case "dropdown":
        setting.addDropdown((dropdown) => {
          for (const [key, label] of Object.entries(control.options)) dropdown.addOption(key, label);
          dropdown.setValue(String(current)).onChange(save);
        });
        break;
      case "slider":
        setting.addSlider((slider) =>
          // Der Wert wird seit neuerem Obsidian automatisch inline neben dem Slider gezeigt.
          slider
            .setLimits(control.min, control.max, control.step)
            .setValue(current as number)
            .onChange(save),
        );
        break;
      default:
        setting.addText((text) => {
          text.setValue(String(current)).onChange(save);
          // Nur im Fallback: der native ≥1.13-Renderer sieht diesen Zweig nie, weil er
          // getSettingDefinitions() direkt konsumiert statt renderControl() aufzurufen.
          if (control.key === "kodaFolder") new FolderSuggest(this.app, text.inputEl);
        });
        break;
    }
  }

  // ── Endpunkt-Liste (render-Hatch) ────────────────────────────────────────

  /** Zeichnet die Setting-Row zu einem neutralen Block-Container um: die Endpunkt-Liste
   *  zeichnet mehrere eigene `Setting`-Zeilen und darf nicht in die Zwei-Spalten-
   *  `.setting-item` der uebergebenen Zeile gequetscht werden. Achtung: leert settingEl —
   *  Name/Desc der Kopfzeile werden deshalb hier separat neu gesetzt. */
  private hostFor(setting: Setting): HTMLElement {
    setting.settingEl.empty();
    setting.settingEl.removeClass("setting-item");
    return setting.settingEl;
  }

  /** render-Hatch: eine `Setting`-Zeile pro Endpunkt (URL · API-Schluessel · Modell-
   *  Override · "nach oben" · Entfernen) plus eine Adder-Zeile darunter. Jede Aenderung
   *  laeuft durch Kit-`applyEndpointEdit`, dann `mergeKodaSettings` + `saveSettings`,
   *  dann kompletter Re-Render (kein Probing/Reconnect wie in vault-rag — hier gibt es
   *  nichts Asynchrones, das den Rebuild rechtfertigen wuerde, den Nutzer aber mitten im
   *  Tippen zu unterbrechen). Committet deshalb bei `blur`, nicht bei jedem Tastendruck —
   *  sonst haengte das Adder-Feld jeden Zwischenstand (h, ht, htt, …) als eigenen Eintrag an. */
  private renderEndpointList(setting: Setting): void {
    const host = this.hostFor(setting);
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
        /** Setzt den Status als Icon + Tooltip. `null` = Pruefung laeuft. */
        const showStatus = (s: EndpointStatus | null): void => {
          const view = endpointStatusView(s);
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
                .then(showStatus)
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
    const host = this.hostFor(setting);
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
