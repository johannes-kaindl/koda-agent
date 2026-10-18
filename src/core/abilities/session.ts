/* Sitzungs-Marke im Verlauf (Spec § 3 „Gespräch, neues Gespräch, Neustart“): Arbeit und Overlay gehören
 * zum Gespräch und werden mit ihm im JSONL gespeichert. Pure. */
import { isContextMode } from "../context/types";
import type { LogEntry } from "../agent/types";
import { isSessionStateRecord } from "../agent/types";
import { emptyOverlay, SKILL_MODES, type Overlay, type SessionState } from "./types";

function isMap(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isValueMap(v: unknown, allowed: readonly string[]): boolean {
  return isMap(v) && Object.values(v).every((x) => typeof x === "string" && allowed.includes(x));
}

/** Form-Prüfung für eine Marke aus dem JSONL: ein kaputter Zustand soll die Marke kosten, nie das Gespräch. */
export function isSessionState(v: unknown): v is SessionState {
  if (!isMap(v)) return false;
  if (v["arbeit"] !== null && typeof v["arbeit"] !== "string") return false;
  if (!Array.isArray(v["manual"]) || !v["manual"].every((p) => typeof p === "string")) return false;
  const o = v["overlay"];
  if (!isMap(o)) return false;
  if (!isValueMap(o["skills"], SKILL_MODES) || !isValueMap(o["werkzeuge"], ["an", "aus"]) || !isValueMap(o["anbieter"], ["an", "aus"])) return false;
  const k = o["kontext"];
  if (!isMap(k)) return false;
  if (k["modus"] !== undefined && !isContextMode(k["modus"])) return false;
  for (const key of ["tiefe", "nachbarn"]) if (k[key] !== undefined && typeof k[key] !== "number") return false;
  return true;
}

/** Die jüngste Marke, oder null (Gespräch aus der Zeit vor den Arbeiten). */
export function latestSessionState(entries: readonly LogEntry[]): SessionState | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (isSessionStateRecord(e)) return e.state;
  }
  return null;
}

/** „Neues Gespräch“: mit Arbeit bleibt sie und wird frisch angewendet (Overlay leer, Notizen neu aufgelöst);
 *  ohne Arbeit bleibt nur der Kontext-Teil des Overlays — wie heute der Modus. */
export function sessionForNewChat(s: SessionState): SessionState {
  const overlay: Overlay = s.arbeit !== null ? emptyOverlay() : { ...emptyOverlay(), kontext: { ...s.overlay.kontext } };
  return { arbeit: s.arbeit, overlay, manual: [] };
}

const WORDS = {
  de: { task: "Arbeit", none: "keine", reset: "zurückgesetzt", aus: "aus", beschreibung: "Beschreibung", ganz: "ganz", an: "an" },
  en: { task: "Task", none: "none", reset: "reset", aus: "off", beschreibung: "description", ganz: "full", an: "on" },
} as const;

function changed(prev: Readonly<Record<string, string>>, next: Readonly<Record<string, string>>, lang: "de" | "en"): string[] {
  const w = WORDS[lang];
  const out: string[] = [];
  for (const name of [...new Set([...Object.keys(prev), ...Object.keys(next)])].sort()) {
    if (prev[name] === next[name]) continue;
    const v = next[name];
    out.push(`${name}: ${v === undefined ? w.reset : w[v as keyof typeof w]}`);
  }
  return out;
}

/** Die Zeile im Chat („Arbeit: Inbox · inbox-triage: ganz“), oder null, wenn sich nichts geändert hat.
 *  Nach einem Wechsel der Arbeit zählt das alte Overlay nicht (es wurde mit dem Wechsel geleert). */
export function describeStateChange(prev: SessionState | null, next: SessionState, lang: "de" | "en"): string | null {
  const w = WORDS[lang];
  const before: SessionState = prev ?? { arbeit: null, overlay: emptyOverlay(), manual: [] };
  const parts: string[] = [];
  const switched = before.arbeit !== next.arbeit;
  if (switched) parts.push(`${w.task}: ${next.arbeit ?? w.none}`);
  const base = switched ? emptyOverlay() : before.overlay;
  parts.push(
    ...changed(base.skills, next.overlay.skills, lang),
    ...changed(base.werkzeuge, next.overlay.werkzeuge, lang),
    ...changed(base.anbieter, next.overlay.anbieter, lang),
  );
  return parts.length === 0 ? null : parts.join(" · ");
}
