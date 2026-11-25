/* Speicher-Vault für den Messrahmen: erfüllt den Port `VaultPort` (src/obsidian/vault-tools.ts) ohne Obsidian. Jede
   Datei liegt als Text in einer Map; jeder Schreibvorgang landet zusätzlich im Protokoll, damit der Prüfer „kein Schreiben
   außerhalb“ am Vorgang misst und nicht nur am Endzustand (ein Anlegen und Wieder-Löschen hinterließe sonst keine Spur). */
import type { VaultPort } from "../../src/obsidian/vault-tools";
import { parseFrontmatter } from "../../src/vendor/kit/frontmatter";

export interface Schreibvorgang {
  art: "create" | "append" | "overwrite" | "move" | "trash";
  pfad: string;
  /** Nur bei `move`: das Ziel. */
  ziel?: string;
}

export class SpeicherVault implements VaultPort {
  readonly dateien = new Map<string, string>();
  readonly ordner = new Set<string>();
  readonly protokoll: Schreibvorgang[] = [];

  constructor(start: Record<string, string>) {
    for (const [p, c] of Object.entries(start)) this.setze(p, c);
  }

  private setze(pfad: string, inhalt: string): void {
    this.dateien.set(pfad, inhalt);
    const teile = pfad.split("/").slice(0, -1);
    for (let i = 1; i <= teile.length; i++) this.ordner.add(teile.slice(0, i).join("/"));
  }

  private muss(pfad: string): string {
    const c = this.dateien.get(pfad);
    if (c === undefined) throw new Error(`nicht gefunden: ${pfad}`);
    return c;
  }

  /** Der Endzustand als einfaches Objekt (für Prüfer und Bericht). */
  stand(): Record<string, string> {
    return Object.fromEntries([...this.dateien.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }

  listMarkdownPaths(): string[] {
    return [...this.dateien.keys()].filter((p) => p.toLowerCase().endsWith(".md"));
  }
  listOtherReadablePaths(): string[] {
    return [...this.dateien.keys()].filter((p) => /\.(base|canvas)$/i.test(p));
  }
  listFolderPaths(): string[] {
    return [...this.ordner];
  }
  async read(path: string): Promise<string> {
    return this.muss(path);
  }
  async exists(path: string): Promise<boolean> {
    return this.dateien.has(path);
  }
  async create(path: string, content: string): Promise<void> {
    if (this.dateien.has(path)) throw new Error(`existiert schon: ${path}`);
    this.protokoll.push({ art: "create", pfad: path });
    this.setze(path, content);
  }
  async append(path: string, content: string): Promise<void> {
    const alt = this.muss(path);
    this.protokoll.push({ art: "append", pfad: path });
    this.dateien.set(path, alt + content);
  }
  async overwrite(path: string, content: string): Promise<void> {
    this.protokoll.push({ art: "overwrite", pfad: path });
    this.setze(path, content);
  }
  frontmatterOf(path: string): Record<string, unknown> | null {
    const c = this.dateien.get(path);
    if (c === undefined) return null;
    const fm = parseFrontmatter(c);
    return fm.order.length === 0 ? null : fm.data;
  }
  async move(from: string, to: string): Promise<void> {
    const c = this.muss(from);
    if (this.dateien.has(to)) throw new Error(`Ziel existiert schon: ${to}`);
    this.protokoll.push({ art: "move", pfad: from, ziel: to });
    this.dateien.delete(from);
    this.setze(to, c);
  }
  async trash(path: string): Promise<void> {
    this.muss(path);
    this.protokoll.push({ art: "trash", pfad: path });
    this.dateien.delete(path);
  }
  backlinkCount(path: string): number {
    const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
    let n = 0;
    for (const [p, c] of this.dateien) if (p !== path && c.includes(`[[${name}`)) n++;
    return n;
  }
}
