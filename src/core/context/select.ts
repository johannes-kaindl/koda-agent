/* Wie viel von jedem Kandidaten in den Block darf. Pure.
 *
 * Verfahren: Wasserfuellung. Wer unter seine Scheibe passt, bekommt seinen vollen Text,
 * und der uebrige Rest wird unter den verbleibenden neu aufgeteilt — bis in einer Runde
 * niemand mehr passt; dann bekommen alle Uebrigen dieselbe Scheibe.
 *
 * Bewusste Abweichung von `vault-rag/src/context_source.ts:9` (`budget / paths.length`,
 * gleiche Scheibe fuer jeden), auf die die Spec verweist: die Gleichverteilung verschenkt
 * das Budget, sobald die Eintraege ungleich gross sind. Eine 200-Zeichen-Notiz neben einer
 * 50-KB-Notiz bekaeme dieselbe Scheibe — die Haelfte des Budgets bliebe liegen, waehrend
 * die grosse Notiz gekuerzt wird. „Anteilig" bleibt es trotzdem, nur ohne den Verschnitt. */
import type { ContextSource } from "./types";

export interface Candidate {
  source: ContextSource;
  path: string;
  /** Link-Ebene (1 = direkter Nachbar), nur bei link/backlink. */
  depth?: number;
}

export type LoadedCandidate = Candidate & { content: string };

export interface AllocatedEntry {
  source: ContextSource;
  path: string;
  depth?: number;
  /** Was in den Block geht. */
  shown: string;
  /** Laenge VOR der Kuerzung — die Zahl, die der Block meldet. */
  fullChars: number;
  cut: boolean;
}

export function allocateBudget(entries: readonly LoadedCandidate[], budget: number): AllocatedEntry[] {
  const zuteilung = new Map<number, number>();
  let offen = entries.map((_, i) => i);
  let rest = Math.max(0, budget);

  while (offen.length > 0) {
    const scheibe = Math.floor(rest / offen.length);
    const passend = offen.filter((i) => (entries[i]?.content.length ?? 0) <= scheibe);
    if (passend.length === 0) {
      // Niemand passt mehr: alle Uebrigen bekommen dieselbe Scheibe. Danach ist Schluss —
      // eine weitere Runde wuerde dieselbe Menge noch einmal betrachten (Endlosschleife).
      for (const i of offen) zuteilung.set(i, scheibe);
      break;
    }
    for (const i of passend) {
      const n = entries[i]?.content.length ?? 0;
      zuteilung.set(i, n);
      rest -= n;
    }
    const fertig = new Set(passend);
    offen = offen.filter((i) => !fertig.has(i));
  }

  return entries.map((e, i) => {
    const erlaubt = zuteilung.get(i) ?? 0;
    const cut = e.content.length > erlaubt;
    const out: AllocatedEntry = {
      source: e.source,
      path: e.path,
      shown: cut ? e.content.slice(0, erlaubt) : e.content,
      fullChars: e.content.length,
      cut,
    };
    if (e.depth !== undefined) out.depth = e.depth;
    return out;
  });
}
