import {
  baseSkillMode, effectiveContext, effectiveDisabledTools, effectiveSkillMode, frontmatterMode, overlayCount,
  selectEffective, skillModeLookup, unknownEntries, withOverlayProvider, withOverlaySkill, withOverlayTool,
} from "../src/core/abilities/resolve";
import { emptyOverlay, type Arbeit } from "../src/core/abilities/types";
import type { Skill } from "../src/core/skills/skill";

const sk = (name: string, o: { enabled?: boolean; pinned?: boolean; len?: number } = {}): Skill => ({
  name, description: `d-${name}`, enabled: o.enabled ?? true, pinned: o.pinned ?? false, body: "x".repeat(o.len ?? 10),
});
const arbeit = (o: Partial<Arbeit> = {}): Arbeit => ({
  name: "A", skills: {}, uebrigeSkills: "grundeinstellung", werkzeuge: {}, anbieter: {}, kontext: {}, base: null, ...o,
});

describe("Skill-Stellungen", () => {
  it("frontmatterMode bildet enabled/pinned auf die drei Stellungen ab", () => {
    expect(frontmatterMode(sk("a", { enabled: false, pinned: true }))).toBe("aus");
    expect(frontmatterMode(sk("a", { pinned: true }))).toBe("ganz");
    expect(frontmatterMode(sk("a"))).toBe("beschreibung");
  });

  it("Vorrang: Overlay vor Arbeit vor übrige-skills vor Frontmatter", () => {
    const s = sk("triage", { pinned: true });
    expect(effectiveSkillMode(s, null, emptyOverlay())).toBe("ganz");
    expect(effectiveSkillMode(s, arbeit({ uebrigeSkills: "aus" }), emptyOverlay())).toBe("aus");
    expect(effectiveSkillMode(s, arbeit({ uebrigeSkills: "aus", skills: { triage: "beschreibung" } }), emptyOverlay())).toBe("beschreibung");
    const o = { ...emptyOverlay(), skills: { triage: "ganz" as const } };
    expect(effectiveSkillMode(s, arbeit({ skills: { triage: "aus" } }), o)).toBe("ganz");
  });

  it("ein Skill-Name in der Arbeit wirkt ohne Rücksicht auf Groß/klein", () => {
    expect(baseSkillMode(sk("inbox-triage"), arbeit({ skills: { "Inbox-Triage": "ganz" } }))).toBe("ganz");
  });

  it("ein neuer Skill rutscht bei übrige-skills: aus nicht in die Arbeit", () => {
    const sel = selectEffective([sk("triage"), sk("neu", { pinned: true })], arbeit({ uebrigeSkills: "aus", skills: { triage: "ganz" } }), emptyOverlay(), 6000);
    expect(sel.loaded.map((s) => s.name)).toEqual(["triage"]);
    expect(sel.descriptionOnly).toEqual([]);
    expect(sel.disabled).toEqual(["neu"]);
  });

  it("selectEffective behält die Budget-Meldung von selectSkills", () => {
    const o = { ...emptyOverlay(), skills: { a: "ganz" as const, b: "ganz" as const } };
    const sel = selectEffective([sk("a", { len: 600 }), sk("b", { len: 600 })], null, o, 1000);
    expect(sel.loaded.map((s) => s.name)).toEqual(["a", "b"]);
    expect(sel.overBudget).toBe(200);
  });

  it("skillModeLookup findet ohne Groß/klein und meldet Unbekanntes als null", () => {
    const look = skillModeLookup([sk("Triage")], null, { ...emptyOverlay(), skills: { Triage: "aus" } });
    expect(look("triage")).toBe("aus");
    expect(look("fehlt")).toBeNull();
  });
});

describe("Overlay-Setter", () => {
  it("ein Wert gleich dem Grundwert entfernt den Eintrag, der Eingang bleibt unverändert", () => {
    const o0 = emptyOverlay();
    const o1 = withOverlaySkill(o0, "a", "ganz", "beschreibung");
    expect(o1.skills).toEqual({ a: "ganz" });
    expect(o0.skills).toEqual({});
    expect(withOverlaySkill(o1, "a", "beschreibung", "beschreibung").skills).toEqual({});
    const o2 = withOverlayProvider(withOverlayTool(o1, "write_skill", "aus", "an"), "vault-retrieval", "aus", "an");
    expect(overlayCount(o2)).toBe(3);
    expect(overlayCount(withOverlayTool(o2, "write_skill", "an", "an"))).toBe(2);
  });
});

describe("effectiveDisabledTools", () => {
  const own = ["move_note", "write_skill"];
  const prov = [{ id: "vault-retrieval", tools: ["related_notes", "vault_search"] }];

  it("ohne Arbeit und Overlay gelten die Einstellungen", () => {
    expect(effectiveDisabledTools(["move_note"], own, prov, null, emptyOverlay())).toEqual(["move_note"]);
  });

  it("eigenes Werkzeug: an in der Arbeit schaltet ein abgeschaltetes wieder ein, Overlay gewinnt", () => {
    expect(effectiveDisabledTools(["move_note"], own, prov, arbeit({ werkzeuge: { move_note: "an", write_skill: "aus" } }), emptyOverlay())).toEqual(["write_skill"]);
    const o = { ...emptyOverlay(), werkzeuge: { write_skill: "an" as const } };
    expect(effectiveDisabledTools([], own, prov, arbeit({ werkzeuge: { write_skill: "aus" } }), o)).toEqual([]);
  });

  it("Anbieter aus schaltet alle seine Werkzeuge ab, an schaltet ein einzeln abgeschaltetes nicht ein", () => {
    expect(effectiveDisabledTools([], own, prov, arbeit({ anbieter: { "vault-retrieval": "aus" } }), emptyOverlay())).toEqual(["related_notes", "vault_search"]);
    expect(effectiveDisabledTools(["vault_search"], own, prov, arbeit({ anbieter: { "vault-retrieval": "an" } }), emptyOverlay())).toEqual(["vault_search"]);
  });
});

describe("effectiveContext", () => {
  const d = { contextModeDefault: "workspace" as const, contextLinkDepth: 1, contextBudgetChars: 20000, contextAutoK: 5 };

  it("Vorrang Overlay, Arbeit, Einstellung; Budget kennt kein Overlay", () => {
    expect(effectiveContext(d, null, emptyOverlay())).toEqual({ mode: "workspace", depth: 1, budget: 20000, autoK: 5 });
    const a = arbeit({ kontext: { modus: "note", tiefe: 2, budget: 8000, nachbarn: 0 } });
    expect(effectiveContext(d, a, emptyOverlay())).toEqual({ mode: "note", depth: 2, budget: 8000, autoK: 0 });
    const o = { ...emptyOverlay(), kontext: { modus: "tabs" as const, tiefe: 3 } };
    expect(effectiveContext(d, a, o)).toEqual({ mode: "tabs", depth: 3, budget: 8000, autoK: 0 });
  });
});

describe("unknownEntries", () => {
  it("nennt Skills, Werkzeuge und Anbieter, die es nicht gibt", () => {
    const a = arbeit({ skills: { Triage: "ganz", weg: "aus" }, werkzeuge: { move_note: "aus", fly: "an" }, anbieter: { "vault-retrieval": "an", "calendar-notes": "aus" } });
    expect(unknownEntries(a, { skills: ["triage"], ownTools: ["move_note"], providers: ["vault-retrieval"] }))
      .toEqual(["skills.weg", "werkzeuge.fly", "anbieter.calendar-notes"]);
  });
});
