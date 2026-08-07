# Markdown-Skill-System — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Koda liest Markdown-Notizen aus `<Koda-Ordner>/Skills/`, die sein Verhalten steuern, und darf sie nach Bestätigung auch selbst schreiben.

**Architecture:** Zwei reine Module in `src/core/skills/` (Parsen + Budget-Auswahl, obsidian-frei) tragen die Logik; die Obsidian-Seite liest nur Dateien ein und reicht das Ergebnis an `buildSystemPrompt` weiter. Die Vertrauensgrenze sitzt in `writePolicy` (Pfad-basiert, tool-unabhängig), nicht im neuen Tool — sonst wäre sie über `write_note` umgehbar. Phase 1 (Task 1–5) ist ohne Selbst-Autorschaft nutzbar; Phase 2 (Task 6–8) ergänzt `write_skill`.

**Tech Stack:** TypeScript, esbuild, vitest, Obsidian-API ≥1.8.7, vendortes `obsidian-kit@0.23.0`.

**Spec:** `docs/superpowers/specs/2026-08-07-koda-skill-system-design.md`

## Global Constraints

- `src/core/` darf **keinen** Obsidian-Import enthalten — `npm run check:pure` erzwingt es. Alles unter `src/core/skills/` ist rein.
- `src/vendor/kit/**` und `src/vendor/kit-obsidian/**` werden **nie von Hand editiert**. Änderungen laufen über `tools/sync-kit.sh`.
- Vor jedem Commit: `npm run gate` (= lint + typecheck + typecheck:scripts + test + check:pure + build). Ausgangsstand: **113/113 Tests grün**.
- Keine absoluten Pfade im Quelltext (`scripts/check-no-abs-paths.mjs` läuft in `npm test`).
- Jeder neue UI-String läuft durch `t(...)` und wird in **beiden** Sprachen in `src/i18n/strings.ts` eingetragen (DE und EN).
- Die Invariante **„Vorschau == geschriebener Inhalt"** darf nicht aufgeweicht werden: was das Modal zeigt, ist byte-genau das, was geschrieben wird. Neue Modal-Elemente sind additiv.
- CSS nur mit Obsidian-Theme-Variablen (`var(--text-muted)` etc.), keine festen Farben (`UI-STANDARD.md`).
- Tests liegen flach in `tests/` und heißen `<thema>.test.ts` (bestehende Konvention).

---

### Task 1: Skill-Format parsen

Vendort das Kit-Modul `frontmatter` und baut den Parser. `parseFrontmatter` ist tolerant und wirft nie — fehlt der `---`-Block, kommt `{ data: {}, order: [], body: <ganzer Text> }` zurück. Zwei Fallen aus der dokumentierten Typ-Asymmetrie des Kit-Moduls: Werte sind **immer Strings** (`enabled: false` kommt als `"false"` an), und `FmValue` kann `string[]` sein.

**Files:**
- Modify: `tools/sync-kit.sh` (Modul-Liste + `VENDOR.json`-Text)
- Create: `src/vendor/kit/frontmatter.ts` (durch das Skript erzeugt, nicht von Hand)
- Create: `src/core/skills/skill.ts`
- Test: `tests/skills_parse.test.ts`

**Interfaces:**
- Consumes: `parseFrontmatter` aus `../../vendor/kit/frontmatter`
- Produces: `interface Skill { name: string; description: string; enabled: boolean; body: string }`, `type ParseResult = { ok: true; skill: Skill } | { ok: false; name: string; reason: "no-description" }`, `function parseSkill(name: string, raw: string): ParseResult`

- [ ] **Step 1: Kit-Modul `frontmatter` vendoren**

In `tools/sync-kit.sh` die Modul-Schleife um `frontmatter` ergänzen:

```sh
for m in think-splitter reasoning endpoint endpoint_config endpoint_diagnostics settings i18n num timeout frontmatter; do
```

Im selben Skript den `VENDOR.json`-Text für `src/vendor/kit/` erweitern:

```sh
  "vendored": "think-splitter.ts, reasoning.ts, endpoint.ts, endpoint_config.ts, endpoint_diagnostics.ts, settings.ts, i18n.ts, num.ts, timeout.ts, frontmatter.ts",
```

Dann ausführen:

```bash
sh tools/sync-kit.sh
```

Erwartet: Zeile `vendored obsidian-kit@0.23.0/pure/frontmatter.ts` in der Ausgabe, Datei `src/vendor/kit/frontmatter.ts` existiert mit Vendor-Kopfzeile.

- [ ] **Step 2: Den fehlschlagenden Test schreiben**

`tests/skills_parse.test.ts`:

```ts
import { parseSkill } from "../src/core/skills/skill";

const RAW = `---
description: Wenn nach einem Projekt gefragt wird, zuerst die Hub-Notiz lesen
enabled: true
---

Projekte liegen unter 25_Coding/<name>/.
`;

describe("parseSkill", () => {
  it("liest description, enabled und Body", () => {
    const r = parseSkill("Projektnotizen", RAW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skill.name).toBe("Projektnotizen");
    expect(r.skill.description).toBe("Wenn nach einem Projekt gefragt wird, zuerst die Hub-Notiz lesen");
    expect(r.skill.enabled).toBe(true);
    expect(r.skill.body).toContain("25_Coding");
  });

  it("ohne enabled-Feld gilt der Skill als aktiv", () => {
    const r = parseSkill("X", "---\ndescription: tu was\n---\n\nBody\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skill.enabled).toBe(true);
  });

  // Kit-Typ-Asymmetrie: yaml_lite macht keine Typinferenz, `false` kommt als String an.
  it("enabled: false schaltet ab (String, nicht Boolean)", () => {
    const r = parseSkill("X", "---\ndescription: tu was\nenabled: false\n---\n\nBody\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skill.enabled).toBe(false);
  });

  it("Gross/Kleinschreibung und Leerraum bei enabled zaehlen nicht", () => {
    const r = parseSkill("X", "---\ndescription: tu was\nenabled:  FALSE \n---\n\nBody\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skill.enabled).toBe(false);
  });

  it("ohne Frontmatter: kein gueltiger Skill", () => {
    const r = parseSkill("X", "Nur Text, kein Frontmatter\n");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("no-description");
    expect(r.name).toBe("X");
  });

  it("leere description ist keine description", () => {
    const r = parseSkill("X", "---\ndescription:   \n---\n\nBody\n");
    expect(r.ok).toBe(false);
  });

  // FmValue kann string[] sein — eine Liste ist keine Beschreibung.
  it("description als Liste ist ungueltig", () => {
    const r = parseSkill("X", "---\ndescription: [a, b]\n---\n\nBody\n");
    expect(r.ok).toBe(false);
  });

  it("leerer Body ist erlaubt", () => {
    const r = parseSkill("X", "---\ndescription: tu was\n---\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skill.body).toBe("");
  });
});
```

- [ ] **Step 3: Test laufen lassen und Fehlschlag bestätigen**

Run: `npx vitest run tests/skills_parse.test.ts`
Expected: FAIL — `Failed to resolve import "../src/core/skills/skill"`

- [ ] **Step 4: Parser implementieren**

`src/core/skills/skill.ts`:

```ts
import { parseFrontmatter } from "../../vendor/kit/frontmatter";

/** Ein Skill: benannte Verhaltensanweisung aus <Koda-Ordner>/Skills/<name>.md.
 *  Der Name ist der Dateiname ohne .md — bewusst KEIN Frontmatter-Feld, damit es
 *  keine zweite Wahrheit ueber den Namen gibt. */
export interface Skill {
  name: string;
  description: string;
  enabled: boolean;
  body: string;
}

export type ParseResult =
  | { ok: true; skill: Skill }
  | { ok: false; name: string; reason: "no-description" };

/** `parseFrontmatter` (Kit) wirft nie und liefert IMMER Strings (dokumentierte
 *  Typ-Asymmetrie im Modul-Kopf): fehlt der ---Block, kommt data:{} + der ganze Text
 *  als Body zurueck, und `enabled: false` erreicht uns als "false". Deshalb gibt es
 *  hier genau einen Fehlergrund — eine fehlende Beschreibung. */
export function parseSkill(name: string, raw: string): ParseResult {
  const fm = parseFrontmatter(raw);
  const desc = fm.data["description"];
  if (typeof desc !== "string" || desc.trim() === "") {
    return { ok: false, name, reason: "no-description" };
  }
  const enabledRaw = fm.data["enabled"];
  const enabled = typeof enabledRaw === "string" ? enabledRaw.trim().toLowerCase() !== "false" : true;
  return { ok: true, skill: { name, description: desc.trim(), enabled, body: fm.body.trim() } };
}
```

- [ ] **Step 5: Tests laufen lassen und Erfolg bestätigen**

Run: `npx vitest run tests/skills_parse.test.ts`
Expected: PASS, 8 Tests

- [ ] **Step 6: Gate und Commit**

```bash
npm run gate
git add tools/sync-kit.sh src/vendor/kit/frontmatter.ts src/vendor/kit/VENDOR.json src/core/skills/skill.ts tests/skills_parse.test.ts
git commit -m "feat(skills): Skill-Format parsen (Kit-frontmatter vendored)"
```

---

### Task 2: Budget-Auswahl

Greedy nach Namen sortiert: wer noch ins Budget passt, kommt mit vollem Body in den Prompt, der Rest nur mit seiner `description`. Kein Alles-oder-nichts — sonst degradiert ein einziger fetter Skill alle anderen mit.

**Files:**
- Create: `src/core/skills/select.ts`
- Test: `tests/skills_select.test.ts`

**Interfaces:**
- Consumes: `Skill` aus `./skill` (Task 1)
- Produces: `interface Selection { loaded: Skill[]; descriptionOnly: Skill[]; disabled: string[] }`, `function selectSkills(skills: Skill[], budgetChars: number): Selection`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

`tests/skills_select.test.ts`:

```ts
import { selectSkills } from "../src/core/skills/select";
import type { Skill } from "../src/core/skills/skill";

const mk = (name: string, bodyLen: number, enabled = true): Skill => ({
  name,
  description: `desc-${name}`,
  enabled,
  body: "x".repeat(bodyLen),
});

describe("selectSkills", () => {
  it("alles unter Budget: alle voll geladen", () => {
    const s = selectSkills([mk("A", 100), mk("B", 100)], 1000);
    expect(s.loaded.map((k) => k.name)).toEqual(["A", "B"]);
    expect(s.descriptionOnly).toEqual([]);
    expect(s.disabled).toEqual([]);
  });

  it("Budget greift: der Rest kommt nur mit description", () => {
    const s = selectSkills([mk("A", 600), mk("B", 600)], 1000);
    expect(s.loaded.map((k) => k.name)).toEqual(["A"]);
    expect(s.descriptionOnly.map((k) => k.name)).toEqual(["B"]);
  });

  it("Reihenfolge ist stabil und haengt nicht an der Eingabe-Reihenfolge", () => {
    const a = selectSkills([mk("B", 600), mk("A", 600)], 1000);
    const b = selectSkills([mk("A", 600), mk("B", 600)], 1000);
    expect(a.loaded.map((k) => k.name)).toEqual(b.loaded.map((k) => k.name));
    expect(a.loaded.map((k) => k.name)).toEqual(["A"]);
  });

  // Greedy fuellt weiter: ein kleiner Skill nach einem zu grossen passt noch rein.
  it("nach einem zu grossen Skill wird weiter gefuellt", () => {
    const s = selectSkills([mk("A", 100), mk("B", 5000), mk("C", 100)], 1000);
    expect(s.loaded.map((k) => k.name)).toEqual(["A", "C"]);
    expect(s.descriptionOnly.map((k) => k.name)).toEqual(["B"]);
  });

  it("deaktivierte Skills tauchen nur in disabled auf", () => {
    const s = selectSkills([mk("A", 100), mk("B", 100, false)], 1000);
    expect(s.loaded.map((k) => k.name)).toEqual(["A"]);
    expect(s.descriptionOnly).toEqual([]);
    expect(s.disabled).toEqual(["B"]);
  });

  it("leere Liste ergibt leere Auswahl", () => {
    expect(selectSkills([], 1000)).toEqual({ loaded: [], descriptionOnly: [], disabled: [] });
  });

  it("ein einzelner Skill groesser als das Budget kommt nur als description", () => {
    const s = selectSkills([mk("A", 5000)], 1000);
    expect(s.loaded).toEqual([]);
    expect(s.descriptionOnly.map((k) => k.name)).toEqual(["A"]);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npx vitest run tests/skills_select.test.ts`
Expected: FAIL — `Failed to resolve import "../src/core/skills/select"`

- [ ] **Step 3: Auswahl implementieren**

`src/core/skills/select.ts`:

```ts
import type { Skill } from "./skill";

export interface Selection {
  /** voller Body im System-Prompt */
  loaded: Skill[];
  /** Budget erschoepft — nur die description im Prompt */
  descriptionOnly: Skill[];
  /** enabled: false — erscheint NIRGENDS im Prompt, nur in der Meldung */
  disabled: string[];
}

/** Greedy nach Namen sortiert. Die Sortierung ist willkuerlich, aber vorhersagbar und
 *  stabil — und genau das ist die Eigenschaft, die zaehlt: dieselben Dateien ergeben
 *  immer dieselbe Auswahl. Gezaehlt wird nur der Body; die description steht ohnehin
 *  fuer jeden Skill im Prompt, auch fuer die ausgelassenen. */
export function selectSkills(skills: Skill[], budgetChars: number): Selection {
  const sorted = [...skills].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const loaded: Skill[] = [];
  const descriptionOnly: Skill[] = [];
  const disabled: string[] = [];
  let used = 0;
  for (const s of sorted) {
    if (!s.enabled) {
      disabled.push(s.name);
      continue;
    }
    if (used + s.body.length <= budgetChars) {
      loaded.push(s);
      used += s.body.length;
    } else {
      descriptionOnly.push(s);
    }
  }
  return { loaded, descriptionOnly, disabled };
}
```

- [ ] **Step 4: Tests laufen lassen und Erfolg bestätigen**

Run: `npx vitest run tests/skills_select.test.ts`
Expected: PASS, 7 Tests

- [ ] **Step 5: Gate und Commit**

```bash
npm run gate
git add src/core/skills/select.ts tests/skills_select.test.ts
git commit -m "feat(skills): Budget-Auswahl (greedy, stabil sortiert)"
```

---

### Task 3: Budget als Einstellung

Der Wert steht bewusst in den Einstellungen statt als Code-Konstante: die Grenze wird dadurch sichtbar statt versteckt, und die Beschreibungszeile ist der Ort, an dem die Mechanik erklärt wird.

**Files:**
- Modify: `src/core/settings-types.ts`
- Modify: `src/obsidian/settings.ts:60-120` (Definitions-Array + Import-Block)
- Modify: `src/i18n/strings.ts` (beide Sprachen)
- Test: `tests/settings_types.test.ts`

**Interfaces:**
- Produces: `KodaSettings.skillBudgetChars: number`, Konstanten `SKILL_BUDGET_MIN = 1000`, `SKILL_BUDGET_MAX = 20000`, `SKILL_BUDGET_STEP = 500`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

An `tests/settings_types.test.ts` anhängen:

```ts
describe("skillBudgetChars", () => {
  it("hat einen Default von 6000", () => {
    expect(mergeKodaSettings({}).skillBudgetChars).toBe(6000);
  });
  it("wird nach unten geklemmt", () => {
    expect(mergeKodaSettings({ skillBudgetChars: 10 }).skillBudgetChars).toBe(SKILL_BUDGET_MIN);
  });
  it("wird nach oben geklemmt", () => {
    expect(mergeKodaSettings({ skillBudgetChars: 999999 }).skillBudgetChars).toBe(SKILL_BUDGET_MAX);
  });
  it("Muell faellt auf den Default zurueck", () => {
    expect(mergeKodaSettings({ skillBudgetChars: "viel" }).skillBudgetChars).toBe(6000);
  });
});
```

Den bestehenden Import in derselben Datei um die Konstanten erweitern:

```ts
import { mergeKodaSettings, SKILL_BUDGET_MIN, SKILL_BUDGET_MAX } from "../src/core/settings-types";
```

(Der bestehende Import kann weitere Namen enthalten — nur ergänzen, nichts entfernen.)

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npx vitest run tests/settings_types.test.ts`
Expected: FAIL — `SKILL_BUDGET_MIN` ist kein Export / `skillBudgetChars` ist `undefined`

- [ ] **Step 3: Setting einbauen**

In `src/core/settings-types.ts` nach dem `TIMEOUT_SEC_*`-Block ergänzen:

```ts
/** Spanne für `skillBudgetChars` — wie viele Zeichen Skill-Body höchstens in den
 *  System-Prompt wandern. Bewusst eine Einstellung und keine Konstante: die Grenze soll
 *  sichtbar sein, weil sie stillschweigend Verhalten weglässt. */
export const SKILL_BUDGET_MIN = 1000;
export const SKILL_BUDGET_MAX = 20000;
export const SKILL_BUDGET_STEP = 500;
```

In `interface KodaSettings` nach `timeoutSec: number;`:

```ts
  skillBudgetChars: number;
```

In `DEFAULT_SETTINGS` nach `timeoutSec: 300,`:

```ts
  skillBudgetChars: 6000,
```

In `mergeKodaSettings` im Rückgabe-Objekt nach der `timeoutSec`-Zeile:

```ts
    skillBudgetChars: clampInt(
      merged.skillBudgetChars, SKILL_BUDGET_MIN, SKILL_BUDGET_MAX, DEFAULT_SETTINGS.skillBudgetChars,
    ),
```

- [ ] **Step 4: Tests laufen lassen und Erfolg bestätigen**

Run: `npx vitest run tests/settings_types.test.ts`
Expected: PASS

- [ ] **Step 5: i18n-Strings ergänzen**

In `src/i18n/strings.ts`, `en`-Block:

```ts
    "settings.skillBudget": "Skill budget",
    "settings.skillBudget.desc": "How many characters of skill text go into the system prompt. Skills beyond the budget are still listed, but only with their description — Koda then knows they exist without being able to follow them.",
```

`de`-Block:

```ts
    "settings.skillBudget": "Skill-Budget",
    "settings.skillBudget.desc": "Wie viele Zeichen Skill-Text in den System-Prompt wandern. Skills jenseits des Budgets erscheinen weiterhin, aber nur mit ihrer Beschreibung — Koda weiß dann, dass es sie gibt, kann ihnen aber nicht folgen.",
```

- [ ] **Step 6: Slider in den Settings-Tab**

In `src/obsidian/settings.ts` den bestehenden Import aus `../core/settings-types` um die drei Konstanten erweitern:

```ts
  SKILL_BUDGET_MIN,
  SKILL_BUDGET_MAX,
  SKILL_BUDGET_STEP,
```

Im Definitions-Array direkt **nach** dem `settings.timeout`-Eintrag einfügen:

```ts
      {
        name: t("settings.skillBudget"),
        desc: t("settings.skillBudget.desc"),
        control: {
          type: "slider",
          key: "skillBudgetChars",
          min: SKILL_BUDGET_MIN,
          max: SKILL_BUDGET_MAX,
          step: SKILL_BUDGET_STEP,
        },
      },
```

- [ ] **Step 7: Gate und Commit**

```bash
npm run gate
git add src/core/settings-types.ts src/obsidian/settings.ts src/i18n/strings.ts tests/settings_types.test.ts
git commit -m "feat(skills): Skill-Budget als sichtbare Einstellung"
```

---

### Task 4: Skills im System-Prompt

`skills` ist **optional** — dadurch bleiben die bestehenden `buildSystemPrompt`-Tests unverändert grün.

**Files:**
- Modify: `src/core/memory/memory.ts`
- Test: `tests/memory.test.ts`

**Interfaces:**
- Consumes: `Selection` aus `../skills/select` (Task 2)
- Produces: `buildSystemPrompt(opts: { lang: "de" | "en"; memory: string; kodaFolder: string; skills?: Selection }): string`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

An `tests/memory.test.ts` im `describe("buildSystemPrompt")` anhängen:

```ts
  const sel = (loaded: string[], descOnly: string[] = []) => ({
    loaded: loaded.map((n) => ({ name: n, description: `desc-${n}`, enabled: true, body: `body-${n}` })),
    descriptionOnly: descOnly.map((n) => ({ name: n, description: `desc-${n}`, enabled: true, body: `body-${n}` })),
    disabled: [],
  });

  it("geladene Skills stehen mit Name, Beschreibung und Body im Prompt", () => {
    const p = buildSystemPrompt({ lang: "de", memory: "", kodaFolder: "Koda", skills: sel(["Alpha"]) });
    expect(p).toContain("## Skills");
    expect(p).toContain("Alpha");
    expect(p).toContain("desc-Alpha");
    expect(p).toContain("body-Alpha");
  });

  it("Budget-Skills stehen nur mit Beschreibung, ohne Body", () => {
    const p = buildSystemPrompt({ lang: "de", memory: "", kodaFolder: "Koda", skills: sel([], ["Beta"]) });
    expect(p).toContain("desc-Beta");
    expect(p).not.toContain("body-Beta");
  });

  it("ohne Skills kein leerer Skills-Block", () => {
    const p = buildSystemPrompt({ lang: "de", memory: "", kodaFolder: "Koda", skills: sel([]) });
    expect(p).not.toContain("## Skills");
  });

  it("Memory steht vor den Skills", () => {
    const p = buildSystemPrompt({ lang: "de", memory: "- Fakt", kodaFolder: "Koda", skills: sel(["Alpha"]) });
    expect(p.indexOf("## Memory")).toBeLessThan(p.indexOf("## Skills"));
  });

  it("weist auf Widersprueche hin, statt sie still aufzuloesen", () => {
    const p = buildSystemPrompt({ lang: "de", memory: "", kodaFolder: "Koda" });
    expect(p.toLowerCase()).toContain("conflict");
  });
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npx vitest run tests/memory.test.ts`
Expected: FAIL — die neuen Erwartungen schlagen fehl (kein `## Skills`, kein `conflict`)

- [ ] **Step 3: `buildSystemPrompt` erweitern**

In `src/core/memory/memory.ts` den Import ergänzen:

```ts
import type { Selection } from "../skills/select";
```

Signatur und Rumpf ersetzen:

```ts
export function buildSystemPrompt(opts: {
  lang: "de" | "en";
  memory: string;
  kodaFolder: string;
  skills?: Selection;
}): string {
  const folder = opts.kodaFolder.replace(/\/+$/, "");
  const parts = [
    "You are Koda, a friendly companion living inside the user's personal knowledge vault.",
    `Always answer in ${LANGUAGE_NAME[opts.lang]}.`,
    "Use the provided tools to search and read notes BEFORE answering questions about the vault; cite notes as [[wikilinks]] (path without .md).",
    `You may write freely inside the folder "${folder}/". Writing anywhere else asks the user for approval — a rejection is an answer, respect it.`,
    "Use save_memory only for durable facts, preferences, or corrections — never for conversation details.",
    "If a tool fails, read the error, adjust, and try a different way. Never invent note contents.",
    // Kein Prioritaetssystem: bei 2-10 handgeschriebenen Skills waere jede
    // Aufloesungsregel im Code Overengineering — und eine still getroffene Wahl
    // waere fuer den Nutzer unsichtbar.
    "If two instructions conflict — two skills, or a skill and your memory — say so instead of silently picking one.",
  ];
  if (opts.memory.trim() !== "") {
    parts.push(`## Memory\n${opts.memory.trim()}`);
  }
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

- [ ] **Step 4: Tests laufen lassen und Erfolg bestätigen**

Run: `npx vitest run tests/memory.test.ts`
Expected: PASS — die vorhandenen Tests bleiben grün, weil `skills` optional ist

- [ ] **Step 5: Gate und Commit**

```bash
npm run gate
git add src/core/memory/memory.ts tests/memory.test.ts
git commit -m "feat(skills): Skills im System-Prompt, Widerspruch wird gemeldet statt aufgeloest"
```

---

### Task 5: Skills laden und im Chat anzeigen (Phase 1 abgeschlossen)

Die Obsidian-Seite: Dateien lesen, durch Parser und Auswahl schicken, Prompt füttern, Ladezustand anzeigen. Die Anzeige läuft über einen **eigenen Slot oberhalb des Verlaufs**, nicht über `lastNotice` — das ist ein einziger Slot, den jeder Fehler im selben Turn überschreibt; die Skill-Zeile wäre damit genau dann unsichtbar, wenn etwas schiefgeht.

Nach dieser Task ist Phase 1 fertig: Skills von Hand in `<Koda-Ordner>/Skills/` legen wirkt sofort.

**Files:**
- Modify: `src/main.ts` (Import-Block, neues Feld neben `lastNotice`, `ask()` ~Zeile 140–150, `newChat()`, neue Methoden nach `readMemory()`)
- Modify: `src/obsidian/view.ts:77-83` (`renderLog`)
- Modify: `src/i18n/strings.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `parseSkill` (Task 1), `selectSkills`/`Selection` (Task 2), `settings.skillBudgetChars` (Task 3), `buildSystemPrompt(..., skills)` (Task 4)
- Produces: `KodaPlugin.skillNotice: string | null`

- [ ] **Step 1: Loader-Methode in `main.ts`**

Import-Block ergänzen:

```ts
import { parseSkill, type Skill } from "./core/skills/skill";
import { selectSkills, type Selection } from "./core/skills/select";
```

Nach der bestehenden Methode `readMemory()` einfügen:

```ts
  /** Liest <Koda-Ordner>/Skills/*.md — flach, Unterordner werden ignoriert.
   *  Der Vergleich ist case-insensitiv wie in `writePolicy`, damit ein Ordner
   *  "koda/skills" dieselbe Wirkung hat wie "Koda/Skills". */
  private async readSkills(): Promise<{ selection: Selection; failed: string[] }> {
    const dir = `${this.settings.kodaFolder.replace(/\/+$/, "")}/Skills`;
    const prefix = `${dir.toLowerCase()}/`;
    const skills: Skill[] = [];
    const failed: string[] = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!f.path.toLowerCase().startsWith(prefix)) continue;
      const rel = f.path.slice(dir.length + 1);
      if (rel.includes("/")) continue; // flach: keine Unterordner
      const name = rel.replace(/\.md$/i, "");
      const raw = await this.app.vault.cachedRead(f).catch(() => null);
      if (raw === null) { failed.push(name); continue; }
      const r = parseSkill(name, raw);
      if (r.ok) skills.push(r.skill);
      else failed.push(r.name);
    }
    return { selection: selectSkills(skills, this.settings.skillBudgetChars), failed };
  }
```

- [ ] **Step 2: Ladezustand-Text bauen**

Ebenfalls in `main.ts`, direkt darunter:

```ts
  private skillStatusText(sel: Selection, failed: string[]): string | null {
    const lines: string[] = [];
    if (sel.loaded.length > 0) lines.push(t("skills.active", sel.loaded.map((s) => s.name).join(", ")));
    if (sel.descriptionOnly.length > 0) {
      lines.push(t("skills.budget", sel.descriptionOnly.map((s) => s.name).join(", ")));
    }
    if (failed.length > 0) lines.push(t("skills.failed", failed.join(", ")));
    return lines.length === 0 ? null : lines.join("\n");
  }
```

Und das Feld zur Klasse, direkt neben `lastNotice` (dort steht bereits ein erklärender Kommentar zu dessen Redraw-Verhalten):

```ts
  /** Ladezustand der Skills — eigener Slot NEBEN lastNotice und oberhalb des Verlaufs
   *  gezeichnet. Ueber lastNotice zu laufen hiesse, dass jeder Fehler im selben Turn
   *  die Zeile ueberschreibt: sie waere genau dann weg, wenn etwas schiefgeht. */
  skillNotice: string | null = null;
```

- [ ] **Step 3: In `ask()` verdrahten**

In `ask()` den Block um `const memory = await this.readMemory();` ersetzen durch:

```ts
      const memory = await this.readMemory();
      const { selection, failed } = await this.readSkills();
      this.skillNotice = this.skillStatusText(selection, failed);
      const lang = s.language === "auto" ? pickLang(safeGetLanguage()) : s.language;
      const system: ChatMessage = {
        role: "system",
        content: buildSystemPrompt({ lang, memory, kodaFolder: s.kodaFolder, skills: selection }),
      };
```

In `newChat()` den Slot mit zurücksetzen — neben `this.lastNotice = null;`:

```ts
    this.skillNotice = null;
```

- [ ] **Step 4: In `view.ts` zeichnen**

In `renderLog()` direkt nach `this.mdComp = this.addChild(new Component());` einfügen:

```ts
    if (this.plugin.skillNotice !== null) {
      this.logEl.createDiv({ cls: "koda-msg koda-notice koda-skills", text: this.plugin.skillNotice });
    }
```

- [ ] **Step 5: i18n und CSS**

In `src/i18n/strings.ts`, `en`-Block:

```ts
    "skills.active": "⚙ Skills active: {0}",
    "skills.budget": "⚙ Description only (budget exhausted): {0}",
    "skills.failed": "⚠ Skipped, no description in frontmatter: {0}",
```

`de`-Block:

```ts
    "skills.active": "⚙ Skills aktiv: {0}",
    "skills.budget": "⚙ Nur als Beschreibung (Budget erschöpft): {0}",
    "skills.failed": "⚠ Übersprungen, keine description im Frontmatter: {0}",
```

In `styles.css` nach der `.koda-notice`-Zeile:

```css
.koda-skills { font-size: var(--font-ui-smaller); border-bottom: 1px solid var(--background-modifier-border); padding-bottom: var(--size-4-1); margin-bottom: var(--size-4-2); }
```

- [ ] **Step 6: Manuell gegen ein echtes Vault prüfen**

```bash
npm run build
```

Dann im Test-Vault anlegen: `Koda/Skills/Testskill.md` mit

```markdown
---
description: Antworte immer mit einem Ausrufezeichen am Ende
---

Hänge an jede Antwort ein "!" an.
```

Obsidian neu laden, Koda öffnen, etwas fragen. Erwartet: Zeile `⚙ Skills aktiv: Testskill` oben im Verlauf, und die Antwort folgt der Anweisung. Dann `enabled: false` ins Frontmatter — erwartet: die Zeile verschwindet.

- [ ] **Step 7: Gate und Commit**

```bash
npm run gate
git add src/main.ts src/obsidian/view.ts src/i18n/strings.ts styles.css
git commit -m "feat(skills): Skills laden und Ladezustand im Chat zeigen"
```

---

### Task 6: Vertrauensgrenze — `writePolicy` bekommt eine zweite Achse

Der tragende Punkt: die Grenze sitzt in der **Policy**, nicht im Tool. Läge sie in `write_skill`, wäre sie über ein gewöhnliches `write_note` nach `Koda/Skills/…` umgehbar.

Die Präfix-Falle ist real und muss gepinnt werden: `"koda/skillset.md".startsWith("koda/skills")` ist `true`. Nur der Vergleich mit angehängtem `/` trennt richtig.

**Files:**
- Modify: `src/core/tools/write-policy.ts`
- Test: `tests/write_policy.test.ts`

**Interfaces:**
- Produces: unveränderte Signatur `writePolicy(path: string, kodaFolder: string): "free" | "confirm"`, neuer Export `SKILLS_SUBFOLDER = "Skills"`, neues Verhalten für `<kodaFolder>/Skills/**`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

An `tests/write_policy.test.ts` anhängen:

```ts
describe("writePolicy — Skills sind trotz Lage bestaetigungspflichtig", () => {
  it("Skill im Koda-Ordner braucht Bestaetigung", () => {
    expect(writePolicy("Koda/Skills/Projektnotizen.md", "Koda")).toBe("confirm");
  });
  it("Gross/klein zaehlt auch hier nicht", () => {
    expect(writePolicy("koda/skills/x.md", "Koda")).toBe("confirm");
  });
  it("der Skills-Ordner selbst zaehlt mit", () => {
    expect(writePolicy("Koda/Skills", "Koda")).toBe("confirm");
  });
  it("tiefere Ebenen unter Skills/ ebenfalls", () => {
    expect(writePolicy("Koda/Skills/alt/x.md", "Koda")).toBe("confirm");
  });
  // Praefix-Falle: "koda/skillset.md".startsWith("koda/skills") ist true.
  it("Praefix-Kollision ist KEIN Skill (Skillset.md vs Skills/)", () => {
    expect(writePolicy("Koda/Skillset.md", "Koda")).toBe("free");
  });
  it("Entwuerfe bleiben frei", () => {
    expect(writePolicy("Koda/Entwürfe/idee.md", "Koda")).toBe("free");
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npx vitest run tests/write_policy.test.ts`
Expected: FAIL — die vier `confirm`-Erwartungen liefern `"free"`

- [ ] **Step 3: Zweite Achse einbauen**

`src/core/tools/write-policy.ts` vollständig ersetzen:

```ts
import { normalizeRel } from "./path-guard";

export type WriteDecision = "free" | "confirm";

/** Unterordner des Koda-Ordners, in dem Skills liegen. */
export const SKILLS_SUBFOLDER = "Skills";

/** Schreibregel: im Koda-Ordner frei, sonst Bestaetigung — MIT EINER AUSNAHME.
 *
 *  Der raeumliche Freibrief kodiert "das ist Kodas eigener Kram, dein Vault bleibt
 *  unberuehrt". Ein Skill ist aber kein eigener Kram: er aendert, was das Werkzeug
 *  kuenftig tut. Deshalb entscheidet hier nicht nur WO geschrieben wird, sondern WAS.
 *
 *  Die Grenze sitzt bewusst in der Policy und nicht im write_skill-Tool — sonst waere
 *  sie ueber ein gewoehnliches write_note nach <Koda>/Skills/... umgehbar.
 *
 *  Vergleich case-insensitiv und segment-genau: "Koda-Archiv" matcht "Koda" nicht,
 *  "Skillset.md" matcht "Skills/" nicht. */
export function writePolicy(path: string, kodaFolder: string): WriteDecision {
  const p = normalizeRel(path).toLowerCase();
  const folder = normalizeRel(kodaFolder).toLowerCase();
  if (folder === "") return "confirm";
  const inKoda = p === folder || p.startsWith(folder + "/");
  if (!inKoda) return "confirm";
  const skills = `${folder}/${SKILLS_SUBFOLDER.toLowerCase()}`;
  return p === skills || p.startsWith(skills + "/") ? "confirm" : "free";
}
```

- [ ] **Step 4: Tests laufen lassen und Erfolg bestätigen**

Run: `npx vitest run tests/write_policy.test.ts`
Expected: PASS — die bestehenden Tests bleiben grün

- [ ] **Step 5: Gate und Commit**

```bash
npm run gate
git add src/core/tools/write-policy.ts tests/write_policy.test.ts
git commit -m "feat(skills): Wirkung schlaegt Ort — Skills sind immer bestaetigungspflichtig"
```

---

### Task 7: `write_skill`

Pfad und Frontmatter baut das **Plugin**, nicht das Modell — damit fällt eine ganze Fehlerklasse weg (Traversal, vergessenes `.md`, kaputtes YAML). Kein `append`: an Verhaltensanweisungen anzuhängen produziert Widerspruchsmengen statt Skills.

**Files:**
- Create: `src/core/skills/path.ts`
- Modify: `src/core/tools/defs.ts`
- Modify: `src/obsidian/vault-tools.ts` (Import-Block, `WriteRequest`, `run()`-switch, neue Methode)
- Test: `tests/skills_path.test.ts`
- Test: `tests/vault_tools.test.ts`

**Interfaces:**
- Consumes: `writePolicy`/`SKILLS_SUBFOLDER` (Task 6), `serializeFrontmatter` aus `../vendor/kit/frontmatter` (Task 1)
- Produces: `sanitizeSkillName(raw: string): string`, `skillPath(kodaFolder: string, name: string): string`, Tool `write_skill` in `TOOL_DEFS`, `WriteRequest.effect?: string`

- [ ] **Step 1: Den fehlschlagenden Pfad-Test schreiben**

`tests/skills_path.test.ts`:

```ts
import { sanitizeSkillName, skillPath } from "../src/core/skills/path";

describe("sanitizeSkillName", () => {
  it("laesst einen normalen Namen unveraendert", () => {
    expect(sanitizeSkillName("Projektnotizen")).toBe("Projektnotizen");
  });
  it("entfernt Pfadtrenner und Obsidian-verbotene Zeichen", () => {
    expect(sanitizeSkillName("a/b\\c:d*e?f\"g<h>i|j#k^l[m]n")).toBe("abcdefghijklmn");
  });
  it("streift eine angehaengte .md-Endung", () => {
    expect(sanitizeSkillName("Projektnotizen.md")).toBe("Projektnotizen");
  });
  it("kollabiert Leerraum und trimmt", () => {
    expect(sanitizeSkillName("  Mein   Skill  ")).toBe("Mein Skill");
  });
  it("ein Name aus lauter verbotenen Zeichen wird leer", () => {
    expect(sanitizeSkillName("///")).toBe("");
  });
});

describe("skillPath", () => {
  it("baut den Pfad unter dem Koda-Ordner", () => {
    expect(skillPath("Koda", "Projektnotizen")).toBe("Koda/Skills/Projektnotizen.md");
  });
  it("ein Slash-Suffix am Ordner aendert nichts", () => {
    expect(skillPath("Koda/", "X")).toBe("Koda/Skills/X.md");
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npx vitest run tests/skills_path.test.ts`
Expected: FAIL — `Failed to resolve import "../src/core/skills/path"`

- [ ] **Step 3: Pfad-Modul implementieren**

`src/core/skills/path.ts`:

```ts
import { SKILLS_SUBFOLDER } from "../tools/write-policy";

// Pfadtrenner plus die von Obsidian in Dateinamen verbotenen Zeichen, plus Steuerzeichen.
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\\/:*?"<>|#^[\]]|[\u0000-\u001f]/g;

/** Baut aus einem frei gewaehlten Skill-Namen einen dateisystem-tauglichen. Ein danach
 *  leerer Name ist ein Tool-Fehler, kein Fallback-Fall — geraten wird hier nichts. */
export function sanitizeSkillName(raw: string): string {
  return raw.replace(/\.md$/i, "").replace(FORBIDDEN, "").replace(/\s+/g, " ").trim();
}

/** Den Pfad baut das Plugin, nicht das Modell: kein Traversal, kein vergessenes .md,
 *  keine Ordner-Verirrung. */
export function skillPath(kodaFolder: string, name: string): string {
  return `${kodaFolder.replace(/\/+$/, "")}/${SKILLS_SUBFOLDER}/${name}.md`;
}
```

- [ ] **Step 4: Pfad-Tests laufen lassen**

Run: `npx vitest run tests/skills_path.test.ts`
Expected: PASS, 7 Tests

- [ ] **Step 5: Den fehlschlagenden Tool-Test schreiben**

An `tests/vault_tools.test.ts` anhängen. **Vorher prüfen**, wie die Datei ihre Fakes aufbaut: falls es noch keine `makeTools`-Hilfe gibt, zuerst eine anlegen, die den vorhandenen Aufbau spiegelt und `{ tools, vault, confirms }` zurückgibt (`vault.files` als `Map<string, string>`, `confirms` sammelt die `WriteRequest`-Objekte, `confirmAnswer` steuert die Antwort des Confirm-Ports, `kodaFolder` ist `"Koda"`). Die bestehenden Tests dabei unverändert lassen.

```ts
describe("write_skill", () => {
  it("schreibt einen Skill mit wohlgeformtem Frontmatter nach Skills/", async () => {
    const { tools, vault, confirms } = makeTools({ confirmAnswer: true });
    const r = await tools.run("write_skill", {
      name: "Projektnotizen",
      description: "Zuerst die Hub-Notiz lesen",
      body: "Projekte liegen unter 25_Coding/.",
      mode: "create",
    });
    expect(r.ok).toBe(true);
    const written = vault.files.get("Koda/Skills/Projektnotizen.md") ?? "";
    expect(written.startsWith("---\ndescription: Zuerst die Hub-Notiz lesen\nenabled: true\n---\n")).toBe(true);
    expect(written).toContain("Projekte liegen unter 25_Coding/.");
    expect(confirms.length).toBe(1);
  });

  it("fragt IMMER nach, obwohl der Pfad im Koda-Ordner liegt", async () => {
    const { tools, confirms } = makeTools({ confirmAnswer: true });
    await tools.run("write_skill", { name: "X", description: "d", body: "b", mode: "create" });
    expect(confirms.length).toBe(1);
    expect(confirms[0].path).toBe("Koda/Skills/X.md");
  });

  it("reicht die description als effect ans Modal durch", async () => {
    const { tools, confirms } = makeTools({ confirmAnswer: true });
    await tools.run("write_skill", { name: "X", description: "Antworte kurz", body: "b", mode: "create" });
    expect(confirms[0].effect).toBe("Antworte kurz");
  });

  it("Ablehnung schreibt nichts und meldet es zurueck", async () => {
    const { tools, vault } = makeTools({ confirmAnswer: false });
    const r = await tools.run("write_skill", { name: "X", description: "d", body: "b", mode: "create" });
    expect(r.ok).toBe(false);
    expect(vault.files.has("Koda/Skills/X.md")).toBe(false);
  });

  it("leerer Name nach Sanitizing ist ein Fehler", async () => {
    const { tools } = makeTools({ confirmAnswer: true });
    const r = await tools.run("write_skill", { name: "///", description: "d", body: "b", mode: "create" });
    expect(r.ok).toBe(false);
  });

  it("fehlende description ist ein Fehler", async () => {
    const { tools } = makeTools({ confirmAnswer: true });
    const r = await tools.run("write_skill", { name: "X", description: "  ", body: "b", mode: "create" });
    expect(r.ok).toBe(false);
  });

  it("append gibt es nicht", async () => {
    const { tools } = makeTools({ confirmAnswer: true });
    const r = await tools.run("write_skill", { name: "X", description: "d", body: "b", mode: "append" });
    expect(r.ok).toBe(false);
  });

  it("create auf einen bestehenden Skill schlaegt fehl", async () => {
    const { tools, vault } = makeTools({ confirmAnswer: true });
    vault.files.set("Koda/Skills/X.md", "alt");
    const r = await tools.run("write_skill", { name: "X", description: "d", body: "b", mode: "create" });
    expect(r.ok).toBe(false);
  });

  it("replace auf einen fehlenden Skill schlaegt fehl", async () => {
    const { tools } = makeTools({ confirmAnswer: true });
    const r = await tools.run("write_skill", { name: "X", description: "d", body: "b", mode: "replace" });
    expect(r.ok).toBe(false);
  });

  // Die Invariante aus der MVP-Spec gilt unveraendert auch hier.
  it("Vorschau ist byte-genau der geschriebene Inhalt", async () => {
    const { tools, vault, confirms } = makeTools({ confirmAnswer: true });
    await tools.run("write_skill", { name: "X", description: "d", body: "b", mode: "create" });
    expect(confirms[0].newText).toBe(vault.files.get("Koda/Skills/X.md"));
  });
});
```

- [ ] **Step 6: Tool-Test laufen lassen und Fehlschlag bestätigen**

Run: `npx vitest run tests/vault_tools.test.ts`
Expected: FAIL — `unbekanntes Tool: write_skill`

- [ ] **Step 7: `WriteRequest` um `effect` erweitern**

In `src/obsidian/vault-tools.ts`:

```ts
export interface WriteRequest {
  path: string;
  mode: "create" | "append" | "replace";
  oldText: string;
  newText: string;
  /** Klartext, was sich kuenftig aendert — nur bei Skills gesetzt. Additiv: das Modal
   *  zeigt ihn ZUSAETZLICH zur vollstaendigen Vorschau, nie an ihrer Stelle. */
  effect?: string;
}
```

- [ ] **Step 8: `write_skill` in `VaultTools`**

Import-Block ergänzen (`writePolicy` ist bereits importiert):

```ts
import { serializeFrontmatter } from "../vendor/kit/frontmatter";
import { sanitizeSkillName, skillPath } from "../core/skills/path";
```

Im `switch` in `run()` vor `default:`:

```ts
        case "write_skill":
          return await this.writeSkill(str(a.name), str(a.description), str(a.body), str(a.mode));
```

Neue Methode nach `write()`:

```ts
  /** Skills schreibt das Plugin, nicht das Modell: Pfad und Frontmatter entstehen hier,
   *  damit sie strukturell nicht kaputt sein koennen. Kein append — an Verhaltens-
   *  anweisungen anzuhaengen produziert Widerspruchsmengen statt Skills. */
  private async writeSkill(name: string, description: string, body: string, mode: string): Promise<ToolOutcome> {
    if (mode !== "create" && mode !== "replace") {
      return { ok: false, error: `mode muss create|replace sein, war: "${mode}"` };
    }
    const clean = sanitizeSkillName(name);
    if (clean === "") return { ok: false, error: "name fehlt oder besteht nur aus unerlaubten Zeichen" };
    const desc = description.trim().replace(/\s*\n\s*/g, " ");
    if (desc === "") return { ok: false, error: "description fehlt — sie erklaert dem Nutzer, was sich kuenftig aendert" };

    const path = skillPath(this.opts.kodaFolder(), clean);
    const exists = await this.vault.exists(path);
    if (mode === "create" && exists) return { ok: false, error: `Skill existiert schon: "${clean}" — nutze replace` };
    if (mode === "replace" && !exists) return { ok: false, error: `Skill nicht gefunden: "${clean}" — nutze create` };

    const content = `${serializeFrontmatter({ description: desc, enabled: "true" }, ["description", "enabled"])}\n${body.trim()}\n`;

    // Die Policy wird gefragt, obwohl die Antwort hier feststeht: die Grenze gehoert
    // an EINE Stelle, und diese Zeile bricht auffaellig, wenn sie dort je wegfaellt.
    if (writePolicy(path, this.opts.kodaFolder()) === "confirm") {
      const oldText = exists ? await this.vault.read(path) : "";
      const approved = await this.confirm({ path, mode, oldText, newText: content, effect: desc });
      if (!approved) return { ok: false, error: "vom Nutzer abgelehnt" };
    }

    if (mode === "create") await this.vault.create(path, content);
    else await this.vault.overwrite(path, content);
    return { ok: true, content: `Skill geschrieben: ${path}` };
  }
```

- [ ] **Step 9: Tool-Definition ergänzen**

In `src/core/tools/defs.ts` ans Ende von `TOOL_DEFS`:

```ts
  {
    name: "write_skill",
    description:
      "Create or replace one of your own skills — a named Markdown instruction that changes how you behave in future conversations. Always requires the user's approval, even though skills live in the Koda folder. Use this when the user teaches you a rule that should keep applying; use save_memory for facts instead.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short skill name, becomes the file name" },
        description: {
          type: "string",
          description: "One sentence describing what will be different from now on. Shown to the user for approval.",
        },
        body: { type: "string", description: "The instruction itself, in Markdown" },
        mode: {
          type: "string",
          enum: ["create", "replace"],
          description: "Required. 'create' for a new skill (fails if it exists), 'replace' to overwrite an existing one entirely.",
        },
      },
      required: ["name", "description", "body", "mode"],
    },
  },
```

- [ ] **Step 10: Tests laufen lassen und Erfolg bestätigen**

Run: `npx vitest run tests/vault_tools.test.ts tests/skills_path.test.ts`
Expected: PASS

- [ ] **Step 11: Gate und Commit**

```bash
npm run gate
git add src/core/skills/path.ts src/core/tools/defs.ts src/obsidian/vault-tools.ts tests/skills_path.test.ts tests/vault_tools.test.ts
git commit -m "feat(skills): write_skill — Pfad und Frontmatter baut das Plugin"
```

---

### Task 8: Wirkungszeile im Bestätigungs-Modal

Additiv: die Zeile steht **über** der Vorschau, der volle Dateiinhalt bzw. Diff darunter bleibt unangetastet. Sie ist Kodas eigene Behauptung über seinen Text — das Vollständige darunter ist das, woran man sie prüft.

**Files:**
- Modify: `src/obsidian/confirm-write.ts:18-22`
- Modify: `src/i18n/strings.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `WriteRequest.effect` (Task 7)

- [ ] **Step 1: Zeile im Modal zeichnen**

In `src/obsidian/confirm-write.ts` in `onOpen()`, direkt **nach** `this.titleEl.setText(...)` und **vor** `const box = ...`:

```ts
        // Additiv, nie ersetzend: die vollstaendige Vorschau darunter bleibt die
        // Grundlage der Freigabe (Invariante "Vorschau == geschriebener Inhalt").
        if (req.effect !== undefined && req.effect !== "") {
          const eff = this.contentEl.createDiv({ cls: "koda-effect" });
          eff.createEl("strong", { text: t("confirm.effect") });
          eff.createSpan({ text: ` ${req.effect}` });
        }
```

- [ ] **Step 2: i18n ergänzen**

`en`-Block:

```ts
    "confirm.effect": "From now on:",
```

`de`-Block:

```ts
    "confirm.effect": "Künftig:",
```

- [ ] **Step 3: CSS ergänzen**

In `styles.css` bei den `.koda-preview`-Regeln:

```css
.koda-effect { background: var(--background-modifier-hover); border-left: 3px solid var(--interactive-accent); border-radius: var(--radius-s); padding: var(--size-4-2); margin-bottom: var(--size-4-2); }
```

- [ ] **Step 4: Manuell im laufenden Obsidian prüfen**

```bash
npm run build
```

Obsidian neu laden, Koda bitten: *„Merk dir als Skill: antworte mir immer in Stichpunkten."* Erwartet: Modal mit der Zeile **Künftig: …**, darunter der vollständige Dateiinhalt inklusive Frontmatter. Ablehnen → Koda meldet die Ablehnung. Erneut bestätigen → Datei liegt unter `Koda/Skills/`, und der nächste Gesprächsstart zeigt sie in der `⚙ Skills aktiv`-Zeile.

- [ ] **Step 5: Gate und Commit**

```bash
npm run gate
git add src/obsidian/confirm-write.ts src/i18n/strings.ts styles.css
git commit -m "feat(skills): Modal zeigt, was kuenftig anders laeuft"
```

---

### Task 9: Dokumentation nachziehen

**Files:**
- Modify: `README.md`
- Modify: `docs/SMOKE.md`
- Modify: `CLAUDE.md`
- Modify: `../REGISTRY.md` (Dach-Repo, eigener Commit)

- [ ] **Step 1: README um den Skills-Abschnitt ergänzen**

Nach dem Abschnitt zur Memory-Notiz einfügen:

```markdown
## Skills

Ein Skill ist eine Markdown-Notiz in `<Koda-Ordner>/Skills/`, die Kodas Verhalten
steuert. Du schreibst sie selbst — oder lässt Koda sie schreiben, was immer eine
Bestätigung erfordert.

```markdown
---
description: Antworte immer mit einem Ausrufezeichen am Ende
enabled: true
---

Hänge an jede Antwort ein "!" an.
```

- Der **Name ist der Dateiname** ohne `.md`.
- `description` ist Pflicht — sie erklärt in einem Satz, was anders läuft, und ist
  das, was du im Bestätigungs-Modal zu sehen bekommst.
- `enabled: false` schaltet einen Skill ab, ohne ihn zu löschen.
- Unterordner werden nicht gelesen.

Beim Gesprächsstart wandern alle aktiven Skills in Kodas System-Prompt. Wie viel
Text dabei höchstens hineingeht, steuert **Skill-Budget** in den Einstellungen
(Default 6000 Zeichen); was nicht mehr hineinpasst, erscheint nur mit seiner
Beschreibung — Koda weiß dann, dass es den Skill gibt, kann ihm aber nicht folgen.
Welche Skills gerade wirken, steht am Kopf des Gesprächs.

**Skills sind immer bestätigungspflichtig**, auch wenn sie im Koda-Ordner liegen, in
dem Koda sonst frei schreiben darf. Der Grund: ein Skill ist kein Entwurf, er ändert,
was Koda künftig tut.
```

- [ ] **Step 2: `docs/SMOKE.md` um zwei Prüfpunkte ergänzen**

- „Skill von Hand anlegen → `⚙ Skills aktiv` erscheint beim nächsten Gesprächsstart, Antwort folgt der Anweisung"
- „Koda einen Skill schreiben lassen → Modal zeigt `Künftig:` plus vollständigen Inhalt; Ablehnung schreibt nichts"

- [ ] **Step 3: `CLAUDE.md` aktualisieren**

Im Abschnitt „Nächster Schritt": Baustein A als erledigt markieren, verbleibend Baustein B (Compaction, braucht Lücke 2+3 aus `docs/NEXT-SESSION.md`) und C (Aufräum-Assistent). Im Struktur-Kurzüberblick `src/core/skills/` ergänzen.

- [ ] **Step 4: Gate und Commit**

```bash
npm run gate
git add README.md docs/SMOKE.md CLAUDE.md
git commit -m "docs(skills): Skill-System dokumentiert"
```

- [ ] **Step 5: Registry-Eintrag im Dach (eigenständiges Repo, PROF-OBS-09)**

In `../REGISTRY.md` ergänzen (Kit-first-Regel Punkt 2): *„Markdown-Skill-System für einen Agenten (Frontmatter-`description` + `enabled`, Budget-Auswahl, Selbst-Autorschaft mit Bestätigung) → `koda-agent/src/core/skills/` — Muster-Referenz, erstes Exemplar."*

```bash
git -C .. add REGISTRY.md && git -C .. commit -m "docs(registry): Markdown-Skill-System (koda-agent)"
```
