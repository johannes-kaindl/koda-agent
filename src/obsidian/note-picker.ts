// uebernommen aus vault-rag/src/note_picker.ts, 2026-09-05
import { App, FuzzySuggestModal, TFile } from "obsidian";
import { t } from "../vendor/kit/i18n";

class NotePicker extends FuzzySuggestModal<TFile> {
  private settled = false;
  constructor(app: App, private done: (p: string | null) => void) {
    super(app);
    this.setPlaceholder(t("picker.note.placeholder"));
  }
  private settle(p: string | null): void { if (!this.settled) { this.settled = true; this.done(p); } }
  getItems(): TFile[] { return this.app.vault.getMarkdownFiles(); }
  getItemText(f: TFile): string { return f.path; }
  onChooseItem(f: TFile): void { this.settle(f.path); }
  onClose(): void {
    super.onClose();
    // Abbruch (null) erst nach einem Tick melden: feuern onChooseItem + onClose bei einer
    // Auswahl gemeinsam, gewinnt so die Auswahl unabhaengig von der Reihenfolge (sonst
    // ueberschreibt null den Pfad).
    window.setTimeout(() => this.settle(null), 0);
  }
}

/** Oeffnet einen Fuzzy-Picker ueber alle Vault-Notizen; gewaehlter Pfad oder null. */
export function pickNote(app: App): Promise<string | null> {
  return new Promise((resolve) => new NotePicker(app, resolve).open());
}
