import {
  DEFAULT_SETTINGS,
  mergeKodaSettings,
  TIMEOUT_SEC_MIN,
  TIMEOUT_SEC_MAX,
  MAX_ROUNDS_LIMIT,
  SKILL_BUDGET_MIN,
  SKILL_BUDGET_MAX,
  LIST_ROWS_MIN,
  LIST_ROWS_MAX,
} from "../src/core/settings-types";

describe("mergeKodaSettings", () => {
  it("leerer Input liefert Defaults", () => {
    expect(mergeKodaSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it("klemmt maxRounds in die erlaubte Spanne", () => {
    expect(mergeKodaSettings({ maxRounds: 99999 }).maxRounds).toBe(MAX_ROUNDS_LIMIT);
    expect(mergeKodaSettings({ maxRounds: 0 }).maxRounds).toBe(1);
  });
  // Regression: bis 0.3.0 lag die Obergrenze bei 16 und schluckte genau diesen
  // Wunschwert still — von Hand gesetzte 25 wurden beim Laden auf 16 gekappt,
  // ohne dass irgendwo etwas davon stand.
  it("laesst einen mehrschrittigen Runden-Wunsch (25) unveraendert durch", () => {
    expect(mergeKodaSettings({ maxRounds: 25 }).maxRounds).toBe(25);
  });
  it("klemmt timeoutSec in die erlaubte Spanne", () => {
    expect(mergeKodaSettings({ timeoutSec: 99999 }).timeoutSec).toBe(TIMEOUT_SEC_MAX);
    expect(mergeKodaSettings({ timeoutSec: 1 }).timeoutSec).toBe(TIMEOUT_SEC_MIN);
    expect(mergeKodaSettings({ timeoutSec: 300 }).timeoutSec).toBe(300);
  });
  it("migriert eine alte String-Endpoint-Liste zu EndpointConfig", () => {
    const s = mergeKodaSettings({ endpoints: ["http://a:1234"] });
    expect(s.endpoints).toEqual([{ url: "http://a:1234" }]);
  });
});

describe("skillBudgetChars", () => {
  it("hat einen Default von 6000", () => {
    expect(mergeKodaSettings({}).skillBudgetChars).toBe(6000);
  });
  it("wird nach unten geklemmt", () => {
    expect(mergeKodaSettings({ skillBudgetChars: 10 }).skillBudgetChars).toBe(SKILL_BUDGET_MIN);
  });
  it("wird nach oben geklemmt", () => {
    expect(mergeKodaSettings({ skillBudgetChars: 999999 }).skillBudgetChars).toBe(SKILL_BUDGET_MAX);
  });
  it("Muell faellt auf den Default zurueck", () => {
    expect(mergeKodaSettings({ skillBudgetChars: "viel" }).skillBudgetChars).toBe(6000);
  });
  // Regression zur Runden-Grenze oben: dieselbe stille Kappung traf das Budget.
  // 80000 deckt eine ganze Skill-Sammlung, nicht nur eine einzelne Datei.
  it("laesst ein Budget fuer eine ganze Skill-Sammlung (80000) durch", () => {
    expect(mergeKodaSettings({ skillBudgetChars: 80000 }).skillBudgetChars).toBe(80000);
  });
});

describe("listNotesMaxRows", () => {
  it("hat 150 als Default", () => {
    expect(mergeKodaSettings({}).listNotesMaxRows).toBe(150);
  });
  it("klemmt nach unten und oben statt zu uebernehmen", () => {
    expect(mergeKodaSettings({ listNotesMaxRows: 1 }).listNotesMaxRows).toBe(LIST_ROWS_MIN);
    expect(mergeKodaSettings({ listNotesMaxRows: 99999 }).listNotesMaxRows).toBe(LIST_ROWS_MAX);
  });
  it("faellt bei Unsinn auf den Default zurueck", () => {
    expect(mergeKodaSettings({ listNotesMaxRows: "viele" }).listNotesMaxRows).toBe(150);
  });
});
