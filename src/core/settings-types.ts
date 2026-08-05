import { mergeSettings } from "../vendor/kit/settings";
import { clampInt } from "../vendor/kit/num";
import { migrateEndpointList, type EndpointConfig } from "../vendor/kit/endpoint_config";

/** Obergrenze für `maxRounds` — einzige Quelle, gegen die sowohl `mergeKodaSettings`
 *  klemmt als auch der Settings-Slider (`src/obsidian/settings.ts`) seine Limits setzt. */
export const MAX_ROUNDS_LIMIT = 16;

export interface KodaSettings {
  endpoints: EndpointConfig[];
  model: string;
  suppressThinking: boolean;
  kodaFolder: string;
  maxRounds: number;
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
  };
}
