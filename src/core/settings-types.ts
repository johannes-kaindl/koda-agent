import { mergeSettings } from "../vendor/kit/settings";
import { clampInt } from "../vendor/kit/num";
import { migrateEndpointList, type EndpointConfig } from "../vendor/kit/endpoint_config";

/** Obergrenze für `maxRounds` — einzige Quelle, gegen die sowohl `mergeKodaSettings`
 *  klemmt als auch der Settings-Slider (`src/obsidian/settings.ts`) seine Limits setzt. */
export const MAX_ROUNDS_LIMIT = 16;

/** Spanne für `timeoutSec` — der Idle-Timeout des Chat-Clients (Stille seit dem letzten
 *  Byte, NICHT Gesamtdauer der Antwort; siehe `KodaChatClient`). Untergrenze so hoch,
 *  dass ein JIT-ladendes lokales Modell vor dem ersten Token nicht abgeschnitten wird. */
export const TIMEOUT_SEC_MIN = 30;
export const TIMEOUT_SEC_MAX = 900;
export const TIMEOUT_SEC_STEP = 30;

/** Spanne für `skillBudgetChars` — wie viele Zeichen Skill-Body höchstens in den
 *  System-Prompt wandern. Bewusst eine Einstellung und keine Konstante: die Grenze soll
 *  sichtbar sein, weil sie stillschweigend Verhalten weglässt. */
export const SKILL_BUDGET_MIN = 1000;
export const SKILL_BUDGET_MAX = 20000;
export const SKILL_BUDGET_STEP = 500;

export interface KodaSettings {
  endpoints: EndpointConfig[];
  model: string;
  suppressThinking: boolean;
  kodaFolder: string;
  maxRounds: number;
  timeoutSec: number;
  skillBudgetChars: number;
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
  };
}
