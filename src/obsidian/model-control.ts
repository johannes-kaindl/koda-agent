import { Setting, setIcon } from "obsidian";
import { t } from "../vendor/kit/i18n";
import { type RuleWarning } from "../core/prompt/rules";
import { promptRow } from "../core/prompt/view-model";
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
