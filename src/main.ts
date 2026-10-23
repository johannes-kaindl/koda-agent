import { Plugin, WorkspaceLeaf, normalizePath, Notice, parseYaml, type Editor, type Menu } from "obsidian";
import "./i18n/strings";
import { getLanguage } from "obsidian";
import { pickLang, setLang, getLang, t } from "./vendor/kit/i18n";
import { resolveLang, type Lang } from "./core/lang";
import { rowModel, type EndpointConfig } from "./vendor/kit/endpoint_config";
import { loadKodaSettings } from "./core/settings-migration";
import type { EndpointStatus } from "./vendor/kit/endpoint_diagnostics";
import { realClock } from "./vendor/kit-obsidian/clock";
import { hydrateLocalEndpoints, prepareLocalEndpoints } from "./vendor/kit-obsidian/endpoint-secrets";
import { redactExchange } from "./vendor/kit-obsidian/chat-client";
import { KodaChatClient, type AnthropicTransports, type LlmResult } from "./llm/KodaChatClient";
import { probeEndpoint, probeModels } from "./core/llm/probe";
import { probeModelContextInfo } from "./core/llm/context-probe";
import { effectiveContext, type ModelContext } from "./vendor/kit/model-context";
import {
  baseSkillMode, effectiveContext as resolveContext, effectiveDisabledTools, selectEffective, skillModeLookup,
  unknownEntries, withOverlayKontext, withOverlayProvider, withOverlaySkill, withOverlayTool, type EffectiveContext, type ProviderTools,
} from "./core/abilities/resolve";
import { arbeitFrontmatter, skillModeFrontmatter, type SaveInput } from "./core/abilities/save";
import { skillTextRule } from "./core/abilities/projection";
import { latestSessionState, needsSessionRecord, sessionForNewChat } from "./core/abilities/session";
import { parseArbeit } from "./core/abilities/parse";
import { checkBaseView, parseBaseRef, type BaseRef } from "./core/abilities/base-ref";
import { removeBase, renderTables, upsertBase, withBaseTables, type BaseSnapshot } from "./core/context/bases";
import { registerKodaBasesView } from "./obsidian/bases-view";
import { emptyOverlay, emptySessionState, type Arbeit, type OnOff, type SessionState, type SkillMode } from "./core/abilities/types";
import { abilitiesViewModel, type AbilitiesVM } from "./core/abilities/panel-vm";
import { expandPathEntries, isInFolder, pathsInFolder } from "./vendor/kit/folder-scope";
import { providerToolGroups, toolRows } from "./core/prompt/view-model";
import { arbeitenDir, arbeitName, isArbeitPath, readArbeiten, writeArbeitFrontmatter } from "./obsidian/arbeiten";
import { EndpointResolver, withFailover } from "./core/llm/failover";
import { requestUrlProbe } from "./obsidian/http-probe";
import { requestUrlTransport, xhrSseTransport } from "./vendor/kit-obsidian/chat-transport";
import { createAnthropicChatTransport, createAnthropicState } from "./vendor/kit-obsidian/anthropic-transport";
import { findEndpointManager, onEndpointManagerChanged } from "./vendor/kit-obsidian/endpoint-source";
import { runAgent, type LoopLlm, type CompactionDeps } from "./core/agent/loop";
import { type ChatMessage, type ErrorRecord, type LogEntry, type SessionStateRecord } from "./core/agent/types";
import { HOST_TOOL_NAMES, toolSet, toWireTools, type ToolDef, type ToolSet } from "./core/tools/defs";
import { findToolProvider, readProviderOffers } from "./vendor/kit-obsidian/tool-providers";
import type { ProviderOffer } from "./vendor/kit/tool-provider";
import { confirmAction } from "./vendor/kit-obsidian/confirm";
import { SKILLS_SUBFOLDER } from "./core/tools/write-policy";
import { buildSystemPrompt } from "./core/prompt/build";
import { renderLocalDate } from "./core/prompt/now";
import { contextHintFromModelName, lowerContextHint } from "./vendor/kit/model-context";
import { effectiveRules, renderRules } from "./core/prompt/rules";
import { toLabMessages, describeLlmFailure, readNotePathOf } from "./core/agent/lab-trace";
import { logToLab } from "./vendor/kit-obsidian/lab-client";
import { SessionStore } from "./core/memory/session";
import { parseSkill, type Skill } from "./core/skills/skill";
import type { Selection } from "./core/skills/select";
import { CONTEXT_AUTO_K_MAX, CONTEXT_AUTO_K_MIN, CONTEXT_LINK_DEPTH_MAX, CONTEXT_LINK_DEPTH_MIN, DEFAULT_SETTINGS, type KodaSettings } from "./core/settings-types";
import { VaultTools, type VaultPort } from "./obsidian/vault-tools";
import { readRetrievalApi } from "./obsidian/retrieval";
import { readImageGenApi, readOcrApi } from "./vendor/kit-obsidian/capability-apis";
import { createImageUrlResolver } from "./obsidian/image-urls";
import { chooseImageMode, ocrResult, type ImageMode } from "./core/tools/images";
import { guessFromName } from "./vendor/kit/capabilities";
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

  /** Der Sitzungszustand an EINER Stelle (Spec Faehigkeiten § 9): gewaehlte Arbeit, Overlay dieses Gespraechs und
   *  die manuell hinzugefuegten Notizen. Wird mit dem Gespraech gespeichert (Sitzungs-Marke im JSONL). Die Werkstatt
   *  (Welle 25) haengt ihre Entscheidungen hier an. `contextOff` bleibt bewusst ausserhalb: die Abwahl gilt je
   *  Nachricht und geht nicht in die Arbeit (Spec § 5). */
  session: SessionState = emptySessionState();

  /** Die Arbeiten aus `<Koda-Ordner>/Arbeiten/`, sortiert; gepflegt von `refreshArbeiten`. */
  arbeiten: Arbeit[] = [];
  private arbeitParseInvalid = new Map<string, string[]>();
  /** Die zuletzt gelesenen Skills — fuer die synchrone Abfrage „welche Stellung hat dieser Skill“ (`load_skill`,
   *  Projektion). Aktualisiert bei jedem `readSkills()`. */
  private skillsCache: Skill[] = [];
  /** Eintraege von `kontext.notizen`, die beim letzten Anwenden auf nichts zeigten. */
  private notizenMissing: string[] = [];
  /** Gruende, aus denen die `base:` der gewaehlten Arbeit nicht geoeffnet wurde (Verweis, Datei, Ansicht) — als Hinweis im Tab. */
  private baseHints: string[] = [];
  /** Die Base, die eine Arbeit geoeffnet hat und uebernommen haben will; die Ansicht (`bases-view.ts`) liest sie und uebernimmt,
   *  sobald Obsidian Zeilen liefert. `null`, wenn keine wartet. */
  pendingBase: BaseRef | null = null;

  currentArbeit(): Arbeit | null {
    const name = this.session.arbeit;
    return name === null ? null : (this.arbeiten.find((a) => a.name === name) ?? null);
  }

  /** Was fuer die naechste Nachricht gilt: Overlay, sonst Arbeit, sonst Einstellung. EINE Stelle fuer alle
   *  Lesestellen von Modus, Tiefe, Budget und Nachbarn (Spec § 3). */
  effectiveContextNow(): EffectiveContext {
    return resolveContext(this.settings, this.currentArbeit(), this.session.overlay);
  }

  /** Der Wert ohne Overlay — gegen ihn entscheidet ein Setter, ob ein Eintrag noetig ist. */
  private contextBase(): EffectiveContext {
    return resolveContext(this.settings, this.currentArbeit(), emptyOverlay());
  }

  /** Der Modus fuer die NAECHSTE Nachricht — kein eigenes Feld mehr, sondern die Antwort auf „was gilt“.
   *  Schreiben legt einen Overlay-Eintrag an (oder nimmt ihn zurueck, wenn der Wert dem Grundwert gleicht).
   *  „Neues Gespraech" aendert ihn nicht, solange keine Arbeit gewaehlt ist (Spec § 3). */
  get contextMode(): ContextMode {
    return this.effectiveContextNow().mode;
  }
  set contextMode(m: ContextMode) {
    this.session = { ...this.session, overlay: withOverlayKontext(this.session.overlay, "modus", m, this.contextBase().mode) };
  }

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

  /** Vom Nutzer hinzugefuegte Notizen, in der Reihenfolge des Hinzufuegens (oder aus `kontext.notizen` der
   *  Arbeit aufgeloest). Liegt im Sitzungszustand und wird mit dem Gespraech gespeichert. Wirkt in den Modi Notiz
   *  und Alle Tabs; im Modus Arbeitsplatz stehen die Chips weiter da, tragen dort aber einen Hinweis statt einer
   *  Groesse (der Block schickt Zeiger, keine Inhalte — Spec E1). */
  get contextManual(): string[] {
    return this.session.manual;
  }
  set contextManual(v: string[]) {
    this.session = { ...this.session, manual: v };
  }

  /** Uebernommene Bases-Schnappschuesse — wie `contextManual` im Sitzungszustand, damit sie mit dem Gespraech zurueckkommen. „Auswahl
   *  zuruecksetzen“ und ein neues Gespraech raeumen sie ab. */
  get contextBases(): BaseSnapshot[] {
    return this.session.bases ?? [];
  }
  set contextBases(v: BaseSnapshot[]) {
    this.session = { ...this.session, bases: v };
  }

  /** `auto`: die Ansicht hat selbst uebernommen (Arbeit mit `base:`) — andere Meldung, gleicher Weg. */
  adoptContextBase(snap: BaseSnapshot, auto = false): void {
    this.contextBases = upsertBase(this.contextBases, snap);
    new Notice(auto ? t("bases.adoptedAuto", snap.viewName, String(snap.rows.length)) : t("bases.adopted", String(snap.rows.length), snap.viewName));
    const p = this.pendingBase;
    if (p !== null && p.path === snap.basePath && p.view === snap.viewName) this.pendingBase = null;
    this.syncAll();
  }

  removeContextBase(id: string): void {
    const naechste = removeBase(this.contextBases, id);
    if (naechste === this.contextBases) return;
    this.contextBases = naechste;
    for (const v of this.views()) v.syncContextPanel();
  }

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
      mode, query, activePath: snap.active?.path ?? null, k: this.effectiveContextNow().autoK,
    });
  }

  /** Regler „Nachbarn“: gilt fuer dieses Gespraech, nicht mehr dauerhaft (Spec § 3); der Default steht im Settings-Tab. */
  setContextAutoK(n: number): void {
    const geklemmt = Math.min(CONTEXT_AUTO_K_MAX, Math.max(CONTEXT_AUTO_K_MIN, Math.round(n)));
    if (geklemmt === this.effectiveContextNow().autoK) return;
    this.session = { ...this.session, overlay: withOverlayKontext(this.session.overlay, "nachbarn", geklemmt, this.contextBase().autoK) };
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
    const pfade = pathsInFolder(this.app.vault.getMarkdownFiles().map((f) => f.path), norm);
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
    if (this.contextOff.size === 0 && this.contextManual.length === 0 && this.contextBases.length === 0) return;
    this.contextOff.clear();
    this.contextManual = [];
    if (this.contextBases.length > 0) this.contextBases = [];
    for (const v of this.views()) v.syncContextPanel();
  }

  /** Speist den Kontext-Tab. Liest denselben Snapshot und dieselben Einstellungen wie
   *  `currentContext()` — es gibt keinen zweiten Weg zu dem, was angezeigt wird. */
  async contextViewModel(): Promise<PanelViewModel> {
    const s = this.settings;
    const eff = this.effectiveContextNow();
    const modus = eff.mode === "off" ? "workspace" : eff.mode;
    const snap = readWorkspace(this.app, VIEW_TYPE_KODA);
    const hits = await this.semanticHits(modus, this.contextQuery, snap);
    return buildPanelViewModel(modus, snap, this.contextOff, {
      lang: this.promptLang(),
      selectionMax: s.contextSelectionChars,
      tabsMax: s.contextTabsMax,
      frontmatterMax: s.contextFrontmatterChars,
      windowTokens: s.contextWindowTokens,
      budget: eff.budget,
      linkDepth: eff.depth,
      autoK: eff.autoK,
      hits,
      query: this.contextQuery,
      manual: this.contextManual,
      links: linkPort(this.app),
      content: contentPort(this.app),
      bases: this.contextBases,
    });
  }

  /** Regler „Tiefe“: wie `setContextAutoK` ein Wert fuer dieses Gespraech. */
  setContextLinkDepth(n: number): void {
    const geklemmt = Math.min(CONTEXT_LINK_DEPTH_MAX, Math.max(CONTEXT_LINK_DEPTH_MIN, Math.round(n)));
    if (geklemmt === this.effectiveContextNow().depth) return;
    this.session = { ...this.session, overlay: withOverlayKontext(this.session.overlay, "tiefe", geklemmt, this.contextBase().depth) };
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
    const eff = this.effectiveContextNow();
    const snap = readWorkspace(this.app, VIEW_TYPE_KODA);
    switch (eff.mode) {
      case "off":
        return null;
      case "workspace":
        return withBaseTables(
          renderWorkspaceContext(applySelection(snap, this.contextOff), {
            lang: this.promptLang(),
            selectionMax: s.contextSelectionChars,
            tabsMax: s.contextTabsMax,
            frontmatterMax: s.contextFrontmatterChars,
          }),
          renderTables(this.contextBases, eff.budget, this.promptLang()),
        );
      case "note":
      case "tabs":
      case "vault":
        return await buildFullContext({
          mode: eff.mode,
          snap,
          links: linkPort(this.app),
          content: contentPort(this.app),
          manual: this.contextManual,
          off: this.contextOff,
          linkDepth: eff.depth,
          budget: eff.budget,
          lang: this.promptLang(),
          bases: this.contextBases,
          // `query` fehlt nur beim GUI-Smoke und bei gui:ask ohne Frage — dann gilt der Entwurf.
          hits: await this.semanticHits(eff.mode, query ?? this.contextQuery, snap),
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

  // ── Arbeiten und Faehigkeiten (Spec Faehigkeiten und Arbeiten, Plan 1) ─────────────────────────────

  private isArbeitFile(path: string): boolean {
    return isArbeitPath(path, this.settings.kodaFolder);
  }

  /** Eine Datei unter `Arbeiten/` oder `Skills/` hat sich geaendert: die Arbeiten neu lesen bzw. den Skill-Cache
   *  auffrischen (das „/“-Menue und `load_skill` fragen synchron). */
  private onKodaFileChange(path: string): void {
    if (this.isArbeitFile(path)) { this.refreshArbeiten(); return; }
    if (isInFolder(path, `${this.settings.kodaFolder}/${SKILLS_SUBFOLDER}`, { ignoreCase: true })) void this.readSkills().then(() => { this.syncAll(); });
  }

  /** Zeichnet alles neu, was vom Sitzungszustand abhaengt: Modus-Dropdown, Kontext-Tab, Tab Faehigkeiten. */
  private syncAll(): void {
    for (const v of this.views()) { v.syncContextMode(); v.syncContextPanel(); v.syncAbilities(); }
  }

  /** Die Arbeiten neu lesen (Start, Aenderung einer Arbeits-Notiz). Die gewaehlte Arbeit wirkt danach mit dem
   *  neuen Inhalt ab der naechsten Frage; ihre Notizen-Liste wird erst beim erneuten Waehlen neu aufgeloest. */
  refreshArbeiten(): void {
    const { arbeiten } = readArbeiten(this.app, this.settings.kodaFolder);
    this.arbeiten = arbeiten.map((a) => a.arbeit);
    this.arbeitParseInvalid = new Map(arbeiten.map((a) => [a.arbeit.name, a.invalid]));
    this.syncAll();
  }

  /** Waehlt eine Arbeit (oder `null` = keine): das Overlay wird geleert, die Arbeit frisch angewendet, ihre
   *  `kontext.notizen` jetzt zu Einzelpfaden aufgeloest (Spec § 4). Eine fehlende Arbeit bleibt gewaehlt und
   *  meldet sich im Tab als „nicht gefunden“, statt still zu verschwinden. */
  chooseArbeit(name: string | null): void {
    const a = name === null ? null : (this.arbeiten.find((x) => x.name === name) ?? null);
    // Ordner (`/` am Ende) werden JETZT zu Einzelpfaden, ein Eintrag ohne Ziel landet in `missing` und im Tab (Spec § 4).
    // Die Aufloesung kommt aus code-kit `folder-scope`: das Bibliotheks-Gate hat eine Fassung im Plugin abgelehnt.
    const exp = a === null ? { paths: [] as string[], missing: [] as string[] } : expandPathEntries(a.kontext.notizen ?? [], this.app.vault.getMarkdownFiles().map((f) => f.path));
    this.notizenMissing = exp.missing;
    this.baseHints = [];
    this.pendingBase = null;
    this.contextOff.clear();
    this.session = { arbeit: name, overlay: emptyOverlay(), manual: exp.paths };
    this.syncAll();
    if (a !== null && a.base !== null) void this.openArbeitBase(a);
  }

  /** `base:` einer Arbeit (Plan 2): die Ansicht muss in der .base schon vom Typ „Koda-Kontext“ sein — Koda schreibt nie in eine .base
   *  des Nutzers. Stimmt alles, wird die Base geoeffnet und die Ansicht uebernimmt, sobald Obsidian Zeilen liefert (`pendingBase`);
   *  sonst steht der Grund als Hinweis im Tab und nichts wird geoeffnet. */
  private async openArbeitBase(a: Arbeit): Promise<void> {
    const gewaehlt = (): boolean => this.session.arbeit === a.name;
    const melde = (hint: string): void => { if (gewaehlt()) { this.baseHints = [hint]; this.syncAll(); } };
    const ref = parseBaseRef(a.base ?? "");
    if (ref === null) { melde(t("abilities.hint.baseInvalid")); return; }
    const file = this.app.vault.getFileByPath(ref.path);
    if (file === null) { melde(t("abilities.hint.baseNoFile", ref.path)); return; }
    let yaml: unknown = null;
    try { yaml = parseYaml(await this.app.vault.cachedRead(file)); } catch { yaml = null; }
    if (!gewaehlt()) return;
    const check = checkBaseView(yaml, ref.view);
    if (check === "missing") { melde(t("abilities.hint.baseViewMissing", ref.view, ref.path)); return; }
    if (check === "wrong-type") { melde(t("abilities.hint.baseWrongType", ref.view)); return; }
    this.pendingBase = ref;
    this.syncAll();
    // Ein schon offener Tab derselben Base wird wiederverwendet, sonst entstuende bei jedem „Neuen Gespraech“ ein weiterer.
    const offen = this.app.workspace.getLeavesOfType("bases").find((l) => (l.view as { file?: { path: string } }).file?.path === ref.path);
    if (offen !== undefined) this.app.workspace.setActiveLeaf(offen, { focus: true });
    else await this.app.workspace.openLinkText(`${ref.path}#${ref.view}`, "", "tab");
  }

  /** Eine Skill-Stellung fuer dieses Gespraech. Der Grundwert (ohne Overlay) kommt aus Arbeit und Frontmatter;
   *  steht der Schalter wieder darauf, verschwindet der Overlay-Eintrag. */
  async setSkillMode(name: string, mode: SkillMode): Promise<void> {
    const { skills } = await this.readSkills();
    const skill = skills.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (skill === undefined) return;
    this.session = { ...this.session, overlay: withOverlaySkill(this.session.overlay, skill.name, mode, baseSkillMode(skill, this.currentArbeit())) };
    this.syncAll();
  }

  setToolOn(name: string, on: boolean): void {
    const base: OnOff = this.currentArbeit()?.werkzeuge[name] ?? (this.settings.toolsDisabled.includes(name) ? "aus" : "an");
    this.session = { ...this.session, overlay: withOverlayTool(this.session.overlay, name, on ? "an" : "aus", base) };
    this.syncAll();
  }

  /** Anbieter-Schalter: „an“ heisst „wie in den Einstellungen“ (Spec § 3), der Grundwert ohne Overlay ist deshalb
   *  der der Arbeit oder „an“. */
  setProviderOn(id: string, on: boolean): void {
    const base: OnOff = this.currentArbeit()?.anbieter[id] ?? "an";
    this.session = { ...this.session, overlay: withOverlayProvider(this.session.overlay, id, on ? "an" : "aus", base) };
    this.syncAll();
  }

  /** Grundeinstellung eines Skills: schreibt ins Frontmatter der Skill-Datei (Spec § 6). Eine Handlung des Nutzers im
   *  Settings-Tab, kein Modell-Werkzeug — die Bestaetigungspflicht von `write_skill` gilt dafuer nicht. `processFrontMatter`
   *  laesst den uebrigen Frontmatter und den Body unberuehrt. */
  async setSkillDefault(name: string, mode: SkillMode): Promise<void> {
    const dir = `${this.settings.kodaFolder.replace(/\/+$/, "")}/${SKILLS_SUBFOLDER}`;
    const file = this.app.vault.getMarkdownFiles().find((f) =>
      isInFolder(f.path, dir, { recursive: false, ignoreCase: true })
      && f.path.slice(f.path.lastIndexOf("/") + 1).replace(/\.md$/i, "").toLowerCase() === name.toLowerCase());
    if (file === undefined) return;
    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
      delete fm["enabled"];
      delete fm["pinned"];
      Object.assign(fm, skillModeFrontmatter(mode));
    });
    this.syncAll();
  }

  resetOverlay(): void {
    this.session = { ...this.session, overlay: emptyOverlay() };
    this.syncAll();
  }

  /** Was der Tab als Hinweis nennt: ungueltige und unbekannte Eintraege der Arbeit, Notizen ohne Ziel — die Arbeit
   *  gilt trotzdem (CORE-DATA-01: nicht still verwerfen). */
  async arbeitHints(): Promise<string[]> {
    const name = this.session.arbeit;
    if (name === null) return [];
    const a = this.currentArbeit();
    if (a === null) return [t("abilities.hint.notFound", name)];
    const { skills } = await this.readSkills();
    const offers = readProviderOffers(this.app, this.promptLang());
    const unknown = unknownEntries(a, { skills: skills.map((x) => x.name), ownTools: [...HOST_TOOL_NAMES], providers: offers.map((o) => o.id) });
    return [
      ...(this.arbeitParseInvalid.get(a.name) ?? []).map((e) => t("abilities.hint.invalid", e)),
      ...unknown.map((e) => t("abilities.hint.unknown", e)),
      ...this.notizenMissing.map((e) => t("abilities.hint.missingNote", e)),
      ...this.baseHints,
      // Solange die Base auf ihre Zeilen wartet (oder die Ansicht nicht die genannte ist), sagt der Tab, was der Nutzer tun kann.
      ...(this.pendingBase === null ? [] : [t("abilities.hint.basePending", this.pendingBase.view)]),
    ];
  }

  /** Fremde Werkzeuge je Anbieter, wie sie wirklich montiert sind (Kollisionen mit Kodas eigenen Namen fallen
   *  heraus — ein „Anbieter aus“ darf kein eigenes Werkzeug mit abschalten). Dieselbe Gruppierung wie der Settings-Tab. */
  providerTools(offers: ProviderOffer[] = readProviderOffers(this.app, this.promptLang())): ProviderTools[] {
    return providerToolGroups({ toolsDisabled: [], toolDescriptions: {} }, offers, HOST_TOOL_NAMES)
      .groups.map((g) => ({ id: g.id, tools: g.rows.map((r) => r.name) }));
  }

  /** Speist den Tab „Fähigkeiten“: dieselben Quellen, die `ask()` liest — es gibt keinen zweiten Weg zu dem, was gilt. */
  async abilitiesViewModel(): Promise<AbilitiesVM> {
    const { skills, failed } = await this.readSkills();
    const offers = readProviderOffers(this.app, this.promptLang());
    const eigene = toolRows(
      this.settings,
      { read: this.imageMode() !== "none", generate: readImageGenApi(this.app) !== null },
    ).filter((r) => !r.unavailable).map((r) => r.name);
    return abilitiesViewModel({
      skills, failed, arbeiten: this.arbeiten.map((a) => a.name), selected: this.session.arbeit, arbeit: this.currentArbeit(),
      hints: await this.arbeitHints(), overlay: this.session.overlay, settingsDisabled: this.settings.toolsDisabled,
      ownTools: eigene, providers: this.providerTools(offers), budgetChars: this.settings.skillBudgetChars,
    });
  }

  /** Die Namen der zuletzt gelesenen Skills — synchron, fuer das „/“-Menue. Die Liste wird bei jedem `readSkills()` frisch
   *  (beim Oeffnen des Tabs, bei jeder Frage, im Settings-Tab); ein vor dem ersten Lesen geoeffnetes Menue stuende leer. */
  skillNames(): string[] {
    return this.skillsCache.map((s) => s.name);
  }

  private async saveInput(arbeit: Arbeit | null): Promise<SaveInput> {
    const { skills } = await this.readSkills();
    return {
      skills, arbeit, overlay: this.session.overlay,
      settings: this.settings, ownTools: [...HOST_TOOL_NAMES], providers: this.providerTools(), manual: this.session.manual,
    };
  }

  private findArbeitFile(name: string) {
    return this.app.vault.getMarkdownFiles().find((f) => this.isArbeitFile(f.path) && arbeitName(f.path, this.settings.kodaFolder) === name) ?? null;
  }

  /** Nach dem Schreiben gilt der Stand sofort, nicht erst wenn der metadataCache nachzieht. */
  private adoptArbeit(name: string, fm: Record<string, unknown>): void {
    const parsed = parseArbeit(name, fm);
    if (parsed === null) return;
    this.arbeiten = [...this.arbeiten.filter((a) => a.name !== name), parsed.arbeit].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    this.arbeitParseInvalid.set(name, parsed.invalid);
  }

  /** „Speichern“: der effektive Stand als Abweichung in die gewaehlte Arbeit (Spec § 5). Das ist eine Handlung
   *  des Nutzers und fragt nicht nach; der Text unter dem Frontmatter bleibt unberuehrt. */
  async saveArbeit(): Promise<boolean> {
    const a = this.currentArbeit();
    const file = a === null ? null : this.findArbeitFile(a.name);
    if (a === null || file === null) return false;
    const fm = arbeitFrontmatter(await this.saveInput(a));
    await writeArbeitFrontmatter(this.app, file, fm);
    this.adoptArbeit(a.name, fm);
    this.session = { ...this.session, overlay: emptyOverlay() };
    this.syncAll();
    return true;
  }

  /** „Als neue Arbeit …“: legt `<Koda-Ordner>/Arbeiten/<name>.md` an. `false`, wenn der Name nicht taugt oder
   *  die Datei schon existiert (Gross/klein egal) — eine bestehende Arbeit wird nie ueberschrieben. */
  async saveArbeitAs(rawName: string): Promise<boolean> {
    const name = rawName.trim().replace(/\.md$/i, "");
    if (name === "" || /[\\/:*?"<>|#^[\]]/.test(name)) return false;
    const path = `${arbeitenDir(this.settings.kodaFolder)}/${name}.md`;
    if (this.app.vault.getMarkdownFiles().some((f) => f.path.toLowerCase() === path.toLowerCase())) return false;
    await this.ensureParents(path);
    const file = await this.app.vault.create(path, "");
    const fm = arbeitFrontmatter(await this.saveInput(this.currentArbeit()));
    await writeArbeitFrontmatter(this.app, file, fm);
    this.adoptArbeit(name, fm);
    this.session = { ...this.session, arbeit: name, overlay: emptyOverlay() };
    this.syncAll();
    return true;
  }

  /** Regeln der Projektion (Skill-Hinweis statt zweitem Skill-Text); aus, wenn der Schalter es sagt. */
  projectionRules(): ReturnType<typeof skillTextRule>[] {
    if (!this.settings.skillHintInHistory) return [];
    return [skillTextRule(skillModeLookup(this.skillsCache, this.currentArbeit(), this.session.overlay))];
  }

  private abort: AbortController | null = null;
  private labMismatchWarned = false;
  private readonly transport = xhrSseTransport;
  /** Zustand der Anthropic-Transporte (Denkbloecke je Werkzeug-Aufruf, Modell-Liste): lebt mit dem Plugin, nicht mit
   *  dem Chat-Client je Lauf — die zweite Runde eines Werkzeug-Aufrufs braucht den Denkblock der ersten. Stream und
   *  Rueckfall ueber `requestUrl` teilen ihn. */
  private readonly anthropicState = createAnthropicState();
  private readonly anthropic: AnthropicTransports = {
    primary: createAnthropicChatTransport({ http: xhrSseTransport, state: this.anthropicState }),
    fallback: createAnthropicChatTransport({ http: requestUrlTransport, state: this.anthropicState }),
  };

  /** Der Manager ist Opt-in: nur mit dem Schalter, und nur wenn er installiert und an ist, sonst die lokale Liste. */
  private endpointSource(): { manager: ReturnType<typeof findEndpointManager>; choice: KodaSettings["choice"] } {
    return { manager: this.settings.useEndpointManager ? findEndpointManager(this.app) : null, choice: this.settings.choice };
  }

  /** Loest "erster erreichbarer Endpunkt" auf und merkt sich das Ergebnis fuer die Sitzung.
   *  Liest `this.settings` bei jedem Durchlauf frisch — eine im Editor geaenderte Liste
   *  wirkt dadurch ohne Neustart, sobald `saveSettings()` den Zwischenstand verwirft. */
  private readonly resolver = new EndpointResolver(
    // Die Liste liegt mit Schlüssel-IDs in den Settings; `apiKey` steht nur im Speicher
    // (Schlüsselbund). Ein noch vorhandener Klartext-Schlüssel wandert hier beim ersten
    // Auflösen in den Schlüsselbund, auch wenn der Settings-Tab nie geöffnet wird.
    () => prepareLocalEndpoints({
      app: this.app,
      pluginId: this.manifest.id,
      list: this.settings.endpoints,
      persist: (list) => {
        this.settings.endpoints = list;
        return this.saveSettings();
      },
    }),
    async (ep) => (await this.probe(ep)).reachable,
    // Der gemerkte Endpunkt hat sich geändert: der Thinking-Schalter liest sein Modell.
    () => { for (const v of this.views()) v.syncThinkAction(); },
    () => this.endpointSource(),
  );

  /** Die Zeile mit `apiKey` aus dem Schlüsselbund. Die Listen-Zeilen der Settings tragen nur
   *  die Schlüssel-ID; ohne diesen Schritt ginge die Probe ohne Authorization-Header raus. */
  private hydrated(ep: EndpointConfig): EndpointConfig {
    return hydrateLocalEndpoints(this.app, this.manifest.id, [ep])[0] ?? ep;
  }

  /** Erreichbarkeits-Probe einer Endpunkt-Zeile (Settings-Testknopf). Liegt am Plugin,
   *  weil der Failover sie spaeter ebenfalls braucht. */
  probe(ep: EndpointConfig): Promise<EndpointStatus> {
    return probeEndpoint(this.hydrated(ep), requestUrlProbe, realClock);
  }

  /** Erreichbarkeit UND Modell-Liste aus einem Aufruf (Settings-Modellauswahl). */
  probeModels(ep: EndpointConfig): Promise<{ status: EndpointStatus; models: string[] }> {
    return probeModels(this.hydrated(ep), requestUrlProbe, realClock);
  }

  /** Endpunkt|Modell, fuer die in dieser Laufzeit schon geprueft wurde — „einmal je Sitzung"
   *  heisst einmal je Plugin-Laufzeit UND Modellname, sonst meldete jede Runde der
   *  Agenten-Schleife dieselbe Notice. Der Schluessel wird VOR der Probe gesetzt: zwei
   *  Runden kurz hintereinander duerfen nicht beide fragen. */
  private contextChecked = new Set<string>();

  /** Warnt, wenn das Modell ein kleineres Kontextfenster hat als `contextWindowTokens`.
   *  Quellen: das Suffix `-ctxNNNk` im gesendeten oder vom Server gemeldeten Modellnamen und
   *  die Probe des Endpunkts. Koda WARNT nur — der Vertrag „wer bewusst kleiner einstellt,
   *  wird nicht ueberschrieben" bleibt, geschrieben wird erst auf Klick. Wirft nie: ein
   *  Hinweis darf den Chat nicht mitreissen. */
  async checkContextWindow(ep: EndpointConfig, sentModel: string, reportedModel?: string): Promise<void> {
    const key = `${ep.url}|${reportedModel ?? sentModel}`;
    if (this.contextChecked.has(key)) return;
    this.contextChecked.add(key);
    try {
      const probed = await this.probeContext(ep, sentModel).catch(() => null);
      const hint = lowerContextHint(this.settings.contextWindowTokens, [
        contextHintFromModelName(reportedModel),
        contextHintFromModelName(sentModel),
        probed,
      ]);
      if (hint === null) return;
      const current = this.settings.contextWindowTokens;
      const notice = new Notice(
        createFragment((f) => {
          f.createSpan({ text: t("context.hint", reportedModel ?? sentModel, String(hint), String(current)) });
          const btn = f.createEl("button", { text: t("context.hint.apply", String(hint)) });
          btn.addEventListener("click", () => {
            this.settings.contextWindowTokens = hint;
            void this.saveSettings();
            notice.hide();
            new Notice(t("context.hint.applied", String(hint)));
          });
        }),
        0,
      );
    } catch (e) {
      console.warn("Koda: Kontextfenster-Pruefung fehlgeschlagen", e);
    }
  }

  /** Kontextfenster laut Endpunkt (LM Studio/Ollama), sonst null. Nutzt das Modell, das fuer
   *  diese Zeile effektiv gilt. */
  probeContext(ep: EndpointConfig, model: string = rowModel(ep)): Promise<number | null> {
    return this.probeContextInfo(ep, model).then(effectiveContext);
  }
  /** Beide Laengen (geladen, hoechstens) — die Endpunkt-Liste zeigt beide unter der Zeile. */
  probeContextInfo(ep: EndpointConfig, model: string = rowModel(ep)): Promise<ModelContext | null> {
    return probeModelContextInfo(this.hydrated(ep), model, requestUrlProbe, realClock);
  }
  private store!: SessionStore;

  async onload(): Promise<void> {
    const loaded = loadKodaSettings(await this.loadData());
    this.settings = loaded.settings;
    // Das globale Modell-Feld ist weg: sein Wert ist einmal in die Zeilen gewandert, der
    // Schlüssel fliegt beim Speichern aus data.json (sonst liefe die Migration bei jedem Start).
    if (loaded.changed) await this.saveData(this.settings);
    // Der Manager kann jederzeit installiert, an- oder ausgeschaltet oder umkonfiguriert werden: dann neu aufloesen.
    this.register(onEndpointManagerChanged(this.app, () => {
      this.resolver.invalidate();
      for (const v of this.views()) v.syncThinkAction();
    }));
    // Ein gespeicherter Default aus einer spaeteren Etappe ist hier noch nicht angeboten — dann faellt der Start
    // auf Arbeitsplatz zurueck, statt den Chat in einem Modus zu starten, den er gar nicht anbietet.
    if (!AVAILABLE_MODES.includes(this.contextMode)) this.contextMode = "workspace";
    // Erst wenn alle Plugins geladen sind, ist die Frage „gibt es vault-rag?" beantwortbar.
    // Ein gespeicherter Default „vault" ohne vault-rag faellt dann auf Arbeitsplatz zurueck,
    // und die Dropdowns bekommen ihre Sperre (sie wurden womoeglich vor vault-rag gebaut).
    this.app.workspace.onLayoutReady(() => {
      if (this.contextMode === "vault" && !this.vaultAvailable()) this.contextMode = "workspace";
      // Erst jetzt steht der metadataCache: die Arbeiten lesen und mit ihnen das Gespraech wiederherstellen.
      this.refreshArbeiten();
      void this.readSkills();
    });
    this.registerEvent(this.app.vault.on("delete", (file) => { this.onKodaFileChange(file.path); }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => { this.onKodaFileChange(file.path); this.onKodaFileChange(oldPath); }));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => { this.onKodaFileChange(file.path); }));
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
    // Arbeit und Overlay gehoeren zum Gespraech (Spec § 3): die juengste Sitzungs-Marke stellt sie her. Eine
    // Marke aus einer Sitzung vor den Arbeiten gibt es nicht — dann beginnt der Zustand leer.
    const restored = latestSessionState(this.chatLog);
    if (restored !== null) this.session = restored;

    this.registerView(VIEW_TYPE_KODA, (leaf) => new KodaView(leaf, this));
    registerKodaBasesView(this, { adopt: (snap, auto) => { this.adoptContextBase(snap, auto); }, pending: () => this.pendingBase });
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
    this.addCommand({ id: "tab-abilities", name: t("cmd.tabAbilities"), callback: () => { void this.runInView((v) => { v.setTab("abilities"); return Promise.resolve(); }); } });
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
  promptLang(): Lang {
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
      projectForModel(this.chatLog, this.projectionRules()),
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
    const providers = readProviderOffers(this.app, lang);
    const opts = {
      readImage: this.imageMode() !== "none",
      generateImage: readImageGenApi(this.app) !== null,
      descriptions: this.settings.toolDescriptions,
      providers,
    };
    // Abgeschaltet ist, was die Einstellungen, die gewaehlte Arbeit und das Overlay dieses Gespraechs zusammen sagen.
    const disabled = effectiveDisabledTools(
      this.settings.toolsDisabled, [...HOST_TOOL_NAMES], this.providerTools(providers), this.currentArbeit(), this.session.overlay,
    );
    return toolSet({ ...opts, disabled });
  }

  /** Das Modell, über das der Chat tatsächlich sendet (aufgelöster Endpunkt, davor die erste
   *  Zeile). Es gibt kein globales Modell-Feld mehr. */
  sentModel(): string {
    return this.resolver.peek(this.settings.endpoints);
  }

  /** Backend des gemerkten Endpunkts (`"anthropic"` bei Claude); vor der ersten Aufloesung `unknown`. */
  sentBackend(): string {
    return this.resolver.peekTransport().backend;
  }

  /** Der Text zu „kein Endpunkt“: beim Manager nennt er den Grund des Managers, sonst die lokale Liste. */
  private noEndpointText(): string {
    const reason = this.resolver.failure();
    return reason === null ? t("error.noEndpoint") : t(`error.manager.${reason}`);
  }

  /** Wie Koda ein Bild liest: Vision (Namens-Heuristik des Kits, `likely` genuegt), sonst OCR,
   *  wenn image-to-markdown aktiv ist. Das Modell ist das gesendete (`sentModel()`) — dasselbe
   *  wie beim Thinking-Schalter. */
  imageMode(): ImageMode {
    return chooseImageMode(guessFromName(this.sentModel()).vision, readOcrApi(this.app) !== null);
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
      listOtherReadablePaths: () => this.app.vault.getFiles().filter((f) => f.extension === "base" || f.extension === "canvas").map((f) => f.path),
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
      today: () => renderLocalDate(realClock.now()),
      now: () => realClock.now(),
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
      openNote: (linktext) => this.app.workspace.openLinkText(linktext, "", false),
      lang: () => this.promptLang(),
      contextFrontmatterChars: () => this.settings.contextFrontmatterChars,
      // Anbieter-Werkzeuge: Route aus derselben Menge wie die gesendete Liste, API frisch aus
      // dem Register — ein zwischenzeitlich deaktiviertes Plugin ergibt null, der Runner
      // meldet Klartext.
      provider: (name) => {
        const id = this.currentToolSet().routes.get(name);
        if (id === undefined) return null;
        return findToolProvider(this.app, id);
      },
      skillMode: (name) => skillModeLookup(this.skillsCache, this.currentArbeit(), this.session.overlay)(name),
      imageMode: () => this.imageMode(),
      ocr: () => readOcrApi(this.app),
      imageGen: () => readImageGenApi(this.app),
      imageSize: (p) => this.app.vault.getFileByPath(p)?.stat.size ?? null,
      imageMaxKb: () => this.settings.imageMaxKb,
      confirmImage: (req) => confirmAction(this.app, {
        title: t("image.confirm.title"),
        message: [t("image.confirm.prompt", req.prompt), t("image.confirm.folder", req.folder === "" ? "/" : req.folder)],
        confirmLabel: t("image.confirm.ok"),
        warning: false,
      }),
      confirmProvider: (preview) => confirmAction(this.app, {
        title: t("provider.confirm.title"),
        message: [
          preview.summary,
          ...(preview.paths.length > 0 ? [t("provider.confirm.paths", preview.paths.join(", "))] : []),
          ...((preview.outside ?? []).length > 0 ? [t("provider.confirm.outside", (preview.outside ?? []).join("; "))] : []),
        ],
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
      now: realClock.now(),
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
    // Mit Arbeit bleibt sie und wird frisch angewendet; ohne Arbeit ueberlebt nur der Kontext-Teil des Overlays,
    // wie heute der Modus (Spec § 3).
    this.session = sessionForNewChat(this.session);
    this.resetContextSelection();
    if (this.session.arbeit !== null) this.chooseArbeit(this.session.arbeit);
    this.syncAll();
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
      // `logToLab` wirft nie und faengt eine Promise ab, die ein fremdes Plugin entgegen dem
      // Vertrag zurueckgibt (Kit lab-client). Telemetrie darf einen Chat nie mitreissen.
      // Das Log entspricht dem Draht (Master-Entscheidung Welle 15): das Modell sah Platzhalter
      // statt Geheimnissen, das Lab bekommt dieselben. Der Client gibt dem Loop die Originale
      // zurueck, also werden Verlauf, Antwort und Denkspur hier in EINER Sitzung geschwaerzt —
      // derselbe Wert traegt ueberall denselben Platzhalter.
      const answer = input.result.ok ? input.result.content : input.result.partial;
      const wire = redactExchange({ messages: toLabMessages(input.messages), answer, reasoning: input.reasoning });
      const out = logToLab(this.app, {
        plugin: "koda-agent",
        feature: input.feature,
        model: input.model,
        endpointUrl: input.endpointUrl,
        messages: wire.messages,
        content: wire.answer,
        ...(input.reasoning !== "" && wire.reasoning !== null ? { reasoning: wire.reasoning } : {}),
        ...(input.result.ok && input.result.finishReason !== undefined ? { finishReason: input.result.finishReason } : {}),
        latencyMs: input.latencyMs,
        ...(input.ttftMs !== undefined ? { ttftMs: input.ttftMs } : {}),
        ...(input.result.ok ? {} : { error: describeLlmFailure(input.result) }),
        ...(input.apiKey ? { secrets: [input.apiKey] } : {}),
        ...(input.contextPaths.length > 0 ? { contextPaths: [...new Set(input.contextPaths)] } : {}),
        ...(input.promptTemplate !== "" ? { promptTemplate: input.promptTemplate } : {}),
        turnId: input.turnId,
      });
      // Ein Lab mit anderer Vertragsversion sah bisher aus wie „kein Lab installiert": einmal je
      // Sitzung melden, sonst bleibt die Aufzeichnung still aus (vault-rag: 22 Tage unbemerkt).
      if (!out.ok && out.reason === "version-mismatch" && !this.labMismatchWarned) {
        this.labMismatchWarned = true;
        console.warn(`Koda: ${out.detail} — Aufrufe werden nicht aufgezeichnet.`);
      }
    } catch { /* Telemetrie darf einen Chat nie mitreissen — auch nicht, wenn der Aufbau der Felder wirft. */ }
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
      // Der Sitzungszustand geht mit der Frage in den Verlauf, wenn er sich geaendert hat — nie ans Modell,
      // aber ein Neustart stellt Arbeit und Overlay daraus wieder her (Spec § 3).
      const toAppend: LogEntry[] = [];
      if (needsSessionRecord(this.chatLog, this.session)) {
        const rec: SessionStateRecord = { kind: "session", at: new Date().toISOString(), state: JSON.parse(JSON.stringify(this.session)) as SessionState };
        toAppend.push(rec);
      }
      toAppend.push(userMsg);
      this.chatLog.push(...toAppend);
      await this.store.appendMessages(toAppend);
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
          rulesOverride: s.systemPromptOverride, now: realClock.now(),
        }),
      };
      // Fuer `gui:ask`: der Treiber liest chatLog, und dort steht der System-Prompt nicht.
      // Nur im Speicher — er traegt Memory-Zeilen und gehoert nicht auf Platte (Spec E6).
      this.lastSystemPrompt = system.content;

      // Werkzeugliste je Lauf: Wirts-Werkzeuge plus die montierten Anbieter-Werkzeuge (`related_notes`
      // kommt von vault-rag), dazu Abschaltung und eigene Beschreibungen aus den Einstellungen.
      // Dieselbe Methode, die auch der GUI-Smoke misst — kein zweiter Weg zur gesendeten Liste.
      const defs = this.currentToolDefs();

      // Client pro Lauf: der Idle-Timeout ist eine Einstellung und darf ohne
      // Plugin-Neustart wirken.
      const client = new KodaChatClient(this.transport, s.timeoutSec * 1000, realClock, this.anthropic);

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

      const imageUrls = createImageUrlResolver(this.app, () => s.imageMaxKb);
      const llm: LoopLlm = {
        complete: async (messages, onToken, onReasoning, signal, onToolCallHead, onContentReset) => {
          const urls = await imageUrls(messages);
          return withFailover(
            this.resolver,
            (resolved) => {
              const ep = resolved.config;
              const started = Date.now();
              let firstToken: number | undefined;
              let seenReasoning = "";
              const timedOnToken = (tok: string): void => { firstToken ??= Date.now(); onToken(tok); };
              const timedOnReasoning = (tok: string): void => { seenReasoning += tok; onReasoning(tok); };
              const cfg = {
                endpoint: ep.url,
                apiKey: ep.apiKey ?? "",
                model: resolved.model,
                suppressThinking: s.suppressThinking,
                transport: resolved.transport,
                family: resolved.family,
              };
              return client.complete(cfg, messages, defs, timedOnToken, timedOnReasoning, signal, onToolCallHead, urls, onContentReset).then((r) => {
                // Die Probe fragt `GET /v1/models` mit Bearer — bei der Messages-API von Anthropic sinnlos (anderer Header).
                if (resolved.transport !== "anthropic") void this.checkContextWindow(ep, cfg.model, r.ok ? r.model : undefined);
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
            () => ({ ok: false, kind: "network", detail: this.noEndpointText(), partial: "" }),
            // Probe gruen, Chat rot: „Server aus" waere der falsche Rat (siehe withFailover).
            () => ({ ok: false, kind: "network", detail: this.resolver.peekTransport().transport === "anthropic" ? t("error.anthropicUnreachable") : t("error.chatBlocked"), partial: "" }),
          );
        },
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
          (resolved) =>
            client.complete(
              { endpoint: resolved.config.url, apiKey: resolved.config.apiKey ?? "", model: resolved.model, suppressThinking: true, transport: resolved.transport, family: resolved.family },
              messages, [], () => {}, () => {}, this.abort?.signal ?? new AbortController().signal,
            ),
          (r) => !r.ok && r.kind === "network" && r.partial === "",
          () => ({ ok: false, kind: "network", detail: this.noEndpointText(), partial: "" }),
          () => ({ ok: false, kind: "network", detail: this.resolver.peekTransport().transport === "anthropic" ? t("error.anthropicUnreachable") : t("error.chatBlocked"), partial: "" }),
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
      let failure: string | null = null;

      const appended = await runAgent(
        {
          llm, tools, maxRounds: s.maxRounds, textFallback: s.textFallback, compaction,
          projectionRules: () => this.projectionRules(),
          // Nur mit aktivem OCR-Anbieter: ein Vision-Aufruf, den der Server mit HTTP-Fehler
          // quittiert, faellt auf den Text im Bild zurueck. Frisch gelesen — der Anbieter
          // kann waehrend des Laufs weg sein, dann scheitert die Texterkennung mit Klartext.
          ...(readOcrApi(this.app) === null ? {} : {
            ocrFallback: async (path: string) => {
              const api = readOcrApi(this.app);
              if (api === null) return { ok: false as const, error: "Texterkennung nicht verfügbar" };
              return ocrResult(api, path, "vision-failed");
            },
          }),
        },
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
            // Ein echter Fehler wandert als Marke in den Verlauf (unten, hinter die Antworten
            // dieses Laufs), nicht in den flüchtigen lastNotice: sonst bliebe nach dem
            // nächsten Versuch nur die Frage stehen, ohne Grund.
            if (e.errorKind === "aborted") this.lastNotice = { text: t("view.stopped"), kind: "neutral" };
            else failure = e.errorKind === "overflow"
              ? t("view.overflow", e.message, s.contextWindowTokens)
              : e.errorKind === "truncated"
                ? t("error.truncatedEmpty")
                : t("err.generic", e.message);
          }
          if (e.kind === "final" && e.truncated) this.lastNotice = { text: t("view.truncated"), kind: "neutral" };
          if (e.kind === "round-limit") this.lastNotice = { text: t("view.roundLimit", s.maxRounds), kind: "error" };
          if (e.kind === "compaction") for (const v of this.views()) v.compactionMark(e.record);
          if (e.kind === "summarizing") for (const v of this.views()) v.activity({ kind: "summarizing" });
          if (e.kind === "vision-fallback") this.lastNotice = { text: t("view.visionFallback", e.paths.join(", ")), kind: "neutral" };
        },
        this.abort.signal,
        () => { for (const v of this.views()) v.resetStreamContent(); },
      );

      // `saveThinking` aus: das Denken verschwindet mit dem Antwortende (Anzeige-Feld, nie am Draht).
      const toStore = s.saveThinking ? appended : appended.map((e) => {
        if ("thinking" in e) { const { thinking: _gone, ...rest } = e; return rest; }
        return e;
      });
      this.chatLog.push(...toStore);
      await this.store.appendMessages(toStore);
      if (failure !== null) await this.recordFailure(failure);
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown error";
      await this.recordFailure(t("err.generic", message));
    } finally {
      this.busy = false;
      this.abort = null;
      for (const v of this.views()) { v.activity({ kind: "done" }); v.renderLog(); }
    }
  }

  /** Gescheiterter Versuch: Marke in Verlauf und JSONL, damit die Frage nicht ohne Grund
   *  stehen bleibt (Reload, nächster Versuch). */
  private async recordFailure(text: string): Promise<void> {
    const rec: ErrorRecord = { kind: "error", at: new Date().toISOString(), text };
    this.chatLog.push(rec);
    await this.store.appendMessages([rec]);
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
  async readSkills(): Promise<{ skills: Skill[]; selection: Selection; failed: SkillFailure[] }> {
    const dir = `${this.settings.kodaFolder.replace(/\/+$/, "")}/${SKILLS_SUBFOLDER}`;
    const skills: Skill[] = [];
    const failed: SkillFailure[] = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      // Flach (keine Unterordner), Gross/klein egal — Ordnerzugehoerigkeit aus code-kit `folder-scope`.
      if (!isInFolder(f.path, dir, { recursive: false, ignoreCase: true })) continue;
      const name = f.path.slice(f.path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
      const raw = await this.app.vault.cachedRead(f).catch(() => null);
      if (raw === null) { failed.push({ name, reason: "read-error" }); continue; }
      const r = parseSkill(name, raw);
      if (r.ok) skills.push(r.skill);
      else failed.push({ name: r.name, reason: "no-description" });
    }
    this.skillsCache = skills;
    // Die Stellungen aus Overlay, Arbeit und Frontmatter (Spec § 3) — ohne beides dasselbe wie das alte `selectSkills`.
    return { skills, selection: selectEffective(skills, this.currentArbeit(), this.session.overlay, this.settings.skillBudgetChars), failed };
  }

  private skillStatusText(sel: Selection, failed: SkillFailure[]): string | null {
    const lines: string[] = [];
    if (sel.loaded.length > 0) lines.push(t("skills.active", sel.loaded.map((s) => s.name).join(", ")));
    if (sel.descriptionOnly.length > 0) {
      // Ohne Pin laedt KEIN Skill voll — das muss sichtbar sein, nicht zu erraten (0.20.0
      // hat den Standard von „alles voll" auf „nichts voll" gedreht).
      lines.push(t(sel.loaded.length === 0 ? "skills.nonePinned" : "skills.onDemand", String(sel.descriptionOnly.length)));
    }
    // Pin gewinnt ueber Budget: geladen wird trotzdem, aber der Ueberhang wird genannt.
    if (sel.overBudget > 0) lines.push(t("skills.overBudget", String(sel.overBudget)));
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
