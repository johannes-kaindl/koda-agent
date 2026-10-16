import { providerToolGroups } from "../src/core/prompt/view-model";

const s = { toolsDisabled: [], toolDescriptions: {} };
const t = (name: string) => ({ name, description: `d ${name}` });

describe("providerToolGroups: Kollisionen", () => {
  it("ein Werkzeug mit dem Namen eines eigenen Werkzeugs steht in collisions, nicht in der Gruppe", () => {
    const r = providerToolGroups(s, [{ id: "p1", tools: [t("read_note"), t("neu")] }], new Set(["read_note"]));
    expect(r.groups[0].rows.map((x) => x.name)).toEqual(["neu"]);
    expect(r.collisions).toEqual([{ id: "p1", name: "read_note", with: null }]);
  });
  it("bei zwei Anbietern mit gleichem Namen gewinnt der erste, der zweite nennt ihn", () => {
    const r = providerToolGroups(s, [{ id: "a", tools: [t("x")] }, { id: "b", tools: [t("x")] }], new Set());
    expect(r.groups.map((g) => g.id)).toEqual(["a"]);
    expect(r.collisions).toEqual([{ id: "b", name: "x", with: "a" }]);
  });
  it("ohne Kollision bleibt die Liste leer", () => {
    expect(providerToolGroups(s, [{ id: "a", tools: [t("x")] }], new Set()).collisions).toEqual([]);
  });
  it("ein Anbieter, dessen einzige Werkzeuge kollidieren, bekommt keine leere Gruppe, aber die Meldung", () => {
    const r = providerToolGroups(s, [{ id: "a", tools: [t("read_note")] }], new Set(["read_note"]));
    expect(r.groups).toEqual([]);
    expect(r.collisions).toHaveLength(1);
  });
});
