import { mergeSettings } from "../vendor/kit/settings";
import { clampInt } from "../vendor/kit/num";
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
};

export function mergeKodaSettings(raw: unknown): KodaSettings {
  const merged = mergeSettings(DEFAULT_SETTINGS, raw);
  const rawEndpoints = (raw as { endpoints?: unknown } | null)?.endpoints;
  return {
    ...merged,
    endpoints: Array.isArray(rawEndpoints)
      ? migrateEndpointList(undefined, rawEndpoints as (string | EndpointConfig)[])
      : merged.endpoints,
    maxRounds: clampInt(merged.maxRounds, 1, MAX_ROUNDS_LIMIT, DEFAULT_SETTINGS.maxRounds),
    timeoutSec: clampInt(merged.timeoutSec, TIMEOUT_SEC_MIN, TIMEOUT_SEC_MAX, DEFAULT_SETTINGS.timeoutSec),
    skillBudgetChars: clampInt(
      merged.skillBudgetChars, SKILL_BUDGET_MIN, SKILL_BUDGET_MAX, DEFAULT_SETTINGS.skillBudgetChars,
    ),
    listNotesMaxRows: clampInt(
      merged.listNotesMaxRows, LIST_ROWS_MIN, LIST_ROWS_MAX, DEFAULT_SETTINGS.listNotesMaxRows,
    ),
  };
}
