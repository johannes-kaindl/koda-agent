import { appendMemoryLine, MEMORY_HEADER } from "../src/core/memory/memory";

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
