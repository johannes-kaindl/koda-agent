import { Plugin, WorkspaceLeaf, normalizePath, Notice, type Editor, type Menu } from "obsidian";
import "./i18n/strings";
import { getLanguage } from "obsidian";
import { pickLang, setLang, getLang, t } from "./vendor/kit/i18n";
import { resolveLang, type Lang } from "./core/lang";
import type { EndpointConfig } from "./vendor/kit/endpoint_config";
import type { EndpointStatus } from "./vendor/kit/endpoint_diagnostics";
import { realClock } from "./vendor/kit-obsidian/clock";
import { KodaChatClient, type LlmResult } from "./llm/KodaChatClient";
import { probeEndpoint, probeModels } from "./core/llm/probe";
import { probeModelContext } from "./core/llm/context-probe";
import { EndpointResolver, withFailover } from "./core/llm/failover";
import { requestUrlProbe } from "./obsidian/http-probe";
import { XhrSseTransport } from "./llm/XhrSseTransport";
import { runAgent, type LoopLlm, type CompactionDeps } from "./core/agent/loop";
import { type ChatMessage, type LogEntry } from "./core/agent/types";
import { toolSet, toWireTools, type ToolDef, type ToolSet } from "./core/tools/defs";
import { readToolProviders } from "./obsidian/providers";
import { confirmAction } from "./vendor/kit-obsidian/confirm";
import { SKILLS_SUBFOLDER } from "./core/tools/write-policy";
import { buildSystemPrompt } from "./core/prompt/build";
import { effectiveRules, renderRules } from "./core/prompt/rules";
import { toLabMessages, describeLlmFailure, readNotePathOf } from "./core/agent/lab-trace";
import { readLabApi } from "./obsidian/lab";
import { SessionStore } from "./core/memory/session";
import { parseSkill, type Skill } from "./core/skills/skill";
import { selectSkills, type Selection } from "./core/skills/select";
import { CONTEXT_AUTO_K_MAX, CONTEXT_AUTO_K_MIN, CONTEXT_LINK_DEPTH_MAX, CONTEXT_LINK_DEPTH_MIN, DEFAULT_SETTINGS, validateKodaSettings, type KodaSettings } from "./core/settings-types";
import { VaultTools, type VaultPort } from "./obsidian/vault-tools";
import { readRetrievalApi } from "./obsidian/retrieval";
import { confirmWrite } from "./obsidian/confirm-write";
import { estimateTokens } from "./core/agent/compaction/estimate";
import { contextUsage, type ContextUsage } from "./core/chat/context-usage";
import { KodaView, VIEW_TYPE_KODA } from "./obsidian/view";
import { KodaSettingsTab } from "./obsidian/settings";
import { projectForModel } from "./core/agent/compaction/project";
import { AVAILABLE_MODES, type ContextAttachment, type ContextMode } from "./core/context/types";
import { modeLabel } from "./core/context/labels";
import { renderWorkspaceContext } from "./core/context/workspace-line";
import { buildFullContext } from "./core/context/build";
import { fetchSemanticHits, type SemanticHits } from "./core/context/semantic";
import type { WorkspaceSnapshot } from "./core/context/ports";
import { contentPort, linkPort } from "./obsidian/links";
import { editorPort, linesAround, readWorkspace } from "./obsidian/workspace";
import { applySelection, itemKey, type SelectionKey } from "./core/context/selection";
import type { ContextSource } from "./core/context/types";
import { buildPanelViewModel, type PanelViewModel } from "./core/context/panel-vm";
import { addPaths, removePath } from "./core/context/manual";
import { pickNote } from "./obsidian/note-picker";
import { pickFolder } from "./obsidian/folder-picker";
import { resolveFolderPath } from "./core/tools/path-guard";
import type { CollapsibleStorage } from "./vendor/kit-obsidian/collapsible";

/** Modell-Override der Zeile, sonst das globale Modell. Inline statt Kit-Import: das Kit
 *  hat `effectiveModel` in `endpoint_config.ts` (code-kit 0.6.0) als `@deprecated`
 *  markiert — koda hat weiterhin ein globales Modellfeld (`settings.model`), die Migration
 *  weg davon ist eine eigene Design-Entscheidung, kein Nebenprodukt des Pin-Bumps auf
 *  0.35.0. Verhalten unveraendert; nur der Aufrufer der deprecated-Warnung entfaellt. */
function effectiveModel(cfg: EndpointConfig, globalModel: string): string {
  const m = cfg.model?.trim();
  return m ? m : globalModel;
}

/** Eine Skill-Datei, die NICHT in die Auswahl kam — mit Ursache statt Sammelbegriff:
 *  "read-error" (Datei liess sich nicht lesen) und "no-description" (Frontmatter ohne
 *  description) brauchen unterschiedliche Meldungen, siehe `skillStatusText`. */
interface SkillFailure {
  name: string;
  reason: "read-error" | "no-description";
}

export default class KodaPlugin extends Plugin {
  settings: KodaSettings = DEFAULT_SETTINGS;
  chatLog: LogEntry[] = [];
  busy = false;
  /** Transiente Notiz (Fehler/Abbruch/Rundenlimit) als Plugin-State statt DOM-Append —
   *  renderLog() zeichnet sie am Ende neu; ein Voll-Redraw kann sie sonst sofort wieder loeschen. */
  lastNotice: { text: string; kind: "error" | "neutral" } | null = null;
  /** Ladezustand der Skills — eigener Slot NEBEN lastNotice und oberhalb des Verlaufs
   *  gezeichnet. Ueber lastNotice zu laufen hiesse, dass jeder Fehler im selben Turn
   *  die Zeile ueberschreibt: sie waere genau dann weg, wenn etwas schiefgeht. */
  skillNotice: string | null = null;
  /** Zuletzt GESENDETER Prompt. `null`, solange in dieser Sitzung nichts gefragt wurde.
   *  Nur im Speicher — er traegt Memory-Zeilen und gehoert nicht auf Platte (Spec E6). */
  lastSystemPrompt: string | null = null;

  /** Der Modus fuer die NAECHSTE Nachricht. Beim Laden der Default aus den Einstellungen;
   *  danach ueberstimmt der Chat (Dropdown, Befehle), bis das Plugin neu laedt (Spec E1).
   *  „Neues Gespraech" aendert ihn nicht. */
  contextMode: ContextMode = "workspace";

  /** Ist vault-rags API da (Version und Form geprueft)? Je Aufruf frisch — vault-rag kann zur
   *  Laufzeit an- oder abgeschaltet werden (Muster `readRetrievalApi`). Ob ein Index geladen
   *  ist, entscheidet diese Frage NICHT: das meldet die Suche selbst als Grund. */
  vaultAvailable(): boolean {
    return readRetrievalApi(this.app) !== null;
  }

  setContextMode(mode: ContextMode): void {
    if (!AVAILABLE_MODES.includes(mode)) return;
    if (mode === "vault" && !this.vaultAvailable()) {
      // Befehl oder veraltetes Dropdown: nicht still ignorieren, sondern sagen, was fehlt.
      new Notice(t("context.vaultNeedsRag"));
      return;
    }
    this.contextMode = mode;
    for (const v of this.views()) v.syncContextMode();
  }

  /** Abgewählte Teile des Arbeitsplatzes. Lebt im Plugin, nicht in der View: `currentContext()`
   *  braucht ihn, die View zeigt ihn nur an (UI-STANDARD §4 — DOM ist Funktion des Zustands).
   *  Nicht persistiert: eine Abwahl gilt für diese Sitzung, `contextKeepChoices` steuert nur,
   *  ob sie das Senden überlebt. */
  contextOff: Set<SelectionKey> = new Set();

  /** Vom Nutzer hinzugefuegte Notizen, in der Reihenfolge des Hinzufuegens. Wie
   *  `contextOff` nicht persistiert — eine Zusammenstellung gilt fuer diese Sitzung.
   *  Wirkt in den Modi Notiz und Alle Tabs; im Modus Arbeitsplatz stehen die Chips
   *  weiter da, tragen dort aber einen Hinweis statt einer Groesse (der Block schickt
   *  Zeiger, keine Inhalte — Spec E1). */
  contextManual: string[] = [];

  /** Der Entwurf im Eingabefeld, entprellt aus der View gemeldet. Speist NUR die Vorschau im
   *  Kontext-Tab — gesendet wird mit dem echten Nachrichtentext (`ask(question)`), sonst
   *  haette wer vor Ablauf der Verzoegerung sendet, Treffer zu einem halben Satz im Block
   *  (Etappe-3-Zuschnitt Punkt 2). */
  contextQuery = "";

  setContextQuery(q: string): void {
    if (q === this.contextQuery) return;
    this.contextQuery = q;
    // Nur der Vault-Modus haengt an der Frage — in allen anderen waere ein Neuzeichnen je
    // Tastendruck reine Arbeit ohne sichtbare Aenderung.
    if (this.contextMode === "vault") for (const v of this.views()) v.syncContextPanel();
  }

  /** vault-rag fragen, falls der Modus es verlangt. Ein Weg fuer Vorschau und Senden. */
  private semanticHits(mode: ContextMode, query: string, snap: WorkspaceSnapshot): Promise<SemanticHits> {
    return fetchSemanticHits(readRetrievalApi(this.app), {
      mode, query, activePath: snap.active?.path ?? null, k: this.settings.contextAutoK,
    });
  }

  setContextAutoK(n: number): void {
    const geklemmt = Math.min(CONTEXT_AUTO_K_MAX, Math.max(CONTEXT_AUTO_K_MIN, Math.round(n)));
    if (geklemmt === this.settings.contextAutoK) return;
    this.settings.contextAutoK = geklemmt;
    void this.saveSettings();
    for (const v of this.views()) v.syncContextPanel();
  }

  addContextPaths(paths: readonly string[]): void {
    const naechster = addPaths(this.contextManual, paths);
    if (naechster === this.contextManual) return;
    this.contextManual = naechster;
    for (const v of this.views()) v.syncContextPanel();
  }

  removeContextPath(path: string): void {
    const naechster = removePath(this.contextManual, path);
    if (naechster === this.contextManual) return;
    this.contextManual = naechster;
    for (const v of this.views()) v.syncContextPanel();
  }

  /** „+ Aktive Notiz": Befehl UND Knopf im Kontext-Tab rufen DIESE Methode (Befund 6, Review
   *  2026-09-05: der Knopf baute die Orchestrierung des gleichnamigen Befehls bislang
   *  woertlich nach — ein Zustand, zwei geschriebene Wege, die auseinanderlaufen koennen). */
  addContextActive(): void {
    const aktiv = readWorkspace(this.app, VIEW_TYPE_KODA).active;
    if (aktiv !== null) this.addContextPaths([aktiv.path]);
  }

  /** „+ Notiz…": Fuzzy-Picker, dann in die manuelle Liste — wie `addContextActive` ein Weg
   *  fuer Befehl und Knopf gemeinsam. */
  addContextNote(): void {
    void pickNote(this.app).then((p) => { if (p !== null) this.addContextPaths([p]); });
  }

  /** „+ Ordner": die Markdown-Pfade des Ordners werden SOFORT einzeln eingetragen, nicht
   *  der Ordner gemerkt. Ein gemerkter Ordner aenderte seinen Inhalt zwischen zwei
   *  Nachrichten, ohne dass der Nutzer etwas tut — die Chips zeigten dann etwas anderes
   *  als der Block. Rekursiv, weil ein Ordner mit Unterordnern sonst fast leer wirkt. */
  async addContextFolder(): Promise<void> {
    const ordner = await pickFolder(this.app);
    if (ordner === null) return;
    // `resolveFolderPath` wirft bei "..", und diese Methode ist async — ein Aufrufer, der
    // sie mit `void` verwirft, wuerde einen solchen Wurf sonst stillschweigend schlucken
    // (Befund 5). Deshalb hier fangen und melden, statt es dem Aufrufer zu ueberlassen.
    let norm: string;
    try {
      norm = resolveFolderPath(ordner);
    } catch (err) {
      new Notice(t("picker.folder.invalid", err instanceof Error ? err.message : String(err)));
      return;
    }
    // Ein leeres Feld normalisiert auf "" — das ist der ganze Vault, keine Auswahl, die
    // ohne Rueckfrage durchgehen sollte (Befund 2). Ablehnen und sagen, was passiert waere.
    if (norm === "") { new Notice(t("picker.folder.emptyRoot")); return; }
    const praefix = `${norm}/`;
    const pfade = this.app.vault.getMarkdownFiles().map((f) => f.path).filter((p) => p.startsWith(praefix)).sort();
    if (pfade.length === 0) { new Notice(t("picker.folder.empty", ordner)); return; }
    this.addContextPaths(pfade);
  }

  toggleContextItem(source: ContextSource, path: string): void {
    const key = itemKey(source, path);
    if (this.contextOff.has(key)) this.contextOff.delete(key);
    else this.contextOff.add(key);
    for (const v of this.views()) v.syncContextPanel();
  }

  resetContextSelection(): void {
    if (this.contextOff.size === 0 && this.contextManual.length === 0) return;
    this.contextOff.clear();
    this.contextManual = [];
    for (const v of this.views()) v.syncContextPanel();
  }

  /** Speist den Kontext-Tab. Liest denselben Snapshot und dieselben Einstellungen wie
   *  `currentContext()` — es gibt keinen zweiten Weg zu dem, was angezeigt wird. */
  async contextViewModel(): Promise<PanelViewModel> {
    const s = this.settings;
    const modus = this.contextMode === "off" ? "workspace" : this.contextMode;
    const snap = readWorkspace(this.app, VIEW_TYPE_KODA);
    const hits = await this.semanticHits(modus, this.contextQuery, snap);
    return buildPanelViewModel(modus, snap, this.contextOff, {
      lang: this.promptLang(),
      selectionMax: s.contextSelectionChars,
      tabsMax: s.contextTabsMax,
      frontmatterMax: s.contextFrontmatterChars,
      windowTokens: s.contextWindowTokens,
      budget: s.contextBudgetChars,
      linkDepth: s.contextLinkDepth,
      autoK: s.contextAutoK,
      hits,
      query: this.contextQuery,
      manual: this.contextManual,
      links: linkPort(this.app),
      content: contentPort(this.app),
    });
  }

  setContextLinkDepth(n: number): void {
    const geklemmt = Math.min(CONTEXT_LINK_DEPTH_MAX, Math.max(CONTEXT_LINK_DEPTH_MIN, Math.round(n)));
    if (geklemmt === this.settings.contextLinkDepth) return;
    this.settings.contextLinkDepth = geklemmt;
    void this.saveSettings();
    for (const v of this.views()) v.syncContextPanel();
  }

  /** Auf/Zu-Zustand der Abschnitte, persistiert in `data.json`. */
  sectionStorage(): CollapsibleStorage {
    return {
      getCollapsed: (key) => this.settings.contextSections[key],
      setCollapsed: (key, collapsed) => {
        this.settings.contextSections = { ...this.settings.contextSections, [key]: collapsed };
        void this.saveSettings();
      },
    };
  }

  /** Der Kontext, der mit der naechsten Nachricht geht — `ask()` ruft DIESE Methode, der
   *  GUI-Smoke misst sie: es gibt keinen zweiten Weg, auf dem der Block entsteht.
   *
   *  Asynchron seit Etappe 2b: die Volltext-Modi lesen Notizen. Ein Inhalts-Cache im
   *  Plugin waere synchron geblieben und haette eine zweite Wahrheit neben der Datei
   *  eingefuehrt — `ask()` ist ohnehin async und wartet hier an Ort und Stelle.
   *
   *  `query` ist die Frage, die gerade gesendet wird; der Vault-Modus sucht mit ihr, nicht
   *  mit dem Entwurf. */
  async currentContext(query?: string): Promise<ContextAttachment | null> {
    const s = this.settings;
    const snap = readWorkspace(this.app, VIEW_TYPE_KODA);
    switch (this.contextMode) {
      case "off":
        return null;
      case "workspace":
        return renderWorkspaceContext(applySelection(snap, this.contextOff), {
          lang: this.promptLang(),
          selectionMax: s.contextSelectionChars,
          tabsMax: s.contextTabsMax,
          frontmatterMax: s.contextFrontmatterChars,
        });
      case "note":
      case "tabs":
      case "vault":
        return await buildFullContext({
          mode: this.contextMode,
          snap,
          links: linkPort(this.app),
          content: contentPort(this.app),
          manual: this.contextManual,
          off: this.contextOff,
          linkDepth: s.contextLinkDepth,
          budget: s.contextBudgetChars,
          lang: this.promptLang(),
          // `query` fehlt nur beim GUI-Smoke und bei gui:ask ohne Frage — dann gilt der Entwurf.
          hits: await this.semanticHits(this.contextMode, query ?? this.contextQuery, snap),
        });
    }
  }

  /** Sidebar oeffnen, Modus mindestens Arbeitsplatz, Eingabefeld fokussieren — der Weg aus
   *  dem Editor-Kontextmenue und der Befehlspalette. */
  async askWithSelection(): Promise<void> {
    if (this.contextMode === "off") this.setContextMode("workspace");
    // activateView statt nur runInView: eine eingeklappte Seitenleiste hat eine View und
    // wuerde sonst nicht aufgeklappt — dieselbe Lehre wie 0.10.1 (Aktion ohne sichtbare Wirkung).
    await this.activateView();
    await this.runInView((v) => { v.focusInput(); return Promise.resolve(); });
  }

  private abort: AbortController | null = null;
  private readonly transport = new XhrSseTransport();

  /** Loest "erster erreichbarer Endpunkt" auf und merkt sich das Ergebnis fuer die Sitzung.
   *  Liest `this.settings` bei jedem Durchlauf frisch — eine im Editor geaenderte Liste
   *  wirkt dadurch ohne Neustart, sobald `saveSettings()` den Zwischenstand verwirft. */
  private readonly resolver = new EndpointResolver(
    () => this.settings.endpoints,
    async (ep) => (await this.probe(ep)).reachable,
  );

  /** Erreichbarkeits-Probe einer Endpunkt-Zeile (Settings-Testknopf). Liegt am Plugin,
   *  weil der Failover sie spaeter ebenfalls braucht. */
  probe(ep: EndpointConfig): Promise<EndpointStatus> {
    return probeEndpoint(ep, requestUrlProbe, realClock);
  }

  /** Erreichbarkeit UND Modell-Liste aus einem Aufruf (Settings-Modellauswahl). */
  probeModels(ep: EndpointConfig): Promise<{ status: EndpointStatus; models: string[] }> {
    return probeModels(ep, requestUrlProbe, realClock);
  }

  /** Kontextfenster laut Endpunkt (LM Studio/Ollama), sonst null. Nutzt das Modell, das fuer
   *  diese Zeile effektiv gilt. */
  probeContext(ep: EndpointConfig): Promise<number | null> {
    return probeModelContext(ep, effectiveModel(ep, this.settings.model), requestUrlProbe, realClock);
  }
  private store!: SessionStore;

  async onload(): Promise<void> {
    this.settings = validateKodaSettings(await this.loadData());
    this.contextMode = this.settings.contextModeDefault;
    // Ein gespeicherter Default aus einer spaeteren Etappe (z. B. "note") ist hier noch
    // nicht angeboten — dann faellt der Start auf Arbeitsplatz zurueck, statt den Chat in
    // einem Modus zu starten, den er gar nicht anbietet.
    if (!AVAILABLE_MODES.includes(this.contextMode)) this.contextMode = "workspace";
    // Erst wenn alle Plugins geladen sind, ist die Frage „gibt es vault-rag?" beantwortbar.
    // Ein gespeicherter Default „vault" ohne vault-rag faellt dann auf Arbeitsplatz zurueck,
    // und die Dropdowns bekommen ihre Sperre (sie wurden womoeglich vor vault-rag gebaut).
    this.app.workspace.onLayoutReady(() => {
      if (this.contextMode === "vault" && !this.vaultAvailable()) this.contextMode = "workspace";
      for (const v of this.views()) v.syncContextMode();
    });
    this.applyLanguage();

    const dir = normalizePath(`${this.manifest.dir ?? ""}/sessions`);
    const adapter = this.app.vault.adapter;
    this.store = new SessionStore(
      {
        read: async (p) => ((await adapter.exists(p)) ? adapter.read(p) : null),
        write: async (p, d) => {
          await this.ensureDir(dir);
          await adapter.write(p, d);
        },
        append: async (p, d) => {
          await this.ensureDir(dir);
          await adapter.append(p, d);
        },
      },
      dir,
    );
    this.chatLog = await this.store.load();

    this.registerView(VIEW_TYPE_KODA, (leaf) => new KodaView(leaf, this));
    this.addRibbonIcon("dog", t("cmd.open"), () => void this.activateView());
    this.addCommand({ id: "open", name: t("cmd.open"), callback: () => void this.activateView() });
    // Zweiter Zugang zu beiden Kopfzeilen-Aktionen. Nicht Bequemlichkeit, sondern Lehre aus
    // dem Befund vom 2026-09-01: „Neues Gespraech" hing bis dahin an EINEM unsichtbaren Knopf,
    // und damit war die Aktion fuer niemanden erreichbar. Ein Befehl ist von der Darstellung
    // unabhaengig — er ueberlebt jede kuenftige Umgestaltung der Oberflaeche.
    this.addCommand({ id: "new-chat", name: t("cmd.newChat"), callback: () => void this.runInView((v) => v.askNewChat()) });
    this.addCommand({ id: "toggle-thinking", name: t("cmd.toggleThinking"), callback: () => void this.runInView((v) => v.toggleThinking()) });
    for (const mode of AVAILABLE_MODES) {
      this.addCommand({
        id: `context-mode-${mode}`,
        name: t("cmd.contextMode", modeLabel(mode, this.promptLang())),
        callback: () => this.setContextMode(mode),
      });
    }
    this.addCommand({ id: "ask-with-selection", name: t("cmd.askWithSelection"), callback: () => void this.askWithSelection() });
    // Jede Aktion braucht einen Weg, der nicht an der Darstellung haengt (Lehre 0.10.1):
    // ein Tab, den nur ein Knopf erreicht, ist bei ausgeblendetem Knopf unerreichbar.
    this.addCommand({ id: "tab-chat", name: t("cmd.tabChat"), callback: () => { void this.runInView((v) => { v.setTab("chat"); return Promise.resolve(); }); } });
    this.addCommand({ id: "tab-context", name: t("cmd.tabContext"), callback: () => { void this.runInView((v) => { v.setTab("context"); return Promise.resolve(); }); } });
    this.addCommand({
      id: "context-add-active",
      name: t("cmd.contextAddActive"),
      callback: () => this.addContextActive(),
    });
    this.addCommand({
      id: "context-add-note",
      name: t("cmd.contextAddNote"),
      callback: () => this.addContextNote(),
    });
    this.addCommand({
      id: "context-add-folder",
      name: t("cmd.contextAddFolder"),
      callback: () => void this.addContextFolder(),
    });
    // Rechtsklick auf markierten Text: nur dann, sonst ist der Eintrag Rauschen.
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor) => {
        if (editor.getSelection() === "") return;
        menu.addItem((item) => item.setTitle(t("menu.askKoda")).setIcon("dog").onClick(() => void this.askWithSelection()));
      }),
    );
    this.addSettingTab(new KodaSettingsTab(this.app, this));

    if (this.settings.openOnStartup) {
      this.app.workspace.onLayoutReady(() => void this.activateView());
    }
  }

  /** Einmal ermittelte Auto-Sprache. Der Kit-Vertrag verlangt die Erkennung EINMAL beim
   *  onload; `applyLanguage()` haengt aber auch an `saveSettings()`, damit ein Umschalten in
   *  den Einstellungen sofort wirkt. Der Cache versoehnt beides. */
  private autoLang: Lang | null = null;

  applyLanguage(): void {
    const r = resolveLang(this.settings.language, this.autoLang, () => detectLang(), getLang());
    this.autoLang = r.cache;
    setLang(r.lang);
  }

  /** Sprache fuer den System-Prompt — dieselbe Quelle wie die Oberflaeche. Zwei getrennte
   *  Erkennungen koennten auseinanderlaufen, und dann antwortet Koda in einer anderen
   *  Sprache, als seine Knoepfe tragen. */
  private promptLang(): Lang {
    const r = resolveLang(this.settings.language, this.autoLang, () => detectLang(), getLang());
    this.autoLang = r.cache;
    return r.lang;
  }

  private async ensureDir(dir: string): Promise<void> {
    if (!(await this.app.vault.adapter.exists(dir))) await this.app.vault.adapter.mkdir(dir);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.applyLanguage();
    // Eine geaenderte Liste macht den gemerkten Endpunkt zu einer Aussage ueber die alte.
    this.resolver.invalidate();
    // Der Settings-Tab schaltet denselben suppressThinking-Wert wie die Kopf-Aktion —
    // ein Zustand, zwei Zugaenge, also muss der zweite mitziehen.
    for (const v of this.views()) v.syncThinkAction();
  }

  /** Eine Kopfzeilen-Aktion aus der Befehlspalette ausfuehren. Ist die Sidebar zu, wird sie
   *  erst geoeffnet: ein Befehl, der stillschweigend nichts tut, weil gerade keine View
   *  offen ist, waere derselbe Fehler wie der unsichtbare Knopf — nur leiser. */
  private async runInView(fn: (view: KodaView) => Promise<void>): Promise<void> {
    if (this.views().length === 0) await this.activateView();
    const view = this.views()[0];
    if (view !== undefined) await fn(view);
  }

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_KODA)[0];
    const leaf: WorkspaceLeaf | null = existing ?? this.app.workspace.getRightLeaf(false);
    if (leaf === null) return;
    await leaf.setViewState({ type: VIEW_TYPE_KODA, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  /** Belegung des Kontextfensters fuer die Statuszeile. Dieselbe Schaetzung, derselbe
   *  Tool-Overhead und dieselbe Schwelle wie die Verdichtungs-Entscheidung in ask() — aber
   *  OHNE den System-Prompt (Memory + Skills): der steht ohne einen Lauf nicht zur Verfuegung.
   *  Die Anzeige liegt dadurch um ein paar Prozent NIEDRIGER als die tatsaechliche Belegung,
   *  nie hoeher. */
  contextUsage(): ContextUsage | null {
    const s = this.settings;
    const used = estimateTokens(
      // Die PROJEKTION, nicht der rohe Verlauf: gestubbte Tool-Ergebnisse zaehlen so mit ihrer
      // Stub-Laenge, und der Kontextblock zaehlt ueberhaupt (er steht nur dort in content).
      projectForModel(this.chatLog),
      JSON.stringify(toWireTools(this.currentToolDefs())).length,
    );
    return contextUsage(used, s.contextWindowTokens, s.compactAtPercent);
  }

  /** Die Werkzeuge, die beim naechsten Gespraech gesendet werden. `ask()` ruft diese Methode;
   *  jeder Messpunkt darf sie ebenfalls rufen und misst damit die WIRKLICHE Liste — es gibt
   *  keinen zweiten Weg, auf dem die gesendete Liste entsteht. */
  currentToolDefs(): ToolDef[] {
    return this.currentToolSet().defs;
  }

  /** Wirts- UND Anbieter-Werkzeuge als eine Menge (Spike Werkzeug-Anbieter, 2026-09-25):
   *  Anbieter werden bei jedem Aufruf frisch aus dem Plugin-Register gelesen, ihre
   *  Definitionen in der Prompt-Sprache geholt. Dieselbe Menge liefert dem Runner die Route
   *  — ein zweiter Aufbau waere eine zweite Wahrheit. */
  currentToolSet(): ToolSet {
    const lang = this.promptLang();
    return toolSet({
      related: readRetrievalApi(this.app)?.status().indexed === true,
      disabled: this.settings.toolsDisabled,
      descriptions: this.settings.toolDescriptions,
      providers: readToolProviders(this.app).map((p) => ({ id: p.id, tools: p.api.tools({ lang }) })),
    });
  }

  /** Nur die Namen — was der GUI-Smoke braucht (Pruefpunkt 17). */
  currentToolNames(): string[] {
    return this.currentToolDefs().map((d) => d.name);
  }

  /** Die Werkzeuge, wie `ask()` sie baut. Oeffentlich, weil der GUI-Smoke `edit_active_note`
   *  ueber DENSELBEN Weg ruft (Pruefpunkt 23) — ein zweiter Aufbau waere eine zweite Wahrheit. */
  buildTools(): VaultTools {
    const vaultPort: VaultPort = {
      listMarkdownPaths: () => this.app.vault.getMarkdownFiles().map((f) => f.path),
      listFolderPaths: () => this.app.vault.getAllFolders().map((f) => f.path),
      read: async (p) => {
        const f = this.app.vault.getFileByPath(p);
        if (f === null) throw new Error(`nicht gefunden: ${p}`);
        return this.app.vault.cachedRead(f);
      },
      exists: async (p) => this.app.vault.getFileByPath(p) !== null,
      create: async (p, c) => {
        await this.ensureParents(p);
        await this.app.vault.create(p, c);
      },
      append: async (p, c) => {
        const f = this.app.vault.getFileByPath(p);
        if (f === null) throw new Error(`nicht gefunden: ${p}`);
        await this.app.vault.append(f, c);
      },
      overwrite: async (p, c) => {
        const f = this.app.vault.getFileByPath(p);
        if (f === null) {
          await this.ensureParents(p);
          await this.app.vault.create(p, c);
        } else {
          await this.app.vault.modify(f, c);
        }
      },
      /** Obsidians Cache ist die Wahrheit, an der sich auch Bases und Board-Filter im
       *  Vault orientieren — wer hier selbst parst, beantwortet eine andere Frage als
       *  die, die der Nutzer sieht. `getFileCache` ist synchron und ohne Dateizugriff. */
      frontmatterOf: (p) => {
        const f = this.app.vault.getFileByPath(p);
        return f === null ? null : this.app.metadataCache.getFileCache(f)?.frontmatter ?? null;
      },
      /** `fileManager.renameFile`, NICHT `vault.rename` — nur ersteres zieht die Wikilinks
       *  der verweisenden Notizen nach. `vault.rename` verschiebt die Datei und laesst
       *  ueberall tote Links zurueck; der Unterschied ist an der Signatur nicht zu sehen
       *  und der Grund, warum der Port-Vertrag die API benennt.
       *
       *  ⚠️ Fehlende Zielordner legt `renameFile` NICHT an — entgegen der Annahme beim
       *  Entwurf. Gemessen am 2026-09-04 (GUI-Smoke 24): ein Move nach `Archiv/Tools.md`
       *  scheitert mit `ENOENT ... rename`, wenn `Archiv/` nicht existiert. Fuer das Modell
       *  ist das die schlechteste Fehlerart — die Meldung nennt einen Systemfehler, nicht
       *  die Ursache, und ein Ordner, den es gerade erfinden wollte, ist der Normalfall.
       *  Deshalb `ensureParents` davor, wie bei `create`. */
      move: async (from, to) => {
        const f = this.app.vault.getFileByPath(from);
        if (f === null) throw new Error(`nicht gefunden: ${from}`);
        await this.ensureParents(to);
        await this.app.fileManager.renameFile(f, to);
      },
      /** `fileManager.trashFile` folgt der Papierkorb-Einstellung des Vaults (System-
       *  Papierkorb, `.trash/` im Vault oder endgueltig) — `vault.delete` entscheidet
       *  das selbst und uebergeht damit, was der Nutzer eingestellt hat. */
      trash: async (p) => {
        const f = this.app.vault.getFileByPath(p);
        if (f === null) throw new Error(`nicht gefunden: ${p}`);
        await this.app.fileManager.trashFile(f);
      },
      /** Zaehlt die Notizen, die auf diese verweisen — nicht die Zahl der Links: zwei
       *  Verweise aus derselben Notiz sind eine betroffene Notiz, und das Modal sagt
       *  "N Notizen verlinken hierher". `resolvedLinks` ist Quelle → Ziel → Anzahl,
       *  gefragt ist also die Gegenrichtung, die Obsidian nicht fertig vorhaelt. */
      backlinkCount: (p) => {
        const all = this.app.metadataCache.resolvedLinks;
        let n = 0;
        for (const quelle of Object.keys(all)) {
          if (quelle !== p && (all[quelle]?.[p] ?? 0) > 0) n++;
        }
        return n;
      },
    };
    return new VaultTools(vaultPort, (req) => confirmWrite(this.app, req), {
      kodaFolder: () => this.settings.kodaFolder,
      today: () => new Date().toISOString().slice(0, 10),
      // Bewusst als Callback, nicht als Wert: zwischen Prompt-Bau und Tool-Aufruf
      // kann vault-rag deaktiviert worden sein. Der Adapter prueft dann erneut und
      // meldet Klartext, statt zu werfen.
      retrieval: () => readRetrievalApi(this.app),
      listMaxRows: () => this.settings.listNotesMaxRows,
      // Aus derselben Quelle wie die gesendete Liste — es gibt keinen zweiten Weg, auf
      // dem sie entsteht. Ebenfalls als Callback: eine Aenderung in den Einstellungen
      // wirkt damit ab dem naechsten Werkzeug-Aufruf, nicht erst im naechsten Gespraech.
      allowed: () => new Set(this.currentToolNames()),
      workspace: {
        snapshot: () => readWorkspace(this.app, VIEW_TYPE_KODA),
        linesAround: (r) => linesAround(this.app, r),
      },
      editor: editorPort(this.app),
      lang: () => this.promptLang(),
      contextFrontmatterChars: () => this.settings.contextFrontmatterChars,
      // Anbieter-Werkzeuge: Route aus derselben Menge wie die gesendete Liste, API frisch aus
      // dem Register — ein zwischenzeitlich deaktiviertes Plugin ergibt null, der Runner
      // meldet Klartext.
      provider: (name) => {
        const id = this.currentToolSet().routes.get(name);
        if (id === undefined) return null;
        return readToolProviders(this.app).find((p) => p.id === id)?.api ?? null;
      },
      confirmProvider: (preview) => confirmAction(this.app, {
        title: t("provider.confirm.title"),
        message: [preview.summary, ...(preview.paths.length > 0 ? [t("provider.confirm.paths", preview.paths.join(", "))] : [])],
        confirmLabel: t("provider.confirm.ok"),
        warning: false,
      }),
    });
  }

  /** Der Prompt, wie er beim NAECHSTEN Gespraech aussehen wird — inklusive Memory und
   *  Skills. Fuer das Ansehen-Modal (Spec E6). Ruft dieselbe `buildSystemPrompt` wie
   *  `ask()`, kein Nachbau: zwei Wege zu einem Text waeren zwei Wahrheiten. */
  async previewSystemPrompt(): Promise<string> {
    const memory = await this.readMemory();
    const { selection } = await this.readSkills();
    return buildSystemPrompt({
      lang: this.promptLang(),
      memory,
      kodaFolder: this.settings.kodaFolder,
      skills: selection,
      rulesOverride: this.settings.systemPromptOverride,
    });
  }

  private views(): KodaView[] {
    return this.app.workspace
      .getLeavesOfType(VIEW_TYPE_KODA)
      .map((l) => l.view)
      .filter((v): v is KodaView => v instanceof KodaView);
  }

  stopRun(): void {
    this.abort?.abort();
  }

  async newChat(): Promise<void> {
    if (this.busy) return;
    await this.store.startNew();
    this.chatLog = [];
    this.lastNotice = null;
    this.skillNotice = null;
    this.resetContextSelection();
    for (const v of this.views()) v.renderLog();
  }

  /** Trennschaerfe fuer llm-lab (Task-Vorschlag: der Skill-Name). Mehrere geladene Skills
   *  werden zusammengefasst statt nur den ersten zu nennen — sonst waeren zwei Aufrufe mit
   *  unterschiedlichen Zweit-Skills im Lab ununterscheidbar. Ohne Skill bleibt "chat". */
  private labFeature(selection: Selection): string {
    const names = selection.loaded.map((sk) => sk.name);
    return names.length > 0 ? names.join("+") : "chat";
  }

  /** Meldet einen LLM-Aufruf ans llm-lab, falls installiert. Fire-and-forget und darf einen
   *  Chat nie mitreissen — Muster `vault-rag/src/chat_client.ts` (`reportToLab`), hier auf
   *  Kodas turnId/promptTemplate/contextPaths erweitert (llm-lab apiVersion 4). */
  private reportToLab(input: {
    feature: string;
    model: string;
    endpointUrl: string;
    apiKey?: string;
    messages: ChatMessage[];
    result: LlmResult;
    reasoning: string;
    latencyMs: number;
    ttftMs?: number;
    turnId: string;
    promptTemplate: string;
    contextPaths: string[];
  }): void {
    try {
      const api = readLabApi(this.app);
      if (api === null) return;
      const id: unknown = api.log({
        plugin: "koda-agent",
        feature: input.feature,
        model: input.model,
        endpointUrl: input.endpointUrl,
        messages: toLabMessages(input.messages),
        content: input.result.ok ? input.result.content : input.result.partial,
        ...(input.reasoning !== "" ? { reasoning: input.reasoning } : {}),
        ...(input.result.ok && input.result.finishReason !== undefined ? { finishReason: input.result.finishReason } : {}),
        latencyMs: input.latencyMs,
        ...(input.ttftMs !== undefined ? { ttftMs: input.ttftMs } : {}),
        ...(input.result.ok ? {} : { error: describeLlmFailure(input.result) }),
        ...(input.apiKey ? { secrets: [input.apiKey] } : {}),
        ...(input.contextPaths.length > 0 ? { contextPaths: [...new Set(input.contextPaths)] } : {}),
        ...(input.promptTemplate !== "" ? { promptTemplate: input.promptTemplate } : {}),
        turnId: input.turnId,
      });
      // Vertrag: log() gibt synchron eine id zurueck — ein fremdes Plugin bekommt trotzdem
      // keinen blinden Vorschuss (Muster vault-rag).
      void Promise.resolve(id).catch(() => undefined);
    } catch { /* Telemetrie darf einen Chat nie mitreissen. */ }
  }

  async ask(question: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.lastNotice = null;
    this.abort = new AbortController();
    for (const v of this.views()) v.activity({ kind: "ask" });

    try {
      // Der Block ist ein FELD, nie Teil von content: Nutzertext bleibt unantastbar (Spec E2).
      // Innerhalb des try: currentContext() kann werfen (z. B. ein Workspace-Adapter-Fehler),
      // und ausserhalb des try bliebe busy dann haengen — derselbe Fehler wie ein Wurf im Loop.
      const userMsg: ChatMessage = { role: "user", content: question };
      const ctx = await this.currentContext(question);
      if (ctx !== null) userMsg.context = ctx;
      this.chatLog.push(userMsg);
      await this.store.appendMessages([userMsg]);
      for (const v of this.views()) v.renderLog();

      // `contextKeepChoices` aus: die Abwahl galt nur für diese eine Nachricht. Nach dem
      // Senden zurück auf den vollen Kontext — sonst wirkt eine einmalige Abwahl unbemerkt
      // weiter (Spec § E6, Default ist das Gegenteil: behalten).
      if (!this.settings.contextKeepChoices) this.resetContextSelection();

      const s = this.settings;
      const memory = await this.readMemory();
      const { selection, failed } = await this.readSkills();
      this.skillNotice = this.skillStatusText(selection, failed);
      const lang = this.promptLang();
      const system: ChatMessage = {
        role: "system",
        content: buildSystemPrompt({
          lang, memory, kodaFolder: s.kodaFolder, skills: selection,
          rulesOverride: s.systemPromptOverride,
        }),
      };
      // Fuer `gui:ask`: der Treiber liest chatLog, und dort steht der System-Prompt nicht.
      // Nur im Speicher — er traegt Memory-Zeilen und gehoert nicht auf Platte (Spec E6).
      this.lastSystemPrompt = system.content;

      // Werkzeugliste je Lauf: related_notes gibt es nur, wenn vault-rag einen Index
      // bereitstellt, dazu Abschaltung und eigene Beschreibungen aus den Einstellungen.
      // `status()` ist synchron und netzfrei — deshalb darf die Pruefung hier stehen, wo
      // ein Netzaufruf nicht vertretbar waere. Achtung: `indexed` sagt NICHTS ueber die
      // Erreichbarkeit des Embedding-Endpunkts; ein `search` kann trotzdem jederzeit
      // `offline` liefern (Spec E3/E6). Dieselbe Methode, die auch der GUI-Smoke misst —
      // kein zweiter Weg zur gesendeten Liste.
      const defs = this.currentToolDefs();

      // Client pro Lauf: der Idle-Timeout ist eine Einstellung und darf ohne
      // Plugin-Neustart wirken.
      const client = new KodaChatClient(this.transport, s.timeoutSec * 1000);

      // llm-lab-Anbindung (Task „llm-lab als Konsument anschliessen", Design §9):
      // EIN turnId je Nutzer-Handlung, durch alle Runden des Agent-Loops durchgereicht —
      // nur koda kennt diese Zusammengehoerigkeit, aus Zeitnaehe liesse sie sich nur raten.
      const turnId = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      // Derselbe stabile Regelblock, den auch `system` traegt — NICHT die ganze
      // System-Nachricht (die haengt an Memory/Skills und variiert pro Lauf; genau daran
      // ist der Vorgaenger `systemPromptHash` gescheitert, s. llm-lab CHANGELOG apiVersion 3).
      const promptTemplate = renderRules(effectiveRules(s.systemPromptOverride), { lang, folder: s.kodaFolder });
      // Pfade der per `read_note` gelesenen Notizen — Grundlage des Ordner-Filters im Lab;
      // fail-open, bewusst: bleibt sie leer, greift der Filter einfach nicht (llm-lab
      // plugin_api.ts, contextPaths-Kommentar).
      const readPaths: string[] = [];

      const llm: LoopLlm = {
        complete: (messages, onToken, onReasoning, signal, onToolCallHead) =>
          withFailover(
            this.resolver,
            (ep) => {
              const started = Date.now();
              let firstToken: number | undefined;
              let seenReasoning = "";
              const timedOnToken = (tok: string): void => { firstToken ??= Date.now(); onToken(tok); };
              const timedOnReasoning = (tok: string): void => { seenReasoning += tok; onReasoning(tok); };
              const cfg = {
                endpoint: ep.url,
                apiKey: ep.apiKey ?? "",
                model: effectiveModel(ep, s.model),
                suppressThinking: s.suppressThinking,
              };
              return client.complete(cfg, messages, defs, timedOnToken, timedOnReasoning, signal, onToolCallHead).then((r) => {
                this.reportToLab({
                  feature: this.labFeature(selection),
                  model: cfg.model,
                  endpointUrl: cfg.endpoint,
                  apiKey: ep.apiKey,
                  messages,
                  result: r,
                  reasoning: seenReasoning,
                  latencyMs: Date.now() - started,
                  ttftMs: firstToken !== undefined ? firstToken - started : undefined,
                  turnId,
                  promptTemplate,
                  contextPaths: readPaths,
                });
                return r;
              });
            },
            // Erneut versuchen NUR, wenn der Endpunkt gar nicht geantwortet hat und noch
            // KEIN Token beim Nutzer war: nach einem angefangenen Stream stuende die halbe
            // Antwort sonst ein zweites Mal in der Blase. Ein HTTP-Fehler wird nicht
            // wiederholt (der Server antwortet ja), ein Abbruch schon gar nicht.
            (r) => !r.ok && r.kind === "network" && r.partial === "",
            () => ({ ok: false, kind: "network", detail: t("error.noEndpoint"), partial: "" }),
            // Probe gruen, Chat rot: „Server aus" waere der falsche Rat (siehe withFailover).
            () => ({ ok: false, kind: "network", detail: t("error.chatBlocked"), partial: "" }),
          ),
      };

      // Stufe 2 laeuft ueber DENSELBEN Client und Failover, ohne Werkzeuge und mit
      // unterdruecktem Denken. Fehler und Abbruch werden zu null: der Loop macht dann
      // ohne Zusammenfassung weiter (Spec: kein Record ist besser als ein leerer).
      const summarize = async (messages: ChatMessage[]): Promise<string | null> => {
        // Explizites Typargument: ohne Kontext-Typ (anders als bei `llm.complete`, das
        // gegen `LoopLlm` typgeprueft wird) waehlt die Inferenz sonst die Objektform von
        // `onNoEndpoint` statt `LlmResult` — `r.content` wuerde dann nicht existieren.
        const r = await withFailover<LlmResult>(
          this.resolver,
          (ep) =>
            client.complete(
              { endpoint: ep.url, apiKey: ep.apiKey ?? "", model: effectiveModel(ep, s.model), suppressThinking: true },
              messages, [], () => {}, () => {}, this.abort?.signal ?? new AbortController().signal,
            ),
          (r) => !r.ok && r.kind === "network" && r.partial === "",
          () => ({ ok: false, kind: "network", detail: t("error.noEndpoint"), partial: "" }),
          () => ({ ok: false, kind: "network", detail: t("error.chatBlocked"), partial: "" }),
        );
        if (r.ok && r.content.trim() !== "") return r.content;
        // Ein stilles null macht Stufe 2 undiagnostizierbar — derselbe Idiom wie der
        // Append-Fehler in session.ts.
        console.warn("Koda: Zusammenfassung (Stufe 2) fehlgeschlagen", r.ok ? "empty" : r.kind, r.ok ? undefined : r.detail);
        return null;
      };
      const compaction: CompactionDeps = {
        budgetTokens: Math.floor((s.contextWindowTokens * s.compactAtPercent) / 100),
        keepToolResults: s.keepToolResults,
        overheadChars: JSON.stringify(toWireTools(defs)).length,
        summarize: s.summarizeEnabled ? summarize : null,
        summaryMaxChars: Math.floor((s.contextWindowTokens * 4 * s.summaryPercent) / 100),
        lang,
        now: () => new Date().toISOString(),
      };

      const tools = this.buildTools();

      const appended = await runAgent(
        { llm, tools, maxRounds: s.maxRounds, textFallback: s.textFallback, compaction },
        [system, ...this.chatLog],
        (tok) => { for (const v of this.views()) { v.activity({ kind: "token" }); v.streamToken(tok); } },
        (r) => { for (const v of this.views()) { v.activity({ kind: "reasoning" }); v.streamReasoning(r); } },
        (e) => {
          if (e.kind === "tool-call-head") for (const v of this.views()) v.activity({ kind: "tool-call-head", name: e.name });
          if (e.kind === "tool-start") for (const v of this.views()) {
            v.activity({ kind: "tool-start", name: e.call.name, args: e.call.arguments });
            v.toolStep(`⚙ ${e.call.name}`, e.call.arguments);
          }
          if (e.kind === "tool-end" && e.outcome.ok) {
            const path = readNotePathOf(e.call);
            if (path !== null) readPaths.push(path);
          }
          if (e.kind === "tool-end") for (const v of this.views()) v.activity({ kind: "tool-end" });
          if (e.kind === "tool-end") for (const v of this.views()) v.toolStep(
            `${e.outcome.ok ? "✓" : "✗"} ${e.call.name}`,
            e.outcome.ok ? e.outcome.content.slice(0, 400) : e.outcome.error,
          );
          if (e.kind === "error") {
            this.lastNotice = e.errorKind === "aborted"
              ? { text: t("view.stopped"), kind: "neutral" }
              : e.errorKind === "overflow"
                ? { text: t("view.overflow", e.message, s.contextWindowTokens), kind: "error" }
                : e.errorKind === "truncated"
                  ? { text: t("error.truncatedEmpty"), kind: "error" }
                  : { text: t("err.generic", e.message), kind: "error" };
          }
          if (e.kind === "final" && e.truncated) this.lastNotice = { text: t("view.truncated"), kind: "neutral" };
          if (e.kind === "round-limit") this.lastNotice = { text: t("view.roundLimit", s.maxRounds), kind: "error" };
          if (e.kind === "compaction") for (const v of this.views()) v.compactionMark(e.record);
          if (e.kind === "summarizing") for (const v of this.views()) v.activity({ kind: "summarizing" });
        },
        this.abort.signal,
      );

      this.chatLog.push(...appended);
      await this.store.appendMessages(appended);
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown error";
      this.lastNotice = { text: t("err.generic", message), kind: "error" };
    } finally {
      this.busy = false;
      this.abort = null;
      for (const v of this.views()) { v.activity({ kind: "done" }); v.renderLog(); }
    }
  }

  private async ensureParents(path: string): Promise<void> {
    const parts = path.split("/").slice(0, -1);
    let cur = "";
    for (const part of parts) {
      cur = cur === "" ? part : `${cur}/${part}`;
      if (this.app.vault.getFolderByPath(cur) === null) {
        await this.app.vault.createFolder(cur).catch(() => {});
      }
    }
  }

  private async readMemory(): Promise<string> {
    const path = `${this.settings.kodaFolder.replace(/\/+$/, "")}/Memory.md`;
    const f = this.app.vault.getFileByPath(path);
    return f === null ? "" : this.app.vault.cachedRead(f);
  }

  /** Liest <Koda-Ordner>/Skills/*.md — flach, Unterordner werden ignoriert.
   *  Der Vergleich ist case-insensitiv wie in `writePolicy`, damit ein Ordner
   *  "koda/skills" dieselbe Wirkung hat wie "Koda/Skills".
   *
   *  Der Unterordner-Name kommt zwingend aus `SKILLS_SUBFOLDER` (derselben Konstante,
   *  die `writePolicy` fuer die Bestaetigungspflicht auswertet) und nicht aus einem
   *  eigenen Literal: liefen die beiden je auseinander, laese diese Methode weiterhin
   *  aus dem alten Ordner in den System-Prompt, waehrend `writePolicy` ihn nicht mehr
   *  als bestaetigungspflichtig erkennt — ein stiller Bestaetigungs-Bypass. */
  private async readSkills(): Promise<{ selection: Selection; failed: SkillFailure[] }> {
    const dir = `${this.settings.kodaFolder.replace(/\/+$/, "")}/${SKILLS_SUBFOLDER}`;
    const prefix = `${dir.toLowerCase()}/`;
    const skills: Skill[] = [];
    const failed: SkillFailure[] = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.toLowerCase().startsWith(prefix)) continue;
      const rel = f.path.slice(dir.length + 1);
      if (rel.includes("/")) continue; // flach: keine Unterordner
      const name = rel.replace(/\.md$/i, "");
      const raw = await this.app.vault.cachedRead(f).catch(() => null);
      if (raw === null) { failed.push({ name, reason: "read-error" }); continue; }
      const r = parseSkill(name, raw);
      if (r.ok) skills.push(r.skill);
      else failed.push({ name: r.name, reason: "no-description" });
    }
    return { selection: selectSkills(skills, this.settings.skillBudgetChars), failed };
  }

  private skillStatusText(sel: Selection, failed: SkillFailure[]): string | null {
    const lines: string[] = [];
    if (sel.loaded.length > 0) lines.push(t("skills.active", sel.loaded.map((s) => s.name).join(", ")));
    if (sel.descriptionOnly.length > 0) {
      lines.push(t("skills.budget", sel.descriptionOnly.map((s) => s.name).join(", ")));
    }
    // Zwei verschiedene Ursachen, zwei verschiedene Meldungen: ein Lesefehler ist
    // kein fehlendes Frontmatter-Feld, und "keine description" waere hier schlicht falsch.
    const readErrors = failed.filter((f) => f.reason === "read-error").map((f) => f.name);
    const noDescription = failed.filter((f) => f.reason === "no-description").map((f) => f.name);
    if (readErrors.length > 0) lines.push(t("skills.readFailed", readErrors.join(", ")));
    if (noDescription.length > 0) lines.push(t("skills.failed", noDescription.join(", ")));
    return lines.length === 0 ? null : lines.join("\n");
  }
}

/** Sprach-Erkennung ueber Obsidians API. `null` heisst „hat nicht geklappt" — ausdruecklich
 *  NICHT "en". Vorher gab diese Funktion bei einem Fehler "" zurueck, woraus `pickLang`
 *  stillschweigend Englisch machte: ein verschluckter Fehler wurde so zu einer Aussage ueber
 *  die Sprache des Nutzers, und niemand konnte die beiden Faelle unterscheiden. */
function detectLang(): Lang | null {
  try {
    return pickLang(getLanguage());
  } catch (e) {
    console.warn("Koda: Spracherkennung fehlgeschlagen, bisherige Sprache bleibt", e);
    return null;
  }
}
