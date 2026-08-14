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
