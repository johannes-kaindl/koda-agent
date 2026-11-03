import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/** Die Zustandszeile am Handy (Entscheidung Johannes 2026-11-02, Welle 30): nur bei laufender Antwort oder Warnung, auf dem Handy und nicht auf dem Tablet, OHNE Hoehenbedingung.
 *  Am iPhone mit offener Tastatur bleibt `innerHeight` bei 844, nur der App-Container schrumpft: eine Regel im `@media (max-height)` griffe dort nie (gemessen 2026-11-03).
 *  Das Aufloesen der Kaskade macht der GUI-Smoke im echten Obsidian; dieser Test haelt die Form der Regel fest (Selektor, Wirkung, Lage ausserhalb jedes @media). */
const css = readFileSync("styles.css", "utf8");
const SELEKTOR = ".is-phone .koda-status:not(.is-checking):not(.is-warning)";

/** Tiefe der geschweiften Klammern vor einer Stelle (0 = oberste Ebene, kein @media/@container darum). */
function tiefe(text: string, bis: number): number {
  let d = 0;
  for (let i = 0; i < bis; i++) { if (text[i] === "{") d++; else if (text[i] === "}") d--; }
  return d;
}

describe("Zustandszeile am Handy", () => {
  const pos = css.indexOf(SELEKTOR + " {");

  it("die Regel steht da, blendet die Zeile aus und nimmt laufende Antwort und Warnung aus", () => {
    expect(pos).toBeGreaterThan(-1);
    const rumpf = css.slice(pos, css.indexOf("}", pos));
    expect(rumpf).toContain("display: none");
  });

  it("sie steht auf der obersten Ebene: kein @media (max-height) davor, das am Gerät mit offener Tastatur nie greift", () => {
    expect(tiefe(css, pos)).toBe(0);
  });

  it("Gegenprobe: das Pruefmittel erkennt eine Regel im @media als verschachtelt", () => {
    const probe = "@media (max-height: 640px) {\n  .x { }\n}\n.y { }";
    expect(tiefe(probe, probe.indexOf(".x"))).toBe(1);
    expect(tiefe(probe, probe.indexOf(".y"))).toBe(0);
  });

  it("die Tablet-Klasse fehlt im Selektor: das Tablet behaelt die Zeile", () => {
    expect(SELEKTOR).not.toContain("is-mobile");
    expect(SELEKTOR).not.toContain("is-tablet");
  });
});
