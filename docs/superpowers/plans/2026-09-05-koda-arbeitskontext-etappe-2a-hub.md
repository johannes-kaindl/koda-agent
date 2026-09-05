# Arbeitskontext Etappe 2a — Hub-Gerüst und Kontext-Tab (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kodas Sidebar bekommt eine Hub-Tab-Leiste (Chat · Kontext), und der Kontext-Tab zeigt für den bestehenden Modus *Arbeitsplatz*, was in die nächste Nachricht geht — mit abwählbaren Chips, Summenzeile und persistiertem Auf/Zu-Zustand.

**Architecture:** Der Hub kommt als vendorter Kit-Baustein (`buildHubInto`, verbindlich nach UI-STANDARD §8), nicht als Eigenbau. Der Chat wird **nicht umgeschrieben**, sondern nur in einen injizierten Container gemountet — sein DOM und alle Stream-Methoden bleiben identisch, damit der Umbau am funktionierenden Chat kein Regressionsrisiko trägt. Die Abwahl ist ein Zustand im Plugin (wie `contextMode`), der den **Snapshot filtert, bevor** er gerendert wird; dadurch bleibt die Invariante „Blocktext == `items`" ohne Zutun erhalten.

**Tech Stack:** TypeScript · esbuild · vitest + Obsidian-Mock aus `obsidian-kit/testing` · vendortes `obsidian-kit@0.27.0` · CDP-GUI-Smoke.

**Spec:** `docs/superpowers/specs/2026-09-02-koda-arbeitskontext-design.md` (§ E6 „Etappe 2 (Hub)", § E8 Einstellungen, § Etappen, § Prüfen)

## Global Constraints

- **`src/core/**` ist obsidian-frei** — `npm run check:pure` erzwingt es. Neue pure Module importieren nichts aus `obsidian`.
- **Kit-first, verbindlich:** Die Hub-Tab-Leiste ist ein §8-Baustein „im Kit 0.27.0, verbindlich". Sie wird **vendored, nicht nachgebaut**. Gleiches gilt für `collapsibleSection`.
- **Vendor-Bäume sind Verbatim-Snapshots.** `src/vendor/kit-obsidian/*` nie von Hand editieren; nur über `tools/sync-kit.sh`. `KIT_REF` bleibt **0.27.0** (`hub.ts` und `collapsible.ts` existieren dort und sind seither unverändert — am 2026-09-05 per `git diff 0.27.0 HEAD` geprüft).
- **Kit-CSS gehört in `styles.css`**, das Kit injiziert keins. Präfixe `okit-hub-`, `okit-collapsible-` nicht umbenennen.
- **Jeder Wert mit Einfluss ist eine Einstellung** (Johannes, 2026-09-02). Neue Werte gehen in `KodaSettings` mit Schema-Eintrag und Settings-Zeile.
- **Jede Aktion braucht zusätzlich einen Befehl** (Lehre 0.10.1) — ein Befehl hängt nicht an der Darstellung.
- **Prüfpunkte messen Größe, nicht Existenz** (Lehre 0.10.1): `getBoundingClientRect()`, nicht `querySelector`.
- **Smoke-Nummernraum:** 1–28 sind vergeben. Neue Punkte beginnen bei **29**. (Die Spec sagt „Smoke 24–27" — das war der Stand vom 2026-09-02, vor `move_note`/`delete_note` und den Punkten 27/28.)
- **Texte nach §10:** Ablageort `src/i18n/strings.ts`, DE und EN, kein Fachbegriff ohne Auflösung.
- Vor jedem Commit: `npm run gate` (lint + typecheck + typecheck:scripts + test + check:pure + build).

---

## File Structure

**Neu (pure, `src/core/context/`):**
- `selection.ts` — Abwahl-Zustand: Schlüssel je Kontext-Eintrag, Anwendung auf einen `WorkspaceSnapshot`. Kein DOM, kein Obsidian.
- `panel-vm.ts` — ViewModel des Kontext-Tabs: aus Snapshot + Abwahl + Optionen wird eine Liste von Abschnitten mit Chips und eine Summenzeile. Kein DOM.

**Neu (Obsidian-Schale):**
- `src/obsidian/context-panel.ts` — das `HubPanel` für den Kontext-Tab. Baut DOM aus dem ViewModel, spricht einen schmalen Host-Vertrag (§4: die View kennt weder Plugin noch Ports direkt).

**Neu (vendored, nie von Hand):**
- `src/vendor/kit-obsidian/hub.ts`, `src/vendor/kit-obsidian/collapsible.ts`

**Geändert:**
- `tools/sync-kit.sh` — `OBS=` um `hub collapsible`
- `styles.css` — `HUB_CSS`, `COLLAPSIBLE_CSS`, Chip-Regeln
- `src/core/settings-types.ts` — `contextKeepChoices`, `contextSections`
- `src/i18n/strings.ts` — Tab-Labels, Abschnittstitel, Summenzeile, Einstellungstexte
- `src/obsidian/view.ts` — Hub-Umbau; Chat-Aufbau in `mountChat(container)`
- `src/obsidian/settings.ts` — eine Settings-Zeile
- `src/main.ts` — Abwahl-Zustand, gefilterter `currentContext()`, Befehle
- `scripts/gui-smoke.ts` — Punkte 29–31

**Tests:** `tests/context_selection.test.ts`, `tests/context_panel_vm.test.ts`, `tests/settings_types.test.ts` (erweitert), `tests/context_workspace_line.test.ts` (unverändert — die Invariante wird durch Filtern *vor* dem Rendern gehalten, nicht durch neue Renderer-Parameter).

---

### Task 1: Kit-Bausteine vendoren (Hub + Collapsible)

**Files:**
- Modify: `tools/sync-kit.sh:44`
- Create (generiert): `src/vendor/kit-obsidian/hub.ts`, `src/vendor/kit-obsidian/collapsible.ts`
- Modify: `styles.css` (ans Ende, mit Herkunftsstempel)

**Interfaces:**
- Consumes: nichts.
- Produces: `buildHubInto(root, panels, defaultTab, opts?) => HubController<Id>`, `HubPanel<Id>` (`id`/`label`/`icon`/`mount`/`onShow?`/`onHide?`/`onFileOpen?`/`destroy`), `HubController` (`currentTab`/`setTab`/`refreshActive`/`notifyFileOpen`/`destroy`), `collapsibleSection(containerEl, { title, defaultCollapsed?, key?, storage? }) => HTMLElement`, `resolveCollapsed(key, defaultCollapsed, storage?)`, `CollapsibleStorage` (`getCollapsed`/`setCollapsed`), sowie die Konstanten `HUB_CSS` und `COLLAPSIBLE_CSS`.

- [ ] **Step 1: Modul-Liste erweitern**

In `tools/sync-kit.sh` Zeile 44:

```sh
OBS="clock confirm folder-suggest settings_walker endpoint-list model-picker hub collapsible"
```

- [ ] **Step 2: Sync fahren**

Run: `bash tools/sync-kit.sh`
Expected: zwei neue Zeilen `vendored obsidian-kit@0.27.0/obsidian/hub.ts` und `…/collapsible.ts`; `src/vendor/kit-obsidian/VENDOR.json` listet beide.

- [ ] **Step 3: Idempotenz-Gegenprobe (Pflicht bei jedem Eingriff in sync-kit.sh)**

```bash
bash tools/sync-kit.sh && git status --short src/vendor/
```
Expected: **keine** Änderung gegenüber dem Stand nach Step 2. Ein zweiter Lauf mit denselben Refs darf keine vendorte Datei anfassen.

- [ ] **Step 4: Vendor-Leseart prüfen**

Run: `python3 ../tools/vendor_leseart_check.py`
Expected: keine Beanstandung für `koda-agent`. (Ein kleingeschriebenes `$ref` machte diesen Wächter schon einmal blind, während Verhalten und Gate korrekt blieben — deshalb gehört er zu jedem `sync-kit.sh`-Eingriff.)

- [ ] **Step 5: CSS übernehmen**

`HUB_CSS` und `COLLAPSIBLE_CSS` sind Konstanten im Kit; der Consumer kopiert ihren Inhalt in die eigene `styles.css`. Ans Ende von `styles.css`, mit Herkunftsstempel in der ersten Zeile des Blocks:

```bash
node -e '
const { HUB_CSS } = require("./src/vendor/kit-obsidian/hub.ts");
' 2>/dev/null || true
```

Praktisch: den Inhalt der Template-Literale aus `src/vendor/kit-obsidian/hub.ts` (Konstante `HUB_CSS`) und `src/vendor/kit-obsidian/collapsible.ts` (`COLLAPSIBLE_CSS`) wörtlich übernehmen, eingerahmt von:

```css
/* uebernommen aus obsidian-kit/src/obsidian/hub.ts (HUB_CSS), 2026-09-05 — nie von Hand
   aendern, sondern den Block bei einem Kit-Update ersetzen. Das Kit injiziert kein CSS. */
```

- [ ] **Step 6: Gate + Commit**

```bash
npm run gate
git add tools/sync-kit.sh src/vendor/kit-obsidian styles.css
git commit -m "chore(kit): hub und collapsible aus obsidian-kit@0.27.0 vendoren"
```

---

### Task 2: Zwei Einstellungen (`contextKeepChoices`, `contextSections`)

**Files:**
- Modify: `src/core/settings-types.ts`
- Modify: `src/i18n/strings.ts`
- Modify: `src/obsidian/settings.ts`
- Test: `tests/settings_types.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `KodaSettings.contextKeepChoices: boolean` (Default `true`), `KodaSettings.contextSections: Record<string, boolean>` (Default `{}`).

- [ ] **Step 1: Failing tests**

An `tests/settings_types.test.ts` anhängen:

```typescript
describe("Arbeitskontext-Einstellungen der Etappe 2", () => {
  it("contextKeepChoices ist standardmaessig an — Abwahl bleibt, bis der Nutzer sie aufhebt", () => {
    expect(validateKodaSettings({}).contextKeepChoices).toBe(true);
    expect(validateKodaSettings({ contextKeepChoices: false }).contextKeepChoices).toBe(false);
  });
  it("contextKeepChoices faellt bei Unsinn auf den Auslieferungswert zurueck", () => {
    expect(validateKodaSettings({ contextKeepChoices: "ja" }).contextKeepChoices).toBe(true);
  });
  it("contextSections nimmt nur Booleans — fremde Werte kosten den Eintrag, nicht das Feld", () => {
    const s = validateKodaSettings({ contextSections: { workspace: false, kaputt: 7 } });
    expect(s.contextSections).toEqual({ workspace: false });
  });
  it("contextSections faellt bei komplett falschem Typ auf {} zurueck", () => {
    expect(validateKodaSettings({ contextSections: "auf" }).contextSections).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/settings_types.test.ts`
Expected: FAIL — `contextKeepChoices` und `contextSections` sind `undefined`.

- [ ] **Step 3: Felder und Schema ergänzen**

In `src/core/settings-types.ts` im `KodaSettings`-Interface (neben `contextFrontmatterChars`):

```typescript
  /** Bleiben Abwahl und manuelle Zusätze über die Nachricht hinaus stehen? Default `true`:
   *  der weniger überraschende Zustand — was abgewählt ist, bleibt abgewählt, bis „Auswahl
   *  zurücksetzen" oder ein neues Gespräch. vault-rag lebt das Gegenteil, weil dort die
   *  Kandidaten je Frage neu kommen; hier sind sie stabil (Spec § E6). */
  contextKeepChoices: boolean;
  /** Auf/Zu-Zustand der Abschnitte im Kontext-Tab. Kein Bedienelement in den Einstellungen,
   *  nur Persistenz — der Nutzer klappt im Panel. */
  contextSections: Record<string, boolean>;
```

In `DEFAULT_SETTINGS`:

```typescript
  contextKeepChoices: true,
  contextSections: {},
```

Im Schema (neben `contextFrontmatterChars`):

```typescript
  contextKeepChoices: boolField(),
  contextSections: boolRecordField(),
```

Falls `boolField` noch nicht existiert, daneben definieren (Muster wie die vorhandenen Feld-Checks):

```typescript
/** Ein Record von Booleans: unbekannte Werttypen kosten den EINTRAG, nicht das ganze Feld —
 *  ein einzelner kaputter Abschnitts-Zustand soll nicht alle anderen zurücksetzen. */
function boolRecordField() {
  return (raw: unknown): Record<string, boolean> => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/settings_types.test.ts`
Expected: PASS.

- [ ] **Step 5: i18n + Settings-Zeile**

In `src/i18n/strings.ts`, EN-Block:

```typescript
    "settings.contextKeep": "Keep context choices",
    "settings.contextKeep.desc": "What you deselect in the Context tab stays deselected until you press “Reset selection” or start a new chat. Turn this off to have every message start from the full context again.",
```

DE-Block:

```typescript
    "settings.contextKeep": "Kontext-Auswahl behalten",
    "settings.contextKeep.desc": "Was du im Kontext-Tab abwählst, bleibt abgewählt, bis du „Auswahl zurücksetzen“ drückst oder ein neues Gespräch beginnst. Aus heißt: jede Nachricht startet wieder mit dem vollen Kontext.",
```

In `src/obsidian/settings.ts` in der Gruppe „Arbeitskontext", nach der `contextFrontmatterChars`-Zeile:

```typescript
          {
            name: t("settings.contextKeep"),
            desc: t("settings.contextKeep.desc"),
            control: { type: "toggle", key: "contextKeepChoices" },
          },
```

- [ ] **Step 6: Gate + Commit**

```bash
npm run gate
git add src/core/settings-types.ts src/i18n/strings.ts src/obsidian/settings.ts tests/settings_types.test.ts
git commit -m "feat(settings): contextKeepChoices und contextSections"
```

---

### Task 3: Abwahl-Zustand (pure)

**Files:**
- Create: `src/core/context/selection.ts`
- Test: `tests/context_selection.test.ts`

**Interfaces:**
- Consumes: `WorkspaceSnapshot` und `ContextItem` aus `src/core/context/ports.ts` bzw. `types.ts`.
- Produces:
  - `type SelectionKey = string`
  - `itemKey(source: ContextSource, path: string): SelectionKey`
  - `applySelection(snap: WorkspaceSnapshot, off: ReadonlySet<SelectionKey>): WorkspaceSnapshot`

- [ ] **Step 1: Write the failing test**

Create `tests/context_selection.test.ts`:

```typescript
import { itemKey, applySelection } from "../src/core/context/selection";
import type { WorkspaceSnapshot } from "../src/core/context/ports";

const snap: WorkspaceSnapshot = {
  active: {
    path: "Notes/Plan.md",
    frontmatter: { status: "active" },
    selection: "Model control",
    cursorLine: 9,
    lineCount: 11,
  },
  tabs: [
    { path: "Notes/Plan.md", viewType: "markdown" },
    { path: "Notes/Tools.md", viewType: "markdown" },
  ],
};

describe("itemKey", () => {
  it("trennt Quelle und Pfad, damit Markierung und Notiz derselben Datei getrennt abwaehlbar sind", () => {
    expect(itemKey("active", "Notes/Plan.md")).not.toBe(itemKey("selection", "Notes/Plan.md"));
    expect(itemKey("tab", "Notes/Plan.md")).not.toBe(itemKey("active", "Notes/Plan.md"));
  });
});

describe("applySelection", () => {
  it("ohne Abwahl gibt es den Snapshot unveraendert zurueck", () => {
    expect(applySelection(snap, new Set())).toEqual(snap);
  });
  it("abgewaehlte Markierung leert NUR die Markierung, die Notiz bleibt", () => {
    const out = applySelection(snap, new Set([itemKey("selection", "Notes/Plan.md")]));
    expect(out.active?.selection).toBe("");
    expect(out.active?.path).toBe("Notes/Plan.md");
  });
  it("abgewaehlte aktive Notiz nimmt die Markierung mit — ohne Notiz gibt es keine Stelle darin", () => {
    const out = applySelection(snap, new Set([itemKey("active", "Notes/Plan.md")]));
    expect(out.active).toBeNull();
  });
  it("abgewaehlter Tab verschwindet aus der Liste, die uebrigen bleiben in Reihenfolge", () => {
    const out = applySelection(snap, new Set([itemKey("tab", "Notes/Plan.md")]));
    expect(out.tabs.map((x) => x.path)).toEqual(["Notes/Tools.md"]);
  });
  it("laesst den Eingabe-Snapshot unangetastet (kein In-Place-Filtern)", () => {
    applySelection(snap, new Set([itemKey("tab", "Notes/Plan.md")]));
    expect(snap.tabs).toHaveLength(2);
  });
  it("ein Schluessel fuer etwas, das es nicht gibt, aendert nichts", () => {
    expect(applySelection(snap, new Set([itemKey("tab", "Weg.md")]))).toEqual(snap);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/context_selection.test.ts`
Expected: FAIL — `Cannot find module '../src/core/context/selection'`.

- [ ] **Step 3: Minimal implementation**

Create `src/core/context/selection.ts`:

```typescript
/* Welche Teile des Arbeitsplatzes der Nutzer abgewählt hat. Pure — der Zustand lebt im
 * Plugin, hier steht nur, was er bedeutet.
 *
 * Der tragende Entwurfsgedanke: abgewählt wird der SNAPSHOT, nicht der gerenderte Block.
 * Würde erst der Renderer filtern, müssten Text und `items` zweimal dieselbe Regel treffen —
 * und die Invariante „was im Block steht, steht in items" wäre eine Behauptung statt einer
 * Folge. So ist sie das Ergebnis einer einzigen Filterung davor. */
import type { WorkspaceSnapshot } from "./ports";
import type { ContextSource } from "./types";

export type SelectionKey = string;

/** Quelle UND Pfad, nie nur der Pfad: die aktive Notiz und die Markierung darin tragen
 *  denselben Pfad und sind trotzdem getrennt abwählbar. */
export function itemKey(source: ContextSource, path: string): SelectionKey {
  return `${source}:${path}`;
}

export function applySelection(snap: WorkspaceSnapshot, off: ReadonlySet<SelectionKey>): WorkspaceSnapshot {
  if (off.size === 0) return snap;
  let active = snap.active;
  if (active !== null) {
    if (off.has(itemKey("active", active.path))) active = null;
    else if (off.has(itemKey("selection", active.path))) active = { ...active, selection: "" };
  }
  const tabs = snap.tabs.filter((x) => !off.has(itemKey("tab", x.path)));
  return { active, tabs };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/context_selection.test.ts`
Expected: PASS (6 Tests).

- [ ] **Step 5: Gegenprobe per Mutation**

Die Tests entstehen hier zwar vor dem Code, aber eine Regel ist geschenkt-grün: `applySelection` gibt bei leerer Menge früh zurück. Mutation zur Kontrolle:

```bash
cp src/core/context/selection.ts /tmp/sel.bak
# "else if" → "if"  (Markierung würde dann auch bei abgewählter Notiz geprüft)
sed -i '' 's/else if (off.has(itemKey("selection"/if (off.has(itemKey("selection"/' src/core/context/selection.ts
npx vitest run tests/context_selection.test.ts
cp /tmp/sel.bak src/core/context/selection.ts
```
Expected: der Test „abgewaehlte aktive Notiz nimmt die Markierung mit" wird rot (`active` ist dann nicht `null`, weil der zweite Zweig ein Objekt aus `null` bauen will bzw. wirft). Danach Quelle unverändert.

- [ ] **Step 6: Gate + Commit**

```bash
npm run gate
git add src/core/context/selection.ts tests/context_selection.test.ts
git commit -m "feat(kontext): Abwahl-Zustand als pure Snapshot-Filterung"
```

---

### Task 4: `currentContext()` respektiert die Abwahl

**Files:**
- Modify: `src/main.ts` (Feld `contextOff`, Methoden, `currentContext()`)
- Test: keiner — `buildTools()`/`currentContext()` sind Plugin-Verdrahtung ohne Unit-Abdeckung; die Wirkung misst GUI-Smoke-Punkt 30 (Task 9). Die *Logik* ist in Task 3 gepinnt.

**Interfaces:**
- Consumes: `applySelection`, `itemKey`, `SelectionKey` aus Task 3.
- Produces: an `KodaPlugin`:
  - `contextOff: Set<SelectionKey>`
  - `toggleContextItem(source: ContextSource, path: string): void`
  - `resetContextSelection(): void`
  - `currentContext()` liefert weiterhin `ContextAttachment | null`, jetzt gefiltert.

- [ ] **Step 1: Zustand und Methoden ergänzen**

In `src/main.ts` neben `contextMode`:

```typescript
  /** Abgewählte Teile des Arbeitsplatzes. Lebt im Plugin, nicht in der View: `currentContext()`
   *  braucht ihn, die View zeigt ihn nur an (UI-STANDARD §4 — DOM ist Funktion des Zustands).
   *  Nicht persistiert: eine Abwahl gilt für diese Sitzung, `contextKeepChoices` steuert nur,
   *  ob sie das Senden überlebt. */
  contextOff: Set<SelectionKey> = new Set();

  toggleContextItem(source: ContextSource, path: string): void {
    const key = itemKey(source, path);
    if (this.contextOff.has(key)) this.contextOff.delete(key);
    else this.contextOff.add(key);
    for (const v of this.views()) v.syncContextPanel();
  }

  resetContextSelection(): void {
    if (this.contextOff.size === 0) return;
    this.contextOff.clear();
    for (const v of this.views()) v.syncContextPanel();
  }
```

- [ ] **Step 2: `currentContext()` filtern**

```typescript
  currentContext(): ContextAttachment | null {
    if (this.contextMode === "off") return null;
    const s = this.settings;
    const snap = applySelection(readWorkspace(this.app, VIEW_TYPE_KODA), this.contextOff);
    return renderWorkspaceContext(snap, {
      lang: this.promptLang(),
      selectionMax: s.contextSelectionChars,
      tabsMax: s.contextTabsMax,
      frontmatterMax: s.contextFrontmatterChars,
    });
  }
```

- [ ] **Step 3: Abwahl nach dem Senden ggf. verwerfen**

Dort, wo `ask()` die Nachricht abgesetzt hat (nach dem Anhängen des `context`-Felds), ergänzen:

```typescript
    // `contextKeepChoices` aus: die Abwahl galt nur für diese eine Nachricht. Nach dem
    // Senden zurück auf den vollen Kontext — sonst wirkt eine einmalige Abwahl unbemerkt
    // weiter (Spec § E6, Default ist das Gegenteil: behalten).
    if (!this.settings.contextKeepChoices) this.resetContextSelection();
```

- [ ] **Step 4: `newChat()` räumt die Abwahl mit**

In `newChat()`, neben dem Leeren des Verlaufs:

```typescript
    this.resetContextSelection();
```

- [ ] **Step 5: Gate**

Run: `npm run gate`
Expected: grün. (`syncContextPanel()` existiert noch nicht — dieser Schritt wird erst mit Task 7 typecheck-fähig. **Reihenfolge beachten:** Tasks 4 und 7 zusammen committen, oder in Task 4 zunächst eine leere `syncContextPanel(): void {}` in `KodaView` anlegen. Der Implementer wählt den zweiten Weg, damit jeder Task für sich grün ist.)

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/obsidian/view.ts
git commit -m "feat(kontext): currentContext filtert die abgewaehlten Teile"
```

---

### Task 5: ViewModel des Kontext-Tabs (pure)

**Files:**
- Create: `src/core/context/panel-vm.ts`
- Test: `tests/context_panel_vm.test.ts`

**Interfaces:**
- Consumes: `WorkspaceSnapshot`, `applySelection`/`itemKey` (Task 3), `renderWorkspaceContext` aus `workspace-line.ts` für die Größenmessung.
- Produces:

```typescript
export interface PanelChip {
  source: ContextSource;
  path: string;
  /** Anzeigename: Dateiname ohne Pfad und ohne .md */
  label: string;
  /** Zusatz rechts am Chip, z. B. „312 Z." bei der Markierung; "" wenn keiner. */
  hint: string;
  off: boolean;
}
export interface PanelSection {
  id: string;
  title: string;
  chips: PanelChip[];
  /** Text des §8-Empty-States, wenn `chips` leer ist. */
  empty: string;
}
export interface PanelViewModel {
  sections: PanelSection[];
  /** Summenzeile, z. B. „1,2 KB · Fenster 4 %". */
  summary: string;
  /** §8-Status-Vokabel für die Summenzeile. */
  state: "is-ok" | "is-warning";
  /** Ist mindestens ein Eintrag abgewählt? Steuert „Auswahl zurücksetzen". */
  hasOff: boolean;
}
export function buildPanelViewModel(
  snap: WorkspaceSnapshot,
  off: ReadonlySet<SelectionKey>,
  opts: { lang: "de" | "en"; selectionMax: number; tabsMax: number; frontmatterMax: number; windowTokens: number },
): PanelViewModel;
```

- [ ] **Step 1: Write the failing test**

Create `tests/context_panel_vm.test.ts`:

```typescript
import { buildPanelViewModel } from "../src/core/context/panel-vm";
import { itemKey } from "../src/core/context/selection";
import type { WorkspaceSnapshot } from "../src/core/context/ports";

const snap: WorkspaceSnapshot = {
  active: { path: "Notes/Project plan.md", frontmatter: { status: "active" }, selection: "Model control", cursorLine: 9, lineCount: 11 },
  tabs: [
    { path: "Notes/Project plan.md", viewType: "markdown" },
    { path: "Notes/Tools.md", viewType: "markdown" },
  ],
};
const opts = { lang: "de" as const, selectionMax: 600, tabsMax: 12, frontmatterMax: 300, windowTokens: 8192 };

describe("buildPanelViewModel", () => {
  it("zeigt Arbeitsplatz-Chips fuer aktive Notiz, Markierung und Tabs", () => {
    const vm = buildPanelViewModel(snap, new Set(), opts);
    const ws = vm.sections.find((s) => s.id === "workspace");
    expect(ws?.chips.map((c) => c.source)).toEqual(["active", "selection", "tab"]);
    expect(ws?.chips[0]?.label).toBe("Project plan");
    expect(ws?.chips[1]?.hint).toBe("13 Z.");
  });
  it("zieht denselben Tab-Pfad wie der Block zusammen — ein Chip je Notiz", () => {
    const vm = buildPanelViewModel(snap, new Set(), opts);
    const tabs = vm.sections.find((s) => s.id === "workspace")?.chips.filter((c) => c.source === "tab") ?? [];
    expect(tabs.map((c) => c.path)).toEqual(["Notes/Tools.md"]);
  });
  it("markiert abgewaehlte Chips, entfernt sie aber nicht — sonst waeren sie unerreichbar", () => {
    const vm = buildPanelViewModel(snap, new Set([itemKey("tab", "Notes/Tools.md")]), opts);
    const chip = vm.sections[0]?.chips.find((c) => c.path === "Notes/Tools.md");
    expect(chip?.off).toBe(true);
    expect(vm.hasOff).toBe(true);
  });
  it("die Summenzeile misst den GEFILTERTEN Block, nicht den vollen", () => {
    const voll = buildPanelViewModel(snap, new Set(), opts).summary;
    const knapp = buildPanelViewModel(snap, new Set([itemKey("tab", "Notes/Tools.md")]), opts).summary;
    expect(knapp).not.toBe(voll);
  });
  it("meldet is-warning, wenn der Block das Fenster fuellt", () => {
    const eng = buildPanelViewModel(snap, new Set(), { ...opts, windowTokens: 32 });
    expect(eng.state).toBe("is-warning");
  });
  it("ohne aktive Notiz und ohne Tabs bleibt ein Empty-State statt einer leeren Flaeche", () => {
    const vm = buildPanelViewModel({ active: null, tabs: [] }, new Set(), opts);
    expect(vm.sections[0]?.chips).toEqual([]);
    expect(vm.sections[0]?.empty).not.toBe("");
  });
  it("englisch", () => {
    const vm = buildPanelViewModel(snap, new Set(), { ...opts, lang: "en" });
    expect(vm.sections[0]?.title).toBe("Workspace");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/context_panel_vm.test.ts`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implementation**

Create `src/core/context/panel-vm.ts`:

```typescript
/* Was der Kontext-Tab zeigt — als reine Funktion des Zustands (UI-STANDARD §4).
 * Der Renderer im Panel baut daraus DOM und trifft keine eigene Entscheidung.
 *
 * Die Größenmessung ruft denselben `renderWorkspaceContext` wie `currentContext()`: die
 * Summenzeile misst damit den Block, der wirklich gesendet wird, statt ihn nachzurechnen.
 * Zwei Wege zu einer Zahl wären zwei Wahrheiten. */
import type { WorkspaceSnapshot } from "./ports";
import type { ContextSource } from "./types";
import { applySelection, itemKey, type SelectionKey } from "./selection";
import { dedupeTabs, renderWorkspaceContext } from "./workspace-line";

export interface PanelChip {
  source: ContextSource;
  path: string;
  label: string;
  hint: string;
  off: boolean;
}
export interface PanelSection {
  id: string;
  title: string;
  chips: PanelChip[];
  empty: string;
}
export interface PanelViewModel {
  sections: PanelSection[];
  summary: string;
  state: "is-ok" | "is-warning";
  hasOff: boolean;
}

const T = {
  de: {
    workspace: "Arbeitsplatz",
    empty: "Keine aktive Notiz — öffne eine Notiz im Hauptbereich.",
    chars: (n: number) => `${n} Z.`,
    summary: (kb: string, pct: number) => `${kb} KB · Fenster ${pct} %`,
  },
  en: {
    workspace: "Workspace",
    empty: "No active note — open one in the main area.",
    chars: (n: number) => `${n} chars`,
    summary: (kb: string, pct: number) => `${kb} KB · window ${pct} %`,
  },
} as const;

/** Dateiname ohne Ordner und ohne `.md`. Der volle Pfad steht im Tooltip des Chips —
 *  in einer schmalen Sidebar ist er als Beschriftung unbrauchbar. */
function chipLabel(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  return base.endsWith(".md") ? base.slice(0, -3) : base;
}

/** Dieselbe grobe Schätzung wie die Verdichtung (`context-usage.ts`): 4 Zeichen ≈ 1 Token.
 *  Genauer wäre ein Tokenizer, den Koda nicht hat und für eine Anzeige nicht braucht. */
const CHARS_PER_TOKEN = 4;
const WARN_AT = 0.8;

export function buildPanelViewModel(
  snap: WorkspaceSnapshot,
  off: ReadonlySet<SelectionKey>,
  opts: { lang: "de" | "en"; selectionMax: number; tabsMax: number; frontmatterMax: number; windowTokens: number },
): PanelViewModel {
  const t = T[opts.lang];
  const chips: PanelChip[] = [];
  const a = snap.active;
  if (a !== null) {
    chips.push({ source: "active", path: a.path, label: chipLabel(a.path), hint: "", off: off.has(itemKey("active", a.path)) });
    if (a.selection !== "") {
      chips.push({
        source: "selection", path: a.path, label: chipLabel(a.path),
        hint: t.chars(a.selection.length), off: off.has(itemKey("selection", a.path)),
      });
    }
  }
  // Entdoppelt wie der Block selbst: zwei Chips für dieselbe Notiz wären zwei Schalter für
  // einen Zustand — der zweite Klick sähe wirkungslos aus.
  for (const x of dedupeTabs(snap.tabs)) {
    if (a !== null && x.path === a.path) continue;
    chips.push({ source: "tab", path: x.path, label: chipLabel(x.path), hint: "", off: off.has(itemKey("tab", x.path)) });
  }

  const gefiltert = applySelection(snap, off);
  const text = renderWorkspaceContext(gefiltert, opts).text;
  const kb = (text.length / 1024).toFixed(1);
  const pct = Math.min(100, Math.round((text.length / CHARS_PER_TOKEN / Math.max(1, opts.windowTokens)) * 100));

  return {
    sections: [{ id: "workspace", title: t.workspace, chips, empty: chips.length === 0 ? t.empty : "" }],
    summary: t.summary(kb, pct),
    state: pct >= WARN_AT * 100 ? "is-warning" : "is-ok",
    hasOff: off.size > 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/context_panel_vm.test.ts`
Expected: PASS (7 Tests).

- [ ] **Step 5: Gate + Commit**

```bash
npm run gate
git add src/core/context/panel-vm.ts tests/context_panel_vm.test.ts
git commit -m "feat(kontext): ViewModel des Kontext-Tabs, pure"
```

---

### Task 6: Chat-Aufbau in eine Methode ziehen (kein Verhaltenswechsel)

**Files:**
- Modify: `src/obsidian/view.ts:53-113` (`onOpen`)

**Interfaces:**
- Consumes: nichts Neues.
- Produces: `private mountChat(container: HTMLElement): void` — baut `koda-log`, `koda-status`, `koda-input-bar` in den übergebenen Container statt in `contentEl`.

**Warum getrennt von Task 7:** Dieser Task ändert **nichts** am DOM-Ergebnis — derselbe Baum, nur ein Aufruf tiefer. Ein Reviewer kann ihn allein prüfen, und der GUI-Smoke muss danach unverändert 28/28 liefern. Erst Task 7 verschiebt den Container wirklich. Wer beides zusammen macht, weiß bei einem roten Punkt nicht, welche Hälfte schuld ist (dieselbe Lehre wie bei den getrennten Gegenproben zu 27/28).

- [ ] **Step 1: Aufbau verschieben**

**Exakt zu verschieben: `src/obsidian/view.ts` Zeilen 76–105** (Stand `b341532`), also von `this.logEl = root.createDiv({ cls: "koda-log" });` bis einschließlich `buttons.createEl("button", { text: t("view.stop") })…`. Diese dreißig Zeilen wandern **wörtlich**, mit einer einzigen Änderung: `root.createDiv` → `container.createDiv` in der ersten Zeile. Kommentare mitnehmen — sie erklären, warum „Neues Gespräch" nicht mehr in der Knopfzeile sitzt.

In `onOpen()` bleibt stehen: `root.empty()`, `root.addClass("koda-root")`, die Kopfzeile `.koda-header` samt Thinking- und Neues-Gespräch-Knopf, `this.syncThinkAction()`, `this.renderLog()`, `this.paintStatus()`.

Neue Methode:

```typescript
  /** Der Chat-Inhalt (Verlauf, Statuszeile, Eingabe) in einen beliebigen Container.
   *  Aufgeteilt für den Hub: bis Etappe 2 baute `onOpen` direkt in `contentEl`. Der Baum ist
   *  derselbe geblieben — wer hier etwas ändert, ändert den Chat, nicht den Umbau. */
  private mountChat(container: HTMLElement): void {
    this.logEl = container.createDiv({ cls: "koda-log" });
    // ab hier Zeilen 77–105 unverändert (Wikilink-Delegation, Statuszeile, Eingabe-Bar,
    // Modus-Dropdown, Senden, Stopp)
  }
```

In `onOpen()` an der frei gewordenen Stelle:

```typescript
    this.mountChat(root);
```

- [ ] **Step 2: Gate**

Run: `npm run gate`
Expected: grün, unverändert 598 Tests.

- [ ] **Step 3: GUI-Smoke als Regressionsprobe**

```bash
python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label koda-agent --intent "Smoke nach mountChat-Extraktion" --exclusive focus --ttl 300
npm run build && cp main.js manifest.json styles.css "$STAGING_VAULTS_DIR/koda-agent/.obsidian/plugins/koda-agent/"
npm run smoke:gui -- --vault koda-agent
python3 ~/.claude/hooks/obsidian-cdp-lock.py release
```
Expected: **28/28** — identisch zum Stand vor dem Task. Ein einziger roter Punkt heißt: der Baum hat sich doch geändert.

- [ ] **Step 4: Commit**

```bash
git add src/obsidian/view.ts
git commit -m "refactor(view): Chat-Aufbau in mountChat ziehen (kein Verhaltenswechsel)"
```

---

### Task 7: Hub-Umbau der View

**Files:**
- Modify: `src/obsidian/view.ts`
- Create: `src/obsidian/context-panel.ts`

**Interfaces:**
- Consumes: `buildHubInto`/`HubPanel`/`HubController` (Task 1), `buildPanelViewModel` (Task 5), `toggleContextItem`/`resetContextSelection`/`contextOff` (Task 4), `collapsibleSection`/`CollapsibleStorage` (Task 1).
- Produces:
  - `src/obsidian/context-panel.ts`: `interface ContextPanelHost { mode(): ContextMode; setMode(m: ContextMode): void; viewModel(): PanelViewModel; toggle(source: ContextSource, path: string): void; reset(): void; openNote(path: string): void; sectionStorage(): CollapsibleStorage; }` und `class ContextPanel implements HubPanel<"context">`.
  - `KodaView.syncContextPanel(): void` (ersetzt den Stub aus Task 4).
  - `KodaView.setTab(id: "chat" | "context"): void`.

- [ ] **Step 1: Panel schreiben**

Create `src/obsidian/context-panel.ts`:

```typescript
import { setIcon } from "obsidian";
import type { ContextMode, ContextSource } from "../core/context/types";
import type { PanelViewModel } from "../core/context/panel-vm";
import type { HubPanel } from "../vendor/kit-obsidian/hub";
import { collapsibleSection, type CollapsibleStorage } from "../vendor/kit-obsidian/collapsible";
import { AVAILABLE_MODES, isContextMode } from "../core/context/types";
import { modeLabel } from "../core/context/labels";
import { t } from "../i18n/strings";

/** Schmaler Host-Vertrag (UI-STANDARD §4): das Panel kennt weder Plugin noch Ports.
 *  Nur `viewModel()` hat einen Rückkanal — es liest Zustand, es ändert keinen. */
export interface ContextPanelHost {
  mode(): ContextMode;
  setMode(m: ContextMode): void;
  viewModel(): PanelViewModel;
  toggle(source: ContextSource, path: string): void;
  reset(): void;
  openNote(path: string): void;
  sectionStorage(): CollapsibleStorage;
  lang(): "de" | "en";
}

export class ContextPanel implements HubPanel<"context"> {
  readonly id = "context" as const;
  readonly icon = "list-tree";
  get label(): string { return t("view.tab.context"); }

  private bodyEl: HTMLElement | null = null;
  private modeEl: HTMLSelectElement | null = null;
  private summaryEl: HTMLElement | null = null;
  private summaryIconEl: HTMLElement | null = null;

  constructor(private readonly host: ContextPanelHost) {}

  mount(container: HTMLElement): void {
    const head = container.createDiv({ cls: "koda-ctx-head" });

    // Derselbe Modus wie im Chat — ein Zustand, zwei Bedienstellen (Spec § E6).
    this.modeEl = head.createEl("select", { cls: "dropdown koda-mode", attr: { "aria-label": t("context.dropdownAria") } });
    for (const m of AVAILABLE_MODES) this.modeEl.createEl("option", { value: m, text: modeLabel(m, this.host.lang()) });
    this.modeEl.addEventListener("change", () => {
      const v = this.modeEl?.value;
      if (isContextMode(v)) this.host.setMode(v);
    });

    // §8 Status-Indikator: Form UND Farbe UND Klasse UND aria-label.
    this.summaryEl = head.createDiv({ cls: "koda-ctx-summary" });
    this.summaryIconEl = this.summaryEl.createSpan({ cls: "koda-ctx-summary-icon" });
    this.summaryEl.createSpan({ cls: "koda-ctx-summary-label" });

    this.bodyEl = container.createDiv({ cls: "koda-ctx-body" });
    this.render();
  }

  onShow(): void { this.render(); }
  onFileOpen(): void { this.render(); }
  destroy(): void { this.bodyEl = null; this.modeEl = null; this.summaryEl = null; }

  /** DOM = reine Funktion des Zustands: der Body wird komplett neu gebaut. Das Panel hält
   *  keinen langlebigen internen State (kein Stream, kein Eingabefeld) — das ist genau das
   *  Auswahlkriterium für ViewModel-Re-Render statt Mount-once (UI-STANDARD §4). */
  render(): void {
    const vm = this.host.viewModel();
    if (this.modeEl !== null) this.modeEl.value = this.host.mode();

    if (this.summaryEl !== null && this.summaryIconEl !== null) {
      this.summaryEl.removeClass("is-ok");
      this.summaryEl.removeClass("is-warning");
      this.summaryEl.addClass(vm.state);
      setIcon(this.summaryIconEl, vm.state === "is-warning" ? "alert-triangle" : "gauge");
      const label = this.summaryEl.querySelector<HTMLElement>(".koda-ctx-summary-label");
      if (label !== null) label.setText(vm.summary);
      this.summaryEl.setAttribute("aria-label", vm.summary);
    }

    const body = this.bodyEl;
    if (body === null) return;
    body.empty();

    for (const sec of vm.sections) {
      const inner = collapsibleSection(body, {
        title: sec.title,
        defaultCollapsed: false,
        key: sec.id,
        storage: this.host.sectionStorage(),
      });
      if (sec.chips.length === 0) {
        inner.createDiv({ cls: "koda-empty", text: sec.empty });
        continue;
      }
      const list = inner.createDiv({ cls: "koda-ctx-chips" });
      for (const chip of sec.chips) {
        const el = list.createDiv({ cls: `koda-ctx-chip${chip.off ? " is-off" : ""}` });
        el.setAttribute("title", chip.path);
        const name = el.createSpan({ cls: "koda-ctx-chip-label", text: chip.label });
        name.addEventListener("click", () => { this.host.openNote(chip.path); });
        if (chip.hint !== "") el.createSpan({ cls: "koda-ctx-chip-hint", text: chip.hint });
        const x = el.createSpan({ cls: "koda-ctx-chip-x" });
        setIcon(x, chip.off ? "plus" : "x");
        x.setAttribute("aria-label", chip.off ? t("context.chipOn") : t("context.chipOff"));
        x.addEventListener("click", () => { this.host.toggle(chip.source, chip.path); });
      }
    }

    if (vm.hasOff) {
      body.createEl("button", { cls: "koda-ctx-reset", text: t("context.reset") })
        .addEventListener("click", () => { this.host.reset(); });
    }
  }
}
```

- [ ] **Step 2: View auf den Hub umbauen**

In `src/obsidian/view.ts`, in `onOpen()` nach der Kopfzeile — statt `this.mountChat(root)`:

```typescript
    const chatPanel: HubPanel<KodaTab> = {
      id: "chat",
      get label() { return t("view.tab.chat"); },
      icon: "message-square",
      mount: (c) => { this.mountChat(c); },
      destroy: () => undefined,
    };
    this.ctxPanel = new ContextPanel({
      mode: () => this.plugin.contextMode,
      setMode: (m) => { this.plugin.setContextMode(m); },
      viewModel: () => this.plugin.contextViewModel(),
      toggle: (s, p) => { this.plugin.toggleContextItem(s, p); },
      reset: () => { this.plugin.resetContextSelection(); },
      openNote: (p) => { void this.app.workspace.openLinkText(p, "", false); },
      sectionStorage: () => this.plugin.sectionStorage(),
      lang: () => this.lang(),
    });
    this.hub = buildHubInto<KodaTab>(root.createDiv({ cls: "koda-hub" }), [chatPanel, this.ctxPanel], "chat");
```

Felder und Typ oben in der Klasse:

```typescript
type KodaTab = "chat" | "context";
```
```typescript
  private hub: HubController<KodaTab> | null = null;
  private ctxPanel: ContextPanel | null = null;
```

`onClose()` (anlegen, falls nicht vorhanden):

```typescript
  onClose(): Promise<void> {
    this.hub?.destroy();
    this.hub = null;
    return Promise.resolve();
  }
```

Den Stub aus Task 4 ersetzen und einen Tab-Setter ergänzen:

```typescript
  syncContextPanel(): void { this.ctxPanel?.render(); }
  setTab(id: KodaTab): void { this.hub?.setTab(id); }
```

`syncContextMode()` muss das Panel mitziehen — der Modus hat jetzt zwei Bedienstellen:

```typescript
  syncContextMode(): void {
    if (this.modeEl !== null) this.modeEl.value = this.plugin.contextMode;
    this.ctxPanel?.render();
  }
```

- [ ] **Step 3: Host-Methoden im Plugin**

In `src/main.ts`:

```typescript
  /** Speist den Kontext-Tab. Liest denselben Snapshot und dieselben Einstellungen wie
   *  `currentContext()` — es gibt keinen zweiten Weg zu dem, was angezeigt wird. */
  contextViewModel(): PanelViewModel {
    const s = this.settings;
    return buildPanelViewModel(readWorkspace(this.app, VIEW_TYPE_KODA), this.contextOff, {
      lang: this.promptLang(),
      selectionMax: s.contextSelectionChars,
      tabsMax: s.contextTabsMax,
      frontmatterMax: s.contextFrontmatterChars,
      windowTokens: s.contextWindowTokens,
    });
  }

  /** Auf/Zu-Zustand der Abschnitte, persistiert in `data.json`. */
  sectionStorage(): CollapsibleStorage {
    return {
      getCollapsed: (key) => this.settings.contextSections[key],
      setCollapsed: (key, collapsed) => {
        this.settings.contextSections = { ...this.settings.contextSections, [key]: collapsed };
        void this.saveSettings();
      },
    };
  }
```

- [ ] **Step 4: i18n**

EN:
```typescript
    "view.tab.chat": "Chat",
    "view.tab.context": "Context",
    "context.reset": "Reset selection",
    "context.chipOff": "Leave out of the context",
    "context.chipOn": "Put back into the context",
```
DE:
```typescript
    "view.tab.chat": "Chat",
    "view.tab.context": "Kontext",
    "context.reset": "Auswahl zurücksetzen",
    "context.chipOff": "Aus dem Kontext nehmen",
    "context.chipOn": "Wieder in den Kontext nehmen",
```

- [ ] **Step 5: Gate**

Run: `npm run gate`
Expected: grün.

- [ ] **Step 6: Commit**

```bash
git add src/obsidian/view.ts src/obsidian/context-panel.ts src/main.ts src/i18n/strings.ts
git commit -m "feat(ui): Hub mit Chat- und Kontext-Tab"
```

---

### Task 8: CSS und Befehle

**Files:**
- Modify: `styles.css`
- Modify: `src/main.ts` (zwei `addCommand`)

**Interfaces:**
- Consumes: `KodaView.setTab` (Task 7).
- Produces: Befehle `koda-tab-chat`, `koda-tab-context`.

- [ ] **Step 1: Chip- und Panel-CSS**

Ans Ende von `styles.css`:

```css
/* Kontext-Tab. Chip-Form nach dem vault-rag-Muster (`.vault-rag-ctx-chip`), Zustand hier
   `is-off` statt `is-pinned`: bei vault-rag ist Angeheftetsein die Ausnahme, hier ist es
   das Weglassen. */
.koda-ctx-head { display: flex; align-items: center; gap: var(--size-4-2); padding: var(--size-4-2); }
.koda-ctx-summary { display: flex; align-items: center; gap: var(--size-4-1); font-size: var(--font-ui-smaller); color: var(--text-muted); margin-left: auto; }
.koda-ctx-summary.is-warning { color: var(--text-warning); }
.koda-ctx-summary-icon { display: flex; }
.koda-ctx-body { padding: 0 var(--size-4-2) var(--size-4-2); overflow-y: auto; }
.koda-ctx-chips { display: flex; flex-wrap: wrap; gap: var(--size-2-2); }
.koda-ctx-chip { display: flex; align-items: center; gap: var(--size-2-1); font-size: var(--font-ui-smaller); padding: 2px 6px; border-radius: 10px; background: var(--background-modifier-border); }
.koda-ctx-chip.is-off { opacity: 0.5; text-decoration: line-through; }
.koda-ctx-chip-label { cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 14em; }
.koda-ctx-chip-hint { color: var(--text-muted); }
.koda-ctx-chip-x { display: flex; cursor: pointer; }
.koda-ctx-chip-x svg { width: 12px; height: 12px; }
.koda-ctx-reset { margin-top: var(--size-4-2); }
.koda-empty { color: var(--text-muted); font-size: var(--font-ui-small); padding: var(--size-4-2) 0; }
```

- [ ] **Step 2: Befehle**

In `onload()`:

```typescript
    // Jede Aktion braucht einen Weg, der nicht an der Darstellung hängt (Lehre 0.10.1):
    // ein Tab, den nur ein Knopf erreicht, ist bei ausgeblendetem Knopf unerreichbar.
    this.addCommand({ id: "tab-chat", name: t("cmd.tabChat"), callback: () => { void this.runInView((v) => { v.setTab("chat"); return Promise.resolve(); }); } });
    this.addCommand({ id: "tab-context", name: t("cmd.tabContext"), callback: () => { void this.runInView((v) => { v.setTab("context"); return Promise.resolve(); }); } });
```

i18n EN / DE:
```typescript
    "cmd.tabChat": "Show Chat tab",
    "cmd.tabContext": "Show Context tab",
```
```typescript
    "cmd.tabChat": "Chat-Tab zeigen",
    "cmd.tabContext": "Kontext-Tab zeigen",
```

- [ ] **Step 3: Gate + Commit**

```bash
npm run gate
git add styles.css src/main.ts src/i18n/strings.ts
git commit -m "feat(ui): Kontext-Tab-CSS und Tab-Befehle"
```

---

### Task 9: GUI-Smoke-Punkte 29–31

**Files:**
- Modify: `scripts/gui-smoke.ts` (vor dem abschließenden `} finally {`, nach Punkt 28)

**Interfaces:**
- Consumes: `plugin.currentContext()`, `plugin.contextOff`, `plugin.toggleContextItem`, die DOM-Klassen aus Task 7/8.

- [ ] **Step 1: Punkt 29 — Tabs sind sichtbar und umschaltbar (Größe, nicht Existenz)**

```typescript
    let ok29 = false;
    let detail29 = "";
    try {
      const mass = await cdp.evaluate<{ tabs: number; hoehe: number; labels: string[] }>(`
        const btns = Array.from(document.querySelectorAll(".koda-root .okit-hub-tabs [role='tab'], .koda-root .okit-hub-tabs button"));
        return {
          tabs: btns.length,
          hoehe: Math.min(...btns.map((b) => b.getBoundingClientRect().height)),
          labels: btns.map((b) => b.innerText.trim()),
        };
      `);
      // Größe, nicht Existenz: in einer Seitenleiste kann ein Element im DOM stehen und null
      // Pixel hoch sein — genau der Defekt von 0.10.1.
      ok29 = mass.tabs === 2 && mass.hoehe > 0;
      detail29 = `Tabs: ${mass.tabs} · kleinste Hoehe: ${mass.hoehe}px · Labels: ${mass.labels.join(" | ")}`;
    } catch (error) {
      detail29 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    }
    record("29. Hub-Tabs Chat und Kontext sind sichtbar (Hoehe > 0, nicht nur im DOM)", ok29, detail29);
```

- [ ] **Step 2: Punkt 30 — ein abgewählter Chip ändert den gesendeten Block**

```typescript
    let ok30 = false;
    let detail30 = "";
    try {
      const r = await cdp.evaluate<{ vorher: string; nachher: string; zurueck: string }>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        const vorher = p.currentContext()?.text ?? "";
        const tab = (p.currentContext()?.items ?? []).find((i) => i.source === "tab");
        if (!tab) return { vorher, nachher: "KEIN TAB", zurueck: "" };
        p.toggleContextItem("tab", tab.path);
        const nachher = p.currentContext()?.text ?? "";
        p.resetContextSelection();
        const zurueck = p.currentContext()?.text ?? "";
        return { vorher, nachher, zurueck, pfad: tab.path };
      `);
      ok30 = r.vorher !== r.nachher && r.vorher === r.zurueck;
      detail30 = `Block vorher ${r.vorher.length} Z. → abgewaehlt ${r.nachher.length} Z. → zurueckgesetzt ${r.zurueck.length} Z.`;
    } catch (error) {
      detail30 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    }
    record("30. Ein abgewaehlter Chip verschwindet aus dem gesendeten Block, Zuruecksetzen holt ihn wieder", ok30, detail30);
```

- [ ] **Step 3: Punkt 31 — der Auf/Zu-Zustand überlebt einen Neuaufbau**

```typescript
    let ok31 = false;
    let detail31 = "";
    try {
      const r = await cdp.evaluate<{ gespeichert: unknown; nachReload: unknown }>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.sectionStorage().setCollapsed("workspace", true);
        await p.saveSettings();
        const gespeichert = p.settings.contextSections.workspace;
        const daten = await p.loadData();
        return { gespeichert, nachReload: daten?.contextSections?.workspace };
      `);
      ok31 = r.gespeichert === true && r.nachReload === true;
      detail31 = `im Speicher: ${String(r.gespeichert)} · in data.json: ${String(r.nachReload)}`;
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.sectionStorage().setCollapsed("workspace", false);
        await p.saveSettings();
        return true;
      `).catch(() => undefined);
    } catch (error) {
      detail31 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    }
    record("31. Auf/Zu-Zustand der Abschnitte landet in data.json", ok31, detail31);
```

- [ ] **Step 4: Typecheck + Lauf**

```bash
npm run typecheck:scripts
python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label koda-agent --intent "GUI-Smoke Etappe 2a" --exclusive focus --ttl 300
npm run build && cp main.js manifest.json styles.css "$STAGING_VAULTS_DIR/koda-agent/.obsidian/plugins/koda-agent/"
npm run smoke:gui -- --vault koda-agent
python3 ~/.claude/hooks/obsidian-cdp-lock.py release
```
Expected: **31/31**.

- [ ] **Step 5: Gegenprobe (Pflicht — neue Prüfpunkte sind beim Erstlauf grün und belegen nichts)**

Je Punkt **einzeln** mutieren, nicht gemeinsam: bei einer Sammelmutation wird ein Punkt zum Folgefehler des anderen, und man weiß von keinem, warum er rot ist.

| Punkt | Mutation | erwartete Meldung |
|---|---|---|
| 29 | `HUB_CSS`-Block in `styles.css` auskommentieren | kleinste Höhe 0px |
| 30 | in `currentContext()` das `applySelection(...)` durch `readWorkspace(...)` ersetzen | Block vorher == nachher |
| 31 | in `sectionStorage().setCollapsed` das `void this.saveSettings()` entfernen | `in data.json: undefined` |

Nach jeder Mutation: Quelle aus einer Kopie zurückspielen (`cp`, **nicht** `git checkout` — das nähme die uncommittete Arbeit mit), neu bauen, deployen.

- [ ] **Step 6: Commit**

```bash
git add scripts/gui-smoke.ts
git commit -m "test(smoke): Pruefpunkte 29-31 fuer den Kontext-Tab"
```

---

### Task 10: Doku und Abschluss

**Files:**
- Modify: `CHANGELOG.md` (`## [Unreleased]`, **ohne** Versionsüberschrift — `release.mjs` setzt sie selbst)
- Modify: `docs/SMOKE.md` (Zählung 28 → 31, belegter Lauf)
- Modify: `CLAUDE.md` (Prüfpunkt-Zahl, Struktur-Kurzüberblick um `src/core/context/selection.ts`, `panel-vm.ts`, `src/obsidian/context-panel.ts`)
- Modify: `../REGISTRY.md` (Dach — benannte Scope-Ausnahme)

- [ ] **Step 1: CHANGELOG**

Unter `## [Unreleased]` → `### Added`:

```markdown
- **A Context tab next to the chat.** Koda's sidebar now has two tabs. The Context tab shows
  what the next message will carry — the active note, your selection, the open tabs — as chips
  you can click away one by one, with a line telling you how much of the model's context window
  it fills. What you deselect stays deselected until you press “Reset selection” or start a new
  chat; the setting “Keep context choices” turns that around.
```

- [ ] **Step 2: SMOKE.md**

„Achtundzwanzig dieser Punkte" → „Einunddreißig"; Aufzählung um „2026-09-05 um 29–31 für den Kontext-Tab" ergänzen; belegten Lauf mit der Gegenproben-Tabelle aus Task 9 Step 5 eintragen.

- [ ] **Step 3: REGISTRY**

Im Dach eine Zeile unter § UI:

```markdown
| **Auswählbarer Kontext-Block: was ins Modell geht, als abwählbare Chips** (Muster-Referenz, erstes Exemplar 2026-09-05): Der Abwahl-Zustand filtert den **Snapshot vor dem Rendern**, nicht den gerenderten Text. Dadurch bleibt „was im Block steht, steht in `items`" eine Folge statt einer Behauptung — ein Renderer, der selbst filtert, müsste dieselbe Regel zweimal treffen. Chips werden bei Abwahl **markiert, nicht entfernt** (sonst gäbe es keinen Weg zurück). | `koda-agent/src/core/context/selection.ts` + `panel-vm.ts` (pure) + `src/obsidian/context-panel.ts` | n=1 (Muster-Referenz) |
```

- [ ] **Step 4: Gate + Commit + Push**

```bash
npm run gate
git add CHANGELOG.md docs/SMOKE.md CLAUDE.md
git commit -m "docs: Kontext-Tab in CHANGELOG, SMOKE und CLAUDE.md"
git push origin main && git push github main
```

⚠️ `koda-agent` hat **keinen wirksamen Forgejo→GitHub-Mirror** — beide Pushes einzeln, sonst bleibt GitHub zurück.

- [ ] **Step 5: Abschluss**

Skill `arbeit-abschliessen` fahren: Cockpit-`fokus`, Task [[Arbeitskontext Etappe 2 — Testschuld zuerst, dann Hub mit Kontext-Tab]] fortschreiben, Handoff auf Plan 2b (neue Quellen) zeigen lassen. Ein Release ist möglich, aber nicht Teil dieses Plans — der Store-Rescan bleibt fremdblockiert.

---

## Selbstprüfung (durchgeführt)

**Spec-Abdeckung §E6 „Etappe 2 (Hub)":** `buildHubInto` mit Chat- und Kontext-Tab ✓ (Task 7) · `.koda-header` bleibt ✓ (Task 6/7) · Modus im Panel-Kopf ✓ · Summenzeile als §8-Status-Indikator ✓ · aufklappbare Abschnitte über `collapsibleSection` mit `CollapsibleStorage` ✓ (Task 7/2) · Abschnitt **Arbeitsplatz** mit je Teil abschaltbaren Chips ✓ · Chips mit Größenzusatz, Klick öffnet die Notiz, Kreuz wählt ab ✓ · Empty-State ✓ · `contextKeepChoices` mit Default *bleiben* ✓ (Task 2/4) · „Auswahl zurücksetzen" ✓.

**Bewusst NICHT in diesem Plan** (→ Plan 2b): Modi *Notiz* und *Alle Tabs*, manuelles Hinzufügen (Picker), Budget mit Vorschau, Quellen-Chips unter der Antwort, `.base`/`.canvas` in `read_note`, `contextBudgetChars`/`contextLinkDepth`/`contextAutoK`. Die Abschnitte *Notiz*, *Tabs*, *Manuell*, *Vault*, *Bases* aus der Spec entstehen dort — `PanelViewModel.sections` ist bereits eine Liste, damit sie ohne Umbau dazukommen.

**Typkonsistenz:** `SelectionKey`/`itemKey`/`applySelection` (Task 3) → verwendet in Task 4 und 5 unter denselben Namen ✓ · `PanelViewModel`/`PanelChip`/`PanelSection` (Task 5) → Task 7 ✓ · `HubPanel`/`HubController` (Task 1) → Task 7 ✓ · `CollapsibleStorage` (Task 1) → Task 2 (`contextSections`), Task 7 (`sectionStorage()`) ✓ · `syncContextPanel()` als Stub in Task 4, ersetzt in Task 7 — in Task 4 Step 5 ausdrücklich vermerkt ✓.

**Offen und bewusst so:** `ContextPanel.render()` baut den Body komplett neu. Das ist nach §4 zulässig (zustandsarmes Panel) und macht das DOM zur reinen Funktion des Zustands. Sollte Plan 2b Eingabefelder in das Panel bringen (Picker), ist der Wechsel auf Mount-once für **einzelne Abschnitte** dort zu entscheiden — nicht hier vorweggenommen.
