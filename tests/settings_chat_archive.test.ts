import { describe, expect, it, vi } from "vitest";
import "../src/i18n/strings";
import { KodaSettingsTab } from "../src/obsidian/settings";
import { DEFAULT_SETTINGS, validateKodaSettings } from "../src/core/settings-types";
import { DEFAULT_CHAT_KEEP } from "../src/vendor/kit-obsidian/chat-archive-settings";

// Welle 29: der Verlauf vergangener Chats (Kit `chat-archive`). Vorgabe AUS (Aufbewahrung 0, Entscheidung Johannes für settings-assistant, vom Master auf alle Konsumenten der Welle übertragen);
// ein kaputter Eintrag in `data.json` schaltet ihn nie ein, und die 50 des Kits sind nie die Vorgabe dieses Plugins.
describe("Einstellungen des Verlaufs", () => {
  it("Vorgabe: aus, Ordner leer (= Vorgabeordner)", () => {
    expect(DEFAULT_SETTINGS.chatKeep).toBe(0);
    expect(DEFAULT_SETTINGS.chatKeep).not.toBe(DEFAULT_CHAT_KEEP);
    expect(DEFAULT_SETTINGS.chatFolder).toBe("");
    expect(validateKodaSettings(undefined).chatKeep).toBe(0);
  });
  it("ein kaputter Wert wird 0 (aus), nie die 50 des Kits", () => {
    for (const bad of ["kaputt", NaN, Infinity, null, {}, [], true]) expect(validateKodaSettings({ chatKeep: bad }).chatKeep).toBe(0);
  });
  it("gültige Werte bleiben, die Grenzen klemmen (0 bis 500)", () => {
    expect(validateKodaSettings({ chatKeep: 7 }).chatKeep).toBe(7);
    expect(validateKodaSettings({ chatKeep: 9999 }).chatKeep).toBe(500);
    expect(validateKodaSettings({ chatKeep: -3 }).chatKeep).toBe(0);
  });
  it("der Ordner bleibt ein Text; alles andere wird leer", () => {
    expect(validateKodaSettings({ chatFolder: "Eigene/Chats" }).chatFolder).toBe("Eigene/Chats");
    expect(validateKodaSettings({ chatFolder: 5 }).chatFolder).toBe("");
  });
});

describe("Einstellungsgruppe Verlauf", () => {
  function setup() {
    const plugin = { settings: structuredClone(DEFAULT_SETTINGS), saveSettings: vi.fn(async () => {}), manifest: { name: "Koda" }, syncChatArchive: vi.fn() };
    const tab = new KodaSettingsTab({ vault: { configDir: ".obsidian" } } as never, plugin as never);
    const group = (): any => (tab.getSettingDefinitions() as any[]).find((d) => d.heading === "Past chats");
    return { tab, plugin, group };
  }

  it("steht in den Definitionen mit Ordner und Aufbewahrung", () => {
    const { group } = setup();
    expect(group()).toBeTruthy();
    expect((group().items as any[]).length).toBe(2);
  });

  it("die Aufbewahrung schreibt die Einstellung, speichert und sagt dem Plugin Bescheid (der Verlauf-Knopf folgt)", async () => {
    const { plugin, group } = setup();
    let onChange: ((v: number) => void) | null = null;
    const slider: any = { setLimits: () => slider, setValue: () => slider, onChange: (f: any) => { onChange = f; return slider; } };
    const setting: any = { setName: () => setting, setDesc: () => setting, addSlider: (cb: any) => { cb(slider); return setting; } };
    group().items[1].render(setting);
    onChange!(12);
    await vi.waitFor(() => { expect(plugin.settings.chatKeep).toBe(12); });
    await vi.waitFor(() => { expect(plugin.syncChatArchive).toHaveBeenCalled(); });
    expect(plugin.saveSettings).toHaveBeenCalled();
  });
});
