import { App, Modal } from "obsidian";
import { t } from "../vendor/kit/i18n";

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
    void this.plugin.previewSystemPrompt().then((text) => {
      pre.setText(text);
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
