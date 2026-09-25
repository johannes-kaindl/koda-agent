// Werkzeug-Anbieter (Wirtsseite), Spike 2026-09-25 — Vertrag mit vault-rag `feat/tool-provider`
// (92c6c4d) und der calendar-notes-Task „tools() und execute() nach dem Werkzeug-Vertrag".
//
// Stern statt Netz: ein Anbieter-Plugin beschreibt seine Faehigkeiten als LLM-Werkzeuge
// (OpenAI-Function-Calling) und fuehrt sie aus; Koda montiert sie beim Aufbau der
// Werkzeugliste, statt sie nachzubauen. Dieses Modul ist pur: es kennt weder Obsidian noch
// den Anbieter — nur die Form des Vertrags. Lesen aus `app.plugins` macht
// `src/obsidian/providers.ts`.
//
// Festlegungen (Cockpit-Task „Werkzeug-Anbieter-Vertrag", 2026-09-25):
// (a) Der Name ist die Wire-Identitaet: montiert wird unveraendert, nie umbenannt. Kollisionen
//     werden NICHT montiert, sondern gemeldet — der Wirt gewinnt gegen jeden Anbieter, unter
//     Anbietern der zuerst gelesene. Ein stilles Ueberschreiben wuerde `execute(name)` an den
//     falschen Anbieter schicken.
// (b) Die Sprache nennt der Wirt (`tools({ lang })`), den Text liefert der Anbieter.
// (c) `content`/`message` sind der Text, den das Modell sieht; `data` ist fuer die Oberflaeche.
// (d) `writes` steht an der Definition; ein schreibendes Werkzeug ruft `confirm` mit einer
//     nebenwirkungsfreien Vorschau. Das Kennzeichen geht NICHT auf den Draht — das Modell
//     braucht es nicht, und ein fremdes Feld in der Function-Definition lehnen manche Server ab.

import type { ToolDef } from "./defs";
import type { ToolOutcome } from "../agent/types";

export type ProviderLang = "de" | "en";

export interface ProviderToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  writes: boolean;
}

export interface ProviderConfirmPreview { summary: string; paths: string[] }

export interface ProviderCallOptions {
  lang?: ProviderLang;
  /** Pflicht fuer jedes `writes:true`-Werkzeug — ohne sie oder bei `false` endet der
   *  Anbieter mit `needs-confirm`. Der Wirt entscheidet, was Bestaetigen heisst. */
  confirm?: (preview: ProviderConfirmPreview) => Promise<boolean>;
}

/** Fehlergruende nach dem GEGENSTAND der Aussage geschnitten (Werkzeug, Argument, Anbieter,
 *  Bestaetigung), nicht nach Fehlerquelle — Vertragsstand 92c6c4d. */
export type ProviderResult =
  | { ok: true; content: string; data?: unknown }
  | { ok: false; reason: "unknown-tool"; message: string }
  | { ok: false; reason: "bad-args"; field: string; message: string }
  | { ok: false; reason: "failed"; message: string }
  | { ok: false; reason: "needs-confirm"; message: string }
  | { ok: false; reason: "unavailable"; detail: string; message: string }
  | { ok: false; reason: "not-indexed"; path: string; message: string };

export interface ToolProviderApi {
  /** Synchron und netzfrei — Koda baut die Werkzeugliste synchron (`currentToolDefs`). */
  tools(opts?: { lang?: ProviderLang }): ProviderToolDef[];
  execute(name: string, args: Record<string, unknown>, opts?: ProviderCallOptions): Promise<ProviderResult>;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isProviderToolDef(x: unknown): x is ProviderToolDef {
  return isRecord(x)
    && typeof x.name === "string" && x.name.trim() !== ""
    && typeof x.description === "string"
    && isRecord(x.parameters)
    && typeof x.writes === "boolean";
}

/** Form pruefen, nicht Vorhandensein: `tools` und `execute` muessen Funktionen sein, und
 *  `tools()` muss ein Array vollstaendiger Definitionen liefern — auch leer (ein Anbieter
 *  ohne Index bietet nichts an, ist aber ein Anbieter). Eine Definition ohne `writes`
 *  faellt durch: so sieht calendar-notes 0.2.1 heute aus, und ein Wirt, der dort raet,
 *  montierte zwanzig Schreibkommandos ohne Kennzeichen. `tools()` wird dafuer einmal
 *  gerufen — der Vertrag verlangt, dass das synchron und ohne Nebenwirkung ist. */
export function isToolProviderApi(x: unknown): x is ToolProviderApi {
  if (!isRecord(x)) return false;
  if (typeof x.tools !== "function" || typeof x.execute !== "function") return false;
  let defs: unknown;
  try {
    defs = (x.tools as () => unknown)();
  } catch {
    return false;
  }
  return Array.isArray(defs) && defs.every(isProviderToolDef);
}

export interface ProviderOffer { id: string; tools: ProviderToolDef[] }

export interface MountedTools {
  /** Wirts-Werkzeuge zuerst, dann die montierten — in Lesereihenfolge der Anbieter. */
  defs: ToolDef[];
  /** Werkzeugname → Anbieter-Id; Wirts-Werkzeuge stehen nicht darin. */
  routes: Map<string, string>;
  /** Montierte Werkzeuge mit `writes: true`. */
  writes: Set<string>;
  skipped: { name: string; providerId: string; reason: "collision-host" | "collision-provider" }[];
}

export function mountProviderTools(host: ToolDef[], providers: ProviderOffer[]): MountedTools {
  const defs: ToolDef[] = host.map((d) => ({ ...d }));
  const routes = new Map<string, string>();
  const writes = new Set<string>();
  const skipped: MountedTools["skipped"] = [];
  const hostNames = new Set(host.map((d) => d.name));
  for (const p of providers) {
    for (const t of p.tools) {
      if (hostNames.has(t.name)) { skipped.push({ name: t.name, providerId: p.id, reason: "collision-host" }); continue; }
      if (routes.has(t.name)) { skipped.push({ name: t.name, providerId: p.id, reason: "collision-provider" }); continue; }
      defs.push({ name: t.name, description: t.description, parameters: t.parameters });
      routes.set(t.name, p.id);
      if (t.writes) writes.add(t.name);
    }
  }
  return { defs, routes, writes, skipped };
}

/** Anbieter-Ergebnis → Tool-Ergebnis des Agent-Loops. Bei `not-indexed` darf der Wirt einen
 *  Satz VOR die message setzen (er kennt die Notiz, der Anbieter soll sie fuer eine
 *  Fehlermeldung nicht lesen muessen); ersetzt wird nie. Defensiv gegen eine Antwort, die
 *  den Vertrag verfehlt: lieber ein generischer Satz als eine Ausnahme mitten in der Runde. */
export function outcomeFromProvider(
  r: ProviderResult,
  opts: { notIndexedPrefix?: (path: string) => string } = {},
): ToolOutcome {
  if (!isRecord(r)) return { ok: false, error: "Anbieter-Werkzeug lieferte keine Antwort" };
  if (r.ok === true) return { ok: true, content: typeof r.content === "string" ? r.content : "" };
  const reason = typeof r.reason === "string" ? r.reason : "unbekannt";
  const message = typeof r.message === "string" && r.message !== "" ? r.message : `Anbieter-Werkzeug fehlgeschlagen (${reason})`;
  if (r.reason === "not-indexed" && opts.notIndexedPrefix && typeof r.path === "string") {
    return { ok: false, error: `${opts.notIndexedPrefix(r.path)} ${message}` };
  }
  return { ok: false, error: message };
}
