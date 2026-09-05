/* Was der Kontext-Tab zeigt — als reine Funktion des Zustands (UI-STANDARD §4).
 * Der Renderer im Panel baut daraus DOM und trifft keine eigene Entscheidung.
 *
 * Die Größenmessung ruft denselben `renderWorkspaceContext` wie `currentContext()`: die
 * Summenzeile misst damit den Block, der wirklich gesendet wird, statt ihn nachzurechnen.
 * Zwei Wege zu einer Zahl wären zwei Wahrheiten. */
import type { WorkspaceSnapshot } from "./ports";
import type { ContextSource } from "./types";
import { applySelection, itemKey, type SelectionKey } from "./selection";
import { dedupeTabs, renderWorkspaceContext } from "./workspace-line";

export interface PanelChip {
  source: ContextSource;
  path: string;
  label: string;
  hint: string;
  off: boolean;
}
export interface PanelSection {
  id: string;
  title: string;
  chips: PanelChip[];
  empty: string;
}
export interface PanelViewModel {
  sections: PanelSection[];
  chars: number;
  summary: string;
  state: "is-ok" | "is-warning";
  hasOff: boolean;
}

const T = {
  de: {
    workspace: "Arbeitsplatz",
    empty: "Keine aktive Notiz — öffne eine Notiz im Hauptbereich.",
    chars: (n: number) => `${n} Z.`,
    summary: (kb: string, pct: number) => `${kb} KB · Fenster ${pct} %`,
  },
  en: {
    workspace: "Workspace",
    empty: "No active note — open one in the main area.",
    chars: (n: number) => `${n} chars`,
    summary: (kb: string, pct: number) => `${kb} KB · window ${pct} %`,
  },
} as const;

/** Dateiname ohne Ordner und ohne `.md`. Der volle Pfad steht im Tooltip des Chips —
 *  in einer schmalen Sidebar ist er als Beschriftung unbrauchbar. */
function chipLabel(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  return base.endsWith(".md") ? base.slice(0, -3) : base;
}

/** Dieselbe grobe Schätzung wie die Verdichtung (`context-usage.ts`): 4 Zeichen ≈ 1 Token.
 *  Genauer wäre ein Tokenizer, den Koda nicht hat und für eine Anzeige nicht braucht. */
const CHARS_PER_TOKEN = 4;
const WARN_AT = 0.8;

export function buildPanelViewModel(
  snap: WorkspaceSnapshot,
  off: ReadonlySet<SelectionKey>,
  opts: { lang: "de" | "en"; selectionMax: number; tabsMax: number; frontmatterMax: number; windowTokens: number },
): PanelViewModel {
  const t = T[opts.lang];
  const chips: PanelChip[] = [];
  const a = snap.active;
  if (a !== null) {
    chips.push({ source: "active", path: a.path, label: chipLabel(a.path), hint: "", off: off.has(itemKey("active", a.path)) });
    if (a.selection !== "") {
      chips.push({
        source: "selection", path: a.path, label: chipLabel(a.path),
        hint: t.chars(a.selection.length), off: off.has(itemKey("selection", a.path)),
      });
    }
  }
  // Entdoppelt wie der Block selbst: zwei Chips für dieselbe Notiz wären zwei Schalter für
  // einen Zustand — der zweite Klick sähe wirkungslos aus.
  for (const x of dedupeTabs(snap.tabs)) {
    if (a !== null && x.path === a.path) continue;
    chips.push({ source: "tab", path: x.path, label: chipLabel(x.path), hint: "", off: off.has(itemKey("tab", x.path)) });
  }

  const gefiltert = applySelection(snap, off);
  const text = renderWorkspaceContext(gefiltert, opts).text;
  const kb = (text.length / 1024).toFixed(1);
  const pct = Math.min(100, Math.round((text.length / CHARS_PER_TOKEN / Math.max(1, opts.windowTokens)) * 100));

  return {
    sections: [{ id: "workspace", title: t.workspace, chips, empty: chips.length === 0 ? t.empty : "" }],
    chars: text.length,
    summary: t.summary(kb, pct),
    state: pct >= WARN_AT * 100 ? "is-warning" : "is-ok",
    hasOff: off.size > 0,
  };
}
