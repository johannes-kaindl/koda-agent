import { DEFAULT_RULES, checkRules, effectiveRules, type RuleWarning } from "./rules";
import { activeReadingTools, availableReadingTools } from "./effective";
import { toolDefs } from "../tools/defs";

/** Was die Anweisungs-Zeile zeigt. Der Auslieferungsstand ist der PLATZHALTER, nie der
 *  Wert (Spec E2) — und geprueft wird der Text, der wirklich gilt: ohne Override ist das
 *  der Auslieferungsstand, sonst der Override. */
export interface PromptRowModel {
  value: string;
  placeholder: string;
  warnings: RuleWarning[];
  /** Die lesenden Werkzeuge, die der Nutzer abgeschaltet hat — leer, solange alles aktiv
   *  ist. Die Warnung `reading-tool-off` nennt sie beim Namen: „ein Lesewerkzeug fehlt"
   *  schickt sonst auf die Suche nach dem Schalter, um den es geht. Das MODELL erfaehrt
   *  weiterhin nichts davon (Spec E3, Entscheidung Johannes 2026-09-05) — abgeschaltet
   *  heisst abgeschaltet; gewarnt wird dort, wo die Entscheidung faellt. */
  readingToolsOff: string[];
}

export function promptRow(
  s: { systemPromptOverride: string; toolsDisabled: string[] },
  related: boolean,
): PromptRowModel {
  // Dieselbe Funktion, die auch `buildSystemPrompt` waehlen laesst: die Warnzeile prueft
  // damit garantiert den Text, der gesendet wird (Spec E2, eine Wahrheit).
  const wirksam = effectiveRules(s.systemPromptOverride);
  const aktiv = activeReadingTools(s.toolsDisabled, related);
  const moeglich = availableReadingTools(related);
  return {
    value: s.systemPromptOverride,
    placeholder: DEFAULT_RULES,
    warnings: checkRules(wirksam, aktiv, moeglich),
    readingToolsOff: moeglich.filter((n) => !aktiv.includes(n)),
  };
}

/** Eine Zeile je Werkzeug — die volle Liste, auch related_notes ohne Index (dann
 *  `unavailable`). Ein Werkzeug, das spurlos verschwindet, schickt den Nutzer auf die
 *  Suche nach einem Schalter, den es nie gab (Spec E3). */
export interface ToolRowModel {
  name: string;
  /** Die ausgelieferte Beschreibung — immer, auch wenn eine eigene gesetzt ist. */
  placeholder: string;
  /** Die eigene Beschreibung, "" wenn keine. */
  own: string;
  enabled: boolean;
  unavailable: boolean;
}

export function toolRows(
  s: { toolsDisabled: string[]; toolDescriptions: Record<string, string> },
  related: boolean,
): ToolRowModel[] {
  const aus = new Set(s.toolsDisabled);
  // `related: true` liefert die ganze Liste; die Verfuegbarkeit entscheidet nur ueber die
  // Ausgrauung, nicht ueber die Sichtbarkeit. Ohne `descriptions` — der Platzhalter MUSS
  // der Auslieferungsstand bleiben, sonst ist er nach einer eigenen Beschreibung
  // unwiederbringlich weg.
  return toolDefs({ related: true }).map((d) => ({
    name: d.name,
    placeholder: d.description,
    own: s.toolDescriptions[d.name] ?? "",
    enabled: !aus.has(d.name),
    unavailable: d.name === "related_notes" && !related,
  }));
}
