import { arbeitFrontmatter, skillModeFrontmatter, type SaveInput } from "../src/core/abilities/save";
import { parseArbeit } from "../src/core/abilities/parse";
import { emptyOverlay, type Arbeit } from "../src/core/abilities/types";
import type { Skill } from "../src/core/skills/skill";

const sk = (name: string, o: { enabled?: boolean; pinned?: boolean } = {}): Skill => ({
  name, description: "d", enabled: o.enabled ?? true, pinned: o.pinned ?? false, body: "b",
});
const settings = { contextModeDefault: "workspace" as const, contextLinkDepth: 1, contextBudgetChars: 20000, contextAutoK: 5, toolsDisabled: [] as string[] };
const input = (o: Partial<SaveInput> = {}): SaveInput => ({
  skills: [sk("triage"), sk("koda-start", { pinned: true }), sk("rueckblick")],
  arbeit: null, overlay: emptyOverlay(), settings, ownTools: ["move_note", "write_skill"],
  providers: [{ id: "vault-retrieval", tools: ["related_notes"] }], manual: [], ...o,
});

describe("arbeitFrontmatter", () => {
  it("ohne Abweichung bleibt nur koda: arbeit", () => {
    expect(arbeitFrontmatter(input())).toEqual({ koda: "arbeit" });
  });

  it("bei übrige-skills: grundeinstellung steht jeder Skill drin, der vom Frontmatter abweicht", () => {
    const o = { ...emptyOverlay(), skills: { triage: "ganz" as const, "koda-start": "ganz" as const } };
    expect(arbeitFrontmatter(input({ overlay: o }))).toEqual({ koda: "arbeit", skills: { triage: "ganz" } });
  });

  it("bei übrige-skills: aus steht jeder Skill drin, der nicht aus ist, und die Zeile bleibt", () => {
    const a: Arbeit = { name: "Inbox", skills: { triage: "ganz" }, uebrigeSkills: "aus", werkzeuge: {}, anbieter: {}, kontext: {}, base: null };
    const o = { ...emptyOverlay(), skills: { "koda-start": "ganz" as const } };
    expect(arbeitFrontmatter(input({ arbeit: a, overlay: o }))).toEqual({
      koda: "arbeit", skills: { "koda-start": "ganz", triage: "ganz" }, "übrige-skills": "aus",
    });
  });

  it("Werkzeuge gegen die Einstellungen, Anbieter nur wenn aus, Kontext gegen die globalen Werte", () => {
    const o = { ...emptyOverlay(), werkzeuge: { write_skill: "aus" as const }, anbieter: { "vault-retrieval": "aus" as const }, kontext: { modus: "note" as const, tiefe: 2 } };
    expect(arbeitFrontmatter(input({ overlay: o, manual: ["Inbox/A.md", "Inbox/B.md"], settings: { ...settings, toolsDisabled: ["move_note"] } }))).toEqual({
      koda: "arbeit",
      werkzeuge: { write_skill: "aus" },
      anbieter: { "vault-retrieval": "aus" },
      kontext: { modus: "note", tiefe: 2, notizen: ["Inbox/A.md", "Inbox/B.md"] },
    });
  });

  it("was Speichern schreibt, liest parseArbeit zum selben effektiven Stand zurück", () => {
    const o = { ...emptyOverlay(), skills: { triage: "ganz" as const, rueckblick: "aus" as const }, werkzeuge: { write_skill: "aus" as const } };
    const fm = arbeitFrontmatter(input({ overlay: o }));
    const back = parseArbeit("X", fm)!;
    expect(back.invalid).toEqual([]);
    expect(arbeitFrontmatter(input({ arbeit: back.arbeit }))).toEqual(fm);
  });
});

describe("skillModeFrontmatter", () => {
  it("bildet die drei Stellungen auf die Frontmatter-Felder ab", () => {
    expect(skillModeFrontmatter("aus")).toEqual({ enabled: false });
    expect(skillModeFrontmatter("beschreibung")).toEqual({});
    expect(skillModeFrontmatter("ganz")).toEqual({ pinned: true });
  });
});
