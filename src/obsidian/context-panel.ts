import { setIcon } from "obsidian";
import type { ContextMode, ContextSource } from "../core/context/types";
import type { PanelViewModel } from "../core/context/panel-vm";
import type { HubPanel } from "../vendor/kit-obsidian/hub";
import { collapsibleSection, type CollapsibleStorage } from "../vendor/kit-obsidian/collapsible";
import { isContextMode } from "../core/context/types";
import { fillModeSelect } from "./mode-select";
import { t } from "../vendor/kit/i18n";

/** Schmaler Host-Vertrag (UI-STANDARD §4): das Panel kennt weder Plugin noch Ports.
 *  Nur `viewModel()` hat einen Rückkanal — es liest Zustand, es ändert keinen. */
export interface ContextPanelHost {
  mode(): ContextMode;
  setMode(m: ContextMode): void;
  /** Ist vault-rag da? Bestimmt, ob der Modus Vault im Dropdown waehlbar ist. */
  vaultAvailable(): boolean;
  viewModel(): Promise<PanelViewModel>;
  toggle(source: ContextSource, path: string): void;
  remove(path: string): void;
  addActive(): void;
  addNote(): void;
  addFolder(): void;
  setDepth(n: number): void;
  setAutoK(n: number): void;
  reset(): void;
  openNote(path: string): void;
  sectionStorage(): CollapsibleStorage;
  lang(): "de" | "en";
}

export class ContextPanel implements HubPanel<"context"> {
  readonly id = "context" as const;
  readonly icon = "list-tree";
  get label(): string { return t("view.tab.context"); }

  private bodyEl: HTMLElement | null = null;
  private modeEl: HTMLSelectElement | null = null;
  private summaryEl: HTMLElement | null = null;
  private summaryIconEl: HTMLElement | null = null;

  /** uebernommen aus vault-rag/src/context_panel.ts:43-52, 2026-09-05 — Generationszaehler
   *  gegen Out-of-Order-Ergebnisse. Seit Etappe 2b liest das ViewModel Dateien; zwei rasch
   *  aufeinanderfolgende Klicks koennen sonst in umgekehrter Reihenfolge ankommen, und das
   *  aeltere Bild ueberschreibt das neuere. Kein Unit-Test sieht das, und der GUI-Smoke
   *  traefe es nur zufaellig — deshalb der Zaehler und nicht „wird schon passen". */
  private gen = 0;

  /** Befund 3 (Abschluss-Review 2026-09-05): `notifyFileOpen` geht an ALLE Panels, sichtbar
   *  oder nicht (Vendor-Hub, s.o.) — ohne diese Bremse baut jede Notiz-Navigation einen
   *  Volltext-Block samt N sequenziellen `cachedRead`s und einen DOM-Neubau, auch wenn der
   *  Chat-Tab vorn steht. `onFileOpen` haelt bei unsichtbarem Panel nur fest, dass neu
   *  gezeichnet werden muss; `onShow` holt das nach. Ein sichtbares Panel aktualisiert
   *  weiterhin sofort — sonst zeigt ein offener Kontext-Tab veraltete Chips. */
  private sichtbar = false;

  constructor(private readonly host: ContextPanelHost) {}

  mount(container: HTMLElement): void {
    const head = container.createDiv({ cls: "koda-ctx-head" });

    // Derselbe Modus wie im Chat — ein Zustand, zwei Bedienstellen (Spec § E6).
    this.modeEl = head.createEl("select", { cls: "dropdown koda-mode", attr: { "aria-label": t("context.dropdownAria") } });
    this.modeEl.addEventListener("change", () => {
      const v = this.modeEl?.value;
      if (isContextMode(v)) this.host.setMode(v);
    });

    // §8 Status-Indikator: Form UND Farbe UND Klasse UND aria-label.
    this.summaryEl = head.createDiv({ cls: "koda-ctx-summary" });
    this.summaryIconEl = this.summaryEl.createSpan({ cls: "koda-ctx-summary-icon" });
    this.summaryEl.createSpan({ cls: "koda-ctx-summary-label" });

    this.bodyEl = container.createDiv({ cls: "koda-ctx-body" });
    this.render();
  }

  onShow(): void {
    this.sichtbar = true;
    this.render();
  }

  onHide(): void { this.sichtbar = false; }

  onFileOpen(): void {
    // Unsichtbar: nichts tun — `onShow` zeichnet beim naechsten Tab-Wechsel ohnehin neu,
    // egal welche Datei zwischenzeitlich geoeffnet wurde. Das ist die eigentliche Bremse
    // aus Befund 3: kein `buildFullContext` und kein DOM-Neubau fuer ein Panel, das gerade
    // niemand sieht.
    if (this.sichtbar) this.render();
  }

  destroy(): void { this.bodyEl = null; this.modeEl = null; this.summaryEl = null; this.sichtbar = false; }

  /** DOM = reine Funktion des Zustands: der Body wird komplett neu gebaut. Das Panel hält
   *  keinen langlebigen internen State (kein Stream, kein Eingabefeld) — das ist genau das
   *  Auswahlkriterium für ViewModel-Re-Render statt Mount-once (UI-STANDARD §4).
   *  Seit Etappe 2b liest das ViewModel Dateien (async) — `render()` ist nur noch der
   *  Anstoss, `paint()` der eigentliche Rumpf hinter dem Generationszaehler. */
  render(): void {
    const gen = ++this.gen;
    void this.host.viewModel().then((vm) => {
      if (gen !== this.gen) return;
      this.paint(vm);
    }).catch((err: unknown) => {
      // Befund 5 (Review 2026-09-05): eine unbehandelte Ablehnung liesse das Panel still
      // veraltet stehen — sichtbar wird das nur ueber die Konsole, die der Nutzer nicht
      // sieht. Derselbe Status-Indikator wie ueberall im Repo (§8): `is-error` plus
      // `alert-triangle`.
      if (gen !== this.gen) return;
      console.error("Koda: Kontext-Tab konnte nicht aktualisiert werden", err);
      this.paintError();
    });
  }

  private paintError(): void {
    if (this.summaryEl !== null && this.summaryIconEl !== null) {
      this.summaryEl.removeClass("is-ok");
      this.summaryEl.removeClass("is-warning");
      this.summaryEl.addClass("is-error");
      setIcon(this.summaryIconEl, "alert-triangle");
      const label = this.summaryEl.querySelector<HTMLElement>(".koda-ctx-summary-label");
      if (label !== null) label.setText(t("context.error"));
      this.summaryEl.setAttribute("aria-label", t("context.error"));
    }
    const body = this.bodyEl;
    if (body === null) return;
    body.empty();
    body.createDiv({ cls: "koda-empty", text: t("context.error") });
  }

  /** Ein Stepper „Beschriftung − n +". Zwei Exemplare (Link-Tiefe, Trefferzahl) — derselbe
   *  Aufbau samt aria-label (ohne das hoert ein Screenreader nur das Minuszeichen) und
   *  Tastaturbedienung, deshalb EINE Methode. */
  private stepper(body: HTMLElement, label: string, value: number, decAria: string, incAria: string, onStep: (n: number) => void): void {
    const wrap = body.createDiv({ cls: "koda-ctx-depth" });
    wrap.createSpan({ text: label });
    const knopf = (text: string, aria: string, ziel: number): void => {
      const b = wrap.createEl("button", { text });
      b.setAttribute("role", "button");
      b.setAttribute("tabindex", "0");
      b.setAttribute("aria-label", aria);
      b.addEventListener("click", () => { onStep(ziel); });
      b.addEventListener("keydown", (evt: KeyboardEvent) => {
        if (evt.key === "Enter" || evt.key === " ") { evt.preventDefault(); onStep(ziel); }
      });
    };
    knopf("−", decAria, value - 1);
    wrap.createSpan({ text: String(value) });
    knopf("+", incAria, value + 1);
  }

  private paint(vm: PanelViewModel): void {
    if (this.modeEl !== null) fillModeSelect(this.modeEl, this.host.lang(), this.host.vaultAvailable(), this.host.mode());

    if (this.summaryEl !== null && this.summaryIconEl !== null) {
      this.summaryEl.removeClass("is-ok");
      this.summaryEl.removeClass("is-warning");
      // Ein vorheriger Render kann `is-error` gesetzt haben (paintError) — nach einem
      // erfolgreichen Nachladen muss der Fehlerzustand wieder verschwinden.
      this.summaryEl.removeClass("is-error");
      this.summaryEl.addClass(vm.state);
      setIcon(this.summaryIconEl, vm.state === "is-warning" ? "alert-triangle" : "gauge");
      const label = this.summaryEl.querySelector<HTMLElement>(".koda-ctx-summary-label");
      if (label !== null) label.setText(vm.summary);
      this.summaryEl.setAttribute("aria-label", vm.summary);
    }

    const body = this.bodyEl;
    if (body === null) return;
    body.empty();

    if (vm.depth !== null) {
      this.stepper(body, t("context.depth"), vm.depth, t("context.depthDec"), t("context.depthInc"), (n) => { this.host.setDepth(n); });
    }
    if (vm.autoK !== null) {
      this.stepper(body, t("context.autoK"), vm.autoK, t("context.autoKDec"), t("context.autoKInc"), (n) => { this.host.setAutoK(n); });
    }

    for (const sec of vm.sections) {
      const inner = collapsibleSection(body, {
        title: sec.title,
        defaultCollapsed: false,
        key: sec.id,
        storage: this.host.sectionStorage(),
      });
      if (sec.note !== "") inner.createDiv({ cls: "koda-ctx-note", text: sec.note });
      if (sec.chips.length === 0) {
        if (sec.empty !== "") inner.createDiv({ cls: "koda-empty", text: sec.empty });
      } else {
        const list = inner.createDiv({ cls: "koda-ctx-chips" });
        for (const chip of sec.chips) {
          const el = list.createDiv({ cls: `koda-ctx-chip${chip.off ? " is-off" : ""}` });
          el.setAttribute("title", chip.path);
          // a11y (Befund 3, Review 2026-09-05): beide Klick-Ziele sind funktional Knoepfe —
          // Rolle + Fokussierbarkeit + Enter/Leertaste, nach dem Muster aus collapsible.ts.
          const name = el.createSpan({ cls: "koda-ctx-chip-label", text: chip.label });
          name.setAttribute("role", "button");
          name.setAttribute("tabindex", "0");
          const openNote = (): void => { this.host.openNote(chip.path); };
          name.addEventListener("click", openNote);
          name.addEventListener("keydown", (evt: KeyboardEvent) => {
            if (evt.key === "Enter" || evt.key === " ") { evt.preventDefault(); openNote(); }
          });
          if (chip.hint !== "") el.createSpan({ cls: "koda-ctx-chip-hint", text: chip.hint });
          const x = el.createSpan({ cls: "koda-ctx-chip-x" });
          // `removable` (manuelle Eintraege): das Kreuz ENTFERNT statt abzuwaehlen — ein
          // abgewaehlter manueller Eintrag bliebe sonst fuer immer als Chip ohne Zweck stehen.
          if (chip.removable) {
            setIcon(x, "x");
            x.setAttribute("aria-label", t("context.chipRemove"));
            const removeChip = (): void => { this.host.remove(chip.path); };
            x.addEventListener("click", removeChip);
            x.addEventListener("keydown", (evt: KeyboardEvent) => {
              if (evt.key === "Enter" || evt.key === " ") { evt.preventDefault(); removeChip(); }
            });
          } else {
            setIcon(x, chip.off ? "plus" : "x");
            x.setAttribute("aria-label", chip.off ? t("context.chipOn") : t("context.chipOff"));
            const toggleChip = (): void => { this.host.toggle(chip.source, chip.path); };
            x.addEventListener("click", toggleChip);
            x.addEventListener("keydown", (evt: KeyboardEvent) => {
              if (evt.key === "Enter" || evt.key === " ") { evt.preventDefault(); toggleChip(); }
            });
          }
          x.setAttribute("role", "button");
          x.setAttribute("tabindex", "0");
        }
      }
      if (sec.id === "manual") {
        // Kleinigkeit (Review 2026-09-05): an `inner`, nicht an `body" — sonst schweben die
        // Knoepfe bei zugeklapptem Abschnitt unter einer leeren Ueberschrift.
        const add = inner.createDiv({ cls: "koda-ctx-add" });
        add.createEl("button", { text: t("context.addActive") }).addEventListener("click", () => { this.host.addActive(); });
        add.createEl("button", { text: t("context.addNote") }).addEventListener("click", () => { this.host.addNote(); });
        add.createEl("button", { text: t("context.addFolder") }).addEventListener("click", () => { this.host.addFolder(); });
      }
    }

    if (vm.hasOff) {
      body.createEl("button", { cls: "koda-ctx-reset", text: t("context.reset") })
        .addEventListener("click", () => { this.host.reset(); });
    }
  }
}
