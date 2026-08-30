import { DEFAULT_RULES, checkRules, type RuleWarning } from "./rules";
import { activeReadingTools } from "./effective";
import { toolDefs } from "../tools/defs";

/** Was die Anweisungs-Zeile zeigt. Der Auslieferungsstand ist der PLATZHALTER, nie der
 *  Wert (Spec E2) — und geprueft wird der Text, der wirklich gilt: ohne Override ist das
 *  der Auslieferungsstand, sonst der Override. */
export interface PromptRowModel {
  value: string;
  placeholder: string;
  warnings: RuleWarning[];
}

export function promptRow(
  s: { systemPromptOverride: string; toolsDisabled: string[] },
  related: boolean,
): PromptRowModel {
  const wirksam = s.systemPromptOverride.trim() === "" ? DEFAULT_RULES : s.systemPromptOverride;
  return {
    value: s.systemPromptOverride,
    placeholder: DEFAULT_RULES,
    warnings: checkRules(wirksam, activeReadingTools(s.toolsDisabled, related)),
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
