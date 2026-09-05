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

  it("haelt auch bei Aushungerung Ganzzahl-Verlust aus (4x5 Zeichen, Budget 3)", () => {
    // Wasserfuellung: Scheibe = floor(3/4) = 0. Niemand passt.
    // Alle bekommen 0, alle sind gekuerzt (und melden volle Laenge), Restzeichen bleiben liegen.
    // Das ist korrekt: die Verteilung ist ganzzahlig, der Verlust durch offen.length beschraenkt,
    // und kann nie zu Ueberschreitung führen — nur zu ungenutztem Rest.
    const out = allocateBudget([eintrag("a.md", 5), eintrag("b.md", 5), eintrag("c.md", 5), eintrag("d.md", 5)], 3);
    expect(out.map((e) => e.shown.length)).toEqual([0, 0, 0, 0]);
    expect(out.map((e) => e.cut)).toEqual([true, true, true, true]);
    expect(out.map((e) => e.fullChars)).toEqual([5, 5, 5, 5]);
  });

  it("einhält die Invarianten ueber verschiedene Laengenverteilungen (Summe <= Budget)", () => {
    // Invarianten: Summe(shown.length) <= budget UND shown.length <= fullChars
    // UND cut === (shown.length < fullChars). Getestet über eine feste Tabelle,
    // damit der Fehler sagt, welcher Fall gebrochen ist.
    const checkInvariants = (entries: LoadedCandidate[], budget: number, desc: string) => {
      const out = allocateBudget(entries, budget);
      const sumShown = out.reduce((s, e) => s + e.shown.length, 0);

      // Invariante 1: Summe <= Budget
      expect(sumShown, `${desc}: Summe(shown.length) exceeded budget`).toBeLessThanOrEqual(budget);

      // Invariante 2 & 3: pro Eintrag
      for (let i = 0; i < out.length; i++) {
        const e = out[i]!;
        expect(e.shown.length, `${desc}[${i}]: shown.length > fullChars`).toBeLessThanOrEqual(e.fullChars);
        expect(e.cut, `${desc}[${i}]: cut-Flag inkorrekt`).toBe(e.shown.length < e.fullChars);
      }
    };

    checkInvariants([eintrag("a.md", 100)], 50, "eine Notiz, Budget zu klein");
    checkInvariants([eintrag("a.md", 100)], 1000, "eine Notiz, Budget gross");
    checkInvariants([eintrag("a.md", 50), eintrag("b.md", 50)], 75, "zwei gleich gross, Budget knapp");
    checkInvariants([eintrag("a.md", 10), eintrag("b.md", 100)], 50, "stark ungleich, Budget gemischt");
    checkInvariants([eintrag("a.md", 100), eintrag("b.md", 100), eintrag("c.md", 100)], 50, "drei Eintraege, Budget sehr klein");
    checkInvariants([eintrag("a.md", 1), eintrag("b.md", 1)], 0, "zwei Eintraege, Budget 0");
    checkInvariants([eintrag("a.md", 1000)], 999, "grosse Notiz, fast ganzes Budget");
  });
});
