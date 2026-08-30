# Modell-Steuerung (System-Prompt + Werkzeuge) — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Nutzer kann Kodas Regelblock ersetzen und einzelne Werkzeuge abschalten oder umbeschreiben — ohne dass der Auslieferungsstand dabei eingefroren oder eine Fehlfunktion still wird.

**Architecture:** Gespeichert wird nur die Abweichung (`""`/`[]`/`{}` = Auslieferungsstand). Der Regelblock zieht als Vorlage mit Platzhaltern in ein neues pures Modul `src/core/prompt/`; `toolDefs()` bleibt der einzige Ort, an dem die Werkzeugliste entsteht, und bekommt Filter plus Beschreibungs-Overrides. Die Oberfläche sind zwei Hatch-Zeilen in einer eigenen Datei, weil `settings.ts` (453 Zeilen) deklarativ ist und weder Reset-Knopf noch Schalterliste ein deklaratives Control haben.

**Tech Stack:** TypeScript · esbuild · vitest · Obsidian-Mock aus `obsidian-kit/testing` · vendortes Kit 0.27.0 (`src/vendor/kit`, `src/vendor/kit-obsidian`)

**Spec:** `docs/superpowers/specs/2026-08-31-koda-modell-steuerung-design.md`

## Global Constraints

- **`src/core/` bleibt rein** — kein `obsidian`-Import. `npm run check:pure` erzwingt das.
- **`src/vendor/kit*` wird nie von Hand editiert** — Re-Sync über `tools/sync-kit.sh` mit `KIT_REF=0.27.0`.
- **Geschlossene Welt bleibt auf Feld-Ebene:** `validateKodaSettings` liefert genau die Schlüssel von `DEFAULT_SETTINGS`. Ausnahme sind die Schlüssel **innerhalb** von `toolsDisabled` und `toolDescriptions` (Spec E4) — dort überleben unbekannte Werkzeugnamen.
- **Platzhalter heißen `{{sprache}}` und `{{ordner}}`** — keine englischen Aliasse (Spec E1).
- **Lesende Werkzeuge** im Sinne der Warnung: `search_notes`, `read_note`, `list_notes`, `related_notes` (Spec E3).
- **UI nach `UI-STANDARD.md`:** §8 „Listen-Zeile" (vertikale Grammatik) für die Werkzeugliste, §8 „Status-Indikator" mit `is-warning` + `alert-triangle` + `--text-warning` für die Warnzeile, §10 für Texte (alle Strings nach `src/i18n/strings.ts`, DE und EN, kein Fachbegriff ohne Auflösung).
- **CSS-Präfix `.koda-`**, Farben nur über Theme-Variablen.
- **Commit-Messages in ASCII** (Hausform: `ue`/`ae`/`oe` statt Umlaute), Doku-Dateien mit Umlauten.
- **Vor jedem Commit:** `npm run gate` (lint + typecheck + typecheck:scripts + test + check:pure + build). Aktueller Stand: 405/405 Tests.
- **Kein CDP-Lauf ohne Lock:** `python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label koda-agent --intent "…" --exclusive focus`, danach `release`. Betrifft die Tasks 12 und die Abnahme.

---

### Task 1: Regelblock als Vorlage mit Platzhaltern

**Files:**
- Create: `src/core/prompt/rules.ts`
- Test: `tests/prompt_rules.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces: `DEFAULT_RULES: string`, `renderRules(template: string, opts: { lang: "de" | "en"; folder: string }): string`, `PLACEHOLDER_LANG = "{{sprache}}"`, `PLACEHOLDER_FOLDER = "{{ordner}}"`

- [ ] **Step 1: Write the failing test**

```ts
// tests/prompt_rules.test.ts
import { describe, it, expect } from "vitest";
import { DEFAULT_RULES, renderRules, PLACEHOLDER_LANG, PLACEHOLDER_FOLDER } from "../src/core/prompt/rules";

describe("DEFAULT_RULES", () => {
  it("traegt beide Platzhalter statt eingesetzter Werte", () => {
    expect(DEFAULT_RULES).toContain(PLACEHOLDER_LANG);
    expect(DEFAULT_RULES).toContain(PLACEHOLDER_FOLDER);
    expect(DEFAULT_RULES).not.toContain("German");
    expect(DEFAULT_RULES).not.toContain("Koda/");
  });
  it("nennt jedes schreibende Werkzeug, das eine eigene Regel hat", () => {
    expect(DEFAULT_RULES).toContain("save_memory");
    // Bis 0.9.0 fehlte write_skill im Prompt vollstaendig — der Anlass dieser Task.
    expect(DEFAULT_RULES).toContain("write_skill");
  });
});

describe("renderRules", () => {
  it("setzt Sprache und Ordner ein", () => {
    const out = renderRules(`Answer in ${PLACEHOLDER_LANG}. Write in "${PLACEHOLDER_FOLDER}/".`, {
      lang: "de",
      folder: "Koda",
    });
    expect(out).toBe('Answer in German. Write in "Koda/".');
  });
  it("setzt jedes Vorkommen ein, nicht nur das erste", () => {
    const out = renderRules(`${PLACEHOLDER_FOLDER} und ${PLACEHOLDER_FOLDER}`, { lang: "en", folder: "A" });
    expect(out).toBe("A und A");
  });
  it("raeumt einen Schraegstrich am Ordnerende weg, damit kein doppelter entsteht", () => {
    expect(renderRules(PLACEHOLDER_FOLDER, { lang: "en", folder: "Koda//" })).toBe("Koda");
  });
  it("laesst einen unbekannten Platzhalter stehen, statt ihn zu verschlucken", () => {
    expect(renderRules("{{unbekannt}}", { lang: "en", folder: "K" })).toBe("{{unbekannt}}");
  });
  it("uebersetzt die Sprachnamen englisch, weil der Prompt englisch ist", () => {
    expect(renderRules(PLACEHOLDER_LANG, { lang: "en", folder: "K" })).toBe("English");
    expect(renderRules(PLACEHOLDER_LANG, { lang: "de", folder: "K" })).toBe("German");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/prompt_rules.test.ts`
Expected: FAIL — `Cannot find module '../src/core/prompt/rules'`

- [ ] **Step 3: Write minimal implementation**

Der Regeltext ist wörtlich der bisherige aus `src/core/memory/memory.ts:20-31`, mit zwei
Änderungen: die zwei eingesetzten Werte werden Platzhalter, und `write_skill` bekommt einen
Satz (der Anlass der Task — es war bisher der einzige Vertrag, den der Prompt verschwieg).

```ts
// src/core/prompt/rules.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/prompt_rules.test.ts`
Expected: PASS (7 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/prompt/rules.ts tests/prompt_rules.test.ts
git commit -m "feat(prompt): Regelblock als Vorlage mit zwei Platzhaltern

Bereitet den ersetzbaren System-Prompt vor (Spec E1). write_skill bekommt
dabei die Regel, die ihm bis 0.9.0 fehlte — save_memory war erklaert, das
Gegenstueck nicht."
```

---

### Task 2: `checkRules` — die drei Warnbefunde

**Files:**
- Modify: `src/core/prompt/rules.ts`
- Test: `tests/prompt_rules.test.ts`

**Interfaces:**
- Consumes: `PLACEHOLDER_LANG`, `PLACEHOLDER_FOLDER` aus Task 1
- Produces: `type RuleWarning = "no-tools" | "missing-placeholder" | "no-reading-tool"`, `checkRules(text: string, activeReadingTools: string[]): RuleWarning[]`

- [ ] **Step 1: Write the failing test**

```ts
// an tests/prompt_rules.test.ts anhaengen
import { checkRules, DEFAULT_RULES as RULES } from "../src/core/prompt/rules";

describe("checkRules", () => {
  const alle = ["search_notes", "read_note", "list_notes"];

  it("meldet nichts fuer den Auslieferungsstand", () => {
    expect(checkRules(RULES, alle)).toEqual([]);
  });
  it("meldet nichts fuer einen umformulierten, aber gueltigen Prompt", () => {
    // Der Kern von Spec E5: keine Wort-fuer-Wort-Pruefung. Sonst waere jede
    // Umformulierung ein Fehlalarm — und Fehlalarme erziehen zum Wegsehen.
    const eigen = `Du bist Koda. Antworte auf ${PLACEHOLDER_LANG}. Nutze deine Werkzeuge, bevor du behauptest. Schreibe frei in ${PLACEHOLDER_FOLDER}.`;
    expect(checkRules(eigen, alle)).toEqual([]);
  });
  it("meldet no-tools, wenn von Werkzeugen ueberhaupt nicht die Rede ist", () => {
    expect(checkRules(`Antworte auf ${PLACEHOLDER_LANG} in ${PLACEHOLDER_FOLDER}.`, alle)).toContain("no-tools");
  });
  it("erkennt sowohl das englische als auch das deutsche Wort, ohne Ruecksicht auf Gross-Klein", () => {
    const rumpf = `${PLACEHOLDER_LANG} ${PLACEHOLDER_FOLDER} `;
    expect(checkRules(rumpf + "Benutze TOOLS.", alle)).not.toContain("no-tools");
    expect(checkRules(rumpf + "Benutze Werkzeuge.", alle)).not.toContain("no-tools");
    expect(checkRules(rumpf + "Benutze werkzeuge.", alle)).not.toContain("no-tools");
  });
  it("meldet missing-placeholder, wenn einer der beiden fehlt", () => {
    expect(checkRules(`tools ${PLACEHOLDER_FOLDER}`, alle)).toContain("missing-placeholder");
    expect(checkRules(`tools ${PLACEHOLDER_LANG}`, alle)).toContain("missing-placeholder");
  });
  it("meldet no-reading-tool, wenn kein lesendes Werkzeug mehr aktiv ist", () => {
    expect(checkRules(RULES, [])).toEqual(["no-reading-tool"]);
  });
  it("meldet mehrere Befunde zugleich und in stabiler Reihenfolge", () => {
    expect(checkRules("nichts", [])).toEqual(["no-tools", "missing-placeholder", "no-reading-tool"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/prompt_rules.test.ts`
Expected: FAIL — `checkRules is not a function`

- [ ] **Step 3: Write minimal implementation**

```ts
// an src/core/prompt/rules.ts anhaengen
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/prompt_rules.test.ts`
Expected: PASS (14 Tests — 7 aus Task 1, 7 neue)

- [ ] **Step 5: Commit**

```bash
git add src/core/prompt/rules.ts tests/prompt_rules.test.ts
git commit -m "feat(prompt): checkRules meldet drei Befunde, ohne zu verbieten

Wortpruefung statt Satzvergleich (Spec E5): ein umformulierter Prompt darf
keinen Fehlalarm ausloesen."
```

---

### Task 3: `buildSystemPrompt` zieht um und nimmt den Override

**Files:**
- Create: `src/core/prompt/build.ts`
- Modify: `src/core/memory/memory.ts` (Prompt-Bau raus, `MEMORY_HEADER`/`appendMemoryLine` bleiben)
- Modify: `src/main.ts` (Import umhängen)
- Test: `tests/prompt_build.test.ts`, `tests/memory.test.ts` (Prompt-Tests wandern mit)

**Interfaces:**
- Consumes: `DEFAULT_RULES`, `renderRules` aus Task 1
- Produces: `buildSystemPrompt(opts: { lang: "de" | "en"; memory: string; kodaFolder: string; skills?: Selection; rulesOverride?: string }): string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/prompt_build.test.ts
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../src/core/prompt/build";
import { DEFAULT_RULES, PLACEHOLDER_FOLDER } from "../src/core/prompt/rules";

const basis = { lang: "de" as const, memory: "", kodaFolder: "Koda" };

describe("buildSystemPrompt", () => {
  it("nimmt ohne Override den Auslieferungsstand, mit eingesetzten Platzhaltern", () => {
    const p = buildSystemPrompt(basis);
    expect(p).toContain("Always answer in German.");
    expect(p).toContain('folder "Koda/"');
    expect(p).not.toContain(PLACEHOLDER_FOLDER);
  });
  it("nimmt bei leerem Override ebenfalls den Auslieferungsstand", () => {
    expect(buildSystemPrompt({ ...basis, rulesOverride: "   " })).toBe(buildSystemPrompt(basis));
  });
  it("ersetzt den Regelblock vollstaendig, wenn ein Override da ist", () => {
    const p = buildSystemPrompt({ ...basis, rulesOverride: `Sei knapp. ${PLACEHOLDER_FOLDER} ist deiner.` });
    expect(p).toContain("Sei knapp. Koda ist deiner.");
    expect(p).not.toContain(DEFAULT_RULES.split("\n\n")[0]);
  });
  it("haengt Memory auch an einen Override an — Memory ist systemgesetzt", () => {
    const p = buildSystemPrompt({ ...basis, memory: "- mag Tee", rulesOverride: "Sei knapp." });
    expect(p).toContain("## Memory\n- mag Tee");
  });
  it("haengt Skills auch an einen Override an", () => {
    const p = buildSystemPrompt({
      ...basis,
      rulesOverride: "Sei knapp.",
      skills: { loaded: [{ name: "auf", description: "d", body: "b", enabled: true }], descriptionOnly: [] } as never,
    });
    expect(p).toContain("## Skills");
    expect(p).toContain("### auf");
  });
  it("folgt einem spaeteren Ordner-Umzug auch im Override", () => {
    const p = buildSystemPrompt({ ...basis, kodaFolder: "Assistent", rulesOverride: PLACEHOLDER_FOLDER });
    expect(p).toContain("Assistent");
    expect(p).not.toContain("Koda");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/prompt_build.test.ts`
Expected: FAIL — `Cannot find module '../src/core/prompt/build'`

- [ ] **Step 3: Write minimal implementation**

`buildSystemPrompt` und `renderSkills` wandern wörtlich aus `src/core/memory/memory.ts`
nach `src/core/prompt/build.ts`; der Regelblock wird durch die Vorlage ersetzt.

```ts
// src/core/prompt/build.ts
import type { Selection } from "../skills/select";
import { DEFAULT_RULES, renderRules } from "./rules";

/** Drei Schichten: Regelblock (ersetzbar), Memory, Skills. Die letzten beiden sind
 *  systemgesetzt und haengen auch an einem ueberschriebenen Regelblock — sie sind pro Lauf
 *  erzeugte Anhaenge, keine Prompt-Sprache (Spec E1). */
export function buildSystemPrompt(opts: {
  lang: "de" | "en";
  memory: string;
  kodaFolder: string;
  skills?: Selection;
  rulesOverride?: string;
}): string {
  const template = (opts.rulesOverride ?? "").trim() === "" ? DEFAULT_RULES : (opts.rulesOverride as string);
  const parts = [renderRules(template, { lang: opts.lang, folder: opts.kodaFolder })];
  if (opts.memory.trim() !== "") parts.push(`## Memory\n${opts.memory.trim()}`);
  const skillsBlock = renderSkills(opts.skills);
  if (skillsBlock !== "") parts.push(skillsBlock);
  return parts.join("\n\n");
}

function renderSkills(sel: Selection | undefined): string {
  if (sel === undefined) return "";
  const blocks: string[] = [];
  for (const s of sel.loaded) {
    blocks.push(s.body === "" ? `### ${s.name}\n${s.description}` : `### ${s.name}\n${s.description}\n\n${s.body}`);
  }
  for (const s of sel.descriptionOnly) {
    // Ehrlich benennen, dass hier etwas fehlt: Koda kann dem Skill nicht folgen,
    // soll aber wissen, dass es ihn gibt.
    blocks.push(`### ${s.name}\n${s.description}\n(not loaded — skill budget exhausted)`);
  }
  return blocks.length === 0 ? "" : `## Skills\n${blocks.join("\n\n")}`;
}
```

Dann in `src/core/memory/memory.ts` `buildSystemPrompt`, `renderSkills`, `LANGUAGE_NAME` und
den `Selection`-Import löschen (`MEMORY_HEADER` und `appendMemoryLine` bleiben). In
`src/main.ts:19` den Import auf `./core/prompt/build` umhängen. Prompt-bezogene Tests aus
`tests/memory.test.ts` nach `tests/prompt_build.test.ts` verschieben.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — alle Tests grün; `memory.test.ts` prüft nur noch Memory-Zeilen.

- [ ] **Step 5: Commit**

```bash
git add src/core/prompt/build.ts src/core/memory/memory.ts src/main.ts tests/prompt_build.test.ts tests/memory.test.ts
git commit -m "refactor(prompt): buildSystemPrompt bekommt ein eigenes Modul und einen Override

Der Prompt-Bau war in memory.ts nur zu Gast. Mit Vorlage, Einsetzung und
Pruefung ist er eine eigene Sache (Spec E7)."
```

---

### Task 4: Drei Settings-Felder mit ihren Prüfern

**Files:**
- Modify: `src/core/settings-types.ts`
- Test: `tests/settings_types.test.ts`

**Interfaces:**
- Consumes: `FieldCheck`, `SettingsSchema` aus `src/vendor/kit/settings_schema`
- Produces: `KodaSettings.systemPromptOverride: string`, `KodaSettings.toolsDisabled: string[]`, `KodaSettings.toolDescriptions: Record<string, string>`

- [ ] **Step 1: Write the failing test**

```ts
// an tests/settings_types.test.ts anhaengen
describe("Modell-Steuerung: die drei neuen Felder", () => {
  it("liefert leere Defaults — gespeichert wird die Abweichung, nie der Auslieferungsstand", () => {
    expect(DEFAULT_SETTINGS.systemPromptOverride).toBe("");
    expect(DEFAULT_SETTINGS.toolsDisabled).toEqual([]);
    expect(DEFAULT_SETTINGS.toolDescriptions).toEqual({});
  });
  it("uebernimmt gueltige Werte", () => {
    const s = validateKodaSettings({
      systemPromptOverride: "Sei knapp.",
      toolsDisabled: ["write_skill"],
      toolDescriptions: { read_note: "Liest." },
    });
    expect(s.systemPromptOverride).toBe("Sei knapp.");
    expect(s.toolsDisabled).toEqual(["write_skill"]);
    expect(s.toolDescriptions).toEqual({ read_note: "Liest." });
  });
  it("behaelt einen unbekannten Werkzeugnamen — sonst loescht ein Speichern die "
    + "related_notes-Anpassung, sobald vault-rag gerade aus ist (Spec E4)", () => {
    const s = validateKodaSettings({
      toolsDisabled: ["related_notes"],
      toolDescriptions: { related_notes: "Meins." },
    });
    expect(s.toolsDisabled).toEqual(["related_notes"]);
    expect(s.toolDescriptions).toEqual({ related_notes: "Meins." });
  });
  it("wirft kaputte Bauformen weg statt sie durchzureichen", () => {
    expect(validateKodaSettings({ toolsDisabled: "write_note" }).toolsDisabled).toEqual([]);
    expect(validateKodaSettings({ toolsDisabled: [1, "a", null] }).toolsDisabled).toEqual(["a"]);
    expect(validateKodaSettings({ toolDescriptions: ["x"] }).toolDescriptions).toEqual({});
    expect(validateKodaSettings({ toolDescriptions: { a: 5, b: "gut" } }).toolDescriptions).toEqual({ b: "gut" });
    expect(validateKodaSettings({ systemPromptOverride: 42 }).systemPromptOverride).toBe("");
  });
  it("teilt keinen Container mit den Defaults", () => {
    const s = validateKodaSettings({});
    s.toolsDisabled.push("x");
    expect(DEFAULT_SETTINGS.toolsDisabled).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/settings_types.test.ts`
Expected: FAIL — `DEFAULT_SETTINGS.systemPromptOverride` ist `undefined`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/settings-types.ts — im Interface KodaSettings ergaenzen:
  /** Ersetzt den ausgelieferten Regelblock. "" heisst Auslieferungsstand — der Default wird
   *  NIE in die data.json kopiert, sonst friere er beim ersten Oeffnen des Feldes ein und
   *  jede spaetere Verbesserung erreichte genau die Nutzer nicht mehr, die hineingesehen
   *  haben (Spec E2). */
  systemPromptOverride: string;
  /** Werkzeuge, die dem Modell nicht angeboten werden. */
  toolsDisabled: string[];
  /** Eigene Beschreibung je Werkzeug; fehlend oder leer heisst Auslieferungsstand. */
  toolDescriptions: Record<string, string>;

// in DEFAULT_SETTINGS ergaenzen:
  systemPromptOverride: "",
  toolsDisabled: [],
  toolDescriptions: {},

// oberhalb von SCHEMA ergaenzen:
/** Liste von Strings — Nicht-Strings fliegen raus, die Schluesselmenge bleibt offen.
 *  Die geschlossene Welt von `validateSettings` gilt auf FELD-Ebene und endet hier
 *  bewusst: `related_notes` existiert nur, solange vault-rag laeuft, und ein Filter gegen
 *  die bekannte Werkzeugmenge loeschte die Anpassung genau dann, wenn es aus ist (Spec E4). */
const stringArray: FieldCheck<string[]> = (raw, fallback) =>
  Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : fallback;

/** Record von Strings — dieselbe bewusste Ausnahme wie `stringArray`. */
const stringRecord: FieldCheck<Record<string, string>> = (raw, fallback) => {
  if (!isPlainObject(raw)) return fallback;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") out[k] = v;
  return out;
};

// in SCHEMA ergaenzen:
  toolsDisabled: stringArray,
  toolDescriptions: stringRecord,
```

Der Import oben wird um `type FieldCheck` und `isPlainObject` erweitert:
`import { validateSettings, clampIntField, oneOf, arrayThen, isPlainObject, type FieldCheck, type SettingsSchema } from "../vendor/kit/settings_schema";`

`systemPromptOverride` braucht **keinen** Schema-Eintrag: sein Default ist ein String, die
generische typeof-Prüfung des Kits erledigt ihn.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/settings_types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/settings-types.ts tests/settings_types.test.ts
git commit -m "feat(settings): drei Felder fuer die Modell-Steuerung

Die geschlossene Welt bleibt auf Feld-Ebene; INNERHALB von toolsDisabled und
toolDescriptions ueberleben unbekannte Werkzeugnamen (Spec E4)."
```

---

### Task 5: `toolDefs` filtert und ersetzt Beschreibungen

**Files:**
- Modify: `src/core/tools/defs.ts:124-127`
- Test: `tests/tool_defs.test.ts`

**Interfaces:**
- Consumes: nichts aus früheren Tasks
- Produces: `toolDefs(opts: { related: boolean; disabled?: string[]; descriptions?: Record<string, string> }): ToolDef[]`

- [ ] **Step 1: Write the failing test**

```ts
// an tests/tool_defs.test.ts anhaengen
describe("toolDefs mit Nutzer-Steuerung", () => {
  it("laesst abgeschaltete Werkzeuge weg — das Modell erfaehrt nichts von ihnen", () => {
    const names = toolDefs({ related: false, disabled: ["write_note", "save_memory"] }).map((d) => d.name);
    expect(names).not.toContain("write_note");
    expect(names).not.toContain("save_memory");
    expect(names).toContain("read_note");
  });
  it("schaltet auch related_notes ab", () => {
    const names = toolDefs({ related: true, disabled: ["related_notes"] }).map((d) => d.name);
    expect(names).not.toContain("related_notes");
  });
  it("ersetzt die Beschreibung, wenn eine eigene da ist", () => {
    const d = toolDefs({ related: false, descriptions: { read_note: "Liest eine Notiz. Sonst nichts." } })
      .find((x) => x.name === "read_note");
    expect(d?.description).toBe("Liest eine Notiz. Sonst nichts.");
  });
  it("nimmt bei leerer eigener Beschreibung den Auslieferungsstand (Spec E2)", () => {
    const d = toolDefs({ related: false, descriptions: { read_note: "   " } }).find((x) => x.name === "read_note");
    expect(d?.description).toContain("Read the full content");
  });
  it("ignoriert eine Beschreibung fuer ein Werkzeug, das es nicht gibt", () => {
    const list = toolDefs({ related: false, descriptions: { gibt_es_nicht: "x" } });
    expect(list.map((d) => d.name)).not.toContain("gibt_es_nicht");
  });
  it("veraendert TOOL_DEFS nicht — auch nicht ueber die ersetzte Beschreibung", () => {
    toolDefs({ related: false, descriptions: { read_note: "geaendert" } });
    expect(TOOL_DEFS.find((d) => d.name === "read_note")?.description).toContain("Read the full content");
  });
  it("bleibt ohne die neuen Angaben rueckwaertskompatibel", () => {
    expect(toolDefs({ related: false }).map((d) => d.name)).toEqual(TOOL_DEFS.map((d) => d.name));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tool_defs.test.ts`
Expected: FAIL — abgeschaltete Werkzeuge stehen weiter in der Liste

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/tools/defs.ts — toolDefs ersetzen:
/** Die Werkzeugliste haengt am Zustand der Nachbarplugins UND an der Wahl des Nutzers und
 *  wird deshalb je Gespraech gebaut statt als Konstante ausgeliefert. Sie ist der einzige
 *  Ort, an dem sie entsteht — abgeschaltet heisst hier: nicht gesendet, das Modell erfaehrt
 *  nichts davon (Spec E3). Die Kopie ist Absicht: ein Aufrufer soll TOOL_DEFS nicht
 *  versehentlich veraendern koennen. */
export function toolDefs(opts: {
  related: boolean;
  disabled?: string[];
  descriptions?: Record<string, string>;
}): ToolDef[] {
  const alle = opts.related ? [...TOOL_DEFS, RELATED_DEF] : [...TOOL_DEFS];
  const aus = new Set(opts.disabled ?? []);
  const eigen = opts.descriptions ?? {};
  return alle
    .filter((d) => !aus.has(d.name))
    .map((d) => {
      const text = (eigen[d.name] ?? "").trim();
      return text === "" ? { ...d } : { ...d, description: text };
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tool_defs.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/tools/defs.ts tests/tool_defs.test.ts
git commit -m "feat(tools): toolDefs filtert Abgeschaltete und nimmt eigene Beschreibungen"
```

---

### Task 6: Abgeschaltetes Werkzeug wird auch beim Aufruf abgelehnt

**Files:**
- Test: `tests/vault_tools.test.ts`

**Interfaces:**
- Consumes: `VaultTools.run` (bestehend)
- Produces: nichts — dieser Task ist ein Beleg, keine Änderung

Die Spec verlangt, den Fall zu **prüfen** statt anzunehmen: `src/obsidian/vault-tools.ts:82`
hat einen `default`-Zweig (`unbekanntes Tool: ${name}`). Ein abgeschaltetes Werkzeug ist für
den Runner kein Sonderfall — es ist schlicht nicht in der gesendeten Liste, und ein trotzdem
halluzinierter Aufruf landet im selben Zweig wie ein erfundener Name.

- [ ] **Step 1: Write the test that documents it**

```ts
// an tests/vault_tools.test.ts anhaengen
it("lehnt den Aufruf eines Werkzeugs ab, das nicht angeboten wurde", async () => {
  // Ein abgeschaltetes Werkzeug ist fuer den Runner dasselbe wie ein erfundenes: es steht
  // nicht in der gesendeten Liste. Der Beleg gehoert trotzdem hierher — die Spec verlangt
  // ausdruecklich, das zu messen statt anzunehmen.
  const r = await tools.run("write_skill_das_es_nicht_gibt", '{"a":1}');
  expect(r.ok).toBe(false);
  expect(r.error).toContain("unbekanntes Tool");
});
```

Den Namen `tools` an die im Test bereits vorhandene Fixture anpassen (die Datei baut sich
`VaultTools` in einem `beforeEach`; der Aufrufname steht dort).

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/vault_tools.test.ts`
Expected: PASS (der Zweig existiert bereits — ist er weg, ist das ein echter Befund)

- [ ] **Step 3: Commit**

```bash
git add tests/vault_tools.test.ts
git commit -m "test(tools): Beleg, dass ein nicht angebotenes Werkzeug abgelehnt wird"
```

---

### Task 7: Verdrahtung in `main.ts` — Override, Filter, gemerkter Prompt

**Files:**
- Create: `src/core/prompt/effective.ts`
- Modify: `src/main.ts:200-215`
- Test: `tests/prompt_effective.test.ts`

**Interfaces:**
- Consumes: `READING_TOOLS` aus Task 2, `KodaSettings` aus Task 4
- Produces: `activeReadingTools(disabled: string[], related: boolean): string[]`, `KodaPlugin.lastSystemPrompt: string | null`, `KodaPlugin.previewSystemPrompt(): Promise<string>`, `KodaPlugin.currentToolNames(): string[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/prompt_effective.test.ts
import { describe, it, expect } from "vitest";
import { activeReadingTools } from "../src/core/prompt/effective";

describe("activeReadingTools", () => {
  it("zaehlt die drei festen lesenden Werkzeuge", () => {
    expect(activeReadingTools([], false)).toEqual(["search_notes", "read_note", "list_notes"]);
  });
  it("zaehlt related_notes nur mit Index", () => {
    expect(activeReadingTools([], true)).toContain("related_notes");
  });
  it("laesst Abgeschaltete weg", () => {
    expect(activeReadingTools(["search_notes", "list_notes"], false)).toEqual(["read_note"]);
  });
  it("wird leer, wenn alle abgeschaltet sind — das ist der Warnfall", () => {
    expect(activeReadingTools(["search_notes", "read_note", "list_notes", "related_notes"], true)).toEqual([]);
  });
  it("laesst sich von einem abgeschalteten Schreibwerkzeug nicht beirren", () => {
    expect(activeReadingTools(["write_note"], false)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/prompt_effective.test.ts`
Expected: FAIL — `Cannot find module '../src/core/prompt/effective'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/prompt/effective.ts
import { READING_TOOLS } from "./rules";

/** Welche lesenden Werkzeuge im aktuellen Zustand wirklich angeboten werden. Die Warnung
 *  „Koda kann den Vault nicht mehr lesen" haengt daran, und sie darf nicht anschlagen, weil
 *  vault-rag fehlt — `related_notes` zaehlt nur mit Index (Spec E3). */
export function activeReadingTools(disabled: string[], related: boolean): string[] {
  const aus = new Set(disabled);
  return READING_TOOLS.filter((n) => (n === "related_notes" ? related : true)).filter((n) => !aus.has(n));
}
```

In `src/main.ts` in `ask()` (bei Zeile 205) die drei Stellen nachziehen:

```ts
      const system: ChatMessage = {
        role: "system",
        content: buildSystemPrompt({
          lang, memory, kodaFolder: s.kodaFolder, skills: selection,
          rulesOverride: s.systemPromptOverride,
        }),
      };
      // Fuer `gui:ask`: der Treiber liest chatLog, und dort steht der System-Prompt nicht.
      // Nur im Speicher — er traegt Memory-Zeilen und gehoert nicht auf Platte (Spec E6).
      this.lastSystemPrompt = system.content;

      const defs = this.currentToolDefs();
```

Die Werkzeugliste zieht in zwei Methoden am Plugin, damit der GUI-Smoke sie **ohne Modell**
messen kann. Prüfpunkt 17 misst die gesendete Liste, und `ask()` ruft dieselbe Methode — es
gibt keinen zweiten Weg, auf dem die beiden auseinanderlaufen könnten:

```ts
  /** Die Werkzeuge, die beim naechsten Gespraech gesendet werden. `ask()` ruft diese Methode;
   *  jeder Messpunkt darf sie ebenfalls rufen und misst damit die WIRKLICHE Liste. */
  currentToolDefs(): ToolDef[] {
    return toolDefs({
      related: readRetrievalApi(this.app)?.status().indexed === true,
      disabled: this.settings.toolsDisabled,
      descriptions: this.settings.toolDescriptions,
    });
  }

  /** Nur die Namen — was der GUI-Smoke braucht (Pruefpunkt 17). */
  currentToolNames(): string[] {
    return this.currentToolDefs().map((d) => d.name);
  }
```

Der `ToolDef`-Typ wird dafür aus `./core/tools/defs` mitimportiert.

Dazu das Feld und die Vorschau-Methode am Plugin (die Vorschau ruft **dieselbe**
`buildSystemPrompt`, nicht einen Nachbau — zwei Wege zu einem Text sind zwei Wahrheiten):

```ts
  /** Zuletzt GESENDETER Prompt. `null`, solange in dieser Sitzung nichts gefragt wurde. */
  lastSystemPrompt: string | null = null;

  /** Der Prompt, wie er beim NAECHSTEN Gespraech aussehen wird — inklusive Memory und
   *  Skills. Fuer das Ansehen-Modal (Spec E6). */
  async previewSystemPrompt(): Promise<string> {
    const memory = await this.readMemory();
    const { selection } = await this.readSkills();
    return buildSystemPrompt({
      lang: this.promptLang(),
      memory,
      kodaFolder: this.settings.kodaFolder,
      skills: selection,
      rulesOverride: this.settings.systemPromptOverride,
    });
  }
```

`readMemory` und `readSkills` sind heute `private` — beide auf paketintern (kein Modifier)
setzen, damit `previewSystemPrompt` sie nutzen kann; sie bleiben innerhalb der Klasse.

- [ ] **Step 4: Run the full suite plus typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/prompt/effective.ts src/main.ts tests/prompt_effective.test.ts
git commit -m "feat(agent): Override und Werkzeug-Wahl wirken im Gespraech

Dazu der zuletzt gesendete Prompt im Speicher — der gui:ask-Treiber liest
chatLog, und dort steht der System-Prompt nicht (Spec E6)."
```

---

### Task 8: Texte in DE und EN

**Files:**
- Modify: `src/i18n/strings.ts`
- Test: `tests/strings_modell.test.ts`

**Interfaces:**
- Produces: die unten aufgeführten Schlüssel

- [ ] **Step 1: Write the failing test**

```ts
// tests/strings_modell.test.ts
import { describe, it, expect } from "vitest";
import { t, setLang } from "../src/vendor/kit/i18n";
import "../src/i18n/strings";

const KEYS = [
  "settings.modelControl", "settings.prompt", "settings.prompt.desc", "settings.prompt.reset",
  "settings.prompt.show", "settings.warn.noTools", "settings.warn.missingPlaceholder",
  "settings.warn.noReadingTool", "settings.tools", "settings.tools.desc",
  "settings.tools.needsRag", "settings.tools.descPlaceholder",
  "prompt.modal.title", "prompt.modal.subtitle", "prompt.modal.close",
];

describe("Texte der Modell-Steuerung", () => {
  it("kennt jeden Schluessel in beiden Sprachen", () => {
    for (const lang of ["de", "en"] as const) {
      setLang(lang);
      for (const k of KEYS) {
        expect(t(k), `${k} fehlt in ${lang}`).not.toBe(k);
        expect(t(k).trim(), `${k} ist leer in ${lang}`).not.toBe("");
      }
    }
  });
  it("loest den Fachbegriff auf, statt ihn nur zu nennen (UI-STANDARD §10)", () => {
    setLang("de");
    // Die Beschreibung muss sagen, WAS das Ding tut — nicht bloss "System-Prompt".
    expect(t("settings.prompt.desc").length).toBeGreaterThan(40);
    expect(t("settings.prompt.desc")).toMatch(/Anweisung|Regeln/);
  });
  it("nennt in der Platzhalter-Warnung beide Platzhalter beim Namen", () => {
    for (const lang of ["de", "en"] as const) {
      setLang(lang);
      expect(t("settings.warn.missingPlaceholder")).toContain("{{sprache}}");
      expect(t("settings.warn.missingPlaceholder")).toContain("{{ordner}}");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/strings_modell.test.ts`
Expected: FAIL — Schlüssel fehlen (`t(k)` gibt den Schlüssel zurück)

- [ ] **Step 3: Write minimal implementation**

Achtung: `{0}`-Platzhalter der i18n-Schicht und `{{…}}`-Platzhalter des Prompts sind
verschiedene Dinge; in den Warntexten stehen die Prompt-Platzhalter wörtlich.

```ts
// src/i18n/strings.ts — im en-Block:
    "settings.modelControl": "Model control",
    "settings.prompt": "Instructions for Koda",
    "settings.prompt.desc": "The rules Koda follows in every conversation. Leave empty to use the shipped version — it is shown greyed out below. {{sprache}} and {{ordner}} are filled in when Koda runs.",
    "settings.prompt.reset": "Restore the shipped version",
    "settings.prompt.show": "Show active instructions",
    "settings.warn.noTools": "These instructions never mention tools — Koda will answer without looking into your vault.",
    "settings.warn.missingPlaceholder": "{{sprache}} or {{ordner}} is missing — Koda will not follow a later language or folder change.",
    "settings.warn.noReadingTool": "No reading tool is enabled — Koda cannot look into your vault and will answer anyway.",
    "settings.tools": "Tools",
    "settings.tools.desc": "What Koda may do. Fewer tools often means a weaker model picks the right one more reliably.",
    "settings.tools.needsRag": "needs the vault-rag plugin",
    "settings.tools.descPlaceholder": "Own description (empty = shipped)",
    "prompt.modal.title": "Active instructions",
    "prompt.modal.subtitle": "This is how the next conversation starts — including memory and skills.",
    "prompt.modal.close": "Close",

// im de-Block:
    "settings.modelControl": "Modell-Steuerung",
    "settings.prompt": "Anweisung an Koda",
    "settings.prompt.desc": "Die Regeln, denen Koda in jedem Gespräch folgt. Leer lassen heißt: die ausgelieferte Fassung gilt — sie steht ausgegraut darunter. {{sprache}} und {{ordner}} setzt Koda beim Lauf ein.",
    "settings.prompt.reset": "Ausgelieferte Fassung wiederherstellen",
    "settings.prompt.show": "Aktive Anweisung ansehen",
    "settings.warn.noTools": "In dieser Anweisung ist von Werkzeugen nie die Rede — Koda antwortet, ohne in deinen Vault zu sehen.",
    "settings.warn.missingPlaceholder": "{{sprache}} oder {{ordner}} fehlt — Koda folgt einem späteren Sprach- oder Ordnerwechsel dann nicht.",
    "settings.warn.noReadingTool": "Kein lesendes Werkzeug ist aktiv — Koda kann nicht in deinen Vault sehen und antwortet trotzdem.",
    "settings.tools": "Werkzeuge",
    "settings.tools.desc": "Was Koda tun darf. Weniger Werkzeuge heißt oft, dass ein schwächeres Modell zuverlässiger das richtige wählt.",
    "settings.tools.needsRag": "braucht das Plugin vault-rag",
    "settings.tools.descPlaceholder": "Eigene Beschreibung (leer = ausgeliefert)",
    "prompt.modal.title": "Aktive Anweisung",
    "prompt.modal.subtitle": "So beginnt das nächste Gespräch — mit Memory und Skills.",
    "prompt.modal.close": "Schließen",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/strings_modell.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/i18n/strings.ts tests/strings_modell.test.ts
git commit -m "feat(i18n): Texte der Modell-Steuerung, DE und EN

'System-Prompt' heisst in der Oberflaeche 'Anweisung an Koda' — der Fachbegriff
wird aufgeloest, nicht bloss genannt (UI-STANDARD §10)."
```

---

### Task 9: Zeilen-Modelle — was die Oberfläche zeigt, entschieden im puren Kern

**Files:**
- Create: `src/core/prompt/view-model.ts`
- Test: `tests/prompt_view_model.test.ts`

**Warum dieser Task existiert:** Der Obsidian-Mock (`tests/vendor/kit/obsidian-mock.ts:227`)
verwirft `setPlaceholder` — ein Render-Test kann über den Platzhalter nichts aussagen, und
gerade der trägt hier die Bedeutung („leer heißt ausgeliefert"). Kodas Hausstil hat dafür
längst die Antwort: `core/chat/activity.ts`, `context-usage.ts` und
`core/llm/endpoint-status-view.ts` entscheiden pur, die View bildet nur ab. Genauso hier.

**Interfaces:**
- Consumes: `DEFAULT_RULES`, `checkRules`, `RuleWarning` (Task 1/2), `activeReadingTools` (Task 7), `toolDefs` (Task 5)
- Produces:
  - `interface PromptRowModel { value: string; placeholder: string; warnings: RuleWarning[] }`
  - `promptRow(s: { systemPromptOverride: string; toolsDisabled: string[] }, related: boolean): PromptRowModel`
  - `interface ToolRowModel { name: string; placeholder: string; own: string; enabled: boolean; unavailable: boolean }`
  - `toolRows(s: { toolsDisabled: string[]; toolDescriptions: Record<string, string> }, related: boolean): ToolRowModel[]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/prompt_view_model.test.ts
import { describe, it, expect } from "vitest";
import { promptRow, toolRows } from "../src/core/prompt/view-model";
import { DEFAULT_RULES } from "../src/core/prompt/rules";

describe("promptRow", () => {
  const leer = { systemPromptOverride: "", toolsDisabled: [] };

  it("zeigt den Auslieferungsstand als Platzhalter und laesst den Wert leer", () => {
    const m = promptRow(leer, false);
    expect(m.value).toBe("");
    expect(m.placeholder).toBe(DEFAULT_RULES);
  });
  it("gibt den Override als Wert zurueck, der Platzhalter bleibt der Auslieferungsstand", () => {
    const m = promptRow({ ...leer, systemPromptOverride: "Sei knapp. {{sprache}} {{ordner}} tools" }, false);
    expect(m.value).toBe("Sei knapp. {{sprache}} {{ordner}} tools");
    expect(m.placeholder).toBe(DEFAULT_RULES);
  });
  it("warnt nicht beim Auslieferungsstand", () => {
    expect(promptRow(leer, false).warnings).toEqual([]);
  });
  it("prueft den Auslieferungsstand, wenn kein Override da ist — nicht den leeren String", () => {
    // Sonst meldete ein leeres Feld sofort no-tools und missing-placeholder.
    expect(promptRow(leer, false).warnings).not.toContain("no-tools");
  });
  it("warnt, wenn der Override keine Werkzeuge erwaehnt", () => {
    expect(promptRow({ ...leer, systemPromptOverride: "Sei knapp. {{sprache}} {{ordner}}" }, false).warnings)
      .toEqual(["no-tools"]);
  });
  it("warnt, wenn kein lesendes Werkzeug uebrig ist", () => {
    const m = promptRow({ systemPromptOverride: "", toolsDisabled: ["search_notes", "read_note", "list_notes"] }, false);
    expect(m.warnings).toEqual(["no-reading-tool"]);
  });
  it("zaehlt related_notes nur als lesendes Werkzeug, wenn ein Index da ist", () => {
    const aus = { systemPromptOverride: "", toolsDisabled: ["search_notes", "read_note", "list_notes"] };
    expect(promptRow(aus, true).warnings).toEqual([]);
    expect(promptRow(aus, false).warnings).toEqual(["no-reading-tool"]);
  });
});

describe("toolRows", () => {
  const leer = { toolsDisabled: [], toolDescriptions: {} };

  it("fuehrt jedes Werkzeug, auch related_notes ohne Index", () => {
    const rows = toolRows(leer, false);
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.name)).toContain("related_notes");
  });
  it("markiert related_notes ohne Index als nicht verfuegbar — und sonst nichts", () => {
    const rows = toolRows(leer, false);
    expect(rows.find((r) => r.name === "related_notes")?.unavailable).toBe(true);
    expect(rows.filter((r) => r.unavailable)).toHaveLength(1);
    expect(toolRows(leer, true).filter((r) => r.unavailable)).toHaveLength(0);
  });
  it("zeigt die ausgelieferte Beschreibung als Platzhalter, eigene als Wert", () => {
    const rows = toolRows({ toolsDisabled: [], toolDescriptions: { read_note: "Liest." } }, false);
    const r = rows.find((x) => x.name === "read_note");
    expect(r?.placeholder).toContain("Read the full content");
    expect(r?.own).toBe("Liest.");
  });
  it("laesst own leer, wenn keine eigene Beschreibung da ist", () => {
    expect(toolRows(leer, false).find((r) => r.name === "read_note")?.own).toBe("");
  });
  it("bildet den Schalter-Zustand ab", () => {
    const rows = toolRows({ toolsDisabled: ["write_note"], toolDescriptions: {} }, false);
    expect(rows.find((r) => r.name === "write_note")?.enabled).toBe(false);
    expect(rows.find((r) => r.name === "read_note")?.enabled).toBe(true);
  });
  it("zeigt im Platzhalter IMMER die ausgelieferte Beschreibung, nie die eigene", () => {
    // Sonst saehe der Nutzer nach dem Leeren des Feldes seinen eigenen Text als Vorgabe
    // und koennte den Auslieferungsstand nie mehr nachlesen.
    const rows = toolRows({ toolsDisabled: [], toolDescriptions: { read_note: "Liest." } }, false);
    expect(rows.find((r) => r.name === "read_note")?.placeholder).not.toBe("Liest.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/prompt_view_model.test.ts`
Expected: FAIL — `Cannot find module '../src/core/prompt/view-model'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/prompt/view-model.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/prompt_view_model.test.ts`
Expected: PASS (13 Tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/prompt/view-model.ts tests/prompt_view_model.test.ts
git commit -m "feat(prompt): Zeilen-Modelle fuer die Modell-Steuerung, pur

Was die Oberflaeche zeigt, entscheidet der Kern — wie activity.ts und
context-usage.ts. Der Platzhalter traegt hier die Bedeutung 'leer heisst
ausgeliefert', und ueber ihn kann ein Render-Test nichts aussagen."
```

---

### Task 10: Prompt-Zeile mit Reset und Warnung

**Files:**
- Create: `src/obsidian/model-control.ts`
- Modify: `styles.css`
- Modify: `src/obsidian/settings.ts` (eine Definition ergänzen)
- Test: `tests/model_control.test.ts`

**Interfaces:**
- Consumes: `promptRow` (Task 9), Strings (Task 8)
- Produces: `renderPromptRow`, `interface ModelControlCtx`
- Produces: `renderPromptRow(setting: Setting, ctx: ModelControlCtx): void`, `interface ModelControlCtx { settings: KodaSettings; save(): Promise<void>; refresh(): void; relatedAvailable: boolean; openPreview(): void }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/model_control.test.ts
import { describe, it, expect, vi } from "vitest";
import { Setting, makeFakeEl, ExtraButtonComponent, TextAreaComponent } from "obsidian";
import { renderPromptRow, type ModelControlCtx } from "../src/obsidian/model-control";
import { DEFAULT_SETTINGS, type KodaSettings } from "../src/core/settings-types";
import { DEFAULT_RULES } from "../src/core/prompt/rules";
import "../src/i18n/strings";

function ctx(over: Partial<KodaSettings> = {}): ModelControlCtx & { save: ReturnType<typeof vi.fn> } {
  return {
    settings: { ...DEFAULT_SETTINGS, ...over },
    save: vi.fn(async () => {}),
    refresh: vi.fn(),
    relatedAvailable: false,
    openPreview: vi.fn(),
  };
}

/** Der Mock verwirft `setPlaceholder` (obsidian-mock.ts:227) — geprueft wird deshalb hier
 *  nur, was er traegt: Komponenten, Werte, Callbacks, Klassen. Die Bedeutung des
 *  Platzhalters haengt am puren `promptRow` und ist dort geprueft. */
const textarea = (s: Setting): TextAreaComponent =>
  s.components.find((c) => c instanceof TextAreaComponent) as TextAreaComponent;
const resetKnopf = (s: Setting): ExtraButtonComponent =>
  s.components.find((c) => c instanceof ExtraButtonComponent && c.iconName === "rotate-ccw") as ExtraButtonComponent;

describe("renderPromptRow", () => {
  it("stellt das Feld leer dar, solange nichts ueberschrieben ist", () => {
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, ctx());
    expect(textarea(s).getValue()).toBe("");
  });
  it("zeigt einen vorhandenen Override als Wert", () => {
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, ctx({ systemPromptOverride: "Sei knapp." }));
    expect(textarea(s).getValue()).toBe("Sei knapp.");
  });
  it("schreibt eine Aenderung in die Einstellungen und speichert", () => {
    const c = ctx();
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, c);
    textarea(s).onChangeCB?.("Sei knapp.");
    expect(c.settings.systemPromptOverride).toBe("Sei knapp.");
    expect(c.save).toHaveBeenCalled();
  });
  it("traegt den Zuruecksetzen-Knopf mit dem erwarteten Icon und Tooltip", () => {
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, ctx());
    expect(resetKnopf(s)).toBeDefined();
    expect(resetKnopf(s).tooltip).not.toBe("");
  });
  it("setzt beim Zuruecksetzen auf LEER — nicht auf eine Kopie des Auslieferungsstands", async () => {
    // Der Kern von Spec E2: eine Kopie friere den Prompt beim ersten Oeffnen ein.
    const c = ctx({ systemPromptOverride: "Eigenes" });
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, c);
    resetKnopf(s).clickCB?.();
    expect(c.settings.systemPromptOverride).toBe("");
    expect(c.settings.systemPromptOverride).not.toBe(DEFAULT_RULES);
    await Promise.resolve();
    await Promise.resolve();
    expect(c.refresh).toHaveBeenCalled();
  });
  it("warnt nicht beim Auslieferungsstand", () => {
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, ctx());
    expect(s.settingEl.querySelectorAll(".koda-warn")).toHaveLength(0);
  });
  it("zeigt eine Warnzeile mit Zustandsklasse und aria-label (UI-STANDARD §8)", () => {
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, ctx({ systemPromptOverride: "Sei knapp. {{sprache}} {{ordner}}" }));
    const warn = s.settingEl.querySelectorAll(".koda-warn");
    expect(warn).toHaveLength(1);
    expect(warn[0].hasClass("is-warning")).toBe(true);
    expect(warn[0].getAttribute("aria-label")).toBeTruthy();
    expect(warn[0].textContent).not.toBe("");
  });
  it("zeigt zwei Warnzeilen, wenn zwei Befunde vorliegen", () => {
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, ctx({ systemPromptOverride: "nichts", toolsDisabled: ["search_notes", "read_note", "list_notes"] }));
    expect(s.settingEl.querySelectorAll(".koda-warn").length).toBe(3);
  });
  it("reicht den Ansehen-Knopf an den Kontext durch", () => {
    const c = ctx();
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, c);
    const btn = s.components.find((x) => typeof (x as { clickCB?: unknown }).clickCB !== "undefined"
      && !(x instanceof ExtraButtonComponent)) as { clickCB?: () => void };
    btn.clickCB?.();
    expect(c.openPreview).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/model_control.test.ts`
Expected: FAIL — `Cannot find module '../src/obsidian/model-control'`

- [ ] **Step 3: Write minimal implementation**

Vorlage ist `yijing-oracle/src/obsidian/settings/llm-section.ts:110-138` (Textarea +
`addExtraButton("rotate-ccw")`); die Warnzeile folgt §8 „Status-Indikator".

```ts
// src/obsidian/model-control.ts
import { Setting, setIcon } from "obsidian";
import { t } from "../vendor/kit/i18n";
import { type RuleWarning } from "../core/prompt/rules";
import { promptRow } from "../core/prompt/view-model";
import type { KodaSettings } from "../core/settings-types";

export interface ModelControlCtx {
  settings: KodaSettings;
  save(): Promise<void>;
  refresh(): void;
  relatedAvailable: boolean;
  openPreview(): void;
}

const WARN_TEXT: Record<RuleWarning, string> = {
  "no-tools": "settings.warn.noTools",
  "missing-placeholder": "settings.warn.missingPlaceholder",
  "no-reading-tool": "settings.warn.noReadingTool",
};

/** Textarea + Zuruecksetzen + Warnzeile + Ansehen-Knopf. Der Auslieferungsstand steht als
 *  PLATZHALTER, nie als Wert: waere er der Wert, friere er beim ersten Oeffnen ein (Spec E2). */
export function renderPromptRow(setting: Setting, ctx: ModelControlCtx): void {
  const model = promptRow(ctx.settings, ctx.relatedAvailable);
  setting.setName(t("settings.prompt")).setDesc(t("settings.prompt.desc"));
  setting
    .addTextArea((ta) => {
      ta.setPlaceholder(model.placeholder).setValue(model.value);
      ta.inputEl.rows = 8;
      ta.inputEl.addClass("koda-prompt-textarea");
      ta.onChange((v) => {
        ctx.settings.systemPromptOverride = v;
        void ctx.save();
      });
    })
    .addExtraButton((b) =>
      b.setIcon("rotate-ccw").setTooltip(t("settings.prompt.reset")).onClick(() => {
        ctx.settings.systemPromptOverride = "";
        void ctx.save().then(() => ctx.refresh());
      }),
    )
    .addButton((b) => b.setButtonText(t("settings.prompt.show")).onClick(() => ctx.openPreview()));

  for (const w of model.warnings) {
    // §8 Status-Indikator: Form UND Farbe UND State-Klasse UND aria-label — Farbe nie allein.
    const el = setting.settingEl.createDiv({ cls: "koda-warn is-warning" });
    setIcon(el.createSpan({ cls: "koda-warn-icon" }), "alert-triangle");
    el.createSpan({ text: t(WARN_TEXT[w]) });
    el.setAttribute("aria-label", t(WARN_TEXT[w]));
  }
}
```

```css
/* styles.css — ans Ende */
.koda-prompt-textarea { width: 100%; min-height: 8em; font-family: var(--font-monospace); }
.koda-warn {
  display: flex; align-items: center; gap: var(--size-4-1);
  font-size: var(--font-ui-smaller); margin-top: var(--size-4-1);
}
.koda-warn.is-warning { color: var(--text-warning); }
.koda-warn-icon { display: flex; }
```

In `src/obsidian/settings.ts` eine Gruppe ergänzen — hinter der Verdichtungs-Gruppe, vor
`settings.fallback`:

```ts
      {
        type: "group",
        heading: t("settings.modelControl"),
        items: [
          { render: (setting) => renderPromptRow(setting, this.modelCtx()) },
        ],
      },
```

dazu die Hilfsmethode:

```ts
  private modelCtx(): ModelControlCtx {
    return {
      settings: this.plugin.settings,
      save: () => this.plugin.saveSettings(),
      refresh: () => this.refreshUi(),
      relatedAvailable: readRetrievalApi(this.app)?.status().indexed === true,
      openPreview: () => new PromptPreviewModal(this.app, this.plugin).open(),
    };
  }
```

`PromptPreviewModal` entsteht in Task 12; bis dahin `openPreview: () => {}` setzen und den
Knopf in Task 11 verdrahten.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/model_control.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/model-control.ts src/obsidian/settings.ts styles.css tests/model_control.test.ts
git commit -m "feat(ui): Anweisungs-Feld mit Zuruecksetzen und Warnzeile

Textarea-Bauart nach Vorlage yijing-oracle, Warnzeile nach UI-STANDARD §8
(is-warning + alert-triangle + aria-label, Farbe nie allein)."
```

---

### Task 11: Werkzeug-Liste

**Files:**
- Modify: `src/obsidian/model-control.ts`
- Modify: `styles.css`
- Modify: `src/obsidian/settings.ts` (zweite Zeile in der Gruppe)
- Test: `tests/model_control.test.ts`

**Interfaces:**
- Consumes: `ModelControlCtx` und `toolRows` (Task 9/10)
- Produces: `renderToolList(setting: Setting, ctx: ModelControlCtx): void`

- [ ] **Step 1: Write the failing test**

```ts
// an tests/model_control.test.ts anhaengen
import { renderToolList } from "../src/obsidian/model-control";
import { ToggleComponent } from "obsidian";

/** Eine Werkzeug-Zeile im Fake-DOM. Der Zugriff laeuft ueber die Klasse und das
 *  data-Attribut, weil der Mock nur Tag- und Klassen-Selektoren kennt
 *  (obsidian-mock.ts:48). */
const zeilen = (s: Setting): any[] => s.settingEl.querySelectorAll(".koda-tool-row");
const zeile = (s: Setting, name: string): any =>
  zeilen(s).find((r) => r.getAttribute("data-tool") === name);

describe("renderToolList", () => {
  it("fuehrt jedes Werkzeug mit einer eigenen Zeile", () => {
    const s = new Setting(makeFakeEl());
    renderToolList(s, ctx());
    expect(zeilen(s)).toHaveLength(7); // sechs feste plus related_notes
  });
  it("zeigt related_notes ausgegraut statt es zu verschweigen, wenn vault-rag fehlt", () => {
    const s = new Setting(makeFakeEl());
    renderToolList(s, ctx());
    const r = zeile(s, "related_notes");
    expect(r.hasClass("is-unavailable")).toBe(true);
    expect(r.textContent).toContain("vault-rag");
  });
  it("graut nichts aus, wenn ein Index da ist", () => {
    const c = { ...ctx(), relatedAvailable: true };
    const s = new Setting(makeFakeEl());
    renderToolList(s, c);
    expect(zeile(s, "related_notes").hasClass("is-unavailable")).toBe(false);
  });
  it("schaltet ein Werkzeug ab und schreibt das in die Einstellungen", () => {
    const c = ctx();
    const s = new Setting(makeFakeEl());
    renderToolList(s, c);
    const tg = s.components.filter((x) => x instanceof ToggleComponent) as ToggleComponent[];
    // Reihenfolge der Komponenten = Reihenfolge der Zeilen (write_note ist die vierte).
    tg[3].onChangeCB?.(false);
    expect(c.settings.toolsDisabled).toContain("write_note");
    expect(c.save).toHaveBeenCalled();
  });
  it("schaltet wieder ein, ohne einen Rest in der Liste zu lassen", () => {
    const c = ctx({ toolsDisabled: ["write_note"] });
    const s = new Setting(makeFakeEl());
    renderToolList(s, c);
    const tg = s.components.filter((x) => x instanceof ToggleComponent) as ToggleComponent[];
    tg[3].onChangeCB?.(true);
    expect(c.settings.toolsDisabled).toEqual([]);
  });
  it("nimmt eine eigene Beschreibung erst beim blur an, nicht bei jedem Tastendruck", () => {
    const c = ctx();
    const s = new Setting(makeFakeEl());
    renderToolList(s, c);
    const ta = s.components.filter((x) => x instanceof TextAreaComponent) as TextAreaComponent[];
    ta[1].setValue("Liest."); // read_note ist die zweite Zeile
    expect(c.settings.toolDescriptions.read_note).toBeUndefined();
    ta[1].inputEl.dispatchEvent({ type: "blur" });
    expect(c.settings.toolDescriptions.read_note).toBe("Liest.");
  });
  it("loescht den Eintrag wieder, wenn das Feld geleert wird — leer heisst ausgeliefert", () => {
    const c = ctx({ toolDescriptions: { read_note: "Liest." } });
    const s = new Setting(makeFakeEl());
    renderToolList(s, c);
    const ta = s.components.filter((x) => x instanceof TextAreaComponent) as TextAreaComponent[];
    ta[1].setValue("   ");
    ta[1].inputEl.dispatchEvent({ type: "blur" });
    expect(c.settings.toolDescriptions.read_note).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/model_control.test.ts`
Expected: FAIL — `renderToolList is not a function`

- [ ] **Step 3: Write minimal implementation**

§8-Grammatik „Listen-Zeile", vertikal (Name/Desc/Aktion in einer Spalten-Flex). Die
Beschreibung wird bei `blur` übernommen, nicht bei `onChange` — dieselbe Regel wie beim
Endpunkt-Zeilen-Editor (sonst wird jeder Zwischenstand gespeichert).

```ts
// an src/obsidian/model-control.ts anhaengen
import { toolRows } from "../core/prompt/view-model";

/** Eine Zeile je Werkzeug: Name, eigene Beschreibung, Schalter. Die volle Liste — auch
 *  related_notes ohne vault-rag, dann ausgegraut. Ein Werkzeug, das spurlos verschwindet,
 *  schickt den Nutzer auf die Suche nach einem Schalter, den es nie gab (Spec E3). */
export function renderToolList(setting: Setting, ctx: ModelControlCtx): void {
  setting.setName(t("settings.tools")).setDesc(t("settings.tools.desc"));
  const host = setting.settingEl.createDiv({ cls: "koda-tool-list" });
  for (const row_ of toolRows(ctx.settings, ctx.relatedAvailable)) {
    const row = host.createDiv({ cls: "koda-tool-row" });
    // `setAttribute` statt `dataset`: der Fake-DOM des Mocks kennt Attribute, kein dataset.
    row.setAttribute("data-tool", row_.name);
    if (row_.unavailable) row.addClass("is-unavailable");

    const kopf = row.createDiv({ cls: "koda-tool-head" });
    kopf.createSpan({ cls: "koda-tool-name", text: row_.name });
    if (row_.unavailable) kopf.createSpan({ cls: "koda-tool-hint", text: t("settings.tools.needsRag") });

    const zeile = new Setting(row);
    zeile.setClass("koda-tool-controls");
    zeile.addTextArea((ta) => {
      ta.setPlaceholder(row_.placeholder).setValue(row_.own);
      ta.inputEl.rows = 2;
      // Uebernahme bei blur, nicht bei onChange — sonst landet jeder Zwischenstand in der
      // data.json (dieselbe Regel wie beim Endpunkt-Zeilen-Editor, UI-STANDARD §8).
      ta.inputEl.addEventListener("blur", () => {
        const v = ta.getValue().trim();
        if (v === "") delete ctx.settings.toolDescriptions[row_.name];
        else ctx.settings.toolDescriptions[row_.name] = v;
        void ctx.save();
      });
    });
    zeile.addToggle((tg) =>
      tg.setValue(row_.enabled).onChange((an) => {
        const ohne = ctx.settings.toolsDisabled.filter((n) => n !== row_.name);
        ctx.settings.toolsDisabled = an ? ohne : [...ohne, row_.name];
        void ctx.save().then(() => ctx.refresh()); // die Warnzeile oben haengt daran
      }),
    );
  }
}
```

```css
/* styles.css — ans Ende */
.koda-tool-list { display: flex; flex-direction: column; gap: var(--size-4-2); margin-top: var(--size-4-2); }
.koda-tool-row { display: flex; flex-direction: column; gap: var(--size-4-1); }
.koda-tool-row.is-unavailable { opacity: 0.5; }
.koda-tool-head { display: flex; align-items: baseline; gap: var(--size-4-2); }
.koda-tool-name { font-family: var(--font-monospace); font-size: var(--font-ui-small); }
.koda-tool-hint { font-size: var(--font-ui-smaller); color: var(--text-muted); }
.koda-tool-controls { border-top: none; padding-top: 0; }
```

In `src/obsidian/settings.ts` die Gruppe aus Task 10 um die zweite Zeile ergänzen:

```ts
          { render: (setting) => renderToolList(setting, this.modelCtx()) },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/model_control.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/model-control.ts src/obsidian/settings.ts styles.css tests/model_control.test.ts
git commit -m "feat(ui): Werkzeug-Liste mit Schalter und eigener Beschreibung

Vertikale Listen-Zeile nach UI-STANDARD §8; Uebernahme bei blur wie beim
Endpunkt-Editor. related_notes bleibt sichtbar und wird ausgegraut."
```

---

### Task 12: Modal „Aktive Anweisung ansehen"

**Files:**
- Create: `src/obsidian/prompt-modal.ts`
- Modify: `src/obsidian/settings.ts` (`openPreview` verdrahten)
- Modify: `styles.css`
- Test: `tests/prompt_modal.test.ts`

**Interfaces:**
- Consumes: `KodaPlugin.previewSystemPrompt()` (Task 7)
- Produces: `class PromptPreviewModal extends Modal` mit `constructor(app: App, plugin: { previewSystemPrompt(): Promise<string> })`

- [ ] **Step 1: Write the failing test**

```ts
// tests/prompt_modal.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "obsidian";
import { setLang } from "../src/vendor/kit/i18n";
import "../src/i18n/strings";
import { PromptPreviewModal } from "../src/obsidian/prompt-modal";

describe("PromptPreviewModal", () => {
  beforeEach(() => setLang("de"));

  it("zeigt den Prompt, den das Plugin liefert — keinen Nachbau", async () => {
    const plugin = { previewSystemPrompt: vi.fn(async () => "Regeln\n\n## Memory\n- x\n\n## Skills\n### s") };
    const m = new PromptPreviewModal(new App(), plugin);
    m.onOpen();
    await Promise.resolve();
    await Promise.resolve();
    expect(plugin.previewSystemPrompt).toHaveBeenCalledTimes(1);
    // Der Mock kennt nur `querySelectorAll` (Tag- und Klassen-Selektoren).
    const pre = m.contentEl.querySelectorAll(".koda-prompt-preview")[0];
    expect(pre.textContent).toContain("## Memory");
    expect(pre.textContent).toContain("## Skills");
  });
  it("beschriftet, dass es um das NAECHSTE Gespraech geht", async () => {
    const m = new PromptPreviewModal(new App(), { previewSystemPrompt: async () => "x" });
    m.onOpen();
    await Promise.resolve();
    expect(m.contentEl.textContent).toContain("nächste");
  });
  it("raeumt beim Schliessen auf", async () => {
    const m = new PromptPreviewModal(new App(), { previewSystemPrompt: async () => "x" });
    m.onOpen();
    await Promise.resolve();
    m.onClose();
    expect(m.contentEl.childElementCount).toBe(0);
  });
});
```

`setLang("de")` steht im `beforeEach`, weil die Prüfung auf „nächste" sonst von der
Reihenfolge der Test-Dateien abhinge.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/prompt_modal.test.ts`
Expected: FAIL — `Cannot find module '../src/obsidian/prompt-modal'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/obsidian/prompt-modal.ts
import { App, Modal } from "obsidian";
import { t } from "../vendor/kit/i18n";

/** Zeigt den fertig zusammengesetzten Prompt. Er kommt aus `previewSystemPrompt()` und
 *  damit aus DERSELBEN `buildSystemPrompt`, die auch `ask()` ruft — ein Nachbau waere eine
 *  zweite Wahrheit, und genau die hat am 2026-08-30 den Sprach-Befund erzeugt (Spec E6). */
export class PromptPreviewModal extends Modal {
  constructor(
    app: App,
    private readonly plugin: { previewSystemPrompt(): Promise<string> },
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: t("prompt.modal.title") });
    contentEl.createDiv({ cls: "koda-modal-sub", text: t("prompt.modal.subtitle") });
    const pre = contentEl.createEl("pre", { cls: "koda-prompt-preview" });
    void this.plugin.previewSystemPrompt().then((text) => {
      pre.setText(text);
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
```

```css
/* styles.css — ans Ende */
.koda-modal-sub { color: var(--text-muted); font-size: var(--font-ui-smaller); margin-bottom: var(--size-4-2); }
.koda-prompt-preview {
  white-space: pre-wrap; max-height: 50vh; overflow-y: auto;
  background: var(--background-secondary); padding: var(--size-4-2); border-radius: var(--radius-m);
  font-size: var(--font-ui-smaller);
}
```

In `src/obsidian/settings.ts` das `openPreview` aus Task 10 auf
`() => new PromptPreviewModal(this.app, this.plugin).open()` setzen.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/prompt_modal.test.ts && npm run gate`
Expected: PASS — Gate grün

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/prompt-modal.ts src/obsidian/settings.ts styles.css tests/prompt_modal.test.ts
git commit -m "feat(ui): Modal zeigt die aktive Anweisung mit Memory und Skills

Es ruft dieselbe buildSystemPrompt wie ask() — ein Nachbau waere eine zweite
Wahrheit (Spec E6)."
```

---

### Task 13: `gui:ask` zeigt den zuletzt gesendeten Prompt

**Files:**
- Modify: `scripts/gui-ask.ts`
- Modify: `docs/SMOKE.md`

**Interfaces:**
- Consumes: `KodaPlugin.lastSystemPrompt` (Task 7)

⚠️ Diese Datei nur mit dem Read-Tool lesen, nicht per `grep`/`cat` — der CDP-Guard misst den
Kommandotext und blockt Treiber-Pfade. Vor jedem Lauf den Lock nehmen.

- [ ] **Step 1: Die Stelle finden**

Read: `scripts/gui-ask.ts` — den Abschnitt, der den Bericht ausgibt (Werkzeug-Aufrufe aus
`chatLog`, danach die Prosa; `--full` steuert die Ausführlichkeit).

- [ ] **Step 2: Ausgabe ergänzen**

Vor den Werkzeug-Aufrufen einen Abschnitt einfügen, der `plugin.lastSystemPrompt` über CDP
ausliest und ausgibt. Bei `--full` vollständig, sonst die ersten 400 Zeichen plus Länge.
Dazu eine Zeile, ob der Regelblock vom Auslieferungsstand abweicht — die Angabe kommt aus
`settings.systemPromptOverride.trim() !== ""`, nicht aus einem Textvergleich.

```
=== Aktiver System-Prompt (3184 Zeichen, abweichend vom Auslieferungsstand) ===
```

Ist `lastSystemPrompt` `null`, steht dort „noch nichts gesendet" — nicht ein leerer Block.

- [ ] **Step 3: Lock nehmen und einen echten Lauf fahren**

```bash
python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label koda-agent \
  --intent "gui:ask — Prompt-Ausgabe pruefen" --exclusive focus
npm run gui:ask -- --vault koda-agent --ask "Was steht in meinen Notizen ueber Koda?" --full
python3 ~/.claude/hooks/obsidian-cdp-lock.py release
```

Expected: Der Bericht führt den Prompt vor den Werkzeug-Aufrufen; die Abweichungs-Zeile
stimmt mit dem Zustand der Einstellungen überein.

- [ ] **Step 4: Commit**

```bash
git add scripts/gui-ask.ts docs/SMOKE.md
git commit -m "feat(gui-ask): Bericht fuehrt den zuletzt gesendeten System-Prompt"
```

---

### Task 14: GUI-Smoke-Punkte 16–18

**Files:**
- Modify: `scripts/gui-smoke.ts`
- Modify: `docs/SMOKE.md`

⚠️ Dieselbe Guard-Regel wie Task 13: Read-Tool statt `grep`, Lock vor jedem Lauf.

- [ ] **Step 1: Die Prüfpunkt-Form lesen**

Read: `scripts/gui-smoke.ts` — die bestehenden Punkte 9–13 (Statuszeile, Kontext-Belegung,
Thinking-Schalter) sind die Formvorlage: `pollUntil` auf der Node-Seite, Mutation und
Wartephase getrennt, `clickReal` für echte Klicks.

- [ ] **Step 2: Punkt 16 — Reset stellt den Auslieferungsstand her**

Einstellungen öffnen, in das Anweisungs-Feld schreiben, speichern lassen, den
`rotate-ccw`-Knopf mit `clickReal` drücken, danach prüfen: `settings.systemPromptOverride`
ist `""` **und** die Textarea ist leer **und** ihr `placeholder` ist nicht leer.

Der Vorwert wird vor dem Punkt gesichert und danach zurückgeschrieben — wie beim
Thinking-Schalter (Punkt 13), damit ein Abbruch nicht einen fremden Prompt stehen lässt.

- [ ] **Step 3: Punkt 17 — ein abgeschaltetes Werkzeug wird nicht gesendet**

Gemessen wird `plugin.currentToolNames()` (Task 7) — **die** Methode, die `ask()` ruft, um
die Liste zu bauen. Damit misst der Punkt die gesendete Liste und nicht den Schalter, ohne
dass ein Modell laufen müsste (der Smoke bleibt bewusst modellfrei).

```ts
// Vorwert sichern — ein Abbruch darf keinen fremden Zustand hinterlassen (wie Punkt 13).
const vorher = await cdp.evaluate(`window.app.plugins.plugins["koda-agent"].settings.toolsDisabled`);

await cdp.evaluate(`
  (() => {
    const p = window.app.plugins.plugins["koda-agent"];
    p.settings.toolsDisabled = ["write_note"];
    return p.saveSettings();
  })()
`);
const mitAus = await cdp.evaluate(`window.app.plugins.plugins["koda-agent"].currentToolNames()`);

await cdp.evaluate(`
  (() => {
    const p = window.app.plugins.plugins["koda-agent"];
    p.settings.toolsDisabled = ${JSON.stringify(vorher ?? [])};
    return p.saveSettings();
  })()
`);
const wieder = await cdp.evaluate(`window.app.plugins.plugins["koda-agent"].currentToolNames()`);

check(
  "17 — abgeschaltetes Werkzeug wird nicht gesendet",
  !mitAus.includes("write_note") && mitAus.includes("read_note") && wieder.includes("write_note"),
  `aus: ${mitAus.join(",")} | wieder: ${wieder.join(",")}`,
);
```

Die dritte Bedingung (`wieder.includes`) ist kein Beiwerk: sie belegt, dass der Punkt seinen
Gegenstand wirklich bewegt hat. Ohne sie wäre eine Liste, die `write_note` nie enthielt,
ebenso grün.

- [ ] **Step 4: Punkt 18 — das Modal zeigt Memory und Skills**

„Aktive Anweisung ansehen" mit `clickReal` drücken, `pollUntil` auf `.koda-prompt-preview`,
dann prüfen, dass der Text `## Memory` **und** `## Skills` enthält (der Staging-Vault trägt
beides aus dem Fixture). Modal danach schließen.

- [ ] **Step 5: Lauf mit Lock**

```bash
python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label koda-agent \
  --intent "GUI-Smoke 18 Punkte nach der Modell-Steuerung" --exclusive focus
npm run smoke:gui -- --vault koda-agent
python3 ~/.claude/hooks/obsidian-cdp-lock.py release
```

Expected: 18/18. Vorher deployen und das Plugin neu laden (`disablePlugin` →
`loadManifests` → `enablePlugin`) — **kein App-Reload**, solange eine Nachbar-Session etwas
im Speicher hält.

- [ ] **Step 6: Commit**

```bash
git add scripts/gui-smoke.ts docs/SMOKE.md
git commit -m "test(smoke): Pruefpunkte 16-18 fuer die Modell-Steuerung

17 misst die GESENDETE Werkzeugliste, nicht den Schalter — ein Punkt, der nur
den Schalter anfasst, haette seinen Gegenstand nie beruehrt."
```

---

### Task 15: Doku und Registry

**Files:**
- Modify: `CHANGELOG.md`, `README.md`, `CLAUDE.md`, `docs/SMOKE.md`
- Modify: `../REGISTRY.md` (Dach — deklarierte Ausnahme, siehe unten)

**Scope-Hinweis:** `REGISTRY.md` liegt im Dach-Repo. Das ist eine benannte Ausnahme vom
Session-Scope („Standards und Registry liegen dort"), ihr Ergebnis gehört ins Dach-Repo und
wird dort committet — nicht in koda-agent.

- [ ] **Step 1: CHANGELOG**

Unter `## [Unreleased]` die vier Punkte: Anweisung ersetzbar mit Zurücksetzen, Warnung ohne
Verbot, Werkzeuge abschaltbar und umbeschreibbar, Anweisung ansehbar (Modal + `gui:ask`).

- [ ] **Step 2: README**

Im Einstellungs-Abschnitt die neue Gruppe „Modell-Steuerung" beschreiben, mit dem Satz, dass
leer immer „ausgelieferte Fassung" heißt.

- [ ] **Step 3: CLAUDE.md**

Statuszeile und Struktur-Kurzüberblick um `src/core/prompt/` ergänzen; den Hinweis, dass der
Prompt-Bau nicht mehr in `core/memory/` liegt.

- [ ] **Step 4: REGISTRY-Eintrag im Dach**

Zeile unter „Settings": **„Eine ausgelieferte Vorgabe ersetzbar machen, ohne sie
einzufrieren"** — Default `""`, leer heißt Auslieferungsstand, Reset schreibt `""`;
Platzhalter für Werte, die sich später ändern können. Ort:
`koda-agent/src/core/prompt/rules.ts` + `src/obsidian/model-control.ts`, Herkunft
`yijing-oracle`. Status: **n=2** (yijing, koda) — noch kein Kit-Kandidat.

- [ ] **Step 5: Commit (zwei Repos)**

```bash
git add CHANGELOG.md README.md CLAUDE.md docs/SMOKE.md
git commit -m "docs: Modell-Steuerung in Changelog, README und CLAUDE.md"
git -C .. add REGISTRY.md
git -C .. commit -m "docs(registry): ersetzbare Vorgabe ohne Einfrieren (n=2)"
```

---

## Abnahme

- [ ] `npm run gate` grün (erwartet: 405 + ~60 neue Tests)
- [ ] GUI-Smoke 18/18 gegen den Staging-Vault `koda-agent`, mit Lock
- [ ] `npm run gui:ask -- --vault koda-agent --ask "…" --full` zeigt den Prompt
- [ ] Gegenprobe von Hand: Anweisung überschreiben → Koda antwortet danach anders; Reset →
      Koda antwortet wieder wie ausgeliefert. Ohne diese Probe ist nur belegt, dass das Feld
      speichert, nicht dass es **wirkt**.
