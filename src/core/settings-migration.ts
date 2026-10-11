/* Einmalige Migration beim Laden — pure.

   Bis 0.22 trug Koda ein globales Modell-Feld (`model`); jetzt führt jede Endpunkt-Zeile ihr
   eigenes. Der Altwert zieht einmal in die Zeilen ohne Modell (`fillMissingRowModels`), der
   Schlüssel verschwindet. `validateKodaSettings` verwirft Unbekanntes, deshalb liest diese
   Funktion den Altwert aus den ROHDATEN, vor der Validierung. Verschwindet der Schlüssel nicht
   aus dem gespeicherten Objekt, liefe die Migration bei jedem Start erneut und füllte eine vom
   Nutzer geleerte Zeile wieder auf (code-kit TSDoc `fillMissingRowModels`, Punkt 2). */
import { fillMissingRowModels } from "../vendor/kit/endpoint_config";
import { validateKodaSettings, type KodaSettings } from "./settings-types";

export interface LoadedSettings {
  settings: KodaSettings;
  /** `true`, wenn die Rohdaten den Altschlüssel trugen — dann einmal speichern. */
  changed: boolean;
}

export function loadKodaSettings(raw: unknown): LoadedSettings {
  const validated = validateKodaSettings(raw);
  if (typeof raw !== "object" || raw === null || !("model" in raw)) return { settings: validated, changed: false };
  const legacy = (raw as { model?: unknown }).model;
  return {
    settings: { ...validated, endpoints: fillMissingRowModels(validated.endpoints, legacy) },
    changed: true,
  };
}
