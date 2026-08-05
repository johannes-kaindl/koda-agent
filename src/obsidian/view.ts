import { ItemView, type WorkspaceLeaf } from "obsidian";
import { t } from "../vendor/kit/i18n";
import type KodaPlugin from "../main";

export const VIEW_TYPE_KODA = "koda-agent-view";

/** Chat-Sidebar. Rendert plugin.chatLog; Streaming/Tool-Schritte kommen als
 *  gezielte DOM-Appends (kein Voll-Redraw pro Token). */
export class KodaView extends ItemView {
  private logEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private streamEl: HTMLElement | null = null;
  private reasonEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: KodaPlugin) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE_KODA; }
  getDisplayText(): string { return t("view.title"); }
  getIcon(): string { return "dog"; }

  onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("koda-root");
    this.logEl = root.createDiv({ cls: "koda-log" });
    const bar = root.createDiv({ cls: "koda-input-bar" });
    this.inputEl = bar.createEl("textarea", { cls: "koda-input", attr: { placeholder: t("view.placeholder"), rows: "2" } });
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.send(); }
    });
    const buttons = bar.createDiv({ cls: "koda-buttons" });
    buttons.createEl("button", { text: t("view.send") }).addEventListener("click", () => this.send());
    buttons.createEl("button", { text: t("view.stop") }).addEventListener("click", () => this.plugin.stopRun());
    buttons.createEl("button", { text: t("view.newChat") }).addEventListener("click", () => void this.plugin.newChat());
    this.renderLog();
    return Promise.resolve();
  }

  private send(): void {
    const q = this.inputEl.value.trim();
    if (q === "" || this.plugin.busy) return;
    this.inputEl.value = "";
    void this.plugin.ask(q);
  }

  /** Voll-Redraw aus plugin.chatLog (Sessionstart, final, Fehler). */
  renderLog(): void {
    this.logEl.empty();
    this.streamEl = null;
    this.reasonEl = null;
    let toolNames = new Map<string, string>();
    for (const m of this.plugin.chatLog) {
      if (m.role === "user") {
        this.logEl.createDiv({ cls: "koda-msg koda-user", text: m.content });
      } else if (m.role === "assistant") {
        if (m.toolCalls && m.toolCalls.length > 0) {
          toolNames = new Map(m.toolCalls.map((c) => [c.id, c.name]));
          if (m.content !== "") this.logEl.createDiv({ cls: "koda-msg koda-assistant", text: m.content });
        } else if (m.content !== "") {
          this.logEl.createDiv({ cls: "koda-msg koda-assistant", text: m.content });
        } else {
          this.logEl.createDiv({ cls: "koda-msg koda-assistant koda-placeholder", text: t("view.thoughtOnly") });
        }
      } else if (m.role === "tool") {
        const name = toolNames.get(m.toolCallId ?? "") ?? m.toolCallId ?? "tool";
        const d = this.logEl.createEl("details", { cls: "koda-tool" });
        d.createEl("summary", { text: t("view.toolStep", name, m.content.slice(0, 60)) });
        d.createEl("pre", { text: m.content });
      }
    }
    if (this.plugin.lastNotice !== null) {
      const cls = this.plugin.lastNotice.kind === "error" ? "koda-msg koda-error" : "koda-msg koda-notice";
      this.logEl.createDiv({ cls, text: this.plugin.lastNotice.text });
    }
    this.logEl.scrollTo({ top: this.logEl.scrollHeight });
  }

  // — Streaming-Hooks, vom Plugin gerufen —
  streamToken(text: string): void {
    if (this.streamEl === null) this.streamEl = this.logEl.createDiv({ cls: "koda-msg koda-assistant koda-streaming" });
    this.streamEl.setText(this.streamEl.getText() + text);
    this.logEl.scrollTo({ top: this.logEl.scrollHeight });
  }
  streamReasoning(text: string): void {
    if (this.reasonEl === null) {
      const d = this.logEl.createEl("details", { cls: "koda-reasoning" });
      d.createEl("summary", { text: t("view.thinking") });
      this.reasonEl = d.createEl("pre");
    }
    this.reasonEl.setText(this.reasonEl.getText() + text);
  }
  toolStep(label: string, detail: string): void {
    this.streamEl = null; // naechster Token-Block ist eine neue Blase
    const d = this.logEl.createEl("details", { cls: "koda-tool" });
    d.createEl("summary", { text: label });
    d.createEl("pre", { text: detail });
  }
}
