import { Setting, setIcon } from "obsidian";
import { t } from "../vendor/kit/i18n";
import { type RuleWarning } from "../core/prompt/rules";
import { promptRow, toolRows } from "../core/prompt/view-model";
import type { KodaSettings } from "../core/settings-types";

export interface ModelControlCtx {
  settings: KodaSettings;
  save(): Promise<void>;
  refresh(): void;
  relatedAvailable: boolean;
  openPreview(): void;
}

const WARN_TEXT: Record<RuleWarning, string> = {
  "no-tools": "settings.warn.noTools",
  "missing-placeholder": "settings.warn.missingPlaceholder",
  "no-reading-tool": "settings.warn.noReadingTool",
};

/** Textarea + Zuruecksetzen + Warnzeile + Ansehen-Knopf. Der Auslieferungsstand steht als
 *  PLATZHALTER, nie als Wert: waere er der Wert, friere er beim ersten Oeffnen ein (Spec E2). */
export function renderPromptRow(setting: Setting, ctx: ModelControlCtx): void {
  const model = promptRow(ctx.settings, ctx.relatedAvailable);
  setting.setName(t("settings.prompt")).setDesc(t("settings.prompt.desc"));
  setting
    .addTextArea((ta) => {
      ta.setPlaceholder(model.placeholder).setValue(model.value);
      ta.inputEl.rows = 8;
      ta.inputEl.addClass("koda-prompt-textarea");
      ta.onChange((v) => {
        ctx.settings.systemPromptOverride = v;
        void ctx.save();
      });
    })
    .addExtraButton((b) =>
      b.setIcon("rotate-ccw").setTooltip(t("settings.prompt.reset")).onClick(() => {
        ctx.settings.systemPromptOverride = "";
        void ctx.save().then(() => ctx.refresh());
      }),
    )
    .addButton((b) => b.setButtonText(t("settings.prompt.show")).onClick(() => ctx.openPreview()));

  for (const w of model.warnings) {
    // §8 Status-Indikator: Form UND Farbe UND State-Klasse UND aria-label — Farbe nie allein.
    const el = setting.settingEl.createDiv({ cls: "koda-warn is-warning" });
    setIcon(el.createSpan({ cls: "koda-warn-icon" }), "alert-triangle");
    el.createSpan({ text: t(WARN_TEXT[w]) });
    el.setAttribute("aria-label", t(WARN_TEXT[w]));
  }
}

/** Eine Zeile je Werkzeug: Name, eigene Beschreibung, Schalter. Die volle Liste — auch
 *  related_notes ohne vault-rag, dann ausgegraut. Ein Werkzeug, das spurlos verschwindet,
 *  schickt den Nutzer auf die Suche nach einem Schalter, den es nie gab (Spec E3). */
export function renderToolList(setting: Setting, ctx: ModelControlCtx): void {
  setting.setName(t("settings.tools")).setDesc(t("settings.tools.desc"));
  const host = setting.settingEl.createDiv({ cls: "koda-tool-list" });
  for (const row_ of toolRows(ctx.settings, ctx.relatedAvailable)) {
    const row = host.createDiv({ cls: "koda-tool-row" });
    // `setAttribute` statt `dataset`: der Fake-DOM des Mocks kennt Attribute, kein dataset.
    row.setAttribute("data-tool", row_.name);
    if (row_.unavailable) row.addClass("is-unavailable");

    const kopf = row.createDiv({ cls: "koda-tool-head" });
    kopf.createSpan({ cls: "koda-tool-name", text: row_.name });
    if (row_.unavailable) kopf.createSpan({ cls: "koda-tool-hint", text: t("settings.tools.needsRag") });

    const zeile = new Setting(row);
    zeile.setClass("koda-tool-controls");
    zeile.addTextArea((ta) => {
      ta.setPlaceholder(row_.placeholder).setValue(row_.own);
      ta.inputEl.rows = 2;
      // Uebernahme bei blur, nicht bei onChange — sonst landet jeder Zwischenstand in der
      // data.json (dieselbe Regel wie beim Endpunkt-Zeilen-Editor, UI-STANDARD §8).
      ta.inputEl.addEventListener("blur", () => {
        const v = ta.getValue().trim();
        if (v === "") delete ctx.settings.toolDescriptions[row_.name];
        else ctx.settings.toolDescriptions[row_.name] = v;
        void ctx.save();
      });
    });
    zeile.addToggle((tg) =>
      tg.setValue(row_.enabled).onChange((an) => {
        const ohne = ctx.settings.toolsDisabled.filter((n) => n !== row_.name);
        ctx.settings.toolsDisabled = an ? ohne : [...ohne, row_.name];
        void ctx.save().then(() => ctx.refresh()); // die Warnzeile oben haengt daran
      }),
    );
    // Buchfuehrung, kein DOM-Effekt: die Zeilen-Komponenten haengen zusaetzlich an der
    // AEUSSEREN Setting-Instanz, damit ein Aufrufer (Test, ein spaeterer Sammel-Reset)
    // ueber `setting.components` alle Werkzeug-Zeilen in einem Zug sieht, statt je Zeile
    // eine eigene `Setting`-Referenz mitschleppen zu muessen.
    setting.components.push(...zeile.components);
  }
}
