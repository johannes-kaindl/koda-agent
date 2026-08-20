import { ButtonComponent, Modal, type App } from "obsidian";
import { applyDestructive } from "../vendor/kit-obsidian/confirm";
import { diffLines } from "../vendor/kit/diff";
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
        // Additiv, nie ersetzend: die vollstaendige Vorschau darunter bleibt die
        // Grundlage der Freigabe (Invariante "Vorschau == geschriebener Inhalt").
        if (req.effect !== undefined && req.effect !== "") {
          const eff = this.contentEl.createDiv({ cls: "koda-effect" });
          eff.createEl("strong", { text: t("confirm.effect") });
          eff.createSpan({ text: ` ${req.effect}` });
        }
        const box = this.contentEl.createDiv({ cls: "koda-preview" });
        if (req.mode === "replace") {
          for (const lineItem of diffLines(req.oldText, req.newText)) {
            box.createDiv({ cls: `koda-diff-${lineItem.kind}`, text: lineItem.text });
          }
        } else {
          box.createEl("pre", { text: req.newText });
        }
        // Button-Reihenfolge und -Container folgen UI-STANDARD §2 (verbindlich): Cancel links,
        // Bestaetigen rechts, beide im nativen modal-button-container — wie im vendorten
        // kit-obsidian/confirm.ts. mod-cta und destructive schliessen sich gegenseitig aus
        // (Kit-Konvention): replace ist destruktiv (ueberschreibt bestehenden Inhalt),
        // create/append sind additiv und bekommen nur die CTA-Hervorhebung.
        const btns = this.contentEl.createDiv({ cls: "modal-button-container" });
        new ButtonComponent(btns).setButtonText(t("confirm.cancel")).onClick(() => { done(false); this.close(); });
        const writeBtn = new ButtonComponent(btns)
          .setButtonText(t("confirm.write"))
          .onClick(() => { done(true); this.close(); });
        if (req.mode === "replace") applyDestructive(writeBtn);
        else writeBtn.setCta();
      }
      onClose(): void {
        done(false);
        this.contentEl.empty();
      }
    })(app);
    modal.open();
  });
}
