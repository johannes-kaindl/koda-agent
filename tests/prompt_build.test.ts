import type { Selection } from "../src/core/skills/select";
import { buildSystemPrompt } from "../src/core/prompt/build";
import { DEFAULT_RULES, PLACEHOLDER_FOLDER } from "../src/core/prompt/rules";

const basis = { lang: "de" as const, memory: "", kodaFolder: "Koda" };

describe("buildSystemPrompt", () => {
  it("nimmt ohne Override den Auslieferungsstand, mit eingesetzten Platzhaltern", () => {
    const p = buildSystemPrompt(basis);
    expect(p).toContain("Always answer in German.");
    expect(p).toContain('folder "Koda/"');
    expect(p).not.toContain(PLACEHOLDER_FOLDER);
  });
  it("nimmt bei leerem Override ebenfalls den Auslieferungsstand", () => {
    expect(buildSystemPrompt({ ...basis, rulesOverride: "   " })).toBe(buildSystemPrompt(basis));
  });
  it("ersetzt den Regelblock vollstaendig, wenn ein Override da ist", () => {
    const p = buildSystemPrompt({ ...basis, rulesOverride: `Sei knapp. ${PLACEHOLDER_FOLDER} ist deiner.` });
    expect(p).toContain("Sei knapp. Koda ist deiner.");
    expect(p).not.toContain(DEFAULT_RULES.split("\n\n")[0]);
  });
  it("haengt Memory auch an einen Override an — Memory ist systemgesetzt", () => {
    const p = buildSystemPrompt({ ...basis, memory: "- mag Tee", rulesOverride: "Sei knapp." });
    expect(p).toContain("## Memory\n- mag Tee");
  });
  it("haengt Skills auch an einen Override an", () => {
    const sel: Selection = {
      loaded: [{ name: "auf", description: "d", body: "b", enabled: true }],
      descriptionOnly: [],
      disabled: [],
    };
    const p = buildSystemPrompt({ ...basis, rulesOverride: "Sei knapp.", skills: sel });
    expect(p).toContain("## Skills");
    expect(p).toContain("### auf");
  });
  it("folgt einem spaeteren Ordner-Umzug auch im Override", () => {
    const p = buildSystemPrompt({ ...basis, kodaFolder: "Assistent", rulesOverride: PLACEHOLDER_FOLDER });
    expect(p).toContain("Assistent");
    expect(p).not.toContain("Koda");
  });

  const sel = (loaded: string[], descOnly: string[] = []): Selection => ({
    loaded: loaded.map((n) => ({ name: n, description: `desc-${n}`, enabled: true, body: `body-${n}` })),
    descriptionOnly: descOnly.map((n) => ({ name: n, description: `desc-${n}`, enabled: true, body: `body-${n}` })),
    disabled: [],
  });

  it("enthaelt Sprache, Koda-Ordner und die Memory", () => {
    const p = buildSystemPrompt({ lang: "de", memory: "- [x] Fakt", kodaFolder: "Koda" });
    expect(p).toContain("German");
    expect(p).toContain("Koda/");
    expect(p).toContain("- [x] Fakt");
  });
  it("ohne Memory kein leerer Memory-Block", () => {
    expect(buildSystemPrompt({ lang: "en", memory: "", kodaFolder: "Koda" })).not.toContain("## Memory");
  });

  it("geladene Skills stehen mit Name, Beschreibung und Body im Prompt", () => {
    const p = buildSystemPrompt({ lang: "de", memory: "", kodaFolder: "Koda", skills: sel(["Alpha"]) });
    expect(p).toContain("## Skills");
    expect(p).toContain("Alpha");
    expect(p).toContain("desc-Alpha");
    expect(p).toContain("body-Alpha");
  });

  it("Budget-Skills stehen nur mit Beschreibung, ohne Body", () => {
    const p = buildSystemPrompt({ lang: "de", memory: "", kodaFolder: "Koda", skills: sel([], ["Beta"]) });
    expect(p).toContain("desc-Beta");
    expect(p).not.toContain("body-Beta");
  });

  it("ohne Skills kein leerer Skills-Block", () => {
    const p = buildSystemPrompt({ lang: "de", memory: "", kodaFolder: "Koda", skills: sel([]) });
    expect(p).not.toContain("## Skills");
  });

  it("Memory steht vor den Skills", () => {
    const p = buildSystemPrompt({ lang: "de", memory: "- Fakt", kodaFolder: "Koda", skills: sel(["Alpha"]) });
    expect(p.indexOf("## Memory")).toBeLessThan(p.indexOf("## Skills"));
  });

  it("weist auf Widersprueche hin, statt sie still aufzuloesen", () => {
    const p = buildSystemPrompt({ lang: "de", memory: "", kodaFolder: "Koda" });
    expect(p.toLowerCase()).toContain("conflict");
  });
});
