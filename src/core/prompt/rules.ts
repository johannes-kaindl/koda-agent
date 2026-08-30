/** Der ausgelieferte Regelblock — Schicht 1 von dreien (Memory und Skills haengen in
 *  `buildSystemPrompt` daran). Er ist eine VORLAGE: was vom Nutzer abhaengt, steht als
 *  Platzhalter darin, damit ein ueberschriebener Prompt einem spaeteren Ordner-Umzug oder
 *  Sprachwechsel folgt statt auf dem alten Wert stehen zu bleiben (Spec E1). */
export const PLACEHOLDER_LANG = "{{sprache}}";
export const PLACEHOLDER_FOLDER = "{{ordner}}";

const LANGUAGE_NAME: Record<"de" | "en", string> = { de: "German", en: "English" };

export const DEFAULT_RULES = [
  "You are Koda, a friendly companion living inside the user's personal knowledge vault.",
  `Always answer in ${PLACEHOLDER_LANG}.`,
  "Use the provided tools to search and read notes BEFORE answering questions about the vault; cite notes as [[wikilinks]] (path without .md).",
  `You may write freely inside the folder "${PLACEHOLDER_FOLDER}/". Writing anywhere else asks the user for approval — a rejection is an answer, respect it.`,
  "Use save_memory only for durable facts, preferences, or corrections — never for conversation details.",
  "Use write_skill when the user teaches you a rule that should keep applying; it always asks for approval, even inside your own folder.",
  "If a tool fails, read the error, adjust, and try a different way. Never invent note contents.",
  "If two instructions conflict — two skills, or a skill and your memory — say so instead of silently picking one.",
].join("\n\n");

/** Setzt die Platzhalter ein. Unbekannte `{{…}}` bleiben stehen: sie sind entweder ein
 *  Tippfehler des Nutzers (dann soll er ihn sehen) oder ein Platzhalter aus einer neueren
 *  Version (dann waere Verschlucken der schlechtere Ausgang). */
export function renderRules(template: string, opts: { lang: "de" | "en"; folder: string }): string {
  const folder = opts.folder.replace(/\/+$/, "");
  return template
    .split(PLACEHOLDER_LANG).join(LANGUAGE_NAME[opts.lang])
    .split(PLACEHOLDER_FOLDER).join(folder);
}

/** Die vier Werkzeuge, die Vault-Inhalt ins Gespraech holen. Steht hier als eine Liste und
 *  nicht verstreut in Bedingungen — die Warnung haengt daran (Spec E3). */
export const READING_TOOLS = ["search_notes", "read_note", "list_notes", "related_notes"];

export type RuleWarning = "no-tools" | "missing-placeholder" | "no-reading-tool";

/** Prueft den Regelblock GROB. Absichtlich keine Satzpruefung: sie verbietet nichts, also
 *  darf sie ungenau sein — eine Sperre duerfte es nicht (Spec E5). Falsch-negativ ist
 *  hier der billigere Fehler als falsch-positiv, weil Fehlalarme zum Wegsehen erziehen. */
export function checkRules(text: string, activeReadingTools: string[]): RuleWarning[] {
  const out: RuleWarning[] = [];
  if (!/tool|werkzeug/i.test(text)) out.push("no-tools");
  if (!text.includes(PLACEHOLDER_LANG) || !text.includes(PLACEHOLDER_FOLDER)) out.push("missing-placeholder");
  if (activeReadingTools.length === 0) out.push("no-reading-tool");
  return out;
}
