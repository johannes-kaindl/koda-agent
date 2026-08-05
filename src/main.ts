import { Plugin, WorkspaceLeaf, normalizePath } from "obsidian";
import "./i18n/strings";
import { getLanguage } from "obsidian";
import { pickLang, setLang, t } from "./vendor/kit/i18n";
import { effectiveModel } from "./vendor/kit/endpoint_config";
import { KodaChatClient } from "./llm/KodaChatClient";
import { XhrSseTransport } from "./llm/XhrSseTransport";
import { runAgent, type LoopLlm } from "./core/agent/loop";
import type { ChatMessage } from "./core/agent/types";
import { TOOL_DEFS } from "./core/tools/defs";
import { buildSystemPrompt } from "./core/memory/memory";
import { SessionStore } from "./core/memory/session";
import { DEFAULT_SETTINGS, mergeKodaSettings, type KodaSettings } from "./core/settings-types";
import { VaultTools, type VaultPort } from "./obsidian/vault-tools";
import { confirmWrite } from "./obsidian/confirm-write";
import { KodaView, VIEW_TYPE_KODA } from "./obsidian/view";
import { KodaSettingsTab } from "./obsidian/settings";

export default class KodaPlugin extends Plugin {
  settings: KodaSettings = DEFAULT_SETTINGS;
  chatLog: ChatMessage[] = [];
  busy = false;
  private abort: AbortController | null = null;
  private client = new KodaChatClient(new XhrSseTransport());
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
    await this.store.startNew();
    this.chatLog = [];
    for (const v of this.views()) v.renderLog();
  }

  async ask(question: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.abort = new AbortController();

    const userMsg: ChatMessage = { role: "user", content: question };
    this.chatLog.push(userMsg);
    await this.store.appendMessages([userMsg]);
    for (const v of this.views()) v.renderLog();

    const s = this.settings;
    const endpoint = s.endpoints[0] ?? { url: "" };
    const memory = await this.readMemory();
    const lang = s.language === "auto" ? pickLang(safeGetLanguage()) : s.language;
    const system: ChatMessage = {
      role: "system",
      content: buildSystemPrompt({ lang, memory, kodaFolder: s.kodaFolder }),
    };

    const llm: LoopLlm = {
      complete: (messages, onToken, onReasoning, signal) =>
        this.client.complete(
          {
            endpoint: endpoint.url,
            apiKey: endpoint.apiKey ?? "",
            model: effectiveModel(endpoint, s.model),
            suppressThinking: s.suppressThinking,
          },
          messages, TOOL_DEFS, onToken, onReasoning, signal,
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
        if (e.kind === "error") for (const v of this.views()) v.showNotice(t("err.generic", e.message));
        if (e.kind === "round-limit") for (const v of this.views()) v.showNotice(t("view.roundLimit", s.maxRounds));
      },
      this.abort.signal,
    );

    this.chatLog.push(...appended);
    await this.store.appendMessages(appended);
    this.busy = false;
    this.abort = null;
    for (const v of this.views()) v.renderLog();
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
}

function safeGetLanguage(): string {
  try {
    return getLanguage();
  } catch {
    return "";
  }
}
