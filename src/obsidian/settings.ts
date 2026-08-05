import { PluginSettingTab, type App, type SettingDefinitionItem } from "obsidian";
import type KodaPlugin from "../main";

/** Placeholder — Task 14 replaces this with the real declarative settings tab.
 *  An empty array here means display() (below) stays the active fallback path
 *  (per PluginSettingTab.display() typedoc: "not called when getSettingDefinitions
 *  returns a non-empty array"), which also satisfies the
 *  obsidianmd/settings-tab/prefer-setting-definitions lint rule in the interim. */
export class KodaSettingsTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: KodaPlugin) {
    super(app, plugin);
  }
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [];
  }
  display(): void {
    this.containerEl.empty();
  }
}
