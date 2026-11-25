import { effectivePrompt, fillPromptPlaceholders, missingPromptPlaceholders, promptPlaceholder } from "../../vendor/kit/prompt-override";

/** Der ausgelieferte Regelblock — Schicht 1 von dreien (Memory und Skills haengen in
 *  `buildSystemPrompt` daran). Er ist eine VORLAGE: was vom Nutzer abhaengt, steht als
 *  Platzhalter darin, damit ein ueberschriebener Prompt einem spaeteren Ordner-Umzug oder
 *  Sprachwechsel folgt statt auf dem alten Wert stehen zu bleiben (Spec E1). */
export const PLACEHOLDER_NAMES = ["sprache", "ordner"] as const;
export const PLACEHOLDER_LANG = promptPlaceholder("sprache");
export const PLACEHOLDER_FOLDER = promptPlaceholder("ordner");

const LANGUAGE_NAME: Record<"de" | "en", string> = { de: "German", en: "English" };

export const DEFAULT_RULES = [
  "You are Koda, a friendly companion living inside the user's personal knowledge vault.",
  `Always answer in ${PLACEHOLDER_LANG}.`,
  "Use the provided tools to search and read notes BEFORE answering questions about the vault; cite notes as [[wikilinks]] (path without .md).",
  "A user message may begin with a [Working context] block: it tells you which note is open, what is selected and which tabs exist. Treat it as the user's current view, read the note with read_note when the question is about it, and never quote the block back.",
  `You may write freely inside the folder "${PLACEHOLDER_FOLDER}/". Writing anywhere else asks the user for approval — a rejection is an answer, respect it.`,
  "Use save_memory only for durable facts, preferences, or corrections — never for conversation details.",
  "Use write_skill when the user teaches you a rule that should keep applying; it always asks for approval, even inside your own folder.",
  "If a tool fails, read the error, adjust, and try a different way. Never invent note contents.",
  "If two instructions conflict — two skills, or a skill and your memory — say so instead of silently picking one.",
].join("\n\n");

/** „Leer heisst ausgeliefert" (Spec E2): seit Welle 38 die Kit-Regel `effectivePrompt` (code-kit `prompt-override`, aus diesem Plugin gehoben). `build.ts` (was gesendet
 *  wird) und `view-model.ts` (was die Warnzeile prueft) rufen beide diese Funktion, damit die Oberflaeche ueber denselben Text warnt, der gesendet wird. */
export function effectiveRules(override?: string): string {
  return effectivePrompt(override, DEFAULT_RULES);
}

/** Setzt die Platzhalter ein (code-kit `fillPromptPlaceholders`, ein Durchgang). Unbekannte `{{…}}` bleiben stehen: sie sind entweder ein
 *  Tippfehler des Nutzers (dann soll er ihn sehen) oder ein Platzhalter aus einer neueren Version (dann waere Verschlucken der schlechtere Ausgang).
 *  Die Schraegstriche am Ordnerende schneidet koda selbst ab (MIGRATION 0.110.0 Punkt 5): `{{ordner}}/` im Regelblock ergaebe sonst `Koda//`. */
export function renderRules(template: string, opts: { lang: "de" | "en"; folder: string }): string {
  let end = opts.folder.length; // Schrägstriche am Ende abschneiden; `replace(/\/+$/, "")` war auf einem langen Schrägstrich-Lauf quadratisch
  while (end > 0 && opts.folder.charCodeAt(end - 1) === 47) end--;
  return fillPromptPlaceholders(template, { sprache: LANGUAGE_NAME[opts.lang], ordner: opts.folder.slice(0, end) });
}

/** Die Werkzeuge, die Vault-Inhalt ins Gespraech holen. Steht hier als eine Liste und
 *  nicht verstreut in Bedingungen — die Warnung haengt daran (Spec E3). */
export const READING_TOOLS = ["search_notes", "read_note", "list_notes", "related_notes", "get_workspace"];

export type RuleWarning = "no-tools" | "missing-placeholder" | "no-reading-tool" | "reading-tool-off";

/** Prueft den Regelblock GROB. Absichtlich keine Satzpruefung: sie verbietet nichts, also
 *  darf sie ungenau sein — eine Sperre duerfte es nicht (Spec E5). Falsch-negativ ist
 *  hier der billigere Fehler als falsch-positiv, weil Fehlalarme zum Wegsehen erziehen. */
export function checkRules(text: string, activeReadingTools: string[], availableReadingTools: string[]): RuleWarning[] {
  const out: RuleWarning[] = [];
  if (!/tool|werkzeug/i.test(text)) out.push("no-tools");
  if (missingPromptPlaceholders(text, PLACEHOLDER_NAMES).length > 0) out.push("missing-placeholder");
  // Zwei Stufen desselben Befunds, und nur EINE davon wird gemeldet: „keines mehr" ist der
  // schwerere Fall und schliesst den leichteren ein. Beide zugleich zu zeigen waere ein
  // Fehlalarm neben einem echten Befund — und Fehlalarme erziehen zum Wegsehen.
  if (activeReadingTools.length === 0) out.push("no-reading-tool");
  else if (activeReadingTools.length < availableReadingTools.length) out.push("reading-tool-off");
  return out;
}
