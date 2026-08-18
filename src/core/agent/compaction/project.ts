/* Projektion des Verlaufs fuer das Modell.
 *
 * Der Verlauf (`LogEntry[]`) bleibt, was er ist — der Nutzer sieht ihn vollstaendig, das
 * JSONL ist append-only. Was auf den Draht geht, ist eine PROJEKTION: ein Fold von links
 * ueber die Verdichtungs-Marken. Eine Marke referenziert nichts; ihre Position ist die
 * Referenz („alles vor mir nach dieser Regel“). Ohne Marke ist die Projektion identisch
 * zum Verlauf. Die Entfernung der Stufe-2-Region ist nur deshalb verwaisungssicher, weil eine
 * Nutzer-Nachricht nie mitten in einer Runde auftauchen kann — `view.ts` verweigert Eingaben,
 * solange `plugin.busy` steht. Unveraenderte Nachrichten liefert die Projektion per Referenz
 * zurueck — Aufrufer duerfen sie nie beschreiben. Spec:
 * docs/superpowers/specs/2026-08-18-koda-compaction-design.md */
import { isCompactionRecord, type ChatMessage, type CompactionRecord, type LogEntry } from "../types";

/** Unter dieser Laenge spart ein Stub nichts — Fehler-Ergebnisse (`ERROR: …`) bleiben. */
export const STUB_MIN_CHARS = 160;

export const MERGED_HEADER = "Frühere Anfragen (wörtlich):";

export function shouldStub(m: ChatMessage): boolean {
  return m.role === "tool" && m.stubbed !== true && m.content.length > STUB_MIN_CHARS;
}

function coreArgument(args: string): string | null {
  try {
    const parsed: unknown = JSON.parse(args);
    if (typeof parsed !== "object" || parsed === null) return null;
    const rec = parsed as Record<string, unknown>;
    for (const key of ["path", "query", "folder"]) {
      const v = rec[key];
      if (typeof v === "string" && v !== "") return v;
    }
  } catch {
    // kein JSON — dann ohne Kernargument
  }
  return null;
}

function formatKb(chars: number): string {
  return `${(chars / 1024).toFixed(1).replace(".", ",")} KB`;
}

/** Stub-Text: sagt dem Modell WAS weg ist und WIE es zurueckkommt. */
export function formatStub(name: string, args: string, chars: number): string {
  const arg = coreArgument(args);
  const head = arg === null ? name : `${name} "${arg}"`;
  return `[${head} — ${formatKb(chars)}, verdichtet; bei Bedarf erneut aufrufen]`;
}

/** Ein projizierter Eintrag traegt seine Quelle mit — die braucht Stufe 1 fuer den Stub-Text
 *  (Originalgroesse) und Stufe 2 fuer die flache Fortschreibung des merged-Blocks. */
interface Slot {
  msg: ChatMessage;
  /** Nur bei merged-Nachrichten: die woertlichen Nutzer-Anfragen. */
  parts?: string[];
}

function renderMerged(parts: string[]): ChatMessage {
  const body = parts.map((p, i) => `${i + 1}. ${p}`).join("\n");
  return { role: "user", content: `${MERGED_HEADER}\n${body}`, merged: true };
}

/** Indizes der Tool-Nachrichten, die eine Stufe-1-Marke mit diesem K stubben wuerde —
 *  EINE Regel fuer Marke (planStage1) und Projektion (applyStage1), damit beide nie
 *  auseinanderlaufen. K zaehlt positionell die K juengsten Tool-Ergebnisse (auch kurze
 *  oder schon gestubbte); gestubbt wird davon jenseits, was `shouldStub` erlaubt. */
export function stage1Targets(msgs: ChatMessage[], keep: number): number[] {
  const targets: number[] = [];
  let seen = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== "tool") continue;
    seen++;
    if (seen <= keep) continue;
    if (!shouldStub(m)) continue;
    targets.push(i);
  }
  return targets;
}

function applyStage1(slots: Slot[], rec: CompactionRecord, calls: Map<string, { name: string; args: string }>): void {
  for (const i of stage1Targets(slots.map((s) => s.msg), rec.keepToolResults)) {
    const m = slots[i].msg;
    const c = calls.get(m.toolCallId ?? "");
    slots[i] = {
      msg: {
        role: "tool",
        toolCallId: m.toolCallId,
        content: formatStub(c?.name ?? "tool", c?.args ?? "", m.content.length),
        stubbed: true,
      },
    };
  }
}

function applyStage2(slots: Slot[], rec: CompactionRecord): Slot[] {
  if (rec.summary === undefined || rec.summary === "") return slots;
  const start = slots.findIndex((s) => s.msg.role !== "system");
  if (start === -1) return slots;
  let lastUser = -1;
  for (let i = slots.length - 1; i >= start; i--) {
    if (slots[i].msg.role === "user") { lastUser = i; break; }
  }
  // Region = [start, lastUser): abgeschlossene Runden. Leer -> nichts zu tun.
  if (lastUser <= start) return slots;
  const parts: string[] = [];
  for (let i = start; i < lastUser; i++) {
    const s = slots[i];
    if (s.msg.role !== "user") continue;
    if (s.parts) parts.push(...s.parts); // flach fortschreiben statt verschachteln
    else parts.push(s.msg.content);
  }
  const merged: Slot = { msg: renderMerged(parts), parts };
  const summary: Slot = { msg: { role: "assistant", content: rec.summary } };
  return [...slots.slice(0, start), merged, summary, ...slots.slice(lastUser)];
}

export function projectForModel(entries: LogEntry[]): ChatMessage[] {
  let slots: Slot[] = [];
  const calls = new Map<string, { name: string; args: string }>();
  for (const e of entries) {
    if (isCompactionRecord(e)) {
      if (e.stage === 1) applyStage1(slots, e, calls);
      else slots = applyStage2(slots, e);
      continue;
    }
    if (e.role === "assistant" && e.toolCalls) {
      for (const c of e.toolCalls) calls.set(c.id, { name: c.name, args: c.arguments });
    }
    slots.push({ msg: e });
  }
  return slots.map((s) => s.msg);
}
