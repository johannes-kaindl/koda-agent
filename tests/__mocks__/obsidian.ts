export * from "../vendor/kit/obsidian-mock";

// Der Kit-Mock kennt die Bases-Klassen nicht. `src/obsidian/bases-view.ts` setzt `class … extends BasesView` auf Modulebene, und
// `src/main.ts` importiert es — ohne diese leeren Huellen scheitert jeder Test, der main.ts laedt, schon beim Import. Sie tun nichts:
// was die Ansicht mit Obsidians Daten macht, belegt der GUI-Smoke (Pruefpunkte 86–88), kein Unit-Test.
export class BasesView {
  constructor(public readonly controller?: unknown) {}
}
export class NullValue {}
