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
