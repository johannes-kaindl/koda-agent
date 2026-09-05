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
  "reading-tool-off": "settings.warn.readingToolOff",
};

/** Der Warntext, fertig fuer die Zeile. `reading-tool-off` nennt die abgeschalteten
 *  Werkzeuge im Klartext — ohne sie waere die Warnung eine Suchaufgabe. Der Platzhalter
 *  steht im i18n-String, damit die Satzstellung uebersetzbar bleibt. */
function warnText(w: RuleWarning, toolsOff: string[]): string {
  return t(WARN_TEXT[w]).split("{{werkzeuge}}").join(toolsOff.join(", "));
}

/** Textarea + Zuruecksetzen + Warnzeile + Ansehen-Knopf. Der Auslieferungsstand steht als
 *  PLATZHALTER, nie als Wert: waere er der Wert, friere er beim ersten Oeffnen ein (Spec E2). */
export function renderPromptRow(setting: Setting, ctx: ModelControlCtx): void {
  const model = promptRow(ctx.settings, ctx.relatedAvailable);
  setting.setName(t("settings.prompt")).setDesc(t("settings.prompt.desc"));

  /** Zeichnet NUR die Warnzeilen neu, nicht den ganzen Tab. Zwei Gruende:
   *  - Ein `ctx.refresh()` baut den Tab neu auf (`display()`), und dieses Neuzeichnen
   *    liefe zwischen `mousedown` (das den blur ausloest) und `click` — der
   *    Zuruecksetzen-Knopf waere im Moment seines eigenen Klicks schon ersetzt und der
   *    Klick ginge verloren. Der Nutzer muesste zweimal druecken.
   *  - Die Warnungen haengen an genau zwei Dingen (dem wirksamen Text und den aktiven
   *    lesenden Werkzeugen); alles andere in der Zeile bleibt unberuehrt. */
  const zeichneWarnungen = (): void => {
    // `forEach` statt `for…of`: `NodeListOf` ist ohne die `dom.iterable`-Lib nicht iterierbar,
    // und die Schleifenvariable waere `any` (dieselbe Form wie im Kit-Endpunkt-Editor).
    setting.settingEl.querySelectorAll<HTMLElement>(".koda-warn").forEach((alt) => { alt.remove(); });
    const jetzt = promptRow(ctx.settings, ctx.relatedAvailable);
    for (const w of jetzt.warnings) {
      // §8 Status-Indikator: Form UND Farbe UND State-Klasse UND aria-label — Farbe nie allein.
      const text = warnText(w, jetzt.readingToolsOff);
      const el = setting.settingEl.createDiv({ cls: "koda-warn is-warning" });
      setIcon(el.createSpan({ cls: "koda-warn-icon" }), "alert-triangle");
      el.createSpan({ text });
      el.setAttribute("aria-label", text);
    }
  };

  setting
    .addTextArea((ta) => {
      ta.setPlaceholder(model.placeholder).setValue(model.value);
      ta.inputEl.rows = 8;
      ta.inputEl.addClass("koda-prompt-textarea");
      // ZWEI Ereignisse fuer zwei verschiedene Dinge — bitte nicht wieder zusammenlegen.
      // Sie standen kurzzeitig beide auf `blur`; das kostete getippten Text, weil im
      // echten Chromium kein `blur` feuert, wenn das Einstellungsfenster per Escape
      // schliesst, waehrend die Textarea den Fokus haelt (Review-Befund Fix-Runde 4).
      //  - SPEICHERN bei `onChange`: kein Datenverlust. Zwischenstaende in der data.json
      //    sind der billigere Preis als ein verschluckter Absatz — der Wert ist ohnehin
      //    erst beim naechsten Gespraech wirksam, ein halb getippter Prompt richtet also
      //    keinen Schaden an.
      //  - ZEICHNEN bei `blur`: die zwei Warnungen, die am getippten Text haengen
      //    (`no-tools`, `missing-placeholder`), muessen sichtbar werden, sobald die
      //    Abweichung entsteht — sie sind die einzige Absicherung dieses Entwurfs
      //    („warnen statt verbieten", Spec E3/E5). Bei jedem Tastendruck zu zeichnen geht
      //    nicht: das Neuzeichnen zerstoert den Cursor. Der Grund fuer `blur` war also
      //    immer das Re-Render, nie das Speichern.
      ta.onChange((v) => {
        ctx.settings.systemPromptOverride = v;
        void ctx.save();
      });
      ta.inputEl.addEventListener("blur", () => { zeichneWarnungen(); });
    })
    .addExtraButton((b) =>
      b.setIcon("rotate-ccw").setTooltip(t("settings.prompt.reset")).onClick(() => {
        ctx.settings.systemPromptOverride = "";
        void ctx.save().then(() => ctx.refresh());
      }),
    )
    .addButton((b) => b.setButtonText(t("settings.prompt.show")).onClick(() => ctx.openPreview()));

  zeichneWarnungen();
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
