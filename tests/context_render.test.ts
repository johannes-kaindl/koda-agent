/* Der Volltext-Block. Die tragende Invariante ist dieselbe wie beim Arbeitsplatz-Block:
 * was im Text steht, steht in `items` — beide entstehen aus DERSELBEN Eintragsliste. */
import { describe, it, expect } from "vitest";
import { renderFullContext } from "../src/core/context/render";
import type { AllocatedEntry } from "../src/core/context/select";

const ganz: AllocatedEntry = { source: "active", path: "A.md", shown: "Hallo", fullChars: 5, cut: false };
const gekuerzt: AllocatedEntry = { source: "link", path: "B.md", depth: 1, shown: "Anfa", fullChars: 900, cut: true };

describe("renderFullContext", () => {
  it("setzt eine Kopfzeile mit dem Modus", () => {
    expect(renderFullContext([ganz], "note", "de").text.split("\n")[0]).toBe("[Arbeitskontext · Notiz]");
    expect(renderFullContext([ganz], "tabs", "en").text.split("\n")[0]).toBe("[Working context · All tabs]");
  });

  it("schreibt je Eintrag eine Ueberschrift mit Pfad und Herkunft", () => {
    const text = renderFullContext([ganz, gekuerzt], "note", "de").text;
    expect(text).toContain("## A.md (aktive Notiz)");
    expect(text).toContain("## B.md (verlinkt, Ebene 1)");
    expect(text).toContain("Hallo");
  });

  it("meldet jede Kuerzung im Block, mit beiden Zahlen und dem Weg zum Rest", () => {
    const text = renderFullContext([gekuerzt], "note", "de").text;
    expect(text).toContain("gekürzt: 4 von 900 Zeichen");
    expect(text).toContain('read_note("B.md")');
  });

  it("meldet nichts, wo nichts gekuerzt wurde", () => {
    expect(renderFullContext([ganz], "note", "de").text).not.toContain("gekürzt");
  });

  it("baut items aus derselben Liste wie den Text", () => {
    const ctx = renderFullContext([ganz, gekuerzt], "note", "de");
    expect(ctx.mode).toBe("note");
    expect(ctx.items).toEqual([
      { source: "active", path: "A.md", kind: "full", chars: 5 },
      { source: "link", path: "B.md", kind: "full", chars: 4, fullChars: 900, depth: 1 },
    ]);
    for (const item of ctx.items) expect(ctx.text).toContain(item.path);
  });

  it("liefert bei leerer Auswahl einen Block, der das sagt — nicht einen leeren String", () => {
    const ctx = renderFullContext([], "tabs", "de");
    expect(ctx.items).toEqual([]);
    expect(ctx.text).toContain("nichts ausgewählt");
  });
});
