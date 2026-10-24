import { afterEach, describe, expect, it, vi } from "vitest";
import { Setting } from "obsidian";
import "../src/i18n/strings";
import { KodaSettingsTab } from "../src/obsidian/settings";
import type { EndpointListStrings } from "../src/vendor/kit-obsidian/endpoint-list";
import { setLang, t } from "../src/vendor/kit/i18n";

/** UI-STANDARD §8: die Hilfe-Zeile ist das ERSTE Element der Settings, vor jeder Zeile. */
type Hatch = { name?: string; desc?: string; render?: (s: Setting) => void };

function tab(): KodaSettingsTab {
  return new KodaSettingsTab({} as never, { settings: {} } as never);
}

const erste = (): Hatch => tab().getSettingDefinitions()[0] as unknown as Hatch;

describe("Hilfe-Zeile in den Settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setLang("en");
  });

  it("ist das ERSTE Element von getSettingDefinitions", () => {
    setLang("en");
    expect(erste().name).toBe("Help");
    expect(typeof erste().render).toBe("function");
  });

  it("trägt in Englisch und Deutsch die Texte aus den Strings", () => {
    setLang("de");
    expect(erste().name).toBe(t("settings.help.name"));
    expect(erste().name).toBe("Hilfe");
    setLang("en");
    expect(erste().desc).toBe("Getting started, how-tos and troubleshooting");
  });

  it("die Knöpfe öffnen Doku-Index und Issues dieses Repos", () => {
    const open = vi.fn();
    vi.stubGlobal("window", { open });
    const setting = new Setting(undefined as never);
    erste().render?.(setting);
    const knoepfe = (setting as unknown as { components: Array<{ clickCB: (() => void) | null }> }).components;
    expect(knoepfe).toHaveLength(2);
    knoepfe.forEach((k) => k.clickCB?.());
    expect(open.mock.calls.map((c) => c[0])).toEqual([
      "https://github.com/johannes-kaindl/koda-agent/blob/main/docs/README.md",
      "https://github.com/johannes-kaindl/koda-agent/issues",
    ]);
  });
});

/** Rollen-Kette der Endpunkt-Liste: jede der fünf Rollen hat einen eigenen, echten Text. */
describe("Rollen der Endpunkt-Liste", () => {
  afterEach(() => setLang("en"));

  const rollen = [
    { kind: "active" },
    { kind: "unreachable" },
    { kind: "skipped-model" },
    { kind: "search-only" },
    { kind: "standby", position: 2 },
  ] as const;

  function texte(lang: "en" | "de"): string[] {
    setLang(lang);
    const strings = (tab() as unknown as { endpointStrings(): EndpointListStrings }).endpointStrings();
    return rollen.map((r) => strings.role(r as never));
  }

  it("search-only trägt einen eigenen Text, nicht den der Bereitschaft", () => {
    for (const lang of ["en", "de"] as const) {
      setLang(lang);
      const strings = (tab() as unknown as { endpointStrings(): EndpointListStrings }).endpointStrings();
      const text = strings.role({ kind: "search-only" } as never);
      expect(text).not.toBe(strings.role({ kind: "standby", position: 1 } as never));
      expect(text).not.toContain("undefined");
      expect(text).not.toBe("settings.endpoints.role.searchOnly");
    }
  });

  it("alle fünf Rollen tragen in EN und DE verschiedene Texte, und DE ist nicht EN", () => {
    const en = texte("en");
    const de = texte("de");
    expect(new Set(en).size).toBe(5);
    expect(new Set(de).size).toBe(5);
    en.forEach((text, i) => expect(de[i]).not.toBe(text));
  });
});
