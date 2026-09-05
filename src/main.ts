import { Plugin, WorkspaceLeaf, normalizePath, type Editor, type Menu } from "obsidian";
import "./i18n/strings";
import { getLanguage } from "obsidian";
import { pickLang, setLang, getLang, t } from "./vendor/kit/i18n";
import { resolveLang, type Lang } from "./core/lang";
import { effectiveModel, type EndpointConfig } from "./vendor/kit/endpoint_config";
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
import { toolDefs, toWireTools, type ToolDef } from "./core/tools/defs";
import { SKILLS_SUBFOLDER } from "./core/tools/write-policy";
import { buildSystemPrompt } from "./core/prompt/build";
import { SessionStore } from "./core/memory/session";
import { parseSkill, type Skill } from "./core/skills/skill";
import { selectSkills, type Selection } from "./core/skills/select";
import { DEFAULT_SETTINGS, validateKodaSettings, type KodaSettings } from "./core/settings-types";
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
import { editorPort, linesAround, readWorkspace } from "./obsidian/workspace";

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

  setContextMode(mode: ContextMode): void {
    if (!AVAILABLE_MODES.includes(mode)) return;
    this.contextMode = mode;
    for (const v of this.views()) v.syncContextMode();
  }

  /** Der Kontext, der mit der naechsten Nachricht geht — `ask()` ruft DIESE Methode, der
   *  GUI-Smoke misst sie: es gibt keinen zweiten Weg, auf dem der Block entsteht. */
  currentContext(): ContextAttachment | null {
    if (this.contextMode === "off") return null;
    const s = this.settings;
    return renderWorkspaceContext(readWorkspace(this.app, VIEW_TYPE_KODA), {
      lang: this.promptLang(),
      selectionMax: s.contextSelectionChars,
      tabsMax: s.contextTabsMax,
      frontmatterMax: s.contextFrontmatterChars,
    });
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
    return toolDefs({
      related: readRetrievalApi(this.app)?.status().indexed === true,
      disabled: this.settings.toolsDisabled,
      descriptions: this.settings.toolDescriptions,
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
    for (const v of this.views()) v.renderLog();
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
      const ctx = this.currentContext();
      if (ctx !== null) userMsg.context = ctx;
      this.chatLog.push(userMsg);
      await this.store.appendMessages([userMsg]);
      for (const v of this.views()) v.renderLog();

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
      const llm: LoopLlm = {
        complete: (messages, onToken, onReasoning, signal) =>
          withFailover(
            this.resolver,
            (ep) =>
              client.complete(
                {
                  endpoint: ep.url,
                  apiKey: ep.apiKey ?? "",
                  model: effectiveModel(ep, s.model),
                  suppressThinking: s.suppressThinking,
                },
                messages, defs, onToken, onReasoning, signal,
              ),
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
          if (e.kind === "tool-start") for (const v of this.views()) {
            v.activity({ kind: "tool-start", name: e.call.name, args: e.call.arguments });
            v.toolStep(`⚙ ${e.call.name}`, e.call.arguments);
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
                : { text: t("err.generic", e.message), kind: "error" };
          }
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
