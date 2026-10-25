import { describe, expect, it, vi } from "vitest";
import "../src/i18n/strings";
import { KodaSettingsTab } from "../src/obsidian/settings";
import { DEFAULT_SETTINGS } from "../src/core/settings-types";

// Welle 27: die Gruppe „Links and images in answers“ (Kit `link-settings`): zwei Schalter, beide aus; ein Umlegen schreibt die Einstellung und speichert.
describe("Einstellungsgruppe Links und Bilder in Antworten", () => {
  function setup() {
    const plugin = { settings: structuredClone(DEFAULT_SETTINGS), saveSettings: vi.fn(async () => {}) };
    const tab = new KodaSettingsTab({} as never, plugin as never);
    return { tab, plugin };
  }

  it("steht in den Definitionen mit den zwei Zeilen in der Wortwahl des Kits", () => {
    const { tab } = setup();
    const g = (tab.getSettingDefinitions() as any[]).find((d) => d.heading === "Links and images in answers");
    expect(g).toBeTruthy();
    expect((g.items as any[]).map((i) => i.name)).toEqual(["Allow obsidian:// links", "Show local images from the vault"]);
  });

  it("ein Schalter schreibt die Einstellung und speichert", async () => {
    const { tab, plugin } = setup();
    const g = (tab.getSettingDefinitions() as any[]).find((d) => d.heading === "Links and images in answers");
    for (const [i, key] of [[0, "allowObsidianLinks"], [1, "allowLocalImages"]] as const) {
      let onChange: ((v: boolean) => void) | null = null;
      const setting: any = { setName: () => setting, setDesc: () => setting, addToggle: (cb: any) => { cb({ setValue: () => ({ onChange: (f: any) => { onChange = f; } }) }); return setting; } };
      g.items[i].render(setting);
      onChange!(true);
      await vi.waitFor(() => { expect((plugin.settings as any)[key]).toBe(true); });
    }
    expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
  });
});
