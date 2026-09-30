import {
  isChatMessage,
  type ChatMessage,
  type CompactionRecord,
  type LogEntry,
  type ToolCall,
  type ToolOutcome,
  type ToolRunner,
} from "./types";
import type { LlmResult } from "../../llm/KodaChatClient";
import { parseTextToolCall } from "./text-fallback";
import { projectForModel } from "./compaction/project";
import { estimateTokens } from "./compaction/estimate";
import { planStage1 } from "./compaction/stage1";
import { splitTurns, summarizeTurns, makeStage2Record, PACK_RATIO } from "./compaction/stage2";

export interface LoopLlm {
  complete(
    messages: ChatMessage[],
    onToken: (t: string) => void,
    onReasoning: (t: string) => void,
    signal: AbortSignal,
    // Optional: feuert, sobald ein Tool-Call-Kopf (Name bekannt, Argumente noch leer) da ist —
    // die UI kann daraus "schreibt Tool-Aufruf <name> …" zeigen, statt in der gepufferten
    // Stille (KodaChatClient TOOL_CALL_IDLE_TIMEOUT_MS) ohne Lebenszeichen dazustehen.
    onToolCallHead?: (name: string) => void,
  ): Promise<LlmResult>;
}

export type AgentEvent =
  | { kind: "tool-start"; call: ToolCall }
  | { kind: "tool-end"; call: ToolCall; outcome: ToolOutcome }
  /** Kopf-Chunk eines Tool-Calls (Name da, Argumente werden noch gepuffert generiert) —
   *  vor "tool-start", das erst nach der vollstaendigen Assemblierung kommt. */
  | { kind: "tool-call-head"; name: string }
  /** truncated: finish_reason "length" bei verwertbarem Text (Fall 2, REGISTRY „Abgeschnittene
   *  LLM-Antwort") — kein Fehler, nur ein Hinweis fuer die UI-Schicht. */
  | { kind: "final"; text: string; truncated: boolean }
  | { kind: "error"; message: string; partial: string; errorKind: "aborted" | "http" | "network" | "timeout" | "overflow" | "truncated" }
  | { kind: "round-limit" }
  | { kind: "compaction"; record: CompactionRecord }
  /** Vor dem Stufe-2-Modellaufruf — der kann lokal Minuten dauern, ohne dieses Ereignis
   *  steht der Chat solange ohne jedes Lebenszeichen da. */
  | { kind: "summarizing" }
  /** Ein Vision-Aufruf scheiterte mit HTTP-Fehler; die Bilder wurden durch Texterkennung
   *  ersetzt und die Runde wiederholt. `paths`: welche Bilder betroffen waren. */
  | { kind: "vision-fallback"; paths: string[] };

/** Verdichtung — alle Zahlen kommen aus den Settings, umgerechnet in `main.ts`.
 *  `summarize === null` heisst: Stufe 2 ist aus. */
export interface CompactionDeps {
  /** Schwelle in Token (Fenster × Prozent). Darueber wird verdichtet. */
  budgetTokens: number;
  /** K — Tool-Ergebnisse, die woertlich bleiben. */
  keepToolResults: number;
  /** Zeichen, die neben den Nachrichten mitgehen (Tool-Definitionen). */
  overheadChars: number;
  /** Stufe 2: ein Modellaufruf ohne Tools; null bei Fehler/leer. */
  summarize: ((msgs: ChatMessage[]) => Promise<string | null>) | null;
  /** Obergrenze fuer den Zusammenfassungstext in Zeichen. */
  summaryMaxChars: number;
  lang: "de" | "en";
  /** ISO-Zeitstempel fuer Records — injiziert, damit Tests deterministisch sind. */
  now: () => string;
}

export interface AgentDeps {
  llm: LoopLlm;
  tools: ToolRunner;
  maxRounds: number;
  /** true: JSON-Tool-Objekte im Antworttext werden als Tool-Call behandelt
   *  (Default laut koda-lab-Befund, docs/LAB.md). */
  textFallback: boolean;
  /** Fehlt: keine Verdichtung (Bestandsverhalten, alte Tests). */
  compaction?: CompactionDeps;
  /** Rueckfall fuer Bilder: liest ein Bild per Texterkennung. Fehlt er (kein OCR-Anbieter),
   *  bleibt ein HTTP-Fehler nach einem Bild ein Fehler. */
  ocrFallback?: (path: string) => Promise<ToolOutcome>;
}

/** Der Agent-Loop: LLM → Tools → LLM … bis finale Antwort, Fehler oder Runden-Limit.
 *  Pure: kennt nur die Ports. Rueckgabe sind die NEU erzeugten Eintraege — Nachrichten
 *  UND Verdichtungs-Marken im selben Kanal; der Aufrufer haengt sie an seine Session
 *  und persistiert. Vor jedem Modellaufruf wird der Verlauf projiziert und bei Bedarf
 *  verdichtet (Spec § Architektur). Duennes Aeusseres um `runAgentImpl`: entfernt das
 *  `reasoning`-Feld (s. types.ts), bevor die Nachrichten den Aufrufer erreichen — es ist
 *  Loop-lokal und darf nicht in die persistierte Session gelangen. */
export async function runAgent(
  deps: AgentDeps,
  history: LogEntry[],
  onToken: (t: string) => void,
  onReasoning: (t: string) => void,
  onEvent: (e: AgentEvent) => void,
  signal: AbortSignal,
): Promise<LogEntry[]> {
  const appended = await runAgentImpl(deps, history, onToken, onReasoning, onEvent, signal);
  return appended.map((e) => {
    if (isChatMessage(e) && e.reasoning !== undefined) {
      const { reasoning: _reasoning, ...rest } = e;
      return rest;
    }
    return e;
  });
}

async function runAgentImpl(
  deps: AgentDeps,
  history: LogEntry[],
  onToken: (t: string) => void,
  onReasoning: (t: string) => void,
  onEvent: (e: AgentEvent) => void,
  signal: AbortSignal,
): Promise<LogEntry[]> {
  const appended: LogEntry[] = [];
  // Geheilte Nachrichten AUS dem uebergebenen Verlauf: der Aufrufer besitzt ihn, der Loop
  // ueberschreibt ihn nicht — sie gelten nur fuer die Projektion dieses Laufs.
  const healed = new Map<number, LogEntry>();
  const entries = (): LogEntry[] => [...history.map((e, i) => healed.get(i) ?? e), ...appended];
  const c = deps.compaction;

  const overBudget = (msgs: ChatMessage[]): boolean =>
    c !== undefined && estimateTokens(msgs, c.overheadChars) > c.budgetTokens;

  /** Verdichtet, wenn noetig (oder erzwungen). true, wenn mindestens ein Record entstand. */
  const compact = async (forced: boolean): Promise<boolean> => {
    if (c === undefined) return false;
    let did = false;
    let msgs = projectForModel(entries());
    if (forced || overBudget(msgs)) {
      const r1 = planStage1(msgs, forced ? 0 : c.keepToolResults, c.now(), forced);
      if (r1 !== null) {
        appended.push(r1);
        onEvent({ kind: "compaction", record: r1 });
        did = true;
        msgs = projectForModel(entries());
      }
    }
    if ((forced || overBudget(msgs)) && c.summarize !== null) {
      const { completed } = splitTurns(msgs);
      // Kein Fortschritt moeglich: besteht die abgeschlossene Region nur noch aus dem
      // Ergebnis der letzten Stufe 2 (merged user + summary), gaebe ein weiterer Aufruf
      // nichts Neues her — er kostete nur Minuten. Dann bleibt der reaktive Pfad.
      const onlySummary = completed.length === 1 && completed[0][0]?.merged === true;
      if (completed.length > 0 && !onlySummary) {
        // summarize() ist ein Fremd-Port (LLM-Aufruf) — ein werfender Port darf den Lauf
        // nicht abbrechen, deshalb zusaetzlich zum vertraglichen null hier abgefangen.
        onEvent({ kind: "summarizing" });
        const summary = await summarizeTurns(completed, {
          lang: c.lang,
          maxChars: c.summaryMaxChars,
          packChars: Math.floor(c.budgetTokens * 4 * PACK_RATIO),
          summarize: c.summarize,
        }).catch(() => null);
        if (summary !== null) {
          const r2 = makeStage2Record(completed, summary, c.keepToolResults, c.now(), forced);
          appended.push(r2);
          onEvent({ kind: "compaction", record: r2 });
          did = true;
        }
      }
    }
    return did;
  };

  /** Ersetzt die Bilder aller Nachrichten durch Texterkennung. true, wenn es etwas zu ersetzen gab. */
  const degradeImages = async (): Promise<boolean> => {
    const ocr = deps.ocrFallback;
    if (ocr === undefined) return false;
    const paths: string[] = [];
    const heal = async (e: LogEntry): Promise<LogEntry | null> => {
      if (!isChatMessage(e) || e.images === undefined || e.images.length === 0) return null;
      const parts: string[] = [];
      for (const img of e.images) {
        paths.push(img.path);
        const r = await ocr(img.path).catch((err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : "Texterkennung fehlgeschlagen" }));
        parts.push(r.ok ? r.content : `Bild ${img.path} konnte nicht gesehen und nicht per Texterkennung gelesen werden: ${r.error}`);
      }
      const { images: _images, ...rest } = e;
      return { ...rest, content: [e.content, ...parts].join("\n\n") };
    };
    for (let i = 0; i < history.length; i++) {
      const h = await heal(healed.get(i) ?? history[i]);
      if (h !== null) healed.set(i, h);
    }
    for (let i = 0; i < appended.length; i++) {
      const h = await heal(appended[i]);
      if (h !== null) appended[i] = h;
    }
    if (paths.length === 0) return false;
    onEvent({ kind: "vision-fallback", paths });
    return true;
  };

  let round = 0;
  let overflowRetried = false;
  let visionRetried = false;
  while (round < deps.maxRounds) {
    await compact(false);
    const r = await deps.llm.complete(
      projectForModel(entries()), onToken, onReasoning, signal,
      (name) => onEvent({ kind: "tool-call-head", name }),
    );

    if (!r.ok) {
      // Reaktives Netz: beim ERSTEN Ueberlauf einmal erzwungen verdichten (K=0, dann
      // Stufe 2) und dieselbe Runde wiederholen — sie zaehlt nicht gegen maxRounds. Nur,
      // wenn noch kein Token beim Nutzer war (sonst stuende die halbe Antwort doppelt in
      // der Blase — dieselbe Regel wie beim Failover). Beim zweiten Mal oder ohne
      // Verdichtungsmasse: Fehler mit dem Server-Text; die Session bleibt benutzbar, der
      // naechste ask() darf wieder verdichten.
      if (r.kind === "overflow" && r.partial === "" && !overflowRetried) {
        overflowRetried = true;
        if (await compact(true)) continue;
      }
      // Ein HTTP-Fehler (4xx/5xx), solange ein Bild im Verlauf steht: der Server nimmt keine
      // Bilder. Einmal auf Texterkennung zurueckfallen, dieselbe Runde wiederholen — nie nach
      // Antwortinhalt entscheiden, nur nach dem Transportfehler.
      if (r.kind === "http" && r.partial === "" && !visionRetried) {
        visionRetried = true;
        if (await degradeImages()) continue;
      }
      if (r.partial !== "") appended.push({ role: "assistant", content: r.partial });
      onEvent({ kind: "error", message: r.detail, partial: r.partial, errorKind: r.kind });
      return appended;
    }

    // Ein Call ist nur bei finish_reason "tool_calls" vollstaendig (llm-setup 6f75737,
    // 9x gemessen: bei "length" kommt der Kopf-Chunk mit Name, der Argument-Chunk fehlt).
    // Nur native Calls betrifft das — der Text-Fallback unten hat nie finish_reason
    // "tool_calls" und ist hier absichtlich ausgenommen (er greift erst, wenn r.toolCalls
    // leer ist, also unterhalb dieser Weiche).
    if (r.toolCalls.length > 0 && r.finishReason !== undefined && r.finishReason !== "tool_calls") {
      if (r.content !== "") appended.push({ role: "assistant", content: r.content });
      onEvent({ kind: "error", message: "", partial: r.content, errorKind: "truncated" });
      return appended;
    }

    let calls: ToolCall[] = r.toolCalls;
    if (calls.length === 0 && deps.textFallback) {
      const textual = parseTextToolCall(r.content);
      if (textual !== null) calls = [{ id: `text_${round}`, name: textual.name, arguments: textual.arguments }];
    }

    if (calls.length === 0) {
      appended.push({ role: "assistant", content: r.content });
      onEvent({ kind: "final", text: r.content, truncated: r.finishReason === "length" });
      return appended;
    }

    appended.push({
      role: "assistant",
      content: r.content,
      toolCalls: calls,
      ...(r.reasoning !== undefined && r.reasoning !== "" ? { reasoning: r.reasoning } : {}),
    });
    for (const call of calls) {
      if (signal.aborted) {
        onEvent({ kind: "error", message: "", partial: "", errorKind: "aborted" });
        return appended;
      }
      onEvent({ kind: "tool-start", call });
      const outcome = await runOne(deps.tools, call);
      onEvent({ kind: "tool-end", call, outcome });
      appended.push({
        role: "tool",
        toolCallId: call.id,
        content: outcome.ok ? outcome.content : `ERROR: ${outcome.error}`,
        ...(outcome.ok && outcome.images !== undefined && outcome.images.length > 0 ? { images: outcome.images } : {}),
      });
    }
    round++;
  }

  onEvent({ kind: "round-limit" });
  return appended;
}

async function runOne(tools: ToolRunner, call: ToolCall): Promise<ToolOutcome> {
  let args: unknown;
  // Ein leerer Argument-String heisst nicht "keine Argumente noetig", sondern "der Aufruf
  // wurde abgeschnitten". Wuerde er als {} durchgereicht, meldete das Tool den Ausfall des
  // ersten Pflichtfelds — und das Modell korrigierte am falschen Ende (Befund 2026-08-06).
  if (call.arguments.trim() === "") {
    return { ok: false, error: `${call.name} wurde ohne Argumente aufgerufen — den Aufruf mit allen Pflichtfeldern wiederholen` };
  }
  try {
    args = JSON.parse(call.arguments);
  } catch {
    return { ok: false, error: `ungültige Tool-Argumente (kein JSON): ${call.arguments.slice(0, 120)}` };
  }
  try {
    return await tools.run(call.name, args);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Tool-Ausführung fehlgeschlagen" };
  }
}
