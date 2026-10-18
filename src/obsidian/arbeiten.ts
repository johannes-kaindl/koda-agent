/* Arbeiten lesen und schreiben (Obsidian-Schicht zu `src/core/abilities/`). Gelesen wird ueber Obsidians
 * `metadataCache` — das Frontmatter ist dort schon geparst, verschachtelte Maps inklusive; der Kit-Parser
 * `parseFrontmatter` kennt nur flache Strings. Geschrieben wird per `processFrontMatter`: der Text unter dem
 * Frontmatter und fremde Schluessel bleiben unberuehrt. */
import type { App, TFile } from "obsidian";
import { parseArbeit, type ParsedArbeit } from "../core/abilities/parse";
import { ARBEIT_KEYS } from "../core/abilities/save";
import { ARBEITEN_SUBFOLDER } from "../core/abilities/types";

/** `<Koda-Ordner>/Arbeiten` ohne schliessenden Schraegstrich. */
export function arbeitenDir(kodaFolder: string): string {
  return `${kodaFolder.replace(/\/+$/, "")}/${ARBEITEN_SUBFOLDER}`;
}

/** Liegt der Pfad direkt unter `Arbeiten/`? Flach, case-insensitiv wie `writePolicy` und `readSkills`. */
export function isArbeitPath(path: string, kodaFolder: string): boolean {
  const prefix = `${arbeitenDir(kodaFolder).toLowerCase()}/`;
  const lower = path.toLowerCase();
  return lower.startsWith(prefix) && !lower.slice(prefix.length).includes("/") && lower.endsWith(".md");
}

export function arbeitName(path: string, kodaFolder: string): string {
  return path.slice(arbeitenDir(kodaFolder).length + 1).replace(/\.md$/i, "");
}

export function readArbeiten(app: App, kodaFolder: string): { arbeiten: ParsedArbeit[] } {
  const arbeiten: ParsedArbeit[] = [];
  for (const f of app.vault.getMarkdownFiles()) {
    if (!isArbeitPath(f.path, kodaFolder)) continue;
    const parsed = parseArbeit(arbeitName(f.path, kodaFolder), app.metadataCache.getFileCache(f)?.frontmatter);
    if (parsed !== null) arbeiten.push(parsed);
  }
  arbeiten.sort((a, b) => (a.arbeit.name < b.arbeit.name ? -1 : a.arbeit.name > b.arbeit.name ? 1 : 0));
  return { arbeiten };
}

/** Zuerst alle Arbeits-Schluessel loeschen, dann `fm` zuweisen: so bleibt kein veralteter Eintrag (eine
 *  Abweichung, die inzwischen keine mehr ist) im Frontmatter stehen. */
export async function writeArbeitFrontmatter(app: App, file: TFile, fm: Record<string, unknown>): Promise<void> {
  await app.fileManager.processFrontMatter(file, (target: Record<string, unknown>) => {
    for (const k of ARBEIT_KEYS) delete target[k];
    Object.assign(target, fm);
  });
}
