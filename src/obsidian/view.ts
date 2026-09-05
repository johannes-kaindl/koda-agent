import { Component, ItemView, MarkdownRenderer, setIcon, type WorkspaceLeaf } from "obsidian";
import { t, getLang } from "../vendor/kit/i18n";
import { confirmAction } from "../vendor/kit-obsidian/confirm";
import { isCompactionRecord, type CompactionRecord } from "../core/agent/types";
import { nextActivity, IDLE, type Activity, type ActivityEvent } from "../core/chat/activity";
import { splitStable } from "../core/chat/stream-blocks";
import { thinkToggleView } from "../core/chat/reasoning-toggle";
import { AVAILABLE_MODES, isContextMode } from "../core/context/types";
import { contextSummary, modeLabel } from "../core/context/labels";
import type KodaPlugin from "../main";

export const VIEW_TYPE_KODA = "koda-agent-view";

/** Chat-Sidebar. Rendert plugin.chatLog; Streaming/Tool-Schritte kommen als
 *  gezielte DOM-Appends (kein Voll-Redraw pro Token). */
export class KodaView extends ItemView {
  private logEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private streamEl: HTMLElement | null = null;
  private reasonEl: HTMLElement | null = null;
  /** Lebensdauer-Anker fuer alles, was MarkdownRenderer im Log anlegt (Embeds, Hover-
   *  Handler). Wird bei jedem Voll-Redraw ausgetauscht, sonst wachsen die Kind-Komponenten
   *  mit jeder Antwort weiter an. */
  private mdComp: Component | null = null;

  // — Statuszeile (§8-Baustein „Status-Indikator": Form UND Farbe UND Klasse UND aria-label) —
  private statusEl!: HTMLElement;
  private statusIconEl!: HTMLElement;
  private statusLabelEl!: HTMLElement;
  private act: Activity = IDLE;

  // — Streaming mit Markdown: was fertig ist, ist gerendert; der Rest bleibt Rohtext —
  /** Roher Text der laufenden Antwort. Quelle fuer splitStable, nicht fuers Anzeigen. */
  private streamRaw = "";
  /** Wie viele Zeichen davon bereits als Markdown-Bloecke stehen. */
  private streamStableLen = 0;
  /** Der laufende Absatz. Immer das letzte Kind von streamEl. */
  private streamTailEl: HTMLElement | null = null;

  /** Kopf-Aktion des Thinking-Schalters — Zustand kommt aus thinkToggleView. */
  private thinkActionEl: HTMLElement | null = null;
  /** Modus-Dropdown in der Knopfzeile — null vor onOpen. */
  private modeEl: HTMLSelectElement | null = null;

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

    // Kopfzeile IM INHALT, nicht ueber `addAction`. Obsidian blendet den View-Kopf in jeder
    // Seitenleiste aus — `app.css`: `.workspace-split.mod-left-split .view-header,
    // .workspace-split.mod-right-split .view-header { display: none }`. Eine Kopf-Aktion ist
    // dort im DOM und trotzdem unsichtbar; bis 0.10.0 war „Neues Gespraech" deshalb fuer
    // niemanden erreichbar (gemessen 2026-09-01: Hoehe 0 in der Sidebar, Gegenprobe im
    // Hauptbereich 38 px). Das ist kein Theme- oder Einstellungsfall, sondern gilt immer.
    // UI-STANDARD §4 verlangt den Kopf ohnehin im Inhalt — `addAction` war die Abweichung,
    // und kein Nachbar-Plugin benutzt es. Ein Pruefpunkt, der nur DOM-Existenz misst, sieht
    // den Defekt nicht: darum misst Pruefpunkt 2 seit heute die Groesse.
    const header = root.createDiv({ cls: "koda-header" });
    this.thinkActionEl = header.createEl("button", { cls: "clickable-icon koda-header-action" });
    setIcon(this.thinkActionEl, "brain");
    this.thinkActionEl.addEventListener("click", () => void this.toggleThinking());
    const newChatEl = header.createEl("button", { cls: "clickable-icon koda-header-action" });
    setIcon(newChatEl, "plus");
    newChatEl.setAttribute("aria-label", t("view.newChat"));
    newChatEl.addEventListener("click", () => void this.askNewChat());

    this.mountChat(root);

    this.syncThinkAction();

    this.renderLog();
    this.paintStatus();
    return Promise.resolve();
  }

  // — Arbeitskontext: Dropdown-Sync, Fokus aus main.ts (Editor-Kontextmenue, Befehlspalette) —
  private lang(): "de" | "en" { return getLang() === "de" ? "de" : "en"; }

  syncContextMode(): void {
    if (this.modeEl !== null) this.modeEl.value = this.plugin.contextMode;
  }

  /** Platzhalter bis Task 7: der Kontext-Tab existiert noch nicht. Absichtlich leer statt
   *  weggelassen — so bleibt jeder Task fuer sich gate-gruen. */
  syncContextPanel(): void { /* Task 7 fuellt das */ }

  /** Der Chat-Inhalt (Verlauf, Statuszeile, Eingabe) in einen beliebigen Container.
   *  Aufgeteilt fuer den Hub: bis Etappe 2 baute `onOpen` direkt in `contentEl`. Der Baum ist
   *  derselbe geblieben — wer hier etwas aendert, aendert den Chat, nicht den Umbau. */
  private mountChat(container: HTMLElement): void {
    this.logEl = container.createDiv({ cls: "koda-log" });
    // Wikilinks aus Kodas Antworten oeffnen die Notiz. Delegiert statt pro Link
    // registriert, damit jeder spaetere Redraw automatisch mitgedeckt ist.
    this.logEl.addEventListener("click", (e) => this.onLogClick(e));

    // Statuszeile zwischen Verlauf und Eingabe: waehrend eines Laufs die Taetigkeit, im
    // Ruhezustand die Belegung des Kontextfensters. Ein Ort fuer „was ist gerade los".
    this.statusEl = container.createDiv({ cls: "koda-status" });
    this.statusIconEl = this.statusEl.createSpan({ cls: "koda-status-icon" });
    this.statusLabelEl = this.statusEl.createSpan({ cls: "koda-status-label" });

    const bar = container.createDiv({ cls: "koda-input-bar" });
    this.inputEl = bar.createEl("textarea", { cls: "koda-input", attr: { placeholder: t("view.placeholder"), rows: "2" } });
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.send(); }
    });
    // Nur noch Senden und Stopp. „Neues Gespraech" sass hier daneben und wurde regelmaessig
    // versehentlich getroffen — es steht jetzt in der Kopfzeile, hinter einer Bestaetigung.
    const buttons = bar.createDiv({ cls: "koda-buttons" });
    // Modus-Dropdown links vom Senden: fuenf Zustaende sind kein Schalter. Ein Zustand, zwei
    // Bedienstellen (Befehle setzen denselben Wert) — syncContextMode zieht nach.
    this.modeEl = buttons.createEl("select", { cls: "dropdown koda-mode", attr: { "aria-label": t("context.dropdownAria") } });
    for (const m of AVAILABLE_MODES) this.modeEl.createEl("option", { value: m, text: modeLabel(m, this.lang()) });
    this.modeEl.addEventListener("change", () => {
      const v = this.modeEl?.value;
      if (isContextMode(v)) this.plugin.setContextMode(v);
    });
    this.syncContextMode();
    buttons.createEl("button", { text: t("view.send"), cls: "mod-cta" }).addEventListener("click", () => this.send());
    buttons.createEl("button", { text: t("view.stop") }).addEventListener("click", () => this.plugin.stopRun());
  }

  focusInput(): void {
    this.inputEl.focus();
  }

  private onLogClick(e: MouseEvent): void {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const link = target.closest("a.internal-link");
    if (link === null) return;
    const href = link.getAttribute("data-href") ?? link.getAttribute("href") ?? "";
    if (href === "") return;
    e.preventDefault();
    void this.app.workspace.openLinkText(href, "", e.ctrlKey || e.metaKey);
  }

  // — Kopfzeile: Aktionen (auch ueber die Befehlspalette erreichbar, s. main.ts) —

  /** Verwerfen ist endgueltig: der Verlauf wandert nach archive.jsonl, aber ohne Trenner —
   *  zurueckholen kann ihn heute niemand. Deshalb die Rueckfrage (Kit-confirmAction, §8). */
  async askNewChat(): Promise<void> {
    if (this.plugin.busy) return;
    const ok = await confirmAction(this.app, {
      title: t("view.newChat.confirm"),
      message: t("view.newChat.confirm.body"),
      confirmLabel: t("view.newChat.confirm.ok"),
      cancelLabel: t("confirm.cancel"),
    });
    if (ok) await this.plugin.newChat();
  }

  async toggleThinking(): Promise<void> {
    // Bei einem Modell, das sich nicht abschalten laesst, tut der Schalter nichts — die
    // Sperre steht im Zustand, und der Handler prueft sie erneut: ein veralteter Klick auf
    // einen gerade gesperrten Knopf darf nicht durchschlagen (Muster canActivatePack).
    const s = this.plugin.settings;
    if (thinkToggleView(s.model, s.suppressThinking).disabled) return;
    s.suppressThinking = !s.suppressThinking;
    await this.plugin.saveSettings();
  }

  /** Beschriftung, Klasse und Sperre des Thinking-Schalters aus dem puren Zustand ziehen.
   *  Wird auch von saveSettings gerufen: der Settings-Tab schaltet denselben Wert. */
  syncThinkAction(): void {
    const el = this.thinkActionEl;
    if (el === null) return;
    const s = this.plugin.settings;
    const v = thinkToggleView(s.model, s.suppressThinking);
    const label = v.hintKey === null ? t(v.labelKey) : `${t(v.labelKey)} — ${t(v.hintKey)}`;
    el.setAttribute("aria-label", label);
    el.setAttribute("aria-disabled", String(v.disabled));
    el.removeClass("is-off");
    el.removeClass("is-disabled");
    if (v.cls !== "") el.addClass(v.cls);
  }

  // — Statuszeile —

  /** Einziger Weg, den Taetigkeits-Zustand zu aendern. */
  activity(e: ActivityEvent): void {
    this.act = nextActivity(this.act, e);
    this.paintStatus();
  }

  private paintStatus(): void {
    const el = this.statusEl;
    el.removeClass("is-checking");
    el.removeClass("is-ok");
    el.removeClass("is-warning");
    if (this.act.busy) {
      el.addClass("is-checking");
      setIcon(this.statusIconEl, "loader");
      const text = this.act.labelArg === "" ? t(this.act.labelKey) : t(this.act.labelKey, this.act.labelArg);
      this.statusLabelEl.setText(text);
      el.setAttribute("aria-label", text);
      el.hidden = false;
      return;
    }
    const usage = this.plugin.contextUsage();
    if (usage === null) {
      // Ohne bekanntes Fenster gibt es nichts, wovon Prozent zu nehmen waeren — dann lieber
      // nichts zeigen als eine Zahl erfinden.
      el.hidden = true;
      return;
    }
    el.addClass(usage.warn ? "is-warning" : "is-ok");
    setIcon(this.statusIconEl, usage.warn ? "alert-triangle" : "gauge");
    const text = t("activity.context", String(usage.percent));
    this.statusLabelEl.setText(text);
    el.setAttribute("aria-label", text);
    el.hidden = false;
  }

  /** Assistenten-Text als Markdown rendern — dadurch sind `[[Wikilinks]]` klickbar und
   *  Listen/Fettung erscheinen als das, was sie sind, statt als Rohtext. Nutzertext bleibt
   *  bewusst Plaintext: was jemand eingetippt hat, soll nicht nachtraeglich zu einer
   *  Ueberschrift werden. */
  private renderMarkdownInto(el: HTMLElement, markdown: string): Promise<void> {
    const comp = this.mdComp;
    if (comp === null) return Promise.resolve();
    return MarkdownRenderer.render(this.app, markdown, el, "", comp);
  }

  private send(): void {
    const q = this.inputEl.value.trim();
    if (q === "" || this.plugin.busy) return;
    this.inputEl.value = "";
    void this.plugin.ask(q);
  }

  /** Verdichtungs-Marke: Stufe 1 als Notizzeile, Stufe 2 aufklappbar mit dem Text — lesbar,
   *  pruefbar, widersprechbar. Der volle Verlauf darueber bleibt stehen: verdichtet wird,
   *  was das MODELL sieht, nicht, was der Nutzer gesagt und gesehen hat. */
  private renderCompaction(host: HTMLElement, rec: CompactionRecord): void {
    const forced = rec.forced === true ? t("view.compaction.forced") : "";
    if (rec.stage === 1) {
      // `parseLines` prueft nur, dass `stats` ein Objekt ist — nicht, dass die Felder
      // Zahlen sind. Defensiv rendern statt einer NaN-Marke im Chat.
      const kb = ((rec.stats.bytes ?? 0) / 1024).toFixed(1);
      const ctxs = rec.stats.contexts ?? 0;
      host.createDiv({ cls: "koda-msg koda-notice koda-compaction", text: t("view.compaction.stage1", rec.stats.stubbed ?? 0, kb) + (ctxs > 0 ? t("view.compaction.contexts", ctxs) : "") + forced });
      return;
    }
    const d = host.createEl("details", { cls: "koda-compaction koda-compaction-summary" });
    d.createEl("summary", { text: t("view.compaction.stage2", rec.turns ?? 0) + forced });
    d.createEl("pre", { text: rec.summary ?? "" });
  }

  /** Live waehrend eines Laufs (onEvent) — bei einem 90-Sekunden-Loop soll man sehen, dass er lebt. */
  compactionMark(rec: CompactionRecord): void {
    this.endStream();
    this.renderCompaction(this.logEl, rec);
    this.logEl.scrollTo({ top: this.logEl.scrollHeight });
  }

  /** Voll-Redraw aus plugin.chatLog (Sessionstart, final, Fehler). */
  renderLog(): void {
    this.logEl.empty();
    this.endStream();
    this.reasonEl = null;
    if (this.mdComp !== null) this.removeChild(this.mdComp);
    this.mdComp = this.addChild(new Component());
    if (this.plugin.skillNotice !== null) {
      this.logEl.createDiv({ cls: "koda-msg koda-notice koda-skills", text: this.plugin.skillNotice });
    }
    const pending: Promise<void>[] = [];
    const assistantBubble = (content: string): void => {
      const el = this.logEl.createDiv({ cls: "koda-msg koda-assistant" });
      pending.push(this.renderMarkdownInto(el, content));
    };
    let toolNames = new Map<string, string>();
    for (const m of this.plugin.chatLog) {
      if (isCompactionRecord(m)) { this.renderCompaction(this.logEl, m); continue; }
      if (m.role === "user") {
        this.logEl.createDiv({ cls: "koda-msg koda-user", text: m.content });
        // Unter der Blase, aufklappbar: was Koda zu dieser Frage vor sich hatte. Persistiert,
        // also auch nach einem Neustart nachlesbar (Spec E2, E6).
        if (m.context !== undefined) {
          const d = this.logEl.createEl("details", { cls: "koda-context" });
          d.createEl("summary", { text: t("context.line", contextSummary(m.context, this.lang())) });
          d.createEl("pre", { text: m.context.text });
        }
      } else if (m.role === "assistant") {
        if (m.toolCalls && m.toolCalls.length > 0) {
          toolNames = new Map(m.toolCalls.map((c) => [c.id, c.name]));
          if (m.content !== "") assistantBubble(m.content);
        } else if (m.content !== "") {
          assistantBubble(m.content);
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
    // Markdown-Rendering ist asynchron: erst danach steht die endgueltige Hoehe fest.
    void Promise.all(pending).then(() => this.logEl.scrollTo({ top: this.logEl.scrollHeight }));
  }

  // — Streaming-Hooks, vom Plugin gerufen —

  /** Der naechste Token-Block ist eine neue Blase. Setzt den Markdown-Schnitt mit zurueck,
   *  sonst rechnete er gegen den Text der vorigen Blase weiter. */
  private endStream(): void {
    this.streamEl = null;
    this.streamTailEl = null;
    this.streamRaw = "";
    this.streamStableLen = 0;
  }

  streamToken(text: string): void {
    if (this.streamEl === null) {
      this.streamEl = this.logEl.createDiv({ cls: "koda-msg koda-assistant koda-streaming" });
      this.streamTailEl = this.streamEl.createDiv({ cls: "koda-stream-tail" });
      this.streamRaw = "";
      this.streamStableLen = 0;
    }
    this.streamRaw += text;
    const { stable, tail } = splitStable(this.streamRaw);
    if (stable.length > this.streamStableLen) {
      // Nur der NEU stabil gewordene Teil wird gerendert — bereits Gezeichnetes bleibt
      // unangetastet. Das ist der Unterschied zum Voll-Rerender: kein Flackern, keine
      // springende Scrollposition, kein quadratischer Aufwand.
      const fresh = stable.slice(this.streamStableLen);
      this.streamStableLen = stable.length;
      const blockEl = this.streamEl.createDiv({ cls: "koda-stream-block" });
      // Ein kaputter Block kostet die Formatierung, nicht die Antwort (Idiom aus session.ts).
      void this.renderMarkdownInto(blockEl, fresh).catch(() => { blockEl.setText(fresh); });
      // Der laufende Absatz gehoert immer ans Ende.
      if (this.streamTailEl !== null) this.streamEl.appendChild(this.streamTailEl);
    }
    this.streamTailEl?.setText(tail);
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
    this.endStream();
    const d = this.logEl.createEl("details", { cls: "koda-tool" });
    d.createEl("summary", { text: label });
    d.createEl("pre", { text: detail });
  }
}
