/* Der manuelle Anteil des Arbeitskontexts als reiner Zustand. Getestet wird die Regel,
 * nicht die Obsidian-Schale: doppelt hinzugefuegt ist einmal drin, die Reihenfolge des
 * Hinzufuegens bleibt, und Entfernen trifft genau einen Eintrag. */
import { describe, it, expect } from "vitest";
import { addPaths, removePath } from "../src/core/context/manual";

describe("addPaths", () => {
  it("haengt in der Reihenfolge des Hinzufuegens an", () => {
    expect(addPaths([], ["b.md", "a.md"])).toEqual(["b.md", "a.md"]);
  });

  it("nimmt einen bereits vorhandenen Pfad nicht zweimal auf", () => {
    expect(addPaths(["a.md"], ["a.md", "b.md"])).toEqual(["a.md", "b.md"]);
  });

  it("entdoppelt auch innerhalb eines Aufrufs", () => {
    expect(addPaths([], ["a.md", "a.md"])).toEqual(["a.md"]);
  });

  it("gibt bei nichts Neuem dieselbe Liste zurueck (der Aufrufer kann darauf pruefen)", () => {
    const vorher = ["a.md"];
    expect(addPaths(vorher, ["a.md"])).toBe(vorher);
  });
});

describe("removePath", () => {
  it("entfernt genau einen Eintrag", () => {
    expect(removePath(["a.md", "b.md"], "a.md")).toEqual(["b.md"]);
  });

  it("gibt bei einem unbekannten Pfad dieselbe Liste zurueck", () => {
    const vorher = ["a.md"];
    expect(removePath(vorher, "x.md")).toBe(vorher);
  });
});
