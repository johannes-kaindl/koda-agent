/* Vertraege zwischen Kern und Obsidian-Adapter (Spec E3). Pure: nur Typen. */

export interface ActiveNote {
  path: string;
  /** Aus dem Metadaten-Cache, ohne Dateizugriff — null ohne Frontmatter. */
  frontmatter: Record<string, unknown> | null;
  /** "" ohne Markierung. */
  selection: string;
  /** 1-basiert; null ohne Editor (Canvas, Base, PDF, Bild). */
  cursorLine: number | null;
  lineCount: number | null;
}

export interface WorkspaceSnapshot {
  active: ActiveNote | null;
  /** Alle Fenster, Reihenfolge des Workspace; ohne Kodas eigenen Leaf. */
  tabs: { path: string; viewType: string }[];
}

export interface WorkspacePort {
  snapshot(): WorkspaceSnapshot;
  /** Zeilen um den Cursor der aktiven Notiz; `from` 1-basiert. null ohne Editor. */
  linesAround(radius: number): { from: number; lines: string[] } | null;
}

/** Der Editor, in dem der Nutzer arbeitet — fuer `edit_active_note`. Jede Methode liest
 *  FRISCH: zwischen Aufruf und Bestaetigung kann der Nutzer die Notiz gewechselt haben. */
export interface EditorPort {
  path(): string | null;
  selection(): string;
  replaceSelection(text: string): void;
  insertAtCursor(text: string): void;
}

/** Die Link-Nachbarschaft einer Notiz. Beide Richtungen kommen aus Obsidians
 *  `metadataCache.resolvedLinks` — UNAUFGELOESTE Links stehen dort nicht drin und
 *  erreichen den Kern deshalb gar nicht erst (Spec E3: „werden ignoriert"). */
export interface LinkPort {
  outgoing(path: string): string[];
  backlinks(path: string): string[];
}

/** Notiz-Inhalt fuer die Volltext-Modi. `null` heisst „nicht lesbar" (geloescht, kein
 *  Textformat, Rechte) — der Eintrag faellt dann still aus dem Block, wie in vault-rags
 *  `buildContext`. Still ist hier richtig: eine Notiz, die es nicht mehr gibt, ist keine
 *  Kappung, die sich melden muesste, sondern ein Kandidat, der sich erledigt hat. */
export interface ContentPort {
  read(path: string): Promise<string | null>;
}
