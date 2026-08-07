import { appendMemoryLine, buildSystemPrompt, MEMORY_HEADER } from "../src/core/memory/memory";

describe("appendMemoryLine", () => {
  it("startet eine leere Memory mit Header + erster Zeile", () => {
    const r = appendMemoryLine("", "Jay mag kurze Antworten", "2026-08-05");
    expect(r.startsWith(MEMORY_HEADER)).toBe(true);
    expect(r).toContain("- [2026-08-05] Jay mag kurze Antworten");
  });
  it("haengt an bestehende Memory an, ohne sie umzubauen", () => {
    const existing = `${MEMORY_HEADER}\n- [2026-08-01] alt\n`;
    const r = appendMemoryLine(existing, "neu", "2026-08-05");
    expect(r).toBe(`${MEMORY_HEADER}\n- [2026-08-01] alt\n- [2026-08-05] neu\n`);
  });
});

describe("buildSystemPrompt", () => {
  it("enthaelt Sprache, Koda-Ordner und die Memory", () => {
    const p = buildSystemPrompt({ lang: "de", memory: "- [x] Fakt", kodaFolder: "Koda" });
    expect(p).toContain("German");
    expect(p).toContain("Koda/");
    expect(p).toContain("- [x] Fakt");
  });
  it("ohne Memory kein leerer Memory-Block", () => {
    expect(buildSystemPrompt({ lang: "en", memory: "", kodaFolder: "Koda" })).not.toContain("## Memory");
  });

  const sel = (loaded: string[], descOnly: string[] = []) => ({
    loaded: loaded.map((n) => ({ name: n, description: `desc-${n}`, enabled: true, body: `body-${n}` })),
    descriptionOnly: descOnly.map((n) => ({ name: n, description: `desc-${n}`, enabled: true, body: `body-${n}` })),
    disabled: [],
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
