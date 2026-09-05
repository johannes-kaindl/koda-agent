# Arbeitskontext Etappe 2b — Volltext-Quellen, Budget und Quellen-Chips (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Koda bekommt die drei lokalen Volltext-Quellen des Arbeitskontexts — Modus *Notiz* (aktive Notiz plus Links und Backlinks bis Tiefe n), Modus *Alle Tabs*, und quer dazu *Manuell* (Aktive Notiz, Notiz-Picker, Ordner-Picker) — jede budgetiert, mit sichtbarer Kürzung, als Chips im Kontext-Tab abwählbar und als Quellen-Chips unter der Antwort nachlesbar. Dazu liest `read_note` ab jetzt auch `.base` und `.canvas`.

**Architecture:** Die Volltext-Kette ist eine reine Pipeline über vier Module: `candidates.ts` (Modus + Snapshot + Links → Pfadliste mit Quelle und Ebene) → Abwahl-Filter → `content`-Port (lesen) → `select.ts` (Budget) → `render.ts` (Block + `items`). `build.ts` komponiert sie und ist die **einzige** Stelle, an der ein Volltext-Block entsteht. Weil dabei Dateien gelesen werden, wird `currentContext()` **asynchron** — und mit ihm das Panel-ViewModel; verspätete Renderings fängt ein Generationszähler ab (übernommen aus vault-rag).

**Tech Stack:** TypeScript · esbuild · vitest + Obsidian-Mock aus `obsidian-kit@0.31.0` · vendortes `obsidian-kit@0.27.0` · CDP-GUI-Smoke.

**Spec:** `docs/superpowers/specs/2026-09-02-koda-arbeitskontext-design.md` — maßgeblich sind § E1 (Modus-Tabelle), § E3 (Ports, Module `candidates`/`select`/`render`), § E6 „Etappe 2 (Hub)", § E8 (Einstellungen), § E9 Punkt 4 und 5, § Etappen Zeile 2, § Prüfen.

**Vorgänger:** `docs/superpowers/plans/2026-09-05-koda-arbeitskontext-etappe-2a-hub.md` (Hub-Gerüst, Kontext-Tab, Chips, Abwahl-Zustand). Alles, was dieser Plan „bereits vorhanden" nennt, stammt von dort.

## Global Constraints

- **`src/core/**` ist obsidian-frei** — `npm run check:pure` erzwingt es. Die neuen Module nehmen Ports entgegen, nie `App`.
- **Kit-first:** Der Notiz-Picker wird **übernommen** aus `vault-rag/src/note_picker.ts` mit Herkunftsstempel in Zeile 1 (`// uebernommen aus vault-rag/src/note_picker.ts, 2026-09-05`) — nicht neu gebaut. Der Ordner-Picker nutzt das bereits vendorte `src/vendor/kit-obsidian/folder-suggest.ts`. Der Generationszähler kommt aus `vault-rag/src/context_panel.ts:43–52`.
- **Vendor-Bäume sind Verbatim-Snapshots.** `src/vendor/**` nie von Hand editieren. Dieser Plan fasst `tools/sync-kit.sh` **nicht** an; `KIT_REF` bleibt `0.27.0`, `MOCK_REF` bleibt `0.31.0`.
- **Jeder Wert mit Einfluss ist eine Einstellung** (Johannes, 2026-09-02) — mit der in § D4 benannten Ausnahme.
- **Jede Aktion braucht zusätzlich einen Befehl** (Lehre 0.10.1) — ein Befehl hängt nicht an der Darstellung.
- **Prüfpunkte messen Größe und Wirkung, nicht Existenz** (Lehre 0.10.1 und Befund 1 der Etappe 2a).
- **Smoke-Nummernraum:** 1–32 sind vergeben. Neue Punkte beginnen bei **33**.
- **Texte nach UI-STANDARD §10:** Ablageort `src/i18n/strings.ts`, DE **und** EN, kein Fachbegriff ohne Auflösung.
- **Kappungen melden sich** (Regel aus `list_notes` und `workspace-line.ts`): nichts verschwindet still aus dem Block.
- **Der GUI-Smoke wird vom Controller gefahren, nicht von Implementer-Subagenten** — der CDP-Lock hängt an der Session, und an Obsidian hängen fremde Vaults.
- Vor jedem Commit: `npm run gate` (lint + typecheck + typecheck:scripts + test + check:pure + build).

---

## Entscheidungen, die dieser Plan trifft (und warum)

**D1 — `currentContext()` wird asynchron, und mit ihm `contextViewModel()`.** Volltext-Modi lesen Notizen; `vault.cachedRead` ist async. Die Alternative wäre ein Inhalts-Cache im Plugin — mehr Zustand, und vor allem eine zweite Wahrheit neben der Datei. `ask()` ist ohnehin `async` und awaitet die Methode an Ort und Stelle. Der Preis steht in D2.

**D2 — Das Panel rendert asynchron mit Generationszähler.** Wird `render()` zweimal kurz hintereinander gerufen (Modus umgeschaltet, dann ein Chip geklickt), kann das ältere ViewModel später ankommen und das neuere überschreiben. Das Muster gegen genau diesen Fall existiert in `vault-rag/src/context_panel.ts:43–52` und wird übernommen. Ohne ihn wäre der Kontext-Tab bei schnellen Klicks sporadisch falsch — ein Defekt, den kein Unit-Test sieht und der GUI-Smoke nur zufällig trifft.

**D3 — Budget: Wasserfüllung statt Gleichverteilung.** Die Spec verweist auf `buildContext` in vault-rag (`context_source.ts:9`): `budget / paths.length`, gleiche Scheibe für jeden. Das verschenkt das Budget, sobald die Einträge ungleich groß sind — eine 200-Zeichen-Notiz neben einer 50-KB-Notiz bekäme dieselbe Scheibe, und die Hälfte des Budgets bliebe ungenutzt, während die große Notiz gekürzt wird. Deshalb: wer unter seine Scheibe passt, bekommt seinen vollen Text, und der Rest wird unter den verbleibenden neu aufgeteilt, bis nichts mehr passt. Das ist immer noch „anteilig" im Sinn der Spec, nur ohne den Verschnitt. Die Abweichung ist bewusst und steht als Kommentar in `select.ts`.

**D4 — `contextAutoK` wird in dieser Etappe NICHT gebaut.** Die Einstellung steuert laut § E8 die Trefferzahl für Vault-Kandidaten und semantische Nachbarn — beides Etappe 3. Eine Einstellung, die nichts bewirkt, ist keine Transparenz, sondern ein Versprechen; dieselbe Begründung, mit der `AVAILABLE_MODES` noch nicht gebaute Modi gar nicht erst anbietet („ein Eintrag, der nie geht, ist kein Versprechen", Spec § E6). Sie kommt mit der Quelle, die sie steuert. **Gebaut werden hier `contextBudgetChars` und `contextLinkDepth`** — beide wirken ab Task 6.

**D5 — Ein Ordner wird beim Hinzufügen sofort zu Pfaden aufgelöst, nicht als Ordner gemerkt.** Ein gemerkter Ordner änderte seinen Inhalt zwischen zwei Nachrichten, ohne dass der Nutzer etwas tut — die Chips zeigten dann etwas anderes als der Block, und eine Abwahl beträfe einen Eintrag, den es beim nächsten Senden gar nicht mehr gibt. Aufgelöste Pfade sind je ein Chip, je einzeln abwählbar, und was gesendet wird, steht sichtbar da.

**D6 — Quellen-Chips zeigen nur `kind: "full"`.** Zeiger (aktive Notiz, Markierung, Tab-Pfade im Arbeitsplatz-Modus) stehen bereits vollständig in der aufklappbaren Kontextzeile unter der Nutzer-Blase. Eine zweite Darstellung derselben Zeiger unter der Antwort wäre Rauschen; interessant ist, **welche Notizen im Volltext mitgingen**.

---

## File Structure

**Neu (pure, `src/core/context/`):**
- `candidates.ts` — Modus + Snapshot + Links + Manuelles → geordnete Kandidatenliste. Keine Inhalte, kein IO.
- `select.ts` — Budget-Zuteilung über Wasserfüllung; meldet je Eintrag die ursprüngliche Länge.
- `render.ts` — zugeteilte Einträge → Blocktext **und** `ContextItem[]` aus einer Quelle.
- `build.ts` — die Komposition: Kandidaten → Filter → lesen → Budget → rendern. Die einzige Stelle, an der ein Volltext-Block entsteht.

**Neu (Obsidian-Schale):**
- `src/obsidian/links.ts` — `linkPort` (aus `metadataCache.resolvedLinks`) und `contentPort` (aus `vault.cachedRead`).
- `src/obsidian/note-picker.ts` — übernommen aus vault-rag, mit Herkunftsstempel.
- `src/obsidian/folder-picker.ts` — Modal mit `FolderSuggest` aus dem Vendor-Baum.

**Geändert:**
- `src/core/context/ports.ts` — `LinkPort`, `ContentPort`
- `src/core/context/types.ts` — `AVAILABLE_MODES` um `note`, `tabs`
- `src/core/context/panel-vm.ts` — asynchron, Abschnitte je Quelle
- `src/core/settings-types.ts` — `contextBudgetChars`, `contextLinkDepth`
- `src/core/tools/path-guard.ts` — `resolveNotePath(rel, allow?)`
- `src/core/tools/defs.ts` — Beschreibung von `read_note`
- `src/obsidian/context-panel.ts` — asynchrones Rendern, Generationszähler, Manuell-Knöpfe
- `src/obsidian/view.ts` — Quellen-Chips unter der Antwort
- `src/obsidian/settings.ts` — zwei Settings-Zeilen
- `src/i18n/strings.ts` — DE/EN für alles Neue
- `src/main.ts` — `contextManual`, async `currentContext()`, Picker-Befehle
- `styles.css` — Quellen-Chips
- `scripts/gui-smoke.ts` — Punkte 33–37, Punkt 30 auf `await` nachziehen
- `docs/images/fixture/` — eine `.base`, README-Zusage

**Tests:** `tests/context_candidates.test.ts`, `tests/context_select.test.ts`, `tests/context_render.test.ts`, `tests/context_build.test.ts`, `tests/context_links_adapter.test.ts` (neu) · `tests/context_panel_vm.test.ts`, `tests/settings_types.test.ts`, `tests/path_guard.test.ts`, `tests/tool_defs.test.ts` (erweitert).

---

### Task 1: Zwei Einstellungen — `contextBudgetChars` und `contextLinkDepth`

**Files:**
- Modify: `src/core/settings-types.ts`
- Modify: `src/i18n/strings.ts`
- Modify: `src/obsidian/settings.ts`
- Test: `tests/settings_types.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `KodaSettings.contextBudgetChars: number` (2000–200000, Default 20000), `KodaSettings.contextLinkDepth: number` (1–3, Default 1); die exportierten Konstanten `CONTEXT_BUDGET_MIN`, `CONTEXT_BUDGET_MAX`, `CONTEXT_BUDGET_STEP`, `CONTEXT_LINK_DEPTH_MIN`, `CONTEXT_LINK_DEPTH_MAX`.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

An das Ende von `tests/settings_types.test.ts` anfügen:

```ts
describe("Etappe 2b: Budget und Link-Tiefe", () => {
  it("klemmt contextBudgetChars in seine Spanne und nimmt Ziffernstrings an", () => {
    expect(validateKodaSettings({ contextBudgetChars: 500 }).contextBudgetChars).toBe(2000);
    expect(validateKodaSettings({ contextBudgetChars: 999999 }).contextBudgetChars).toBe(200000);
    expect(validateKodaSettings({ contextBudgetChars: "30000" }).contextBudgetChars).toBe(30000);
  });

  it("klemmt contextLinkDepth auf 1..3", () => {
    expect(validateKodaSettings({ contextLinkDepth: 0 }).contextLinkDepth).toBe(1);
    expect(validateKodaSettings({ contextLinkDepth: 9 }).contextLinkDepth).toBe(3);
  });

  it("liefert die Defaults, wenn nichts dasteht", () => {
    const s = validateKodaSettings({});
    expect(s.contextBudgetChars).toBe(20000);
    expect(s.contextLinkDepth).toBe(1);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Rot sehen**

Run: `npx vitest run tests/settings_types.test.ts -t "Etappe 2b"`
Expected: FAIL — `contextBudgetChars` ist `undefined`, weil die geschlossene Welt von `validateSettings` nur Schlüssel aus `DEFAULT_SETTINGS` durchlässt.

- [ ] **Step 3: Die Felder anlegen**

In `src/core/settings-types.ts` direkt hinter dem Block `CONTEXT_FRONTMATTER_*` einfügen:

```ts
/** Spanne fuer `contextBudgetChars` — wie viele Zeichen Notiz-INHALT hoechstens in einen
 *  Kontextblock wandern (Modi Notiz, Alle Tabs, Manuell). Zeiger-Blöcke des Modus
 *  Arbeitsplatz zaehlen nicht mit: sie sind wenige Zeilen und kosten kein Fenster.
 *  Wie `skillBudgetChars` bewusst eine Einstellung: die Grenze laesst Inhalt weg, und
 *  solche Grenzen gehoeren sichtbar. 20000 Zeichen sind grob 5000 Token. */
export const CONTEXT_BUDGET_MIN = 2000;
export const CONTEXT_BUDGET_MAX = 200000;
export const CONTEXT_BUDGET_STEP = 1000;

/** Spanne fuer `contextLinkDepth` — wie viele Ebenen ausgehender Links und Backlinks der
 *  Modus „Notiz" einsammelt. Obergrenze 3, weil die Nachbarschaft je Ebene multiplikativ
 *  waechst: schon Ebene 2 kann in einem gepflegten Vault dreistellig werden, und das Budget
 *  verteilt sich dann auf lauter Schnipsel. */
export const CONTEXT_LINK_DEPTH_MIN = 1;
export const CONTEXT_LINK_DEPTH_MAX = 3;
```

Im Interface `KodaSettings` hinter `contextFrontmatterChars`:

```ts
  contextBudgetChars: number;
  contextLinkDepth: number;
```

In `DEFAULT_SETTINGS` hinter `contextFrontmatterChars: 300,`:

```ts
  contextBudgetChars: 20000,
  contextLinkDepth: 1,
```

In `SCHEMA` hinter `contextFrontmatterChars: …`:

```ts
  contextBudgetChars: clampIntField(CONTEXT_BUDGET_MIN, CONTEXT_BUDGET_MAX),
  contextLinkDepth: clampIntField(CONTEXT_LINK_DEPTH_MIN, CONTEXT_LINK_DEPTH_MAX),
```

- [ ] **Step 4: Test laufen lassen, Grün sehen**

Run: `npx vitest run tests/settings_types.test.ts`
Expected: PASS, alle Tests der Datei.

- [ ] **Step 5: Texte anlegen (DE und EN)**

In `src/i18n/strings.ts` im **`en`**-Block hinter `"settings.contextKeep.desc"`:

```ts
    "settings.contextBudget": "Content budget per message (characters)",
    "settings.contextBudget.desc": "How much note content the modes Note, All tabs and Manual may put into one message. Everything that does not fit is cut, and the block says by how much — read_note fetches the full text. The Workspace mode is not affected: it only sends pointers.",
    "settings.contextLinkDepth": "Link depth in the Note mode",
    "settings.contextLinkDepth.desc": "How many levels of outgoing links and backlinks are collected around the active note. 1 = its direct neighbours. Every level multiplies the number of notes, and the budget is then split across more of them.",
```

Im **`de`**-Block an derselben Stelle:

```ts
    "settings.contextBudget": "Inhalts-Budget je Nachricht (Zeichen)",
    "settings.contextBudget.desc": "Wie viel Notiz-Inhalt die Modi Notiz, Alle Tabs und Manuell in eine Nachricht legen dürfen. Was nicht hineinpasst, wird gekürzt, und der Block sagt um wie viel — read_note holt den vollen Text. Der Modus Arbeitsplatz ist nicht betroffen: er schickt nur Zeiger.",
    "settings.contextLinkDepth": "Link-Tiefe im Modus Notiz",
    "settings.contextLinkDepth.desc": "Wie viele Ebenen ausgehender Links und Backlinks rund um die aktive Notiz eingesammelt werden. 1 = ihre direkten Nachbarn. Jede Ebene vervielfacht die Zahl der Notizen, und das Budget verteilt sich dann auf mehr davon.",
```

- [ ] **Step 6: Zwei Settings-Zeilen ergänzen**

In `src/obsidian/settings.ts` in der Gruppe `t("settings.context")`, hinter dem Eintrag `settings.contextFrontmatter` und **vor** `settings.contextKeep`:

```ts
          {
            name: t("settings.contextBudget"),
            desc: t("settings.contextBudget.desc"),
            control: { type: "slider", key: "contextBudgetChars", min: CONTEXT_BUDGET_MIN, max: CONTEXT_BUDGET_MAX, step: CONTEXT_BUDGET_STEP },
          },
          {
            name: t("settings.contextLinkDepth"),
            desc: t("settings.contextLinkDepth.desc"),
            control: { type: "slider", key: "contextLinkDepth", min: CONTEXT_LINK_DEPTH_MIN, max: CONTEXT_LINK_DEPTH_MAX, step: 1 },
          },
```

Und den Import in derselben Datei um `CONTEXT_BUDGET_MIN`, `CONTEXT_BUDGET_MAX`, `CONTEXT_BUDGET_STEP`, `CONTEXT_LINK_DEPTH_MIN`, `CONTEXT_LINK_DEPTH_MAX` erweitern (die Datei importiert die übrigen `CONTEXT_*`-Konstanten bereits aus `../core/settings-types`).

- [ ] **Step 7: Gate + Commit**

```bash
npm run gate
git add src/core/settings-types.ts src/i18n/strings.ts src/obsidian/settings.ts tests/settings_types.test.ts
git commit -m "feat(kontext): Budget und Link-Tiefe als Einstellungen"
```

---

### Task 2: `select.ts` — Budget-Zuteilung mit sichtbarer Kürzung

**Files:**
- Create: `src/core/context/select.ts`
- Test: `tests/context_select.test.ts`

**Interfaces:**
- Consumes: `ContextSource` aus `./types`.
- Produces:
  - `interface Candidate { source: ContextSource; path: string; depth?: number }`
  - `type LoadedCandidate = Candidate & { content: string }`
  - `interface AllocatedEntry { source: ContextSource; path: string; depth?: number; shown: string; fullChars: number; cut: boolean }`
  - `function allocateBudget(entries: readonly LoadedCandidate[], budget: number): AllocatedEntry[]`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Create `tests/context_select.test.ts`:

```ts
/* Budget-Zuteilung: was passt, geht ganz mit; der Rest wird unter den Großen aufgeteilt.
 * Die Gegenprobe zur Wasserfüllung ist der letzte Test — mit Gleichverteilung bliebe
 * Budget ungenutzt, während eine große Notiz gekürzt wird. */
import { describe, it, expect } from "vitest";
import { allocateBudget, type LoadedCandidate } from "../src/core/context/select";

function eintrag(path: string, laenge: number): LoadedCandidate {
  return { source: "manual", path, content: "x".repeat(laenge) };
}

describe("allocateBudget", () => {
  it("laesst alles ungekuerzt, wenn die Summe ins Budget passt", () => {
    const out = allocateBudget([eintrag("a.md", 100), eintrag("b.md", 200)], 1000);
    expect(out.map((e) => e.cut)).toEqual([false, false]);
    expect(out.map((e) => e.shown.length)).toEqual([100, 200]);
    expect(out.map((e) => e.fullChars)).toEqual([100, 200]);
  });

  it("kuerzt und meldet die urspruengliche Laenge", () => {
    const out = allocateBudget([eintrag("a.md", 900), eintrag("b.md", 900)], 1000);
    expect(out.every((e) => e.cut)).toBe(true);
    expect(out.map((e) => e.shown.length)).toEqual([500, 500]);
    expect(out.map((e) => e.fullChars)).toEqual([900, 900]);
  });

  it("gibt den Rest der Kleinen an die Grossen weiter (Wasserfuellung)", () => {
    // Gleichverteilung gaebe jedem 500: die kleine Notiz liesse 400 Zeichen liegen,
    // die grosse wuerde trotzdem auf 500 gekuerzt. Erwartet ist 100 + 900.
    const out = allocateBudget([eintrag("klein.md", 100), eintrag("gross.md", 5000)], 1000);
    expect(out[0]).toMatchObject({ cut: false, fullChars: 100 });
    expect(out[0]?.shown.length).toBe(100);
    expect(out[1]).toMatchObject({ cut: true, fullChars: 5000 });
    expect(out[1]?.shown.length).toBe(900);
  });

  it("verteilt ueber mehrere Runden weiter", () => {
    // Runde 1: Scheibe 100 → „a" (10) passt. Rest 290 auf zwei → Scheibe 145 → „b" (120)
    // passt. Rest 170 auf einen → „c" bekommt 170.
    const out = allocateBudget([eintrag("a.md", 10), eintrag("b.md", 120), eintrag("c.md", 9000)], 300);
    expect(out.map((e) => e.shown.length)).toEqual([10, 120, 170]);
    expect(out.map((e) => e.cut)).toEqual([false, false, true]);
  });

  it("behaelt Reihenfolge, Quelle und Ebene bei", () => {
    const out = allocateBudget([{ source: "link", path: "n.md", depth: 2, content: "abc" }], 100);
    expect(out[0]).toMatchObject({ source: "link", path: "n.md", depth: 2, cut: false });
  });

  it("kommt mit leerer Liste und mit Budget 0 zurecht", () => {
    expect(allocateBudget([], 1000)).toEqual([]);
    const out = allocateBudget([eintrag("a.md", 50)], 0);
    expect(out[0]?.shown).toBe("");
    expect(out[0]?.cut).toBe(true);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Rot sehen**

Run: `npx vitest run tests/context_select.test.ts`
Expected: FAIL — `Failed to resolve import "../src/core/context/select"`.

- [ ] **Step 3: Das Modul schreiben**

Create `src/core/context/select.ts`:

```ts
/* Wie viel von jedem Kandidaten in den Block darf. Pure.
 *
 * Verfahren: Wasserfuellung. Wer unter seine Scheibe passt, bekommt seinen vollen Text,
 * und der uebrige Rest wird unter den verbleibenden neu aufgeteilt — bis in einer Runde
 * niemand mehr passt; dann bekommen alle Uebrigen dieselbe Scheibe.
 *
 * Bewusste Abweichung von `vault-rag/src/context_source.ts:9` (`budget / paths.length`,
 * gleiche Scheibe fuer jeden), auf die die Spec verweist: die Gleichverteilung verschenkt
 * das Budget, sobald die Eintraege ungleich gross sind. Eine 200-Zeichen-Notiz neben einer
 * 50-KB-Notiz bekaeme dieselbe Scheibe — die Haelfte des Budgets bliebe liegen, waehrend
 * die grosse Notiz gekuerzt wird. „Anteilig" bleibt es trotzdem, nur ohne den Verschnitt. */
import type { ContextSource } from "./types";

export interface Candidate {
  source: ContextSource;
  path: string;
  /** Link-Ebene (1 = direkter Nachbar), nur bei link/backlink. */
  depth?: number;
}

export type LoadedCandidate = Candidate & { content: string };

export interface AllocatedEntry {
  source: ContextSource;
  path: string;
  depth?: number;
  /** Was in den Block geht. */
  shown: string;
  /** Laenge VOR der Kuerzung — die Zahl, die der Block meldet. */
  fullChars: number;
  cut: boolean;
}

export function allocateBudget(entries: readonly LoadedCandidate[], budget: number): AllocatedEntry[] {
  const zuteilung = new Map<number, number>();
  let offen = entries.map((_, i) => i);
  let rest = Math.max(0, budget);

  while (offen.length > 0) {
    const scheibe = Math.floor(rest / offen.length);
    const passend = offen.filter((i) => (entries[i]?.content.length ?? 0) <= scheibe);
    if (passend.length === 0) {
      // Niemand passt mehr: alle Uebrigen bekommen dieselbe Scheibe. Danach ist Schluss —
      // eine weitere Runde wuerde dieselbe Menge noch einmal betrachten (Endlosschleife).
      for (const i of offen) zuteilung.set(i, scheibe);
      break;
    }
    for (const i of passend) {
      const n = entries[i]?.content.length ?? 0;
      zuteilung.set(i, n);
      rest -= n;
    }
    const fertig = new Set(passend);
    offen = offen.filter((i) => !fertig.has(i));
  }

  return entries.map((e, i) => {
    const erlaubt = zuteilung.get(i) ?? 0;
    const cut = e.content.length > erlaubt;
    const out: AllocatedEntry = {
      source: e.source,
      path: e.path,
      shown: cut ? e.content.slice(0, erlaubt) : e.content,
      fullChars: e.content.length,
      cut,
    };
    if (e.depth !== undefined) out.depth = e.depth;
    return out;
  });
}
```

- [ ] **Step 4: Test laufen lassen, Grün sehen**

Run: `npx vitest run tests/context_select.test.ts`
Expected: PASS, 6 Tests.

- [ ] **Step 5: Gegenprobe — die Wasserfüllung ausbauen**

In `select.ts` die Schleife vorübergehend durch die Gleichverteilung ersetzen:

```ts
  const scheibe = entries.length > 0 ? Math.floor(Math.max(0, budget) / entries.length) : 0;
  for (let i = 0; i < entries.length; i++) zuteilung.set(i, scheibe);
```

Run: `npx vitest run tests/context_select.test.ts`
Expected: FAIL in „gibt den Rest der Kleinen an die Grossen weiter" (500 statt 900) **und** in „verteilt ueber mehrere Runden weiter". Danach die Mutation zurücknehmen und den Test erneut grün sehen. Ohne diesen Schritt belegt Grün nur, dass irgendetwas zurückkommt.

- [ ] **Step 6: Gate + Commit**

```bash
npm run gate
git add src/core/context/select.ts tests/context_select.test.ts
git commit -m "feat(kontext): Budget-Zuteilung per Wasserfuellung, Kuerzung meldet die volle Laenge"
```

---

### Task 3: `candidates.ts` — welche Notizen ein Modus anbietet

**Files:**
- Modify: `src/core/context/ports.ts`
- Create: `src/core/context/candidates.ts`
- Test: `tests/context_candidates.test.ts`

**Interfaces:**
- Consumes: `Candidate` aus `./select`, `WorkspaceSnapshot` aus `./ports`.
- Produces:
  - `interface LinkPort { outgoing(path: string): string[]; backlinks(path: string): string[] }` (in `ports.ts`)
  - `interface ContentPort { read(path: string): Promise<string | null> }` (in `ports.ts`)
  - `function collectCandidates(input: CandidateInput): Candidate[]`
  - `interface CandidateInput { mode: "note" | "tabs"; snap: WorkspaceSnapshot; links: LinkPort; linkDepth: number; manual: readonly string[] }`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Create `tests/context_candidates.test.ts`:

```ts
/* Welche Notizen ein Volltext-Modus anbietet. Die drei Regeln, die hier gepinnt werden,
 * stehen so in der Spec (E3): jede Notiz nur einmal, die aktive Notiz nie als eigener
 * Nachbar, unaufgeloeste Links gibt es nicht (der Port liefert sie gar nicht erst). */
import { describe, it, expect } from "vitest";
import { collectCandidates } from "../src/core/context/candidates";
import type { LinkPort, WorkspaceSnapshot } from "../src/core/context/ports";

const LINKS: Record<string, string[]> = {
  "A.md": ["B.md", "C.md"],
  "B.md": ["D.md"],
  "C.md": [],
  "D.md": [],
  "Z.md": ["A.md"],
};

const links: LinkPort = {
  outgoing: (p) => LINKS[p] ?? [],
  backlinks: (p) => Object.keys(LINKS).filter((q) => q !== p && (LINKS[q] ?? []).includes(p)),
};

function snap(activePath: string | null, tabs: string[] = []): WorkspaceSnapshot {
  return {
    active: activePath === null ? null : { path: activePath, frontmatter: null, selection: "", cursorLine: 1, lineCount: 1 },
    tabs: tabs.map((path) => ({ path, viewType: "markdown" })),
  };
}

describe("collectCandidates — Modus Notiz", () => {
  it("nimmt die aktive Notiz, ihre ausgehenden Links und ihre Backlinks auf Ebene 1", () => {
    const out = collectCandidates({ mode: "note", snap: snap("A.md"), links, linkDepth: 1, manual: [] });
    expect(out).toEqual([
      { source: "active", path: "A.md" },
      { source: "link", path: "B.md", depth: 1 },
      { source: "link", path: "C.md", depth: 1 },
      { source: "backlink", path: "Z.md", depth: 1 },
    ]);
  });

  it("geht bei Tiefe 2 eine Ebene weiter und zaehlt jede Notiz nur einmal", () => {
    const out = collectCandidates({ mode: "note", snap: snap("A.md"), links, linkDepth: 2, manual: [] });
    const pfade = out.map((c) => c.path);
    expect(pfade).toContain("D.md");
    expect(new Set(pfade).size).toBe(pfade.length);
    expect(out.find((c) => c.path === "D.md")?.depth).toBe(2);
  });

  it("nimmt die aktive Notiz nie als eigenen Nachbarn auf", () => {
    // A.md ist Backlink-Ziel von Z.md, und Z.md verlinkt auf A.md — bei Tiefe 2 taucht
    // A.md als Nachbar von Z.md wieder auf. Genau das darf nicht passieren.
    const out = collectCandidates({ mode: "note", snap: snap("A.md"), links, linkDepth: 2, manual: [] });
    expect(out.filter((c) => c.path === "A.md")).toHaveLength(1);
    expect(out[0]).toEqual({ source: "active", path: "A.md" });
  });

  it("liefert ohne aktive Notiz nur das Manuelle", () => {
    const out = collectCandidates({ mode: "note", snap: snap(null), links, linkDepth: 2, manual: ["M.md"] });
    expect(out).toEqual([{ source: "manual", path: "M.md" }]);
  });
});

describe("collectCandidates — Modus Alle Tabs", () => {
  it("nimmt jeden offenen Tab, entdoppelt, und die aktive Notiz als aktiv", () => {
    const out = collectCandidates({
      mode: "tabs", snap: snap("A.md", ["A.md", "B.md", "B.md"]), links, linkDepth: 1, manual: [],
    });
    expect(out).toEqual([
      { source: "active", path: "A.md" },
      { source: "tab", path: "B.md" },
    ]);
  });

  it("sammelt keine Links ein", () => {
    const out = collectCandidates({ mode: "tabs", snap: snap("A.md", ["A.md"]), links, linkDepth: 3, manual: [] });
    expect(out.some((c) => c.source === "link" || c.source === "backlink")).toBe(false);
  });
});

describe("collectCandidates — Manuelles quer zu beiden Modi", () => {
  it("stellt Manuelles vor Automatisches, aber hinter die aktive Notiz", () => {
    const out = collectCandidates({ mode: "note", snap: snap("A.md"), links, linkDepth: 1, manual: ["M.md"] });
    expect(out.map((c) => c.source)).toEqual(["active", "manual", "link", "link", "backlink"]);
  });

  it("laesst eine manuell hinzugefuegte Notiz nicht doppelt erscheinen", () => {
    const out = collectCandidates({ mode: "note", snap: snap("A.md"), links, linkDepth: 1, manual: ["B.md"] });
    expect(out.filter((c) => c.path === "B.md")).toEqual([{ source: "manual", path: "B.md" }]);
  });

  it("behaelt die Reihenfolge der manuellen Eintraege", () => {
    const out = collectCandidates({ mode: "tabs", snap: snap(null), links, linkDepth: 1, manual: ["z.md", "a.md"] });
    expect(out.map((c) => c.path)).toEqual(["z.md", "a.md"]);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Rot sehen**

Run: `npx vitest run tests/context_candidates.test.ts`
Expected: FAIL — `Failed to resolve import "../src/core/context/candidates"`.

- [ ] **Step 3: Die beiden Ports ergänzen**

An das Ende von `src/core/context/ports.ts`:

```ts
/** Die Link-Nachbarschaft einer Notiz. Beide Richtungen kommen aus Obsidians
 *  `metadataCache.resolvedLinks` — UNAUFGELOESTE Links stehen dort nicht drin und
 *  erreichen den Kern deshalb gar nicht erst (Spec E3: „werden ignoriert"). */
export interface LinkPort {
  outgoing(path: string): string[];
  backlinks(path: string): string[];
}

/** Notiz-Inhalt fuer die Volltext-Modi. `null` heisst „nicht lesbar" (geloescht, kein
 *  Textformat, Rechte) — der Eintrag faellt dann still aus dem Block, wie in vault-rags
 *  `buildContext`. Still ist hier richtig: eine Notiz, die es nicht mehr gibt, ist keine
 *  Kappung, die sich melden muesste, sondern ein Kandidat, der sich erledigt hat. */
export interface ContentPort {
  read(path: string): Promise<string | null>;
}
```

- [ ] **Step 4: Das Modul schreiben**

Create `src/core/context/candidates.ts`:

```ts
/* Welche Notizen ein Modus anbietet — ohne Inhalte, ohne IO. Pure.
 *
 * Reihenfolge (Spec E3: „Quelle, dann Ebene, dann Pfad"): aktive Notiz · Manuelles ·
 * Tabs · Links · Backlinks. Innerhalb einer Gruppe bleibt die Eingangsreihenfolge stehen —
 * bei Tabs ist das die Reihenfolge des Workspace, und die ist selbst eine Aussage
 * („was liegt links, was rechts"), die eine alphabetische Sortierung zerstoeren wuerde.
 * Deterministisch ist sie trotzdem: sie kommt aus dem Snapshot, nicht aus einer Menge. */
import type { LinkPort, WorkspaceSnapshot } from "./ports";
import type { Candidate } from "./select";

export interface CandidateInput {
  mode: "note" | "tabs";
  snap: WorkspaceSnapshot;
  links: LinkPort;
  /** Ebenen fuer Links und Backlinks (Einstellung `contextLinkDepth`). Nur im Modus Notiz. */
  linkDepth: number;
  /** Vom Nutzer hinzugefuegte Pfade, in der Reihenfolge des Hinzufuegens. */
  manual: readonly string[];
}

export function collectCandidates(input: CandidateInput): Candidate[] {
  const out: Candidate[] = [];
  const gesehen = new Set<string>();
  const nimm = (c: Candidate): void => {
    if (gesehen.has(c.path)) return;
    gesehen.add(c.path);
    out.push(c);
  };

  const aktiv = input.snap.active;
  if (aktiv !== null) nimm({ source: "active", path: aktiv.path });

  // Manuelles vor Automatischem: es ist die einzige Quelle, die der Nutzer ausdruecklich
  // gewaehlt hat — bei knappem Budget soll sie nicht hinter einer Link-Ebene anstehen.
  for (const p of input.manual) nimm({ source: "manual", path: p });

  if (input.mode === "tabs") {
    for (const tab of input.snap.tabs) nimm({ source: "tab", path: tab.path });
    return out;
  }

  if (aktiv === null) return out;

  // Breitensuche. `grenze` ist die Ebene, deren Nachbarn als naechstes drankommen; die
  // Quelle (link/backlink) stammt aus der ERSTEN Entdeckung und bleibt danach stehen —
  // auf Ebene 2 waere sie ohnehin nicht mehr eindeutig.
  let grenze: string[] = [aktiv.path];
  for (let ebene = 1; ebene <= input.linkDepth; ebene++) {
    const naechste: string[] = [];
    for (const p of grenze) {
      for (const ziel of input.links.outgoing(p)) {
        if (gesehen.has(ziel)) continue;
        nimm({ source: "link", path: ziel, depth: ebene });
        naechste.push(ziel);
      }
    }
    for (const p of grenze) {
      for (const quelle of input.links.backlinks(p)) {
        if (gesehen.has(quelle)) continue;
        nimm({ source: "backlink", path: quelle, depth: ebene });
        naechste.push(quelle);
      }
    }
    grenze = naechste;
    if (grenze.length === 0) break;
  }
  return out;
}
```

- [ ] **Step 5: Test laufen lassen, Grün sehen**

Run: `npx vitest run tests/context_candidates.test.ts`
Expected: PASS, 9 Tests.

⚠️ Der Test „stellt Manuelles vor Automatisches" erwartet die Gruppen-Reihenfolge `active · manual · link · link · backlink`. Die Implementierung erzeugt sie durch die **Aufrufreihenfolge**, nicht durch ein Sortieren — Links werden je Ebene komplett vor den Backlinks derselben Ebene eingesammelt. Wer das umbaut, bricht diesen Test, und das ist der Sinn.

- [ ] **Step 6: Gegenprobe — den Dubletten-Schutz ausbauen**

In `nimm` die erste Zeile (`if (gesehen.has(c.path)) return;`) auskommentieren.
Run: `npx vitest run tests/context_candidates.test.ts`
Expected: FAIL in „nimmt die aktive Notiz nie als eigenen Nachbarn auf" (A.md zweimal), „zaehlt jede Notiz nur einmal" und „laesst eine manuell hinzugefuegte Notiz nicht doppelt erscheinen". Mutation zurücknehmen, erneut grün.

- [ ] **Step 7: Gate + Commit**

```bash
npm run gate
git add src/core/context/ports.ts src/core/context/candidates.ts tests/context_candidates.test.ts
git commit -m "feat(kontext): Kandidaten je Modus — Link-BFS, Tabs, Manuelles"
```

---

### Task 4: `render.ts` und `build.ts` — der Volltext-Block

**Files:**
- Create: `src/core/context/render.ts`
- Create: `src/core/context/build.ts`
- Test: `tests/context_render.test.ts`, `tests/context_build.test.ts`

**Interfaces:**
- Consumes: `AllocatedEntry`/`allocateBudget` aus `./select`, `collectCandidates` aus `./candidates`, `LinkPort`/`ContentPort`/`WorkspaceSnapshot` aus `./ports`, `itemKey`/`SelectionKey` aus `./selection`, `ContextAttachment` aus `./types`.
- Produces:
  - `function renderFullContext(entries: readonly AllocatedEntry[], mode: "note" | "tabs", lang: "de" | "en"): ContextAttachment`
  - `function buildFullContext(opts: BuildOptions): Promise<ContextAttachment>`
  - `interface BuildOptions { mode: "note" | "tabs"; snap: WorkspaceSnapshot; links: LinkPort; content: ContentPort; manual: readonly string[]; off: ReadonlySet<SelectionKey>; linkDepth: number; budget: number; lang: "de" | "en" }`

- [ ] **Step 1: Den fehlschlagenden Renderer-Test schreiben**

Create `tests/context_render.test.ts`:

```ts
/* Der Volltext-Block. Die tragende Invariante ist dieselbe wie beim Arbeitsplatz-Block:
 * was im Text steht, steht in `items` — beide entstehen aus DERSELBEN Eintragsliste. */
import { describe, it, expect } from "vitest";
import { renderFullContext } from "../src/core/context/render";
import type { AllocatedEntry } from "../src/core/context/select";

const ganz: AllocatedEntry = { source: "active", path: "A.md", shown: "Hallo", fullChars: 5, cut: false };
const gekuerzt: AllocatedEntry = { source: "link", path: "B.md", depth: 1, shown: "Anfa", fullChars: 900, cut: true };

describe("renderFullContext", () => {
  it("setzt eine Kopfzeile mit dem Modus", () => {
    expect(renderFullContext([ganz], "note", "de").text.split("\n")[0]).toBe("[Arbeitskontext · Notiz]");
    expect(renderFullContext([ganz], "tabs", "en").text.split("\n")[0]).toBe("[Working context · All tabs]");
  });

  it("schreibt je Eintrag eine Ueberschrift mit Pfad und Herkunft", () => {
    const text = renderFullContext([ganz, gekuerzt], "note", "de").text;
    expect(text).toContain("## A.md (aktive Notiz)");
    expect(text).toContain("## B.md (verlinkt, Ebene 1)");
    expect(text).toContain("Hallo");
  });

  it("meldet jede Kuerzung im Block, mit beiden Zahlen und dem Weg zum Rest", () => {
    const text = renderFullContext([gekuerzt], "note", "de").text;
    expect(text).toContain("gekürzt: 4 von 900 Zeichen");
    expect(text).toContain('read_note("B.md")');
  });

  it("meldet nichts, wo nichts gekuerzt wurde", () => {
    expect(renderFullContext([ganz], "note", "de").text).not.toContain("gekürzt");
  });

  it("baut items aus derselben Liste wie den Text", () => {
    const ctx = renderFullContext([ganz, gekuerzt], "note", "de");
    expect(ctx.mode).toBe("note");
    expect(ctx.items).toEqual([
      { source: "active", path: "A.md", kind: "full", chars: 5 },
      { source: "link", path: "B.md", kind: "full", chars: 4, fullChars: 900, depth: 1 },
    ]);
    for (const item of ctx.items) expect(ctx.text).toContain(item.path);
  });

  it("liefert bei leerer Auswahl einen Block, der das sagt — nicht einen leeren String", () => {
    const ctx = renderFullContext([], "tabs", "de");
    expect(ctx.items).toEqual([]);
    expect(ctx.text).toContain("nichts ausgewählt");
  });
});
```

- [ ] **Step 2: Test laufen lassen, Rot sehen**

Run: `npx vitest run tests/context_render.test.ts`
Expected: FAIL — `Failed to resolve import "../src/core/context/render"`.

- [ ] **Step 3: Den Renderer schreiben**

Create `src/core/context/render.ts`:

```ts
/* Volltext-Block: Ueberschrift je Notiz, Inhalt darunter, Kuerzung mit beiden Zahlen.
 * Form nach vault-rags `buildContext` (`## <pfad>` + Inhalt), erweitert um Herkunft und
 * Kuerzungs-Meldung. Text UND items entstehen in EINER Schleife aus DERSELBEN Liste —
 * die Invariante „was im Block steht, steht in items" ist damit eine Folge, keine
 * Behauptung (dieselbe Bauart wie `workspace-line.ts`). Pure. */
import type { AllocatedEntry } from "./select";
import type { ContextAttachment, ContextItem } from "./types";

type Lang = "de" | "en";

const T = {
  de: {
    head: (m: string) => `[Arbeitskontext · ${m}]`,
    mode: { note: "Notiz", tabs: "Alle Tabs" },
    src: { active: "aktive Notiz", manual: "manuell hinzugefügt", tab: "offener Tab", link: "verlinkt", backlink: "verlinkt hierher" },
    level: (n: number) => `, Ebene ${n}`,
    cut: (a: number, b: number, p: string) => `[gekürzt: ${a} von ${b} Zeichen — vollständig über read_note("${p}")]`,
    empty: "nichts ausgewählt — der Kontext-Tab in Kodas Seitenleiste zeigt, was zur Auswahl steht.",
  },
  en: {
    head: (m: string) => `[Working context · ${m}]`,
    mode: { note: "Note", tabs: "All tabs" },
    src: { active: "active note", manual: "added by hand", tab: "open tab", link: "linked from here", backlink: "links to here" },
    level: (n: number) => `, level ${n}`,
    cut: (a: number, b: number, p: string) => `[cut: ${a} of ${b} chars — full text via read_note("${p}")]`,
    empty: "nothing selected — the Context tab in Koda's sidebar shows what is on offer.",
  },
} as const;

function herkunft(e: AllocatedEntry, t: (typeof T)[Lang]): string {
  const name = t.src[e.source as keyof typeof t.src] ?? e.source;
  return e.depth === undefined ? name : `${name}${t.level(e.depth)}`;
}

export function renderFullContext(
  entries: readonly AllocatedEntry[],
  mode: "note" | "tabs",
  lang: Lang,
): ContextAttachment {
  const t = T[lang];
  const bloecke: string[] = [t.head(t.mode[mode])];
  const items: ContextItem[] = [];

  if (entries.length === 0) {
    bloecke.push(t.empty);
    return { mode, items, text: bloecke.join("\n") };
  }

  for (const e of entries) {
    const kopf = `## ${e.path} (${herkunft(e, t)})`;
    const meldung = e.cut ? `\n${t.cut(e.shown.length, e.fullChars, e.path)}` : "";
    bloecke.push(`${kopf}\n${e.shown}${meldung}`);
    const item: ContextItem = { source: e.source, path: e.path, kind: "full", chars: e.shown.length };
    if (e.cut) item.fullChars = e.fullChars;
    if (e.depth !== undefined) item.depth = e.depth;
    items.push(item);
  }
  return { mode, items, text: bloecke.join("\n\n") };
}
```

- [ ] **Step 4: Renderer-Test laufen lassen, Grün sehen**

Run: `npx vitest run tests/context_render.test.ts`
Expected: PASS, 6 Tests.

- [ ] **Step 5: Den fehlschlagenden Kompositions-Test schreiben**

Create `tests/context_build.test.ts`:

```ts
/* Die Komposition: Kandidaten → Abwahl → lesen → Budget → rendern.
 * Zwei Zusicherungen tragen den Rest: gefiltert wird VOR dem Lesen (eine abgewaehlte
 * Notiz kostet keinen Dateizugriff), und nicht lesbare Notizen fallen still heraus. */
import { describe, it, expect, vi } from "vitest";
import { buildFullContext } from "../src/core/context/build";
import { itemKey } from "../src/core/context/selection";
import type { LinkPort, WorkspaceSnapshot } from "../src/core/context/ports";

const links: LinkPort = { outgoing: (p) => (p === "A.md" ? ["B.md"] : []), backlinks: () => [] };

const snap: WorkspaceSnapshot = {
  active: { path: "A.md", frontmatter: null, selection: "", cursorLine: 1, lineCount: 1 },
  tabs: [{ path: "A.md", viewType: "markdown" }, { path: "T.md", viewType: "markdown" }],
};

function inhalt(map: Record<string, string | null>) {
  return { read: vi.fn((p: string) => Promise.resolve(map[p] ?? null)) };
}

describe("buildFullContext", () => {
  it("legt aktive Notiz und verlinkte Nachbarn in den Block", async () => {
    const content = inhalt({ "A.md": "Text A", "B.md": "Text B" });
    const ctx = await buildFullContext({
      mode: "note", snap, links, content, manual: [], off: new Set(),
      linkDepth: 1, budget: 10000, lang: "de",
    });
    expect(ctx.items.map((i) => i.path)).toEqual(["A.md", "B.md"]);
    expect(ctx.text).toContain("Text A");
    expect(ctx.text).toContain("Text B");
  });

  it("laesst einen abgewaehlten Eintrag heraus — und liest ihn gar nicht erst", async () => {
    const content = inhalt({ "A.md": "Text A", "B.md": "Text B" });
    const ctx = await buildFullContext({
      mode: "note", snap, links, content, manual: [], off: new Set([itemKey("link", "B.md")]),
      linkDepth: 1, budget: 10000, lang: "de",
    });
    expect(ctx.items.map((i) => i.path)).toEqual(["A.md"]);
    expect(content.read).not.toHaveBeenCalledWith("B.md");
  });

  it("laesst eine nicht lesbare Notiz still fallen", async () => {
    const content = inhalt({ "A.md": "Text A", "B.md": null });
    const ctx = await buildFullContext({
      mode: "note", snap, links, content, manual: [], off: new Set(),
      linkDepth: 1, budget: 10000, lang: "de",
    });
    expect(ctx.items.map((i) => i.path)).toEqual(["A.md"]);
  });

  it("wendet das Budget an und meldet die Kuerzung", async () => {
    const content = inhalt({ "A.md": "x".repeat(5000), "B.md": "y".repeat(5000) });
    const ctx = await buildFullContext({
      mode: "note", snap, links, content, manual: [], off: new Set(),
      linkDepth: 1, budget: 2000, lang: "de",
    });
    expect(ctx.items.every((i) => i.fullChars === 5000)).toBe(true);
    expect(ctx.text).toContain("gekürzt: 1000 von 5000 Zeichen");
  });

  it("nimmt im Modus Alle Tabs die Tabs statt der Links", async () => {
    const content = inhalt({ "A.md": "a", "T.md": "t", "B.md": "b" });
    const ctx = await buildFullContext({
      mode: "tabs", snap, links, content, manual: [], off: new Set(),
      linkDepth: 3, budget: 10000, lang: "de",
    });
    expect(ctx.items.map((i) => i.path)).toEqual(["A.md", "T.md"]);
  });
});
```

- [ ] **Step 6: Test laufen lassen, Rot sehen**

Run: `npx vitest run tests/context_build.test.ts`
Expected: FAIL — `Failed to resolve import "../src/core/context/build"`.

- [ ] **Step 7: Die Komposition schreiben**

Create `src/core/context/build.ts`:

```ts
/* Die einzige Stelle, an der ein Volltext-Block entsteht. Pure — alles Aeussere kommt
 * ueber Ports herein.
 *
 * Reihenfolge ist Absicht: gefiltert wird VOR dem Lesen. Eine abgewaehlte Notiz kostet
 * dadurch keinen Dateizugriff, und die Invariante aus `selection.ts` gilt weiter — es
 * gibt nur EINE Filterung, und sie liegt vor dem Rendern. */
import type { ContentPort, LinkPort, WorkspaceSnapshot } from "./ports";
import type { ContextAttachment } from "./types";
import { collectCandidates } from "./candidates";
import { allocateBudget, type LoadedCandidate } from "./select";
import { renderFullContext } from "./render";
import { itemKey, type SelectionKey } from "./selection";

export interface BuildOptions {
  mode: "note" | "tabs";
  snap: WorkspaceSnapshot;
  links: LinkPort;
  content: ContentPort;
  manual: readonly string[];
  off: ReadonlySet<SelectionKey>;
  linkDepth: number;
  budget: number;
  lang: "de" | "en";
}

export async function buildFullContext(opts: BuildOptions): Promise<ContextAttachment> {
  const kandidaten = collectCandidates({
    mode: opts.mode, snap: opts.snap, links: opts.links,
    linkDepth: opts.linkDepth, manual: opts.manual,
  }).filter((c) => !opts.off.has(itemKey(c.source, c.path)));

  const geladen: LoadedCandidate[] = [];
  for (const c of kandidaten) {
    const text = await opts.content.read(c.path);
    if (text === null) continue;
    geladen.push({ ...c, content: text });
  }

  return renderFullContext(allocateBudget(geladen, opts.budget), opts.mode, opts.lang);
}
```

- [ ] **Step 8: Test laufen lassen, Grün sehen**

Run: `npx vitest run tests/context_build.test.ts && npx vitest run tests/context_render.test.ts`
Expected: beide PASS.

- [ ] **Step 9: Gegenprobe — den Filter hinter das Lesen schieben**

In `build.ts` das `.filter(...)` von der Kandidatenliste entfernen und stattdessen die
`geladen`-Liste nach der Schleife filtern.
Run: `npx vitest run tests/context_build.test.ts`
Expected: FAIL in „laesst einen abgewaehlten Eintrag heraus — und liest ihn gar nicht erst" (`content.read` wurde mit `B.md` gerufen). Der Block wäre inhaltlich noch richtig — genau deshalb prüft der Test den **Aufruf**, nicht nur das Ergebnis. Mutation zurücknehmen, erneut grün.

- [ ] **Step 10: Gate + Commit**

```bash
npm run gate
git add src/core/context/render.ts src/core/context/build.ts tests/context_render.test.ts tests/context_build.test.ts
git commit -m "feat(kontext): Volltext-Block bauen und rendern, Kuerzung meldet sich je Eintrag"
```

---

### Task 5: Obsidian-Adapter — `linkPort` und `contentPort`

**Files:**
- Create: `src/obsidian/links.ts`
- Test: `tests/context_links_adapter.test.ts`

**Interfaces:**
- Consumes: `LinkPort`, `ContentPort` aus `../core/context/ports`.
- Produces: `function linkPort(app: App): LinkPort`, `function contentPort(app: App): ContentPort`.

ⓘ **Ein Kit-Rückfluss ist hier NICHT nötig, und das ist gemessen, nicht angenommen.** Dem vendorten Mock fehlen `metadataCache.resolvedLinks` und `vault.getFileByPath`. Beide hängen aber an **Objektliteralen** in `makeFakeApp()` (`obsidian-mock.ts:780`, `:825`), sind im Test als `any` zugänglich und lassen sich dort direkt setzen. Das ist derselbe Fall wie bei `move_note` am 2026-09-04, wo der Entwurf einen Rückfluss für nötig hielt und die Messung am Code das Gegenteil ergab. `MOCK_REF` bleibt auf `0.31.0`.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Create `tests/context_links_adapter.test.ts`:

```ts
/* Der Obsidian-Adapter der Link- und Inhalts-Ports. Gepinnt wird vor allem die Richtung:
 * `resolvedLinks` ist Quelle → Ziel → Anzahl, Backlinks sind die Gegenrichtung, die
 * Obsidian nicht fertig vorhaelt (dieselbe Stelle wie `backlinkCount` in main.ts). */
import { describe, it, expect } from "vitest";
import { makeFakeApp, TFile } from "obsidian";
import { linkPort, contentPort } from "../src/obsidian/links";

function app(links: Record<string, Record<string, number>>): any {
  const a: any = makeFakeApp();
  a.metadataCache.resolvedLinks = links;
  return a;
}

describe("linkPort", () => {
  const a = app({ "A.md": { "B.md": 1, "C.md": 2 }, "Z.md": { "A.md": 1 }, "B.md": {} });

  it("liefert ausgehende Links als Zielpfade", () => {
    expect(linkPort(a).outgoing("A.md")).toEqual(["B.md", "C.md"]);
  });

  it("liefert Backlinks als Quellpfade, ohne die Notiz selbst", () => {
    expect(linkPort(a).backlinks("A.md")).toEqual(["Z.md"]);
  });

  it("zaehlt eine Selbstreferenz nicht als eigenen Backlink", () => {
    const b = app({ "S.md": { "S.md": 1 } });
    expect(linkPort(b).backlinks("S.md")).toEqual([]);
  });

  it("liefert leere Listen fuer eine unbekannte Notiz statt zu werfen", () => {
    expect(linkPort(a).outgoing("Weg.md")).toEqual([]);
    expect(linkPort(a).backlinks("Weg.md")).toEqual([]);
  });
});

describe("contentPort", () => {
  it("liest ueber cachedRead", async () => {
    const a: any = makeFakeApp();
    const datei = new TFile("A.md");
    a.vault.getFileByPath = (p: string) => (p === "A.md" ? datei : null);
    a.vault.cachedRead = (f: unknown) => Promise.resolve(f === datei ? "Inhalt" : "");
    await expect(contentPort(a).read("A.md")).resolves.toBe("Inhalt");
  });

  it("liefert null statt zu werfen, wenn es die Datei nicht gibt", async () => {
    const a: any = makeFakeApp();
    a.vault.getFileByPath = () => null;
    await expect(contentPort(a).read("Weg.md")).resolves.toBeNull();
  });

  it("liefert null, wenn das Lesen scheitert", async () => {
    const a: any = makeFakeApp();
    a.vault.getFileByPath = () => new TFile("A.md");
    a.vault.cachedRead = () => Promise.reject(new Error("kaputt"));
    await expect(contentPort(a).read("A.md")).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Rot sehen**

Run: `npx vitest run tests/context_links_adapter.test.ts`
Expected: FAIL — `Failed to resolve import "../src/obsidian/links"`.

- [ ] **Step 3: Den Adapter schreiben**

Create `src/obsidian/links.ts`:

```ts
import type { App } from "obsidian";
import type { ContentPort, LinkPort } from "../core/context/ports";

/** `metadataCache.resolvedLinks` ist Quelle → Ziel → Anzahl. Ausgehende Links sind damit
 *  ein Lookup, Backlinks eine Iteration ueber alle Quellen — dieselbe Gegenrichtung wie
 *  `backlinkCount` in `main.ts`. Bei ~1.200 Notizen ist das trivial (Spec E3); wer hier
 *  einmal einen Index baut, baut Retrieval, und das gehoert vault-rag.
 *
 *  UNAUFGELOESTE Links stehen in `resolvedLinks` nicht — sie fallen also von selbst weg,
 *  ohne dass der Kern etwas davon wissen muss. */
export function linkPort(app: App): LinkPort {
  return {
    outgoing: (path) => Object.keys(app.metadataCache.resolvedLinks[path] ?? {}),
    backlinks: (path) => {
      const alle = app.metadataCache.resolvedLinks;
      return Object.keys(alle).filter((quelle) => quelle !== path && (alle[quelle]?.[path] ?? 0) > 0);
    },
  };
}

/** `cachedRead`, nicht `read`: der Inhalt geht in einen Prompt, nicht in eine Schreib-
 *  operation — Obsidians Lesecache ist dafuer genau richtig und spart bei „Alle Tabs"
 *  ein Dutzend Dateizugriffe je Nachricht. */
export function contentPort(app: App): ContentPort {
  return {
    read: async (path) => {
      const file = app.vault.getFileByPath(path);
      if (file === null) return null;
      return await app.vault.cachedRead(file).catch(() => null);
    },
  };
}
```

- [ ] **Step 4: Test laufen lassen, Grün sehen**

Run: `npx vitest run tests/context_links_adapter.test.ts`
Expected: PASS, 7 Tests.

- [ ] **Step 5: Gegenprobe — die Backlink-Richtung umdrehen**

In `linkPort.backlinks` das `(alle[quelle]?.[path] ?? 0)` durch `(alle[path]?.[quelle] ?? 0)` ersetzen.
Run: `npx vitest run tests/context_links_adapter.test.ts`
Expected: FAIL in „liefert Backlinks als Quellpfade" (`["B.md", "C.md"]` statt `["Z.md"]`). Mutation zurücknehmen, erneut grün. Ohne diese Probe wäre der Test gegen die häufigste Verwechslung dieser API blind.

- [ ] **Step 6: Gate + Commit**

```bash
npm run gate
git add src/obsidian/links.ts tests/context_links_adapter.test.ts
git commit -m "feat(kontext): Obsidian-Adapter fuer Link-Nachbarschaft und Notiz-Inhalt"
```

---

### Task 6: Die zwei Modi freischalten — `currentContext()` wird asynchron

**Files:**
- Modify: `src/core/context/types.ts:10`
- Modify: `src/main.ts` (Import-Block, `currentContext()`, `ask()`)
- Modify: `src/i18n/strings.ts` (`settings.contextMode.desc` in DE und EN)
- Test: `tests/context_types.test.ts` (falls vorhanden, sonst neu)

**Interfaces:**
- Consumes: `buildFullContext` aus `../core/context/build` (Task 4), `linkPort`/`contentPort` aus `./obsidian/links` (Task 5), `contextBudgetChars`/`contextLinkDepth` (Task 1).
- Produces: `KodaPlugin.currentContext(): Promise<ContextAttachment | null>` — **Signaturwechsel**, jeder Aufrufer muss `await`. `AVAILABLE_MODES` enthält jetzt `["off", "workspace", "note", "tabs"]`.

⚠️ **Vor dem ersten Edit die Aufrufer zählen** (Lehre 2026-08-14, `3d-codeblocks`: wer etwas wegnimmt, prüft, wer es liest):

```bash
grep -rn "currentContext()" src/ scripts/ tests/
```
Erwartet werden Treffer in `src/main.ts` (Definition + `ask()`), `src/core/context/panel-vm.ts` (nur im Kommentar) und `scripts/gui-smoke.ts` (Punkt 30). Jeder davon wird in diesem Task oder in Task 11 nachgezogen; ein hier übersehener Aufrufer bekommt ein `Promise` in einen String-Vergleich und scheitert **still**.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Create `tests/context_types.test.ts` (oder die `describe`-Blöcke an eine vorhandene Datei anfügen):

```ts
import { describe, it, expect } from "vitest";
import { AVAILABLE_MODES, CONTEXT_MODES } from "../src/core/context/types";

describe("AVAILABLE_MODES", () => {
  it("bietet nach Etappe 2b vier Modi an", () => {
    expect([...AVAILABLE_MODES]).toEqual(["off", "workspace", "note", "tabs"]);
  });

  it("bietet den Vault-Modus noch nicht an — er braucht vault-rag und kommt in Etappe 3", () => {
    expect(AVAILABLE_MODES).not.toContain("vault");
    expect(CONTEXT_MODES).toContain("vault");
  });
});
```

- [ ] **Step 2: Test laufen lassen, Rot sehen**

Run: `npx vitest run tests/context_types.test.ts`
Expected: FAIL — erwartet vier Modi, bekommt `["off", "workspace"]`.

- [ ] **Step 3: Die Modi freischalten**

`src/core/context/types.ts` Zeile 7–10 ersetzen:

```ts
/** Angeboten wird nur, was gebaut ist (Spec E6: „ein Eintrag, der nie geht, ist kein
 *  Versprechen"). Etappe 2b hat Notiz und Alle Tabs; „vault" braucht vault-rag und kommt
 *  mit Etappe 3 — es ist der einzige Modus, dessen Verfuegbarkeit von einem fremden
 *  Plugin abhaengt und deshalb zur Laufzeit geprueft werden muss, nicht hier. */
export const AVAILABLE_MODES: readonly ContextMode[] = ["off", "workspace", "note", "tabs"];
```

- [ ] **Step 4: Test laufen lassen, Grün sehen**

Run: `npx vitest run tests/context_types.test.ts`
Expected: PASS.

- [ ] **Step 5: `currentContext()` asynchron machen**

In `src/main.ts` den Import-Block ergänzen:

```ts
import { buildFullContext } from "./core/context/build";
import { contentPort, linkPort } from "./obsidian/links";
```

Die Methode `currentContext()` vollständig ersetzen:

```ts
  /** Der Kontext, der mit der naechsten Nachricht geht — `ask()` ruft DIESE Methode, der
   *  GUI-Smoke misst sie: es gibt keinen zweiten Weg, auf dem der Block entsteht.
   *
   *  Asynchron seit Etappe 2b: die Volltext-Modi lesen Notizen. Ein Inhalts-Cache im
   *  Plugin waere synchron geblieben und haette eine zweite Wahrheit neben der Datei
   *  eingefuehrt — `ask()` ist ohnehin async und wartet hier an Ort und Stelle. */
  async currentContext(): Promise<ContextAttachment | null> {
    const s = this.settings;
    const snap = readWorkspace(this.app, VIEW_TYPE_KODA);
    switch (this.contextMode) {
      case "off":
        return null;
      case "workspace":
        return renderWorkspaceContext(applySelection(snap, this.contextOff), {
          lang: this.promptLang(),
          selectionMax: s.contextSelectionChars,
          tabsMax: s.contextTabsMax,
          frontmatterMax: s.contextFrontmatterChars,
        });
      case "note":
      case "tabs":
        return await buildFullContext({
          mode: this.contextMode,
          snap,
          links: linkPort(this.app),
          content: contentPort(this.app),
          manual: this.contextManual,
          off: this.contextOff,
          linkDepth: s.contextLinkDepth,
          budget: s.contextBudgetChars,
          lang: this.promptLang(),
        });
      default:
        // "vault" — Etappe 3. Kein Wurf: der Modus kann als gespeicherter Default aus
        // einer spaeteren Version in einer aelteren stehen (der onload-Guard faengt das
        // beim Laden ab, aber ein Nutzer kann `data.json` von Hand aendern).
        return null;
    }
  }
```

Damit `this.contextManual` hier schon existiert, wird **das Feld** in diesem Task angelegt (die Mutatoren kommen in Task 7) — hinter `contextOff`:

```ts
  /** Vom Nutzer hinzugefuegte Notizen, in der Reihenfolge des Hinzufuegens. Wie
   *  `contextOff` nicht persistiert: eine Zusammenstellung gilt fuer diese Sitzung.
   *  Gefuellt wird sie in Task 7. */
  contextManual: string[] = [];
```

- [ ] **Step 6: Den einen Aufrufer nachziehen**

In `ask()` (derzeit `src/main.ts:460`):

```ts
      const ctx = await this.currentContext();
```

- [ ] **Step 7: Die Modus-Beschreibung in den Einstellungen berichtigen**

Beide Fassungen behaupten, Notiz und Alle Tabs seien nicht gebaut. In `src/i18n/strings.ts`:

`en`, `"settings.contextMode.desc"` — der letzte Satz wird zu:

```
Note adds the active note in full plus its linked neighbours; All tabs adds every open note in full — both limited by the content budget. Vault is not built yet and is not offered in the chat.
```

`de`, `"settings.contextMode.desc"` — der letzte Satz wird zu:

```
Notiz nimmt die aktive Notiz vollständig mit, dazu ihre verlinkten Nachbarn; Alle Tabs nimmt jede offene Notiz vollständig — beide begrenzt durch das Inhalts-Budget. Vault ist noch nicht gebaut und wird im Chat nicht angeboten.
```

- [ ] **Step 8: Gate + Commit**

```bash
npm run gate
git add src/core/context/types.ts src/main.ts src/i18n/strings.ts tests/context_types.test.ts
git commit -m "feat(kontext): Modi Notiz und Alle Tabs freischalten, currentContext wird asynchron"
```

⚠️ Der Gate-Lauf **muss** hier grün sein, bevor es weitergeht: der Signaturwechsel ist der einzige Punkt dieses Plans, an dem ein übersehener Aufrufer ein `Promise` als Wert behandeln würde. `npm run typecheck` fängt jeden Aufrufer in `src/`; `scripts/gui-smoke.ts` fängt `typecheck:scripts` **nicht**, weil der Aufruf dort in einer CDP-Zeichenkette steht — er wird in Task 11 von Hand nachgezogen.

---

### Task 7: Manuelle Einträge — Zustand, zwei Picker, drei Befehle

**Files:**
- Create: `src/obsidian/note-picker.ts`, `src/obsidian/folder-picker.ts`
- Modify: `src/main.ts`
- Modify: `src/i18n/strings.ts`
- Test: `tests/context_manual.test.ts`

**Interfaces:**
- Consumes: `FolderSuggest` aus `../vendor/kit-obsidian/folder-suggest`.
- Produces:
  - `function pickNote(app: App): Promise<string | null>`
  - `function pickFolder(app: App): Promise<string | null>`
  - `KodaPlugin.contextManual: string[]`, `addContextPaths(paths: readonly string[]): void`, `removeContextPath(path: string): void`
  - Befehle `context-add-active`, `context-add-note`, `context-add-folder`

**Entscheidungen dieses Tasks:**
- **D5 (Ordner sofort auflösen):** „+ Ordner" trägt die Markdown-Pfade des Ordners einzeln ein, nicht den Ordner. Begründung oben.
- **D8 (das Kreuz an einem manuellen Chip entfernt, es wählt nicht ab):** Ein abgewählter manueller Eintrag bliebe für immer in der Liste und wäre ein Chip ohne Zweck. Entfernen ist umkehrbar über den Picker, der ihn hinzugefügt hat. Der Chip sagt das über sein `aria-label`.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Create `tests/context_manual.test.ts`:

```ts
/* Der manuelle Anteil des Arbeitskontexts als reiner Zustand. Getestet wird die Regel,
 * nicht die Obsidian-Schale: doppelt hinzugefuegt ist einmal drin, die Reihenfolge des
 * Hinzufuegens bleibt, und Entfernen trifft genau einen Eintrag. */
import { describe, it, expect } from "vitest";
import { addPaths, removePath } from "../src/core/context/manual";

describe("addPaths", () => {
  it("haengt in der Reihenfolge des Hinzufuegens an", () => {
    expect(addPaths([], ["b.md", "a.md"])).toEqual(["b.md", "a.md"]);
  });

  it("nimmt einen bereits vorhandenen Pfad nicht zweimal auf", () => {
    expect(addPaths(["a.md"], ["a.md", "b.md"])).toEqual(["a.md", "b.md"]);
  });

  it("entdoppelt auch innerhalb eines Aufrufs", () => {
    expect(addPaths([], ["a.md", "a.md"])).toEqual(["a.md"]);
  });

  it("gibt bei nichts Neuem dieselbe Liste zurueck (der Aufrufer kann darauf pruefen)", () => {
    const vorher = ["a.md"];
    expect(addPaths(vorher, ["a.md"])).toBe(vorher);
  });
});

describe("removePath", () => {
  it("entfernt genau einen Eintrag", () => {
    expect(removePath(["a.md", "b.md"], "a.md")).toEqual(["b.md"]);
  });

  it("gibt bei einem unbekannten Pfad dieselbe Liste zurueck", () => {
    const vorher = ["a.md"];
    expect(removePath(vorher, "x.md")).toBe(vorher);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Rot sehen**

Run: `npx vitest run tests/context_manual.test.ts`
Expected: FAIL — `Failed to resolve import "../src/core/context/manual"`.

- [ ] **Step 3: Das pure Modul schreiben**

Create `src/core/context/manual.ts`:

```ts
/* Der manuell hinzugefuegte Anteil des Kontexts. Pure — der Zustand lebt im Plugin.
 *
 * Beide Funktionen geben bei „nichts geaendert" die EINGANGSLISTE zurueck (Referenz-
 * gleichheit), nicht eine gleiche Kopie: der Aufrufer erkennt daran, ob er die Views
 * neu zeichnen muss. Dieselbe Bauart wie `applySelection` in `selection.ts`. */
export function addPaths(current: readonly string[], zusatz: readonly string[]): string[] {
  const vorhanden = new Set(current);
  const neu: string[] = [];
  for (const p of zusatz) {
    if (vorhanden.has(p)) continue;
    vorhanden.add(p);
    neu.push(p);
  }
  return neu.length === 0 ? (current as string[]) : [...current, ...neu];
}

export function removePath(current: readonly string[], path: string): string[] {
  if (!current.includes(path)) return current as string[];
  return current.filter((p) => p !== path);
}
```

- [ ] **Step 4: Test laufen lassen, Grün sehen**

Run: `npx vitest run tests/context_manual.test.ts`
Expected: PASS, 6 Tests.

- [ ] **Step 5: Den Notiz-Picker übernehmen**

Create `src/obsidian/note-picker.ts` — **wörtlich** aus `../vault-rag/src/note_picker.ts`, mit Herkunftsstempel und angepasstem i18n-Import:

```ts
// uebernommen aus vault-rag/src/note_picker.ts, 2026-09-05
import { App, FuzzySuggestModal, TFile } from "obsidian";
import { t } from "../vendor/kit/i18n";

class NotePicker extends FuzzySuggestModal<TFile> {
  private settled = false;
  constructor(app: App, private done: (p: string | null) => void) {
    super(app);
    this.setPlaceholder(t("picker.note.placeholder"));
  }
  private settle(p: string | null): void { if (!this.settled) { this.settled = true; this.done(p); } }
  getItems(): TFile[] { return this.app.vault.getMarkdownFiles(); }
  getItemText(f: TFile): string { return f.path; }
  onChooseItem(f: TFile): void { this.settle(f.path); }
  onClose(): void {
    super.onClose();
    // Abbruch (null) erst nach einem Tick melden: feuern onChooseItem + onClose bei einer
    // Auswahl gemeinsam, gewinnt so die Auswahl unabhaengig von der Reihenfolge (sonst
    // ueberschreibt null den Pfad).
    window.setTimeout(() => this.settle(null), 0);
  }
}

/** Oeffnet einen Fuzzy-Picker ueber alle Vault-Notizen; gewaehlter Pfad oder null. */
export function pickNote(app: App): Promise<string | null> {
  return new Promise((resolve) => new NotePicker(app, resolve).open());
}
```

- [ ] **Step 6: Den Ordner-Picker schreiben**

Create `src/obsidian/folder-picker.ts`:

```ts
import { App, Modal, Setting } from "obsidian";
import { FolderSuggest } from "../vendor/kit-obsidian/folder-suggest";
import { t } from "../vendor/kit/i18n";

/** Ein Ordner statt einer Notiz. Anders als beim Notiz-Picker gibt es dafuer keinen
 *  nativen Fuzzy-Picker — Obsidian bietet `AbstractInputSuggest`, und der vendorte
 *  `FolderSuggest` haengt sie an ein Textfeld. Ein Modal um dieses Feld ist die kleinste
 *  Schale, die daraus einen Auswahl-Vorgang macht. */
class FolderPicker extends Modal {
  private settled = false;
  private wert = "";
  constructor(app: App, private done: (p: string | null) => void) { super(app); }

  onOpen(): void {
    this.titleEl.setText(t("picker.folder.title"));
    new Setting(this.contentEl)
      .setName(t("picker.folder.field"))
      .addText((text) => {
        new FolderSuggest(this.app, text.inputEl);
        text.onChange((v) => { this.wert = v; });
        text.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
          if (evt.key === "Enter") { evt.preventDefault(); this.settle(this.wert); this.close(); }
        });
      });
    new Setting(this.contentEl).addButton((b) =>
      b.setButtonText(t("picker.folder.take")).setCta().onClick(() => { this.settle(this.wert); this.close(); }),
    );
  }

  private settle(p: string): void { if (!this.settled) { this.settled = true; this.done(p); } }

  onClose(): void {
    this.contentEl.empty();
    // Derselbe Tick-Trick wie im Notiz-Picker: ein Klick auf „Übernehmen" schliesst das
    // Modal, und ohne die Verzoegerung ueberschriebe der Abbruch die Auswahl.
    window.setTimeout(() => { if (!this.settled) { this.settled = true; this.done(null); } }, 0);
  }
}

/** Leerer String heisst Vault-Wurzel und ist eine gueltige Antwort; `null` heisst Abbruch. */
export function pickFolder(app: App): Promise<string | null> {
  return new Promise((resolve) => new FolderPicker(app, resolve).open());
}
```

- [ ] **Step 7: Texte für die Picker anlegen**

`en`:

```ts
    "picker.note.placeholder": "Which note should go along?",
    "picker.folder.title": "Add a folder to the context",
    "picker.folder.field": "Folder",
    "picker.folder.take": "Add",
    "picker.folder.empty": "No notes in “{0}”.",
    "cmd.contextAddActive": "Context: add the active note",
    "cmd.contextAddNote": "Context: add a note…",
    "cmd.contextAddFolder": "Context: add a folder…",
```

`de`:

```ts
    "picker.note.placeholder": "Welche Notiz soll mitgehen?",
    "picker.folder.title": "Ordner zum Kontext hinzufügen",
    "picker.folder.field": "Ordner",
    "picker.folder.take": "Hinzufügen",
    "picker.folder.empty": "Keine Notizen in „{0}“.",
    "cmd.contextAddActive": "Kontext: aktive Notiz hinzufügen",
    "cmd.contextAddNote": "Kontext: Notiz hinzufügen…",
    "cmd.contextAddFolder": "Kontext: Ordner hinzufügen…",
```

- [ ] **Step 8: Zustand und Befehle in `main.ts`**

Import-Block ergänzen:

```ts
import { addPaths, removePath } from "./core/context/manual";
import { pickNote } from "./obsidian/note-picker";
import { pickFolder } from "./obsidian/folder-picker";
import { resolveFolderPath } from "./core/tools/path-guard";
```

Den Kommentar an `contextManual` (aus Task 6) auf die volle Fassung ziehen und die drei Methoden dahinter einfügen:

```ts
  /** Vom Nutzer hinzugefuegte Notizen, in der Reihenfolge des Hinzufuegens. Wie
   *  `contextOff` nicht persistiert — eine Zusammenstellung gilt fuer diese Sitzung.
   *  Wirkt in den Modi Notiz und Alle Tabs; im Modus Arbeitsplatz stehen die Chips
   *  weiter da, tragen dort aber einen Hinweis statt einer Groesse (der Block schickt
   *  Zeiger, keine Inhalte — Spec E1). */
  contextManual: string[] = [];

  addContextPaths(paths: readonly string[]): void {
    const naechster = addPaths(this.contextManual, paths);
    if (naechster === this.contextManual) return;
    this.contextManual = naechster;
    for (const v of this.views()) v.syncContextPanel();
  }

  removeContextPath(path: string): void {
    const naechster = removePath(this.contextManual, path);
    if (naechster === this.contextManual) return;
    this.contextManual = naechster;
    for (const v of this.views()) v.syncContextPanel();
  }

  /** „+ Ordner": die Markdown-Pfade des Ordners werden SOFORT einzeln eingetragen, nicht
   *  der Ordner gemerkt. Ein gemerkter Ordner aenderte seinen Inhalt zwischen zwei
   *  Nachrichten, ohne dass der Nutzer etwas tut — die Chips zeigten dann etwas anderes
   *  als der Block. Rekursiv, weil ein Ordner mit Unterordnern sonst fast leer wirkt. */
  async addContextFolder(): Promise<void> {
    const ordner = await pickFolder(this.app);
    if (ordner === null) return;
    const norm = resolveFolderPath(ordner);
    const praefix = norm === "" ? "" : `${norm}/`;
    const pfade = this.app.vault.getMarkdownFiles().map((f) => f.path).filter((p) => p.startsWith(praefix)).sort();
    if (pfade.length === 0) { new Notice(t("picker.folder.empty", ordner)); return; }
    this.addContextPaths(pfade);
  }
```

In `onload()` hinter den `context-mode-*`-Befehlen:

```ts
    this.addCommand({
      id: "context-add-active",
      name: t("cmd.contextAddActive"),
      callback: () => {
        const aktiv = readWorkspace(this.app, VIEW_TYPE_KODA).active;
        if (aktiv !== null) this.addContextPaths([aktiv.path]);
      },
    });
    this.addCommand({
      id: "context-add-note",
      name: t("cmd.contextAddNote"),
      callback: () => void pickNote(this.app).then((p) => { if (p !== null) this.addContextPaths([p]); }),
    });
    this.addCommand({
      id: "context-add-folder",
      name: t("cmd.contextAddFolder"),
      callback: () => void this.addContextFolder(),
    });
```

In `resetContextSelection()` die Bedingung und den Rumpf erweitern, damit „Auswahl zurücksetzen" auch das Manuelle räumt (Spec § E6: bis „Auswahl zurücksetzen" oder neues Gespräch):

```ts
  resetContextSelection(): void {
    if (this.contextOff.size === 0 && this.contextManual.length === 0) return;
    this.contextOff.clear();
    this.contextManual = [];
    for (const v of this.views()) v.syncContextPanel();
  }
```

`Notice` in den `obsidian`-Import von `main.ts` aufnehmen — gemessen 2026-09-05 steht es dort **nicht** (Zeile 1 importiert `Plugin`, `WorkspaceLeaf`, `normalizePath`, `Editor`, `Menu`). `resolveFolderPath` ist ebenfalls neu in dieser Datei.

- [ ] **Step 9: Gate + Commit**

```bash
npm run gate
git add src/core/context/manual.ts src/obsidian/note-picker.ts src/obsidian/folder-picker.ts src/main.ts src/i18n/strings.ts tests/context_manual.test.ts
git commit -m "feat(kontext): Notizen und Ordner von Hand hinzufuegen, drei Befehle"
```

---

### Task 8: Der Kontext-Tab zeigt die neuen Quellen

**Files:**
- Modify: `src/core/context/panel-vm.ts`
- Modify: `src/obsidian/context-panel.ts`
- Modify: `src/obsidian/view.ts` (Host-Vertrag)
- Modify: `src/main.ts` (`contextViewModel()`)
- Modify: `src/i18n/strings.ts`
- Modify: `styles.css`
- Test: `tests/context_panel_vm.test.ts` (erweitert)

**Interfaces:**
- Consumes: `collectCandidates`, `buildFullContext`, `linkPort`/`contentPort`.
- Produces:
  - `PanelChip` bekommt `removable: boolean`
  - `PanelViewModel` bekommt `depth: number | null` (Tiefe-Stepper; `null` außerhalb des Modus Notiz) und `manualEnabled: boolean`
  - `buildPanelViewModel(opts): Promise<PanelViewModel>` — **Signaturwechsel auf async**
  - `ContextPanelHost` bekommt `viewModel(): Promise<PanelViewModel>`, `addActive()`, `addNote()`, `addFolder()`, `setDepth(n: number)`

- [ ] **Step 1: Die vorhandenen Tests auf `await` ziehen und die neuen schreiben**

In `tests/context_panel_vm.test.ts` jeden Aufruf `buildPanelViewModel(...)` zu `await buildPanelViewModel(...)` machen, die umgebenden `it(...)` zu `async`, und den Options-Aufruf um die neuen Felder ergänzen. Dann anfügen:

```ts
import { buildFullContext } from "../src/core/context/build";

const links = { outgoing: (p: string) => (p === "A.md" ? ["B.md"] : []), backlinks: () => [] };
const content = { read: (p: string) => Promise.resolve(p === "A.md" ? "Text A" : "Text B") };

function opts(extra: Record<string, unknown> = {}) {
  return {
    lang: "de" as const, selectionMax: 600, tabsMax: 12, frontmatterMax: 300,
    windowTokens: 8192, budget: 20000, linkDepth: 1, manual: [], links, content,
    ...extra,
  };
}

describe("Kontext-Tab im Modus Notiz", () => {
  const snap = {
    active: { path: "A.md", frontmatter: null, selection: "", cursorLine: 1, lineCount: 1 },
    tabs: [{ path: "A.md", viewType: "markdown" }],
  };

  it("zeigt aktive Notiz und verlinkte Nachbarn als Chips", async () => {
    const vm = await buildPanelViewModel("note", snap, new Set(), opts());
    const notiz = vm.sections.find((s) => s.id === "note");
    expect(notiz?.chips.map((c) => c.path)).toEqual(["A.md", "B.md"]);
    expect(notiz?.chips[1]?.hint).toContain("Ebene 1");
  });

  it("meldet die Groesse jedes GESENDETEN Chips aus demselben Block, der gesendet wird", async () => {
    const vm = await buildPanelViewModel("note", snap, new Set(), opts());
    const ctx = await buildFullContext({
      mode: "note", snap, links, content, manual: [], off: new Set(),
      linkDepth: 1, budget: 20000, lang: "de",
    });
    const chip = vm.sections.find((s) => s.id === "note")?.chips.find((c) => c.path === "B.md");
    const item = ctx.items.find((i) => i.path === "B.md");
    expect(chip?.hint).toContain(String(item?.chars));
  });

  it("zeigt einen abgewaehlten Chip weiter an — sonst waere er unerreichbar", async () => {
    const off = new Set([itemKey("link", "B.md")]);
    const vm = await buildPanelViewModel("note", snap, off, opts());
    const chip = vm.sections.find((s) => s.id === "note")?.chips.find((c) => c.path === "B.md");
    expect(chip?.off).toBe(true);
  });

  it("stellt den Tiefe-Stepper nur im Modus Notiz bereit", async () => {
    expect((await buildPanelViewModel("note", snap, new Set(), opts())).depth).toBe(1);
    expect((await buildPanelViewModel("tabs", snap, new Set(), opts())).depth).toBeNull();
    expect((await buildPanelViewModel("workspace", snap, new Set(), opts())).depth).toBeNull();
  });
});

describe("Abschnitt Manuell", () => {
  const snap = { active: null, tabs: [] };

  it("fuehrt manuelle Eintraege als entfernbare Chips", async () => {
    const vm = await buildPanelViewModel("note", snap, new Set(), opts({ manual: ["M.md"] }));
    const manuell = vm.sections.find((s) => s.id === "manual");
    expect(manuell?.chips).toHaveLength(1);
    expect(manuell?.chips[0]?.removable).toBe(true);
  });

  it("sagt im Modus Arbeitsplatz, dass Manuelles dort nicht wirkt — statt es zu verschweigen", async () => {
    const vm = await buildPanelViewModel("workspace", snap, new Set(), opts({ manual: ["M.md"] }));
    const manuell = vm.sections.find((s) => s.id === "manual");
    expect(vm.manualEnabled).toBe(false);
    expect(manuell?.chips[0]?.hint).toContain("Notiz");
  });
});
```

- [ ] **Step 2: Test laufen lassen, Rot sehen**

Run: `npx vitest run tests/context_panel_vm.test.ts`
Expected: FAIL — `buildPanelViewModel` nimmt drei Argumente in anderer Form und liefert kein `Promise`.

- [ ] **Step 3: `panel-vm.ts` umbauen**

Die Datei bekommt eine neue Signatur und drei Abschnittsbauer. Der bisherige Arbeitsplatz-Zweig bleibt **wörtlich erhalten** und wandert nur in eine eigene Funktion — der Umbau darf ihn nicht verändern (Lehre Etappe 2a, Befund 1: eine reine Verschiebung und eine Verhaltensänderung gehören nie in denselben Schritt).

Neue öffentliche Form am Kopf der Datei:

```ts
export interface PanelChip {
  source: ContextSource;
  path: string;
  label: string;
  hint: string;
  off: boolean;
  /** Das Kreuz ENTFERNT statt abzuwaehlen — nur bei manuellen Eintraegen. Ein abgewaehlter
   *  manueller Eintrag bliebe sonst fuer immer als Chip ohne Zweck stehen. */
  removable: boolean;
}

export interface PanelViewModel {
  sections: PanelSection[];
  chars: number;
  summary: string;
  state: "is-ok" | "is-warning";
  hasOff: boolean;
  /** Link-Tiefe fuer den Stepper; `null` ausserhalb des Modus Notiz. */
  depth: number | null;
  /** Ob manuelle Eintraege im aktuellen Modus ueberhaupt mitgehen (Spec E1: der
   *  Arbeitsplatz-Block schickt Zeiger, keine Inhalte). */
  manualEnabled: boolean;
}

export interface PanelOptions {
  lang: "de" | "en";
  selectionMax: number;
  tabsMax: number;
  frontmatterMax: number;
  windowTokens: number;
  budget: number;
  linkDepth: number;
  manual: readonly string[];
  links: LinkPort;
  content: ContentPort;
}

export async function buildPanelViewModel(
  mode: Exclude<ContextMode, "off" | "vault">,
  snap: WorkspaceSnapshot,
  off: ReadonlySet<SelectionKey>,
  opts: PanelOptions,
): Promise<PanelViewModel> { … }
```

Der Rumpf:

```ts
  const t = T[opts.lang];
  const sections: PanelSection[] = [];
  const manualEnabled = mode !== "workspace";

  let text: string;
  if (mode === "workspace") {
    sections.push(workspaceSection(snap, off, opts, t));
    text = renderWorkspaceContext(applySelection(snap, off), opts).text;
  } else {
    // Chips kommen aus der UNGEFILTERTEN Kandidatenliste: ein abgewaehlter Eintrag muss
    // sichtbar bleiben, sonst gaebe es keinen Weg zurueck. Die GROESSEN kommen dagegen aus
    // dem gefilterten Block — es gibt also genau EINE Filterung (in `buildFullContext`),
    // und die Chip-Liste leitet keine zweite ab. Genau hier riss in Etappe 2a der einzige
    // Riss auf, der kein Task-Review sah.
    const ctx = await buildFullContext({
      mode, snap, links: opts.links, content: opts.content,
      manual: opts.manual, off, linkDepth: opts.linkDepth, budget: opts.budget, lang: opts.lang,
    });
    const groessen = new Map(ctx.items.map((i) => [`${i.source}:${i.path}`, i]));
    const kandidaten = collectCandidates({
      mode, snap, links: opts.links, linkDepth: opts.linkDepth, manual: opts.manual,
    });
    sections.push(sourceSection(mode, kandidaten, off, groessen, t));
    text = ctx.text;
  }
  sections.push(manualSection(opts.manual, off, manualEnabled, t));

  const kb = (text.length / 1024).toFixed(1);
  const pct = Math.min(100, Math.round((text.length / CHARS_PER_TOKEN / Math.max(1, opts.windowTokens)) * 100));
  return {
    sections,
    chars: text.length,
    summary: t.summary(kb, pct),
    state: pct >= WARN_AT * 100 ? "is-warning" : "is-ok",
    hasOff: off.size > 0 || opts.manual.length > 0,
    depth: mode === "note" ? opts.linkDepth : null,
    manualEnabled,
  };
```

`sourceSection` baut aus den Kandidaten je einen Chip (`removable: false`), mit Hinweis aus `groessen` — Größe für gesendete Einträge, leer für abgewählte, plus `, Ebene n` bei `depth`. `manualSection` baut `removable: true`-Chips; ohne `manualEnabled` tragen sie statt der Größe den Hinweis `t.manualOff`.

Neue Texte im `T`-Block:

```ts
  de: {
    …,
    note: "Notiz", tabs: "Tabs", manual: "Manuell",
    emptyNote: "Keine aktive Notiz — öffne eine Notiz im Hauptbereich.",
    emptyTabs: "Keine offenen Notizen.",
    emptyManual: "Nichts von Hand hinzugefügt.",
    level: (n: number) => `Ebene ${n}`,
    manualOff: "wirkt in den Modi Notiz und Alle Tabs",
  },
  en: {
    …,
    note: "Note", tabs: "Tabs", manual: "Manual",
    emptyNote: "No active note — open one in the main area.",
    emptyTabs: "No open notes.",
    emptyManual: "Nothing added by hand.",
    level: (n: number) => `level ${n}`,
    manualOff: "takes effect in the Note and All tabs modes",
  },
```

- [ ] **Step 4: Test laufen lassen, Grün sehen**

Run: `npx vitest run tests/context_panel_vm.test.ts`
Expected: PASS — die alten Arbeitsplatz-Tests **und** die neuen.

⚠️ Bleiben die alten Tests rot, ist der Arbeitsplatz-Zweig beim Verschieben verändert worden. Das ist der Abbruchgrund für diesen Schritt, keine Kleinigkeit: die Verschiebung soll nachweislich nichts ändern.

- [ ] **Step 5: `contextViewModel()` nachziehen**

In `src/main.ts`:

```ts
  contextViewModel(): Promise<PanelViewModel> {
    const s = this.settings;
    const modus = this.contextMode === "off" || this.contextMode === "vault" ? "workspace" : this.contextMode;
    return buildPanelViewModel(modus, readWorkspace(this.app, VIEW_TYPE_KODA), this.contextOff, {
      lang: this.promptLang(),
      selectionMax: s.contextSelectionChars,
      tabsMax: s.contextTabsMax,
      frontmatterMax: s.contextFrontmatterChars,
      windowTokens: s.contextWindowTokens,
      budget: s.contextBudgetChars,
      linkDepth: s.contextLinkDepth,
      manual: this.contextManual,
      links: linkPort(this.app),
      content: contentPort(this.app),
    });
  }

  setContextLinkDepth(n: number): void {
    const geklemmt = Math.min(CONTEXT_LINK_DEPTH_MAX, Math.max(CONTEXT_LINK_DEPTH_MIN, Math.round(n)));
    if (geklemmt === this.settings.contextLinkDepth) return;
    this.settings.contextLinkDepth = geklemmt;
    void this.saveSettings();
    for (const v of this.views()) v.syncContextPanel();
  }
```

ⓘ Der Stepper schreibt **dieselbe Einstellung**, die der Settings-Slider schreibt — ein Zustand, zwei Bedienstellen, wie beim Modus-Dropdown. `setContextLinkDepth` klemmt selbst, statt sich auf den Slider zu verlassen.

- [ ] **Step 6: Das Panel asynchron rendern (Generationszähler)**

In `src/obsidian/context-panel.ts` den Host-Vertrag erweitern:

```ts
export interface ContextPanelHost {
  mode(): ContextMode;
  setMode(m: ContextMode): void;
  viewModel(): Promise<PanelViewModel>;
  toggle(source: ContextSource, path: string): void;
  remove(path: string): void;
  addActive(): void;
  addNote(): void;
  addFolder(): void;
  setDepth(n: number): void;
  reset(): void;
  openNote(path: string): void;
  sectionStorage(): CollapsibleStorage;
  lang(): "de" | "en";
}
```

`render()` wird zum Anstoß, `paint(vm)` zum bisherigen Rumpf:

```ts
  /** uebernommen aus vault-rag/src/context_panel.ts:43-52, 2026-09-05 — Generationszaehler
   *  gegen Out-of-Order-Ergebnisse. Seit Etappe 2b liest das ViewModel Dateien; zwei rasch
   *  aufeinanderfolgende Klicks koennen sonst in umgekehrter Reihenfolge ankommen, und das
   *  aeltere Bild ueberschreibt das neuere. Kein Unit-Test sieht das, und der GUI-Smoke
   *  traefe es nur zufaellig — deshalb der Zaehler und nicht „wird schon passen". */
  private gen = 0;

  render(): void {
    const gen = ++this.gen;
    void this.host.viewModel().then((vm) => {
      if (gen !== this.gen) return;
      this.paint(vm);
    });
  }

  private paint(vm: PanelViewModel): void { /* der bisherige Rumpf von render() */ }
```

Im `paint`-Rumpf zusätzlich:
- ein Chip mit `removable` bekommt `aria-label` `t("context.chipRemove")` und ruft `this.host.remove(chip.path)` statt `toggle`;
- der Kopf bekommt, wenn `vm.depth !== null`, einen Stepper (`−` / Zahl / `+`), der `this.host.setDepth(vm.depth ± 1)` ruft — beide Knöpfe mit `role="button"`, `tabindex="0"` und Tastatur-Handler wie die vorhandenen Chip-Ziele;
- unter dem Abschnitt `manual` stehen drei Knöpfe: `t("context.addActive")`, `t("context.addNote")`, `t("context.addFolder")`.

Neue Texte (`en` / `de`):

```ts
    "context.chipRemove": "Remove from the context",
    "context.addActive": "+ Active note",
    "context.addNote": "+ Note…",
    "context.addFolder": "+ Folder…",
    "context.depth": "Link depth",
```
```ts
    "context.chipRemove": "Aus dem Kontext entfernen",
    "context.addActive": "+ Aktive Notiz",
    "context.addNote": "+ Notiz…",
    "context.addFolder": "+ Ordner…",
    "context.depth": "Link-Tiefe",
```

- [ ] **Step 7: Den Host in `view.ts` füllen**

In `src/obsidian/view.ts` das `new ContextPanel({...})`-Literal um die neuen Methoden ergänzen:

```ts
      remove: (p) => { this.plugin.removeContextPath(p); },
      addActive: () => {
        const aktiv = readWorkspace(this.app, VIEW_TYPE_KODA).active;
        if (aktiv !== null) this.plugin.addContextPaths([aktiv.path]);
      },
      addNote: () => void pickNote(this.app).then((p) => { if (p !== null) this.plugin.addContextPaths([p]); }),
      addFolder: () => void this.plugin.addContextFolder(),
      setDepth: (n) => { this.plugin.setContextLinkDepth(n); },
```

- [ ] **Step 8: CSS für Stepper und Manuell-Knöpfe**

An das Ende von `styles.css`, im Koda-Block (nicht in den Kit-Blöcken mit Herkunftsstempel):

```css
.koda-ctx-depth { display: flex; align-items: center; gap: var(--size-2-2); font-size: var(--font-ui-smaller); color: var(--text-muted); }
.koda-ctx-depth button { padding: 0 var(--size-2-2); }
.koda-ctx-add { display: flex; flex-wrap: wrap; gap: var(--size-2-2); margin-top: var(--size-2-2); }
.koda-ctx-add button { font-size: var(--font-ui-smaller); }
```

⚠️ **Jede Metazeile bekommt eine explizite Schriftgröße** (`--font-ui-small`/`--font-ui-smaller`). `tools/ui_adoption_check.py` sieht Typografie **nicht** — in `anysource-sideloader` meldete er null Befunde, während `<h3>` ohne Größenregel in der Sidebar viel zu groß stand. Referenz ist `vault-crews`.

- [ ] **Step 9: Gate + Commit**

```bash
npm run gate
git add src/core/context/panel-vm.ts src/obsidian/context-panel.ts src/obsidian/view.ts src/main.ts src/i18n/strings.ts styles.css tests/context_panel_vm.test.ts
git commit -m "feat(kontext): Kontext-Tab zeigt Notiz-, Tab- und Manuell-Quellen; Panel rendert asynchron"
```

---

### Task 9: Quellen-Chips unter der Antwort

**Files:**
- Modify: `src/obsidian/view.ts` (`renderLog`)
- Modify: `src/i18n/strings.ts`
- Modify: `styles.css`
- Test: `tests/context_sources.test.ts`

**Interfaces:**
- Consumes: `ContextAttachment.items` aus der persistierten Nutzer-Nachricht.
- Produces: `function sourceChips(ctx: ContextAttachment): { path: string; label: string; chars: number }[]` in `src/core/context/labels.ts`.

**Entscheidung D6:** Es werden nur Einträge mit `kind: "full"` gezeigt. Zeiger stehen bereits vollständig in der aufklappbaren Kontextzeile über der Antwort; eine zweite Darstellung derselben Zeiger wäre Rauschen. Interessant ist, **welche Notizen im Volltext mitgingen** — genau die kann man anklicken und nachlesen.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

Create `tests/context_sources.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sourceChips } from "../src/core/context/labels";
import type { ContextAttachment } from "../src/core/context/types";

const ctx: ContextAttachment = {
  mode: "note",
  text: "…",
  items: [
    { source: "active", path: "Notes/A.md", kind: "full", chars: 500 },
    { source: "link", path: "Notes/B.md", kind: "full", chars: 200, fullChars: 900, depth: 1 },
    { source: "tab", path: "Notes/C.md", kind: "pointer", chars: 11 },
  ],
};

describe("sourceChips", () => {
  it("nimmt nur Volltext-Eintraege — Zeiger stehen schon in der Kontextzeile", () => {
    expect(sourceChips(ctx).map((c) => c.path)).toEqual(["Notes/A.md", "Notes/B.md"]);
  });

  it("beschriftet mit dem Dateinamen ohne Ordner und ohne .md", () => {
    expect(sourceChips(ctx)[0]?.label).toBe("A");
  });

  it("meldet die tatsaechlich gesendete Zeichenzahl, nicht die volle", () => {
    expect(sourceChips(ctx)[1]?.chars).toBe(200);
  });

  it("liefert fuer einen reinen Zeiger-Block eine leere Liste", () => {
    const nur: ContextAttachment = { mode: "workspace", text: "…", items: [ctx.items[2]!] };
    expect(sourceChips(nur)).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Rot sehen**

Run: `npx vitest run tests/context_sources.test.ts`
Expected: FAIL — `sourceChips` ist kein Export von `labels.ts`.

- [ ] **Step 3: `sourceChips` schreiben**

An das Ende von `src/core/context/labels.ts`:

```ts
/** Die Quellen unter einer Antwort: nur Volltext-Eintraege. Zeiger (aktive Notiz,
 *  Markierung, Tab-Pfade) stehen bereits vollstaendig in der aufklappbaren Kontextzeile
 *  ueber der Antwort — sie hier zu wiederholen waere Rauschen. Gezeigt wird die GESENDETE
 *  Zeichenzahl, nicht die volle: die Frage unter der Antwort lautet „was hat das Modell
 *  gelesen", nicht „wie gross ist die Notiz". */
export function sourceChips(ctx: ContextAttachment): { path: string; label: string; chars: number }[] {
  return ctx.items
    .filter((i) => i.kind === "full")
    .map((i) => ({ path: i.path, label: basename(i.path), chars: i.chars }));
}
```

- [ ] **Step 4: Test laufen lassen, Grün sehen**

Run: `npx vitest run tests/context_sources.test.ts`
Expected: PASS, 4 Tests.

- [ ] **Step 5: Die Chips unter der Antwort rendern**

In `src/obsidian/view.ts`, `renderLog()`: vor der Schleife eine Merkvariable anlegen und im `user`-Zweig füllen, im `assistant`-Zweig leeren.

Direkt vor `for (const m of this.plugin.chatLog) {`:

```ts
    // Die Quellen gehoeren unter die ANTWORT, nicht unter die Frage: dort beantworten sie
    // „woraus stammt das". Gemerkt wird deshalb der Kontext der letzten Nutzer-Nachricht
    // und unter der ersten abschliessenden Antwort danach ausgegeben (eine Antwort mit
    // toolCalls ist ein Zwischenschritt, kein Abschluss).
    let offeneQuellen: ContextAttachment | null = null;
```

Im `user`-Zweig hinter dem `details`-Block:

```ts
        offeneQuellen = m.context ?? null;
```

Im `assistant`-Zweig, unmittelbar hinter `assistantBubble(m.content);` im Fall **ohne** `toolCalls`:

```ts
        if (offeneQuellen !== null) {
          const chips = sourceChips(offeneQuellen);
          if (chips.length > 0) {
            const leiste = this.logEl.createDiv({ cls: "koda-msg koda-notice koda-sources" });
            leiste.createSpan({ cls: "koda-sources-label", text: t("context.sources") });
            for (const c of chips) {
              const el = leiste.createSpan({ cls: "koda-source-chip", text: `${c.label} · ${t("context.sourceChars", String(c.chars))}` });
              el.setAttribute("title", c.path);
              el.setAttribute("role", "button");
              el.setAttribute("tabindex", "0");
              const oeffnen = (): void => { void this.app.workspace.openLinkText(c.path, "", false); };
              el.addEventListener("click", oeffnen);
              el.addEventListener("keydown", (evt: KeyboardEvent) => {
                if (evt.key === "Enter" || evt.key === " ") { evt.preventDefault(); oeffnen(); }
              });
            }
          }
          offeneQuellen = null;
        }
```

Den Import von `sourceChips` und den Typ `ContextAttachment` ergänzen.

- [ ] **Step 6: Texte und CSS**

`en`:
```ts
    "context.sources": "Sources:",
    "context.sourceChars": "{0} chars",
```
`de`:
```ts
    "context.sources": "Quellen:",
    "context.sourceChars": "{0} Z.",
```

`styles.css`, Koda-Block:

```css
.koda-sources { display: flex; flex-wrap: wrap; align-items: center; gap: var(--size-2-2); font-size: var(--font-ui-smaller); }
.koda-sources-label { color: var(--text-muted); font-size: var(--font-ui-smaller); }
.koda-source-chip { padding: 0 var(--size-2-2); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); background: var(--background-secondary); cursor: pointer; font-size: var(--font-ui-smaller); }
.koda-source-chip:hover { background: var(--background-modifier-hover); }
```

- [ ] **Step 7: Gate + Commit**

```bash
npm run gate
git add src/core/context/labels.ts src/obsidian/view.ts src/i18n/strings.ts styles.css tests/context_sources.test.ts
git commit -m "feat(kontext): Quellen-Chips unter der Antwort, aus dem persistierten Kontextfeld"
```

---

### Task 10: `read_note` liest `.base` und `.canvas`

**Files:**
- Modify: `src/core/tools/path-guard.ts`
- Modify: `src/obsidian/vault-tools.ts:242` (`read`)
- Modify: `src/core/tools/defs.ts:23`
- Test: `tests/path_guard.test.ts` (erweitert), `tests/tool_defs.test.ts` (erweitert)

**Interfaces:**
- Consumes: nichts.
- Produces: `resolveNotePath(rel: string, allow?: readonly string[]): string` — der zweite Parameter ist **optional mit Default `[".md"]`**, jeder bestehende Aufruf bleibt unverändert gültig. Dazu `export const READ_EXTENSIONS = [".md", ".base", ".canvas"]`.

⚠️ **Schreiben bleibt `.md`.** Die Erweiterung gilt der Lese-Hälfte (Spec § E9 Punkt 5). Wer den Default-Parameter auch an `write`, `writeSkill`, `move` oder `deleteNote` durchreicht, öffnet den Schreibpfad für Formate, die Koda nicht sinnvoll erzeugen kann — und `.canvas`/`.base` sind JSON bzw. YAML, ein vom Modell geschriebener Teiltext macht sie kaputt.

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

An `tests/path_guard.test.ts` anfügen:

```ts
import { READ_EXTENSIONS } from "../src/core/tools/path-guard";

describe("resolveNotePath mit erweiterter Erlaubnis (Lese-Haelfte)", () => {
  it("laesst .base und .canvas durch, wenn sie erlaubt sind", () => {
    expect(resolveNotePath("Notes/Overview.base", READ_EXTENSIONS)).toBe("Notes/Overview.base");
    expect(resolveNotePath("Notes/Map.canvas", READ_EXTENSIONS)).toBe("Notes/Map.canvas");
  });

  it("bleibt ohne zweiten Parameter bei .md — der Schreibpfad aendert sich nicht", () => {
    expect(() => resolveNotePath("Notes/Overview.base")).toThrow(/\.md/);
  });

  it("lehnt ein fremdes Format auch mit erweiterter Erlaubnis ab und nennt die erlaubten", () => {
    expect(() => resolveNotePath("Bild.png", READ_EXTENSIONS)).toThrow(/\.md, \.base, \.canvas/);
  });

  it("prueft die Endung ohne Ruecksicht auf Gross-/Kleinschreibung", () => {
    expect(resolveNotePath("Notes/Overview.BASE", READ_EXTENSIONS)).toBe("Notes/Overview.BASE");
  });

  it("schuetzt weiter gegen Traversal, auch mit erweiterter Erlaubnis", () => {
    expect(() => resolveNotePath("../weg.base", READ_EXTENSIONS)).toThrow(/verlässt den Vault/);
  });
});
```

An `tests/tool_defs.test.ts` anfügen:

```ts
it("read_note nennt die drei lesbaren Formate in seiner Beschreibung", () => {
  const def = TOOL_DEFS.find((d) => d.name === "read_note");
  expect(def?.description).toContain(".base");
  expect(def?.description).toContain(".canvas");
});
```

- [ ] **Step 2: Test laufen lassen, Rot sehen**

Run: `npx vitest run tests/path_guard.test.ts tests/tool_defs.test.ts`
Expected: FAIL — `READ_EXTENSIONS` existiert nicht; `resolveNotePath` nimmt ein Argument.

- [ ] **Step 3: Den Guard erweitern**

In `src/core/tools/path-guard.ts` die Funktion ersetzen:

```ts
/** Was Koda LESEN darf. Schreiben bleibt `.md` — `.base` (YAML) und `.canvas` (JSON) sind
 *  strukturierte Formate, die ein vom Modell geschriebener Teiltext kaputt macht. Spec E9
 *  Punkt 5: „Lesen erlaubt .md/.base/.canvas, Schreiben bleibt .md." */
export const READ_EXTENSIONS: readonly string[] = [".md", ".base", ".canvas"];

const WRITE_EXTENSIONS: readonly string[] = [".md"];

export function resolveNotePath(rel: string, allow: readonly string[] = WRITE_EXTENSIONS): string {
  if (rel.startsWith("/")) throw new Error(`Nur vault-relative Pfade erlaubt: "${rel}"`);
  const parts = rel.split(/[\\/]/).filter((s) => s !== "" && s !== ".");
  if (parts.some((s) => s === "..")) throw new Error(`Pfad verlässt den Vault: "${rel}"`);
  const norm = parts.join("/");
  const klein = norm.toLowerCase();
  if (!allow.some((ext) => klein.endsWith(ext))) {
    throw new Error(`Nur ${allow.join(", ")} erlaubt: "${rel}"`);
  }
  return norm;
}
```

⚠️ Die alte Fehlermeldung lautete `Nur Markdown-Notizen (.md) erlaubt: "…"`. Wer bestehende Tests auf diesen Wortlaut findet, zieht sie auf die neue Fassung nach — **nicht** die Meldung zurückbauen: sie muss die erlaubten Formate nennen, sonst rät ein Modell beim nächsten `.canvas`-Versuch weiter.

- [ ] **Step 4: `read` erweitern**

In `src/obsidian/vault-tools.ts` die Methode `read`:

```ts
  /** Die einzige Stelle mit erweiterter Erlaubnis. Schreiben, Verschieben und Loeschen
   *  rufen `resolveNotePath` weiter ohne zweiten Parameter — der Default ist `.md`. */
  private async read(path: string): Promise<ToolOutcome> {
    const norm = resolveNotePath(path, READ_EXTENSIONS);
    const text = await this.vault.read(norm).catch(() => null);
    return text === null ? { ok: false, error: `Notiz nicht gefunden: "${path}"` } : { ok: true, content: text };
  }
```

Import in derselben Datei um `READ_EXTENSIONS` ergänzen.

- [ ] **Step 5: Die Werkzeug-Beschreibung nachziehen**

`src/core/tools/defs.ts`, `read_note`:

```ts
    description: "Read the full content of one note. Path must be vault-relative and end in .md, .base (a Bases view definition, YAML) or .canvas (a canvas, JSON).",
```

und der Parameter-Text:

```ts
      properties: { path: { type: "string", description: "Vault-relative path, e.g. Projekte/Plan.md or Projekte/Overview.base" } },
```

- [ ] **Step 6: Test laufen lassen, Grün sehen**

Run: `npm test`
Expected: PASS — inklusive der bestehenden `path_guard`- und `vault_tools`-Tests. Schlägt einer davon auf dem Meldungs-Wortlaut fehl, ist er nachzuziehen (Step 3).

- [ ] **Step 7: Gegenprobe — den Default aufweichen**

In `path-guard.ts` den Default-Parameter auf `READ_EXTENSIONS` setzen.
Run: `npx vitest run tests/path_guard.test.ts`
Expected: FAIL in „bleibt ohne zweiten Parameter bei .md" — genau der Test, der den Schreibpfad schützt. Mutation zurücknehmen, erneut grün.

- [ ] **Step 8: Gate + Commit**

```bash
npm run gate
git add src/core/tools/path-guard.ts src/core/tools/defs.ts src/obsidian/vault-tools.ts tests/path_guard.test.ts tests/tool_defs.test.ts
git commit -m "feat(tools): read_note liest auch .base und .canvas; Schreiben bleibt .md"
```

---

### Task 11: Fixture und GUI-Smoke 33–37

**Files:**
- Create: `docs/images/fixture/notes/Notes/Overview.base`
- Modify: `docs/images/fixture/README.md`
- Modify: `scripts/gui-smoke.ts` (Punkt 30 nachziehen, Punkte 33–37 anfügen)
- Modify: `docs/SMOKE.md`

**Interfaces:**
- Consumes: alles Vorige, gegen ein laufendes Obsidian.
- Produces: fünf neue Prüfpunkte, jeder mit notierter Gegenprobe.

⚠️ **Diese Task fährt der Controller, nicht ein Implementer-Subagent.** Der CDP-Lock hängt an der Session, der Guard blockt Subagenten-Bash, und an Obsidian hängen fremde Vaults. Der Implementer schreibt die Prüfpunkte; das Fahren und die Gegenproben macht die steuernde Session.

**Ablauf des Laufs (Reihenfolge ist bindend):**

```bash
python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label koda-agent --intent "GUI-Smoke Etappe 2b" --exclusive focus --ttl 300
npm run smoke:gui -- --vault koda-agent
python3 ~/.claude/hooks/obsidian-cdp-lock.py release
```

Ist der Lock belegt: `acquire` im **5-Sekunden-Takt pollen**, nicht `status` beobachten (20 s verlieren, 5 s gewinnen — zweimal gemessen). `release` gehört **unmittelbar hinter den Lauf**, nicht hinter das Aufräumen; committen und Doku brauchen den Port nicht.

- [ ] **Step 1: Die Baseline festhalten**

Run: `npm run smoke:gui -- --vault koda-agent` (vor jeder Änderung an `scripts/gui-smoke.ts`)
Expected: 32/32. Der Smoke ist in dieser Task selbst Gegenstand des Umbaus — ohne festgehaltenen Lauf davor ist ein grüner Lauf danach nicht von „anders grün" zu unterscheiden (Lesson 2026-08-18, apple-health). Das Ergebnis in die Commit-Message aufnehmen.

- [ ] **Step 2: Die `.base` ins Fixture legen**

Create `docs/images/fixture/notes/Notes/Overview.base`:

```yaml
filters:
  and:
    - 'status != ""'
views:
  - type: table
    name: All notes
    order:
      - file.name
      - status
      - area
```

Und in `docs/images/fixture/README.md` an die Liste „What the checks need from the scenery" anfügen:

```markdown
- **`Notes/Overview.base` must exist** — check 36 reads it through `read_note` and expects
  the string `views:` in the result. It is the only non-Markdown file in the scenery; its
  content is irrelevant beyond being valid YAML with that key.
```

- [ ] **Step 3: Punkt 30 auf den Signaturwechsel nachziehen**

In `scripts/gui-smoke.ts`, Punkt 30 (derzeit Zeile ~1830): jedes `p.currentContext()` bekommt ein `await`. Die vier Stellen:

```js
        const vorher = (await p.currentContext())?.text ?? "";
        const tab = ((await p.currentContext())?.items ?? []).find((i) => i.source === "tab");
        …
        const nachher = (await p.currentContext())?.text ?? "";
        …
        const zurueck = (await p.currentContext())?.text ?? "";
```

⚠️ Ohne diese Änderung ist Punkt 30 **grün und wertlos**: `Promise.text` ist `undefined`, `vorher`/`nachher`/`zurueck` sind alle `""`, und die Bedingung `r.vorher !== r.nachher` scheitert — der Punkt wird also rot und meldet „KEIN TAB". Das ist hier der günstige Fall; er fällt auf. Der Schritt steht trotzdem eigens da, weil `typecheck:scripts` ihn **nicht** fängt: der Aufruf liegt in einer CDP-Zeichenkette.

- [ ] **Step 4: Punkte 33–37 schreiben**

Ans Ende des `try`-Blocks, hinter `record("32. …")`, nach dem Muster der bestehenden Punkte (eigene `let okNN` / `let detailNN`, eigener `try/catch`, `finally` für jede Zustandsänderung, `pollUntil` statt Sofortmessung, Gegenprobe als Kommentar darüber):

```js
    // ---- 33: Modus Notiz nimmt die aktive Notiz und ihre Nachbarn im Volltext mit
    // Gegenprobe: in `src/core/context/candidates.ts` die Breitensuche-Schleife
    // auskommentieren, neu bauen/deployen. Erwartung: `nachbarn` ist 0 und der Punkt wird
    // rot — der Volltext der aktiven Notiz allein reicht nicht.
    let ok33 = false, detail33 = "";
    const vorherMode33 = await cdp.evaluate(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].contextMode;`);
    try {
      await oeffneNotiz(cdp, "Notes/Project plan.md");
      await cdp.evaluate(`
        await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:context-mode-note`)});
        return true;
      `);
      const r = await pollUntil(cdp, `
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        const ctx = await p.currentContext();
        if (!ctx || ctx.mode !== "note") return null;
        return {
          items: ctx.items.map((i) => ({ path: i.path, source: i.source, kind: i.kind })),
          hatVolltext: ctx.text.includes("Model control makes"),
          hatNachbarText: ctx.text.includes("Koda knows seven tools"),
        };
      `, 10_000);
      if (r === null) throw new Error("kein Notiz-Kontext innerhalb 10s");
      const nachbarn = r.items.filter((i) => i.source === "link" || i.source === "backlink").length;
      ok33 = r.hatVolltext && r.hatNachbarText && nachbarn > 0 && r.items.every((i) => i.kind === "full");
      detail33 = `Eintraege ${r.items.length} · Nachbarn ${nachbarn} · Volltext aktive Notiz ${r.hatVolltext} · Volltext Nachbar ${r.hatNachbarText}`;
    } catch (error) {
      detail33 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    }
    record("33. Modus Notiz schickt die aktive Notiz UND einen verlinkten Nachbarn im Volltext", ok33, detail33);
```

```js
    // ---- 34: Die Budget-Kappung meldet sich im Block
    // Gegenprobe: in `src/core/context/render.ts` die `meldung`-Zeile auf `""` setzen,
    // neu bauen/deployen. Erwartung: `hatMeldung` ist false, der Punkt wird rot, obwohl
    // der Block weiterhin gekuerzt ist — genau der stille Verlust, gegen den er steht.
    let ok34 = false, detail34 = "";
    const vorherBudget = await cdp.evaluate(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.contextBudgetChars;`);
    try {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.contextBudgetChars = 2000;
        await p.saveSettings();
        return true;
      `);
      const r = await pollUntil(cdp, `
        const ctx = await app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].currentContext();
        if (!ctx) return null;
        const gekuerzt = ctx.items.filter((i) => typeof i.fullChars === "number");
        // Ohne gekuerzten Eintrag hat der Punkt seinen Gegenstand nicht beruehrt.
        if (gekuerzt.length === 0) return null;
        return { gekuerzt: gekuerzt.length, hatMeldung: /gek(ü|ue)rzt: \\d+ von \\d+ Zeichen|cut: \\d+ of \\d+ chars/.test(ctx.text), laenge: ctx.text.length };
      `, 10_000);
      if (r === null) throw new Error("kein gekuerzter Eintrag bei Budget 2000 — Gegenstand nicht beruehrt");
      ok34 = r.hatMeldung && r.laenge <= 2000 + 2000;
      detail34 = `gekuerzte Eintraege ${r.gekuerzt} · Meldung im Block ${r.hatMeldung} · Blocklaenge ${r.laenge} Z.`;
    } catch (error) {
      detail34 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.contextBudgetChars = ${JSON.stringify(vorherBudget)};
        await p.saveSettings();
        return true;
      `).catch(() => undefined);
    }
    record("34. Die Budget-Kappung meldet sich im Block, statt still zu kuerzen", ok34, detail34);
```

```js
    // ---- 35: Manuell hinzugefuegte Notiz geht mit und laesst sich wieder entfernen
    // Gegenprobe: in `src/core/context/candidates.ts` die `manual`-Schleife entfernen,
    // neu bauen/deployen. Erwartung: `mitManuell` enthaelt den Pfad nie, der Punkt wird rot.
    let ok35 = false, detail35 = "";
    try {
      const r = await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        const ZIEL = "Notes/Compaction.md";
        const ohne = ((await p.currentContext())?.items ?? []).map((i) => i.path);
        p.addContextPaths([ZIEL]);
        const mitManuell = ((await p.currentContext())?.items ?? []).filter((i) => i.source === "manual").map((i) => i.path);
        p.removeContextPath(ZIEL);
        const danach = ((await p.currentContext())?.items ?? []).filter((i) => i.source === "manual").map((i) => i.path);
        return { ohne, mitManuell, danach, ziel: ZIEL };
      `);
      ok35 = r.mitManuell.includes(r.ziel) && !r.danach.includes(r.ziel);
      detail35 = `manuell nach dem Hinzufuegen: [${r.mitManuell.join(", ")}] · nach dem Entfernen: [${r.danach.join(", ")}]`;
    } catch (error) {
      detail35 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.resetContextSelection();
        await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:context-mode-`)} + ${JSON.stringify(vorherMode33)});
        return true;
      `).catch(() => undefined);
    }
    record("35. Eine von Hand hinzugefuegte Notiz geht mit und laesst sich wieder entfernen", ok35, detail35);
```

```js
    // ---- 36: read_note liest eine .base
    // Gegenprobe: in `src/obsidian/vault-tools.ts` das zweite Argument von
    // `resolveNotePath(path, READ_EXTENSIONS)` in `read` entfernen, neu bauen/deployen.
    // Erwartung: `ok` ist false, die Fehlermeldung nennt `.md`, der Punkt wird rot.
    let ok36 = false, detail36 = "";
    try {
      const r = await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        const tools = p.buildTools();
        const aus = await tools.run("read_note", { path: "Notes/Overview.base" });
        const md = await tools.run("read_note", { path: "Notes/Tools.md" });
        return { ok: aus.ok === true, inhalt: (aus.content ?? aus.error ?? "").slice(0, 120), mdOk: md.ok === true };
      `);
      // Die .md-Probe daneben belegt, dass das Werkzeug ueberhaupt laeuft — sonst waere ein
      // rotes 36 auch mit einem kaputten read_note erklaerbar.
      ok36 = r.ok && r.inhalt.includes("views:") && r.mdOk;
      detail36 = `.base gelesen: ${r.ok} · .md gelesen: ${r.mdOk} · Anfang: ${JSON.stringify(r.inhalt.slice(0, 60))}`;
    } catch (error) {
      detail36 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    }
    record("36. read_note liest eine .base aus dem Fixture (und weiterhin .md)", ok36, detail36);
```

```js
    // ---- 37: Quellen-Chips unter der Antwort
    // Der Punkt setzt einen kuenstlichen Verlauf, weil der Smoke bewusst ohne Modell laeuft.
    // Gemessen wird der RENDERER, und der ist die einzige Stelle, an der aus dem
    // persistierten `context.items` sichtbare Chips werden.
    // Gegenprobe: in `src/core/context/labels.ts` in `sourceChips` den `kind`-Filter
    // entfernen. Erwartung: der Zeiger-Eintrag erscheint als dritter Chip, `chips` ist 3
    // statt 2, der Punkt wird rot.
    let ok37 = false, detail37 = "";
    try {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        window.__kodaLogVorher = p.chatLog;
        p.chatLog = [
          { role: "user", content: "Frage", context: { mode: "note", text: "Block", items: [
            { source: "active", path: "Notes/Project plan.md", kind: "full", chars: 500 },
            { source: "link", path: "Notes/Tools.md", kind: "full", chars: 200 },
            { source: "tab", path: "Notes/Compaction.md", kind: "pointer", chars: 11 },
          ] } },
          { role: "assistant", content: "Antwort" },
        ];
        for (const l of app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})) l.view.renderLog();
        return true;
      `);
      const r = await pollUntil(cdp, `
        const leiste = document.querySelector(".koda-sources");
        if (!leiste) return null;
        const chips = Array.from(leiste.querySelectorAll(".koda-source-chip"));
        if (chips.length === 0) return null;
        return {
          anzahl: chips.length,
          titel: chips.map((c) => c.getAttribute("title")),
          hoehe: Math.min(...chips.map((c) => c.getBoundingClientRect().height)),
        };
      `, 8_000);
      if (r === null) throw new Error("keine Quellen-Leiste innerhalb 8s gerendert");
      ok37 = r.anzahl === 2 && r.hoehe > 0 && !r.titel.includes("Notes/Compaction.md");
      detail37 = `Chips ${r.anzahl} · kleinste Hoehe ${r.hoehe}px · Titel: ${r.titel.join(" | ")}`;
    } catch (error) {
      detail37 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        if (window.__kodaLogVorher) { p.chatLog = window.__kodaLogVorher; delete window.__kodaLogVorher; }
        for (const l of app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})) l.view.renderLog();
        return true;
      `).catch(() => undefined);
    }
    record("37. Quellen-Chips stehen unter der Antwort — nur Volltext-Quellen, Hoehe > 0", ok37, detail37);
```

ⓘ `oeffneNotiz` ist der im Treiber bereits vorhandene Helfer (Punkte 20/23 nutzen ihn); heißt er dort anders, wird der vorhandene Name genommen, **nicht** ein zweiter Helfer gebaut.

- [ ] **Step 5: Bauen, deployen, fahren**

```bash
npm run build
npm run smoke:gui -- --vault koda-agent
```
Expected: **37/37**. Ein roter Punkt ist zuerst ein Treiber-Verdacht, nicht ein Produktdefekt — von den bisher 9 roten Läufen dieses Repos waren 6 Treiber-Defekte. Erst messen, dann reparieren.

- [ ] **Step 6: Jede der fünf Gegenproben einzeln fahren**

Für jeden Punkt 33–37 die im Kommentar notierte Mutation setzen, `npm run build`, Smoke fahren, **genau diesen einen Punkt rot** sehen, Mutation zurücknehmen. **Einzeln, nicht gesammelt:** wer mehrere Regeln in einem Lauf bricht, bekommt mehrere rote Punkte und weiß von keinem, warum — bei einer gemeinsamen Probe war in der Vortagssession einer davon nur ein Folgefehler.

Das Ergebnis jeder Gegenprobe (Punkt, Mutation, gemessene Fehlermeldung) in `docs/SMOKE.md` notieren.

- [ ] **Step 7: `docs/SMOKE.md` nachziehen**

Die fünf Punkte in die Liste aufnehmen, mit je einem Satz zum Gegenstand und der gefahrenen Gegenprobe. Die Kopfzeile der Datei auf **37** Punkte setzen.

- [ ] **Step 8: Commit**

```bash
npm run gate
git add scripts/gui-smoke.ts docs/SMOKE.md docs/images/fixture
git commit -m "test(smoke): Pruefpunkte 33-37 fuer die Volltext-Quellen, Punkt 30 auf async nachgezogen"
```

---

### Task 12: Dokumentation und Changelog

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`, `README.de.md`
- Modify: `CLAUDE.md`
- Modify: `../REGISTRY.md` (Dach)

- [ ] **Step 1: `CHANGELOG.md`**

Unter `## [Unreleased]`:

```markdown
### Added
- Kontext-Modi **Notiz** und **Alle Tabs**: die aktive Notiz mit ihren verlinkten Nachbarn bzw. alle offenen Notizen gehen im Volltext mit, begrenzt durch ein Budget.
- **Manuell**: Notizen und Ordner lassen sich über zwei Picker zum Kontext hinzufügen (drei neue Befehle, drei Knöpfe im Kontext-Tab).
- **Quellen-Chips unter der Antwort** — welche Notizen im Volltext mitgingen, anklickbar.
- Einstellungen **Inhalts-Budget je Nachricht** (`contextBudgetChars`, Default 20 000) und **Link-Tiefe im Modus Notiz** (`contextLinkDepth`, Default 1).
- `read_note` liest zusätzlich `.base` und `.canvas`. Geschrieben wird weiterhin nur `.md`.

### Changed
- Der Kontext-Tab zeigt Abschnitte je Quelle und einen Stepper für die Link-Tiefe; er rendert asynchron, weil die Volltext-Modi Notizen lesen.
```

- [ ] **Step 2: Beide READMEs**

Im Abschnitt über den Arbeitskontext die zwei neuen Modi und den Manuell-Bereich beschreiben, dazu die zwei neuen Einstellungen. ⚠️ Die deutsche Fassung führt eine **Werkzeug-Zahl** — sie ändert sich hier nicht (kein neues Werkzeug), aber die Beschreibung von `read_note` schon: sie muss die drei Formate nennen. (Beim letzten Mal war genau diese Zahl in der deutschen README falsch.)

- [ ] **Step 3: `CLAUDE.md`**

Den Status-Block auf Etappe 2b fortschreiben: was gebaut ist, Gate-Zahl, Smoke-Zahl, und die zwei Entscheidungen, die man an der API nicht ablesen kann (D3 Wasserfüllung, D8 Kreuz entfernt statt wählt ab). Im Struktur-Überblick `src/core/context/` um `candidates.ts`, `select.ts`, `render.ts`, `build.ts`, `manual.ts` ergänzen und `src/obsidian/` um `links.ts`, `note-picker.ts`, `folder-picker.ts`.

- [ ] **Step 4: Dach-REGISTRY**

Zwei Einträge, weil beide über dieses Repo hinaus wiederverwendbar sind:
- § **Parsing/Editing** (oder der passende Abschnitt): *Budget anteilig über ungleich große Texte verteilen, ohne Verschnitt* → `koda-agent/src/core/context/select.ts` (`allocateBudget`, 6 Tests) — Abgrenzung zu `vault-rag/src/context_source.ts` (Gleichverteilung) mitnennen, sonst sieht es wie eine Dublette aus.
- § **UI**: *Ein Panel, dessen ViewModel IO macht, braucht einen Generationszähler* → `koda-agent/src/obsidian/context-panel.ts`, übernommen aus `vault-rag/src/context_panel.ts:43–52` (n=2).

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md README.md README.de.md CLAUDE.md
git commit -m "docs: Etappe 2b — Volltext-Quellen, Budget, Quellen-Chips"
cd .. && git add REGISTRY.md && git commit -m "docs(registry): Budget-Wasserfuellung und Generationszaehler aus koda-agent" && cd koda-agent
```

---

## Was dieser Plan bewusst NICHT enthält

- **`contextAutoK`** — siehe D4. Kommt mit Etappe 3, zusammen mit der Quelle, die es steuert.
- **Modus Vault, semantische Nachbarn, Bases-Ansicht** — Etappe 3 (Spec § Etappen, § E7). Die Bases-Ansicht beginnt dort mit einem Spike, nicht mit Code.
- **Ein Release.** Etappe 2b endet mit einem merge-fähigen Branch; ob und wann released wird, ist Johannes' Entscheidung — wie bei 2a.
- **Ablegen per Maus aus dem Datei-Explorer** — kein öffentlicher Drag-Vertrag in der API (Spec § Nicht im Umfang).

## Prüfumfang: was am Ende belegt ist und was nicht

**Belegt:** die vier pure Module je durch Unit-Tests **mit Gegenprobe** (jeweils eine Mutation, die genau die zuständigen Tests fängt) · der Adapter durch `tests/context_links_adapter.test.ts` inkl. der Richtungs-Gegenprobe · die Naht zum Host durch die Prüfpunkte 33–37, jeder einzeln gegengeprobt.

**Nicht belegt, und das ist zu sagen statt zu übergehen:**
- **Ob ein Modell den Volltext-Block besser nutzt als die Zeiger.** Das misst nur `npm run gui:ask -- --full` gegen ein echtes Modell, nicht deterministisch. Zwei Fragen dafür: „Fasse zusammen, was in der offenen Notiz und ihren verlinkten Nachbarn steht" (erwartet: **kein** `read_note`, weil der Text schon da ist) und „Was steht in der Base Overview?" (erwartet: `read_note` auf `.base`). Der Lauf gehört vor einen Release, nicht in diesen Plan.
- **Das Verhalten bei einem großen Vault.** Die Backlink-Suche iteriert über alle Quellen in `resolvedLinks`; bei ~1.200 Notizen ist das laut Spec trivial, gemessen ist es hier nicht. Wer den Modus Notiz auf Tiefe 3 in einem großen Vault fährt, misst es — und dann gehört die Zahl in die REGISTRY, nicht eine Vermutung.
- **Der Prompt-Cache.** Der Block ändert den letzten Nutzer-Turn je Nachricht; ob LM Studio den Präfix hält, ist eine Messung und bleibt offen (Spec § Offene Punkte).

## Selbst-Review dieses Plans

**Spec-Abdeckung § Etappen Zeile 2** — „Hub (Kit nachvendoren)" ✅ Etappe 2a · „Kontext-Tab mit Abschnitten und Chips" ✅ 2a + Task 8 · „Modi Notiz (Links/Backlinks, Tiefe) + Alle Tabs" ✅ Tasks 3/4/6 · „Manuell (Picker)" ✅ Task 7 · „Budget + Vorschau" ✅ Tasks 1/2 (Budget), Task 8 (Vorschau in der Summenzeile) · „Quellen-Chips" ✅ Task 9 · „Nicht-Markdown lesen" ✅ Task 10 · „Smoke 24–27" → hier 33–37, weil der Nummernraum seit der Spec um `move_note`/`delete_note` und die 2a-Punkte gewachsen ist ✅ Task 11.

**§ E8 Einstellungen** — `contextBudgetChars` ✅, `contextLinkDepth` ✅, `contextAutoK` **bewusst nicht** (D4, begründet).

**Typ-Konsistenz** — `Candidate` wird in `select.ts` definiert und von `candidates.ts` importiert (nicht umgekehrt), `AllocatedEntry` fließt von `select.ts` nach `render.ts`, `buildFullContext` ist die einzige Stelle, die beides verbindet, und `panel-vm.ts` ruft **dieselbe** Funktion wie `currentContext()`. `itemKey(source, path)` ist in allen drei Filterstellen dieselbe Funktion aus `selection.ts`.

**Der bekannte Riss** — die Chip-Liste leitet ihre Filterung **nicht** aus dem gefilterten Block ab (Task 8, Step 3, Kommentar im Code). Genau dort riss in Etappe 2a der einzige Defekt auf, den kein Task-Review sah.
