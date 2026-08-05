import { Modal, Setting, type App } from "obsidian";
import { applyDestructive } from "../vendor/kit-obsidian/confirm";
import { diffLines } from "../core/diff";
import { t } from "../vendor/kit/i18n";
import type { WriteRequest } from "./vault-tools";

/** Schreibfreigabe mit Vorschau: create/append zeigen den neuen Text,
 *  replace zeigt den Zeilen-Diff. Esc/Wegklicken = Ablehnung (loest genau einmal auf). */
export function confirmWrite(app: App, req: WriteRequest): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: boolean): void => {
      if (!settled) { settled = true; resolve(v); }
    };
    const modal = new (class extends Modal {
      onOpen(): void {
        this.titleEl.setText(t("confirm.title", req.mode, req.path));
        const box = this.contentEl.createDiv({ cls: "koda-preview" });
        if (req.mode === "replace") {
          for (const lineItem of diffLines(req.oldText, req.newText)) {
            box.createDiv({ cls: `koda-diff-${lineItem.kind}`, text: lineItem.text });
          }
        } else {
          box.createEl("pre", { text: req.newText });
        }
        new Setting(this.contentEl)
          .addButton((b) => b.setButtonText(t("confirm.cancel")).onClick(() => { done(false); this.close(); }))
          .addButton((b) => {
            applyDestructive(b.setButtonText(t("confirm.write")).setCta());
            b.onClick(() => { done(true); this.close(); });
          });
      }
      onClose(): void {
        done(false);
        this.contentEl.empty();
      }
    })(app);
    modal.open();
  });
}
