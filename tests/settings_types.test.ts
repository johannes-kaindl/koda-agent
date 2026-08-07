import {
  DEFAULT_SETTINGS,
  mergeKodaSettings,
  TIMEOUT_SEC_MIN,
  TIMEOUT_SEC_MAX,
  SKILL_BUDGET_MIN,
  SKILL_BUDGET_MAX,
} from "../src/core/settings-types";

describe("mergeKodaSettings", () => {
  it("leerer Input liefert Defaults", () => {
    expect(mergeKodaSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it("klemmt maxRounds in 1..16", () => {
    expect(mergeKodaSettings({ maxRounds: 99 }).maxRounds).toBe(16);
    expect(mergeKodaSettings({ maxRounds: 0 }).maxRounds).toBe(1);
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
});
