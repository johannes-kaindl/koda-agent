import { describe, it, expect } from "vitest";
import { contextUsage, type ContextUsage } from "../src/core/chat/context-usage";

/** `contextUsage` liefert `null`, wenn kein Fenster bekannt ist (siehe Kommentar dort). Die
 *  Faelle hier erwarten immer ein Ergebnis — dieser Waechter verengt statt zu casten, und
 *  wirft mit Klartext, falls die Annahme je nicht mehr stimmt, statt still `undefined` zu
 *  lesen. */
function erwarteErgebnis(u: ContextUsage | null): ContextUsage {
  if (u === null) throw new Error("contextUsage lieferte null, erwartet wurde ein Ergebnis");
  return u;
}

describe("contextUsage — Prozent des Kontextfensters", () => {
  it("rechnet die Belegung in Prozent", () => {
    expect(contextUsage(2048, 8192, 75)).toEqual({ percent: 25, warn: false });
  });

  it("rundet auf ganze Prozent", () => {
    expect(erwarteErgebnis(contextUsage(100, 3000, 75)).percent).toBe(3);
  });

  it("leerer Verlauf ist 0 Prozent und keine Warnung", () => {
    expect(contextUsage(0, 8192, 75)).toEqual({ percent: 0, warn: false });
  });
});

describe("contextUsage — Warnschwelle teilt sich die Zahl mit der Verdichtung", () => {
  it("genau auf der Schwelle wird gewarnt (dort loest die Verdichtung aus)", () => {
    expect(erwarteErgebnis(contextUsage(6144, 8192, 75)).warn).toBe(true);   // 75 %
  });

  it("knapp darunter noch nicht", () => {
    expect(erwarteErgebnis(contextUsage(6000, 8192, 75)).warn).toBe(false);  // 73 %
  });

  it("eine andere Einstellung verschiebt die Schwelle mit", () => {
    expect(erwarteErgebnis(contextUsage(4096, 8192, 50)).warn).toBe(true);   // 50 % bei Schwelle 50
    expect(erwarteErgebnis(contextUsage(4096, 8192, 90)).warn).toBe(false);
  });
});

// Die Anzeige darf nie mehr behaupten, als die Schaetzung traegt.
describe("contextUsage — Sonderfaelle statt falscher Aussagen", () => {
  it("Ueberlauf wird bei 100 gekappt, nicht als 137 % gezeigt", () => {
    expect(contextUsage(11_000, 8192, 75)).toEqual({ percent: 100, warn: true });
  });

  it("Fenster 0 ergibt null — es gibt nichts, wovon Prozent zu nehmen waeren", () => {
    expect(contextUsage(500, 0, 75)).toBeNull();
  });

  it("negatives Fenster ebenso", () => {
    expect(contextUsage(500, -1, 75)).toBeNull();
  });

  it("negative Belegung wird auf 0 geklemmt statt ins Minus zu laufen", () => {
    expect(contextUsage(-10, 8192, 75)).toEqual({ percent: 0, warn: false });
  });
});
