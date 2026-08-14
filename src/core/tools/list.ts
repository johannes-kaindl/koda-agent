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
  // Positive Typprüfungen statt einer Ausschluss-Kette: `typeof v === "object"` würde
  // `unknown` fürs TS-Narrowing auf `{}` reduzieren statt auf eine String(...)-taugliche
  // Union — das brächte hier denselben Stringify-Verdacht zurück, den die Prüfung
  // eigentlich ausschließen soll.
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean"
    || typeof v === "bigint" || typeof v === "symbol") {
    const s = collapse(String(v));
    return s === "" ? "—" : clip(s);
  }
  return "{…}";
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

export interface NoteRow { path: string; fields: Record<string, string> }

/** Die Kappungswarnung steht in ZEILE 1, nicht als Fussnote unter der Liste. Der
 *  Fehlertyp, gegen den dieses Werkzeug antritt, ist „unvollstaendig, sieht vollstaendig
 *  aus" — eine Warnung am Ende einer langen Liste reproduziert ihn. */
export function formatListResult(args: {
  folder: string; recursive: boolean; total: number; rows: NoteRow[];
}): string {
  const { folder, recursive, total, rows } = args;
  const where = folder === "" ? "in der Vault-Wurzel" : `in "${folder}"`;
  const head = `${rows.length} von ${total} Notizen ${where}${recursive ? " (rekursiv)" : ""}`;
  const lines = rows.map((r) => {
    const cols = Object.entries(r.fields).map(([k, v]) => `${k}=${v}`);
    return cols.length === 0 ? r.path : `${r.path} · ${cols.join(" · ")}`;
  });
  const body = `${head}\n\n${lines.join("\n")}`;
  if (rows.length >= total) return body;

  const hint = recursive
    ? "Grenze den Ordner ein oder setze recursive:false"
    : "Grenze den Ordner ein";
  return `⚠ UNVOLLSTÄNDIG: ${total} Notizen gefunden, ${rows.length} gezeigt. ${hint}, bevor du über Vollständigkeit sprichst.\n\n${body}`;
}

const SUGGEST_MAX = 5;

/** Alle Ordner, in denen (irgendwo darunter) Notizen liegen. */
function allFolders(allPaths: string[]): string[] {
  const set = new Set<string>();
  for (const p of allPaths) {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) set.add(parts.slice(0, i).join("/"));
  }
  return [...set].sort();
}

/** Was koennte gemeint gewesen sein? Dreistufig, und die dritte Stufe ist Absicht:
 *  wo nichts Passendes existiert, wird nicht geraten. Der Grund fuer die ganze Funktion:
 *  „Ordner leer" und „Ordner falsch geschrieben" sehen fuer das Modell sonst gleich aus —
 *  ein false negative ohne sichtbaren Fehler, also genau die Fehlerklasse, gegen die
 *  dieses Werkzeug antritt. */
export function suggestFolders(allPaths: string[], folder: string, max: number = SUGGEST_MAX): string[] {
  const folders = allFolders(allPaths);
  const wanted = (folder.split("/").pop() ?? "").toLowerCase();

  if (wanted !== "") {
    const near = folders.filter((f) => {
      const last = (f.split("/").pop() ?? "").toLowerCase();
      return last !== "" && (last.includes(wanted) || wanted.includes(last));
    });
    if (near.length > 0) return near.slice(0, max);
  }

  // Laengstes existierendes Praefix des Wunschpfads → dessen direkte Unterordner.
  const parts = folder.split("/").filter((s) => s !== "");
  for (let i = parts.length - 1; i >= 0; i--) {
    const base = parts.slice(0, i).join("/");
    const prefix = base === "" ? "" : `${base}/`;
    if (base !== "" && !folders.includes(base)) continue;
    const children = folders.filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes("/") && f !== base);
    if (children.length > 0) return children.slice(0, max);
  }
  return [];
}

/** Bewusst keine Existenz-Aussage: aus einer Liste von Markdown-Pfaden ist ein leerer
 *  Ordner von einem falsch geschriebenen nicht unterscheidbar. Festgestellt wird, was
 *  messbar ist — dass dort keine Notiz liegt. */
export function formatEmptyFolder(folder: string, suggestions: string[]): string {
  const where = folder === "" ? "in der Vault-Wurzel" : `unter "${folder}"`;
  const base = `Dort liegt keine Notiz: ${where} wurde keine Markdown-Datei gefunden.`;
  return suggestions.length === 0
    ? base
    : `${base} Gemeint sein könnte:\n${suggestions.join("\n")}`;
}
