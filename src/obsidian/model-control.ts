import { Setting, setIcon, type TextAreaComponent, type ToggleComponent } from "obsidian";
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

/** Referenz auf die interaktiven Komponenten EINER Werkzeug-Zeile — ueber den Namen
 *  adressiert, nicht ueber einen Index (ein neues Werkzeug verschoebe sonst still jeden
 *  nachfolgenden Index). Der Rueckgabewert ist die einzige Quelle dafuer; `setting`
 *  bleibt unberuehrt (s.u.). */
export interface ToolRowHandle {
  name: string;
  toggle: ToggleComponent;
  textarea: TextAreaComponent;
}

/** Eine Zeile je Werkzeug: Name, eigene Beschreibung, Schalter. Die volle Liste — auch
 *  related_notes ohne vault-rag, dann ausgegraut. Ein Werkzeug, das spurlos verschwindet,
 *  schickt den Nutzer auf die Suche nach einem Schalter, den es nie gab (Spec E3).
 *
 *  Gibt die Zeilen-Handles zurueck, statt sie in `setting.components` zu schreiben:
 *  `Setting.components` ist eine oeffentliche Obsidian-API (seit 0.9.7), an der u.a.
 *  `Setting.setDisabled()` (seit 1.2.3) haengt — ein `push` fremder Komponenten dort
 *  waere eine geteilte Objektreferenz in einem API-Array mit Bulk-Semantik, deren
 *  Wirkung auf dem nativen >=1.13-Pfad von hier aus nicht einsehbar ist (Review-Befund
 *  Fix-Runde 1). Ein Aufrufer, der die Zeilen braucht, adressiert sie ueber `name`. */
export function renderToolList(setting: Setting, ctx: ModelControlCtx): ToolRowHandle[] {
  setting.setName(t("settings.tools")).setDesc(t("settings.tools.desc"));
  const host = setting.settingEl.createDiv({ cls: "koda-tool-list" });
  const handles: ToolRowHandle[] = [];
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
    let textarea: TextAreaComponent | undefined;
    zeile.addTextArea((ta) => {
      textarea = ta;
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
    let toggle: ToggleComponent | undefined;
    zeile.addToggle((tg) => {
      toggle = tg;
      tg.setValue(row_.enabled).onChange((an) => {
        const ohne = ctx.settings.toolsDisabled.filter((n) => n !== row_.name);
        ctx.settings.toolsDisabled = an ? ohne : [...ohne, row_.name];
        void ctx.save().then(() => ctx.refresh()); // die Warnzeile oben haengt daran
      });
    });
    // `addTextArea`/`addToggle` rufen ihr Callback synchron auf (echtes Obsidian wie Mock)
    // — an dieser Stelle sind beide Variablen also immer gesetzt.
    handles.push({ name: row_.name, textarea: textarea!, toggle: toggle! });
  }
  return handles;
}
