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
import { renderFullContext } from "./render";
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

  return renderFullContext(allocateBudget(geladen, opts.budget), opts.mode, opts.lang);
}
