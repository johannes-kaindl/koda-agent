import { parseArbeit } from "../src/core/abilities/parse";

describe("parseArbeit", () => {
  it("ohne koda: arbeit ist die Notiz keine Arbeit", () => {
    expect(parseArbeit("X", { skills: { a: "ganz" } })).toBeNull();
    expect(parseArbeit("X", null)).toBeNull();
    expect(parseArbeit("X", { koda: "skill" })).toBeNull();
  });

  it("liest das Beispiel aus der Spec vollständig", () => {
    const r = parseArbeit("Inbox aufräumen", {
      koda: "arbeit",
      skills: { "inbox-triage": "ganz" },
      "übrige-skills": "aus",
      werkzeuge: { write_skill: "aus" },
      anbieter: { "vault-retrieval": "an" },
      kontext: { modus: "note", tiefe: 1, budget: 20000, nachbarn: 5, notizen: ["Inbox/"] },
      base: "Bases/Inbox.base#Neu",
    });
    expect(r).not.toBeNull();
    expect(r!.invalid).toEqual([]);
    expect(r!.arbeit).toEqual({
      name: "Inbox aufräumen",
      skills: { "inbox-triage": "ganz" },
      uebrigeSkills: "aus",
      werkzeuge: { write_skill: "aus" },
      anbieter: { "vault-retrieval": "an" },
      kontext: { modus: "note", tiefe: 1, budget: 20000, nachbarn: 5, notizen: ["Inbox/"] },
      base: "Bases/Inbox.base#Neu",
    });
  });

  it("eine leere Arbeit folgt der Grundeinstellung", () => {
    const r = parseArbeit("Leer", { koda: "arbeit" });
    expect(r!.arbeit).toEqual({
      name: "Leer", skills: {}, uebrigeSkills: "grundeinstellung", werkzeuge: {}, anbieter: {}, kontext: {}, base: null,
    });
    expect(r!.invalid).toEqual([]);
  });

  it("ungültige Einträge kosten den Eintrag, nicht die Arbeit, und werden benannt", () => {
    const r = parseArbeit("Kaputt", {
      koda: "arbeit",
      skills: { a: "ganz", b: "voll", c: true },
      "übrige-skills": "nein",
      werkzeuge: { move_note: "on" },
      anbieter: "vault-retrieval",
      kontext: { modus: "alles", tiefe: 9, budget: "20000", nachbarn: -1, notizen: ["A.md", 3] },
      base: 42,
    });
    expect(r!.arbeit.skills).toEqual({ a: "ganz" });
    expect(r!.arbeit.uebrigeSkills).toBe("grundeinstellung");
    expect(r!.arbeit.werkzeuge).toEqual({});
    expect(r!.arbeit.anbieter).toEqual({});
    expect(r!.arbeit.kontext).toEqual({ budget: 20000, notizen: ["A.md"] });
    expect(r!.arbeit.base).toBeNull();
    expect(r!.invalid).toEqual([
      "skills.b", "skills.c", "übrige-skills", "werkzeuge.move_note", "anbieter",
      "kontext.modus", "kontext.tiefe", "kontext.nachbarn", "kontext.notizen.1", "base",
    ]);
  });

  it("eine ASCII-Schreibweise eines bekannten Schluessels wird genannt, andere Frontmatter-Felder nicht", () => {
    const r = parseArbeit("T", { koda: "arbeit", "uebrige-skills": "aus", tags: ["x"], created: "2026-10-18" });
    expect(r!.arbeit.uebrigeSkills).toBe("grundeinstellung");
    expect(r!.invalid).toEqual(["uebrige-skills (übrige-skills?)"]);
  });
});
