import { Component, ItemView, MarkdownRenderer, setIcon, type WorkspaceLeaf } from "obsidian";
import { t, getLang } from "../vendor/kit/i18n";
import { confirmAction } from "../vendor/kit-obsidian/confirm";
import { buildHubInto, type HubController, type HubPanel } from "../vendor/kit-obsidian/hub";
import { isCompactionRecord, type CompactionRecord } from "../core/agent/types";
import { nextActivity, IDLE, type Activity, type ActivityEvent } from "../core/chat/activity";
import { buildStreamArea, type StreamArea } from "../vendor/kit-obsidian/stream-area";
import { createStableWriter, type StableMarkdownWriter } from "../vendor/kit-obsidian/stable-writer";
import { thinkToggleView } from "../core/chat/reasoning-toggle";
import { AVAILABLE_MODES, isContextMode, type ContextAttachment } from "../core/context/types";
import { contextSummary, modeLabel, sourceChips } from "../core/context/labels";
import { ContextPanel } from "./context-panel";
import type KodaPlugin from "../main";

export const VIEW_TYPE_KODA = "koda-agent-view";

type KodaTab = "chat" | "context";

/** Chat-Sidebar. Rendert plugin.chatLog; Streaming/Tool-Schritte kommen als
 *  gezielte DOM-Appends (kein Voll-Redraw pro Token). */
export class KodaView extends ItemView {
  private logEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  /** Lebensdauer-Anker fuer alles, was MarkdownRenderer im Log anlegt (Embeds, Hover-
   *  Handler). Wird bei jedem Voll-Redraw ausgetauscht, sonst wachsen die Kind-Komponenten
   *  mit jeder Antwort weiter an. */
  private mdComp: Component | null = null;

  // — Statuszeile (§8-Baustein „Status-Indikator": Form UND Farbe UND Klasse UND aria-label) —
  private statusEl!: HTMLElement;
  private statusIconEl!: HTMLElement;
  private statusLabelEl!: HTMLElement;
  private act: Activity = IDLE;

  // — Streaming-Antwortbereich aus dem Kit (UI-STANDARD §8, `buildStreamArea` +
  //   `createStableWriter`): eine Bubble je Antwort, `null` zwischen zwei Antworten und
  //   nach jedem Voll-Redraw (`logEl.empty()` reisst ihre DOM-Referenzen aus). Verhaltens-
  //   wechsel gegenueber dem Eigenbau (CHANGELOG Unreleased): der Gedankenblock steht
  //   waehrend des Streams offen (Kit-Default), der Scroll folgt nur bei `atBottom` statt
  //   hart ans Ende zu springen. —
  private streamArea: StreamArea | null = null;
  private streamWriter: StableMarkdownWriter | null = null;

  /** Kopf-Aktion des Thinking-Schalters — Zustand kommt aus thinkToggleView. */
  private thinkActionEl: HTMLElement | null = null;
  /** Modus-Dropdown in der Knopfzeile — null vor onOpen. */
  private modeEl: HTMLSelectElement | null = null;

  // — Hub: Chat- und Kontext-Tab —
  private hub: HubController<KodaTab> | null = null;
  private ctxPanel: ContextPanel | null = null;

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

    const chatPanel: HubPanel<KodaTab> = {
      id: "chat",
      get label() { return t("view.tab.chat"); },
      icon: "message-square",
      mount: (c) => { this.mountChat(c); },
      destroy: () => undefined,
    };
    this.ctxPanel = new ContextPanel({
      mode: () => this.plugin.contextMode,
      setMode: (m) => { this.plugin.setContextMode(m); },
      viewModel: () => this.plugin.contextViewModel(),
      toggle: (s, p) => { this.plugin.toggleContextItem(s, p); },
      remove: (p) => { this.plugin.removeContextPath(p); },
      // Befund 6 (Review 2026-09-05): Knopf und Befehl (main.ts) rufen dieselbe
      // Plugin-Methode — kein zweiter geschriebener Weg zum selben Zustand.
      addActive: () => { this.plugin.addContextActive(); },
      addNote: () => { this.plugin.addContextNote(); },
      addFolder: () => void this.plugin.addContextFolder(),
      setDepth: (n) => { this.plugin.setContextLinkDepth(n); },
      reset: () => { this.plugin.resetContextSelection(); },
      openNote: (p) => { void this.app.workspace.openLinkText(p, "", false); },
      sectionStorage: () => this.plugin.sectionStorage(),
      lang: () => this.lang(),
    });
    this.hub = buildHubInto<KodaTab>(root.createDiv({ cls: "koda-hub" }), [chatPanel, this.ctxPanel], "chat");

    // Kontext-Tab lebt vom aktuellen Datei-Kontext — ohne diese Weiterleitung zeigt er
    // beim Notiz-Wechsel weiter den alten Stand (Befund 2, Review 2026-09-05).
    this.registerEvent(
      this.app.workspace.on("file-open", (f) => { this.hub?.notifyFileOpen(f?.path ?? null); }),
    );

    this.syncThinkAction();

    this.renderLog();
    this.paintStatus();
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    this.hub?.destroy();
    this.hub = null;
    return Promise.resolve();
  }

  // — Arbeitskontext: Dropdown-Sync, Fokus aus main.ts (Editor-Kontextmenue, Befehlspalette) —
  private lang(): "de" | "en" { return getLang() === "de" ? "de" : "en"; }

  /** `setTab` bleibt gekapselt: Befehlspalette/Deep-Links kennen die View, nicht den Hub. */
  setTab(id: KodaTab): void { this.hub?.setTab(id); }

  syncContextMode(): void {
    if (this.modeEl !== null) this.modeEl.value = this.plugin.contextMode;
    this.ctxPanel?.render();
  }

  syncContextPanel(): void { this.ctxPanel?.render(); }

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
    this.streamArea = null;
    this.streamWriter = null;
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
    // Die Quellen gehoeren unter die ANTWORT, nicht unter die Frage: dort beantworten sie
    // „woraus stammt das". Gemerkt wird deshalb der Kontext der letzten Nutzer-Nachricht
    // und unter der ersten abschliessenden Antwort danach ausgegeben (eine Antwort mit
    // toolCalls ist ein Zwischenschritt, kein Abschluss).
    let offeneQuellen: ContextAttachment | null = null;
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
        offeneQuellen = m.context ?? null;
      } else if (m.role === "assistant") {
        if (m.toolCalls && m.toolCalls.length > 0) {
          toolNames = new Map(m.toolCalls.map((c) => [c.id, c.name]));
          if (m.content !== "") assistantBubble(m.content);
        } else if (m.content !== "") {
          assistantBubble(m.content);
          if (offeneQuellen !== null) {
            const chips = sourceChips(offeneQuellen);
            if (chips.length > 0) {
              const leiste = this.logEl.createDiv({ cls: "koda-msg koda-notice koda-sources" });
              leiste.createSpan({ cls: "koda-sources-label", text: t("context.sources") });
              for (const c of chips) {
                const el = leiste.createSpan({ cls: "koda-source-chip", text: `${c.label} · ${t("context.sourceChars", String(c.chars))}` });
                el.setAttribute("title", c.path);
                el.setAttribute("role", "button");
                el.setAttribute("tabindex", "0");
                const oeffnen = (): void => { void this.app.workspace.openLinkText(c.path, "", false); };
                el.addEventListener("click", oeffnen);
                el.addEventListener("keydown", (evt: KeyboardEvent) => {
                  if (evt.key === "Enter" || evt.key === " ") { evt.preventDefault(); oeffnen(); }
                });
              }
            }
            offeneQuellen = null;
          }
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

  /** Der naechste Token-Block ist eine neue Blase. */
  private endStream(): void {
    this.streamArea = null;
    this.streamWriter = null;
  }

  /** Legt Bereich + Schreiber einmalig je Antwort an — Gedanken koennen vor dem ersten
   *  Token eintreffen, deshalb rufen beide Hooks dieselbe Stelle. Die Eingabezeile ist
   *  NICHT Teil des Bausteins und bleibt unter `rootEl`, wo sie ist. */
  private ensureStreamArea(): StreamArea {
    if (this.streamArea !== null) return this.streamArea;
    const area = buildStreamArea(this.logEl, {
      strings: { reasoning: t("view.thinking") },
      // `opts.cls` geht 1:1 in `rootEl.addClass()` — Obsidians `addClass` ist EIN Token
      // (DOMTokenList.add), kein klassenweiter String. Mehrere Klassen deshalb per
      // `addClasses` nachtragen statt sie hier mit Leerzeichen zu bündeln (das wirft zur
      // Laufzeit eine InvalidCharacterError, gefunden ueber eine direkte Stream-Probe,
      // nicht ueber den GUI-Smoke — der ruft nie echtes Streaming gegen einen Endpunkt).
      scrollEl: this.logEl,
    });
    area.rootEl.addClasses(["koda-msg", "koda-assistant", "koda-streaming"]);
    area.bodyEl.addClass("markdown-rendered");
    this.streamArea = area;
    this.streamWriter = createStableWriter({
      area,
      // Ein kaputter Block kostet die Formatierung, nicht die Antwort (Idiom aus session.ts)
      // — `createStableWriter` faengt das selbst ab.
      render: (el, md) => this.renderMarkdownInto(el, md),
    });
    return area;
  }

  streamToken(text: string): void {
    this.ensureStreamArea();
    this.streamWriter?.push(text);
  }

  streamReasoning(text: string): void {
    this.ensureStreamArea().appendReasoning(text);
  }

  toolStep(label: string, detail: string): void {
    this.endStream();
    const d = this.logEl.createEl("details", { cls: "koda-tool" });
    d.createEl("summary", { text: label });
    d.createEl("pre", { text: detail });
  }
}
