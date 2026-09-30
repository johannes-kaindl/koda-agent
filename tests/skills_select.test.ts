import { selectSkills } from "../src/core/skills/select";
import type { Skill } from "../src/core/skills/skill";

const mk = (name: string, bodyLen: number, o: { enabled?: boolean; pinned?: boolean } = {}): Skill => ({
  name,
  description: `desc-${name}`,
  enabled: o.enabled ?? true,
  pinned: o.pinned ?? false,
  body: "x".repeat(bodyLen),
});

describe("selectSkills", () => {
  it("gepinnte Skills kommen voll, alle anderen nur als Beschreibung", () => {
    const s = selectSkills([mk("A", 100, { pinned: true }), mk("B", 100)], 1000);
    expect(s.loaded.map((k) => k.name)).toEqual(["A"]);
    expect(s.descriptionOnly.map((k) => k.name)).toEqual(["B"]);
    expect(s.overBudget).toBe(0);
  });

  it("ohne Pin wird nichts voll geladen, auch wenn das Budget reichte", () => {
    const s = selectSkills([mk("A", 10), mk("B", 10)], 100000);
    expect(s.loaded).toEqual([]);
    expect(s.descriptionOnly.map((k) => k.name)).toEqual(["A", "B"]);
  });

  it("der Pin gewinnt ueber das Budget: alle Gepinnten laden, der Ueberhang wird genannt", () => {
    const s = selectSkills([mk("A", 600, { pinned: true }), mk("B", 600, { pinned: true })], 1000);
    expect(s.loaded.map((k) => k.name)).toEqual(["A", "B"]);
    expect(s.overBudget).toBe(200);
  });

  it("Reihenfolge ist stabil und haengt nicht an der Eingabe-Reihenfolge", () => {
    const a = selectSkills([mk("B", 1, { pinned: true }), mk("A", 1, { pinned: true })], 1000);
    const b = selectSkills([mk("A", 1, { pinned: true }), mk("B", 1, { pinned: true })], 1000);
    expect(a.loaded.map((k) => k.name)).toEqual(["A", "B"]);
    expect(b.loaded.map((k) => k.name)).toEqual(["A", "B"]);
  });

  it("deaktivierte Skills tauchen nur in disabled auf — auch gepinnte", () => {
    const s = selectSkills([mk("A", 100, { pinned: true }), mk("B", 100, { enabled: false, pinned: true })], 1000);
    expect(s.loaded.map((k) => k.name)).toEqual(["A"]);
    expect(s.descriptionOnly).toEqual([]);
    expect(s.disabled).toEqual(["B"]);
  });

  it("leere Liste ergibt leere Auswahl", () => {
    expect(selectSkills([], 1000)).toEqual({ loaded: [], descriptionOnly: [], disabled: [], overBudget: 0 });
  });
});
