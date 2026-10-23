import { App, Modal } from "obsidian";
import { t } from "../vendor/kit/i18n";
import { copyToClipboard } from "../vendor/kit-obsidian/clipboard";

/** Zeigt den fertig zusammengesetzten Prompt. Er kommt aus `previewSystemPrompt()` und
 *  damit aus DERSELBEN `buildSystemPrompt`, die auch `ask()` ruft — ein Nachbau waere eine
 *  zweite Wahrheit, und genau die hat am 2026-08-30 den Sprach-Befund erzeugt (Spec E6). */
export class PromptPreviewModal extends Modal {
  constructor(
    app: App,
    private readonly plugin: { previewSystemPrompt(): Promise<string> },
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: t("prompt.modal.title") });
    contentEl.createDiv({ cls: "koda-modal-sub", text: t("prompt.modal.subtitle") });
    const pre = contentEl.createEl("pre", { cls: "koda-prompt-preview" });
    // Kopieren, um die aktive Anweisung (samt Memory und Skills) abzulegen, bevor man sie aendert. Der Knopf kopiert, was angezeigt wird.
    const copy = contentEl.createEl("button", { text: t("prompt.modal.copy"), cls: "koda-prompt-copy" });
    copy.disabled = true;
    let shown = "";
    void this.plugin.previewSystemPrompt().then((text) => {
      shown = text;
      pre.setText(text);
      copy.disabled = false;
    });
    copy.addEventListener("click", () => {
      void copyToClipboard(shown, { copiedMessage: t("prompt.modal.copied") });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
