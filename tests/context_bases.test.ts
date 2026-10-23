/* Bases als Kontextquelle — der pure Kern. Die Fallen aus dem Spike (docs/LAB.md) sind hier
 * schon im Adapter erledigt: fehlende Werte kommen als null an, nie als "null". */
import { describe, it, expect } from "vitest";
import {
  basePaths, normalizeForm, removeBase, renderTables, upsertBase, withBaseTables,
  type BaseSnapshot,
} from "../src/core/context/bases";

function snap(over: Partial<BaseSnapshot> = {}): BaseSnapshot {
  return {
    id: "Notes/Koda context.base · Context table",
    basePath: "Notes/Koda context.base",
    viewName: "Context table",
    takenAt: "2026-09-18 14:02",
    form: "table",
    columns: ["Status", "Owner"],
    rows: [
      { path: "Notes/Tools.md", group: null, values: ["active", null] },
      { path: "Notes/Compaction.md", group: null, values: ["note | draft", null] },
    ],
    ...over,
  };
}

describe("normalizeForm — der Default steht im Lesecode (Spike-Nachzug 1)", () => {
  it("liefert table fuer undefined, Unsinn und Nicht-Strings", () => {
    expect(normalizeForm(undefined)).toBe("table");
    expect(normalizeForm("tabelle")).toBe("table");
    expect(normalizeForm(3)).toBe("table");
  });
  it("uebernimmt gueltige Werte", () => {
    expect(normalizeForm("notes")).toBe("notes");
    expect(normalizeForm("both")).toBe("both");
  });
});

describe("upsertBase / removeBase", () => {
  it("ersetzt einen Schnappschuss derselben Ansicht, statt einen zweiten anzulegen", () => {
    const a = snap();
    const b = snap({ takenAt: "2026-09-18 15:00" });
    const liste = upsertBase(upsertBase([], a), b);
    expect(liste).toHaveLength(1);
    expect(liste[0]?.takenAt).toBe("2026-09-18 15:00");
  });
  it("gibt bei nichts zu entfernen die Eingangsliste zurueck (Referenz)", () => {
    const liste = [snap()];
    expect(removeBase(liste, "gibt-es-nicht")).toBe(liste);
    expect(removeBase(liste, liste[0]!.id)).toEqual([]);
  });
});

describe("basePaths", () => {
  it("nimmt nur Schnappschuesse mit notes/both, entdoppelt", () => {
    const t = snap();
    const n = snap({ id: "n", form: "notes", rows: [{ path: "Notes/Tools.md", group: null, values: [] }, { path: "X.md", group: null, values: [] }] });
    const b = snap({ id: "b", form: "both", rows: [{ path: "X.md", group: null, values: [] }] });
    expect(basePaths([t, n, b])).toEqual(["Notes/Tools.md", "X.md"]);
  });
});

describe("renderTables", () => {
  it("rendert Kopf mit Stand, Notiz-Spalte zuerst, leere Zelle fuer fehlende Werte — nie das Wort null", () => {
    const r = renderTables([snap()], 10_000, "de");
    const text = r.blocks.join("\n\n");
    expect(text).toContain("## Base: Notes/Koda context.base · Context table (Stand 2026-09-18 14:02)");
    expect(text).toContain("| Notiz | Status | Owner |");
    expect(text).toContain("| Notes/Tools.md | active |  |");
    expect(text).not.toMatch(/\bnull\b/);
    expect(text).toContain("note \\| draft");
    expect(r.items).toEqual([{ source: "base", path: "Notes/Koda context.base", kind: "table", via: snap().id, chars: text.length }]);
    expect(r.used).toBe(text.length);
  });
  it("laesst Form notes aus", () => {
    expect(renderTables([snap({ form: "notes" })], 10_000, "de").blocks).toEqual([]);
  });
  it("kuerzt zeilenweise und nennt beide Zahlen", () => {
    const viele = snap({ rows: Array.from({ length: 50 }, (_, i) => ({ path: `N${i}.md`, group: null, values: ["x", "y"] })) });
    const r = renderTables([viele], 400, "de");
    const text = r.blocks.join("\n\n");
    expect(text.length).toBeLessThanOrEqual(400);
    expect(text).toMatch(/\[gekürzt: \d+ von 50 Zeilen/);
    expect(r.items[0]?.fullChars).toBeGreaterThan(r.items[0]!.chars);
  });
  it("rendert Gruppen als Zwischenueberschriften", () => {
    const g = snap({ rows: [
      { path: "A.md", group: "active", values: ["a", null] },
      { path: "B.md", group: null, values: ["b", null] },
    ] });
    const text = renderTables([g], 10_000, "de").blocks.join("\n");
    expect(text).toContain("### active");
    expect(text).toContain("### (ohne Wert)");
  });
  it("teilt das Budget: die zweite Tabelle bekommt nur den Rest", () => {
    const r = renderTables([snap(), snap({ id: "zwei" })], 10_000, "de");
    expect(r.used).toBe(r.blocks.join("").length);
    expect(r.blocks).toHaveLength(2);
  });
});

describe("withBaseTables", () => {
  it("haengt Bloecke und Items an einen bestehenden Kontext", () => {
    const r = renderTables([snap()], 10_000, "en");
    const ctx = withBaseTables({ mode: "workspace", items: [{ source: "active", path: "A.md", kind: "pointer", chars: 3 }], text: "[Working context · Workspace]" }, r);
    expect(ctx.text.startsWith("[Working context · Workspace]\n\n## Base:")).toBe(true);
    expect(ctx.items.map((i) => i.source)).toEqual(["active", "base"]);
  });
  it("aendert ohne Tabellen nichts (Referenz)", () => {
    const ctx = { mode: "workspace" as const, items: [], text: "x" };
    expect(withBaseTables(ctx, { blocks: [], items: [], used: 0 })).toBe(ctx);
  });
});
