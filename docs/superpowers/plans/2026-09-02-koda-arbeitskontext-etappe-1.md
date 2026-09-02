# Arbeitskontext, Etappe 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Koda weiß, woran der Nutzer gerade sitzt — aktive Notiz, Kopfdaten, Markierung, Cursor, offene Tabs — als kurzer Block an jeder Nachricht (Modus „Arbeitsplatz"), abschaltbar (Modus „Aus"), plus zwei Werkzeuge: `get_workspace` liest den Arbeitsplatz vollständig, `edit_active_note` ersetzt die Markierung oder fügt am Cursor ein, nach Bestätigung.

**Architecture:** Ein pures Modul `src/core/context/` (Typen, Ports, Rendern des Blocks) hängt ein persistiertes Feld `context` an die Nutzer-Nachricht; die Projektion webt den Block erst beim Rendern für das Modell ein, Stufe 1 der Verdichtung stubbt ihn wie ein Tool-Ergebnis. Ein Obsidian-Adapter `src/obsidian/workspace.ts` liefert den Snapshot über `getMostRecentLeaf()` (nicht `activeEditor` — der ist aus der Seitenleiste heraus leer). Der Modus wird je Nachricht im Chat gewählt (Dropdown + Befehle), Voreinstellung und Kappungen stehen in den Einstellungen.

**Tech Stack:** TypeScript, esbuild, vitest (node-env, Obsidian-Mock aus `tests/__mocks__/obsidian.ts`), Obsidian API 1.13.1, CDP-Smoke über `../../tools/obsidian-cdp/`.

**Spec:** `docs/superpowers/specs/2026-09-02-koda-arbeitskontext-design.md` — dieser Plan setzt **nur Etappe 1** um (§ Etappen). Etappe 2 (Hub, Panel, Modi Notiz/Tabs) und 3 (Vault, Bases) bekommen eigene Pläne.

## Global Constraints

- `src/core/` importiert **nie** `obsidian` (`npm run check:pure` erzwingt das). Alles Entscheiden, Budgetieren, Rendern ist pure und getestet; Obsidian liefert nur Daten über Ports.
- Werkzeug-Beschreibungen sind **englisch und reines ASCII** (`tests/tool_defs.test.ts` prüft `/^[\x20-\x7E]+$/`) — keine Gedankenstriche, keine Umlaute.
- Nutzertexte gehören nach `src/i18n/strings.ts` in **beide** Sprachen (`en` Zeilen 4–149, `de` 150–291), UI-STANDARD §10: kein Fachbegriff ohne Auflösung.
- **Jeder Wert mit Einfluss auf Kodas Arbeit ist eine Einstellung** mit Spanne im Schema (Spec E8, Johannes 2026-09-02) — Kappungen melden sich trotzdem im Block.
- Nutzer-Nachrichten bleiben **unantastbar**: der Kontextblock wird nie in `content` geschrieben, nur in der Projektion davorgesetzt.
- Es gibt **keinen zweiten Weg**: die gesendete Werkzeugliste entsteht in `currentToolDefs()`, der Kontext in `currentContext()`, die Werkzeuge in `buildTools()` — Smoke und `ask()` rufen dieselben Methoden.
- Vor jedem Commit: `npm run gate` (lint + typecheck + typecheck:scripts + test + check:pure + build). Commit-Messages einzeilig oder per `-F`-Datei (CDP-Guard, Dach-AGENTS).
- GUI-Smoke nur im **Staging-Vault** (`npm run smoke:gui -- --setup`), nie gegen den Arbeits-Vault; Lock **in einem eigenen Aufruf** nehmen: `python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label koda-agent --intent "<was>" --exclusive focus`, danach `release`.
- Vor dem ersten Code-Task: **Baseline** des heutigen Smokes (19/19) festhalten — der Smoke ist selbst Gegenstand des Umbaus (Lesson 2026-08-18).

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `src/core/context/types.ts` (neu) | `ContextMode`, `ContextItem`, `ContextAttachment`, Prüfer `isContextAttachment`, `AVAILABLE_MODES` |
| `src/core/context/ports.ts` (neu) | `WorkspaceSnapshot`, `WorkspacePort`, `EditorPort` — obsidian-freie Verträge |
| `src/core/context/labels.ts` (neu) | `modeLabel(mode, lang)`, `contextSummary(ctx, lang)` — Wortlaut für Block-Kopf, Stub und Kontextzeile |
| `src/core/context/workspace-line.ts` (neu) | `renderWorkspaceContext` (der Block) und `renderWorkspaceReport` (Text für `get_workspace`) |
| `src/core/agent/types.ts` | `ChatMessage.context?`, Projektionsflag `contextStubbed?`, `CompactionRecord.stats.contexts?` |
| `src/core/memory/session.ts` | `parseLines` prüft `context` minimal |
| `src/core/agent/compaction/project.ts` | Einweben beim Rendern, Stufe-1-Zählung über beide Sorten, `formatContextStub` |
| `src/core/agent/compaction/stage1.ts` | Bytes und `stats.contexts` |
| `src/core/tools/defs.ts` | `get_workspace`, `edit_active_note` |
| `src/core/prompt/rules.ts` | ein Satz zum Block; `READING_TOOLS` + `get_workspace` |
| `src/core/settings-types.ts` | `contextModeDefault`, `contextSelectionChars`, `contextTabsMax`, `contextFrontmatterChars` |
| `src/obsidian/workspace.ts` (neu) | Adapter: `readWorkspace`, `linesAround`, `editorPort` |
| `src/obsidian/vault-tools.ts` | zwei neue Werkzeuge, Ports in `opts` |
| `src/obsidian/settings.ts` | Gruppe „Arbeitskontext" |
| `src/obsidian/view.ts` | Modus-Dropdown, Kontextzeile, `focusInput`, `syncContextMode` |
| `src/main.ts` | Modus-Zustand, `currentContext()`, `buildTools()`, Befehle, Kontextmenü, Belegung auf Projektion |
| `src/i18n/strings.ts`, `styles.css` | Wortlaut, Darstellung |
| `scripts/gui-ask.ts`, `scripts/gui-smoke.ts` | Kontext im Bericht; Prüfpunkte 20–23 |
| `docs/SMOKE.md`, `README.md`, `CHANGELOG.md` | Handpunkte 23/24, Features, Unreleased |

---

### Task 0: Baseline festhalten

**Files:**
- Modify: `docs/SMOKE.md` (Abschnitt „Belegter Lauf" ergänzen)

- [ ] **Step 1: Lock nehmen — eigener Aufruf, nichts dahinter**

```bash
python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label koda-agent --intent "Baseline-Smoke vor Arbeitskontext Etappe 1" --exclusive focus
```

- [ ] **Step 2: Smoke gegen den Staging-Vault fahren**

```bash
npm run build && npm run smoke:gui -- --setup && npm run smoke:gui -- --vault koda-agent
```
Erwartet: `19/19 grün`. Fällt etwas rot, ist das der Vorbefund — notieren, nicht reparieren.

- [ ] **Step 3: Lock freigeben**

```bash
python3 ~/.claude/hooks/obsidian-cdp-lock.py release
```

- [ ] **Step 4: Ergebnis in `docs/SMOKE.md` eintragen** — neuer Abschnitt vor „Belegter Lauf: 2026-09-02, zwei Messlücken geschlossen":

```markdown
## Baseline vor Arbeitskontext Etappe 1: 2026-09-02 (19/19)

Treiber `7c5291a`, Plugin-Build aus `main` vor dem ersten Kontext-Commit, Staging-Vault aus dem
Fixture. Festgehalten, weil der Smoke in Etappe 1 selbst umgebaut wird (Prüfpunkte 20–23) und ein
grüner Lauf danach sonst nicht von „anders grün" zu unterscheiden wäre.
```

- [ ] **Step 5: Commit**

```bash
git add docs/SMOKE.md && git commit -q -m "docs(smoke): Baseline 19/19 vor Arbeitskontext Etappe 1" -m $'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01H5NqLP6BG5B8BNn5avHEkS'
```

---

### Task 1: Typen und Prüfer des Kontextfelds

**Files:**
- Create: `src/core/context/types.ts`
- Test: `tests/context_types.test.ts`

**Interfaces:**
- Produces: `CONTEXT_MODES`, `ContextMode`, `ContextSource`, `ContextKind`, `ContextItem`, `ContextAttachment`, `isContextMode(v)`, `isContextAttachment(raw)`, `AVAILABLE_MODES`.

- [ ] **Step 1: Failing test**

```ts
// tests/context_types.test.ts
import { AVAILABLE_MODES, CONTEXT_MODES, isContextAttachment, isContextMode, type ContextAttachment } from "../src/core/context/types";

const ok: ContextAttachment = {
  mode: "workspace",
  items: [{ source: "active", path: "Notes/Plan.md", kind: "pointer", chars: 40 }],
  text: "[Arbeitskontext · Arbeitsplatz]\nAktive Notiz: Notes/Plan.md",
};

describe("isContextAttachment", () => {
  it("nimmt ein vollstaendiges Feld an", () => {
    expect(isContextAttachment(ok)).toBe(true);
  });
  it("lehnt off als Modus ab — ein Feld mit Modus Aus darf es nicht geben", () => {
    expect(isContextAttachment({ ...ok, mode: "off" })).toBe(false);
  });
  it("lehnt kaputte Formen ab: null, fehlender Text, Item ohne Pfad, unbekannter Modus", () => {
    expect(isContextAttachment(null)).toBe(false);
    expect(isContextAttachment({ mode: "workspace", items: [] })).toBe(false);
    expect(isContextAttachment({ ...ok, items: [{ source: "active", kind: "pointer", chars: 1 }] })).toBe(false);
    expect(isContextAttachment({ ...ok, mode: "galaxy" })).toBe(false);
  });
  it("optionale Felder duerfen fehlen oder gesetzt sein", () => {
    expect(isContextAttachment({ ...ok, items: [{ ...ok.items[0], fullChars: 900, depth: 1, via: "x.base" }] })).toBe(true);
  });
});

describe("Modi", () => {
  it("kennt fuenf Modi, off zuerst", () => {
    expect(CONTEXT_MODES[0]).toBe("off");
    expect(CONTEXT_MODES).toHaveLength(5);
    expect(isContextMode("vault")).toBe(true);
    expect(isContextMode("vaults")).toBe(false);
  });
  it("Etappe 1 bietet genau off und workspace an", () => {
    expect(AVAILABLE_MODES).toEqual(["off", "workspace"]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/context_types.test.ts` — Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implementierung**

```ts
// src/core/context/types.ts
/* Arbeitskontext — was der Nutzer gerade vor sich hat, als Anhang an einer Nutzer-Nachricht.
 * Spec: docs/superpowers/specs/2026-09-02-koda-arbeitskontext-design.md (E2). Pure. */

export const CONTEXT_MODES = ["off", "workspace", "note", "tabs", "vault"] as const;
export type ContextMode = (typeof CONTEXT_MODES)[number];

/** Etappe 1 baut zwei Modi; die uebrigen stehen in der Spec und kommen mit Etappe 2/3.
 *  Ein Modus, der noch nicht geht, wird NICHT angeboten (Spec E6: ein Eintrag, der nie
 *  geht, ist kein Versprechen). */
export const AVAILABLE_MODES: readonly ContextMode[] = ["off", "workspace"];

export type ContextSource =
  | "active" | "selection" | "tab" | "link" | "backlink" | "related" | "vault" | "manual" | "folder" | "base";
export type ContextKind = "pointer" | "full" | "table";

export interface ContextItem {
  source: ContextSource;
  path: string;
  kind: ContextKind;
  /** Zeichen im gerenderten Block — nach Kuerzung. */
  chars: number;
  /** Zeichen vor der Kuerzung; nur gesetzt, wenn gekuerzt wurde. */
  fullChars?: number;
  /** Link-Ebene (1 = direkt), nur bei link/backlink (Etappe 2). */
  depth?: number;
  /** Bases: Base-Pfad + Ansicht, aus der die Zeile stammt (Etappe 3). */
  via?: string;
}

export interface ContextAttachment {
  mode: Exclude<ContextMode, "off">;
  items: ContextItem[];
  /** Der Block, wie er gesendet wurde. Persistiert — Notizen aendern sich, der Beleg nicht. */
  text: string;
}

export function isContextMode(v: unknown): v is ContextMode {
  return typeof v === "string" && (CONTEXT_MODES as readonly string[]).includes(v);
}

function isItem(raw: unknown): raw is ContextItem {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.source === "string" && typeof r.path === "string" && typeof r.kind === "string" && typeof r.chars === "number";
}

/** Minimal geprueft wie die Verdichtungs-Marke in `parseLines`: ein kaputtes Feld kostet
 *  das Feld, nicht die Nachricht. */
export function isContextAttachment(raw: unknown): raw is ContextAttachment {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return isContextMode(r.mode) && r.mode !== "off" && Array.isArray(r.items) && r.items.every(isItem) && typeof r.text === "string";
}
```

- [ ] **Step 4: Run** `npx vitest run tests/context_types.test.ts` — Expected: PASS (6 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/context/types.ts tests/context_types.test.ts && git commit -q -m "feat(context): Typen und Pruefer des Kontextfelds (Spec E2)" -m $'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01H5NqLP6BG5B8BNn5avHEkS'
```

---

### Task 2: Kontextfeld an der Nachricht, Roundtrip durch die Session

**Files:**
- Modify: `src/core/agent/types.ts` (`ChatMessage`, `CompactionRecord.stats`)
- Modify: `src/core/memory/session.ts` (`parseLines`)
- Test: `tests/session.test.ts` (ergänzen)

**Interfaces:**
- Consumes: `ContextAttachment`, `isContextAttachment` (Task 1)
- Produces: `ChatMessage.context?: ContextAttachment`, `ChatMessage.contextStubbed?: true` (nur Projektion), `CompactionRecord.stats.contexts?: number`.

- [ ] **Step 1: Failing test** — an `tests/session.test.ts` anhängen:

```ts
describe("Kontextfeld im JSONL", () => {
  const ctx = { mode: "workspace" as const, items: [{ source: "active" as const, path: "A.md", kind: "pointer" as const, chars: 20 }], text: "[Arbeitskontext · Arbeitsplatz]\nAktive Notiz: A.md" };
  it("ueberlebt den Roundtrip an einer Nutzer-Nachricht", () => {
    const m: ChatMessage = { role: "user", content: "Frage", context: ctx };
    expect(parseLines(serializeLine(m))).toEqual([m]);
  });
  it("ein kaputtes Feld kostet das Feld, nicht die Nachricht", () => {
    const line = JSON.stringify({ role: "user", content: "Frage", context: { mode: "off", items: "x" } }) + "\n";
    expect(parseLines(line)).toEqual([{ role: "user", content: "Frage" }]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/session.test.ts` — Expected: FAIL (Typfehler `context` unbekannt / zweiter Test liefert das kaputte Feld durch).

- [ ] **Step 3: Implementierung**

In `src/core/agent/types.ts` oben importieren und `ChatMessage` erweitern:

```ts
import type { ContextAttachment } from "../context/types";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  /** Nur in der Projektion (`projectForModel`): dieses Tool-Ergebnis ist ein Stub. Nie persistiert. */
  stubbed?: true;
  /** Nur in der Projektion: zusammengesetzte fruehere Nutzer-Nachrichten (Stufe 2). Nie persistiert. */
  merged?: true;
  /** Arbeitskontext, der mit dieser Nutzer-Nachricht ging. PERSISTIERT — anders als die zwei
   *  Felder darueber. `content` bleibt der reine Nutzertext; eingewoben wird erst in der
   *  Projektion (Spec E2/E4). */
  context?: ContextAttachment;
  /** Nur in der Projektion: der Kontextblock dieser Nachricht ist ein Stub (Stufe 1). Nie persistiert. */
  contextStubbed?: true;
}
```

In `CompactionRecord.stats`:

```ts
  /** Was Stufe 1 gekuerzt hat (Anzahl Tool-Ergebnisse, Zeichen) — fuer die Marke im Chat.
   *  `contexts`: zusaetzlich gekuerzte Kontextbloecke; fehlt bei alten Marken. */
  stats: { stubbed: number; bytes: number; contexts?: number };
```

In `src/core/memory/session.ts` importieren und in `parseLines` vor dem `out.push` der Nachricht:

```ts
import { isContextAttachment } from "../context/types";
// …
      if (typeof parsed.role === "string" && typeof parsed.content === "string") {
        // Ein kaputtes Kontextfeld kostet das Feld, nicht die Nachricht (Idiom wie bei der Marke).
        if ("context" in parsed && !isContextAttachment(parsed.context)) delete parsed.context;
        out.push(parsed as unknown as LogEntry);
      }
```

- [ ] **Step 4: Run** `npx vitest run tests/session.test.ts tests/wire.test.ts` — Expected: PASS. (`toWireMessages` bleibt dumm: `role` + `content`; der Wire-Test bleibt grün.)

- [ ] **Step 5: Commit**

```bash
git add src/core/agent/types.ts src/core/memory/session.ts tests/session.test.ts && git commit -q -m "feat(context): Kontextfeld an der Nutzer-Nachricht, persistiert und minimal geprueft" -m $'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01H5NqLP6BG5B8BNn5avHEkS'
```

---

### Task 3: Ports und Wortlaut (Labels)

**Files:**
- Create: `src/core/context/ports.ts`
- Create: `src/core/context/labels.ts`
- Test: `tests/context_labels.test.ts`

**Interfaces:**
- Produces: `ActiveNote`, `WorkspaceSnapshot`, `WorkspacePort { snapshot(); linesAround(radius) }`, `EditorPort { path(); selection(); replaceSelection(text); insertAtCursor(text) }`, `modeLabel(mode, lang)`, `contextSummary(ctx, lang)`.

- [ ] **Step 1: Failing test**

```ts
// tests/context_labels.test.ts
import { contextSummary, modeLabel } from "../src/core/context/labels";
import type { ContextAttachment } from "../src/core/context/types";

describe("modeLabel", () => {
  it("benennt jeden Modus in beiden Sprachen", () => {
    expect(modeLabel("workspace", "de")).toBe("Arbeitsplatz");
    expect(modeLabel("workspace", "en")).toBe("Workspace");
    expect(modeLabel("off", "de")).toBe("Aus");
    expect(modeLabel("vault", "en")).toBe("Vault");
  });
});

describe("contextSummary", () => {
  const ctx: ContextAttachment = {
    mode: "workspace",
    items: [
      { source: "active", path: "Notes/Project plan.md", kind: "pointer", chars: 30 },
      { source: "selection", path: "Notes/Project plan.md", kind: "pointer", chars: 312, fullChars: 1240 },
      { source: "tab", path: "Notes/Tools.md", kind: "pointer", chars: 14 },
      { source: "tab", path: "Notes/Compaction.md", kind: "pointer", chars: 19 },
    ],
    text: "…",
  };
  it("eine Zeile: Modus, aktive Notiz ohne Pfad und Endung, Markierung, Tab-Zahl", () => {
    expect(contextSummary(ctx, "de")).toBe("Arbeitsplatz · Project plan · Markierung 312 Z. · 2 Tabs");
    expect(contextSummary(ctx, "en")).toBe("Workspace · Project plan · selection 312 chars · 2 tabs");
  });
  it("ohne aktive Notiz und ohne Tabs bleibt nur der Modus", () => {
    expect(contextSummary({ mode: "workspace", items: [], text: "" }, "de")).toBe("Arbeitsplatz");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/context_labels.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementierung**

```ts
// src/core/context/ports.ts
/* Vertraege zwischen Kern und Obsidian-Adapter (Spec E3). Pure: nur Typen. */

export interface ActiveNote {
  path: string;
  /** Aus dem Metadaten-Cache, ohne Dateizugriff — null ohne Frontmatter. */
  frontmatter: Record<string, unknown> | null;
  /** "" ohne Markierung. */
  selection: string;
  /** 1-basiert; null ohne Editor (Canvas, Base, PDF, Bild). */
  cursorLine: number | null;
  lineCount: number | null;
}

export interface WorkspaceSnapshot {
  active: ActiveNote | null;
  /** Alle Fenster, Reihenfolge des Workspace; ohne Kodas eigenen Leaf. */
  tabs: { path: string; viewType: string }[];
}

export interface WorkspacePort {
  snapshot(): WorkspaceSnapshot;
  /** Zeilen um den Cursor der aktiven Notiz; `from` 1-basiert. null ohne Editor. */
  linesAround(radius: number): { from: number; lines: string[] } | null;
}

/** Der Editor, in dem der Nutzer arbeitet — fuer `edit_active_note`. Jede Methode liest
 *  FRISCH: zwischen Aufruf und Bestaetigung kann der Nutzer die Notiz gewechselt haben. */
export interface EditorPort {
  path(): string | null;
  selection(): string;
  replaceSelection(text: string): void;
  insertAtCursor(text: string): void;
}
```

```ts
// src/core/context/labels.ts
import type { ContextAttachment, ContextMode } from "./types";

type Lang = "de" | "en";

const MODE: Record<Lang, Record<ContextMode, string>> = {
  de: { off: "Aus", workspace: "Arbeitsplatz", note: "Notiz", tabs: "Alle Tabs", vault: "Vault" },
  en: { off: "Off", workspace: "Workspace", note: "Note", tabs: "All tabs", vault: "Vault" },
};

export function modeLabel(mode: ContextMode, lang: Lang): string {
  return MODE[lang][mode];
}

function basename(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
}

/** Eine Zeile fuer die Kontextzeile unter der Nutzer-Blase und den gui:ask-Bericht. */
export function contextSummary(ctx: ContextAttachment, lang: Lang): string {
  const parts = [modeLabel(ctx.mode, lang)];
  const active = ctx.items.find((i) => i.source === "active");
  if (active !== undefined) parts.push(basename(active.path));
  const sel = ctx.items.find((i) => i.source === "selection");
  if (sel !== undefined) parts.push(lang === "de" ? `Markierung ${sel.chars} Z.` : `selection ${sel.chars} chars`);
  const tabs = ctx.items.filter((i) => i.source === "tab").length;
  if (tabs > 0) parts.push(lang === "de" ? `${tabs} Tabs` : `${tabs} tabs`);
  return parts.join(" · ");
}
```

- [ ] **Step 4: Run** `npx vitest run tests/context_labels.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/context/ports.ts src/core/context/labels.ts tests/context_labels.test.ts && git commit -q -m "feat(context): Ports und Wortlaut fuer Modus und Kontextzeile" -m $'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01H5NqLP6BG5B8BNn5avHEkS'
```

---

### Task 4: Der Arbeitsplatz-Block und der `get_workspace`-Text

**Files:**
- Create: `src/core/context/workspace-line.ts`
- Test: `tests/context_workspace_line.test.ts`

**Interfaces:**
- Consumes: `WorkspaceSnapshot` (Task 3), `ContextAttachment` (Task 1), `modeLabel` (Task 3)
- Produces: `WorkspaceLineOptions { lang; selectionMax; tabsMax; frontmatterMax }`, `renderWorkspaceContext(snap, opts): ContextAttachment`, `renderWorkspaceReport(snap, around, lang): string`, `renderFrontmatter(fm, max): string`.

- [ ] **Step 1: Failing test**

```ts
// tests/context_workspace_line.test.ts
import { renderWorkspaceContext, renderWorkspaceReport, renderFrontmatter } from "../src/core/context/workspace-line";
import type { WorkspaceSnapshot } from "../src/core/context/ports";

const snap: WorkspaceSnapshot = {
  active: {
    path: "Notes/Project plan.md",
    frontmatter: { status: "active", area: "plugin", tags: ["koda", "plan"], position: { start: 0 } },
    selection: "Model control",
    cursorLine: 9,
    lineCount: 11,
  },
  tabs: [
    { path: "Notes/Project plan.md", viewType: "markdown" },
    { path: "Notes/Tools.md", viewType: "markdown" },
    { path: "Board.canvas", viewType: "canvas" },
  ],
};
const opts = { lang: "de" as const, selectionMax: 600, tabsMax: 12, frontmatterMax: 300 };

describe("renderWorkspaceContext", () => {
  it("nennt aktive Notiz, Zeile, Kopfdaten, Markierung und Tabs — nur Zeiger, keine Inhalte", () => {
    const ctx = renderWorkspaceContext(snap, opts);
    expect(ctx.mode).toBe("workspace");
    expect(ctx.text).toContain("[Arbeitskontext · Arbeitsplatz]");
    expect(ctx.text).toContain("Aktive Notiz: Notes/Project plan.md · Zeile 9 von 11");
    expect(ctx.text).toContain("Kopfdaten: status: active · area: plugin · tags: koda, plan");
    expect(ctx.text).not.toContain("position");
    expect(ctx.text).toContain("Markierung (13 Zeichen): „Model control“");
    expect(ctx.text).toContain("Offene Tabs (3): Notes/Project plan.md · Notes/Tools.md · Board.canvas");
    expect(ctx.text).toContain("get_workspace()");
    expect(ctx.items).toEqual([
      { source: "active", path: "Notes/Project plan.md", kind: "pointer", chars: expect.any(Number) },
      { source: "selection", path: "Notes/Project plan.md", kind: "pointer", chars: 13 },
      { source: "tab", path: "Notes/Project plan.md", kind: "pointer", chars: 21 },
      { source: "tab", path: "Notes/Tools.md", kind: "pointer", chars: 14 },
      { source: "tab", path: "Board.canvas", kind: "pointer", chars: 12 },
    ]);
  });
  it("kuerzt die Markierung sichtbar und nennt den Weg zum Rest", () => {
    const long = { ...snap, active: { ...snap.active!, selection: "x".repeat(1000) } };
    const ctx = renderWorkspaceContext(long, { ...opts, selectionMax: 100 });
    expect(ctx.text).toContain("Markierung (1000 Zeichen, gekürzt auf 100, vollständig über get_workspace)");
    expect(ctx.items[1]).toMatchObject({ source: "selection", chars: 100, fullChars: 1000 });
  });
  it("kappt die Tab-Liste mit Zaehler und laesst weitere weg", () => {
    const many = { ...snap, tabs: Array.from({ length: 15 }, (_, i) => ({ path: `N${i}.md`, viewType: "markdown" })) };
    const ctx = renderWorkspaceContext(many, { ...opts, tabsMax: 12 });
    expect(ctx.text).toContain("Offene Tabs (15):");
    expect(ctx.text).toContain("… und 3 weitere (vollständig über get_workspace)");
    expect(ctx.items.filter((i) => i.source === "tab")).toHaveLength(12);
  });
  it("ohne aktive Notiz und ohne Tabs sagt der Block das — und liefert trotzdem einen Block", () => {
    const ctx = renderWorkspaceContext({ active: null, tabs: [] }, opts);
    expect(ctx.text).toContain("Aktive Notiz: keine (kein Editor im Hauptbereich)");
    expect(ctx.text).toContain("Offene Tabs: keine");
    expect(ctx.items).toEqual([]);
  });
  it("frontmatterMax 0 laesst die Kopfdaten weg; leere Markierung ergibt keine Markierungszeile", () => {
    const ctx = renderWorkspaceContext({ ...snap, active: { ...snap.active!, selection: "" } }, { ...opts, frontmatterMax: 0 });
    expect(ctx.text).not.toContain("Kopfdaten");
    expect(ctx.text).not.toContain("Markierung");
    expect(ctx.items.some((i) => i.source === "selection")).toBe(false);
  });
  it("englisch", () => {
    const ctx = renderWorkspaceContext(snap, { ...opts, lang: "en" });
    expect(ctx.text).toContain("[Working context · Workspace]");
    expect(ctx.text).toContain("Active note: Notes/Project plan.md · line 9 of 11");
    expect(ctx.text).toContain("Selection (13 chars)");
    expect(ctx.text).toContain("Open tabs (3)");
  });
});

describe("renderFrontmatter", () => {
  it("rendert Skalare, Listen und Objekte, laesst position weg, kappt mit Ellipse", () => {
    expect(renderFrontmatter({ a: 1, b: true, c: ["x", "y"], d: { k: 1 }, position: {} }, 300)).toBe("a: 1 · b: true · c: x, y · d: {\"k\":1}");
    expect(renderFrontmatter({ a: "x".repeat(50) }, 10)).toBe("a: xxxxxxx…");
    expect(renderFrontmatter(null, 300)).toBe("");
  });
});

describe("renderWorkspaceReport", () => {
  it("liefert Markierung und Cursor-Umgebung vollstaendig und alle Tabs mit Typ", () => {
    const text = renderWorkspaceReport(snap, { from: 7, lines: ["", "# Project plan", "", "Model control makes"] }, "de");
    expect(text).toContain("Aktive Notiz: Notes/Project plan.md · Zeile 9 von 11");
    expect(text).toContain("Markierung (13 Zeichen):\nModel control");
    expect(text).toContain("Cursor-Umgebung (Zeilen 7–10):");
    expect(text).toContain("   8 | # Project plan");
    expect(text).toContain("- Board.canvas (canvas)");
  });
  it("ohne Editor nennt er das statt zu schweigen", () => {
    const text = renderWorkspaceReport({ active: null, tabs: [] }, null, "de");
    expect(text).toContain("Aktive Notiz: keine");
    expect(text).not.toContain("Cursor-Umgebung");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/context_workspace_line.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementierung**

```ts
// src/core/context/workspace-line.ts
/* Der Arbeitsplatz-Block (Modus „Arbeitsplatz"): nur Zeiger, keine Inhalte — Inhalte holt
 * das Modell mit read_note oder get_workspace (Spec E1/E3). Kappungen sind Einstellungen
 * und melden sich im Block; nichts verschwindet still. Pure. */
import type { WorkspaceSnapshot } from "./ports";
import type { ContextAttachment, ContextItem } from "./types";
import { modeLabel } from "./labels";

type Lang = "de" | "en";

export interface WorkspaceLineOptions {
  lang: Lang;
  /** Kappung der Markierung in Zeichen (Einstellung `contextSelectionChars`). */
  selectionMax: number;
  /** Tab-Pfade im Block (Einstellung `contextTabsMax`). */
  tabsMax: number;
  /** Kopfdaten in Zeichen; 0 = keine Zeile (Einstellung `contextFrontmatterChars`). */
  frontmatterMax: number;
}

const T = {
  de: {
    head: "[Arbeitskontext · Arbeitsplatz]",
    active: "Aktive Notiz",
    none: "keine (kein Editor im Hauptbereich)",
    line: (a: number, b: number) => `Zeile ${a} von ${b}`,
    props: "Kopfdaten",
    sel: (n: number) => `Markierung (${n} Zeichen)`,
    selCut: (n: number, m: number) => `Markierung (${n} Zeichen, gekürzt auf ${m}, vollständig über get_workspace)`,
    tabs: (n: number) => `Offene Tabs (${n})`,
    tabsNone: "Offene Tabs: keine",
    more: (n: number) => `… und ${n} weitere (vollständig über get_workspace)`,
    hint: "Inhalte auf Anfrage: read_note(<pfad>) · get_workspace() für Cursor-Umgebung und alle Tabs.",
    around: (a: number, b: number) => `Cursor-Umgebung (Zeilen ${a}–${b}):`,
  },
  en: {
    head: "[Working context · Workspace]",
    active: "Active note",
    none: "none (no editor in the main area)",
    line: (a: number, b: number) => `line ${a} of ${b}`,
    props: "Properties",
    sel: (n: number) => `Selection (${n} chars)`,
    selCut: (n: number, m: number) => `Selection (${n} chars, cut to ${m}, full text via get_workspace)`,
    tabs: (n: number) => `Open tabs (${n})`,
    tabsNone: "Open tabs: none",
    more: (n: number) => `… and ${n} more (full list via get_workspace)`,
    hint: "Contents on request: read_note(<path>) · get_workspace() for the cursor surroundings and every tab.",
    around: (a: number, b: number) => `Cursor surroundings (lines ${a}–${b}):`,
  },
} as const;

function scalar(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(scalar).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** `position` ist Obsidians Cache-Zusatz, kein Feld des Nutzers. */
export function renderFrontmatter(fm: Record<string, unknown> | null, max: number): string {
  if (fm === null || max <= 0) return "";
  const text = Object.entries(fm)
    .filter(([k]) => k !== "position")
    .map(([k, v]) => `${k}: ${scalar(v)}`)
    .join(" · ");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function renderWorkspaceContext(snap: WorkspaceSnapshot, opts: WorkspaceLineOptions): ContextAttachment {
  const t = T[opts.lang];
  const lines: string[] = [t.head];
  const items: ContextItem[] = [];
  const a = snap.active;
  if (a === null) {
    lines.push(`${t.active}: ${t.none}`);
  } else {
    const where = a.cursorLine !== null && a.lineCount !== null ? ` · ${t.line(a.cursorLine, a.lineCount)}` : "";
    const activeLine = `${t.active}: ${a.path}${where}`;
    lines.push(activeLine);
    items.push({ source: "active", path: a.path, kind: "pointer", chars: activeLine.length });
    const props = renderFrontmatter(a.frontmatter, opts.frontmatterMax);
    if (props !== "") lines.push(`${t.props}: ${props}`);
    if (a.selection !== "") {
      const cut = a.selection.length > opts.selectionMax;
      const shown = cut ? a.selection.slice(0, opts.selectionMax) : a.selection;
      lines.push(`${cut ? t.selCut(a.selection.length, opts.selectionMax) : t.sel(a.selection.length)}: „${shown}“`);
      const item: ContextItem = { source: "selection", path: a.path, kind: "pointer", chars: shown.length };
      if (cut) item.fullChars = a.selection.length;
      items.push(item);
    }
  }
  if (snap.tabs.length === 0) {
    lines.push(t.tabsNone);
  } else {
    const shown = snap.tabs.slice(0, opts.tabsMax);
    const rest = snap.tabs.length - shown.length;
    lines.push(`${t.tabs(snap.tabs.length)}: ${shown.map((x) => x.path).join(" · ")}${rest > 0 ? ` ${t.more(rest)}` : ""}`);
    for (const x of shown) items.push({ source: "tab", path: x.path, kind: "pointer", chars: x.path.length });
  }
  lines.push(t.hint);
  return { mode: "workspace", items, text: lines.join("\n") };
}

/** Text fuer `get_workspace`: dieselbe Quelle wie der Block, aber vollstaendig. */
export function renderWorkspaceReport(
  snap: WorkspaceSnapshot,
  around: { from: number; lines: string[] } | null,
  lang: Lang,
): string {
  const t = T[lang];
  const out: string[] = [];
  const a = snap.active;
  if (a === null) {
    out.push(`${t.active}: ${lang === "de" ? "keine" : "none"}`);
  } else {
    const where = a.cursorLine !== null && a.lineCount !== null ? ` · ${t.line(a.cursorLine, a.lineCount)}` : "";
    out.push(`${t.active}: ${a.path}${where}`);
    const props = renderFrontmatter(a.frontmatter, Number.MAX_SAFE_INTEGER);
    if (props !== "") out.push(`${t.props}: ${props}`);
    if (a.selection !== "") out.push(`${t.sel(a.selection.length)}:\n${a.selection}`);
    if (around !== null && around.lines.length > 0) {
      const to = around.from + around.lines.length - 1;
      const width = String(to).length;
      out.push(`${t.around(around.from, to)}\n${around.lines.map((l, i) => `${String(around.from + i).padStart(width + 3)} | ${l}`).join("\n")}`);
    }
  }
  if (snap.tabs.length === 0) out.push(t.tabsNone);
  else out.push(`${t.tabs(snap.tabs.length)}:\n${snap.tabs.map((x) => `- ${x.path} (${x.viewType})`).join("\n")}`);
  return out.join("\n\n");
}

/** Fuer den Block-Kopf anderer Modi (Etappe 2/3) — hier nur, damit `modeLabel` ein
 *  Konsument im Kern hat und der Import nicht tot ist. */
export function contextHead(mode: ContextAttachment["mode"], lang: Lang): string {
  return lang === "de" ? `[Arbeitskontext · ${modeLabel(mode, lang)}]` : `[Working context · ${modeLabel(mode, lang)}]`;
}
```

Hinweis zum Test `"   8 | # Project plan"`: bei `to = 10` ist `width = 2`, `padStart(5)` ergibt `"    8"`; der Test erwartet drei Leerzeichen vor der 8 — **passe den Test an das Ergebnis an** (`"    8 | # Project plan"`), nicht den Code: die Breite folgt der höchsten Zeilennummer.

- [ ] **Step 4: Run** `npx vitest run tests/context_workspace_line.test.ts` — Expected: PASS (9 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/context/workspace-line.ts tests/context_workspace_line.test.ts && git commit -q -m "feat(context): Arbeitsplatz-Block und get_workspace-Text, Kappungen melden sich" -m $'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01H5NqLP6BG5B8BNn5avHEkS'
```

---

### Task 5: Projektion webt den Block ein, Stufe 1 stubbt ihn

**Files:**
- Modify: `src/core/agent/compaction/project.ts`
- Modify: `src/core/agent/compaction/stage1.ts`
- Test: `tests/compaction_project.test.ts`, `tests/compaction_stage1.test.ts` (ergänzen)

**Interfaces:**
- Consumes: `ChatMessage.context`, `contextStubbed` (Task 2), `modeLabel` (Task 3)
- Produces: `formatContextStub(ctx): string`, `stubbableChars(m): number`; `shouldStub` und `stage1Targets` zählen beide Sorten; `projectForModel` rendert `context.text` bzw. den Stub vor den Nutzertext.

- [ ] **Step 1: Failing tests** — an `tests/compaction_project.test.ts` anhängen:

```ts
describe("projectForModel mit Kontextbloecken", () => {
  const ctx = (tag: string, len: number) => ({
    mode: "workspace" as const,
    items: [{ source: "active" as const, path: `${tag}.md`, kind: "pointer" as const, chars: len }],
    text: `[Arbeitskontext · Arbeitsplatz]\n${tag} ${"k".repeat(len)}`,
  });
  const uc = (c: string, tag: string, len: number): ChatMessage => ({ role: "user", content: c, context: ctx(tag, len) });

  it("webt den Block VOR den Nutzertext; content der Nachricht selbst bleibt unangetastet", () => {
    const m = uc("Frage", "A", 10);
    const out = projectForModel([sys, m]);
    expect(out[1].content).toBe(`${m.context!.text}\n\nFrage`);
    expect(out[1].context).toBe(m.context);
    expect(m.content).toBe("Frage");
    // Nachrichten ohne Kontext bleiben Referenzen
    expect(out[0]).toBe(sys);
  });

  it("Stufe 1 zaehlt Kontextbloecke und Tool-Ergebnisse in EINER Reihe: die K juengsten bleiben", () => {
    const h: LogEntry[] = [
      sys,
      uc("F1", "A", STUB_MIN_CHARS + 40), a("A1"),
      uc("F2", "B", STUB_MIN_CHARS + 40), call("c1", "read_note", '{"path":"X.md"}'), tool("c1", big("X")), a("A2"),
      uc("F3", "C", 5),
    ];
    const out = projectForModel([...h, s1(1)]);
    const users = out.filter((m) => m.role === "user");
    // K=1: das juengste Stubbbare ist das Tool-Ergebnis c1 → bleibt; Block B und Block A werden gestubbt
    expect(out.find((m) => m.role === "tool")!.stubbed).toBeUndefined();
    expect(users[0].contextStubbed).toBe(true);
    expect(users[0].content.startsWith(formatContextStub(users[0].context!))).toBe(true);
    expect(users[0].content.endsWith("\n\nF1")).toBe(true);
    expect(users[1].contextStubbed).toBe(true);
    // Der kurze Block C liegt unter STUB_MIN_CHARS und bleibt woertlich
    expect(users[2].contextStubbed).toBeUndefined();
    expect(users[2].content).toContain("[Arbeitskontext");
  });

  it("Stufe 2 fasst nur den Nutzertext zusammen — Kontextbloecke fallen dabei weg", () => {
    const h: LogEntry[] = [sys, uc("Frage 1", "A", 20), a("Antwort 1"), uc("Frage 2", "B", 20)];
    const out = projectForModel([...h, s2("ZUSAMMENFASSUNG", 1)]);
    expect(out[1].content).toContain("1. Frage 1");
    expect(out[1].content).not.toContain("Arbeitskontext");
  });
});

describe("formatContextStub", () => {
  it("nennt Modus, Anzahl, Groesse und den Rueckweg", () => {
    const text = formatContextStub({ mode: "workspace", items: [{ source: "active", path: "A.md", kind: "pointer", chars: 1 }, { source: "tab", path: "B.md", kind: "pointer", chars: 1 }], text: "x".repeat(2048) });
    expect(text).toBe("[Arbeitskontext · Arbeitsplatz — 2 Einträge, 2,0 KB, verdichtet; bei Bedarf über read_note erneut lesen]");
  });
});
```

Import oben in der Datei ergänzen: `formatContextStub` aus `../src/core/agent/compaction/project`.

An `tests/compaction_stage1.test.ts` anhängen:

```ts
describe("planStage1 mit Kontextbloecken", () => {
  const uc = (c: string, len: number): ChatMessage => ({
    role: "user", content: c,
    context: { mode: "workspace", items: [], text: "k".repeat(len) },
  });
  it("zaehlt Kontextbloecke getrennt in stats.contexts und rechnet ihre Zeichen in bytes", () => {
    const h: LogEntry[] = [uc("F1", STUB_MIN_CHARS + 40), call("c1", "read_note", '{"path":"A.md"}'), tool("c1", big("A")), uc("F2", 5)];
    const rec = planStage1(projectForModel(h), 0, "T");
    expect(rec).not.toBeNull();
    expect(rec!.stats.stubbed).toBe(1);
    expect(rec!.stats.contexts).toBe(1);
    expect(rec!.stats.bytes).toBe(big("A").length + STUB_MIN_CHARS + 40);
  });
  it("ohne Kontextbloecke fehlt stats.contexts — alte Marken bleiben, wie sie sind", () => {
    const h: LogEntry[] = [u("F"), call("c1", "read_note", '{"path":"A.md"}'), tool("c1", big("A"))];
    expect(planStage1(projectForModel(h), 0, "T")!.stats.contexts).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/compaction_project.test.ts tests/compaction_stage1.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementierung** in `src/core/agent/compaction/project.ts`:

Import ergänzen: `import { modeLabel } from "../../context/labels"; import type { ContextAttachment } from "../../context/types";`

`shouldStub` und neue Helfer ersetzen/ergänzen:

```ts
/** Ein Kontextblock ist Material wie ein Tool-Ergebnis, kein Nutzertext (Spec E4). */
export function shouldStub(m: ChatMessage): boolean {
  if (m.role === "tool") return m.stubbed !== true && m.content.length > STUB_MIN_CHARS;
  if (m.role === "user" && m.context !== undefined) return m.contextStubbed !== true && m.context.text.length > STUB_MIN_CHARS;
  return false;
}

/** Zeichen, die ein Stub an dieser Nachricht spart. */
export function stubbableChars(m: ChatMessage): number {
  if (m.role === "tool") return m.content.length;
  return m.context?.text.length ?? 0;
}

/** Stub-Text fuer einen Kontextblock: WAS weg ist und WIE es zurueckkommt. Deutsch wie
 *  `formatStub` — der Prompt-Regelblock ist englisch, die Stubs sind es im Bestand nicht. */
export function formatContextStub(ctx: ContextAttachment): string {
  return `[Arbeitskontext · ${modeLabel(ctx.mode, "de")} — ${ctx.items.length} Einträge, ${formatKb(ctx.text.length)}, verdichtet; bei Bedarf über read_note erneut lesen]`;
}
```

`Slot` erweitern und `stage1Targets` beide Sorten zählen lassen:

```ts
interface Slot {
  msg: ChatMessage;
  parts?: string[];
  /** Stufe 1 hat den Kontextblock dieser Nutzer-Nachricht gestubbt. */
  contextStubbed?: true;
}

export function stage1Targets(msgs: ChatMessage[], keep: number): number[] {
  const targets: number[] = [];
  let seen = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    const candidate = m.role === "tool" || (m.role === "user" && m.context !== undefined);
    if (!candidate) continue;
    seen++;
    if (seen <= keep) continue;
    if (!shouldStub(m)) continue;
    targets.push(i);
  }
  return targets;
}
```

`applyStage1` auf Slots mit Sicht auf das Flag:

```ts
function applyStage1(slots: Slot[], rec: CompactionRecord, calls: Map<string, { name: string; args: string }>): void {
  // Die Zaehlung sieht das Slot-Flag, damit ein schon gestubbter Block nicht erneut zaehlt.
  const view = slots.map((s): ChatMessage => (s.contextStubbed === true ? { ...s.msg, contextStubbed: true } : s.msg));
  for (const i of stage1Targets(view, rec.keepToolResults)) {
    const m = slots[i].msg;
    if (m.role === "user") { slots[i] = { ...slots[i], contextStubbed: true }; continue; }
    const c = calls.get(m.toolCallId ?? "");
    slots[i] = {
      msg: {
        role: "tool",
        toolCallId: m.toolCallId,
        content: formatStub(c?.name ?? "tool", c?.args ?? "", m.content.length),
        stubbed: true,
      },
    };
  }
}
```

Rendern am Ende von `projectForModel` — `return slots.map((s) => s.msg);` ersetzen durch:

```ts
  return slots.map(renderSlot);
}

/** Einweben erst hier: Stufe 2 (`applyStage2`) sieht darueber nur den reinen Nutzertext, und
 *  Nachrichten ohne Kontext gehen als Referenz durch (Aufrufer duerfen sie nie beschreiben). */
function renderSlot(s: Slot): ChatMessage {
  const m = s.msg;
  if (m.role !== "user" || m.context === undefined) return m;
  const head = s.contextStubbed === true ? formatContextStub(m.context) : m.context.text;
  const out: ChatMessage = { ...m, content: `${head}\n\n${m.content}` };
  if (s.contextStubbed === true) out.contextStubbed = true;
  return out;
}
```

In `src/core/agent/compaction/stage1.ts`:

```ts
import type { ChatMessage, CompactionRecord } from "../types";
import { stage1Targets, stubbableChars } from "./project";

export function planStage1(projected: ChatMessage[], keep: number, at: string, forced = false): CompactionRecord | null {
  const targets = stage1Targets(projected, keep);
  if (targets.length === 0) return null;
  const bytes = targets.reduce((sum, i) => sum + stubbableChars(projected[i]), 0);
  const contexts = targets.filter((i) => projected[i].role === "user").length;
  const rec: CompactionRecord = {
    kind: "compaction", stage: 1, at, keepToolResults: keep,
    stats: { stubbed: targets.length - contexts, bytes },
  };
  if (contexts > 0) rec.stats.contexts = contexts;
  if (forced) rec.forced = true;
  return rec;
}
```

- [ ] **Step 4: Run** `npx vitest run tests/compaction_project.test.ts tests/compaction_stage1.test.ts tests/compaction_stage2.test.ts tests/loop.test.ts` — Expected: PASS, Bestand unverändert grün.

- [ ] **Step 5: Commit**

```bash
git add src/core/agent/compaction/project.ts src/core/agent/compaction/stage1.ts tests/compaction_project.test.ts tests/compaction_stage1.test.ts && git commit -q -m "feat(context): Projektion webt den Block ein, Stufe 1 stubbt Kontextbloecke nach derselben Zaehlung wie Tool-Ergebnisse" -m $'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01H5NqLP6BG5B8BNn5avHEkS'
```

---

### Task 6: Werkzeug-Definitionen und der Regelblock

**Files:**
- Modify: `src/core/tools/defs.ts` (zwei Einträge in `TOOL_DEFS`, vor `write_note`? — nein: **nach `list_notes`**, damit die Reihenfolge der Bestandsliste unverändert bleibt)
- Modify: `src/core/prompt/rules.ts` (`DEFAULT_RULES`, `READING_TOOLS`)
- Test: `tests/tool_defs.test.ts`, `tests/prompt_rules.test.ts` (ergänzen)

- [ ] **Step 1: Failing tests** — an `tests/tool_defs.test.ts`:

```ts
describe("Arbeitskontext-Werkzeuge", () => {
  it("get_workspace und edit_active_note stehen in TOOL_DEFS, englisch und ASCII", () => {
    for (const name of ["get_workspace", "edit_active_note"]) {
      const d = TOOL_DEFS.find((t) => t.name === name);
      expect(d?.description).toMatch(/^[\x20-\x7E]+$/);
    }
  });
  it("edit_active_note verlangt Pfad, Modus und Text; der Modus ist ein Enum", () => {
    const d = TOOL_DEFS.find((t) => t.name === "edit_active_note")!;
    const p = d.parameters as { required: string[]; properties: { mode: { enum: string[] } } };
    expect(p.required).toEqual(["path", "mode", "text"]);
    expect(p.properties.mode.enum).toEqual(["replace_selection", "insert_at_cursor"]);
  });
  it("beide sind abschaltbar wie alle anderen", () => {
    const names = toolDefs({ related: false, disabled: ["get_workspace", "edit_active_note"] }).map((d) => d.name);
    expect(names).not.toContain("get_workspace");
    expect(names).not.toContain("edit_active_note");
  });
});
```

An `tests/prompt_rules.test.ts` (im `describe("DEFAULT_RULES")`):

```ts
  it("erklaert den Arbeitskontext-Block und zaehlt get_workspace zu den lesenden Werkzeugen", () => {
    expect(DEFAULT_RULES).toContain("[Working context]");
    expect(READING_TOOLS).toContain("get_workspace");
  });
```

- [ ] **Step 2: Run** `npx vitest run tests/tool_defs.test.ts tests/prompt_rules.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementierung** — in `src/core/tools/defs.ts` nach dem `list_notes`-Eintrag einfügen:

```ts
  {
    name: "get_workspace",
    description:
      "What the user is looking at right now: the active note with its properties, the full selection, the lines around the cursor, and every open tab. A user message may start with a short [Working context] block that summarises this; call get_workspace when you need the full selection, the cursor surroundings, or the complete tab list.",
    parameters: {
      type: "object",
      properties: {
        around_cursor: { type: "integer", description: "Lines of context above and below the cursor, default 20" },
      },
      required: [],
    },
  },
  {
    name: "edit_active_note",
    description:
      "Edit the note the user is working in: replace the current selection or insert at the cursor. Always shows the change and asks the user first. Pass the path of the active note exactly as given in the working context; the call fails if another note became active or the selection changed since.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path of the active note, as shown in the working context" },
        mode: { type: "string", enum: ["replace_selection", "insert_at_cursor"], description: "replace_selection needs a selection; insert_at_cursor inserts at the caret" },
        text: { type: "string", description: "The replacement or the text to insert" },
      },
      required: ["path", "mode", "text"],
    },
  },
```

In `src/core/prompt/rules.ts` einen Satz in `DEFAULT_RULES` nach dem `search and read`-Satz einfügen und `READING_TOOLS` ergänzen:

```ts
  "A user message may begin with a [Working context] block: it tells you which note is open, what is selected and which tabs exist. Treat it as the user's current view, read the note with read_note when the question is about it, and never quote the block back.",
// …
export const READING_TOOLS = ["search_notes", "read_note", "list_notes", "related_notes", "get_workspace"];
```

- [ ] **Step 4: Run** `npx vitest run tests/tool_defs.test.ts tests/prompt_rules.test.ts tests/prompt_build.test.ts tests/prompt_view_model.test.ts tests/model_control.test.ts` — Expected: PASS. Fällt ein Bestandstest, der die **Anzahl** der Werkzeuge oder Sätze zählt, wird er auf die neue Zahl angepasst — das ist die beabsichtigte Änderung, keine Regression.

- [ ] **Step 5: Commit**

```bash
git add src/core/tools/defs.ts src/core/prompt/rules.ts tests/tool_defs.test.ts tests/prompt_rules.test.ts tests/model_control.test.ts && git commit -q -m "feat(context): Werkzeuge get_workspace und edit_active_note, Regelblock erklaert den Block" -m $'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01H5NqLP6BG5B8BNn5avHEkS'
```

---

### Task 7: Einstellungen

**Files:**
- Modify: `src/core/settings-types.ts`
- Modify: `src/obsidian/settings.ts` (neue Gruppe nach „Kontext & Verdichtung")
- Modify: `src/i18n/strings.ts`
- Test: `tests/settings_types.test.ts` (ergänzen)

**Interfaces:**
- Produces: `contextModeDefault: ContextMode`, `contextSelectionChars`, `contextTabsMax`, `contextFrontmatterChars`; Konstanten `CONTEXT_SELECTION_MIN/MAX/STEP`, `CONTEXT_TABS_MIN/MAX`, `CONTEXT_FRONTMATTER_MIN/MAX/STEP`.

- [ ] **Step 1: Failing test** — an `tests/settings_types.test.ts`:

```ts
describe("Arbeitskontext-Einstellungen", () => {
  it("Defaults: Arbeitsplatz, 600 Zeichen Markierung, 12 Tabs, 300 Zeichen Kopfdaten", () => {
    const s = validateKodaSettings(null);
    expect(s.contextModeDefault).toBe("workspace");
    expect(s.contextSelectionChars).toBe(600);
    expect(s.contextTabsMax).toBe(12);
    expect(s.contextFrontmatterChars).toBe(300);
  });
  it("klemmt die Kappungen in ihre Spannen und laesst 0 Kopfdaten zu", () => {
    expect(validateKodaSettings({ contextSelectionChars: 1 }).contextSelectionChars).toBe(CONTEXT_SELECTION_MIN);
    expect(validateKodaSettings({ contextTabsMax: 999 }).contextTabsMax).toBe(CONTEXT_TABS_MAX);
    expect(validateKodaSettings({ contextFrontmatterChars: 0 }).contextFrontmatterChars).toBe(0);
  });
  it("ein unbekannter Modus faellt auf den Default zurueck, ein noch nicht gebauter (note) bleibt erlaubt", () => {
    expect(validateKodaSettings({ contextModeDefault: "galaxy" }).contextModeDefault).toBe("workspace");
    expect(validateKodaSettings({ contextModeDefault: "off" }).contextModeDefault).toBe("off");
    expect(validateKodaSettings({ contextModeDefault: "note" }).contextModeDefault).toBe("note");
  });
});
```

Import oben ergänzen: `CONTEXT_SELECTION_MIN, CONTEXT_TABS_MAX`.

- [ ] **Step 2: Run** `npx vitest run tests/settings_types.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementierung** in `src/core/settings-types.ts`:

```ts
import { CONTEXT_MODES, type ContextMode } from "./context/types";

/** Spannen fuer den Arbeitskontext (Spec E8). Alle vier sind Einstellungen: jeder Wert, der
 *  Kodas Arbeit beeinflusst, ist aenderbar (Johannes, 2026-09-02) — die Kappungen melden
 *  sich trotzdem im Block, Einstellbarkeit und Meldung schliessen sich nicht aus. */
export const CONTEXT_SELECTION_MIN = 100;
export const CONTEXT_SELECTION_MAX = 5000;
export const CONTEXT_SELECTION_STEP = 100;
export const CONTEXT_TABS_MIN = 1;
export const CONTEXT_TABS_MAX = 100;
export const CONTEXT_FRONTMATTER_MIN = 0;
export const CONTEXT_FRONTMATTER_MAX = 2000;
export const CONTEXT_FRONTMATTER_STEP = 50;
```

In `KodaSettings`:

```ts
  /** Modus beim Laden des Plugins; der Chat ueberstimmt ihn je Nachricht (Spec E1). Erlaubt
   *  sind alle fuenf Modi, auch die noch nicht gebauten — ein Default fuer eine spaetere
   *  Etappe soll nicht beim Laden verworfen werden. Angeboten wird er erst, wenn er geht. */
  contextModeDefault: ContextMode;
  contextSelectionChars: number;
  contextTabsMax: number;
  contextFrontmatterChars: number;
```

In `DEFAULT_SETTINGS`: `contextModeDefault: "workspace", contextSelectionChars: 600, contextTabsMax: 12, contextFrontmatterChars: 300,`

Im `SCHEMA`:

```ts
  contextModeDefault: oneOf([...CONTEXT_MODES]),
  contextSelectionChars: clampIntField(CONTEXT_SELECTION_MIN, CONTEXT_SELECTION_MAX),
  contextTabsMax: clampIntField(CONTEXT_TABS_MIN, CONTEXT_TABS_MAX),
  contextFrontmatterChars: clampIntField(CONTEXT_FRONTMATTER_MIN, CONTEXT_FRONTMATTER_MAX),
```

In `src/obsidian/settings.ts` Importe ergänzen (`CONTEXT_*`-Konstanten, `CONTEXT_MODES`, `modeLabel`, `getLang`) und **nach** der Gruppe „Kontext & Verdichtung" einfügen:

```ts
      {
        type: "group",
        heading: t("settings.context"),
        items: [
          {
            name: t("settings.contextMode"),
            desc: t("settings.contextMode.desc"),
            control: {
              type: "dropdown",
              key: "contextModeDefault",
              // Dieselben Labels wie das Dropdown im Chat — ein Wortlaut, zwei Bedienstellen.
              options: Object.fromEntries(CONTEXT_MODES.map((m) => [m, modeLabel(m, getLang() === "de" ? "de" : "en")])),
            },
          },
          {
            name: t("settings.contextSelection"),
            desc: t("settings.contextSelection.desc"),
            control: { type: "slider", key: "contextSelectionChars", min: CONTEXT_SELECTION_MIN, max: CONTEXT_SELECTION_MAX, step: CONTEXT_SELECTION_STEP },
          },
          {
            name: t("settings.contextTabs"),
            desc: t("settings.contextTabs.desc"),
            control: { type: "slider", key: "contextTabsMax", min: CONTEXT_TABS_MIN, max: CONTEXT_TABS_MAX, step: 1 },
          },
          {
            name: t("settings.contextFrontmatter"),
            desc: t("settings.contextFrontmatter.desc"),
            control: { type: "slider", key: "contextFrontmatterChars", min: CONTEXT_FRONTMATTER_MIN, max: CONTEXT_FRONTMATTER_MAX, step: CONTEXT_FRONTMATTER_STEP },
          },
        ],
      },
```

`getLang` kommt aus `../vendor/kit/i18n` (wie in `main.ts`). Liefert es etwas anderes als `"de"`, gilt Englisch.

In `src/i18n/strings.ts` — **en** (nach `"settings.modelControl"`):

```ts
    "settings.context": "Working context",
    "settings.contextMode": "Context mode on startup",
    "settings.contextMode.desc": "What goes along with each question by default. Off: nothing. Workspace: which note is open, what is selected, where the cursor is, which tabs exist — pointers only, no contents. The dropdown next to the send button changes it per question; this is only the starting value. Note, All tabs and Vault are not built yet and are not offered in the chat.",
    "settings.contextSelection": "Selection in the context (characters)",
    "settings.contextSelection.desc": "How much of a selected text is quoted in the working context. Longer selections are cut and say so; get_workspace returns the full text.",
    "settings.contextTabs": "Open tabs in the context",
    "settings.contextTabs.desc": "How many open tabs are listed by path. The rest is counted, and get_workspace lists all of them.",
    "settings.contextFrontmatter": "Properties in the context (characters)",
    "settings.contextFrontmatter.desc": "How much of the active note's properties (frontmatter) goes into the working context. 0 leaves them out.",
```

**de** (nach `"settings.modelControl"`):

```ts
    "settings.context": "Arbeitskontext",
    "settings.contextMode": "Kontext-Modus beim Start",
    "settings.contextMode.desc": "Was standardmäßig mit jeder Frage mitgeht. Aus: nichts. Arbeitsplatz: welche Notiz offen ist, was markiert ist, wo der Cursor steht, welche Tabs es gibt — nur Zeiger, keine Inhalte. Das Dropdown neben dem Senden-Knopf ändert den Modus je Frage; hier steht nur der Startwert. Notiz, Alle Tabs und Vault sind noch nicht gebaut und werden im Chat nicht angeboten.",
    "settings.contextSelection": "Markierung im Kontext (Zeichen)",
    "settings.contextSelection.desc": "Wie viel eines markierten Textes im Arbeitskontext zitiert wird. Längere Markierungen werden gekürzt und sagen das; get_workspace liefert den vollen Text.",
    "settings.contextTabs": "Offene Tabs im Kontext",
    "settings.contextTabs.desc": "Wie viele offene Tabs mit Pfad genannt werden. Der Rest wird gezählt, get_workspace nennt alle.",
    "settings.contextFrontmatter": "Kopfdaten im Kontext (Zeichen)",
    "settings.contextFrontmatter.desc": "Wie viel der Kopfdaten (Frontmatter) der aktiven Notiz in den Arbeitskontext geht. 0 lässt sie weg.",
```

- [ ] **Step 4: Run** `npx vitest run tests/settings_types.test.ts tests/strings_modell.test.ts && npm run typecheck` — Expected: PASS, Typecheck grün.

- [ ] **Step 5: Commit**

```bash
git add src/core/settings-types.ts src/obsidian/settings.ts src/i18n/strings.ts tests/settings_types.test.ts && git commit -q -m "feat(context): Einstellungen Modus-Default und Kappungen, Gruppe Arbeitskontext" -m $'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01H5NqLP6BG5B8BNn5avHEkS'
```

---

### Task 8: `get_workspace` und `edit_active_note` im Werkzeug-Adapter

**Files:**
- Modify: `src/obsidian/vault-tools.ts`
- Test: `tests/vault_tools_workspace.test.ts` (neu)

**Interfaces:**
- Consumes: `WorkspacePort`, `EditorPort` (Task 3), `renderWorkspaceReport` (Task 4), `writePolicy`, `resolveNotePath`
- Produces: `VaultTools`-Optionen `workspace?: WorkspacePort`, `editor?: EditorPort`, `lang?: () => "de" | "en"`; Ergebnisse der beiden Werkzeuge.

- [ ] **Step 1: Failing test**

```ts
// tests/vault_tools_workspace.test.ts
import { VaultTools, type VaultPort, type WriteRequest } from "../src/obsidian/vault-tools";
import type { EditorPort, WorkspacePort } from "../src/core/context/ports";

function fakeVault(files: Record<string, string>): VaultPort {
  return {
    listMarkdownPaths: () => Object.keys(files),
    read: async (p) => files[p],
    exists: async (p) => p in files,
    create: async (p, c) => void (files[p] = c),
    append: async (p, c) => void (files[p] = (files[p] ?? "") + c),
    overwrite: async (p, c) => void (files[p] = c),
    frontmatterOf: () => null,
  };
}

function fakeEditor(state: { path: string | null; selection: string; doc: string }): EditorPort {
  return {
    path: () => state.path,
    selection: () => state.selection,
    replaceSelection: (text) => { state.doc = state.doc.replace(state.selection, text); state.selection = text; },
    insertAtCursor: (text) => { state.doc += text; },
  };
}

const workspace: WorkspacePort = {
  snapshot: () => ({
    active: { path: "Notes/Plan.md", frontmatter: { status: "active" }, selection: "Model control", cursorLine: 9, lineCount: 11 },
    tabs: [{ path: "Notes/Plan.md", viewType: "markdown" }],
  }),
  linesAround: (radius) => ({ from: Math.max(1, 9 - radius), lines: ["a", "b", "c"] }),
};

const base = { kodaFolder: () => "Koda", today: () => "2026-09-02", listMaxRows: () => 150, lang: () => "de" as const };
const yes = async (): Promise<boolean> => true;

describe("get_workspace", () => {
  it("liefert den Bericht aus derselben Quelle wie der Block, mit Cursor-Umgebung", async () => {
    const tools = new VaultTools(fakeVault({}), yes, { ...base, workspace });
    const r = await tools.run("get_workspace", { around_cursor: 2 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content).toContain("Aktive Notiz: Notes/Plan.md · Zeile 9 von 11");
      expect(r.content).toContain("Markierung (13 Zeichen):\nModel control");
      expect(r.content).toContain("Cursor-Umgebung (Zeilen 7–9):");
    }
  });
  it("ohne Port meldet es Klartext statt zu werfen", async () => {
    const tools = new VaultTools(fakeVault({}), yes, base);
    expect(await tools.run("get_workspace", {})).toEqual({ ok: false, error: "Arbeitsplatz nicht verfügbar: kein Zugriff auf den Workspace." });
  });
});

describe("edit_active_note", () => {
  it("replace_selection: fragt ausserhalb des Koda-Ordners, zeigt Markierung gegen Ersatz, schreibt exakt das Bestaetigte", async () => {
    const state = { path: "Notes/Plan.md", selection: "Model control", doc: "Model control makes" };
    const calls: WriteRequest[] = [];
    const tools = new VaultTools(fakeVault({}), async (req) => { calls.push(req); return true; }, { ...base, editor: fakeEditor(state) });
    const r = await tools.run("edit_active_note", { path: "Notes/Plan.md", mode: "replace_selection", text: "Model steering" });
    expect(r.ok).toBe(true);
    expect(calls).toEqual([{ path: "Notes/Plan.md", mode: "replace", oldText: "Model control", newText: "Model steering" }]);
    expect(state.doc).toBe("Model steering makes");
  });
  it("Invariante: aendert sich die Markierung zwischen Aufruf und Bestaetigung, wird NICHT geschrieben", async () => {
    const state = { path: "Notes/Plan.md", selection: "Model control", doc: "Model control makes" };
    const confirm = async (): Promise<boolean> => { state.selection = "Model"; return true; };
    const tools = new VaultTools(fakeVault({}), confirm, { ...base, editor: fakeEditor(state) });
    const r = await tools.run("edit_active_note", { path: "Notes/Plan.md", mode: "replace_selection", text: "X" });
    expect(r).toEqual({ ok: false, error: "Die Markierung hat sich seit dem Aufruf geändert — nichts geschrieben. Erneut aufrufen." });
    expect(state.doc).toBe("Model control makes");
  });
  it("falscher Pfad: eine andere Notiz ist aktiv", async () => {
    const state = { path: "Notes/Other.md", selection: "x", doc: "x" };
    const tools = new VaultTools(fakeVault({}), yes, { ...base, editor: fakeEditor(state) });
    const r = await tools.run("edit_active_note", { path: "Notes/Plan.md", mode: "insert_at_cursor", text: "!" });
    expect(r).toEqual({ ok: false, error: "Aktiv ist inzwischen Notes/Other.md, nicht Notes/Plan.md — nichts geschrieben." });
  });
  it("replace_selection ohne Markierung ist ein Fehler; insert_at_cursor im Koda-Ordner schreibt ohne Rueckfrage", async () => {
    const state = { path: "Koda/Entwurf.md", selection: "", doc: "Hallo" };
    let asked = 0;
    const tools = new VaultTools(fakeVault({}), async () => { asked++; return true; }, { ...base, editor: fakeEditor(state) });
    expect(await tools.run("edit_active_note", { path: "Koda/Entwurf.md", mode: "replace_selection", text: "x" })).toEqual({ ok: false, error: "Keine Markierung im Editor — für replace_selection muss Text markiert sein." });
    const r = await tools.run("edit_active_note", { path: "Koda/Entwurf.md", mode: "insert_at_cursor", text: " Welt" });
    expect(r.ok).toBe(true);
    expect(asked).toBe(0);
    expect(state.doc).toBe("Hallo Welt");
  });
  it("Ablehnung im Modal ist ein Fehler-Result, nichts geschrieben", async () => {
    const state = { path: "Notes/Plan.md", selection: "a", doc: "a" };
    const tools = new VaultTools(fakeVault({}), async () => false, { ...base, editor: fakeEditor(state) });
    expect(await tools.run("edit_active_note", { path: "Notes/Plan.md", mode: "replace_selection", text: "b" })).toEqual({ ok: false, error: "vom Nutzer abgelehnt" });
    expect(state.doc).toBe("a");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/vault_tools_workspace.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementierung** in `src/obsidian/vault-tools.ts`:

Importe ergänzen:

```ts
import type { EditorPort, WorkspacePort } from "../core/context/ports";
import { renderWorkspaceReport } from "../core/context/workspace-line";
```

`opts` um drei Felder erweitern (im Konstruktor-Typ, nach `allowed?`):

```ts
      /** Arbeitsplatz fuer `get_workspace` — fehlt in Tests, die nur den Vault-Kern messen. */
      workspace?: WorkspacePort;
      /** Editor fuer `edit_active_note`; jede Methode liest frisch (Invariante, Spec E5). */
      editor?: EditorPort;
      /** Sprache der Werkzeug-Texte; fehlt → deutsch wie die Stubs. */
      lang?: () => "de" | "en";
```

Zwei `case`-Zweige im `switch` (nach `list_notes`):

```ts
        case "get_workspace": return this.getWorkspace(num(a.around_cursor, 20));
        case "edit_active_note": return await this.editActiveNote(str(a.path), str(a.mode), str(a.text));
```

Methoden (nach `listNotes`):

```ts
  private getWorkspace(radius: number): ToolOutcome {
    const ws = this.opts.workspace;
    if (ws === undefined) return { ok: false, error: "Arbeitsplatz nicht verfügbar: kein Zugriff auf den Workspace." };
    const snap = ws.snapshot();
    return { ok: true, content: renderWorkspaceReport(snap, ws.linesAround(Math.max(0, radius)), this.opts.lang?.() ?? "de") };
  }

  /** Invariante „Vorschau == geschriebener Inhalt": Pfad und Markierung werden VOR dem Modal
   *  gelesen und NACH der Bestaetigung erneut geprueft. Zwischen beiden liegt Nutzerzeit. */
  private async editActiveNote(path: string, mode: string, text: string): Promise<ToolOutcome> {
    const ed = this.opts.editor;
    if (ed === undefined) return { ok: false, error: "Kein Editor verfügbar." };
    if (mode !== "replace_selection" && mode !== "insert_at_cursor") {
      return { ok: false, error: `unbekannter Modus: ${mode} — erlaubt sind replace_selection und insert_at_cursor` };
    }
    const target = resolveNotePath(path);
    const active = ed.path();
    if (active === null) return { ok: false, error: "Keine aktive Notiz mit Editor im Hauptbereich — nichts geschrieben." };
    if (active !== target) return { ok: false, error: `Aktiv ist inzwischen ${active}, nicht ${target} — nichts geschrieben.` };
    const old = mode === "replace_selection" ? ed.selection() : "";
    if (mode === "replace_selection" && old === "") {
      return { ok: false, error: "Keine Markierung im Editor — für replace_selection muss Text markiert sein." };
    }
    if (writePolicy(target, this.opts.kodaFolder()) === "confirm") {
      const ok = await this.confirm({ path: target, mode: mode === "replace_selection" ? "replace" : "append", oldText: old, newText: text });
      if (!ok) return { ok: false, error: "vom Nutzer abgelehnt" };
      if (ed.path() !== target) return { ok: false, error: `Aktiv ist inzwischen ${ed.path() ?? "keine Notiz"}, nicht ${target} — nichts geschrieben.` };
      if (mode === "replace_selection" && ed.selection() !== old) {
        return { ok: false, error: "Die Markierung hat sich seit dem Aufruf geändert — nichts geschrieben. Erneut aufrufen." };
      }
    }
    if (mode === "replace_selection") {
      ed.replaceSelection(text);
      return { ok: true, content: `Markierung ersetzt (${old.length} → ${text.length} Zeichen) in ${target}` };
    }
    ed.insertAtCursor(text);
    return { ok: true, content: `${text.length} Zeichen am Cursor eingefügt in ${target}` };
  }
```

- [ ] **Step 4: Run** `npx vitest run tests/vault_tools_workspace.test.ts tests/vault_tools.test.ts tests/vault_tools_list.test.ts tests/vault_tools_retrieval.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/vault-tools.ts tests/vault_tools_workspace.test.ts && git commit -q -m "feat(context): get_workspace liest den Arbeitsplatz, edit_active_note schreibt nach Bestaetigung mit Invariante" -m $'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01H5NqLP6BG5B8BNn5avHEkS'
```

---

### Task 9: Der Obsidian-Adapter für den Workspace

**Files:**
- Create: `src/obsidian/workspace.ts`

Kein Unit-Test: die Datei ist eine dünne Naht zur Obsidian-API; belegt wird sie durch Prüfpunkt 20 und 23 (Task 13). Typecheck ist das Gate.

**Interfaces:**
- Produces: `readWorkspace(app, ownViewType): WorkspaceSnapshot`, `linesAround(app, radius)`, `editorPort(app): EditorPort`.

- [ ] **Step 1: Implementierung**

```ts
// src/obsidian/workspace.ts
import { FileView, MarkdownView, type App, type WorkspaceLeaf } from "obsidian";
import type { EditorPort, WorkspaceSnapshot } from "../core/context/ports";

/** Der Leaf, in dem der Nutzer arbeitet. NICHT `activeEditor` und NICHT `getActiveViewOfType`:
 *  aus der Seitenleiste heraus ist die aktive Ansicht Koda selbst, und `activeEditor` ist dann
 *  laut API null. `getMostRecentLeaf()` OHNE Argument durchsucht `rootSplit` und Pop-out-Fenster
 *  und ignoriert Seitenleisten (REGISTRY-Gotcha, yijing-oracle `reading-writer.ts`). */
function mainLeaf(app: App): WorkspaceLeaf | null {
  return app.workspace.getMostRecentLeaf();
}

function markdownView(app: App): MarkdownView | null {
  const leaf = mainLeaf(app);
  return leaf !== null && leaf.view instanceof MarkdownView ? leaf.view : null;
}

export function readWorkspace(app: App, ownViewType: string): WorkspaceSnapshot {
  const leaf = mainLeaf(app);
  const view = leaf?.view;
  let active: WorkspaceSnapshot["active"] = null;
  if (view instanceof FileView && view.file !== null) {
    const md = view instanceof MarkdownView ? view : null;
    const editor = md?.editor;
    active = {
      path: view.file.path,
      frontmatter: app.metadataCache.getFileCache(view.file)?.frontmatter ?? null,
      selection: editor?.getSelection() ?? "",
      cursorLine: editor ? editor.getCursor("head").line + 1 : null,
      lineCount: editor ? editor.lineCount() : null,
    };
  }
  const tabs: WorkspaceSnapshot["tabs"] = [];
  app.workspace.iterateAllLeaves((l) => {
    const v = l.view;
    if (v.getViewType() === ownViewType) return;
    if (v instanceof FileView && v.file !== null) tabs.push({ path: v.file.path, viewType: v.getViewType() });
  });
  return { active, tabs };
}

export function linesAround(app: App, radius: number): { from: number; lines: string[] } | null {
  const editor = markdownView(app)?.editor;
  if (editor === undefined) return null;
  const line = editor.getCursor("head").line;
  const from = Math.max(0, line - radius);
  const to = Math.min(editor.lineCount() - 1, line + radius);
  const lines: string[] = [];
  for (let i = from; i <= to; i++) lines.push(editor.getLine(i));
  return { from: from + 1, lines };
}

/** Jede Methode liest den Editor FRISCH — `edit_active_note` prueft damit nach der
 *  Bestaetigung, ob Notiz und Markierung noch dieselben sind (Spec E5). */
export function editorPort(app: App): EditorPort {
  return {
    path: () => markdownView(app)?.file?.path ?? null,
    selection: () => markdownView(app)?.editor.getSelection() ?? "",
    replaceSelection: (text) => markdownView(app)?.editor.replaceSelection(text),
    insertAtCursor: (text) => {
      const editor = markdownView(app)?.editor;
      if (editor !== undefined) editor.replaceRange(text, editor.getCursor("to"));
    },
  };
}
```

- [ ] **Step 2: Run** `npm run typecheck && npm run check:pure` — Expected: grün (die Datei liegt unter `src/obsidian/`, nicht `src/core/`).

- [ ] **Step 3: Commit**

```bash
git add src/obsidian/workspace.ts && git commit -q -m "feat(context): Obsidian-Adapter fuer Arbeitsplatz und Editor (getMostRecentLeaf, nicht activeEditor)" -m $'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01H5NqLP6BG5B8BNn5avHEkS'
```

---

### Task 10: Verdrahtung im Plugin — Modus, Kontext je Nachricht, Werkzeuge, Befehle

**Files:**
- Modify: `src/main.ts`
- Modify: `src/i18n/strings.ts` (Befehle, Menü)

**Interfaces:**
- Consumes: alles aus Task 1–9
- Produces (public, vom Smoke gemessen): `contextMode: ContextMode`, `setContextMode(m)`, `currentContext(): ContextAttachment | null`, `buildTools(): VaultTools`, `askWithSelection()`; Befehle `context-mode-off`, `context-mode-workspace`, `ask-with-selection`.

- [ ] **Step 1: i18n** — **en** nach `"cmd.toggleThinking"`:

```ts
    "cmd.contextMode": "Context mode: {0}",
    "cmd.askWithSelection": "Ask Koda about the selection",
    "menu.askKoda": "Ask Koda",
```

**de** nach `"cmd.toggleThinking"`:

```ts
    "cmd.contextMode": "Kontext-Modus: {0}",
    "cmd.askWithSelection": "Koda zur Markierung fragen",
    "menu.askKoda": "Koda fragen",
```

- [ ] **Step 2: Importe in `src/main.ts`**

```ts
import { Plugin, WorkspaceLeaf, normalizePath, type Editor, type Menu } from "obsidian";
// …
import { projectForModel } from "./core/agent/compaction/project";
import { AVAILABLE_MODES, type ContextAttachment, type ContextMode } from "./core/context/types";
import { modeLabel } from "./core/context/labels";
import { renderWorkspaceContext } from "./core/context/workspace-line";
import { editorPort, linesAround, readWorkspace } from "./obsidian/workspace";
```

- [ ] **Step 3: Zustand und Methoden** — nach `lastSystemPrompt`:

```ts
  /** Der Modus fuer die NAECHSTE Nachricht. Beim Laden der Default aus den Einstellungen;
   *  danach ueberstimmt der Chat (Dropdown, Befehle), bis das Plugin neu laedt (Spec E1).
   *  „Neues Gespraech" aendert ihn nicht. */
  contextMode: ContextMode = "workspace";

  setContextMode(mode: ContextMode): void {
    if (!AVAILABLE_MODES.includes(mode)) return;
    this.contextMode = mode;
    for (const v of this.views()) v.syncContextMode();
  }

  /** Der Kontext, der mit der naechsten Nachricht geht — `ask()` ruft DIESE Methode, der
   *  GUI-Smoke misst sie: es gibt keinen zweiten Weg, auf dem der Block entsteht. */
  currentContext(): ContextAttachment | null {
    if (this.contextMode === "off") return null;
    const s = this.settings;
    return renderWorkspaceContext(readWorkspace(this.app, VIEW_TYPE_KODA), {
      lang: this.promptLang(),
      selectionMax: s.contextSelectionChars,
      tabsMax: s.contextTabsMax,
      frontmatterMax: s.contextFrontmatterChars,
    });
  }

  /** Sidebar oeffnen, Modus mindestens Arbeitsplatz, Eingabefeld fokussieren — der Weg aus
   *  dem Editor-Kontextmenue und der Befehlspalette. */
  async askWithSelection(): Promise<void> {
    if (this.contextMode === "off") this.setContextMode("workspace");
    await this.runInView((v) => { v.focusInput(); return Promise.resolve(); });
  }
```

- [ ] **Step 4: onload** — nach `this.settings = validateKodaSettings(...)`: `this.contextMode = this.settings.contextModeDefault;` — **aber** nur, wenn angeboten: `if (!AVAILABLE_MODES.includes(this.contextMode)) this.contextMode = "workspace";` (ein Default „note" aus einer späteren Etappe fällt bis dahin auf Arbeitsplatz).

Befehle und Kontextmenü nach `toggle-thinking`:

```ts
    for (const mode of AVAILABLE_MODES) {
      this.addCommand({
        id: `context-mode-${mode}`,
        name: t("cmd.contextMode", modeLabel(mode, this.promptLang())),
        callback: () => this.setContextMode(mode),
      });
    }
    this.addCommand({ id: "ask-with-selection", name: t("cmd.askWithSelection"), callback: () => void this.askWithSelection() });
    // Rechtsklick auf markierten Text: nur dann, sonst ist der Eintrag Rauschen.
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor) => {
        if (editor.getSelection() === "") return;
        menu.addItem((item) => item.setTitle(t("menu.askKoda")).setIcon("dog").onClick(() => void this.askWithSelection()));
      }),
    );
```

- [ ] **Step 5: `ask()` hängt den Kontext an** — die Zeile `const userMsg: ChatMessage = { role: "user", content: question };` ersetzen durch:

```ts
    const userMsg: ChatMessage = { role: "user", content: question };
    // Der Block ist ein FELD, nie Teil von content: Nutzertext bleibt unantastbar (Spec E2).
    const ctx = this.currentContext();
    if (ctx !== null) userMsg.context = ctx;
```

- [ ] **Step 6: `buildTools()` aus `ask()` herausziehen** — den Block von `const vaultPort: VaultPort = {` bis zum Ende von `new VaultTools(...)` in eine Methode verschieben und in `ask()` durch `const tools = this.buildTools();` ersetzen:

```ts
  /** Die Werkzeuge, wie `ask()` sie baut. Oeffentlich, weil der GUI-Smoke `edit_active_note`
   *  ueber DENSELBEN Weg ruft (Pruefpunkt 23) — ein zweiter Aufbau waere eine zweite Wahrheit. */
  buildTools(): VaultTools {
    const vaultPort: VaultPort = { /* unveraendert aus ask() */ };
    return new VaultTools(vaultPort, (req) => confirmWrite(this.app, req), {
      kodaFolder: () => this.settings.kodaFolder,
      today: () => new Date().toISOString().slice(0, 10),
      retrieval: () => readRetrievalApi(this.app),
      listMaxRows: () => this.settings.listNotesMaxRows,
      allowed: () => new Set(this.currentToolNames()),
      workspace: {
        snapshot: () => readWorkspace(this.app, VIEW_TYPE_KODA),
        linesAround: (r) => linesAround(this.app, r),
      },
      editor: editorPort(this.app),
      lang: () => this.promptLang(),
    });
  }
```

Die bestehenden Kommentare an `retrieval`/`allowed` mitnehmen.

- [ ] **Step 7: Belegung auf die Projektion** — in `contextUsage()`:

```ts
    const used = estimateTokens(
      // Die PROJEKTION, nicht der rohe Verlauf: gestubbte Tool-Ergebnisse zaehlen so mit ihrer
      // Stub-Laenge, und der Kontextblock zaehlt ueberhaupt (er steht nur dort in content).
      projectForModel(this.chatLog),
      JSON.stringify(toWireTools(this.currentToolDefs())).length,
    );
```

Der bisherige `filter`-Ausdruck entfällt; `isCompactionRecord` bleibt für andere Stellen importiert oder wird entfernt, wenn ungenutzt (Lint).

- [ ] **Step 8: Run** `npm run typecheck && npm run lint` — Expected: grün. (`view.syncContextMode`/`focusInput` existieren erst nach Task 11 — **Task 10 und 11 werden zusammen typgeprüft**; bis dahin Typecheck-Fehler in `main.ts` erwartet. Wer Task 10 allein prüfen will, legt in `view.ts` zwei leere Methoden an.)

- [ ] **Step 9: Commit** (zusammen mit Task 11, siehe dort).

---

### Task 11: Die Sidebar — Modus-Dropdown und Kontextzeile

**Files:**
- Modify: `src/obsidian/view.ts`
- Modify: `src/i18n/strings.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `plugin.contextMode`, `setContextMode`, `AVAILABLE_MODES`, `modeLabel`, `contextSummary`
- Produces: `KodaView.syncContextMode()`, `KodaView.focusInput()`; DOM: `select.koda-mode` in `.koda-buttons`, `details.koda-context` unter jeder Nutzer-Blase mit `context`.

- [ ] **Step 1: i18n** — **en** nach `"view.thoughtOnly"`:

```ts
    "context.line": "Context: {0}",
    "context.dropdownAria": "Which context goes along with the next question",
    "view.compaction.contexts": ", {0} context blocks",
```

**de** an derselben Stelle:

```ts
    "context.line": "Kontext: {0}",
    "context.dropdownAria": "Welcher Kontext mit der nächsten Frage mitgeht",
    "view.compaction.contexts": ", {0} Kontextblöcke",
```

- [ ] **Step 2: Dropdown in `onOpen`** — in `view.ts` Importe: `import { AVAILABLE_MODES, isContextMode } from "../core/context/types"; import { contextSummary, modeLabel } from "../core/context/labels"; import { getLang } from "../vendor/kit/i18n";` und ein Feld `private modeEl: HTMLSelectElement | null = null;`. In `onOpen` **vor** den Knöpfen in `buttons`:

```ts
    // Modus-Dropdown links vom Senden: fuenf Zustaende sind kein Schalter. Ein Zustand, zwei
    // Bedienstellen (Befehle setzen denselben Wert) — syncContextMode zieht nach.
    this.modeEl = buttons.createEl("select", { cls: "dropdown koda-mode", attr: { "aria-label": t("context.dropdownAria") } });
    for (const m of AVAILABLE_MODES) this.modeEl.createEl("option", { value: m, text: modeLabel(m, this.lang()) });
    this.modeEl.addEventListener("change", () => {
      const v = this.modeEl?.value;
      if (isContextMode(v)) this.plugin.setContextMode(v);
    });
    this.syncContextMode();
```

Methoden:

```ts
  private lang(): "de" | "en" { return getLang() === "de" ? "de" : "en"; }

  syncContextMode(): void {
    if (this.modeEl !== null) this.modeEl.value = this.plugin.contextMode;
  }

  focusInput(): void {
    this.inputEl.focus();
  }
```

- [ ] **Step 3: Kontextzeile in `renderLog`** — den `user`-Zweig ersetzen:

```ts
      if (m.role === "user") {
        this.logEl.createDiv({ cls: "koda-msg koda-user", text: m.content });
        // Unter der Blase, aufklappbar: was Koda zu dieser Frage vor sich hatte. Persistiert,
        // also auch nach einem Neustart nachlesbar (Spec E2, E6).
        if (m.context !== undefined) {
          const d = this.logEl.createEl("details", { cls: "koda-context" });
          d.createEl("summary", { text: t("context.line", contextSummary(m.context, this.lang())) });
          d.createEl("pre", { text: m.context.text });
        }
      }
```

Und in `renderCompaction` (Stufe 1) den Zusatz für Kontextblöcke:

```ts
      const ctxs = rec.stats.contexts ?? 0;
      host.createDiv({ cls: "koda-msg koda-notice koda-compaction", text: t("view.compaction.stage1", rec.stats.stubbed ?? 0, kb) + (ctxs > 0 ? t("view.compaction.contexts", ctxs) : "") + forced });
```

- [ ] **Step 4: CSS** — an `styles.css` nach `.koda-buttons`:

```css
/* Modus-Dropdown: Obsidians `dropdown`-Optik, nimmt nur so viel Platz wie sein Label. */
.koda-mode { flex: 0 1 auto; max-width: 45%; }
/* Kontextzeile unter der Nutzer-Blase: leise wie die Marken, aufklappbar mit dem Block. */
.koda-context { font-size: var(--font-ui-smaller); color: var(--text-muted); margin: calc(-1 * var(--size-4-1)) 0 var(--size-4-2) 0; }
.koda-context summary { cursor: pointer; }
.koda-context pre { white-space: pre-wrap; margin: var(--size-4-1) 0 0 0; }
```

- [ ] **Step 5: Run** `npm run gate` — Expected: alles grün (Lint, Typecheck inkl. `scripts/`, Tests, check:pure, Build).

- [ ] **Step 6: Commit** (Task 10 + 11)

```bash
git add src/main.ts src/obsidian/view.ts src/i18n/strings.ts styles.css && git commit -q -m "feat(context): Modus je Nachricht (Dropdown, Befehle, Kontextmenue), Kontextzeile im Verlauf, Belegung misst die Projektion" -m $'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01H5NqLP6BG5B8BNn5avHEkS'
```

---

### Task 12: Der Praxistest-Treiber weist den Kontext aus

**Files:**
- Modify: `scripts/gui-ask.ts`

- [ ] **Step 1: Typen** — im lokalen `ChatMessage`-Typ (Zeile ~95) ergänzen: `context?: { mode: string; items: { source: string; path: string }[]; text: string };` und `Step.kind` um `"context"` erweitern.

- [ ] **Step 2: `toSteps`** — vor dem `assistant`-Zweig:

```ts
    if (m.role === "user" && m.context !== undefined) {
      const active = m.context.items.find((i) => i.source === "active")?.path ?? "(keine aktive Notiz)";
      steps.push({
        kind: "context",
        label: `${m.context.mode} · ${active} · ${m.context.items.length} Einträge · ${m.context.text.length} Zeichen`,
        body: m.context.text,
      });
    }
```

- [ ] **Step 3: Ausgabe** — in der Schleife über `steps` (nach dem `compaction`-Zweig):

```ts
        else if (s.kind === "context") {
          console.log(`  ⊕ Arbeitskontext (${s.label})`);
          console.log(full ? s.body.split("\n").map((l) => `      ${l}`).join("\n") : `      ${clip(s.body, 400)}`);
        }
```

- [ ] **Step 4: Kopfkommentar** der Datei um einen Absatz ergänzen: „Seit Etappe 1 des Arbeitskontexts weist der Bericht je Nutzer-Nachricht den mitgesendeten Block aus (`⊕`); ohne `--full` gekürzt. Ohne diese Zeile wäre der Praxistest blind für den Kontext — ein `read_note` auf den richtigen Pfad ließe sich nicht von einem geratenen unterscheiden."

- [ ] **Step 5: Run** `npm run typecheck:scripts` — Expected: grün.

- [ ] **Step 6: Commit**

```bash
git add scripts/gui-ask.ts && git commit -q -m "test(gui-ask): Bericht weist den Arbeitskontext je Nachricht aus" -m $'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01H5NqLP6BG5B8BNn5avHEkS'
```

---

### Task 13: GUI-Smoke — Prüfpunkte 20 bis 23

**Files:**
- Modify: `scripts/gui-smoke.ts` (nach Prüfpunkt 19, vor dem `finally`)
- Modify: `docs/images/fixture/README.md` (Anforderung an die Kulisse)

Alle vier Punkte messen über `plugin.currentContext()`, `plugin.setContextMode()`, `plugin.currentToolNames()` und `plugin.buildTools()` — die Methoden, die `ask()` selbst ruft.

- [ ] **Step 1: Prüfpunkt 20 — Markierung überlebt den Fokuswechsel in die Sidebar**

```ts
    // --- 20. Arbeitsplatz-Block: aktive Notiz und Markierung aus der Sidebar heraus --------
    // Die offene Frage der Spec (E3): bleibt `editor.getSelection()` erhalten, wenn der Fokus ins
    // Eingabefeld wechselt? Gemessen, nicht angenommen. Drei Bedingungen: der aktive Leaf ist
    // Koda (sonst misst der Punkt nicht die Sidebar-Situation), der Block nennt die Notiz mit
    // Kopfdaten, und die Markierung steht drin.
    const vorherMode = await cdp.evaluate<string>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].contextMode;`);
    const punkt20 = await cdp.evaluate<{ aktivIstKoda: boolean; text: string; items: { source: string; path: string; chars: number }[] } | null>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.setContextMode("workspace");
      const file = app.vault.getFileByPath("Notes/Project plan.md");
      if (!file) return null;
      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(file);
      await new Promise((r) => setTimeout(r, 500));
      // Zeile 9 (0-basiert 8) beginnt mit "Model control" — 13 Zeichen.
      leaf.view.editor.setSelection({ line: 8, ch: 0 }, { line: 8, ch: 13 });
      document.querySelector(".koda-input")?.focus();
      await new Promise((r) => setTimeout(r, 300));
      const ctx = p.currentContext();
      return {
        aktivIstKoda: app.workspace.activeLeaf?.view?.getViewType() === ${JSON.stringify(VIEW_TYPE)},
        text: ctx?.text ?? "",
        items: ctx?.items ?? [],
      };
    `);
    const sel20 = punkt20?.items.find((i) => i.source === "selection");
    record(
      "20. Arbeitsplatz-Block nennt aktive Notiz, Kopfdaten und Markierung — aus der Sidebar heraus",
      punkt20 !== null && punkt20.aktivIstKoda && punkt20.text.includes("Notes/Project plan.md") && punkt20.text.includes("status: active") && punkt20.text.includes("Model control") && sel20?.chars === 13,
      punkt20 === null
        ? "Fixture-Notiz Notes/Project plan.md fehlt"
        : `aktiv ist Koda: ${String(punkt20.aktivIstKoda)} · Markierung: ${sel20 ? `${sel20.chars} Zeichen` : "fehlt"} · ${punkt20.text.split("\n")[1] ?? ""}`,
    );
```

- [ ] **Step 2: Prüfpunkt 21 — Modus Aus/Arbeitsplatz, Befehl und Dropdown schalten denselben Zustand**

```ts
    // --- 21. Modus Aus sendet nichts; Befehl und Dropdown sind EIN Zustand ---------------
    const punkt21 = await cdp.evaluate<{ ausNull: boolean; dropdownNachBefehl: string; modeNachDropdown: string; anObjekt: boolean }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:context-mode-off`)});
      await new Promise((r) => setTimeout(r, 200));
      const ausNull = p.currentContext() === null;
      const sel = document.querySelector(".koda-mode");
      const dropdownNachBefehl = sel ? sel.value : "(kein Dropdown)";
      if (sel) { sel.value = "workspace"; sel.dispatchEvent(new Event("change")); }
      await new Promise((r) => setTimeout(r, 200));
      return { ausNull, dropdownNachBefehl, modeNachDropdown: p.contextMode, anObjekt: p.currentContext() !== null };
    `);
    record(
      "21. Modus Aus sendet keinen Kontext; Befehl und Dropdown schalten denselben Zustand",
      punkt21.ausNull && punkt21.dropdownNachBefehl === "off" && punkt21.modeNachDropdown === "workspace" && punkt21.anObjekt,
      `aus → null: ${String(punkt21.ausNull)} · Dropdown nach Befehl: ${punkt21.dropdownNachBefehl} · Modus nach Dropdown: ${punkt21.modeNachDropdown}`,
    );
```

- [ ] **Step 3: Prüfpunkt 22 — die zwei Werkzeuge in der gesendeten Liste, abschaltbar** (Muster 17)

```ts
    // --- 22. get_workspace und edit_active_note werden gesendet und sind abschaltbar --------
    const vorher22 = await cdp.evaluate<string[]>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.toolsDisabled;`);
    try {
      const an = await cdp.evaluate<string[]>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].currentToolNames();`);
      const aus = await cdp.evaluate<string[]>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.toolsDisabled = ["get_workspace", "edit_active_note"];
        await p.saveSettings();
        return p.currentToolNames();
      `);
      record(
        "22. get_workspace und edit_active_note stehen in der gesendeten Liste und sind abschaltbar",
        an.includes("get_workspace") && an.includes("edit_active_note") && !aus.includes("get_workspace") && !aus.includes("edit_active_note"),
        `an: ${an.join(", ")} · aus: ${aus.join(", ")}`,
      );
    } finally {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.toolsDisabled = ${JSON.stringify(vorher22 ?? [])};
        return p.saveSettings();
      `).catch(() => undefined);
    }
```

- [ ] **Step 4: Prüfpunkt 23 — die Invariante von `edit_active_note`**

```ts
    // --- 23. edit_active_note: veraltete Markierung schreibt nicht; gueltige schreibt -------
    // Der Aufruf laeuft im Renderer als Promise (das Modal blockiert ihn), das Ergebnis landet in
    // window.__koda23. Erst die Gegenprobe (ohne Aenderung) belegt, dass der Punkt seinen
    // Gegenstand beruehrt — sonst waere „nichts geschrieben" auch bei kaputtem Werkzeug gruen.
    const original23 = await cdp.evaluate<string | null>(`
      const f = app.vault.getFileByPath("Notes/Project plan.md");
      return f ? await app.vault.read(f) : null;
    `);
    let detail23 = "nicht gelaufen";
    let ok23 = false;
    try {
      const starte = async (ersatz: string): Promise<void> => {
        await cdp.evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          const file = app.vault.getFileByPath("Notes/Project plan.md");
          const leaf = app.workspace.getLeaf(false);
          await leaf.openFile(file);
          await new Promise((r) => setTimeout(r, 400));
          leaf.view.editor.setSelection({ line: 8, ch: 0 }, { line: 8, ch: 13 });
          window.__koda23 = null;
          p.buildTools().run("edit_active_note", { path: "Notes/Project plan.md", mode: "replace_selection", text: ${JSON.stringify(ersatz)} }).then((r) => { window.__koda23 = r; });
          return true;
        `);
        const modal = await pollUntil<boolean>(cdp, `return !!document.querySelector(".modal-container .koda-preview");`, 8000);
        if (!modal) throw new Error("Bestaetigungs-Modal erschien nicht");
      };
      const bestaetige = async (): Promise<unknown> => {
        await clickReal(cdp, `document.querySelector(".modal-container .modal-button-container button:last-child") ?? null`);
        return pollUntil<unknown>(cdp, `return window.__koda23;`, 8000);
      };
      // A: Markierung nach dem Aufruf verkleinern, dann bestaetigen → Fehler, Datei unveraendert.
      await starte("Model steering");
      await cdp.evaluate(`app.workspace.getMostRecentLeaf().view.editor.setSelection({ line: 8, ch: 0 }, { line: 8, ch: 5 }); return true;`);
      const a = (await bestaetige()) as { ok: boolean; error?: string } | null;
      const inhaltA = await cdp.evaluate<string>(`return app.workspace.getMostRecentLeaf().view.editor.getValue();`);
      // B: Gegenprobe ohne Aenderung → geschrieben.
      await starte("Model steering");
      const b = (await bestaetige()) as { ok: boolean } | null;
      const inhaltB = await cdp.evaluate<string>(`return app.workspace.getMostRecentLeaf().view.editor.getValue();`);
      ok23 = a?.ok === false && /geändert|changed/.test(a?.error ?? "") && inhaltA.includes("Model control makes") && b?.ok === true && inhaltB.includes("Model steering makes");
      detail23 = `veraltet: ${a?.ok === false ? "verweigert" : "GESCHRIEBEN"} (${a?.error ?? ""}) · gueltig: ${b?.ok === true ? "geschrieben" : "verweigert"}`;
    } catch (error) {
      detail23 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      // Fixture-Notiz zuruecksetzen — der Staging-Vault ist Wegwerfware, aber der naechste
      // Punkt im selben Lauf soll die Kulisse vorfinden, die die README verspricht.
      if (original23 !== null) {
        await cdp.evaluate(`
          const f = app.vault.getFileByPath("Notes/Project plan.md");
          if (f) await app.vault.modify(f, ${JSON.stringify(original23)});
          return true;
        `).catch(() => undefined);
      }
      await cdp.evaluate(`
        app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].setContextMode(${JSON.stringify(vorherMode)});
        document.querySelector(".modal-container .modal-close-button")?.click();
        return true;
      `).catch(() => undefined);
    }
    record("23. edit_active_note: veraltete Markierung schreibt nicht, gueltige schreibt (Invariante Vorschau == Inhalt)", ok23, detail23);
```

- [ ] **Step 5: Fixture-README** — in „What the checks need from the scenery" ergänzen:

```markdown
- **`Notes/Project plan.md` with `status: active` in its frontmatter and the text
  `Model control makes` at the start of line 9** — checks 20 and 23 open this note, select
  the first 13 characters of that line and read the working context; check 23 replaces the
  selection through `edit_active_note` and restores the file afterwards.
```

- [ ] **Step 6: Kopfkommentar von `gui-smoke.ts`** — in der Prüfpunkt-Aufzählung 20–23 nennen (eine Zeile je Punkt, wie die bestehenden).

- [ ] **Step 7: Run** `npm run typecheck:scripts` — Expected: grün.

- [ ] **Step 8: Commit**

```bash
git add scripts/gui-smoke.ts docs/images/fixture/README.md && git commit -q -m "test(smoke): Pruefpunkte 20-23 — Arbeitsplatz-Block aus der Sidebar, Modus-Zustand, Werkzeugliste, edit-Invariante" -m $'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01H5NqLP6BG5B8BNn5avHEkS'
```

---

### Task 14: Doku — SMOKE.md, README, CHANGELOG

**Files:**
- Modify: `docs/SMOKE.md` (Handpunkte 23, 24; Kopfzeile „19 Punkte" → 23)
- Modify: `README.md` (Features, Werkzeuge, Configuration)
- Modify: `CHANGELOG.md` (`[Unreleased]`)
- Modify: `CLAUDE.md` (Commands-Absatz `smoke:gui`: 23 Punkte; Struktur: `src/core/context/`)

- [ ] **Step 1: SMOKE.md** — nach Handpunkt 22:

```markdown
23. **Arbeitskontext, Praxistest (`gui:ask --full`):** eine Notiz mit Kopfdaten im Hauptbereich
    öffnen, Modus „Arbeitsplatz", Frage „Worum geht es in der Notiz, die ich gerade offen habe?"
    → der Bericht zeigt den `⊕ Arbeitskontext`-Block mit dem Pfad, und Koda ruft `read_note`
    **auf genau diesen Pfad**, nicht `search_notes`. Ein `read_note` auf einen anderen Pfad ist
    rot, auch wenn die Antwort inhaltlich stimmt.
24. **Markierung ersetzen:** einen Satz markieren, „Verbessere den markierten Satz" → ⚙
    `edit_active_note` mit Modal (Markierung gegen Ersatz), nach „Schreiben" steht der Ersatz im
    Editor. Modus „Aus" als Gegenprobe: Koda kennt die Markierung dann nicht und muss nachfragen.
```

- [ ] **Step 2: README** — im Features-Bullet „Six tools" → „Eight tools" mit `get_workspace`, `edit_active_note` in der Aufzählung; neues Bullet nach dem Semantic-retrieval-Bullet:

```markdown
- **Working context** — every question can carry what you are looking at: the active note
  with its properties, the selection, the cursor line and the open tabs, as pointers only. A
  dropdown next to Send switches between *Off* and *Workspace* per question (commands and a
  right-click entry on selected text exist too), and the block that went along is shown under
  each of your messages, collapsible, also after a restart. `get_workspace` returns the full
  selection, the lines around the cursor and every tab; `edit_active_note` replaces the
  selection or inserts at the cursor — after the usual approval dialog, and only if the
  selection is still the one it previewed. Cut-offs (selection length, tab count, properties)
  are settings and announce themselves in the block.
```

Im Configuration-Abschnitt eine Zeile für die Gruppe „Working context" mit den vier Feldern.

- [ ] **Step 3: CHANGELOG** — unter `## [Unreleased]`:

```markdown
### Added

- **Working context, stage 1.** A user message can carry a short block naming the active
  note (with its properties and cursor line), the selection and the open tabs — pointers,
  no contents. Mode *Off* / *Workspace* per question via a dropdown next to Send, five
  commands (`Context mode: …`, `Ask Koda about the selection`) and a right-click entry on
  selected text. The block is stored with the message and shown under it, collapsible.
- **Two tools:** `get_workspace` (full selection, cursor surroundings, every tab) and
  `edit_active_note` (replace the selection or insert at the cursor, after approval; refuses
  if the selection or the active note changed since the preview).
- **Settings group "Working context":** startup mode and the three cut-offs (selection,
  tabs, properties). Every value that shapes what Koda sees is a setting.

### Changed

- Compaction stage 1 shortens old context blocks the way it shortens old tool results, and
  the status line's context-window figure now measures what is actually sent (the
  projection), not the raw history.
- The GUI smoke has four new checks (20–23); `gui:ask` reports the context block per message.
```

- [ ] **Step 4: CLAUDE.md** — im `smoke:gui`-Absatz „19 Punkte" → „23 Punkte (20–23 seit 2026-09-02: Arbeitsplatz-Block aus der Sidebar, Modus-Zustand, Werkzeugliste, `edit_active_note`-Invariante)"; im Struktur-Überblick eine Zeile: „`src/core/context/` — Arbeitskontext (Spec 2026-09-02): Typen, Ports, Block-Rendern; Adapter `src/obsidian/workspace.ts`."

- [ ] **Step 5: Commit**

```bash
git add docs/SMOKE.md README.md CHANGELOG.md CLAUDE.md && git commit -q -m "docs: Arbeitskontext Etappe 1 — Handpunkte 23/24, README, Changelog" -m $'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01H5NqLP6BG5B8BNn5avHEkS'
```

---

### Task 15: Gate, Smoke gegen den Staging-Vault, Praxistest

**Files:**
- Modify: `docs/SMOKE.md` (Belegter Lauf)

- [ ] **Step 1: Gate**

```bash
npm run gate
```
Expected: alles grün; Testzahl > 493.

- [ ] **Step 2: Lock — eigener Aufruf**

```bash
python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label koda-agent --intent "GUI-Smoke Arbeitskontext Etappe 1, Pruefpunkte 20-23" --exclusive focus
```

- [ ] **Step 3: Staging-Vault frisch bauen und Smoke fahren**

```bash
npm run build && npm run smoke:gui -- --setup && npm run smoke:gui -- --vault koda-agent
```
Expected: `23/23 grün`. **Gegenprobe:** Prüfpunkt 20 einmal mit dem Stand **vor** Task 9 (Adapter über `activeEditor` statt `getMostRecentLeaf`) — das ist der Fall, gegen den der Punkt steht: er muss dann rot sein (Markierung fehlt). Nicht ausführen, wenn der Lauf ohnehin rot ist; dann zuerst diagnostizieren.

Ist Obsidian für den Staging-Vault noch nicht offen: `open "obsidian://open?path=<absoluter Pfad zu Notes/Project plan.md im Staging-Vault>"` (URL-kodiert) — **kein Neustart** (Dach-AGENTS § Staging-Vaults).

Fällt Prüfpunkt 20 rot, weil die Markierung beim Fokuswechsel verloren geht: Spec § Offene Punkte greift — die Markierung beim `focus` des Eingabefelds sichern (`view.ts`: `inputEl.addEventListener("focus", …)` schreibt `plugin.lastSelectionSnapshot`), `readWorkspace` nimmt sie als Fallback. Das ist dann ein eigener Task mit Test, kein Fix im Vorbeigehen.

- [ ] **Step 4: Praxistest** (nur mit laufendem Endpunkt; Handpunkte 23/24):

```bash
npm run gui:ask -- --vault koda-agent --ask "Worum geht es in der Notiz, die ich gerade offen habe?" --expect "read_note" --expect "Notes/Project plan.md" --full
```
Vorher im Staging-Vault `Notes/Project plan.md` im Hauptbereich öffnen und den Endpunkt in den Einstellungen setzen (der Fixture-Vault startet ohne `data.json`).

- [ ] **Step 5: Lock freigeben**

```bash
python3 ~/.claude/hooks/obsidian-cdp-lock.py release
```

- [ ] **Step 6: Belegten Lauf in `docs/SMOKE.md` eintragen** — Abschnitt „## Belegter Lauf: 2026-09-02, Arbeitskontext Etappe 1 (23/23)" mit: Treiber-Commit, Obsidian-Version, Vault, was Punkt 20 gemessen hat (Markierung erhalten: ja/nein), Punkt 23 (Fehlertext des veralteten Falls), Praxistest-Ergebnis mit den gewählten Werkzeugen.

- [ ] **Step 7: Commit und Push auf beide Remotes**

```bash
git add docs/SMOKE.md && git commit -q -m "docs(smoke): Arbeitskontext Etappe 1 belegt — 23/23 im Staging-Vault, Praxistest" -m $'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01H5NqLP6BG5B8BNn5avHEkS' && git push -q origin main && git push -q github main
```

Deploy in einen Arbeits-Vault erst auf Zuruf (Memory: „Deploy in den Vault fragen"). Release (0.11.0) ist eine eigene Entscheidung — der Store-Rescan ist ohnehin fremdblockiert (GitHub-Konto).

---

## Self-Review (durchgeführt beim Schreiben)

**Spec-Abdeckung, Etappe 1:** E1 Modi Aus/Arbeitsplatz (Task 1, 10, 11) · E2 Kontextfeld persistiert (Task 2) · E3 Ports, Block, Kappungen mit Meldung (Task 3, 4, 9) · E4 Projektion/Stufe 1/Belegung (Task 5, 10) · E5 Werkzeuge mit Invariante (Task 6, 8) · E6 Dropdown, Kontextzeile, Befehle, Kontextmenü (Task 10, 11) · E8 vier Einstellungen (Task 7) · E9 Mitnahmen 1, 2, 3, 7 (Task 8, 4, 10, 12) · Prüfen 20–23 + Praxistest + Baseline (Task 0, 13, 15). Nicht in Etappe 1, wie die Spec es vorsieht: Hub, Panel, Modi Notiz/Tabs/Vault, Budget, Quellen-Chips, Nicht-Markdown lesen, semantische Nachbarn, Bases.

**Typkonsistenz:** `WorkspacePort.linesAround(radius): { from; lines } | null` — in Task 3 definiert, Task 4 (`renderWorkspaceReport`), Task 8 (`ws.linesAround`), Task 9 (`linesAround(app, radius)`) und Task 10 (`(r) => linesAround(this.app, r)`) nutzen dieselbe Form. `ContextAttachment.mode` schließt `"off"` aus; `currentContext()` liefert `null` bei Aus. `stats.contexts` optional (Task 2), gesetzt in Task 5, gelesen in Task 11.

**Bekannte Stelle mit Anpassungsbedarf beim Ausführen:** der Test in Task 4 zur Zeilennummern-Breite (`"   8 |"`) — der Plan sagt, welche Seite gilt (der Code, weil die Breite der höchsten Nummer folgt).
