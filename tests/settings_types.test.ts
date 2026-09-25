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
  CONTEXT_SELECTION_MIN,
  CONTEXT_TABS_MAX,
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

describe("Modell-Steuerung: die drei neuen Felder", () => {
  it("liefert leere Defaults — gespeichert wird die Abweichung, nie der Auslieferungsstand", () => {
    expect(DEFAULT_SETTINGS.systemPromptOverride).toBe("");
    expect(DEFAULT_SETTINGS.toolsDisabled).toEqual([]);
    expect(DEFAULT_SETTINGS.toolDescriptions).toEqual({});
  });
  it("uebernimmt gueltige Werte", () => {
    const s = validateKodaSettings({
      systemPromptOverride: "Sei knapp.",
      toolsDisabled: ["write_skill"],
      toolDescriptions: { read_note: "Liest." },
    });
    expect(s.systemPromptOverride).toBe("Sei knapp.");
    expect(s.toolsDisabled).toEqual(["write_skill"]);
    expect(s.toolDescriptions).toEqual({ read_note: "Liest." });
  });
  it("behaelt einen unbekannten Werkzeugnamen — sonst loescht ein Speichern die "
    + "related_notes-Anpassung, sobald vault-rag gerade aus ist (Spec E4)", () => {
    const s = validateKodaSettings({
      toolsDisabled: ["related_notes"],
      toolDescriptions: { related_notes: "Meins." },
    });
    expect(s.toolsDisabled).toEqual(["related_notes"]);
    expect(s.toolDescriptions).toEqual({ related_notes: "Meins." });
  });
  it("wirft kaputte Bauformen weg statt sie durchzureichen", () => {
    expect(validateKodaSettings({ toolsDisabled: "write_note" }).toolsDisabled).toEqual([]);
    expect(validateKodaSettings({ toolsDisabled: [1, "a", null] }).toolsDisabled).toEqual(["a"]);
    expect(validateKodaSettings({ toolDescriptions: ["x"] }).toolDescriptions).toEqual({});
    expect(validateKodaSettings({ toolDescriptions: { a: 5, b: "gut" } }).toolDescriptions).toEqual({ b: "gut" });
    expect(validateKodaSettings({ systemPromptOverride: 42 }).systemPromptOverride).toBe("");
  });
  it("teilt keinen Container mit den Defaults", () => {
    const s = validateKodaSettings({});
    s.toolsDisabled.push("x");
    expect(DEFAULT_SETTINGS.toolsDisabled).toEqual([]);
  });
});

describe("Arbeitskontext-Einstellungen", () => {
  it("Defaults: Arbeitsplatz, 600 Zeichen Markierung, 12 Tabs, 300 Zeichen Kopfdaten", () => {
    const s = validateKodaSettings(null);
    expect(s.contextModeDefault).toBe("workspace");
    expect(s.contextSelectionChars).toBe(600);
    expect(s.contextTabsMax).toBe(12);
    expect(s.contextFrontmatterChars).toBe(300);
  });
  it("klemmt die Kappungen in ihre Spannen und laesst 0 Kopfdaten zu", () => {
    expect(validateKodaSettings({ contextSelectionChars: 1 }).contextSelectionChars).toBe(CONTEXT_SELECTION_MIN);
    expect(validateKodaSettings({ contextTabsMax: 999 }).contextTabsMax).toBe(CONTEXT_TABS_MAX);
    expect(validateKodaSettings({ contextFrontmatterChars: 0 }).contextFrontmatterChars).toBe(0);
  });
  it("ein unbekannter Modus faellt auf den Default zurueck, ein noch nicht gebauter (note) bleibt erlaubt", () => {
    expect(validateKodaSettings({ contextModeDefault: "galaxy" }).contextModeDefault).toBe("workspace");
    expect(validateKodaSettings({ contextModeDefault: "off" }).contextModeDefault).toBe("off");
    expect(validateKodaSettings({ contextModeDefault: "note" }).contextModeDefault).toBe("note");
  });
});

describe("Arbeitskontext-Einstellungen der Etappe 2", () => {
  it("contextKeepChoices ist standardmaessig an — Abwahl bleibt, bis der Nutzer sie aufhebt", () => {
    expect(validateKodaSettings({}).contextKeepChoices).toBe(true);
    expect(validateKodaSettings({ contextKeepChoices: false }).contextKeepChoices).toBe(false);
  });
  it("contextKeepChoices faellt bei Unsinn auf den Auslieferungswert zurueck", () => {
    expect(validateKodaSettings({ contextKeepChoices: "ja" }).contextKeepChoices).toBe(true);
  });
  it("contextSections nimmt nur Booleans — fremde Werte kosten den Eintrag, nicht das Feld", () => {
    const s = validateKodaSettings({ contextSections: { workspace: false, kaputt: 7 } });
    expect(s.contextSections).toEqual({ workspace: false });
  });
  it("contextSections faellt bei komplett falschem Typ auf {} zurueck", () => {
    expect(validateKodaSettings({ contextSections: "auf" }).contextSections).toEqual({});
  });
});

describe("Etappe 2b: Budget und Link-Tiefe", () => {
  it("klemmt contextBudgetChars in seine Spanne und nimmt Ziffernstrings an", () => {
    expect(validateKodaSettings({ contextBudgetChars: 500 }).contextBudgetChars).toBe(2000);
    expect(validateKodaSettings({ contextBudgetChars: 999999 }).contextBudgetChars).toBe(200000);
    expect(validateKodaSettings({ contextBudgetChars: "30000" }).contextBudgetChars).toBe(30000);
  });

  it("klemmt contextAutoK auf 0..20, Default 5", () => {
    expect(validateKodaSettings({}).contextAutoK).toBe(5);
    expect(validateKodaSettings({ contextAutoK: -1 }).contextAutoK).toBe(0);
    expect(validateKodaSettings({ contextAutoK: 99 }).contextAutoK).toBe(20);
    expect(validateKodaSettings({ contextAutoK: "7" }).contextAutoK).toBe(7);
  });

  it("klemmt contextLinkDepth auf 1..3", () => {
    expect(validateKodaSettings({ contextLinkDepth: 0 }).contextLinkDepth).toBe(1);
    expect(validateKodaSettings({ contextLinkDepth: 9 }).contextLinkDepth).toBe(3);
  });

  it("liefert die Defaults, wenn nichts dasteht", () => {
    const s = validateKodaSettings({});
    expect(s.contextBudgetChars).toBe(20000);
    expect(s.contextLinkDepth).toBe(1);
  });
});
