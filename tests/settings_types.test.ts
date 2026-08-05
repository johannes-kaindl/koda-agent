import { DEFAULT_SETTINGS, mergeKodaSettings } from "../src/core/settings-types";

describe("mergeKodaSettings", () => {
  it("leerer Input liefert Defaults", () => {
    expect(mergeKodaSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it("klemmt maxRounds in 1..16", () => {
    expect(mergeKodaSettings({ maxRounds: 99 }).maxRounds).toBe(16);
    expect(mergeKodaSettings({ maxRounds: 0 }).maxRounds).toBe(1);
  });
  it("migriert eine alte String-Endpoint-Liste zu EndpointConfig", () => {
    const s = mergeKodaSettings({ endpoints: ["http://a:1234"] });
    expect(s.endpoints).toEqual([{ url: "http://a:1234" }]);
  });
});
