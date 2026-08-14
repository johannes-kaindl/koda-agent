// list.ts — deterministisches Ordner-Listing. Rein: kein obsidian-Import (check:pure).
//
// Warum es dieses Werkzeug gibt: gemessen am 2026-08-13 liess Koda die teuren
// Pruefschritte eines Skills aus (elf Notizen einzeln lesen) und meldete trotzdem
// Erfolg — und nach dem Nachschaerfen des Skill-Textes fuehrte es sie nicht etwa
// korrekt aus, sondern liess die Frage ganz weg. Solange Vollstaendigkeit N Aufrufe
// kostet, ist Raten billiger. Dieses Modul macht sie zu einem.

/** Vergleichsform fuer Pfade. macOS liefert Dateinamen als NFD von der Platte, waehrend
 *  ein Modell (und jede Eingabe aus dem Gespraech) NFC schreibt: „Bücher" und „Bu\u0308cher"
 *  sehen identisch aus, sind als Strings aber verschieden. Ohne diese Normalisierung findet
 *  ein korrekt geschriebener Ordnername keine einzige Notiz — und das Ergebnis ist ein
 *  leerer Ordner, also wieder ein Befund, der wie eine Tatsache aussieht.
 *  Nur fuer den VERGLEICH: ausgegeben wird immer der Originalpfad, denn mit dem muss
 *  `read_note` anschliessend die Datei finden. */
const nf = (s: string): string => s.normalize("NFC");

/** Eine Notiz, die so heisst wie der Ordner, in dem sie liegt (`_Tasks/_Tasks.md`) —
 *  in Obsidian die uebliche Form einer Ordner-/Hub-Notiz.
 *
 *  Warum das Werkzeug das selbst erkennt und es nicht den Skills ueberlaesst: gemessen am
 *  2026-08-14 zaehlte Koda `_Tasks/_Tasks.md` als 13. Aufgabe mit — eine vollstaendig
 *  aussehende Falschzaehlung, also genau die Fehlerklasse, gegen die dieses Werkzeug
 *  antritt. Der Skill-Weg (`tags` in `fields` aufnehmen) haette denselben Fall geloest,
 *  setzt aber gepflegte Tags und eine bestimmte Vault-Konvention voraus; Koda ist
 *  Store-Software und laeuft in fremden Vaults. Die Ordnernotiz ist dagegen STRUKTURELL
 *  erkennbar — kein Frontmatter, keine Heuristik, keine Konvention.
 *
 *  Bewusst markiert statt entfernt: ob eine Ordnernotiz zaehlt, entscheidet die Frage,
 *  nicht das Werkzeug. Wegzulassen waere ein Urteil ueber Relevanz. */
export function isFolderNote(path: string): boolean {
  const parts = path.split("/");
  if (parts.length < 2) return false; // In der Vault-Wurzel gibt es keinen Ordner darueber.
  const file = nf(parts[parts.length - 1].replace(/\.md$/i, "")).toLowerCase();
  return file !== "" && file === nf(parts[parts.length - 2]).toLowerCase();
}

/** Alle Notizen unterhalb `folder`, aufsteigend sortiert. `folder === ""` ist die
 *  Vault-Wurzel. Sortiert wird mit der Standard-Ordnung (UTF-16-Codepoints) statt mit
 *  `localeCompare`: die ist ueber ICU-Versionen hinweg stabil, und „deterministisch"
 *  ist der Daseinszweck dieses Werkzeugs. */
export function collectFolderNotes(allPaths: string[], folder: string, recursive: boolean): string[] {
  const prefix = folder === "" ? "" : `${nf(folder)}/`;
  const hits = allPaths.filter((p) => {
    const n = nf(p);
    if (!n.startsWith(prefix)) return false;
    const rest = n.slice(prefix.length);
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
  // Alles, was kein Skalar und kein Array ist — Objekte ebenso wie Funktionen —, wird zum
  // Platzhalter `{…}`. Aus `metadataCache` kommt praktisch nie eine Funktion, aber die
  // Regel ist bewusst am Fall, nicht am Typ: eine Übersichtszeile zeigt Werte, keine
  // Strukturen, und Funktionsquelltext waere eine Struktur, kein Wert.
  return "{…}";
}

function collapse(s: string): string {
  return s.replace(/\s*\r?\n\s*/g, " ").trim();
}

/** Gekuerzt wird nach CODEPOINTS, nicht nach UTF-16-Einheiten: `slice` mitten durch ein
 *  Surrogatpaar (Emoji, viele CJK-Erweiterungen) hinterlaesst ein halbes Zeichen, das je
 *  nach Leser als Ersatzzeichen oder als Muell erscheint. */
function clip(s: string): string {
  const cps = [...s];
  return cps.length <= VALUE_MAX ? s : `${cps.slice(0, VALUE_MAX).join("")}…`;
}

/** Genau die angeforderten Felder, in der angeforderten Reihenfolge. Kein erratener
 *  Default-Satz: welche Felder zaehlen, weiss der Vault, nicht das Plugin. */
export function pickFields(fm: Record<string, unknown> | null, fields: string[]): Record<string, string> {
  // `Object.create(null)` statt `{}`: ein Objekt ohne Prototyp hat keinen geerbten
  // `__proto__`-Setter, den eine Zuweisung ausloesen koennte. Ohne das ist
  // `out["__proto__"] = "…"` bei einem String-Wert ein stiller No-op — keine Ausnahme,
  // kein Own-Property, `Object.entries(out)` sieht die Zeile nie. (Vorher stand hier
  // `Object.defineProperty` je Feld; das tat dasselbe, nur umstaendlicher.)
  const out = Object.create(null) as Record<string, string>;
  for (const f of fields) {
    // hasOwnProperty statt `fm[f]` direkt: sonst liefert `fields: ["toString"]` den
    // geerbten Object.prototype.toString statt „—".
    const has = fm !== null && Object.prototype.hasOwnProperty.call(fm, f);
    out[f] = formatFieldValue(has ? fm[f] : undefined);
  }
  return out;
}

export interface NoteRow { path: string; fields: Record<string, string> }

/** Ein Pfad oder Feldwert, der die Struktur der Zeile selbst enthaelt (` · ` als
 *  Spaltentrenner, `=` zwischen Feld und Wert), wird in Anfuehrungszeichen gesetzt —
 *  sonst kann ein Leser die Zeile `a.md · titel=Alpha · Beta` nicht von einer mit zwei
 *  Feldern unterscheiden. Innere Anfuehrungszeichen werden nach CSV-Art verdoppelt.
 *  Bewusst KEIN Ersetzen der Zeichen im Wert: der Wert soll wahr bleiben. */
function cell(s: string): string {
  return /[·=]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Die Kappungswarnung steht in ZEILE 1, nicht als Fussnote unter der Liste. Der
 *  Fehlertyp, gegen den dieses Werkzeug antritt, ist „unvollstaendig, sieht vollstaendig
 *  aus" — eine Warnung am Ende einer langen Liste reproduziert ihn. */
export function formatListResult(args: {
  folder: string; recursive: boolean; total: number; rows: NoteRow[];
}): string {
  const { folder, recursive, total, rows } = args;
  const where = folder === "" ? "in der Vault-Wurzel" : `in "${folder}"`;
  const folderNotes = rows.filter((r) => isFolderNote(r.path)).length;
  // Die Zahl steht im Kopf UND die Zeile traegt die Markierung. Das ist bewusst doppelt:
  // dasselbe Prinzip wie die Kappungswarnung — wer zaehlt, soll nicht erst am Ende merken,
  // dass eine Zeile keine Inhaltsnotiz war.
  const note = folderNotes === 0 ? "" : ` (davon ${folderNotes} Ordnernotiz${folderNotes === 1 ? "" : "en"})`;
  const head = `${rows.length} von ${total} Notizen ${where}${recursive ? " (rekursiv)" : ""}${note}`;
  const lines = rows.map((r) => {
    const cols = Object.entries(r.fields).map(([k, v]) => `${k}=${cell(v)}`);
    const path = `${cell(r.path)}${isFolderNote(r.path) ? " (Ordnernotiz)" : ""}`;
    return cols.length === 0 ? path : `${path} · ${cols.join(" · ")}`;
  });
  const body = `${head}\n\n${lines.join("\n")}`;
  if (rows.length >= total) return body;

  const hint = recursive
    ? "Grenze den Ordner ein oder setze recursive:false"
    : "Grenze den Ordner ein";
  return `⚠ UNVOLLSTÄNDIG: ${total} Notizen gefunden, ${rows.length} gezeigt. ${hint}, bevor du über Vollständigkeit sprichst.\n\n${body}`;
}

const SUGGEST_MAX = 5;

/** Editierdistanz zweier kurzer Strings (Wagner-Fischer, eine Zeile Speicher).
 *  Bewusst hier statt aus einer Bibliothek: die Funktion ist zwoelf Zeilen und `src/core`
 *  ist abhaengigkeitsfrei. Sie bewertet NUR Schreibweisen — nicht Bedeutung; ein
 *  inhaltliches Urteil ueber Ordner waere Retrieval und gehoert nicht in dieses Repo. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

/** Vorschlaege nach Naehe zum Wunschpfad ordnen, absteigend.
 *
 *  Warum ueberhaupt: `suggestFolders` sortierte alphabetisch und schnitt bei fuenf. In
 *  einem Vault mit vielen gleichnamigen Unterordnern (`_Tasks` je Projekt) nannte ein
 *  Tippfehler damit fuenf FREMDE Projektordner — folgt ein Modell einem davon, listet es
 *  die Aufgaben eines anderen Projekts, und nichts daran sieht nach einem Fehler aus.
 *
 *  Sortiert wird nach (1) Zahl der uebereinstimmenden fuehrenden Pfadsegmente, (2)
 *  Editierdistanz des letzten Segments, (3) Alphabet. Der erste Schluessel traegt den
 *  Fall: was den Schaden verursacht, ist nicht ein aehnlicher NAME, sondern ein fremder
 *  ORT. Der dritte haelt das Ergebnis deterministisch, wenn die ersten beiden nichts
 *  unterscheiden — Determinismus ist der Daseinszweck dieses Werkzeugs. */
function byNearness(candidates: string[], wanted: string): string[] {
  const w = nf(wanted).toLowerCase().split("/").filter((x) => x !== "");
  const wLast = w[w.length - 1] ?? "";
  const key = (c: string): [number, number, number] => {
    const parts = nf(c).toLowerCase().split("/");
    let shared = 0;
    while (shared < parts.length && shared < w.length && parts[shared] === w[shared]) shared++;
    const last = parts[parts.length - 1] ?? "";
    const dist = editDistance(last, wLast);
    // Eine Distanz jenseits der Haelfte des laengeren Namens ist keine Aehnlichkeit mehr,
    // sondern Zufall — dann misst sie eher den Laengenunterschied als die Verwandtschaft.
    // Solche Namen werden untereinander als GLEICH behandelt, damit das Alphabet
    // entscheidet: eine willkuerliche Reihenfolge waere schlimmer als eine neutrale,
    // weil sie wie eine Aussage aussieht.
    const near = dist <= Math.max(last.length, wLast.length) / 2;
    return [-shared, near ? 0 : 1, near ? dist : 0];
  };
  return [...candidates].sort((a, b) => {
    const [sa, na, da] = key(a);
    const [sb, nb, db] = key(b);
    return sa - sb || na - nb || da - db || (a < b ? -1 : a > b ? 1 : 0);
  });
}

/** Alle Ordner, in denen (irgendwo darunter) Notizen liegen. */
function allFolders(allPaths: string[]): string[] {
  const set = new Set<string>();
  for (const p of allPaths) {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) set.add(parts.slice(0, i).join("/"));
  }
  return [...set].sort();
}

/** Was koennte gemeint gewesen sein? Dreistufig: aehnliches letztes Segment, sonst die
 *  Unterordner des laengsten existierenden Praefixes — die Praefix-Schleife faengt dabei
 *  auch `base=""` (die Vault-Wurzel) ab und liefert fuer `folder === ""` deren direkte
 *  Unterordner. Leer bleibt das Ergebnis nur, wenn im ganzen Vault kein einziger Ordner
 *  liegt (jede Notiz direkt in der Wurzel) — dann gibt es strukturell nichts vorzuschlagen.
 *  Der Grund fuer die ganze Funktion: „Ordner leer" und „Ordner falsch geschrieben" sehen
 *  fuer das Modell sonst gleich aus — ein false negative ohne sichtbaren Fehler, also genau
 *  die Fehlerklasse, gegen die dieses Werkzeug antritt. */
export function suggestFolders(allPaths: string[], folder: string, max: number = SUGGEST_MAX): string[] {
  const folders = allFolders(allPaths);
  // Verglichen wird durchgehend normalisiert, zurueckgegeben immer der Originalpfad:
  // sonst schlaegt ein korrekt geschriebener Ordner mit Umlaut ins Leere und der Nutzer
  // liest einen Vorschlag, der optisch identisch zu seiner Eingabe ist.
  const want = nf(folder);
  const wanted = (want.split("/").pop() ?? "").toLowerCase();

  if (wanted !== "") {
    const near = folders.filter((f) => {
      const last = (nf(f).split("/").pop() ?? "").toLowerCase();
      return last !== "" && (last.includes(wanted) || wanted.includes(last));
    });
    if (near.length > 0) return byNearness(near, folder).slice(0, max);
  }

  // Laengstes existierendes Praefix des Wunschpfads → dessen direkte Unterordner.
  // Schleife startet bei i = parts.length (volle Tiefe), nicht bei parts.length - 1:
  // fuer folder === "" ist `parts` leer, und nur der Start bei der vollen (=nullten)
  // Tiefe laesst die Schleife dann ueberhaupt einmal mit base === "" laufen — das ist
  // der Fall, in dem die Kinder der Vault-Wurzel gesucht sind (die Top-Level-Ordner).
  // Fuer echte Tippfehler aendert das nichts: der volle Pfad existiert nicht, also
  // greift `continue` und die Schleife faellt wie vorher auf kuerzere Praefixe zurueck.
  const parts = want.split("/").filter((s) => s !== "");
  for (let i = parts.length; i >= 0; i--) {
    const base = parts.slice(0, i).join("/");
    const prefix = base === "" ? "" : `${base}/`;
    if (base !== "" && !folders.some((f) => nf(f) === base)) continue;
    const children = folders.filter((f) => {
      const n = nf(f);
      return n.startsWith(prefix) && !n.slice(prefix.length).includes("/") && n !== base;
    });
    if (children.length > 0) return byNearness(children, folder).slice(0, max);
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
