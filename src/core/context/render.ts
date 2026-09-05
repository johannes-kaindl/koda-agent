/* Volltext-Block: Ueberschrift je Notiz, Inhalt darunter, Kuerzung mit beiden Zahlen.
 * Form nach vault-rags `buildContext` (`## <pfad>` + Inhalt), erweitert um Herkunft und
 * Kuerzungs-Meldung. Text UND items entstehen in EINER Schleife aus DERSELBEN Liste —
 * die Invariante „was im Block steht, steht in items" ist damit eine Folge, keine
 * Behauptung (dieselbe Bauart wie `workspace-line.ts`). Pure. */
import type { AllocatedEntry } from "./select";
import type { ContextAttachment, ContextItem, ContextSource } from "./types";

type Lang = "de" | "en";

/** Was `headerLine`/`herkunft` braucht — genau die Felder, die schon vor dem Lesen des
 *  Inhalts feststehen (Candidate wie AllocatedEntry erfuellen das). */
export interface EntryHead {
  source: ContextSource;
  path: string;
  depth?: number;
}

const T = {
  de: {
    head: (m: string) => `[Arbeitskontext · ${m}]`,
    mode: { note: "Notiz", tabs: "Alle Tabs" },
    src: { active: "aktive Notiz", manual: "manuell hinzugefügt", tab: "offener Tab", link: "verlinkt", backlink: "verlinkt hierher" },
    level: (n: number) => `, Ebene ${n}`,
    cut: (a: number, b: number, p: string) => `[gekürzt: ${a} von ${b} Zeichen — vollständig über read_note("${p}")]`,
    empty: "nichts ausgewählt — der Kontext-Tab in Kodas Seitenleiste zeigt, was zur Auswahl steht.",
  },
  en: {
    head: (m: string) => `[Working context · ${m}]`,
    mode: { note: "Note", tabs: "All tabs" },
    src: { active: "active note", manual: "added by hand", tab: "open tab", link: "linked from here", backlink: "links to here" },
    level: (n: number) => `, level ${n}`,
    cut: (a: number, b: number, p: string) => `[cut: ${a} of ${b} chars — full text via read_note("${p}")]`,
    empty: "nothing selected — the Context tab in Koda's sidebar shows what is on offer.",
  },
} as const;

function herkunft(e: EntryHead, t: (typeof T)[Lang]): string {
  const name = (t.src as Record<string, string>)[e.source] ?? e.source;
  return e.depth === undefined ? name : `${name}${t.level(e.depth)}`;
}

/** Die Ueberschriftszeile — ohne Inhalt, deshalb schon VOR dem Budgetieren bekannt.
 *  Genutzt sowohl beim Rendern als auch bei der Abschaetzung des Budget-Overheads
 *  (Befund 2: die Ueberschrift ist Teil des Blocks, nicht daneben). */
export function headerLine(e: EntryHead, lang: Lang): string {
  return `## ${e.path} (${herkunft(e, T[lang])})`;
}

/** Die Kuerzungs-Meldung, isoliert exportiert aus demselben Grund wie `headerLine`. */
export function cutMessage(shown: number, full: number, path: string, lang: Lang): string {
  return T[lang].cut(shown, full, path);
}

export function renderFullContext(
  entries: readonly AllocatedEntry[],
  mode: "note" | "tabs",
  lang: Lang,
): ContextAttachment {
  const t = T[lang];
  const bloecke: string[] = [t.head(t.mode[mode])];
  const items: ContextItem[] = [];

  if (entries.length === 0) {
    bloecke.push(t.empty);
    return { mode, items, text: bloecke.join("\n") };
  }

  for (const e of entries) {
    const kopf = headerLine(e, lang);
    const meldung = e.cut ? `\n${cutMessage(e.shown.length, e.fullChars, e.path, lang)}` : "";
    bloecke.push(`${kopf}\n${e.shown}${meldung}`);
    const item: ContextItem = { source: e.source, path: e.path, kind: "full", chars: e.shown.length };
    if (e.cut) item.fullChars = e.fullChars;
    if (e.depth !== undefined) item.depth = e.depth;
    items.push(item);
  }
  return { mode, items, text: bloecke.join("\n\n") };
}
