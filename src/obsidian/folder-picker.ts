import { App, Modal, Setting } from "obsidian";
import { FolderSuggest } from "../vendor/kit-obsidian/folder-suggest";
import { t } from "../vendor/kit/i18n";

/** Ein Ordner statt einer Notiz. Anders als beim Notiz-Picker gibt es dafuer keinen
 *  nativen Fuzzy-Picker — Obsidian bietet `AbstractInputSuggest`, und der vendorte
 *  `FolderSuggest` haengt sie an ein Textfeld. Ein Modal um dieses Feld ist die kleinste
 *  Schale, die daraus einen Auswahl-Vorgang macht. */
class FolderPicker extends Modal {
  private settled = false;
  private wert = "";
  constructor(app: App, private done: (p: string | null) => void) { super(app); }

  onOpen(): void {
    this.titleEl.setText(t("picker.folder.title"));
    new Setting(this.contentEl)
      .setName(t("picker.folder.field"))
      .addText((text) => {
        new FolderSuggest(this.app, text.inputEl);
        text.onChange((v) => { this.wert = v; });
        text.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
          if (evt.key === "Enter") { evt.preventDefault(); this.settle(this.wert); this.close(); }
        });
      });
    new Setting(this.contentEl).addButton((b) =>
      b.setButtonText(t("picker.folder.take")).setCta().onClick(() => { this.settle(this.wert); this.close(); }),
    );
  }

  private settle(p: string): void { if (!this.settled) { this.settled = true; this.done(p); } }

  onClose(): void {
    this.contentEl.empty();
    // Derselbe Tick-Trick wie im Notiz-Picker: ein Klick auf „Übernehmen" schliesst das
    // Modal, und ohne die Verzoegerung ueberschriebe der Abbruch die Auswahl.
    window.setTimeout(() => { if (!this.settled) { this.settled = true; this.done(null); } }, 0);
  }
}

/** Leerer String heisst Vault-Wurzel und ist eine gueltige Antwort; `null` heisst Abbruch. */
export function pickFolder(app: App): Promise<string | null> {
  return new Promise((resolve) => new FolderPicker(app, resolve).open());
}
