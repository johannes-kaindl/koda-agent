import type { ContextMode } from "../core/context/types";
import { modeOptions } from "../core/context/labels";

/** Fuellt ein Modus-Dropdown neu — bei JEDEM Sync, nicht nur beim Aufbau: vault-rag kann
 *  nach Koda geladen oder zur Laufzeit abgeschaltet werden, und die Sperre muss folgen. */
export function fillModeSelect(sel: HTMLSelectElement, lang: "de" | "en", vaultAvailable: boolean, current: ContextMode): void {
  sel.empty();
  for (const o of modeOptions(lang, vaultAvailable)) {
    const opt = sel.createEl("option", { value: o.value, text: o.label });
    opt.disabled = o.disabled;
  }
  sel.value = current;
}
