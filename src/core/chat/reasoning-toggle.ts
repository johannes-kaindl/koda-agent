// Zustand und Request-Seite kommen aus dem Kit (`think-toggle`, code-kit 0.27.0): `thinkToggleState`
// sagt sprachfrei, was der Schalter zeigt (`mode`/`hint`/`disabled`), `effectiveSuppress` was der
// Request tut — beide Haelften in EINEM Modul, weil ein Schalter, der etwas anderes verspricht als
// der Request liefert, luegt. Hier bleibt nur die Abbildung auf Kodas Beschriftungsschluessel,
// Icons und Klassen (UI-STANDARD §8 Zustands-Knopf); die i18n-Schluessel gehoeren dem Konsumenten.
import { thinkToggleState } from "../../vendor/kit/think-toggle";

export { effectiveSuppress } from "../../vendor/kit/think-toggle";

export interface ThinkToggleView {
  labelKey: "view.thinkingOn" | "view.thinkingOff" | "view.thinkingAlways";
  /** Zusatz für Tooltip + aria-label; null = kein Hinweis. Ändert NIE den sichtbaren Button-Text
   *  und NIE das Request-Verhalten. */
  hintKey: "view.thinkingHintAlways" | "view.thinkingHintClaude" | null;
  /** Aktions-Nachsatz fuer den Tooltip ("… — click turns off"); null nur bei disabled — ein
   *  Klick auf einen gesperrten Knopf hat keine Aktion, die man ankuendigen koennte. */
  actionKey: "view.thinkingClickOn" | "view.thinkingClickOff" | null;
  /** UI-STANDARD §8 Zustands-Knopf: Icon-Wechsel als eigener Kanal, nie dieselbe Glyphe in
   *  zwei Farben. Lucide (Obsidian 1.14.2, 1944 Icons, gemessen) kennt kein „brain-off" —
   *  UI-STANDARDs eigenes Beispiel dafuer ist erfunden. Nimmt stattdessen "brain-cog", das
   *  einzige real existierende zweite Brain-Icon, das sich von "brain" klar unterscheidet
   *  (Meldung an Dach 2026-09-16). */
  icon: "brain" | "brain-cog";
  /** aria-pressed — true, solange gedacht wird (an ODER gesperrt-immer-an), false bei aus. */
  pressed: boolean;
  cls: "" | "is-off" | "is-disabled";
  disabled: boolean;
}

/** Beschriftung, Icon und Klasse des Knopfes aus dem Kit-Zustand. */
export function thinkToggleView(model: string, suppress: boolean, backend?: string): ThinkToggleView {
  const st = thinkToggleState(model, suppress);
  if (st.mode === "always") {
    return { labelKey: "view.thinkingAlways", hintKey: null, actionKey: null, icon: "brain", pressed: true, cls: "is-disabled", disabled: true };
  }
  // Claude lässt das Denken nicht abschalten: „Aus“ ist dort der niedrigste Aufwand (Profil `claude`).
  // Der Schalter bleibt bedienbar, sagt aber, was er tut — sonst verspräche er mehr als die Anfrage liefert.
  const hintKey = backend === "anthropic" ? "view.thinkingHintClaude" : st.hint === "alwaysGuess" ? "view.thinkingHintAlways" : null;
  if (st.mode === "off") {
    return { labelKey: "view.thinkingOff", hintKey, actionKey: "view.thinkingClickOn", icon: "brain-cog", pressed: false, cls: "is-off", disabled: false };
  }
  return { labelKey: "view.thinkingOn", hintKey, actionKey: "view.thinkingClickOff", icon: "brain", pressed: true, cls: "", disabled: false };
}
