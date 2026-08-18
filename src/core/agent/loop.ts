import {
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
  ): Promise<LlmResult>;
}

export type AgentEvent =
  | { kind: "tool-start"; call: ToolCall }
  | { kind: "tool-end"; call: ToolCall; outcome: ToolOutcome }
  | { kind: "final"; text: string }
  | { kind: "error"; message: string; partial: string; errorKind: "aborted" | "http" | "network" | "timeout" | "overflow" }
  | { kind: "round-limit" }
  | { kind: "compaction"; record: CompactionRecord };

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
}

/** Der Agent-Loop: LLM → Tools → LLM … bis finale Antwort, Fehler oder Runden-Limit.
 *  Pure: kennt nur die Ports. Rueckgabe sind die NEU erzeugten Eintraege — Nachrichten
 *  UND Verdichtungs-Marken im selben Kanal; der Aufrufer haengt sie an seine Session
 *  und persistiert. Vor jedem Modellaufruf wird der Verlauf projiziert und bei Bedarf
 *  verdichtet (Spec § Architektur). */
export async function runAgent(
  deps: AgentDeps,
  history: LogEntry[],
  onToken: (t: string) => void,
  onReasoning: (t: string) => void,
  onEvent: (e: AgentEvent) => void,
  signal: AbortSignal,
): Promise<LogEntry[]> {
  const appended: LogEntry[] = [];
  const entries = (): LogEntry[] => [...history, ...appended];
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

  let round = 0;
  let overflowRetried = false;
  while (round < deps.maxRounds) {
    await compact(false);
    const r = await deps.llm.complete(projectForModel(entries()), onToken, onReasoning, signal);

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
      if (r.partial !== "") appended.push({ role: "assistant", content: r.partial });
      onEvent({ kind: "error", message: r.detail, partial: r.partial, errorKind: r.kind });
      return appended;
    }

    let calls: ToolCall[] = r.toolCalls;
    if (calls.length === 0 && deps.textFallback) {
      const textual = parseTextToolCall(r.content);
      if (textual !== null) calls = [{ id: `text_${round}`, name: textual.name, arguments: textual.arguments }];
    }

    if (calls.length === 0) {
      appended.push({ role: "assistant", content: r.content });
      onEvent({ kind: "final", text: r.content });
      return appended;
    }

    appended.push({ role: "assistant", content: r.content, toolCalls: calls });
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
