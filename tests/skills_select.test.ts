import { selectSkills } from "../src/core/skills/select";
import type { Skill } from "../src/core/skills/skill";

const mk = (name: string, bodyLen: number, enabled = true): Skill => ({
  name,
  description: `desc-${name}`,
  enabled,
  body: "x".repeat(bodyLen),
});

describe("selectSkills", () => {
  it("alles unter Budget: alle voll geladen", () => {
    const s = selectSkills([mk("A", 100), mk("B", 100)], 1000);
    expect(s.loaded.map((k) => k.name)).toEqual(["A", "B"]);
    expect(s.descriptionOnly).toEqual([]);
    expect(s.disabled).toEqual([]);
  });

  it("Budget greift: der Rest kommt nur mit description", () => {
    const s = selectSkills([mk("A", 600), mk("B", 600)], 1000);
    expect(s.loaded.map((k) => k.name)).toEqual(["A"]);
    expect(s.descriptionOnly.map((k) => k.name)).toEqual(["B"]);
  });

  it("Reihenfolge ist stabil und haengt nicht an der Eingabe-Reihenfolge", () => {
    const a = selectSkills([mk("B", 600), mk("A", 600)], 1000);
    const b = selectSkills([mk("A", 600), mk("B", 600)], 1000);
    expect(a.loaded.map((k) => k.name)).toEqual(b.loaded.map((k) => k.name));
    expect(a.loaded.map((k) => k.name)).toEqual(["A"]);
  });

  // Greedy fuellt weiter: ein kleiner Skill nach einem zu grossen passt noch rein.
  it("nach einem zu grossen Skill wird weiter gefuellt", () => {
    const s = selectSkills([mk("A", 100), mk("B", 5000), mk("C", 100)], 1000);
    expect(s.loaded.map((k) => k.name)).toEqual(["A", "C"]);
    expect(s.descriptionOnly.map((k) => k.name)).toEqual(["B"]);
  });

  it("deaktivierte Skills tauchen nur in disabled auf", () => {
    const s = selectSkills([mk("A", 100), mk("B", 100, false)], 1000);
    expect(s.loaded.map((k) => k.name)).toEqual(["A"]);
    expect(s.descriptionOnly).toEqual([]);
    expect(s.disabled).toEqual(["B"]);
  });

  it("leere Liste ergibt leere Auswahl", () => {
    expect(selectSkills([], 1000)).toEqual({ loaded: [], descriptionOnly: [], disabled: [] });
  });

  it("ein einzelner Skill groesser als das Budget kommt nur als description", () => {
    const s = selectSkills([mk("A", 5000)], 1000);
    expect(s.loaded).toEqual([]);
    expect(s.descriptionOnly.map((k) => k.name)).toEqual(["A"]);
  });
});
