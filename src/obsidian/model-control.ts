import { Setting, setIcon, type TextAreaComponent, type ToggleComponent } from "obsidian";
import { t } from "../vendor/kit/i18n";
import { type RuleWarning } from "../core/prompt/rules";
import { promptRow, providerToolGroups, toolRows, type ToolRowModel } from "../core/prompt/view-model";
import { HOST_TOOL_NAMES } from "../core/tools/defs";
import type { ProviderOffer, ToolProviderRejection } from "../vendor/kit/tool-provider";
import type { KodaSettings } from "../core/settings-types";

export interface ModelControlCtx {
  settings: KodaSettings;
  save(): Promise<void>;
  refresh(): void;
  relatedAvailable: boolean;
  /** `read_image` ist moeglich (Vision wahrscheinlich oder OCR-Anbieter) / `generate_image`
   *  ist moeglich (Bildgenerierungs-Anbieter). Fehlt das Feld, gilt beides als verfuegbar. */
  imagesAvailable?: { read: boolean; generate: boolean };
  openPreview(): void;
  /** Werkzeuge anderer Plugins und die Gruende abgelehnter Anbieter. Fehlt das Feld, zeigt die
   *  Liste nur Kodas eigene Werkzeuge (Tests, Altaufrufer). */
  providers?: { offers: ProviderOffer[]; rejections: { id: string; rejection: ToolProviderRejection }[] };
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
  // Eigene Klasse fuer das Layout: die Textarea steht sonst neben dem Namen und bekommt vom
  // Flex-Container der Zeile nur ~18 px (gemessen auf dem nativen 1.13-Pfad, Smoke-Punkt 71).
  setting.setClass("koda-prompt-setting");

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
 *  read_image ohne Bildsicht, dann ausgegraut. Ein Werkzeug, das spurlos verschwindet,
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
  // Die Liste braucht die ganze Zeilenbreite: als drittes Flex-Kind neben Name und Beschreibung
  // wurde sie in die rechte Haelfte gequetscht (Screenshot Welle 22).
  setting.setClass("koda-tools-setting");
  // Idempotent: der native Settings-Pfad (>= 1.13) ruft `render` bei jedem partiellen `update()`
  // erneut auf dieselbe Zeile auf, ohne `settingEl` zu leeren — ohne das hier stuende die Liste
  // nach jedem Schalter ein weiteres Mal daneben (display() leert selbst, dort fiel es nie auf).
  for (const alt of Array.from(setting.settingEl.querySelectorAll(".koda-tool-list"))) alt.remove();
  const host = setting.settingEl.createDiv({ cls: "koda-tool-list" });
  const handles: ToolRowHandle[] = [];

  const zeile = (parent: HTMLElement, row_: ToolRowModel): void => {
    const row = parent.createDiv({ cls: "koda-tool-row" });
    // `setAttribute` statt `dataset`: der Fake-DOM des Mocks kennt Attribute, kein dataset.
    row.setAttribute("data-tool", row_.name);
    if (row_.unavailable) row.addClass("is-unavailable");

    const kopf = row.createDiv({ cls: "koda-tool-head" });
    kopf.createSpan({ cls: "koda-tool-name", text: row_.name });
    if (row_.unavailable) kopf.createSpan({
      cls: "koda-tool-hint",
      text: t(
        row_.needs === "image-read" ? "settings.tools.needsImageRead"
          : row_.needs === "image-gen" ? "settings.tools.needsImageGen"
            : "settings.tools.pluginMissing",
      ),
    });

    const controls = new Setting(row);
    controls.setClass("koda-tool-controls");
    let textarea: TextAreaComponent | undefined;
    controls.addTextArea((ta) => {
      textarea = ta;
      ta.setPlaceholder(row_.placeholder).setValue(row_.own);
      ta.inputEl.rows = 3;
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
    controls.addToggle((tg) => {
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
  };

  for (const row_ of toolRows(ctx.settings, ctx.imagesAvailable)) zeile(host, row_);

  // Werkzeuge anderer Plugins: eine Gruppe je Anbieter, dieselbe Zeile. Der Grund, aus dem ein
  // Anbieter NICHT montiert wird, steht daneben (sonst fehlt er still, Welle 22).
  const fremd = ctx.providers;
  if (fremd !== undefined) {
    const { groups, missing, collisions } = providerToolGroups(ctx.settings, fremd.offers, HOST_TOOL_NAMES);
    const gruppe = (titel: string, cls: string): HTMLElement => {
      const g = host.createDiv({ cls: `koda-tool-group ${cls}` });
      g.createDiv({ cls: "koda-tool-group-title", text: titel });
      return g;
    };
    for (const g of groups) {
      const el = gruppe(t("settings.tools.fromPlugin", g.id), "is-provider");
      for (const row_ of g.rows) zeile(el, row_);
    }
    for (const r of fremd.rejections) {
      const el = host.createDiv({ cls: "koda-tool-group koda-warn is-warning" });
      const text = t("settings.tools.rejected", r.id, rejectionText(r.rejection));
      setIcon(el.createSpan({ cls: "koda-warn-icon" }), "alert-triangle");
      el.createSpan({ text });
      el.setAttribute("aria-label", text);
    }
    for (const c of collisions) {
      const text = c.with === null
        ? t("settings.tools.collisionHost", c.id, c.name)
        : t("settings.tools.collisionPlugin", c.id, c.name, c.with);
      const el = host.createDiv({ cls: "koda-tool-group koda-warn is-warning" });
      setIcon(el.createSpan({ cls: "koda-warn-icon" }), "alert-triangle");
      el.createSpan({ text });
      el.setAttribute("aria-label", text);
    }
    if (missing.length > 0) {
      const el = gruppe(t("settings.tools.notLoaded"), "is-missing");
      for (const row_ of missing) zeile(el, row_);
    }
  }
  return handles;
}

/** Der Grund einer Ablehnung (`toolProviderRejection`) als Satz fuer die Einstellungen. */
export function rejectionText(r: ToolProviderRejection): string {
  switch (r.reason) {
    case "version": return t("settings.tools.rejectVersion", typeof r.found === "string" || typeof r.found === "number" ? String(r.found) : "—");
    case "missing-method": return t("settings.tools.rejectMethod", r.method);
    case "tools-threw": return t("settings.tools.rejectThrew");
    case "tools-not-array": return t("settings.tools.rejectNotArray");
    case "bad-definition": return t("settings.tools.rejectDef", r.index + 1, r.field);
    case "not-an-object": return t("settings.tools.rejectObject");
  }
}
