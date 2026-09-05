/* Welche Teile des Arbeitsplatzes der Nutzer abgewählt hat. Pure — der Zustand lebt im
 * Plugin, hier steht nur, was er bedeutet.
 *
 * Der tragende Entwurfsgedanke: abgewählt wird der SNAPSHOT, nicht der gerenderte Block.
 * Würde erst der Renderer filtern, müssten Text und `items` zweimal dieselbe Regel treffen —
 * und die Invariante „was im Block steht, steht in items" wäre eine Behauptung statt einer
 * Folge. So ist sie das Ergebnis einer einzigen Filterung davor. */
import type { WorkspaceSnapshot } from "./ports";
import type { ContextSource } from "./types";

export type SelectionKey = string;

/** Quelle UND Pfad, nie nur der Pfad: die aktive Notiz und die Markierung darin tragen
 *  denselben Pfad und sind trotzdem getrennt abwählbar. */
export function itemKey(source: ContextSource, path: string): SelectionKey {
  return `${source}:${path}`;
}

export function applySelection(snap: WorkspaceSnapshot, off: ReadonlySet<SelectionKey>): WorkspaceSnapshot {
  if (off.size === 0) return snap;
  let active = snap.active;
  if (active !== null) {
    if (off.has(itemKey("active", active.path))) active = null;
    else if (off.has(itemKey("selection", active.path))) active = { ...active, selection: "" };
  }
  const tabs = snap.tabs.filter((x) => !off.has(itemKey("tab", x.path)));
  return { active, tabs };
}
