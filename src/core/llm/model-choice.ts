/* Was das Modell-Feld zeigen soll — pure, entscheidet nur WAS, nie WIE.

   Übernommen aus `vault-rag/src/model_choice.ts` (Katalogeintrag, dort n=1) mit einer
   Abweichung: die Vorlage liefert fertige deutsche Hinweissätze, hier kommt ein
   `hintKey` zurück. Koda spricht DE und EN, und ein Klartext-Feld aus einer fremden
   Quelle lässt sich nicht übersetzen — derselbe Gotcha wie bei den Endpunkt-Statusmeldungen
   (REGISTRY: „i18n-Statuskeys statt Klartext-Feld"). Aus demselben Grund trägt eine Option
   `suffix: "saved"` statt eines angehängten „(gespeichert)". */

export type ModelChoiceMode = "dropdown" | "locked" | "freetext";
export type ModelHintKey = "" | "unreachable" | "no-list";

export interface ModelOption {
  value: string;
  /** Anzeigetext ohne Zusatz. */
  label: string;
  /** Vom Host zu übersetzender Zusatz, derzeit nur „gespeichert". */
  suffix?: "saved";
}

export interface ModelChoice {
  mode: ModelChoiceMode;
  /** Bei "dropdown"/"locked" gefüllt; enthält IMMER `value` (Invariante unten). */
  options: ModelOption[];
  value: string;
  hintKey: ModelHintKey;
}

export interface ModelChoiceInput {
  /** Erreichbar? Eine nicht leere `models`-Liste beweist das bereits. */
  reachable: boolean;
  models: string[];
  current: string;
}

/**
 * INVARIANTE: In den Modi "dropdown" und "locked" enthält `options` immer `value`.
 * Ein `<select>`, dessen Wert nicht unter seinen Optionen steht, fällt still auf die erste
 * zurück — und das nächste Speichern schriebe dann diesen fremden Wert. Genau so verliert
 * man einen konfigurierten Modellnamen, ohne dass irgendetwas fehlschlägt. Das ist auch die
 * Antwort auf den Gotcha „Dropdown-Default muss persistiert werden": hier wird nie ein Wert
 * angezeigt, der nicht gespeichert ist.
 */
export function resolveModelChoice(input: ModelChoiceInput): ModelChoice {
  const current = input.current.trim();

  if (!input.reachable) {
    return {
      mode: "locked",
      options: [{ value: current, label: current }],
      value: current,
      hintKey: "unreachable",
    };
  }

  if (input.models.length === 0) {
    return { mode: "freetext", options: [], value: current, hintKey: "no-list" };
  }

  const options: ModelOption[] = [];
  if (current !== "" && !input.models.includes(current)) {
    // Gespeichert, aber nicht gelistet: sichtbar machen statt still verlieren.
    options.push({ value: current, label: current, suffix: "saved" });
  } else if (current === "") {
    // Ohne diese Option fiele das <select> stumm auf das erste Modell.
    options.push({ value: "", label: "—" });
  }
  for (const m of input.models) options.push({ value: m, label: m });

  return { mode: "dropdown", options, value: current, hintKey: "" };
}
