// tree.ts — Ordnerbaum fuer `list_notes` mit `depth`. Rein: kein obsidian-Import (check:pure).
//
// Warum es das gibt: Koda fragte am 2026-09-26 nach einer „Landkarte" des Vaults — ob jeder
// Projektordner die Standard-Struktur traegt, liess sich mit der flachen Liste nur mit einem
// Aufruf je Projekt beantworten. Bewusst KEIN eigenes Werkzeug, sondern ein Parameter an
// `list_notes`: jedes weitere Werkzeug macht lokale Modelle bei der Auswahl unsicherer
// (docs/LAB.md), und `list_notes` waehlt Koda schon zuverlaessig. Aus demselben Grund steht
// seit 0.15.2 die Unterordner-Zeile im Ergebnis des Werkzeugs, das Koda ohnehin ruft.
//
// Was der Baum NICHT sagt: ob ein Ordner fehlt, der da sein sollte. Das ist eine Konvention
// des Vaults, keine Eigenschaft der Struktur — strukturelle Aussagen gehoeren ins Werkzeug,
// das Urteil gegen einen Soll-Stand ins Gespraech (oder in einen Skill, der ihn beschreibt).

import { cell, countLabel, knownFolders, nf } from "./list";

export interface TreeNode { path: string; level: number; notes: number }

/** `total` zaehlt alle Ordner bis zur angefragten Tiefe; `completeTo` ist die tiefste Ebene,
 *  die vollstaendig in `nodes` steht (0 = nicht einmal die erste). */
export interface FolderTree { nodes: TreeNode[]; total: number; completeTo: number }

/** Alle Ordner unter `folder` bis Tiefe `depth`, in Baum-Reihenfolge, je mit der Zahl der
 *  Notizen darunter (rekursiv gezaehlt, wie die Unterordner-Zeile von `list_notes`).
 *
 *  Gekappt wird nach GANZEN Ebenen: passen nicht alle Ordner bis `depth` unter `max`, wird
 *  die tiefste Ebene, die noch ganz passt, vollstaendig gezeigt und die naechste gar nicht.
 *  Ein halb gezeigter Ebene-2-Stand liesse einen Projektordner ohne `_Tasks` aussehen, obwohl
 *  er eines hat — genau die Aussage, fuer die jemand den Baum anfordert. Passt schon Ebene 1
 *  nicht, stehen deren erste `max` Ordner da und `completeTo` ist 0. */
export function collectFolderTree(
  allPaths: string[], folderPaths: string[], folder: string, depth: number, max: number,
): FolderTree {
  const prefix = folder === "" ? "" : `${nf(folder)}/`;
  const notesPaths = allPaths.map(nf);
  const all: (TreeNode & { key: string[] })[] = [];
  for (const [n, original] of knownFolders(allPaths, folderPaths)) {
    if (!n.startsWith(prefix)) continue;
    const rest = n.slice(prefix.length);
    if (rest === "") continue;
    const key = rest.split("/");
    if (key.length > depth) continue;
    const notes = notesPaths.filter((p) => p.startsWith(`${n}/`)).length;
    all.push({ path: original, level: key.length, notes, key });
  }

  const perLevel: number[] = [];
  for (const node of all) perLevel[node.level] = (perLevel[node.level] ?? 0) + 1;
  let completeTo = 0;
  let used = 0;
  for (let l = 1; l <= depth; l++) {
    const count = perLevel[l] ?? 0;
    if (used + count > max) break;
    used += count;
    completeTo = l;
  }

  let kept = all.filter((node) => node.level <= completeTo);
  if (completeTo === 0) kept = all.filter((node) => node.level === 1).sort(bySegments).slice(0, max);
  const nodes = kept.sort(bySegments).map(({ path, level, notes }) => ({ path, level, notes }));
  return { nodes, total: all.length, completeTo: Math.min(completeTo, depth) };
}

/** Baum-Reihenfolge: segmentweise vergleichen, nicht als Zeichenkette — sonst stuende
 *  `P-x` zwischen `P` und `P/A`, weil `-` vor `/` sortiert. Standard-Ordnung (Codepoints)
 *  wie ueberall in list.ts: deterministisch ueber ICU-Versionen hinweg. */
function bySegments(a: { key: string[] }, b: { key: string[] }): number {
  const n = Math.min(a.key.length, b.key.length);
  for (let i = 0; i < n; i++) {
    if (a.key[i] !== b.key[i]) return a.key[i] < b.key[i] ? -1 : 1;
  }
  return a.key.length - b.key.length;
}

/** Eingerueckt je Ebene, aber mit VOLLEM Pfad je Zeile: ein Modell soll einen Ordner direkt
 *  an `list_notes` weitergeben koennen, statt ihn aus Einrueckung zusammenzusetzen. Der
 *  Schraegstrich am Ende kennzeichnet die Zeile als Ordner. */
export function formatFolderTree(tree: FolderTree, depth: number): string {
  if (tree.total === 0) return `Ordnerbaum bis Tiefe ${depth}: keine Unterordner.`;
  const head = `Ordnerbaum bis Tiefe ${depth} (${tree.total} Ordner; Zahl = Notizen darin, Unterordner mitgezählt):`;
  const lines = tree.nodes.map((n) => `${"  ".repeat(n.level - 1)}${cell(n.path)}/ (${countLabel(n.notes)})`);
  return [head, ...lines].join("\n");
}

/** Die Kappungswarnung gehoert in Zeile 1 des Gesamtergebnisses (dieselbe Regel wie bei der
 *  Notizliste) — deshalb liefert der Baum sie getrennt vom Block. */
export function treeWarning(tree: FolderTree, depth: number): string | null {
  if (tree.nodes.length >= tree.total) return null;
  const complete = tree.completeTo === 0
    ? "nicht einmal Tiefe 1 ist vollständig"
    : `vollständig bis Tiefe ${tree.completeTo}`;
  return `⚠ ORDNERBAUM GEKAPPT: ${tree.total} Ordner bis Tiefe ${depth}, ${tree.nodes.length} gezeigt — ${complete}. Wähle einen tieferen Startordner oder eine kleinere depth, bevor du sagst, ein Ordner fehle.`;
}

export interface TreeBlock { text: string; warning: string | null }

export function renderTreeBlock(tree: FolderTree, depth: number): TreeBlock {
  return { text: formatFolderTree(tree, depth), warning: treeWarning(tree, depth) };
}
