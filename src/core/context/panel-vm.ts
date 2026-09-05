/* Was der Kontext-Tab zeigt — als reine Funktion des Zustands (UI-STANDARD §4).
 * Der Renderer im Panel baut daraus DOM und trifft keine eigene Entscheidung.
 *
 * Die Größenmessung ruft denselben `renderWorkspaceContext`/`buildFullContext` wie
 * `currentContext()`: die Summenzeile misst damit den Block, der wirklich gesendet wird,
 * statt ihn nachzurechnen. Zwei Wege zu einer Zahl wären zwei Wahrheiten. */
import type { ContentPort, LinkPort, WorkspaceSnapshot } from "./ports";
import type { Candidate } from "./select";
import type { ContextMode, ContextSource } from "./types";
import { applySelection, itemKey, type SelectionKey } from "./selection";
import { dedupeTabs, renderWorkspaceContext } from "./workspace-line";
import { collectCandidates } from "./candidates";
import { buildFullContext } from "./build";

export interface PanelChip {
  source: ContextSource;
  path: string;
  label: string;
  hint: string;
  off: boolean;
  /** Das Kreuz ENTFERNT statt abzuwaehlen — nur bei manuellen Eintraegen. Ein abgewaehlter
   *  manueller Eintrag bliebe sonst fuer immer als Chip ohne Zweck stehen. */
  removable: boolean;
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
  /** Link-Tiefe fuer den Stepper; `null` ausserhalb des Modus Notiz. */
  depth: number | null;
  /** Ob manuelle Eintraege im aktuellen Modus ueberhaupt mitgehen (Spec E1: der
   *  Arbeitsplatz-Block schickt Zeiger, keine Inhalte). */
  manualEnabled: boolean;
}

export interface PanelOptions {
  lang: "de" | "en";
  selectionMax: number;
  tabsMax: number;
  frontmatterMax: number;
  windowTokens: number;
  budget: number;
  linkDepth: number;
  manual: readonly string[];
  links: LinkPort;
  content: ContentPort;
}

const T = {
  de: {
    workspace: "Arbeitsplatz",
    empty: "Keine aktive Notiz — öffne eine Notiz im Hauptbereich.",
    chars: (n: number) => `${n} Z.`,
    summary: (kb: string, pct: number) => `${kb} KB · Fenster ${pct} %`,
    alsoTab: "auch als Tab",
    note: "Notiz",
    tabs: "Tabs",
    manual: "Manuell",
    emptyNote: "Keine aktive Notiz — öffne eine Notiz im Hauptbereich.",
    emptyTabs: "Keine offenen Notizen.",
    emptyManual: "Nichts von Hand hinzugefügt.",
    level: (n: number) => `Ebene ${n}`,
    manualOff: "wirkt in den Modi Notiz und Alle Tabs",
    unreadable: "nicht lesbar",
  },
  en: {
    workspace: "Workspace",
    empty: "No active note — open one in the main area.",
    chars: (n: number) => `${n} chars`,
    summary: (kb: string, pct: number) => `${kb} KB · window ${pct} %`,
    alsoTab: "also a tab",
    note: "Note",
    tabs: "Tabs",
    manual: "Manual",
    emptyNote: "No active note — open one in the main area.",
    emptyTabs: "No open notes.",
    emptyManual: "Nothing added by hand.",
    level: (n: number) => `level ${n}`,
    manualOff: "takes effect in the Note and All tabs modes",
    unreadable: "not readable",
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

function workspaceSection(
  snap: WorkspaceSnapshot,
  off: ReadonlySet<SelectionKey>,
  opts: { lang: "de" | "en"; selectionMax: number; tabsMax: number; frontmatterMax: number; windowTokens: number },
  t: (typeof T)[keyof typeof T],
): PanelSection {
  const chips: PanelChip[] = [];
  const a = snap.active;
  if (a !== null) {
    const activeOff = off.has(itemKey("active", a.path));
    chips.push({ source: "active", path: a.path, label: chipLabel(a.path), hint: "", off: activeOff, removable: false });
    if (a.selection !== "") {
      // Befund 4 (Review 2026-09-05): faellt die aktive Notiz aus dem Block, nimmt sie die
      // Markierung mit (`selection.ts`: `active = null` loescht auch `selection`). Der Chip
      // muss das ANZEIGEN, auch wenn sein eigener `contextOff`-Zustand das nicht sagt — sonst
      // wirkt er "an", obwohl nichts mehr gesendet wird. Der gespeicherte Zustand bleibt
      // unangetastet: wer die Notiz wieder anwaehlt, bekommt seine eigene Markierungs-Abwahl
      // zurueck, nicht die der Notiz.
      const selectionOff = off.has(itemKey("selection", a.path));
      chips.push({
        source: "selection", path: a.path, label: chipLabel(a.path),
        hint: t.chars(a.selection.length), off: activeOff || selectionOff, removable: false,
      });
    }
  }
  // Entdoppelt wie der Block selbst: zwei Chips fuer dieselbe Notiz UNTER DERSELBEN Quelle
  // waeren zwei Schalter fuer einen Zustand — der zweite Klick saehe wirkungslos aus.
  // Die aktive Notiz bleibt trotzdem in der Tab-Liste (wie `renderWorkspaceContext` sie
  // behaelt): der Tab-Eintrag ist ueber `itemKey("tab", path)` unabhaengig vom
  // `active`-Toggle abwaehlbar, und ohne eigenen Chip waere er im Kontext-Tab unsichtbar,
  // aber weiterhin im gesendeten Block — genau der Anteil, den dieser Tab abschaffen soll.
  for (const x of dedupeTabs(snap.tabs)) {
    const isActive = a !== null && x.path === a.path;
    chips.push({
      source: "tab", path: x.path, label: chipLabel(x.path),
      hint: isActive ? t.alsoTab : "", off: off.has(itemKey("tab", x.path)), removable: false,
    });
  }
  return { id: "workspace", title: t.workspace, chips, empty: chips.length === 0 ? t.empty : "" };
}

function sourceSection(
  mode: "note" | "tabs",
  kandidaten: readonly Candidate[],
  manual: ReadonlySet<string>,
  off: ReadonlySet<SelectionKey>,
  groessen: ReadonlyMap<string, { chars: number }>,
  t: (typeof T)[keyof typeof T],
): PanelSection {
  // Ausgeblendet wird nach PFAD, nicht nach `c.source` (Ruling 2026-09-05, Korrektur zu
  // `0ab7e52`): `collectCandidates` nimmt die aktive Notiz VOR dem manuellen Eintrag und
  // dedupliziert nach Pfad (`candidates.ts`) — eine Notiz, die zugleich aktiv UND von Hand
  // hinzugefuegt ist, traegt hier also `source: "active"`, obwohl ihr Zuhause im Panel der
  // Abschnitt Manuell ist. Ein Filter auf `c.source !== "manual"` (der Fehlversuch aus
  // `0ab7e52`) uebersieht genau diesen Fall, weil der interne Quellname nur ein
  // Implementierungsdetail der Entdopplung ist, kein Merkmal fuer die Anzeige. Das bleibt
  // trotzdem KEINE zweite Filterung im verbotenen Sinn (die waere eine zweite Anwendung
  // der Abwahl-Regel `off`, und die gibt es genau einmal, in `buildFullContext`) — es ist
  // eine Aufteilung der ANZEIGE nach Quelle, und genau dafuer sind Abschnitte da. Die
  // Kandidatenliste, die in `buildFullContext` geht, bleibt unangetastet; es aendert sich
  // nur, in welchem Abschnitt ein Chip erscheint.
  const chips: PanelChip[] = kandidaten
    .filter((c) => !manual.has(c.path))
    .map((c) => {
      const chipOff = off.has(itemKey(c.source, c.path));
      const groesse = groessen.get(`${c.source}:${c.path}`);
      const teile: string[] = [];
      if (groesse !== undefined) teile.push(t.chars(groesse.chars));
      if (c.depth !== undefined) teile.push(t.level(c.depth));
      return {
        source: c.source, path: c.path, label: chipLabel(c.path),
        hint: teile.join(", "), off: chipOff, removable: false,
      };
    });
  const id = mode === "note" ? "note" : "tabs";
  const title = mode === "note" ? t.note : t.tabs;
  const empty = mode === "note" ? t.emptyNote : t.emptyTabs;
  return { id, title, chips, empty: chips.length === 0 ? empty : "" };
}

function manualSection(
  manual: readonly string[],
  kandidatenByPath: ReadonlyMap<string, Candidate>,
  off: ReadonlySet<SelectionKey>,
  groessen: ReadonlyMap<string, { chars: number }>,
  enabled: boolean,
  t: (typeof T)[keyof typeof T],
): PanelSection {
  const chips: PanelChip[] = manual.map((path) => {
    const kandidat = kandidatenByPath.get(path);
    // Der Schluessel eines Chips ist der Schluessel SEINES KANDIDATEN, nicht "manual:pfad"
    // (Ruling 2026-09-05): sonst laese `off` fuer diesen Pfad einen anderen Schluessel, als
    // `build.ts` beim Filtern schreibt (`itemKey(c.source, c.path)`) — der Chip zeigte dann
    // dauerhaft "an", egal was tatsaechlich gesendet wird. Ist der Pfad ein Kandidat
    // geworden (jeder Fall ausser Arbeitsplatz, wo `collectCandidates` gar nicht laeuft),
    // uebernimmt der Chip dessen Quelle UND Groesse; nur ohne Kandidat bleibt es beim
    // Schluessel "manual:pfad" und dem Hinweis, dass er hier nicht wirkt — den liest dann
    // ohnehin niemand.
    if (kandidat !== undefined) {
      const chipOff = off.has(itemKey(kandidat.source, path));
      const groesse = groessen.get(`${kandidat.source}:${path}`);
      const teile: string[] = [];
      if (groesse !== undefined) teile.push(t.chars(groesse.chars));
      // Befund 6 (Abschluss-Review): eine fehlende Groesse OHNE Abwahl heisst nicht
      // "nichts zu zeigen", sondern `build.ts` hat `content.read()` mit `null` verworfen —
      // die Datei ist weg oder unlesbar. Bei Abwahl fehlt die Groesse ebenfalls (gefiltert
      // wird VOR dem Lesen), das ist aber der Normalfall und braucht keinen Hinweis.
      else if (!chipOff) teile.push(t.unreadable);
      if (kandidat.depth !== undefined) teile.push(t.level(kandidat.depth));
      return {
        source: kandidat.source, path, label: chipLabel(path),
        hint: teile.join(", "), off: chipOff, removable: true,
      };
    }
    return {
      source: "manual" as const, path, label: chipLabel(path),
      hint: enabled ? "" : t.manualOff,
      off: off.has(itemKey("manual", path)),
      removable: true,
    };
  });
  return { id: "manual", title: t.manual, chips, empty: chips.length === 0 ? t.emptyManual : "" };
}

export async function buildPanelViewModel(
  mode: Exclude<ContextMode, "off" | "vault">,
  snap: WorkspaceSnapshot,
  off: ReadonlySet<SelectionKey>,
  opts: PanelOptions,
): Promise<PanelViewModel> {
  const t = T[opts.lang];
  const sections: PanelSection[] = [];
  const manualEnabled = mode !== "workspace";
  const manualSet = new Set(opts.manual);
  let kandidatenByPath: ReadonlyMap<string, Candidate> = new Map();
  let groessen: ReadonlyMap<string, { chars: number }> = new Map();

  let text: string;
  if (mode === "workspace") {
    sections.push(workspaceSection(snap, off, opts, t));
    text = renderWorkspaceContext(applySelection(snap, off), opts).text;
  } else {
    // Chips kommen aus der UNGEFILTERTEN Kandidatenliste: ein abgewaehlter Eintrag muss
    // sichtbar bleiben, sonst gaebe es keinen Weg zurueck. Die GROESSEN kommen dagegen aus
    // dem gefilterten Block — es gibt also genau EINE Filterung (in `buildFullContext`),
    // und die Chip-Liste leitet keine zweite ab. Genau hier riss in Etappe 2a der einzige
    // Riss auf, der kein Task-Review sah.
    const ctx = await buildFullContext({
      mode, snap, links: opts.links, content: opts.content,
      manual: opts.manual, off, linkDepth: opts.linkDepth, budget: opts.budget, lang: opts.lang,
    });
    groessen = new Map(ctx.items.map((i) => [`${i.source}:${i.path}`, i]));
    const kandidaten = collectCandidates({
      mode, snap, links: opts.links, linkDepth: opts.linkDepth, manual: opts.manual,
    });
    kandidatenByPath = new Map(kandidaten.map((c) => [c.path, c]));
    sections.push(sourceSection(mode, kandidaten, manualSet, off, groessen, t));
    text = ctx.text;
  }
  sections.push(manualSection(opts.manual, kandidatenByPath, off, groessen, manualEnabled, t));

  const kb = (text.length / 1024).toFixed(1);
  const pct = Math.min(100, Math.round((text.length / CHARS_PER_TOKEN / Math.max(1, opts.windowTokens)) * 100));
  return {
    sections,
    chars: text.length,
    summary: t.summary(kb, pct),
    state: pct >= WARN_AT * 100 ? "is-warning" : "is-ok",
    hasOff: off.size > 0 || opts.manual.length > 0,
    depth: mode === "note" ? opts.linkDepth : null,
    manualEnabled,
  };
}
