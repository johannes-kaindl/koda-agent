# `list_notes` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Koda bekommt ein deterministisches Werkzeug, das den Inhalt eines Vault-Ordners samt gewählter Frontmatter-Felder in **einem** Aufruf liefert — damit „vollständige Lage" nicht mehr N Werkzeug-Aufrufe kostet und Raten/Weglassen unattraktiv wird.

**Architecture:** Die Pfadliste liegt über `VaultPort.listMarkdownPaths()` bereits vor; Ordner-Filter, Zählung, Kappung, Vorschläge und Formatierung sind reine String-Arbeit und liegen in `src/core/tools/list.ts` (obsidian-frei, von `check:pure` erzwungen). Frontmatter-Werte kommen über einen neuen Port `frontmatterOf(path)` aus Obsidians `metadataCache` — und erst **nach** der Kappung, nur für die gezeigten Zeilen.

**Tech Stack:** TypeScript, vitest (globals: `describe`/`it`/`expect` ohne Import), esbuild, Obsidian-API, vendored obsidian-kit@0.25.0.

**Spec:** `docs/superpowers/specs/2026-08-14-koda-list-notes-design.md`

## Global Constraints

- `src/core/**` darf **nichts** aus `obsidian` importieren — `npm run check:pure` bricht sonst. Alle Formatierung und Filterung gehört dorthin, alle API-Berührung nach `src/obsidian/`.
- Tool-Rückgabetexte an das Modell sind **deutsch** (wie `retrieval.ts`/`vault-tools.ts`), Oberflächentexte laufen über `t()` und existieren DE **und** EN.
- Tool-`description`/`parameters` in `src/core/tools/defs.ts` sind **englisch** (sie gehen an das Modell im System-Prompt).
- Keine `eslint-disable`-Kommentare: `scripts/check-no-inline-disables.mjs` ist Teil von `npm run lint`.
- Keine absoluten Pfade in Quellcode/Tests: `scripts/check-no-abs-paths.mjs` läuft vor jedem `npm test`.
- Vor jedem Commit: `npm run gate` (lint + typecheck + typecheck:scripts + test + check:pure + build). Bei Tasks mit reinen Doku-Änderungen genügt `npm test`.
- Default `listNotesMaxRows` = **150**, Spanne **20–1000**, Step **10**.
- Werte-Kürzung bei **120** Zeichen, Vorschlagsliste maximal **5** Einträge.

---

### Task 1: `resolveFolderPath` — Pfad-Guard für Ordner

**Files:**
- Modify: `src/core/tools/path-guard.ts`
- Test: `tests/path_guard.test.ts`

**Interfaces:**
- Consumes: `normalizeRel` (bereits vorhanden in derselben Datei)
- Produces: `resolveFolderPath(rel: string): string` — wirft bei `..` und bei absolutem Pfad, liefert sonst den normalisierten Pfad **ohne** `.md`-Zwang; `""`, `"/"` und `"/a/b/"` sind gültig und ergeben `""` bzw. `"a/b"`.

- [ ] **Step 1: Write the failing test**

An `tests/path_guard.test.ts` anhängen:

```typescript
import { resolveFolderPath } from "../src/core/tools/path-guard";

describe("resolveFolderPath", () => {
  it("normalisiert Slashes und schneidet fuehrende/anhaengende ab", () => {
    expect(resolveFolderPath("/20_Projekte/")).toBe("20_Projekte");
    expect(resolveFolderPath("a\\b\\")).toBe("a/b");
  });
  it("laesst die Vault-Wurzel als leeren String zu", () => {
    expect(resolveFolderPath("")).toBe("");
    expect(resolveFolderPath("/")).toBe("");
  });
  it("verlangt KEIN .md", () => {
    expect(resolveFolderPath("Projekt/_Tasks")).toBe("Projekt/_Tasks");
  });
  it("wirft bei ..-Traversal", () => {
    expect(() => resolveFolderPath("a/../../geheim")).toThrow(/verlässt/);
  });
});
```

Hinweis für den Umsetzer: `resolveNotePath` wirft bei führendem `/` („Nur vault-relative Pfade erlaubt"). `resolveFolderPath` tut das **nicht** — Modelle schreiben Ordner regelmäßig als `/20_Projekte/`, und ein führender Slash ist dort keine Absicht, sondern Schreibweise. `..` bleibt verboten, das ist der eigentliche Schutz.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/path_guard.test.ts`
Expected: FAIL — `resolveFolderPath is not a function` / Import-Fehler.

- [ ] **Step 3: Write minimal implementation**

An `src/core/tools/path-guard.ts` anhängen:

```typescript
/** Ordner-Variante des Guards. Zwei bewusste Unterschiede zu `resolveNotePath`:
 *  kein `.md`-Zwang, und ein fuehrender `/` ist erlaubt statt ein Fehler — Modelle
 *  schreiben Ordner regelmaessig als "/20_Projekte/", das ist Schreibweise und keine
 *  Absicht, aus dem Vault zu zeigen. Der eigentliche Schutz (`..`) bleibt identisch.
 *  Rueckgabe "" bedeutet Vault-Wurzel. */
export function resolveFolderPath(rel: string): string {
  const parts = rel.split(/[\\/]/).filter((s) => s !== "" && s !== ".");
  if (parts.some((s) => s === "..")) throw new Error(`Pfad verlässt den Vault: "${rel}"`);
  return parts.join("/");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/path_guard.test.ts`
Expected: PASS (alle Fälle, auch die bestehenden für `resolveNotePath`).

- [ ] **Step 5: Commit**

```bash
git add src/core/tools/path-guard.ts tests/path_guard.test.ts
git commit -m "feat(core): resolveFolderPath — Guard fuer Ordnerpfade ohne .md-Zwang"
```

---

### Task 2: Ordner-Auswahl und Sortierung (pure)

**Files:**
- Create: `src/core/tools/list.ts`
- Create: `tests/list_collect.test.ts`

**Interfaces:**
- Consumes: nichts (reine Listen-Arbeit auf `string[]`)
- Produces: `collectFolderNotes(allPaths: string[], folder: string, recursive: boolean): string[]` — alle Markdown-Pfade unterhalb `folder`, aufsteigend sortiert. `folder === ""` meint die Vault-Wurzel. Bei `recursive === false` nur die **direkten** Kinder.

- [ ] **Step 1: Write the failing test**

`tests/list_collect.test.ts`:

```typescript
import { collectFolderNotes } from "../src/core/tools/list";

const VAULT = [
  "Projekt/_Tasks/B.md",
  "Projekt/_Tasks/A.md",
  "Projekt/_Tasks/Unter/C.md",
  "Projekt/Notiz.md",
  "Anderes/X.md",
  "Wurzel.md",
];

describe("collectFolderNotes", () => {
  it("liefert flach nur die direkten Kinder, alphabetisch", () => {
    expect(collectFolderNotes(VAULT, "Projekt/_Tasks", false)).toEqual([
      "Projekt/_Tasks/A.md",
      "Projekt/_Tasks/B.md",
    ]);
  });
  it("liefert rekursiv auch Unterordner", () => {
    expect(collectFolderNotes(VAULT, "Projekt/_Tasks", true)).toEqual([
      "Projekt/_Tasks/A.md",
      "Projekt/_Tasks/B.md",
      "Projekt/_Tasks/Unter/C.md",
    ]);
  });
  it("behandelt \"\" als Vault-Wurzel — flach nur Notizen ohne Ordner", () => {
    expect(collectFolderNotes(VAULT, "", false)).toEqual(["Wurzel.md"]);
    expect(collectFolderNotes(VAULT, "", true)).toHaveLength(6);
  });
  it("matcht Ordnernamen segmentgenau, nicht als Praefix", () => {
    const v = ["Projekt/A.md", "Projekt-Alt/B.md"];
    expect(collectFolderNotes(v, "Projekt", true)).toEqual(["Projekt/A.md"]);
  });
  it("ist unabhaengig von der Eingabereihenfolge", () => {
    const a = collectFolderNotes(VAULT, "Projekt", true);
    const b = collectFolderNotes([...VAULT].reverse(), "Projekt", true);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/list_collect.test.ts`
Expected: FAIL — Modul `src/core/tools/list.ts` existiert nicht.

- [ ] **Step 3: Write minimal implementation**

`src/core/tools/list.ts` (Kopf der Datei plus diese Funktion):

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/list_collect.test.ts`
Expected: PASS (5 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/tools/list.ts tests/list_collect.test.ts
git commit -m "feat(core): collectFolderNotes — Ordnerauswahl flach/rekursiv, deterministisch sortiert"
```

---

### Task 3: Frontmatter-Werte aufbereiten (pure)

**Files:**
- Modify: `src/core/tools/list.ts`
- Create: `tests/list_fields.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `formatFieldValue(v: unknown): string` — `—` für fehlend/leer, Listen kommagetrennt, verschachtelte Objekte `{…}`, Zeilenumbrüche zu Leerzeichen, Kürzung bei 120 Zeichen mit `…`.
  - `pickFields(fm: Record<string, unknown> | null, fields: string[]): Record<string, string>` — genau die angeforderten Felder, jedes über `formatFieldValue`.

- [ ] **Step 1: Write the failing test**

`tests/list_fields.test.ts`:

```typescript
import { formatFieldValue, pickFields } from "../src/core/tools/list";

describe("formatFieldValue", () => {
  it("meldet fehlende und leere Werte als Gedankenstrich", () => {
    expect(formatFieldValue(undefined)).toBe("—");
    expect(formatFieldValue(null)).toBe("—");
    expect(formatFieldValue("")).toBe("—");
    expect(formatFieldValue("   ")).toBe("—");
    expect(formatFieldValue([])).toBe("—");
  });
  it("gibt Skalare unveraendert und Zahlen/Booleans als Text", () => {
    expect(formatFieldValue("1_backlog_📥")).toBe("1_backlog_📥");
    expect(formatFieldValue(3)).toBe("3");
    expect(formatFieldValue(false)).toBe("false");
  });
  it("verbindet Listen mit Komma", () => {
    expect(formatFieldValue(["@rechner", "@buero"])).toBe("@rechner, @buero");
  });
  it("laesst Wikilinks unangetastet — sie sind der Fall, den eine Gegenprobe pruefen muss", () => {
    expect(formatFieldValue("[[20_Projekte/P/P|P]]")).toBe("[[20_Projekte/P/P|P]]");
  });
  it("kollabiert Zeilenumbrueche zu Leerzeichen", () => {
    expect(formatFieldValue("a\nb\n  c")).toBe("a b c");
  });
  it("kuerzt bei 120 Zeichen mit Auslassungszeichen", () => {
    const out = formatFieldValue("x".repeat(200));
    expect(out).toHaveLength(121);
    expect(out.endsWith("…")).toBe(true);
  });
  it("stellt verschachtelte Objekte als Platzhalter dar statt sie auszuschreiben", () => {
    expect(formatFieldValue({ a: 1 })).toBe("{…}");
  });
});

describe("pickFields", () => {
  it("liefert genau die angeforderten Felder in der angeforderten Reihenfolge", () => {
    const fm = { status: "offen", priority: 2, extra: "ignoriert" };
    expect(pickFields(fm, ["priority", "status"])).toEqual({ priority: "2", status: "offen" });
  });
  it("liefert fuer fehlendes Frontmatter alle Felder als Gedankenstrich", () => {
    expect(pickFields(null, ["status"])).toEqual({ status: "—" });
  });
  it("liefert ohne angeforderte Felder ein leeres Objekt", () => {
    expect(pickFields({ status: "offen" }, [])).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/list_fields.test.ts`
Expected: FAIL — `formatFieldValue is not a function`.

- [ ] **Step 3: Write minimal implementation**

An `src/core/tools/list.ts` anhängen:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/list_fields.test.ts`
Expected: PASS (10 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/tools/list.ts tests/list_fields.test.ts
git commit -m "feat(core): Frontmatter-Werte als eine Zeile aufbereiten (formatFieldValue/pickFields)"
```

---

### Task 4: Ausgabeformat mit Kappungswarnung in Zeile 1 (pure)

**Files:**
- Modify: `src/core/tools/list.ts`
- Create: `tests/list_format.test.ts`

**Interfaces:**
- Consumes: `formatFieldValue`/`pickFields` (Task 3)
- Produces:
  - `interface NoteRow { path: string; fields: Record<string, string> }`
  - `formatListResult(args: { folder: string; recursive: boolean; total: number; rows: NoteRow[] }): string`

- [ ] **Step 1: Write the failing test**

`tests/list_format.test.ts`:

```typescript
import { formatListResult, type NoteRow } from "../src/core/tools/list";

const rows = (n: number): NoteRow[] =>
  Array.from({ length: n }, (_, i) => ({ path: `P/_Tasks/${i}.md`, fields: { status: "offen" } }));

describe("formatListResult", () => {
  it("nennt die Zaehlung in der Kopfzeile und je Notiz eine Zeile", () => {
    const out = formatListResult({ folder: "P/_Tasks", recursive: false, total: 3, rows: rows(3) });
    expect(out.split("\n")[0]).toBe('3 von 3 Notizen in "P/_Tasks"');
    expect(out).toContain("P/_Tasks/0.md · status=offen");
  });
  it("stellt die Unvollstaendigkeit in ZEILE 1 — nicht als Fussnote", () => {
    const out = formatListResult({ folder: "20_Projekte", recursive: true, total: 512, rows: rows(150) });
    const first = out.split("\n")[0];
    expect(first).toContain("UNVOLLSTÄNDIG");
    expect(first).toContain("512");
    expect(first).toContain("150");
    expect(out).not.toMatch(/UNVOLLSTÄNDIG[\s\S]*UNVOLLSTÄNDIG/);
  });
  it("rät bei rekursivem Aufruf zusaetzlich zu recursive:false", () => {
    const rec = formatListResult({ folder: "A", recursive: true, total: 512, rows: rows(150) });
    const flat = formatListResult({ folder: "A", recursive: false, total: 512, rows: rows(150) });
    expect(rec).toContain("recursive:false");
    expect(flat).not.toContain("recursive:false");
  });
  it("markiert die Vault-Wurzel im Klartext statt als leeren String", () => {
    const out = formatListResult({ folder: "", recursive: false, total: 1, rows: rows(1) });
    expect(out.split("\n")[0]).toBe("1 von 1 Notizen in der Vault-Wurzel");
  });
  it("laesst ohne Felder die reine Pfadliste stehen", () => {
    const out = formatListResult({
      folder: "A", recursive: false, total: 1, rows: [{ path: "A/x.md", fields: {} }],
    });
    expect(out).toContain("A/x.md");
    expect(out).not.toContain("·");
  });
  it("weist auf den rekursiven Aufruf in der Kopfzeile hin", () => {
    const out = formatListResult({ folder: "A", recursive: true, total: 2, rows: rows(2) });
    expect(out.split("\n")[0]).toContain("(rekursiv)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/list_format.test.ts`
Expected: FAIL — `formatListResult is not a function`.

- [ ] **Step 3: Write minimal implementation**

An `src/core/tools/list.ts` anhängen:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/list_format.test.ts`
Expected: PASS (6 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/tools/list.ts tests/list_format.test.ts
git commit -m "feat(core): Listen-Ausgabe mit Kappungswarnung in Zeile 1"
```

---

### Task 5: Null Treffer wird ein Fehler mit Vorschlägen (pure)

**Files:**
- Modify: `src/core/tools/list.ts`
- Create: `tests/list_suggest.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `suggestFolders(allPaths: string[], folder: string, max?: number): string[]` — dreistufig nach Spec E4, `max` Default 5, Ergebnis sortiert und doppelfrei.
  - `formatEmptyFolder(folder: string, suggestions: string[]): string` — der Fehlertext.

- [ ] **Step 1: Write the failing test**

`tests/list_suggest.test.ts`:

```typescript
import { suggestFolders, formatEmptyFolder } from "../src/core/tools/list";

const VAULT = [
  "20_Projekte/26-001 Einrichtung/26-001-03 Koda/_Tasks/A.md",
  "20_Projekte/26-001 Einrichtung/26-001-03 Koda/Notiz.md",
  "20_Projekte/26-002 Anderes/Notiz.md",
  "10_Aufgaben/X.md",
];

describe("suggestFolders", () => {
  it("Stufe 1: findet Ordner mit aehnlichem letzten Segment", () => {
    expect(suggestFolders(VAULT, "20_Projekte/26-001 Einrichtung/26-001-03 Koda/tasks"))
      .toEqual(["20_Projekte/26-001 Einrichtung/26-001-03 Koda/_Tasks"]);
  });
  it("Stufe 2: zeigt sonst die Unterordner des laengsten existierenden Praefixes", () => {
    expect(suggestFolders(VAULT, "20_Projekte/26-003 Tippfehler")).toEqual([
      "20_Projekte/26-001 Einrichtung",
      "20_Projekte/26-002 Anderes",
    ]);
  });
  it("Stufe 3: raet nicht, wenn es nichts zu raten gibt", () => {
    expect(suggestFolders(["A.md"], "Voellig/Anderes")).toEqual([]);
  });
  it("liefert hoechstens fuenf Vorschlaege", () => {
    const many = Array.from({ length: 9 }, (_, i) => `Basis/Ordner${i}/N.md`);
    expect(suggestFolders(many, "Basis/Fehlt")).toHaveLength(5);
  });
});

describe("formatEmptyFolder", () => {
  it("behauptet NICHT, dass der Ordner nicht existiert", () => {
    const msg = formatEmptyFolder("A/B", []);
    expect(msg).toContain("keine Notiz");
    expect(msg).not.toMatch(/existiert nicht|gibt es nicht/i);
  });
  it("nennt die Vorschlaege, wenn es welche gibt", () => {
    const msg = formatEmptyFolder("A/tasks", ["A/_Tasks"]);
    expect(msg).toContain("A/_Tasks");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/list_suggest.test.ts`
Expected: FAIL — `suggestFolders is not a function`.

- [ ] **Step 3: Write minimal implementation**

An `src/core/tools/list.ts` anhängen:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/list_suggest.test.ts`
Expected: PASS (6 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/tools/list.ts tests/list_suggest.test.ts
git commit -m "feat(core): leerer Ordner meldet Vorschlaege statt einer leeren Liste"
```

---

### Task 6: Einstellung `listNotesMaxRows`

**Files:**
- Modify: `src/core/settings-types.ts`
- Test: `tests/settings_types.test.ts`

**Interfaces:**
- Consumes: `clampInt` (bereits importiert)
- Produces: `LIST_ROWS_MIN = 20`, `LIST_ROWS_MAX = 1000`, `LIST_ROWS_STEP = 10`, Feld `listNotesMaxRows: number` in `KodaSettings` (Default 150), geklemmt in `mergeKodaSettings`.

- [ ] **Step 1: Write the failing test**

An `tests/settings_types.test.ts` anhängen (Import-Zeile oben entsprechend erweitern):

```typescript
import { LIST_ROWS_MIN, LIST_ROWS_MAX } from "../src/core/settings-types";

describe("listNotesMaxRows", () => {
  it("hat 150 als Default", () => {
    expect(mergeKodaSettings({}).listNotesMaxRows).toBe(150);
  });
  it("klemmt nach unten und oben statt zu uebernehmen", () => {
    expect(mergeKodaSettings({ listNotesMaxRows: 1 }).listNotesMaxRows).toBe(LIST_ROWS_MIN);
    expect(mergeKodaSettings({ listNotesMaxRows: 99999 }).listNotesMaxRows).toBe(LIST_ROWS_MAX);
  });
  it("faellt bei Unsinn auf den Default zurueck", () => {
    expect(mergeKodaSettings({ listNotesMaxRows: "viele" }).listNotesMaxRows).toBe(150);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/settings_types.test.ts`
Expected: FAIL — `listNotesMaxRows` ist `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `src/core/settings-types.ts`: Konstanten neben `SKILL_BUDGET_*` ergänzen, Feld in `KodaSettings` und `DEFAULT_SETTINGS`, Klemmung in `mergeKodaSettings`.

```typescript
/** Spanne für `listNotesMaxRows` — wie viele Zeilen `list_notes` höchstens ausgibt.
 *  Wie `skillBudgetChars` bewusst eine Einstellung und keine Konstante: die Grenze lässt
 *  stillschweigend Verhalten weg (hier: Notizen), und solche Grenzen gehören sichtbar.
 *  Der Default 150 sind bei 40–120 Zeichen je Zeile grob 1.500–4.500 Token. Über der
 *  Grenze verschwindet nichts heimlich — die Kappung meldet sich in Zeile 1 der Antwort. */
export const LIST_ROWS_MIN = 20;
export const LIST_ROWS_MAX = 1000;
export const LIST_ROWS_STEP = 10;
```

```typescript
// in KodaSettings:
  listNotesMaxRows: number;
// in DEFAULT_SETTINGS:
  listNotesMaxRows: 150,
// in mergeKodaSettings, neben den anderen clampInt-Zeilen:
    listNotesMaxRows: clampInt(
      merged.listNotesMaxRows, LIST_ROWS_MIN, LIST_ROWS_MAX, DEFAULT_SETTINGS.listNotesMaxRows,
    ),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/settings_types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/settings-types.ts tests/settings_types.test.ts
git commit -m "feat(settings): listNotesMaxRows als sichtbare Grenze (Default 150)"
```

---

### Task 7: `list_notes` im Adapter verdrahten

**Files:**
- Modify: `src/obsidian/vault-tools.ts`
- Create: `tests/vault_tools_list.test.ts`
- Modify: `tests/vault_tools.test.ts` (der `fakeVault`-Helfer braucht `frontmatterOf`)
- Modify: `tests/vault_tools_retrieval.test.ts` (dito, falls dort ein eigener Fake steht)

**Interfaces:**
- Consumes: `resolveFolderPath` (Task 1), `collectFolderNotes`/`pickFields`/`formatListResult`/`suggestFolders`/`formatEmptyFolder` (Tasks 2–5), `listNotesMaxRows` (Task 6)
- Produces:
  - `VaultPort.frontmatterOf(path: string): Record<string, unknown> | null` (neues Pflichtfeld)
  - `VaultTools`-Option `listMaxRows(): number`
  - Tool-Zweig `case "list_notes"`

- [ ] **Step 1: Write the failing test**

`tests/vault_tools_list.test.ts`:

```typescript
import { VaultTools, type VaultPort } from "../src/obsidian/vault-tools";

function fakeVault(
  files: Record<string, string>,
  fm: Record<string, Record<string, unknown>> = {},
): VaultPort & { fmCalls: string[] } {
  const fmCalls: string[] = [];
  return {
    fmCalls,
    listMarkdownPaths: () => Object.keys(files),
    read: async (p) => files[p] ?? "",
    exists: async (p) => p in files,
    create: async () => undefined,
    append: async () => undefined,
    overwrite: async () => undefined,
    frontmatterOf: (p) => {
      fmCalls.push(p);
      return fm[p] ?? null;
    },
  };
}

const opts = { kodaFolder: () => "Koda", today: () => "2026-08-14", listMaxRows: () => 150 };

describe("list_notes", () => {
  it("listet einen Ordner mit den angeforderten Frontmatter-Feldern", async () => {
    const vault = fakeVault(
      { "P/_Tasks/A.md": "", "P/_Tasks/B.md": "", "P/Notiz.md": "" },
      { "P/_Tasks/A.md": { status: "offen" }, "P/_Tasks/B.md": { status: "erledigt" } },
    );
    const r = await new VaultTools(vault, async () => true, opts)
      .run("list_notes", { folder: "P/_Tasks", fields: ["status"] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content).toContain("2 von 2 Notizen");
      expect(r.content).toContain("P/_Tasks/A.md · status=offen");
      expect(r.content).not.toContain("P/Notiz.md");
    }
  });
  it("toleriert fuehrende und anhaengende Slashes des Modells", async () => {
    const vault = fakeVault({ "P/A.md": "" });
    const r = await new VaultTools(vault, async () => true, opts).run("list_notes", { folder: "/P/" });
    expect(r.ok).toBe(true);
  });
  it("blockt Traversal", async () => {
    const vault = fakeVault({ "P/A.md": "" });
    const r = await new VaultTools(vault, async () => true, opts).run("list_notes", { folder: "../geheim" });
    expect(r.ok).toBe(false);
  });
  it("meldet einen leeren Ordner als Fehler MIT Vorschlaegen", async () => {
    const vault = fakeVault({ "P/_Tasks/A.md": "" });
    const r = await new VaultTools(vault, async () => true, opts).run("list_notes", { folder: "P/tasks" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("P/_Tasks");
  });
  it("fragt den Frontmatter-Cache NUR fuer die gezeigten Zeilen ab", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 40; i++) files[`P/${String(i).padStart(3, "0")}.md`] = "";
    const vault = fakeVault(files);
    const tools = new VaultTools(vault, async () => true, { ...opts, listMaxRows: () => 10 });
    const r = await tools.run("list_notes", { folder: "P", fields: ["status"] });
    expect(vault.fmCalls).toHaveLength(10);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content.split("\n")[0]).toContain("UNVOLLSTÄNDIG");
  });
  it("nimmt recursive auch als String an — Modelle liefern das gemischt", async () => {
    const vault = fakeVault({ "P/U/A.md": "" });
    const r = await new VaultTools(vault, async () => true, opts)
      .run("list_notes", { folder: "P", recursive: "true" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toContain("P/U/A.md");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/vault_tools_list.test.ts`
Expected: FAIL — `unbekanntes Tool: list_notes`, außerdem TypeScript-Fehler wegen `frontmatterOf`.

- [ ] **Step 3: Write minimal implementation**

In `src/obsidian/vault-tools.ts`:

```typescript
// Importe ergaenzen:
import { resolveFolderPath, resolveNotePath } from "../core/tools/path-guard";
import {
  collectFolderNotes, pickFields, formatListResult, suggestFolders, formatEmptyFolder,
} from "../core/tools/list";
```

```typescript
// in VaultPort:
  /** Frontmatter aus Obsidians metadataCache — `null`, wenn die Notiz keins hat oder
   *  nicht im Cache steht. Bewusst synchron und ohne Dateizugriff: `list_notes` fragt
   *  sonst je Aufruf N Dateien an, und ein Werkzeug gegen teure Pruefschritte darf
   *  nicht selbst der teuerste Aufruf sein. */
  frontmatterOf(path: string): Record<string, unknown> | null;
```

```typescript
// in den opts des Konstruktors, neben kodaFolder/today:
      /** Frisch je Aufruf gelesen, damit eine Aenderung in den Einstellungen sofort greift. */
      listMaxRows(): number;
```

```typescript
// in run():
        case "list_notes":
          return this.listNotes(str(a.folder), bool(a.recursive), strArray(a.fields));
```

```typescript
  /** Ordnerinhalt in EINEM Aufruf. Die Kappung liegt vor dem Frontmatter-Holen: gezaehlt
   *  wird ueber die Pfadliste (billig), geholt nur fuer die Zeilen, die auch erscheinen. */
  private async listNotes(folder: string, recursive: boolean, fields: string[]): Promise<ToolOutcome> {
    const norm = resolveFolderPath(folder);
    const all = this.vault.listMarkdownPaths();
    const paths = collectFolderNotes(all, norm, recursive);
    if (paths.length === 0) {
      return { ok: false, error: formatEmptyFolder(norm, suggestFolders(all, norm)) };
    }
    const shown = paths.slice(0, Math.max(1, this.opts.listMaxRows()));
    const rows = shown.map((p) => ({ path: p, fields: pickFields(this.vault.frontmatterOf(p), fields) }));
    return { ok: true, content: formatListResult({ folder: norm, recursive, total: paths.length, rows }) };
  }
```

Am Dateiende neben `str`/`num`:

```typescript
/** Modelle liefern Booleans mal als `true`, mal als `"true"`. Tolerant lesen ist hier
 *  richtig: der strenge Weg wuerde einen gemeinten rekursiven Aufruf still zu einem
 *  flachen machen — wieder ein Ergebnis, das vollstaendig aussieht und keines ist. */
function bool(v: unknown): boolean {
  return typeof v === "boolean" ? v : typeof v === "string" && v.toLowerCase() === "true";
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
```

Danach in `tests/vault_tools.test.ts` (und, falls dort ein eigener Fake existiert, in `tests/vault_tools_retrieval.test.ts`) den `fakeVault`-Helfer um `frontmatterOf: () => null` und die `opts`-Konstante um `listMaxRows: () => 150` ergänzen.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run` — **alle** Suiten, weil `VaultPort` ein Pflichtfeld bekommen hat.
Expected: PASS, keine TypeScript-Fehler.

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/vault-tools.ts tests/
git commit -m "feat(tools): list_notes im Adapter — Kappung vor dem Frontmatter-Holen"
```

---

### Task 8: Werkzeug im System-Prompt bekanntmachen

**Files:**
- Modify: `src/core/tools/defs.ts`
- Modify: `tests/tool_defs.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces: sechster Eintrag in `TOOL_DEFS` mit `name: "list_notes"`; `search_notes.description` um einen Abgrenzungssatz ergänzt.

- [ ] **Step 1: Write the failing test**

An `tests/tool_defs.test.ts` anhängen:

```typescript
describe("list_notes in den Tool-Defs", () => {
  it("ist Teil der festen Werkzeuge — auch ohne vault-rag", () => {
    const names = toolDefs({ related: false }).map((d) => d.name);
    expect(names).toContain("list_notes");
  });
  it("verlangt nur den Ordner", () => {
    const def = toolDefs({ related: false }).find((d) => d.name === "list_notes");
    expect((def?.parameters as { required: string[] }).required).toEqual(["folder"]);
  });
  it("grenzt search_notes gegen list_notes ab, damit die Wahl nicht dem Zufall ueberlassen bleibt", () => {
    const search = toolDefs({ related: false }).find((d) => d.name === "search_notes");
    expect(search?.description).toContain("list_notes");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tool_defs.test.ts`
Expected: FAIL — `list_notes` fehlt.

- [ ] **Step 3: Write minimal implementation**

In `src/core/tools/defs.ts` an `search_notes.description` anhängen:

> ` Use list_notes instead when you need everything in a folder — search only finds literal matches and cannot tell you what a folder contains.`

Neuer Eintrag in `TOOL_DEFS` (nach `read_note`):

```typescript
  {
    name: "list_notes",
    description:
      "List every note in a vault folder in ONE call, with the frontmatter fields you ask for. Use this whenever completeness matters — all tasks in a folder and their status, all notes of a project — instead of opening notes one by one or inferring the list from prose you read elsewhere. If the result is capped, the first line says so.",
    parameters: {
      type: "object",
      properties: {
        folder: { type: "string", description: "Vault-relative folder, e.g. Projekt/_Tasks. Empty string means the vault root." },
        recursive: { type: "boolean", description: "Include subfolders. Default false." },
        fields: {
          type: "array",
          items: { type: "string" },
          description: "Frontmatter field names to show per note, e.g. [\"status\",\"priority\"]. Omit for paths only.",
        },
      },
      required: ["folder"],
    },
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tool_defs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/tools/defs.ts tests/tool_defs.test.ts
git commit -m "feat(tools): list_notes als sechstes Werkzeug, search_notes abgegrenzt"
```

---

### Task 9: Verdrahtung in Obsidian — `metadataCache`, Slider, i18n

**Files:**
- Modify: `src/main.ts` (VaultPort-Literal, ~Zeile 200; `VaultTools`-Optionen, ~Zeile 227)
- Modify: `src/obsidian/settings.ts` (Zeilenliste, nach dem `skillBudget`-Eintrag)
- Modify: `src/i18n/strings.ts` (Block `en` und Block `de`)

**Interfaces:**
- Consumes: `LIST_ROWS_MIN`/`LIST_ROWS_MAX`/`LIST_ROWS_STEP` (Task 6), `frontmatterOf`/`listMaxRows` (Task 7)
- Produces: keine neuen Signaturen — dies ist die Verkabelung.

- [ ] **Step 1: `frontmatterOf` im VaultPort-Literal ergänzen**

In `src/main.ts`, im Objektliteral `const vaultPort: VaultPort = { … }`:

```typescript
        /** Obsidians Cache ist die Wahrheit, an der sich auch Bases und Board-Filter im
         *  Vault orientieren — wer hier selbst parst, beantwortet eine andere Frage als
         *  die, die der Nutzer sieht. `getFileCache` ist synchron und ohne Dateizugriff. */
        frontmatterOf: (p) => {
          const f = this.app.vault.getFileByPath(p);
          return f === null ? null : this.app.metadataCache.getFileCache(f)?.frontmatter ?? null;
        },
```

- [ ] **Step 2: `listMaxRows` an `VaultTools` durchreichen**

In `src/main.ts` bei `new VaultTools(vaultPort, …, { kodaFolder: …, today: …, retrieval: … })` ergänzen:

```typescript
        listMaxRows: () => this.settings.listNotesMaxRows,
```

Hinweis: die Nachbarfelder zeigen das Muster — `kodaFolder: () => this.settings.kodaFolder` und `retrieval: () => readRetrievalApi(this.app)` lesen ebenfalls frisch je Aufruf, damit eine Änderung in den Einstellungen ohne Neustart greift. Verifiziert am 2026-08-14: das Feld heißt `this.settings` (`src/main.ts:227-234`).

- [ ] **Step 3: Slider in den Einstellungen**

In `src/obsidian/settings.ts` nach dem `settings.skillBudget`-Eintrag:

```typescript
      {
        name: t("settings.listRows"),
        desc: t("settings.listRows.desc"),
        control: {
          type: "slider",
          key: "listNotesMaxRows",
          min: LIST_ROWS_MIN,
          max: LIST_ROWS_MAX,
          step: LIST_ROWS_STEP,
        },
      },
```

Import in derselben Datei erweitern (dort, wo `SKILL_BUDGET_MIN` importiert wird).

- [ ] **Step 4: i18n-Texte in beiden Sprachen**

In `src/i18n/strings.ts`, Block `en`:

```typescript
    "settings.listRows": "List limit",
    "settings.listRows.desc": "How many notes list_notes returns at most. Above the limit nothing disappears quietly — the first line of the answer says the list is incomplete.",
```

Block `de`:

```typescript
    "settings.listRows": "Listen-Grenze",
    "settings.listRows.desc": "Wie viele Notizen list_notes höchstens zurückgibt. Über der Grenze verschwindet nichts still — die erste Zeile der Antwort sagt, dass die Liste unvollständig ist.",
```

- [ ] **Step 5: Volles Gate fahren**

Run: `npm run gate`
Expected: alles grün, Testzahl um die neuen Suiten gewachsen, `main.js` baut.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/obsidian/settings.ts src/i18n/strings.ts
git commit -m "feat(ui): list_notes verdrahtet — metadataCache, Listen-Grenze im Settings-Tab, DE/EN"
```

---

### Task 10: GUI-Smoke — Nahtpunkt `metadataCache`

**Files:**
- Modify: `scripts/gui-smoke.ts` (neuer Punkt direkt nach `1b. Retrieval-Andockung`)
- Modify: `docs/SMOKE.md`

**Interfaces:**
- Consumes: `record(name, ok, detail)` und `cdp.evaluate<T>(js)` aus derselben Datei
- Produces: Prüfpunkt `1c. Frontmatter-Naht`

**Warum genau dieser Punkt:** `VaultTools` ist in `main.ts` lokal und hängt nicht am Plugin-Objekt — der Smoke kommt an `list_notes` selbst nicht heran, und eine Produktionsänderung allein für den Test wäre der falsche Preis (dieselbe Abwägung steht im Kopfkommentar von `gui-smoke.ts`). Prüfbar und wertvoll ist die **Naht**: liefert `app.metadataCache` Frontmatter in der Form, gegen die `pickFields` gebaut ist? Das ist der einzige Teil, den Unit-Tests nicht abdecken können, weil dort ein Fake steht.

- [ ] **Step 1: Prüfpunkt einfügen**

```typescript
    // --- 1c. Frontmatter-Naht (Grundlage von list_notes) --------------------
    // Geprueft wird NICHT list_notes selbst (VaultTools haengt nicht am Plugin-Objekt),
    // sondern die Fremd-API darunter: liefert metadataCache ein Objekt mit flachen
    // Werten, wie `pickFields` es erwartet? Faellt Obsidian hier je auf eine andere
    // Form, faellt dieser Punkt — und nicht erst der Nutzer im Gespraech.
    const fmSeam = await cdp.evaluate<{ notes: number; withFm: number; sample?: string[]; flat?: boolean }>(`
      const files = app.vault.getMarkdownFiles();
      let withFm = 0, sample = null, flat = true;
      for (const f of files) {
        const fm = app.metadataCache.getFileCache(f)?.frontmatter;
        if (!fm) continue;
        withFm++;
        if (sample === null) sample = Object.keys(fm).slice(0, 5);
        for (const v of Object.values(fm)) {
          const ok = v === null || typeof v !== "object" || Array.isArray(v);
          if (!ok) flat = false;
        }
      }
      return { notes: files.length, withFm, sample: sample ?? [], flat };
    `);
    record(
      "1c. Frontmatter-Naht",
      fmSeam.withFm > 0 && fmSeam.flat === true,
      `${fmSeam.withFm} von ${fmSeam.notes} Notizen mit Frontmatter · Beispielfelder: ${fmSeam.sample?.join(", ") ?? "—"}`,
    );
```

- [ ] **Step 2: Gegenprobe fahren — der Punkt muss rot werden können**

Vorübergehend `getFileCache(f)?.frontmatter` im Prüfpunkt durch `getFileCache(f)?.frontmatterXX` ersetzen, `npm run smoke:gui` laufen lassen: Punkt 1c muss **rot** sein (`0 von N`). Danach zurückändern und erneut fahren: grün. Ein Prüfpunkt ohne bestandene Gegenprobe ist im Repo bereits einmal als Problem vermerkt (Kopfkommentar `gui-smoke.ts`, Punkt 3) — dieser hier bekommt sie.

Run: `npm run smoke:gui` (setzt ein laufendes Obsidian mit `--remote-debugging-port=9222` und deploytem Plugin voraus).

- [ ] **Step 3: `docs/SMOKE.md` ergänzen**

Im automatisierten Teil den Punkt 1c auflisten; im Handteil einen Punkt „list_notes im Gespräch" ergänzen: *Koda nach allen Aufgaben eines Ordners fragen — die Antwort muss auf einem `list_notes`-Aufruf beruhen, und bei gekappter Liste muss Koda die Unvollständigkeit benennen.*

- [ ] **Step 4: Commit**

```bash
git add scripts/gui-smoke.ts docs/SMOKE.md
git commit -m "test(smoke): Nahtpunkt fuer metadataCache-Frontmatter (Gegenprobe bestanden)"
```

---

### Task 11: Praxistest-Gegenprobe im Arbeitsvault (Definition of Done)

**Files:**
- Kein Repo-Code. Treiber als Wegwerf-Skript im Scratchpad-Verzeichnis dieser Session.

**Interfaces:**
- Consumes: den gebauten `main.js` aus Task 9
- Produces: das Messergebnis, das über „erledigt" entscheidet

**Vorgehen (aus dem Handoff vom 13.08., dort gemessen):** Obsidian mit `open -a Obsidian --args --remote-debugging-port=9222` starten, das CDP-Target über `- <Vault> - ` im Fenstertitel wählen, `p.ask()` **ohne** `await` aufrufen und auf `p.busy` pollen; ein Bestätigungs-Modal über `.modal-container .modal` klicken.

- [ ] **Step 1: Build in den Arbeitsvault deployen**

`main.js`, `manifest.json` und `styles.css` nach
`<Arbeitsvault>/.obsidian/plugins/koda-agent/` kopieren, Plugin in Obsidian neu laden.

- [ ] **Step 2: Die Messung fahren**

Im frischen Gespräch dieselbe Frage stellen wie am 13.08. an `project-session-start` (Projekt *26-001-03 Koda Einrichtung*).

- [ ] **Step 3: Ergebnis gegen die Messgröße halten**

Die Messgröße ist **nicht** „keine Falschangabe" — das leistete die Skill-Schärfung schon. Sie lautet:

1. Ruft Koda `list_notes` auf, statt die Aufgabenlage aus Fließtext zu rekonstruieren?
2. Stimmt die genannte Lage mit den tatsächlichen `status`-Werten der TaskNotes überein?
3. Fehlt die Aufgabenlage weiterhin ganz? Dann hat das Werkzeug den Anreiz **nicht** gedreht — das ist ein Befund, kein Fehlschlag der Umsetzung, und gehört als solcher notiert.

- [ ] **Step 4: Ergebnis festhalten**

Beide TaskNotes im Arbeitsvault fortschreiben (Ergebnis, Datum, Messgröße) und in `docs/LAB.md` einen Absatz ergänzen, falls das Modellverhalten Neues zeigt. Bei Ergebnis (3) eine Folgeaufgabe anlegen statt still nachzuschärfen.

---

### Task 12: Doku und Katalog

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md` (Abschnitte „Status" und „Struktur-Kurzüberblick")
- Modify: `../REGISTRY.md`

- [ ] **Step 1: CHANGELOG unter `Unreleased`**

Eintrag: `list_notes` — Ordnerinhalt samt gewählter Frontmatter-Felder in einem Aufruf; Kappung meldet sich in Zeile 1; leerer Ordner liefert Vorschläge statt einer leeren Liste; neue Einstellung „Listen-Grenze".

- [ ] **Step 2: `CLAUDE.md` nachziehen**

Werkzeugzahl („fünf Tools" → sechs plus das optionale `related_notes`), `src/core/tools/list.ts` im Struktur-Überblick, Testzahl nach dem Gate-Lauf.

- [ ] **Step 3: Registry-Eintrag im Dach**

Nach Kit-first-Regel 2 (nicht-triviale, wiederverwendbare Lösung): Problem „Ordner + Frontmatter als **ein** Agent-Werkzeug, mit sichtbarer Kappung statt stiller Kürzung" → Ort `koda-agent/src/core/tools/list.ts` → Status *Muster-Referenz (erstes Exemplar)*.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md CLAUDE.md
git commit -m "docs: list_notes in Changelog, Repo-Stand und Struktur nachziehen"
```

Der `REGISTRY.md`-Eintrag liegt im **Dach-Repo** und wird dort separat committet.

---

## Nicht in diesem Plan

- Umstellung der Arbeitsvault-Skills auf `list_notes` (Schritt 2 der TaskNote, eigene Aufgabe).
- Schwellenlogik der semantischen Suche (`needsSemantic`) — eigener Befund.
- Der CDP-Praxistest-Treiber ist bereits zum **zweiten Mal** ein Wegwerf-Skript. Das ist der Anlass, ihn zu tracken (CORE-TEST-02 b) — als eigene Entscheidung, nicht nebenbei in dieser Arbeit.
- Ein Release. Der Praxistest läuft gegen den lokalen Build.
