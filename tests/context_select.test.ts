/* Budget-Zuteilung: was passt, geht ganz mit; der Rest wird unter den Großen aufgeteilt.
 * Die Gegenprobe zur Wasserfüllung ist der letzte Test — mit Gleichverteilung bliebe
 * Budget ungenutzt, während eine große Notiz gekürzt wird. */
import { describe, it, expect } from "vitest";
import { allocateBudget, type LoadedCandidate } from "../src/core/context/select";

function eintrag(path: string, laenge: number): LoadedCandidate {
  return { source: "manual", path, content: "x".repeat(laenge) };
}

describe("allocateBudget", () => {
  it("laesst alles ungekuerzt, wenn die Summe ins Budget passt", () => {
    const out = allocateBudget([eintrag("a.md", 100), eintrag("b.md", 200)], 1000);
    expect(out.map((e) => e.cut)).toEqual([false, false]);
    expect(out.map((e) => e.shown.length)).toEqual([100, 200]);
    expect(out.map((e) => e.fullChars)).toEqual([100, 200]);
  });

  it("kuerzt und meldet die urspruengliche Laenge", () => {
    const out = allocateBudget([eintrag("a.md", 900), eintrag("b.md", 900)], 1000);
    expect(out.every((e) => e.cut)).toBe(true);
    expect(out.map((e) => e.shown.length)).toEqual([500, 500]);
    expect(out.map((e) => e.fullChars)).toEqual([900, 900]);
  });

  it("gibt den Rest der Kleinen an die Grossen weiter (Wasserfuellung)", () => {
    // Gleichverteilung gaebe jedem 500: die kleine Notiz liesse 400 Zeichen liegen,
    // die grosse wuerde trotzdem auf 500 gekuerzt. Erwartet ist 100 + 900.
    const out = allocateBudget([eintrag("klein.md", 100), eintrag("gross.md", 5000)], 1000);
    expect(out[0]).toMatchObject({ cut: false, fullChars: 100 });
    expect(out[0]?.shown.length).toBe(100);
    expect(out[1]).toMatchObject({ cut: true, fullChars: 5000 });
    expect(out[1]?.shown.length).toBe(900);
  });

  it("verteilt ueber mehrere Runden weiter", () => {
    // Runde 1: Scheibe 100 → „a" (10) passt. Rest 290 auf zwei → Scheibe 145 → „b" (120)
    // passt. Rest 170 auf einen → „c" bekommt 170.
    const out = allocateBudget([eintrag("a.md", 10), eintrag("b.md", 120), eintrag("c.md", 9000)], 300);
    expect(out.map((e) => e.shown.length)).toEqual([10, 120, 170]);
    expect(out.map((e) => e.cut)).toEqual([false, false, true]);
  });

  it("behaelt Reihenfolge, Quelle und Ebene bei", () => {
    const out = allocateBudget([{ source: "link", path: "n.md", depth: 2, content: "abc" }], 100);
    expect(out[0]).toMatchObject({ source: "link", path: "n.md", depth: 2, cut: false });
  });

  it("kommt mit leerer Liste und mit Budget 0 zurecht", () => {
    expect(allocateBudget([], 1000)).toEqual([]);
    const out = allocateBudget([eintrag("a.md", 50)], 0);
    expect(out[0]?.shown).toBe("");
    expect(out[0]?.cut).toBe(true);
  });
});
