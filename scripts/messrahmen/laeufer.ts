/* Läufer des Messrahmens: eine Aufgabe einmal durch Kodas echten Agent-Loop (`runAgent`), mit den echten Werkzeugen
   (`VaultTools`, TaskNotes-Adapter), dem echten Systemprompt (`buildSystemPrompt`) und dem echten Chat-Client
   (`KodaChatClient`, Temperatur und max_tokens wie im Betrieb). Ersetzt sind nur die Ränder, die Obsidian gehören: der Vault
   (Speicher-Vault hinter `VaultPort`), der Transport (fetch statt XHR), die Bestätigung (automatisch ja, gezählt) und die Uhr
   (fest). Die Verdrahtung folgt `ask()` in src/main.ts; was dort anders ist (Failover, Bilder, llm-lab, Arbeit und Overlay),
   steht als Grenze in docs/internal/messrahmen.md. */
import { runAgent, type AgentEvent, type CompactionDeps, type LoopLlm } from "../../src/core/agent/loop";
import { isChatMessage, type ChatMessage, type LogEntry } from "../../src/core/agent/types";
import { RAHMEN_STANDARD, type RahmenSchalter } from "../../src/core/agent/rahmen";
import { buildSystemPrompt } from "../../src/core/prompt/build";
import { toolSet, toWireTools } from "../../src/core/tools/defs";
import { createTaskNotesProvider, TASKNOTES_ID } from "../../src/core/tools/tasknotes";
import { parseSkill, type Skill } from "../../src/core/skills/skill";
import { selectSkills } from "../../src/core/skills/select";
import { SKILLS_SUBFOLDER, MEMORY_FILE } from "../../src/core/tools/write-policy";
import { DEFAULT_SETTINGS } from "../../src/core/settings-types";
import { KodaChatClient, type LlmResult, type SseTransport } from "../../src/llm/KodaChatClient";
import { VaultTools } from "../../src/obsidian/vault-tools";
import { SpeicherVault } from "./speicher-vault";
import { tasknotesAttrappe } from "./tasknotes-attrappe";
import { MESS_HEUTE, MESS_UHR_MS, MESS_ZONE } from "./vault-stand";
import { falschVon, type Aufgabe } from "./aufgaben";
import { nurSchreibenIn, type Aufruf, type Befund, type LaufSpur } from "./pruefer";

export type Arm = "basis" | "a" | "b" | "c";

/** Die Stellung der Schalter je Arm. (b): 8.000 Zeichen für `read_note` (rund 2.000 Token, ein Viertel des
 *  Standardfensters), 2.000 für `Memory.md`. */
export const ARME: Record<Arm, RahmenSchalter> = {
  basis: { ...RAHMEN_STANDARD },
  a: { ...RAHMEN_STANDARD, nowNurDatum: true },
  b: { ...RAHMEN_STANDARD, leseGrenzeZeichen: 8000, memoryGrenzeZeichen: 2000 },
  c: { ...RAHMEN_STANDARD, wiederholungsHinweis: true },
};

export interface LaufOptionen {
  endpoint: string;
  apiKey: string;
  /** Das Modell, wie der Server es nennt (bei der Attrappe trägt der Name Modus, Aufgabe und Lauf). */
  modell: string;
  arm: Arm;
  start: Record<string, string>;
  /** Kontextfenster in Token (Einstellung `contextWindowTokens`, Standard 8192). */
  fensterToken: number;
  /** Idle-Frist des Clients in ms (Einstellung `timeoutSec`). */
  timeoutMs: number;
  suppressThinking: boolean;
}

export interface Messung {
  /** Modellaufrufe des Loops (ohne Zusammenfassungen). */
  runden: number;
  aufrufe: number;
  /** Werkzeug-Ergebnisse mit Fehler. */
  fehler: number;
  /** Aufrufe mit Name und Argumenten wie ein früherer Aufruf desselben Laufs. */
  identischeWiederholungen: number;
  verdichtungen: number;
  /** Erzwungene Verdichtungen nach einem Überlauf des Servers (`loop.ts`, reaktives Netz). */
  ueberlaufWiederholungen: number;
  rundenlimit: number;
  bestaetigungen: number;
  /** Fehler-Ereignisse des Loops (Art und Text), z. B. Timeout, HTTP, abgeschnittene Antwort. */
  laufFehler: string[];
  /** Summen aus `usage` der Server-Antwort; `null`, wenn der Server nichts meldet. */
  promptToken: number | null;
  antwortToken: number | null;
  /** Vom Server als wiederverwendet gemeldete Prompt-Token (`cached_tokens` bzw. llama.cpp `cache_n`); `null` ohne Angabe. */
  cacheToken: number | null;
  /** Zeit bis zum ersten Token (Text, Denken oder Werkzeugkopf) des ersten Modellaufrufs. */
  ttftMs: number | null;
  gesamtMs: number;
}

export interface LaufErgebnis extends Messung {
  aufgabe: string;
  art: string;
  arm: Arm;
  modell: string;
  wiederholung: number;
  bestanden: boolean;
  befunde: Befund[];
  antworten: string[];
  /** Der ganze Verlauf (ohne System-Prompt); für das Lesen der Fehlschläge. */
  verlauf: LogEntry[];
}

/** fetch-Transport wie in koda-lab.ts, zusätzlich mit `stream_options.include_usage` (OpenAI-Standard, Ollama und LM Studio
 *  kennen es) und einem Mitleser, der `usage` und Cache-Angaben aus den SSE-Zeilen zieht. Das Plugin sendet das Feld nicht:
 *  es ändert die Antwort um einen Schluss-Chunk ohne `choices`, den der Kit-Client übergeht. */
function zaehlTransport(z: { prompt: number | null; antwort: number | null; cache: number | null }): SseTransport {
  const lies = (zeile: string): void => {
    if (!zeile.startsWith("data:")) return;
    const roh = zeile.slice(5).trim();
    if (roh === "" || roh === "[DONE]") return;
    try {
      const j = JSON.parse(roh) as { usage?: Record<string, unknown>; timings?: Record<string, unknown> };
      const u = j.usage;
      if (u !== undefined && u !== null) {
        if (typeof u.prompt_tokens === "number") z.prompt = (z.prompt ?? 0) + u.prompt_tokens;
        if (typeof u.completion_tokens === "number") z.antwort = (z.antwort ?? 0) + u.completion_tokens;
        const det = u.prompt_tokens_details as { cached_tokens?: unknown } | undefined;
        if (typeof det?.cached_tokens === "number") z.cache = (z.cache ?? 0) + det.cached_tokens;
      }
      if (typeof j.timings?.cache_n === "number") z.cache = (z.cache ?? 0) + j.timings.cache_n;
    } catch { /* keine JSON-Zeile: übergehen */ }
  };
  return {
    async postStream(url, body, headers, onChunk, signal) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ ...(body as Record<string, unknown>), stream_options: { include_usage: true } }),
        signal,
      });
      const reader = res.body?.getReader();
      if (reader) {
        const dec = new TextDecoder();
        let rest = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const s = dec.decode(value, { stream: true });
          rest += s;
          const zeilen = rest.split("\n");
          rest = zeilen.pop() ?? "";
          zeilen.forEach(lies);
          onChunk(s);
        }
        lies(rest);
      }
      return res.status;
    },
  };
}

const nodeClock = {
  now: () => Date.now(),
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id: number) => clearTimeout(id),
};

function skillsAus(vault: SpeicherVault, kodaFolder: string): Skill[] {
  const dir = `${kodaFolder}/${SKILLS_SUBFOLDER}/`.toLowerCase();
  const out: Skill[] = [];
  for (const [p, c] of vault.dateien) {
    const rest = p.toLowerCase().startsWith(dir) ? p.slice(dir.length) : null;
    if (rest === null || rest.includes("/") || !rest.toLowerCase().endsWith(".md")) continue;
    const r = parseSkill(rest.replace(/\.md$/i, ""), c);
    if (r.ok) out.push(r.skill);
  }
  return out;
}

/** Ein Lauf einer Aufgabe. Wirft nie: ein Fehler des Laufs ist ein Messwert (`laufFehler`) und lässt die Prüfung scheitern. */
export async function laufeAufgabe(a: Aufgabe, o: LaufOptionen, wiederholung: number): Promise<LaufErgebnis> {
  const s = DEFAULT_SETTINGS;
  const rahmen = ARME[o.arm];
  const kodaFolder = s.kodaFolder;
  const lang = "de" as const;
  const vault = new SpeicherVault(o.start);
  const tasknotes = createTaskNotesProvider(() => tasknotesAttrappe(vault));
  const set = toolSet({ providers: [{ id: TASKNOTES_ID, tools: tasknotes.tools({ lang }) }] });
  const defs = set.defs;
  const bestaetigungen: { art: string; pfad: string }[] = [];
  const tools = new VaultTools(vault, async (req) => { bestaetigungen.push({ art: req.kind, pfad: req.path }); return true; }, {
    kodaFolder: () => kodaFolder,
    today: () => MESS_HEUTE,
    listMaxRows: () => s.listNotesMaxRows,
    allowed: () => new Set(defs.map((d) => d.name)),
    now: () => MESS_UHR_MS,
    timeZone: () => MESS_ZONE,
    lang: () => lang,
    provider: (name) => (set.routes.get(name) === TASKNOTES_ID ? tasknotes : null),
    confirmProvider: async (p) => { bestaetigungen.push({ art: "provider", pfad: p.paths.join(", ") || p.summary }); return true; },
    rahmen,
  });

  const zaehler = { prompt: null as number | null, antwort: null as number | null, cache: null as number | null };
  const client = new KodaChatClient(zaehlTransport(zaehler), o.timeoutMs, nodeClock);
  const cfg = { endpoint: o.endpoint, apiKey: o.apiKey, model: o.modell, suppressThinking: o.suppressThinking, thinkingLevel: s.thinkingLevel };
  let runden = 0;
  let ttftMs: number | null = null;
  const llm: LoopLlm = {
    complete: async (messages, onToken, onReasoning, signal, onToolCallHead, onContentReset) => {
      const t0 = Date.now();
      const erste = runden === 0;
      runden++;
      const mark = (): void => { if (erste && ttftMs === null) ttftMs = Date.now() - t0; };
      return client.complete(cfg, messages, defs,
        (x) => { mark(); onToken(x); }, (x) => { mark(); onReasoning(x); }, signal,
        (n) => { mark(); onToolCallHead?.(n); }, undefined, onContentReset);
    },
  };
  const summarize = async (messages: ChatMessage[]): Promise<string | null> => {
    const r: LlmResult = await client.complete({ ...cfg, suppressThinking: true }, messages, [], () => {}, () => {}, new AbortController().signal);
    return r.ok && r.content.trim() !== "" ? r.content : null;
  };
  const compaction: CompactionDeps = {
    budgetTokens: Math.floor((o.fensterToken * s.compactAtPercent) / 100),
    keepToolResults: s.keepToolResults,
    overheadChars: JSON.stringify(toWireTools(defs)).length,
    summarize: s.summarizeEnabled ? summarize : null,
    summaryMaxChars: Math.floor((o.fensterToken * 4 * s.summaryPercent) / 100),
    lang,
    now: () => new Date(MESS_UHR_MS).toISOString(),
  };

  const m: Messung = {
    runden: 0, aufrufe: 0, fehler: 0, identischeWiederholungen: 0, verdichtungen: 0, ueberlaufWiederholungen: 0,
    rundenlimit: 0, bestaetigungen: 0, laufFehler: [], promptToken: null, antwortToken: null, cacheToken: null, ttftMs: null, gesamtMs: 0,
  };
  const aufrufe: Aufruf[] = [];
  const gesehen = new Set<string>();
  const onEvent = (e: AgentEvent): void => {
    if (e.kind === "tool-end") {
      const key = `${e.call.name}\u0000${e.call.arguments}`;
      if (gesehen.has(key)) m.identischeWiederholungen++;
      gesehen.add(key);
      aufrufe.push({ name: e.call.name, arguments: e.call.arguments, ok: e.outcome.ok, ...(e.outcome.ok ? {} : { fehler: e.outcome.error }) });
    }
    if (e.kind === "compaction") {
      m.verdichtungen++;
      if (e.record.forced === true) m.ueberlaufWiederholungen++;
    }
    if (e.kind === "round-limit") m.rundenlimit++;
    if (e.kind === "error") m.laufFehler.push(`${e.errorKind}${e.message !== "" ? `: ${e.message.slice(0, 160)}` : ""}`);
  };

  const verlauf: LogEntry[] = [];
  const antworten: string[] = [];
  const t0 = Date.now();
  for (const zug of a.zuege) {
    const memoryPfad = `${kodaFolder}/${MEMORY_FILE}`;
    const memory = vault.dateien.get(memoryPfad) ?? "";
    const system: ChatMessage = {
      role: "system",
      content: buildSystemPrompt({
        lang, memory, kodaFolder, skills: selectSkills(skillsAus(vault, kodaFolder), s.skillBudgetChars),
        now: MESS_UHR_MS, timeZone: MESS_ZONE, rahmen,
      }),
    };
    verlauf.push({ role: "user", content: zug });
    let neu: LogEntry[] = [];
    try {
      neu = await runAgent(
        { llm, tools, maxRounds: s.maxRounds, textFallback: s.textFallback, compaction, rahmen },
        [system, ...verlauf], () => {}, () => {}, onEvent, new AbortController().signal,
      );
    } catch (e) {
      m.laufFehler.push(`throw: ${e instanceof Error ? e.message : String(e)}`);
    }
    verlauf.push(...neu);
    const letzte = [...neu].reverse().find((x) => isChatMessage(x) && x.role === "assistant" && (x.toolCalls === undefined || x.toolCalls.length === 0));
    antworten.push(letzte !== undefined && isChatMessage(letzte) ? letzte.content : "");
  }
  m.gesamtMs = Date.now() - t0;
  m.runden = runden;
  m.aufrufe = aufrufe.length;
  m.fehler = aufrufe.filter((x) => !x.ok).length;
  m.bestaetigungen = bestaetigungen.length;
  m.ttftMs = ttftMs;
  m.promptToken = zaehler.prompt;
  m.antwortToken = zaehler.antwort;
  m.cacheToken = zaehler.cache;

  const spur: LaufSpur = { antworten, aufrufe, bestaetigungen, protokoll: vault.protokoll, start: o.start, stand: vault.stand() };
  const befunde = [...a.pruefungen, nurSchreibenIn(a.schreibenErlaubt ?? [])].map((p) => p(spur));
  if (m.laufFehler.length > 0) befunde.push({ pass: true, note: `Lauf-Ereignisse: ${m.laufFehler.join("; ")}` });
  return {
    ...m, aufgabe: a.id, art: a.art, arm: o.arm, modell: o.modell, wiederholung,
    bestanden: befunde.every((b) => b.pass), befunde, antworten, verlauf,
  };
}

/** Für die Attrappe: die Schritte, die sie für ein Modell `muster/<id>/…` oder `falsch/<id>/…` abspielt. */
export function schritteFuer(a: Aufgabe, modus: "muster" | "falsch"): Aufgabe["muster"] {
  return modus === "muster" ? a.muster : falschVon(a);
}
