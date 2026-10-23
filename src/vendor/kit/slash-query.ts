// vendored from code-kit@0.34.0, src/ts/pure/slash-query.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/** A `/`-command being typed in a plain text field (no editor): where it starts and what was typed after the slash, which
 *  entries match it, and the text without it once one is chosen. Pure — the popover that shows the matches lives in
 *  obsidian-kit (`textarea-suggest`).
 *
 *  Origin: Koda (koda-agent), the `/` menu for skills and "Arbeiten" in the chat input, built here first ("Bibliothek ab
 *  Eins"); no plugin held a version of this.
 *
 *  Offsets are UTF-16 code units, like `selectionStart`. A query starts at the beginning of the text or after whitespace and
 *  contains none, so `a/b`, a path and a URL do not trigger it. */
export interface SlashQuery {
  /** Index of the `/`. */
  start: number;
  /** Index right after the typed query (the caret). `text.slice(start, end)` is `/` + query. */
  end: number;
  query: string;
}

const WHITESPACE = /\s/;

/** The `/`-query that ends at the caret, or null. A caret outside the text (negative, past the end, not an integer) is null. */
export function findSlashQuery(text: string, caret: number): SlashQuery | null {
  if (!Number.isInteger(caret) || caret < 1 || caret > text.length) return null;
  let i = caret - 1;
  while (i >= 0 && text.charAt(i) !== "/" && !WHITESPACE.test(text.charAt(i))) i--;
  if (i < 0 || text.charAt(i) !== "/") return null;
  if (i > 0 && !WHITESPACE.test(text.charAt(i - 1))) return null;
  return { start: i, end: caret, query: text.slice(i + 1, caret) };
}

/** Items whose label contains the query (case-insensitive, as plain text — never a pattern); labels that start with it come
 *  first, each group keeps the input order. An empty query keeps everything. Always a new array. */
export function matchByQuery<T>(items: readonly T[], query: string, label: (item: T) => string): T[] {
  const q = query.toLowerCase();
  if (q === "") return [...items];
  const prefix: T[] = [];
  const inner: T[] = [];
  for (const it of items) {
    const l = label(it).toLowerCase();
    if (l.startsWith(q)) prefix.push(it);
    else if (l.includes(q)) inner.push(it);
  }
  return [...prefix, ...inner];
}

/** The text with the query span removed, and where the caret goes (the start of the span). One space that would be left
 *  doubled is removed with it: the space after the span when the span sits at the start or behind whitespace (the same
 *  boundary {@link findSlashQuery} uses, so `a\n/inb rest` does not keep a space at the start of the line). */
export function removeSlashQuery(text: string, q: SlashQuery): { text: string; caret: number } {
  const { start } = q;
  let { end } = q;
  if (text.charAt(end) === " " && (start === 0 || WHITESPACE.test(text.charAt(start - 1)))) end++;
  return { text: text.slice(0, start) + text.slice(end), caret: start };
}
