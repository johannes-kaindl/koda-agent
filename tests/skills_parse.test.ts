import { parseSkill } from "../src/core/skills/skill";

const RAW = `---
description: Wenn nach einem Projekt gefragt wird, zuerst die Hub-Notiz lesen
enabled: true
---

Projekte liegen unter 25_Coding/<name>/.
`;

describe("parseSkill", () => {
  it("liest description, enabled und Body", () => {
    const r = parseSkill("Projektnotizen", RAW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skill.name).toBe("Projektnotizen");
    expect(r.skill.description).toBe("Wenn nach einem Projekt gefragt wird, zuerst die Hub-Notiz lesen");
    expect(r.skill.enabled).toBe(true);
    expect(r.skill.body).toContain("25_Coding");
  });

  it("ohne enabled-Feld gilt der Skill als aktiv", () => {
    const r = parseSkill("X", "---\ndescription: tu was\n---\n\nBody\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skill.enabled).toBe(true);
  });

  // Kit-Typ-Asymmetrie: yaml_lite macht keine Typinferenz, `false` kommt als String an.
  it("enabled: false schaltet ab (String, nicht Boolean)", () => {
    const r = parseSkill("X", "---\ndescription: tu was\nenabled: false\n---\n\nBody\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skill.enabled).toBe(false);
  });

  it("Gross/Kleinschreibung und Leerraum bei enabled zaehlen nicht", () => {
    const r = parseSkill("X", "---\ndescription: tu was\nenabled:  FALSE \n---\n\nBody\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skill.enabled).toBe(false);
  });

  it("ohne Frontmatter: kein gueltiger Skill", () => {
    const r = parseSkill("X", "Nur Text, kein Frontmatter\n");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("no-description");
    expect(r.name).toBe("X");
  });

  it("leere description ist keine description", () => {
    const r = parseSkill("X", "---\ndescription:   \n---\n\nBody\n");
    expect(r.ok).toBe(false);
  });

  // FmValue kann string[] sein — eine Liste ist keine Beschreibung.
  it("description als Liste ist ungueltig", () => {
    const r = parseSkill("X", "---\ndescription: [a, b]\n---\n\nBody\n");
    expect(r.ok).toBe(false);
  });

  it("leerer Body ist erlaubt", () => {
    const r = parseSkill("X", "---\ndescription: tu was\n---\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skill.body).toBe("");
  });
});
