import { renderNow } from "../src/core/prompt/now";
import { buildSystemPrompt } from "../src/core/prompt/build";
import { renderRules, effectiveRules } from "../src/core/prompt/rules";

// 2026-09-30 21:45 UTC = 23:45 in Europe/Berlin (Sommerzeit) — Zeitzone kommt aus der Option,
// nie aus TZ, damit der Test auf jedem Rechner dasselbe sagt.
const T = Date.UTC(2026, 8, 30, 21, 45, 0);

describe("renderNow", () => {
  it("nennt Datum, englischen Wochentag, Uhrzeit und Zeitzone", () => {
    expect(renderNow(T, "Europe/Berlin")).toBe("2026-09-30 (Wednesday) 23:45, Europe/Berlin");
  });
  it("rechnet in die gewaehlte Zeitzone — auch ueber die Datumsgrenze", () => {
    expect(renderNow(T, "Asia/Tokyo")).toBe("2026-10-01 (Thursday) 06:45, Asia/Tokyo");
    expect(renderNow(T, "UTC")).toBe("2026-09-30 (Wednesday) 21:45, UTC");
  });
  it("Mitternacht heisst 00:45, nicht 24:45", () => {
    expect(renderNow(Date.UTC(2026, 8, 30, 22, 45), "Europe/Berlin")).toBe("2026-10-01 (Thursday) 00:45, Europe/Berlin");
  });
});

describe("buildSystemPrompt: Anhang ## Now", () => {
  const base = { lang: "en" as const, memory: "", kodaFolder: "Koda" };
  it("haengt ## Now als eigenen Anhang an", () => {
    const p = buildSystemPrompt({ ...base, now: T, timeZone: "Europe/Berlin" });
    expect(p.endsWith("## Now\n2026-09-30 (Wednesday) 23:45, Europe/Berlin")).toBe(true);
  });
  it("ohne now kein Anhang (Altaufrufer, Tests)", () => {
    expect(buildSystemPrompt(base)).not.toContain("## Now");
  });
  it("der Regelblock bleibt von der Uhrzeit unberuehrt — sonst aendert sich der Vorlagen-Hash taeglich", () => {
    const a = buildSystemPrompt({ ...base, now: T, timeZone: "UTC" });
    const b = buildSystemPrompt({ ...base, now: T + 86_400_000, timeZone: "UTC" });
    const rules = renderRules(effectiveRules(undefined), { lang: "en", folder: "Koda" });
    expect(a.startsWith(rules)).toBe(true);
    expect(b.startsWith(rules)).toBe(true);
    expect(a).not.toBe(b);
  });
  it("steht hinter Memory und Skills", () => {
    const p = buildSystemPrompt({ ...base, memory: "- m", now: T, timeZone: "UTC" });
    expect(p.indexOf("## Memory")).toBeLessThan(p.indexOf("## Now"));
  });
});
