import { FileView, MarkdownView, type App, type WorkspaceLeaf } from "obsidian";
import type { EditorPort, WorkspaceSnapshot } from "../core/context/ports";

/** Der Leaf, in dem der Nutzer arbeitet. NICHT `activeEditor` und NICHT `getActiveViewOfType`:
 *  aus der Seitenleiste heraus ist die aktive Ansicht Koda selbst, und `activeEditor` ist dann
 *  laut API null. `getMostRecentLeaf()` OHNE Argument durchsucht `rootSplit` und Pop-out-Fenster
 *  und ignoriert Seitenleisten (REGISTRY-Gotcha, yijing-oracle `reading-writer.ts`). */
function mainLeaf(app: App): WorkspaceLeaf | null {
  return app.workspace.getMostRecentLeaf();
}

function markdownView(app: App): MarkdownView | null {
  const leaf = mainLeaf(app);
  return leaf !== null && leaf.view instanceof MarkdownView ? leaf.view : null;
}

export function readWorkspace(app: App, ownViewType: string): WorkspaceSnapshot {
  const leaf = mainLeaf(app);
  const view = leaf?.view;
  let active: WorkspaceSnapshot["active"] = null;
  if (view instanceof FileView && view.file !== null) {
    const md = view instanceof MarkdownView ? view : null;
    const editor = md?.editor;
    active = {
      path: view.file.path,
      frontmatter: app.metadataCache.getFileCache(view.file)?.frontmatter ?? null,
      selection: editor?.getSelection() ?? "",
      cursorLine: editor ? editor.getCursor("head").line + 1 : null,
      lineCount: editor ? editor.lineCount() : null,
    };
  }
  const tabs: WorkspaceSnapshot["tabs"] = [];
  app.workspace.iterateAllLeaves((l) => {
    const v = l.view;
    if (v.getViewType() === ownViewType) return;
    if (v instanceof FileView && v.file !== null) tabs.push({ path: v.file.path, viewType: v.getViewType() });
  });
  return { active, tabs };
}

export function linesAround(app: App, radius: number): { from: number; lines: string[] } | null {
  const editor = markdownView(app)?.editor;
  if (editor === undefined) return null;
  const line = editor.getCursor("head").line;
  const from = Math.max(0, line - radius);
  const to = Math.min(editor.lineCount() - 1, line + radius);
  const lines: string[] = [];
  for (let i = from; i <= to; i++) lines.push(editor.getLine(i));
  return { from: from + 1, lines };
}

/** Jede Methode liest den Editor FRISCH — `edit_active_note` prueft damit nach der
 *  Bestaetigung, ob Notiz und Markierung noch dieselben sind (Spec E5). */
export function editorPort(app: App): EditorPort {
  return {
    path: () => markdownView(app)?.file?.path ?? null,
    selection: () => markdownView(app)?.editor.getSelection() ?? "",
    replaceSelection: (text) => markdownView(app)?.editor.replaceSelection(text),
    insertAtCursor: (text) => {
      const editor = markdownView(app)?.editor;
      if (editor !== undefined) editor.replaceRange(text, editor.getCursor("to"));
    },
  };
}
