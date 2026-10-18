import { Modal, type App } from "obsidian";
import { t } from "../vendor/kit/i18n";

/** Fragt nach dem Namen einer neuen Arbeit. `submit` liefert `true`, wenn der Name angenommen wurde — sonst bleibt der
 *  Dialog offen und nennt den Grund unter dem Feld (kein stilles Schliessen bei einer Kollision). */
export class ArbeitNameModal extends Modal {
  constructor(app: App, private readonly submit: (name: string) => Promise<"ok" | "exists" | "invalid">) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: t("abilities.saveAs.title") });
    const input = contentEl.createEl("input", { type: "text", cls: "koda-ab-name-input", attr: { placeholder: t("abilities.saveAs.placeholder"), "aria-label": t("abilities.saveAs.placeholder") } });
    const msg = contentEl.createDiv({ cls: "koda-ab-hint", attr: { role: "alert" } });
    const go = async (): Promise<void> => {
      const r = await this.submit(input.value);
      if (r === "ok") { this.close(); return; }
      msg.setText(t(r === "exists" ? "abilities.saveAs.exists" : "abilities.saveAs.invalid"));
    };
    input.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); void go(); } });
    const bar = contentEl.createDiv({ cls: "modal-button-container" });
    bar.createEl("button", { text: t("abilities.saveAs.ok"), cls: "mod-cta" }).addEventListener("click", () => void go());
    bar.createEl("button", { text: t("abilities.saveAs.cancel") }).addEventListener("click", () => this.close());
    input.focus();
  }

  onClose(): void { this.contentEl.empty(); }
}
