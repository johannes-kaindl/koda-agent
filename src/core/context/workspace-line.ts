/* Der Arbeitsplatz-Block (Modus „Arbeitsplatz"): nur Zeiger, keine Inhalte — Inhalte holt
 * das Modell mit read_note oder get_workspace (Spec E1/E3). Kappungen sind Einstellungen
 * und melden sich im Block; nichts verschwindet still. Pure. */
import type { WorkspaceSnapshot } from "./ports";
import type { ContextAttachment, ContextItem } from "./types";

type Lang = "de" | "en";

export interface WorkspaceLineOptions {
  lang: Lang;
  /** Kappung der Markierung in Zeichen (Einstellung `contextSelectionChars`). */
  selectionMax: number;
  /** Tab-Pfade im Block (Einstellung `contextTabsMax`). */
  tabsMax: number;
  /** Kopfdaten in Zeichen; 0 = keine Zeile (Einstellung `contextFrontmatterChars`). */
  frontmatterMax: number;
}

const T = {
  de: {
    head: "[Arbeitskontext · Arbeitsplatz]",
    active: "Aktive Notiz",
    none: "keine (kein Editor im Hauptbereich)",
    line: (a: number, b: number) => `Zeile ${a} von ${b}`,
    props: "Kopfdaten",
    sel: (n: number) => `Markierung (${n} Zeichen)`,
    selCut: (n: number, m: number) => `Markierung (${n} Zeichen, gekürzt auf ${m}, vollständig über get_workspace)`,
    tabs: (n: number) => `Offene Tabs (${n})`,
    tabsNone: "Offene Tabs: keine",
    more: (n: number) => `… und ${n} weitere (vollständig über get_workspace)`,
    hint: "Inhalte auf Anfrage: read_note(<pfad>) · get_workspace() für Cursor-Umgebung und alle Tabs.",
    around: (a: number, b: number) => `Cursor-Umgebung (Zeilen ${a}–${b}):`,
  },
  en: {
    head: "[Working context · Workspace]",
    active: "Active note",
    none: "none (no editor in the main area)",
    line: (a: number, b: number) => `line ${a} of ${b}`,
    props: "Properties",
    sel: (n: number) => `Selection (${n} chars)`,
    selCut: (n: number, m: number) => `Selection (${n} chars, cut to ${m}, full text via get_workspace)`,
    tabs: (n: number) => `Open tabs (${n})`,
    tabsNone: "Open tabs: none",
    more: (n: number) => `… and ${n} more (full list via get_workspace)`,
    hint: "Contents on request: read_note(<path>) · get_workspace() for the cursor surroundings and every tab.",
    around: (a: number, b: number) => `Cursor surroundings (lines ${a}–${b}):`,
  },
} as const;

function scalar(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(scalar).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  return JSON.stringify(v) ?? "";
}

/** `position` ist Obsidians Cache-Zusatz, kein Feld des Nutzers. */
export function renderFrontmatter(fm: Record<string, unknown> | null, max: number): string {
  if (fm === null || max <= 0) return "";
  const text = Object.entries(fm)
    .filter(([k]) => k !== "position")
    .map(([k, v]) => `${k}: ${scalar(v)}`)
    .join(" · ");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Derselbe Pfad in zwei Tabs (Split, zweites Fenster) ist fuer das Modell null
 *  Information — und er kostet einen Platz in `tabsMax`, verdraengt also einen echten Tab.
 *  Deshalb VOR der Kappung entdoppelt, nicht danach; der erste Eintrag gewinnt. Die aktive
 *  Notiz bleibt in der Liste: dass sie offen ist, gehoert zur Antwort „was ist offen",
 *  und sie herauszunehmen zwaenge das Modell, zwei Listen zu vereinigen.
 *  (Entscheidung Johannes, 2026-09-05, Review-Minor 17 der Etappe 1.) */
export function dedupeTabs(tabs: WorkspaceSnapshot["tabs"]): WorkspaceSnapshot["tabs"] {
  const seen = new Set<string>();
  return tabs.filter((x) => (seen.has(x.path) ? false : (seen.add(x.path), true)));
}

export function renderWorkspaceContext(snap: WorkspaceSnapshot, opts: WorkspaceLineOptions): ContextAttachment {
  const t = T[opts.lang];
  const lines: string[] = [t.head];
  const items: ContextItem[] = [];
  const a = snap.active;
  if (a === null) {
    lines.push(`${t.active}: ${t.none}`);
  } else {
    const where = a.cursorLine !== null && a.lineCount !== null ? ` · ${t.line(a.cursorLine, a.lineCount)}` : "";
    const activeLine = `${t.active}: ${a.path}${where}`;
    lines.push(activeLine);
    items.push({ source: "active", path: a.path, kind: "pointer", chars: activeLine.length });
    const props = renderFrontmatter(a.frontmatter, opts.frontmatterMax);
    if (props !== "") lines.push(`${t.props}: ${props}`);
    if (a.selection !== "") {
      const cut = a.selection.length > opts.selectionMax;
      const shown = cut ? a.selection.slice(0, opts.selectionMax) : a.selection;
      lines.push(`${cut ? t.selCut(a.selection.length, opts.selectionMax) : t.sel(a.selection.length)}: „${shown}“`);
      const item: ContextItem = { source: "selection", path: a.path, kind: "pointer", chars: shown.length };
      if (cut) item.fullChars = a.selection.length;
      items.push(item);
    }
  }
  const tabs = dedupeTabs(snap.tabs);
  if (tabs.length === 0) {
    lines.push(t.tabsNone);
  } else {
    const shown = tabs.slice(0, opts.tabsMax);
    const rest = tabs.length - shown.length;
    lines.push(`${t.tabs(tabs.length)}: ${shown.map((x) => x.path).join(" · ")}${rest > 0 ? ` ${t.more(rest)}` : ""}`);
    for (const x of shown) items.push({ source: "tab", path: x.path, kind: "pointer", chars: x.path.length });
  }
  lines.push(t.hint);
  return { mode: "workspace", items, text: lines.join("\n") };
}

/** Text fuer `get_workspace`: dieselbe Quelle wie der Block, aber vollstaendig.
 *  `frontmatterMax` wird hier GESPALTEN gelesen (Entscheidung Johannes, 2026-09-05,
 *  Review-Minor 14): ein Wert > 0 ist eine Kappung und gilt nur dem Block — der Bericht
 *  liefert die Kopfdaten vollstaendig, wie er es bei Markierung und Tab-Liste auch tut.
 *  Die 0 ist dagegen keine Kappung, sondern eine Abwahl (nur dieses Feld kann ueberhaupt
 *  auf 0; `contextSelectionChars` beginnt bei 100, `contextTabsMax` bei 1) — wer sie
 *  waehlt, meint „nicht", nicht „kuerzer", und das gilt auch hier. */
export function renderWorkspaceReport(
  snap: WorkspaceSnapshot,
  around: { from: number; lines: string[] } | null,
  lang: Lang,
  frontmatterMax: number,
): string {
  const t = T[lang];
  const out: string[] = [];
  const a = snap.active;
  if (a === null) {
    out.push(`${t.active}: ${lang === "de" ? "keine" : "none"}`);
  } else {
    const where = a.cursorLine !== null && a.lineCount !== null ? ` · ${t.line(a.cursorLine, a.lineCount)}` : "";
    out.push(`${t.active}: ${a.path}${where}`);
    const props = renderFrontmatter(a.frontmatter, frontmatterMax <= 0 ? 0 : Number.MAX_SAFE_INTEGER);
    if (props !== "") out.push(`${t.props}: ${props}`);
    if (a.selection !== "") out.push(`${t.sel(a.selection.length)}:\n${a.selection}`);
    if (around !== null && around.lines.length > 0) {
      const to = around.from + around.lines.length - 1;
      const width = String(to).length;
      out.push(`${t.around(around.from, to)}\n${around.lines.map((l, i) => `${String(around.from + i).padStart(width + 3)} | ${l}`).join("\n")}`);
    }
  }
  const tabs = dedupeTabs(snap.tabs);
  if (tabs.length === 0) out.push(t.tabsNone);
  else out.push(`${t.tabs(tabs.length)}:\n${tabs.map((x) => `- ${x.path} (${x.viewType})`).join("\n")}`);
  return out.join("\n\n");
}
