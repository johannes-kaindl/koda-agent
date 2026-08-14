// list.ts — deterministisches Ordner-Listing. Rein: kein obsidian-Import (check:pure).
//
// Warum es dieses Werkzeug gibt: gemessen am 2026-08-13 liess Koda die teuren
// Pruefschritte eines Skills aus (elf Notizen einzeln lesen) und meldete trotzdem
// Erfolg — und nach dem Nachschaerfen des Skill-Textes fuehrte es sie nicht etwa
// korrekt aus, sondern liess die Frage ganz weg. Solange Vollstaendigkeit N Aufrufe
// kostet, ist Raten billiger. Dieses Modul macht sie zu einem.

/** Alle Notizen unterhalb `folder`, aufsteigend sortiert. `folder === ""` ist die
 *  Vault-Wurzel. Sortiert wird mit der Standard-Ordnung (UTF-16-Codepoints) statt mit
 *  `localeCompare`: die ist ueber ICU-Versionen hinweg stabil, und „deterministisch"
 *  ist der Daseinszweck dieses Werkzeugs. */
export function collectFolderNotes(allPaths: string[], folder: string, recursive: boolean): string[] {
  const prefix = folder === "" ? "" : `${folder}/`;
  const hits = allPaths.filter((p) => {
    if (!p.startsWith(prefix)) return false;
    const rest = p.slice(prefix.length);
    if (rest === "") return false;
    return recursive || !rest.includes("/");
  });
  return hits.sort();
}

/** Ab wann ein Feldwert gekuerzt wird. Eine Zeile soll eine Zeile bleiben: der Nutzen
 *  dieses Werkzeugs ist die Uebersicht, nicht der Volltext — dafuer gibt es read_note. */
const VALUE_MAX = 120;

/** Ein Frontmatter-Wert als eine Zeile Text. `—` steht fuer „nicht gesetzt": ein leeres
 *  Feld und ein fehlendes Feld sind fuer die Uebersicht dasselbe, und ein sichtbarer
 *  Platzhalter ist ehrlicher als eine leere Spalte, die man fuer einen Formatfehler haelt. */
export function formatFieldValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) {
    const joined = v.map((x) => (typeof x === "object" && x !== null ? "{…}" : String(x))).join(", ");
    return joined.trim() === "" ? "—" : clip(collapse(joined));
  }
  if (typeof v === "object") return "{…}";
  const s = collapse(String(v));
  return s === "" ? "—" : clip(s);
}

function collapse(s: string): string {
  return s.replace(/\s*\r?\n\s*/g, " ").trim();
}

function clip(s: string): string {
  return s.length <= VALUE_MAX ? s : `${s.slice(0, VALUE_MAX)}…`;
}

/** Genau die angeforderten Felder, in der angeforderten Reihenfolge. Kein erratener
 *  Default-Satz: welche Felder zaehlen, weiss der Vault, nicht das Plugin. */
export function pickFields(fm: Record<string, unknown> | null, fields: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) out[f] = formatFieldValue(fm === null ? undefined : fm[f]);
  return out;
}
