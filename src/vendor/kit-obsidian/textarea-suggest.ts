// vendored from obsidian-kit@0.63.0, src/obsidian/textarea-suggest.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
import { findSlashQuery, removeSlashQuery, type SlashQuery } from "../kit/slash-query";

/** Das `/`-Menü eines einfachen Textfelds (`<textarea>`, kein Editor): tippt der Nutzer am Textanfang oder nach einem Leerzeichen ein `/`,
 *  öffnet sich über dem Feld eine Liste, die mit jedem Zeichen nachfiltert. Herkunft: Plan 1 der Koda-Fähigkeiten (Task A2), „Bibliothek ab Eins“ —
 *  kein Plugin hatte eine Fassung. Die reine Hälfte (Auslöser finden, Treffer ordnen, den Text entfernen) liegt in code-kit `slash-query`;
 *  hier steht nur das Fenster.
 *
 *  Verhalten (festgelegt, nicht vorgeprüft — das DOM prüft der Konsument im GUI-Smoke):
 *  - `input` und `keyup` (Pfeil links/rechts, Pos1, Ende verschieben den Cursor) lesen `findSlashQuery(el.value, el.selectionStart)`;
 *    Treffer öffnet bzw. füllt neu, kein Treffer schließt. Pfeil hoch/runter, Enter, Tab und Escape lesen beim `keyup` nichts neu.
 *  - Die Liste ist ein Geschwister des Textfelds, absolut über dessen Oberkante verankert (der Elternknoten bekommt `okit-suggest-host` = `position: relative`),
 *    `role="listbox"`, je Zeile `role="option"` mit `id`; Gruppenüberschriften sind `role="presentation"` und nicht wählbar. Das Textfeld trägt
 *    `aria-controls`, `aria-expanded`, `aria-autocomplete="list"` und, solange etwas aktiv ist, `aria-activedescendant`.
 *  - Die Tasten laufen im **Capture-Listener** des Textfelds und sind damit vor dem Senden-Listener des Konsumenten dran: bei offener Liste bewegen
 *    Pfeil hoch/runter (umlaufend), Enter und Tab wählen, Escape schließt — jeweils `preventDefault()` und `stopImmediatePropagation()`. Bei geschlossener
 *    Liste (und während einer IME-Eingabe) wird nichts abgefangen.
 *  - Wählen: der `/…`-Text wird entfernt (`removeSlashQuery`), der Cursor gesetzt, ein `input`-Ereignis ausgelöst (damit Entwurfs-Listener des Konsumenten
 *    es sehen — dasselbe load-bearing Detail wie in `FolderSuggest`), die Liste geschlossen, dann `onChoose(item)`. Ein Mausklick wählt (auf `mousedown` mit
 *    `preventDefault()`, damit das Textfeld den Fokus behält); `blur` schließt.
 *  - Das Kit injiziert kein CSS: `TEXTAREA_SUGGEST_CSS` gehört in die `styles.css` des Konsumenten. */
export interface SuggestGroup<T> { label: string; items: T[] }

export interface TextareaSuggestOptions<T> {
  /** Gruppen zur Abfrage (ohne „/“). Leere Gruppen werden nicht gezeichnet; sind alle leer, ist die Liste zu. */
  groups(query: string): SuggestGroup<T>[];
  /** Zeilentext; der Baustein setzt ihn, der Aufrufer kann das Element nicht weiter füllen. */
  label(item: T): string;
  /** Gewählt: der Baustein hat den `/…`-Text schon entfernt und den Cursor gesetzt. */
  onChoose(item: T): void;
}

export interface TextareaSuggest { close(): void; destroy(): void; isOpen(): boolean }

/** Nächster aktiver Eintrag, umlaufend. `count === 0` → `-1` (nichts aktiv). Ist noch nichts aktiv (`index < 0`), führt `+1` zum ersten und `-1` zum letzten. */
export function moveIndex(index: number, count: number, delta: 1 | -1): number {
  if (count <= 0) return -1;
  if (index < 0) return delta === 1 ? 0 : count - 1;
  return (index + delta + count) % count;
}

/** Nur diese Tasten bewegen den Cursor, ohne ein `input` auszulösen — bei allen anderen `keyup` bleibt die Liste, wie sie ist. */
const CARET_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

let counter = 0;

export function attachTextareaSuggest<T>(el: HTMLTextAreaElement, opts: TextareaSuggestOptions<T>): TextareaSuggest {
  const parent = el.parentElement;
  if (parent === null) throw new Error("attachTextareaSuggest: das Textfeld hat keinen Elternknoten");
  const boxId = `okit-suggest-${++counter}`;
  parent.addClass("okit-suggest-host");
  const box = parent.createDiv({ cls: "okit-suggest", attr: { role: "listbox", id: boxId } });
  // Geschwister HINTER dem Textfeld im DOM, optisch darüber (absolute Verankerung unten): kein Umhängen nötig.
  el.setAttribute("aria-autocomplete", "list");
  el.setAttribute("aria-controls", boxId);
  el.setAttribute("aria-expanded", "false");

  let open = false;
  let itemEls: HTMLElement[] = [];
  let items: T[] = [];
  let active = -1;
  let lastQuery: string | null = null;

  const setOpen = (on: boolean): void => {
    open = on;
    el.setAttribute("aria-expanded", String(on));
    box.toggleClass("is-open", on);
    if (!on) { el.removeAttribute("aria-activedescendant"); lastQuery = null; }
  };

  const markActive = (): void => {
    itemEls.forEach((row, i) => {
      const on = i === active;
      row.toggleClass("is-selected", on);
      row.setAttribute("aria-selected", String(on));
    });
    const row = itemEls[active];
    if (row === undefined) { el.removeAttribute("aria-activedescendant"); return; }
    el.setAttribute("aria-activedescendant", `${boxId}-o${active}`);
    if (typeof row.scrollIntoView === "function") row.scrollIntoView({ block: "nearest" });
  };

  const currentQuery = (): SlashQuery | null => {
    const caret = el.selectionStart;
    return findSlashQuery(el.value, caret);
  };

  const choose = (item: T): void => {
    const q = currentQuery();
    if (q !== null) {
      const next = removeSlashQuery(el.value, q);
      el.value = next.text;
      el.setSelectionRange(next.caret, next.caret);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    setOpen(false);
    opts.onChoose(item);
  };

  const render = (groups: Array<SuggestGroup<T>>): void => {
    box.empty();
    itemEls = [];
    items = [];
    for (const g of groups) {
      if (g.items.length === 0) continue;
      box.createDiv({ cls: "okit-suggest-group", text: g.label, attr: { role: "presentation" } });
      for (const item of g.items) {
        const row = box.createDiv({ cls: "okit-suggest-item", text: opts.label(item), attr: { role: "option", id: `${boxId}-o${items.length}`, "aria-selected": "false" } });
        const index = items.length;
        row.addEventListener("mousedown", (ev) => { ev.preventDefault(); const it = items[index]; if (it !== undefined) choose(it); });
        itemEls.push(row);
        items.push(item);
      }
    }
  };

  const update = (): void => {
    const q = currentQuery();
    if (q === null) { if (open) setOpen(false); return; }
    const groups = opts.groups(q.query).filter((g) => g.items.length > 0);
    if (groups.length === 0) { if (open) setOpen(false); return; }
    const sameQuery = open && lastQuery === q.query;
    render(groups);
    lastQuery = q.query;
    active = sameQuery && active >= 0 && active < items.length ? active : 0;
    if (!open) {
      // Verankert unten am Textfeld: Abstand zum unteren Rand des Elternknotens = Höhe über der Oberkante des Felds.
      box.setCssProps({ left: `${el.offsetLeft}px`, bottom: `${Math.max(0, parent.clientHeight - el.offsetTop)}px`, width: `${el.offsetWidth}px` });
      setOpen(true);
    }
    markActive();
  };

  const onKeydown = (ev: KeyboardEvent): void => {
    if (!open || ev.isComposing) return;
    const stop = (): void => { ev.preventDefault(); ev.stopImmediatePropagation(); };
    switch (ev.key) {
      case "ArrowDown": stop(); active = moveIndex(active, items.length, 1); markActive(); break;
      case "ArrowUp": stop(); active = moveIndex(active, items.length, -1); markActive(); break;
      case "Enter":
      case "Tab": {
        stop();
        const it = items[active];
        if (it !== undefined) choose(it);
        break;
      }
      case "Escape": stop(); setOpen(false); break;
      default: break;
    }
  };
  const onKeyup = (ev: KeyboardEvent): void => { if (CARET_KEYS.has(ev.key)) update(); };
  const onInput = (): void => { update(); };
  const onBlur = (): void => { if (open) setOpen(false); };

  // Capture: vor dem Senden-Listener des Konsumenten.
  el.addEventListener("keydown", onKeydown, { capture: true });
  el.addEventListener("keyup", onKeyup);
  el.addEventListener("input", onInput);
  el.addEventListener("blur", onBlur);

  return {
    close(): void { if (open) setOpen(false); },
    isOpen(): boolean { return open; },
    destroy(): void {
      el.removeEventListener("keydown", onKeydown, { capture: true });
      el.removeEventListener("keyup", onKeyup);
      el.removeEventListener("input", onInput);
      el.removeEventListener("blur", onBlur);
      box.remove();
      for (const a of ["aria-autocomplete", "aria-controls", "aria-expanded", "aria-activedescendant"]) el.removeAttribute(a);
      parent.removeClass("okit-suggest-host");
      open = false;
    },
  };
}

/** Gehört in die `styles.css` des Konsumenten — das Kit injiziert kein CSS (Muster `STREAM_AREA_CSS`). Nur Theme-Variablen. */
export const TEXTAREA_SUGGEST_CSS = `
.okit-suggest-host { position: relative; }
.okit-suggest:not(.is-open) { display: none; }
.okit-suggest {
  position: absolute; z-index: var(--layer-popover);
  max-height: 16em; overflow-y: auto;
  background: var(--background-primary);
  border: var(--border-width) solid var(--background-modifier-border); border-radius: var(--radius-m);
  box-shadow: var(--shadow-s);
  padding: var(--size-2-1);
  font-size: var(--font-ui-small);
}
.okit-suggest-group { padding: var(--size-2-1) var(--size-4-2); color: var(--text-muted); font-size: var(--font-ui-smaller); }
.okit-suggest-item { padding: var(--size-2-2) var(--size-4-2); border-radius: var(--radius-s); cursor: var(--cursor); }
.okit-suggest-item:hover, .okit-suggest-item.is-selected { background: var(--background-modifier-hover); }
`;
