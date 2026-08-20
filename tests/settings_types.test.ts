import {
  DEFAULT_SETTINGS,
  validateKodaSettings,
  TIMEOUT_SEC_MIN,
  TIMEOUT_SEC_MAX,
  MAX_ROUNDS_LIMIT,
  SKILL_BUDGET_MIN,
  SKILL_BUDGET_MAX,
  LIST_ROWS_MIN,
  LIST_ROWS_MAX,
  CONTEXT_WINDOW_MIN,
  CONTEXT_WINDOW_MAX,
  COMPACT_AT_MIN,
  COMPACT_AT_MAX,
  KEEP_TOOLS_MIN,
  KEEP_TOOLS_MAX,
  SUMMARY_PCT_MIN,
  SUMMARY_PCT_MAX,
} from "../src/core/settings-types";

describe("validateKodaSettings", () => {
  it("leerer Input liefert Defaults", () => {
    expect(validateKodaSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it("klemmt maxRounds in die erlaubte Spanne", () => {
    expect(validateKodaSettings({ maxRounds: 99999 }).maxRounds).toBe(MAX_ROUNDS_LIMIT);
    expect(validateKodaSettings({ maxRounds: 0 }).maxRounds).toBe(1);
  });
  // Regression: bis 0.3.0 lag die Obergrenze bei 16 und schluckte genau diesen
  // Wunschwert still — von Hand gesetzte 25 wurden beim Laden auf 16 gekappt,
  // ohne dass irgendwo etwas davon stand.
  it("laesst einen mehrschrittigen Runden-Wunsch (25) unveraendert durch", () => {
    expect(validateKodaSettings({ maxRounds: 25 }).maxRounds).toBe(25);
  });
  it("klemmt timeoutSec in die erlaubte Spanne", () => {
    expect(validateKodaSettings({ timeoutSec: 99999 }).timeoutSec).toBe(TIMEOUT_SEC_MAX);
    expect(validateKodaSettings({ timeoutSec: 1 }).timeoutSec).toBe(TIMEOUT_SEC_MIN);
    expect(validateKodaSettings({ timeoutSec: 300 }).timeoutSec).toBe(300);
  });
  it("migriert eine alte String-Endpoint-Liste zu EndpointConfig", () => {
    const s = validateKodaSettings({ endpoints: ["http://a:1234"] });
    expect(s.endpoints).toEqual([{ url: "http://a:1234" }]);
  });
});

describe("skillBudgetChars", () => {
  it("hat einen Default von 6000", () => {
    expect(validateKodaSettings({}).skillBudgetChars).toBe(6000);
  });
  it("wird nach unten geklemmt", () => {
    expect(validateKodaSettings({ skillBudgetChars: 10 }).skillBudgetChars).toBe(SKILL_BUDGET_MIN);
  });
  it("wird nach oben geklemmt", () => {
    expect(validateKodaSettings({ skillBudgetChars: 999999 }).skillBudgetChars).toBe(SKILL_BUDGET_MAX);
  });
  it("Muell faellt auf den Default zurueck", () => {
    expect(validateKodaSettings({ skillBudgetChars: "viel" }).skillBudgetChars).toBe(6000);
  });
  // Regression zur Runden-Grenze oben: dieselbe stille Kappung traf das Budget.
  // 80000 deckt eine ganze Skill-Sammlung, nicht nur eine einzelne Datei.
  it("laesst ein Budget fuer eine ganze Skill-Sammlung (80000) durch", () => {
    expect(validateKodaSettings({ skillBudgetChars: 80000 }).skillBudgetChars).toBe(80000);
  });
});

describe("listNotesMaxRows", () => {
  it("hat 150 als Default", () => {
    expect(validateKodaSettings({}).listNotesMaxRows).toBe(150);
  });
  it("klemmt nach unten und oben statt zu uebernehmen", () => {
    expect(validateKodaSettings({ listNotesMaxRows: 1 }).listNotesMaxRows).toBe(LIST_ROWS_MIN);
    expect(validateKodaSettings({ listNotesMaxRows: 99999 }).listNotesMaxRows).toBe(LIST_ROWS_MAX);
  });
  it("faellt bei Unsinn auf den Default zurueck", () => {
    expect(validateKodaSettings({ listNotesMaxRows: "viele" }).listNotesMaxRows).toBe(150);
  });
});

describe("validateKodaSettings · Kontext & Verdichtung", () => {
  it("Defaults: 8192 / 75 % / K=3 / Stufe 2 an / 10 %", () => {
    const s = validateKodaSettings(null);
    expect(s.contextWindowTokens).toBe(8192);
    expect(s.compactAtPercent).toBe(75);
    expect(s.keepToolResults).toBe(3);
    expect(s.summarizeEnabled).toBe(true);
    expect(s.summaryPercent).toBe(10);
  });
  it("klemmt alle vier Zahlen in ihre Spannen", () => {
    expect(validateKodaSettings({ contextWindowTokens: 100 }).contextWindowTokens).toBe(CONTEXT_WINDOW_MIN);
    expect(validateKodaSettings({ contextWindowTokens: 5_000_000 }).contextWindowTokens).toBe(CONTEXT_WINDOW_MAX);
    expect(validateKodaSettings({ compactAtPercent: 10 }).compactAtPercent).toBe(COMPACT_AT_MIN);
    expect(validateKodaSettings({ compactAtPercent: 100 }).compactAtPercent).toBe(COMPACT_AT_MAX);
    expect(validateKodaSettings({ keepToolResults: -1 }).keepToolResults).toBe(KEEP_TOOLS_MIN);
    expect(validateKodaSettings({ keepToolResults: 99 }).keepToolResults).toBe(KEEP_TOOLS_MAX);
    expect(validateKodaSettings({ summaryPercent: 0 }).summaryPercent).toBe(SUMMARY_PCT_MIN);
    expect(validateKodaSettings({ summaryPercent: 50 }).summaryPercent).toBe(SUMMARY_PCT_MAX);
  });
  it("Muellwerte fallen auf den Default zurueck, alte data.json ohne die Felder laedt", () => {
    expect(validateKodaSettings({ contextWindowTokens: "viel" }).contextWindowTokens).toBe(8192);
    expect(validateKodaSettings({ maxRounds: 8 }).summarizeEnabled).toBe(true);
  });
});
