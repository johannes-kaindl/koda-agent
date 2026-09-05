/* Welche Notizen ein Modus anbietet — ohne Inhalte, ohne IO. Pure.
 *
 * Reihenfolge (Spec E3: „Quelle, dann Ebene, dann Pfad"): aktive Notiz · Manuelles ·
 * Tabs · Links · Backlinks. Innerhalb einer Gruppe bleibt die Eingangsreihenfolge stehen —
 * bei Tabs ist das die Reihenfolge des Workspace, und die ist selbst eine Aussage
 * („was liegt links, was rechts"), die eine alphabetische Sortierung zerstoeren wuerde.
 * Deterministisch ist sie trotzdem: sie kommt aus dem Snapshot, nicht aus einer Menge. */
import type { LinkPort, WorkspaceSnapshot } from "./ports";
import type { Candidate } from "./select";

export interface CandidateInput {
  mode: "note" | "tabs";
  snap: WorkspaceSnapshot;
  links: LinkPort;
  /** Ebenen fuer Links und Backlinks (Einstellung `contextLinkDepth`). Nur im Modus Notiz. */
  linkDepth: number;
  /** Vom Nutzer hinzugefuegte Pfade, in der Reihenfolge des Hinzufuegens. */
  manual: readonly string[];
}

export function collectCandidates(input: CandidateInput): Candidate[] {
  const out: Candidate[] = [];
  const gesehen = new Set<string>();
  const nimm = (c: Candidate): void => {
    if (gesehen.has(c.path)) return;
    gesehen.add(c.path);
    out.push(c);
  };

  const aktiv = input.snap.active;
  if (aktiv !== null) nimm({ source: "active", path: aktiv.path });

  // Manuelles vor Automatischem: es ist die einzige Quelle, die der Nutzer ausdruecklich
  // gewaehlt hat — bei knappem Budget soll sie nicht hinter einer Link-Ebene anstehen.
  for (const p of input.manual) nimm({ source: "manual", path: p });

  if (input.mode === "tabs") {
    for (const tab of input.snap.tabs) nimm({ source: "tab", path: tab.path });
    return out;
  }

  if (aktiv === null) return out;

  // Breitensuche. `grenze` ist die Ebene, deren Nachbarn als naechstes drankommen; die
  // Quelle (link/backlink) stammt aus der ERSTEN Entdeckung und bleibt danach stehen —
  // auf Ebene 2 waere sie ohnehin nicht mehr eindeutig.
  let grenze: string[] = [aktiv.path];
  for (let ebene = 1; ebene <= input.linkDepth; ebene++) {
    const naechste: string[] = [];
    for (const p of grenze) {
      for (const ziel of input.links.outgoing(p)) {
        if (gesehen.has(ziel)) continue;
        nimm({ source: "link", path: ziel, depth: ebene });
        naechste.push(ziel);
      }
    }
    for (const p of grenze) {
      for (const quelle of input.links.backlinks(p)) {
        if (gesehen.has(quelle)) continue;
        nimm({ source: "backlink", path: quelle, depth: ebene });
        naechste.push(quelle);
      }
    }
    grenze = naechste;
    if (grenze.length === 0) break;
  }
  return out;
}
