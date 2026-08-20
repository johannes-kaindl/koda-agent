import {
  validateSettings,
  clampIntField,
  oneOf,
  arrayThen,
  type SettingsSchema,
} from "../vendor/kit/settings_schema";
import { migrateEndpointList, type EndpointConfig } from "../vendor/kit/endpoint_config";

/** Obergrenze für `maxRounds` — einzige Quelle, gegen die sowohl `mergeKodaSettings`
 *  klemmt als auch der Settings-Slider (`src/obsidian/settings.ts`) seine Limits setzt.
 *
 *  Die Zahl begrenzt die Bedienbarkeit des Sliders, nicht die Sicherheit: das Runden-Limit
 *  existiert gegen die Endlosschleife, und dagegen ist 50 so wirksam wie 16. Bis 0.3.0 stand
 *  hier 16 — ein Wert, der mit dem Settings-Tab entstand und nie inhaltlich begründet wurde;
 *  er kappte von Hand gesetzte Wünsche (25) beim Laden still weg. Wer ihn erneut verschiebt,
 *  wiegt Slider-Ergonomie gegen Laufzeit ab, nicht Risiko. */
export const MAX_ROUNDS_LIMIT = 50;

/** Spanne für `timeoutSec` — der Idle-Timeout des Chat-Clients (Stille seit dem letzten
 *  Byte, NICHT Gesamtdauer der Antwort; siehe `KodaChatClient`). Untergrenze so hoch,
 *  dass ein JIT-ladendes lokales Modell vor dem ersten Token nicht abgeschnitten wird. */
export const TIMEOUT_SEC_MIN = 30;
export const TIMEOUT_SEC_MAX = 900;
export const TIMEOUT_SEC_STEP = 30;

/** Spanne für `skillBudgetChars` — wie viele Zeichen Skill-Body höchstens in den
 *  System-Prompt wandern. Bewusst eine Einstellung und keine Konstante: die Grenze soll
 *  sichtbar sein, weil sie stillschweigend Verhalten weglässt.
 *
 *  Das Budget wird SUMMIERT über alle geladenen Skills verbraucht (`selectSkills`), nicht
 *  je Skill — eine gewachsene Sammlung sprengt die alte Obergrenze 20000 deshalb schnell,
 *  und zwar lautlos: wer nicht mehr hineinpasst, steht nur noch mit seiner `description`
 *  im Prompt. Die Obergrenze bemisst sich am Kontextfenster des Endpunkts; 100000 Zeichen
 *  sind grob 25000–29000 Token und damit auch bei einem 128K-Fenster noch vertretbar.
 *  Der Step wächst mit: 500er-Schritte über diese Spanne wären 200 Slider-Rasten. */
export const SKILL_BUDGET_MIN = 1000;
export const SKILL_BUDGET_MAX = 100000;
export const SKILL_BUDGET_STEP = 1000;

/** Spanne für `listNotesMaxRows` — wie viele Zeilen `list_notes` höchstens ausgibt.
 *  Wie `skillBudgetChars` bewusst eine Einstellung und keine Konstante: die Grenze lässt
 *  stillschweigend Verhalten weg (hier: Notizen), und solche Grenzen gehören sichtbar.
 *  Der Default 150 sind bei 40–120 Zeichen je Zeile grob 1.500–4.500 Token. Über der
 *  Grenze verschwindet nichts heimlich — die Kappung meldet sich in Zeile 1 der Antwort. */
export const LIST_ROWS_MIN = 20;
export const LIST_ROWS_MAX = 1000;
export const LIST_ROWS_STEP = 10;

/** Spannen fuer „Kontext & Verdichtung“ (Spec 2026-08-18-koda-compaction-design.md).
 *  Alle vier sind Einstellungen und keine Konstanten, weil sie beobachtbares Verhalten
 *  steuern: das Fenster ist die Bezugsgroesse, die Schwelle sagt WANN verdichtet wird, K
 *  entscheidet, ob Koda seinen Arbeitsplan noch woertlich hat, die Zusammenfassungslaenge,
 *  wie viel er „erinnert“. Das Fenster ist ein Zahlenfeld, kein Slider — 2048 bis eine
 *  Million in Rasten waere unbedienbar. */
export const CONTEXT_WINDOW_MIN = 2048;
export const CONTEXT_WINDOW_MAX = 1_000_000;
export const COMPACT_AT_MIN = 40;
export const COMPACT_AT_MAX = 95;
export const COMPACT_AT_STEP = 5;
export const KEEP_TOOLS_MIN = 0;
export const KEEP_TOOLS_MAX = 20;
export const SUMMARY_PCT_MIN = 3;
export const SUMMARY_PCT_MAX = 30;

export interface KodaSettings {
  endpoints: EndpointConfig[];
  model: string;
  suppressThinking: boolean;
  kodaFolder: string;
  maxRounds: number;
  timeoutSec: number;
  skillBudgetChars: number;
  listNotesMaxRows: number;
  textFallback: boolean;
  language: "auto" | "de" | "en";
  openOnStartup: boolean;
  contextWindowTokens: number;
  compactAtPercent: number;
  keepToolResults: number;
  summarizeEnabled: boolean;
  summaryPercent: number;
}

export const DEFAULT_SETTINGS: KodaSettings = {
  endpoints: [{ url: "http://127.0.0.1:1234" }],
  model: "",
  suppressThinking: true,
  kodaFolder: "Koda",
  maxRounds: 8,
  timeoutSec: 300,
  skillBudgetChars: 6000,
  listNotesMaxRows: 150,
  textFallback: false, // Default laut koda-lab-Befund setzen (docs/LAB.md)
  language: "auto",
  openOnStartup: false,
  contextWindowTokens: 8192,
  compactAtPercent: 75,
  keepToolResults: 3,
  summarizeEnabled: true,
  summaryPercent: 10,
};

/** Feldpruefer fuer die Felder, bei denen die generische Bauform-Pruefung des Kits nicht
 *  reicht. Ein Schema-Eintrag ERSETZT sie fuer sein Feld und bekommt den ROHEN Wert —
 *  genau deshalb kommt `"25"` ueberhaupt bei `clampInt` an. Die uebrigen sechs Felder
 *  (model, suppressThinking, kodaFolder, textFallback, openOnStartup, summarizeEnabled)
 *  brauchen keinen Eintrag: ihre Defaults tragen die Typinformation, die die generische
 *  Pruefung braucht. */
const SCHEMA: SettingsSchema<KodaSettings> = {
  // Ganze Liste durch die Migration, nicht Element fuer Element: Alt-Eintraege sind
  // Strings und werden umgeschrieben, nicht gefiltert.
  endpoints: arrayThen((items) => migrateEndpointList(undefined, items as (string | EndpointConfig)[])),
  maxRounds: clampIntField(1, MAX_ROUNDS_LIMIT),
  timeoutSec: clampIntField(TIMEOUT_SEC_MIN, TIMEOUT_SEC_MAX),
  skillBudgetChars: clampIntField(SKILL_BUDGET_MIN, SKILL_BUDGET_MAX),
  listNotesMaxRows: clampIntField(LIST_ROWS_MIN, LIST_ROWS_MAX),
  // Ohne Enum-Pruefung liesse die generische Pruefung jeden String durch (typeof passt) —
  // `applyLanguage()` bekaeme dann "klingonisch" bis in `setLang()` gereicht.
  language: oneOf(["auto", "de", "en"]),
  contextWindowTokens: clampIntField(CONTEXT_WINDOW_MIN, CONTEXT_WINDOW_MAX),
  compactAtPercent: clampIntField(COMPACT_AT_MIN, COMPACT_AT_MAX),
  keepToolResults: clampIntField(KEEP_TOOLS_MIN, KEEP_TOOLS_MAX),
  summaryPercent: clampIntField(SUMMARY_PCT_MIN, SUMMARY_PCT_MAX),
};

/** Gueltiger Settings-Stand aus einer ungepruften `data.json`. Geschlossene Welt: das
 *  Ergebnis hat GENAU die Schluessel von `DEFAULT_SETTINGS`, jedes Feld ist ein geprueft
 *  uebernommener Wert oder der Default. Unbekannte Alt-Keys ueberleben das nicht — das
 *  ist gewollt (siehe `vendor/kit/settings_schema.ts`). */
export function mergeKodaSettings(raw: unknown): KodaSettings {
  return validateSettings(DEFAULT_SETTINGS, raw, SCHEMA);
}
