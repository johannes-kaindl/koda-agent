// Die Denk-Steuerung in der Modellzeile (Kit `thinking-control`, ueber `buildModelBar({ thinking })`): Kodas Zustand auf die Optionen des Kit-Knopfs abgebildet.
// Obsidian-frei, in Node getestet (`tests/thinking_control_bindung.test.ts` misst den echten Kit-Knopf dagegen).
//
// Koda kennt zwei Zustaende des Nutzers (`suppressThinking` an/aus) und einen dritten des Modells (immer an: gpt-oss, harmony). Der Kit-Knopf schaltet zwischen `off` und `onLevel()`;
// den dritten Zustand traegt `locked` (obsidian-kit 0.70.1). Zustand und Request-Seite kommen aus dem Kit (`think-toggle`, code-kit 0.27.0): `thinkToggleState` sagt, was der
// Schalter zeigt, `effectiveSuppress`, was der Request tut — beide Haelften in EINEM Modul, weil ein Schalter, der etwas anderes verspricht, als der Request liefert, luegt.
import { describeModel } from "../../vendor/kit/endpoint-source";
import type { BackendId, FamilyId, ThinkingLevel } from "../../vendor/kit/sampling-profiles";
import { thinkToggleState } from "../../vendor/kit/think-toggle";

export { effectiveSuppress } from "../../vendor/kit/think-toggle";

export interface ThinkingBindingDeps {
  /** Das Modell, ueber das der Chat tatsaechlich sendet (`KodaPlugin.sentModel()`). */
  model(): string;
  /** Backend des gemerkten Endpunkts (`KodaPlugin.sentBackend()`); vor der ersten Aufloesung `unknown`. */
  backend(): string;
  suppress(): boolean;
  /** Schreibt `suppressThinking` und speichert (`saveSettings()` zeichnet die Zeile neu). */
  setSuppress(suppress: boolean): Promise<void>;
}

export interface ThinkingBinding {
  // Funktions-Eigenschaften statt Methoden: die Ansicht reicht sie einzeln an den Kit-Knopf weiter (`unbound-method`).
  family: () => FamilyId | null;
  backend: () => BackendId;
  current: () => ThinkingLevel;
  onLevel: () => ThinkingLevel;
  setLevel: (level: ThinkingLevel) => Promise<void>;
  levelPicker: () => boolean;
  /** Das Modell denkt immer (gpt-oss): der Knopf ist gesperrt (Kit `locked`), der Request unterdrueckt nie. Der Text kommt vom View (Sprache). */
  alwaysOn: () => boolean;
  /** Der Befehl „Thinking umschalten“ (ein Zugang ohne den Knopf, Lehre 0.10.1): kippt an/aus, bei einem gesperrten Modell tut er nichts. */
  toggle: () => Promise<void>;
}

export function createThinkingBinding(d: ThinkingBindingDeps): ThinkingBinding {
  const alwaysOn = (): boolean => thinkToggleState(d.model(), d.suppress()).mode === "always";
  return {
    family: () => describeModel(d.model(), undefined).family,
    // `unknown` und jede unbekannte Kennung behandelt das Kit wie die Familie als solche.
    backend: () => d.backend() as BackendId,
    current: () => (d.suppress() ? "off" : "medium"),
    onLevel: () => "medium",
    setLevel: (level) => d.setSuppress(level === "off"),
    levelPicker: () => false,
    alwaysOn,
    // Wie der Klick auf den Kit-Knopf, plus die Sperre: ein gerade gesperrter Zustand darf nicht durchschlagen (Muster canActivatePack).
    toggle: () => (alwaysOn() ? Promise.resolve() : d.setSuppress(!d.suppress())),
  };
}
