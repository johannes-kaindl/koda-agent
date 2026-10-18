import { setIcon } from "obsidian";
import type { AbilitiesVM } from "../core/abilities/panel-vm";
import type { SkillMode } from "../core/abilities/types";
import type { HubPanel } from "../vendor/kit-obsidian/hub";
import { collapsibleSection, type CollapsibleStorage } from "../vendor/kit-obsidian/collapsible";
import { t } from "../vendor/kit/i18n";
import { buildSkillSegment } from "./skill-segment";

/** Schmaler Host-Vertrag (UI-STANDARD §4): das Panel kennt weder Plugin noch Ports. */
export interface AbilitiesPanelHost {
  viewModel(): Promise<AbilitiesVM>;
  chooseArbeit(name: string | null): void;
  save(): void;
  saveAs(): void;
  resetOverlay(): void;
  setSkillMode(name: string, mode: SkillMode): void;
  setToolOn(name: string, on: boolean): void;
  setProviderOn(id: string, on: boolean): void;
  sectionStorage(): CollapsibleStorage;
}

const formatK = (chars: number): string => `${(chars / 1000).toFixed(1).replace(".", ",")}k`;

export class AbilitiesPanel implements HubPanel<"abilities"> {
  readonly id = "abilities" as const;
  readonly icon = "sliders-horizontal";
  get label(): string { return t("view.tab.abilities"); }

  private bodyEl: HTMLElement | null = null;
  /** Generationszaehler gegen Out-of-Order-Ergebnisse (Muster `ContextPanel`). */
  private gen = 0;
  /** Wie beim Kontext-Tab: ein unsichtbares Panel zeichnet nicht; `onShow` holt es nach. */
  private sichtbar = false;

  constructor(private readonly host: AbilitiesPanelHost) {}

  mount(container: HTMLElement): void {
    this.bodyEl = container.createDiv({ cls: "koda-ab-body" });
  }

  onShow(): void {
    this.sichtbar = true;
    this.render();
  }

  onHide(): void { this.sichtbar = false; }

  destroy(): void { this.bodyEl = null; this.sichtbar = false; }

  /** DOM = reine Funktion des ViewModels: der Body wird komplett neu gebaut. */
  render(): void {
    if (!this.sichtbar) return;
    const gen = ++this.gen;
    void this.host.viewModel().then((vm) => {
      if (gen === this.gen) this.paint(vm);
    }).catch((err: unknown) => {
      if (gen !== this.gen) return;
      console.error("Koda: Tab Fähigkeiten konnte nicht aktualisiert werden", err);
      const body = this.bodyEl;
      if (body === null) return;
      body.empty();
      body.createDiv({ cls: "koda-empty", text: t("abilities.error") });
    });
  }

  private paint(vm: AbilitiesVM): void {
    const body = this.bodyEl;
    if (body === null) return;
    body.empty();

    // — Arbeit: Auswahl, Speichern, Als neue Arbeit —
    const head = body.createDiv({ cls: "koda-ab-head" });
    head.createSpan({ cls: "koda-ab-head-label", text: t("abilities.task.label") });
    const select = head.createEl("select", { cls: "dropdown koda-ab-select", attr: { "aria-label": t("abilities.task.label") } });
    select.createEl("option", { value: "", text: t("abilities.task.none") });
    const names = vm.selected !== null && !vm.arbeiten.includes(vm.selected) ? [...vm.arbeiten, vm.selected] : vm.arbeiten;
    for (const n of names) select.createEl("option", { value: n, text: n });
    select.value = vm.selected ?? "";
    select.addEventListener("change", () => { this.host.chooseArbeit(select.value === "" ? null : select.value); });
    const actions = body.createDiv({ cls: "koda-ab-actions" });
    if (vm.selected !== null && vm.arbeiten.includes(vm.selected)) {
      actions.createEl("button", { text: t("abilities.save"), cls: vm.changes > 0 ? "mod-cta" : "" })
        .addEventListener("click", () => { this.host.save(); });
    }
    actions.createEl("button", { text: t("abilities.saveAs") }).addEventListener("click", () => { this.host.saveAs(); });

    if (vm.changes > 0) {
      const line = body.createDiv({ cls: "koda-ab-changes" });
      line.createSpan({ cls: "koda-ab-dot", text: "●", attr: { "aria-hidden": "true" } });
      line.createSpan({ text: t(vm.selected !== null ? "abilities.changesTask" : "abilities.changesChat", String(vm.changes)) });
      line.createEl("button", { cls: "koda-ab-reset", text: t("abilities.reset") }).addEventListener("click", () => { this.host.resetOverlay(); });
    }
    for (const h of vm.hints) {
      const el = body.createDiv({ cls: "koda-ab-hint" });
      setIcon(el.createSpan({ cls: "koda-ab-hint-icon" }), "alert-triangle");
      el.createSpan({ text: h });
    }

    // — Skills —
    const skills = collapsibleSection(body, { title: t("abilities.section.skills"), defaultCollapsed: false, key: "ab-skills", storage: this.host.sectionStorage() });
    if (vm.skills.length === 0 && vm.failed.length === 0) skills.createDiv({ cls: "koda-empty", text: t("abilities.empty.skills") });
    for (const s of vm.skills) {
      const row = skills.createDiv({ cls: "koda-ab-row" });
      this.dot(row, s.fromOverlay);
      row.createSpan({ cls: "koda-ab-name", text: s.name });
      row.createSpan({ cls: "koda-ab-size", text: formatK(s.chars) });
      buildSkillSegment(row, { name: s.name, mode: s.mode, onChange: (m) => { this.host.setSkillMode(s.name, m); } });
    }
    for (const f of vm.failed) {
      const row = skills.createDiv({ cls: "koda-ab-row is-failed" });
      row.createSpan({ cls: "koda-ab-name", text: t(f.reason === "no-description" ? "abilities.failed.noDescription" : "abilities.failed.readError", f.name) });
    }

    // — Werkzeuge · Koda —
    const tools = collapsibleSection(body, { title: t("abilities.section.tools"), defaultCollapsed: false, key: "ab-tools", storage: this.host.sectionStorage() });
    for (const tool of vm.tools) {
      const row = tools.createDiv({ cls: "koda-ab-row" });
      this.dot(row, tool.fromOverlay);
      row.createSpan({ cls: "koda-ab-name", text: tool.name });
      this.toggle(row, tool.name, tool.on, (on) => { this.host.setToolOn(tool.name, on); });
    }

    // — Werkzeuge · Plugins —
    const providers = collapsibleSection(body, { title: t("abilities.section.providers"), defaultCollapsed: false, key: "ab-providers", storage: this.host.sectionStorage() });
    if (vm.providers.length === 0) providers.createDiv({ cls: "koda-empty", text: t("abilities.empty.providers") });
    for (const p of vm.providers) {
      const row = providers.createDiv({ cls: "koda-ab-row" });
      this.dot(row, p.fromOverlay);
      row.createSpan({ cls: "koda-ab-name", text: p.id });
      row.createSpan({ cls: "koda-ab-size", text: p.on && p.enabled < p.total ? t("abilities.provider.partial", String(p.enabled), String(p.total)) : t("abilities.provider.count", String(p.total)) });
      this.toggle(row, p.id, p.on, (on) => { this.host.setProviderOn(p.id, on); });
    }

    body.createDiv({
      cls: `koda-ab-footer${vm.pinnedChars > vm.budgetChars ? " is-warning" : ""}`,
      text: t("abilities.footer", formatK(vm.pinnedChars), formatK(vm.budgetChars)),
    });
  }

  /** Punkt vor dem Namen: der Wert kommt aus dem Overlay dieses Gespraechs. Sichtbar UND fuer Screenreader. */
  private dot(row: HTMLElement, fromOverlay: boolean): void {
    const dot = row.createSpan({ cls: "koda-ab-dot" });
    if (!fromOverlay) return;
    dot.setText("●");
    dot.setAttribute("role", "img");
    dot.setAttribute("aria-label", t("abilities.overlayDot"));
  }

  /** Zustands-Knopf (UI-STANDARD §8): das Label zeigt den Ist-Zustand, `aria-pressed` ist der zweite Kanal neben der Farbe. */
  private toggle(row: HTMLElement, name: string, on: boolean, set: (on: boolean) => void): void {
    const b = row.createEl("button", {
      cls: `koda-ab-toggle${on ? "" : " is-off"}`,
      text: t(on ? "abilities.toggle.on" : "abilities.toggle.off"),
      attr: { "aria-pressed": String(on), title: t(on ? "abilities.toggle.tipOn" : "abilities.toggle.tipOff", name) },
    });
    b.addEventListener("click", () => { set(!on); });
  }
}
