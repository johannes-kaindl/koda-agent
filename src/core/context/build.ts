/* Die einzige Stelle, an der ein Volltext-Block entsteht. Pure — alles Aeussere kommt
 * ueber Ports herein.
 *
 * Reihenfolge ist Absicht: gefiltert wird VOR dem Lesen. Eine abgewaehlte Notiz kostet
 * dadurch keinen Dateizugriff, und die Invariante aus `selection.ts` gilt weiter — es
 * gibt nur EINE Filterung, und sie liegt vor dem Rendern. */
import type { ContentPort, LinkPort, WorkspaceSnapshot } from "./ports";
import type { ContextAttachment } from "./types";
import { collectCandidates } from "./candidates";
import { allocateBudget, type LoadedCandidate } from "./select";
import { renderFullContext, headerLine, cutMessage } from "./render";
import { itemKey, type SelectionKey } from "./selection";

export interface BuildOptions {
  mode: "note" | "tabs";
  snap: WorkspaceSnapshot;
  links: LinkPort;
  content: ContentPort;
  manual: readonly string[];
  off: ReadonlySet<SelectionKey>;
  linkDepth: number;
  budget: number;
  lang: "de" | "en";
}

/** Fixe Zeichenlast eines Eintrags, die `allocateBudget` nicht sieht, weil sie erst beim
 *  Rendern entsteht: Ueberschrift, Trenner zwischen Bloecken, und — als sichere Obergrenze,
 *  weil die tatsaechliche Kuerzung von der Budget-Verteilung selbst abhaengt — die
 *  Kuerzungs-Meldung. Ohne diesen Abzug verteilt `allocateBudget` das volle Budget auf
 *  reinen Inhalt, und der gerenderte Block ueberschreitet die Einstellung um ein Vielfaches
 *  (Befund 2: bei 300 Eintraegen à 3000 Zeichen und Budget 20000 kamen so 58604 Zeichen heraus).
 *  Der gezeigte Wert in der Kuerzungs-Meldung kann hoechstens so viele Ziffern haben wie der
 *  volle Wert (gezeigt <= voll) — eine Ziffernfolge aus Neunen derselben Laenge ist damit eine
 *  sichere Obergrenze fuer die Meldungslaenge, ganz ohne die Budget-Verteilung vorwegzunehmen. */
function overheadFor(c: LoadedCandidate, lang: BuildOptions["lang"]): number {
  const header = headerLine(c, lang);
  const obergrenze = Number("9".repeat(String(c.content.length).length || 1));
  const meldung = cutMessage(obergrenze, c.content.length, c.path, lang);
  return header.length + 1 /* Zeilenumbruch vor dem Inhalt */
    + 2 /* Bloecke werden mit "\n\n" verbunden */
    + meldung.length + 1 /* Zeilenumbruch vor der Meldung, falls gekuerzt wird */;
}

export async function buildFullContext(opts: BuildOptions): Promise<ContextAttachment> {
  const kandidaten = collectCandidates({
    mode: opts.mode, snap: opts.snap, links: opts.links,
    linkDepth: opts.linkDepth, manual: opts.manual,
  }).filter((c) => !opts.off.has(itemKey(c.source, c.path)));

  const geladen: LoadedCandidate[] = [];
  for (const c of kandidaten) {
    const text = await opts.content.read(c.path);
    if (text === null) continue;
    geladen.push({ ...c, content: text });
  }

  const overhead = geladen.reduce((sum, c) => sum + overheadFor(c, opts.lang), 0);
  const inhaltsBudget = Math.max(0, opts.budget - overhead);
  return renderFullContext(allocateBudget(geladen, inhaltsBudget), opts.mode, opts.lang);
}
