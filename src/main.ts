import { Plugin, WorkspaceLeaf, normalizePath } from "obsidian";
import "./i18n/strings";
import { getLanguage } from "obsidian";
import { pickLang, setLang, t } from "./vendor/kit/i18n";
import { effectiveModel, type EndpointConfig } from "./vendor/kit/endpoint_config";
import type { EndpointStatus } from "./vendor/kit/endpoint_diagnostics";
import { realClock } from "./vendor/kit-obsidian/clock";
import { KodaChatClient } from "./llm/KodaChatClient";
import { probeEndpoint, probeModels } from "./core/llm/probe";
import { EndpointResolver, withFailover } from "./core/llm/failover";
import { requestUrlProbe } from "./obsidian/http-probe";
import { XhrSseTransport } from "./llm/XhrSseTransport";
import { runAgent, type LoopLlm } from "./core/agent/loop";
import type { ChatMessage } from "./core/agent/types";
import { toolDefs } from "./core/tools/defs";
import { SKILLS_SUBFOLDER } from "./core/tools/write-policy";
import { buildSystemPrompt } from "./core/memory/memory";
import { SessionStore } from "./core/memory/session";
import { parseSkill, type Skill } from "./core/skills/skill";
import { selectSkills, type Selection } from "./core/skills/select";
import { DEFAULT_SETTINGS, mergeKodaSettings, type KodaSettings } from "./core/settings-types";
import { VaultTools, type VaultPort } from "./obsidian/vault-tools";
import { readRetrievalApi } from "./obsidian/retrieval";
import { confirmWrite } from "./obsidian/confirm-write";
import { KodaView, VIEW_TYPE_KODA } from "./obsidian/view";
import { KodaSettingsTab } from "./obsidian/settings";

/** Eine Skill-Datei, die NICHT in die Auswahl kam — mit Ursache statt Sammelbegriff:
 *  "read-error" (Datei liess sich nicht lesen) und "no-description" (Frontmatter ohne
 *  description) brauchen unterschiedliche Meldungen, siehe `skillStatusText`. */
interface SkillFailure {
  name: string;
  reason: "read-error" | "no-description";
}

export default class KodaPlugin extends Plugin {
  settings: KodaSettings = DEFAULT_SETTINGS;
  chatLog: ChatMessage[] = [];
  busy = false;
  /** Transiente Notiz (Fehler/Abbruch/Rundenlimit) als Plugin-State statt DOM-Append —
   *  renderLog() zeichnet sie am Ende neu; ein Voll-Redraw kann sie sonst sofort wieder loeschen. */
  lastNotice: { text: string; kind: "error" | "neutral" } | null = null;
  /** Ladezustand der Skills — eigener Slot NEBEN lastNotice und oberhalb des Verlaufs
   *  gezeichnet. Ueber lastNotice zu laufen hiesse, dass jeder Fehler im selben Turn
   *  die Zeile ueberschreibt: sie waere genau dann weg, wenn etwas schiefgeht. */
  skillNotice: string | null = null;
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
  private store!: SessionStore;

  async onload(): Promise<void> {
    this.settings = mergeKodaSettings(await this.loadData());
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
    this.addSettingTab(new KodaSettingsTab(this.app, this));

    if (this.settings.openOnStartup) {
      this.app.workspace.onLayoutReady(() => void this.activateView());
    }
  }

  applyLanguage(): void {
    const raw = this.settings.language;
    setLang(raw === "auto" ? pickLang(safeGetLanguage()) : raw);
  }

  private async ensureDir(dir: string): Promise<void> {
    if (!(await this.app.vault.adapter.exists(dir))) await this.app.vault.adapter.mkdir(dir);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.applyLanguage();
    // Eine geaenderte Liste macht den gemerkten Endpunkt zu einer Aussage ueber die alte.
    this.resolver.invalidate();
  }

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_KODA)[0];
    const leaf: WorkspaceLeaf | null = existing ?? this.app.workspace.getRightLeaf(false);
    if (leaf === null) return;
    await leaf.setViewState({ type: VIEW_TYPE_KODA, active: true });
    await this.app.workspace.revealLeaf(leaf);
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

    const userMsg: ChatMessage = { role: "user", content: question };
    this.chatLog.push(userMsg);
    await this.store.appendMessages([userMsg]);
    for (const v of this.views()) v.renderLog();

    try {
      const s = this.settings;
      const memory = await this.readMemory();
      const { selection, failed } = await this.readSkills();
      this.skillNotice = this.skillStatusText(selection, failed);
      const lang = s.language === "auto" ? pickLang(safeGetLanguage()) : s.language;
      const system: ChatMessage = {
        role: "system",
        content: buildSystemPrompt({ lang, memory, kodaFolder: s.kodaFolder, skills: selection }),
      };

      // Werkzeugliste je Lauf: related_notes gibt es nur, wenn vault-rag einen Index
      // bereitstellt. `status()` ist synchron und netzfrei — deshalb darf die Pruefung
      // hier stehen, wo ein Netzaufruf nicht vertretbar waere. Achtung: `indexed` sagt
      // NICHTS ueber die Erreichbarkeit des Embedding-Endpunkts; ein `search` kann
      // trotzdem jederzeit `offline` liefern (Spec E3/E6).
      const defs = toolDefs({ related: readRetrievalApi(this.app)?.status().indexed === true });

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
          ),
      };
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
      };
      const tools = new VaultTools(vaultPort, (req) => confirmWrite(this.app, req), {
        kodaFolder: () => this.settings.kodaFolder,
        today: () => new Date().toISOString().slice(0, 10),
        // Bewusst als Callback, nicht als Wert: zwischen Prompt-Bau und Tool-Aufruf
        // kann vault-rag deaktiviert worden sein. Der Adapter prueft dann erneut und
        // meldet Klartext, statt zu werfen.
        retrieval: () => readRetrievalApi(this.app),
      });

      const appended = await runAgent(
        { llm, tools, maxRounds: s.maxRounds, textFallback: s.textFallback },
        [system, ...this.chatLog],
        (tok) => { for (const v of this.views()) v.streamToken(tok); },
        (r) => { for (const v of this.views()) v.streamReasoning(r); },
        (e) => {
          if (e.kind === "tool-start") for (const v of this.views()) v.toolStep(`⚙ ${e.call.name}`, e.call.arguments);
          if (e.kind === "tool-end") for (const v of this.views()) v.toolStep(
            `${e.outcome.ok ? "✓" : "✗"} ${e.call.name}`,
            e.outcome.ok ? e.outcome.content.slice(0, 400) : e.outcome.error,
          );
          if (e.kind === "error") {
            this.lastNotice = e.errorKind === "aborted"
              ? { text: t("view.stopped"), kind: "neutral" }
              : { text: t("err.generic", e.message), kind: "error" };
          }
          if (e.kind === "round-limit") this.lastNotice = { text: t("view.roundLimit", s.maxRounds), kind: "error" };
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
      for (const v of this.views()) v.renderLog();
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

function safeGetLanguage(): string {
  try {
    return getLanguage();
  } catch {
    return "";
  }
}
