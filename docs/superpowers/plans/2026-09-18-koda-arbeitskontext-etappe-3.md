# Koda — Arbeitskontext Etappe 3 (Vault-Modus, semantische Nachbarn, Bases-Ansicht) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kodas Arbeitskontext bekommt die zwei Quellen mit Fremd-Abhängigkeit: Treffer und Nachbarn aus vault-rag (**3a**) und Zeilen aus einer Bases-Ansicht „Koda-Kontext“ (**3b**).

**Architecture:** Alles Entscheiden, Budgetieren und Rendern bleibt pure in `src/core/context/`. Neu dort sind `semantic.ts` (Treffer holen über einen Port, Fehler als Wert) und `bases.ts` (Schnappschuss-Typen, Tabellen-Rendern, Liste pflegen). Die bestehende Kette `collectCandidates → allocateBudget → renderFullContext` wird nur erweitert, sie bekommt keinen zweiten Weg. Obsidian-seitig kommen ein Modus-Dropdown-Helfer, ein Debounce im Eingabefeld und die registrierte Bases-Ansicht hinzu, die ihre Daten beim Übernehmen **kopiert**.

**Tech Stack:** TypeScript, esbuild, vitest (Obsidian-Mock unter `tests/__mocks__/obsidian.ts`), vendored `obsidian-kit` (unverändert — dieser Plan vendort nichts neu), GUI-Smoke per CDP (`scripts/gui-smoke.ts`, zentrale Brücke `../tools/obsidian-cdp/`).

**Spec:** `docs/superpowers/specs/2026-09-02-koda-arbeitskontext-design.md`, besonders die Abschnitte **E1**, **E6**, **E7**, **E8** und **„Etappe 3 — Zuschnitt (Design-Session mit Johannes, 2026-09-18)"**. Spike-Befunde: `docs/LAB.md` § „2026-09-06 · Bases-View-API“. Beide lesen, bevor du anfängst.

## Global Constraints

- **Zwei Teil-Etappen, nacheinander.** 3a = Tasks 1–8, 3b = Tasks 9–13. 3b beginnt erst, wenn 3a komplett ist (Gate grün, Smoke grün, committet). Beide ändern `candidates.ts`, `build.ts`, `render.ts`, `panel-vm.ts`, `main.ts` und `context-panel.ts`, deshalb nie parallel.
- **`src/core/` bleibt pure** — kein `import … from "obsidian"`; `npm run check:pure` erzwingt es.
- **Gate:** `npm run gate` (lint + typecheck + typecheck:tests + typecheck:scripts + test + check:pure + build), **0 Errors, 0 Warnings**, im Vordergrund, Exit-Code nie durch eine Pipe. Ausgangsstand vor diesem Plan: **727/727** Tests, GUI-Smoke **41/41** (gemessen 2026-09-17). Vor dem ersten Umbau-Commit Baseline neu messen und in der Auftragsnote festhalten (Rahmenregel 5).
- **Texte** nur über `src/i18n/strings.ts` (`t("key", …)`, Platzhalter `{0}`) für die Obsidian-Schicht; die puren Module unter `src/core/context/` tragen ihre Texte wie bisher in eigenen `T = { de, en }`-Tabellen (Vorbild `render.ts`, `panel-vm.ts`). **Beide Sprachen immer zusammen.**
- **UI-STANDARD §8:** Leerer Abschnitt = Empty-State (`koda-empty`), Stepper-Knöpfe mit `aria-label`, keine eigene Tab-Leiste, nur Theme-CSS-Variablen.
- **Kit-first / Herkunftsstempel:** Die Debounce-Konstante stammt aus `vault-rag/src/chat_view.ts:103-106` (400 ms), `MIN_QUERY` aus `vault-rag/src/context_panel.ts:10` (3). Wer Code übernimmt, setzt den Stempel `// uebernommen aus <repo>/<pfad>, <YYYY-MM-DD>` an die Stelle.
- **Obsidian-Versionen:** `manifest.json` verlangt `minAppVersion` **1.8.7**, die Bases-API gibt es erst ab **1.10.0**. Die Bases-Ansicht wird deshalb nur registriert, wenn `plugin.registerBasesView` existiert, **und** die Klasse `extends BasesView` entsteht erst **innerhalb** der Registrierungsfunktion (auf 1.8/1.9 ist der Export `undefined`, eine Klasse auf Modulebene würde schon beim Laden des Plugins werfen).
- **Bases-Fallen aus dem Spike (verbindlich):** (1) ein fehlender Wert ist ein `NullValue`, dessen `toString()` „null“ ergibt, also `instanceof NullValue` prüfen; eine unbekannte Formel liefert echtes `null`. (2) `data` und jede `BasesEntry` werden bei jedem Update ersetzt, also beim Übernehmen **Zeichenketten und Pfade kopieren**, nie Objekte halten. (3) Der Default der Übergabeform steht im **Lesecode** (`normalizeForm(config.get(...))` → `"table"`), nicht nur in der Options-Deklaration. (4) Die Übernahme ist für die **echte Base-Ansicht** gebaut; eine eingebettete Base bekommt keine Daten.
- **Zuständigkeit (Dach-AGENTS.md):** Koda beurteilt Treffer nicht. Keine Schwelle, kein Reranking, keine Score-Anzeige; vault-rag liefert, der Nutzer wählt ab, das Modell liest.
- **Commits:** nur per Pfadangabe (`git add <pfade>` bzw. `git commit … -- <pfade>`), Conventional Commits, deutsche Beschreibung, Trailer laut Auftragsnote. `git push origin main` **und** `git push github main` (koda-agent hat Dual-Push). **Kein Release, kein Tag** ohne Freigabe.
- **GUI-Smoke nur in einer Zweitinstanz** auf dem Port aus der Auftragsnote, mit portbewusstem CDP-Lock (`--exclusive focus --port <port> --ttl 300`); `release` direkt nach dem Lauf. Rezept: Dach-`AGENTS.md` § Staging-Vaults. Den Treiber nur über `npm run smoke:gui -- …` starten, nicht per `npx tsx`.

## Dateikarte

| Datei | Status | Verantwortung |
|---|---|---|
| `src/core/settings-types.ts` | ändern | `contextAutoK` (0–20, Default 5) |
| `src/core/context/semantic.ts` | **neu** | `SemanticHits`, `fetchSemanticHits`, `semanticNotice`, `MIN_QUERY_CHARS` |
| `src/core/context/types.ts` | ändern | `AVAILABLE_MODES` enthält `vault` |
| `src/core/context/labels.ts` | ändern | `modeOptions()` — Dropdown-Einträge samt Sperre |
| `src/core/context/candidates.ts` | ändern | Modus `vault`, Quelle `related`, (3b) Quelle `base` |
| `src/core/context/render.ts` | ändern | Modus `vault`, Hinweiszeile, (3b) Zusatzblöcke |
| `src/core/context/build.ts` | ändern | `hits`, (3b) `bases` |
| `src/core/context/panel-vm.ts` | ändern | Vault-Abschnitt, Hinweiszeile je Abschnitt, K-Stepper, (3b) Bases-Abschnitt |
| `src/core/context/bases.ts` | **neu (3b)** | `BaseSnapshot`, `normalizeForm`, `renderTables`, `withBaseTables`, `upsertBase`, `removeBase`, `basePaths`, `formatStamp` |
| `src/obsidian/mode-select.ts` | **neu** | `fillModeSelect()` — ein Füllweg für beide Dropdowns |
| `src/obsidian/context-panel.ts` | ändern | Stepper-Helfer, K-Stepper, Hinweiszeile, Dropdown über `fillModeSelect`, (3b) Base-Chips |
| `src/obsidian/view.ts` | ändern | Debounce am Eingabefeld, Dropdown über `fillModeSelect` |
| `src/obsidian/bases-view.ts` | **neu (3b)** | `registerKodaBasesView` — Ansicht „Koda-Kontext“ mit Übernahme-Knopf |
| `src/obsidian/settings.ts` | ändern | Regler `contextAutoK` |
| `src/main.ts` | ändern | `contextQuery`, `vaultAvailable`, `setContextAutoK`, `currentContext(query?)`, (3b) `contextBases` |
| `src/i18n/strings.ts` | ändern | neue Schlüssel (EN + DE) |
| `styles.css` | ändern | `.koda-ctx-note`, (3b) `.koda-bases-*` |
| `scripts/gui-smoke.ts` | ändern | Prüfpunkte 42–45 (3a), 46–47 (3b) |
| `docs/images/fixture/notes/Notes/Koda context.base`, `Koda notes.base` | **neu (3b)** | Kulisse für 46/47 |
| `docs/images/fixture/README.md`, `docs/SMOKE.md`, `CHANGELOG.md`, `README.md`, `CLAUDE.md` | ändern | Doku-Nachzug je Teil-Etappe |

---

# Teil 3a — Vault-Modus und semantische Nachbarn

### Task 1: Einstellung `contextAutoK`

**Files:**
- Modify: `src/core/settings-types.ts` (Konstanten nach `CONTEXT_LINK_DEPTH_MAX`, Feld nach `contextLinkDepth` in `KodaSettings`, `DEFAULT_SETTINGS`, `SCHEMA`)
- Modify: `src/obsidian/settings.ts` (Regler nach „contextLinkDepth“ in der Gruppe `settings.context`)
- Modify: `src/i18n/strings.ts` (EN nach `settings.contextLinkDepth.desc` ~Zeile 204, DE ~Zeile 413)
- Test: `tests/settings_types.test.ts`

**Interfaces:**
- Produces: `CONTEXT_AUTO_K_MIN = 0`, `CONTEXT_AUTO_K_MAX = 20`, `KodaSettings.contextAutoK: number` (Default 5)

- [ ] **Step 1: Failing test** — in `tests/settings_types.test.ts` neben „klemmt contextLinkDepth auf 1..3“:

```ts
  it("klemmt contextAutoK auf 0..20, Default 5", () => {
    expect(validateKodaSettings({}).contextAutoK).toBe(5);
    expect(validateKodaSettings({ contextAutoK: -1 }).contextAutoK).toBe(0);
    expect(validateKodaSettings({ contextAutoK: 99 }).contextAutoK).toBe(20);
    expect(validateKodaSettings({ contextAutoK: "7" }).contextAutoK).toBe(7);
  });
```

- [ ] **Step 2:** `npx vitest run tests/settings_types.test.ts` → FAIL (`undefined` statt 5).

- [ ] **Step 3: Implementieren** — in `src/core/settings-types.ts`:

```ts
/** Spanne fuer `contextAutoK` — wie viele Notizen vault-rag im Modus Vault (Treffer zur
 *  Frage) und im Modus Notiz (semantische Nachbarn) beisteuert. 0 schaltet beides ab;
 *  eine eigene Schalter-Einstellung daneben waere ein zweiter Weg zum selben Zustand
 *  (Spec E8, Etappe-3-Zuschnitt Punkt 4). */
export const CONTEXT_AUTO_K_MIN = 0;
export const CONTEXT_AUTO_K_MAX = 20;
```

Feld in `KodaSettings` direkt nach `contextLinkDepth: number;`: `contextAutoK: number;` — Default in `DEFAULT_SETTINGS` nach `contextLinkDepth: 1,`: `contextAutoK: 5,` — Schema nach der `contextLinkDepth`-Zeile: `contextAutoK: clampIntField(CONTEXT_AUTO_K_MIN, CONTEXT_AUTO_K_MAX),`.

In `src/obsidian/settings.ts` Import um `CONTEXT_AUTO_K_MIN, CONTEXT_AUTO_K_MAX` ergänzen und nach dem `contextLinkDepth`-Eintrag:

```ts
          {
            name: t("settings.contextAutoK"),
            desc: t("settings.contextAutoK.desc"),
            control: { type: "slider", key: "contextAutoK", min: CONTEXT_AUTO_K_MIN, max: CONTEXT_AUTO_K_MAX, step: 1 },
          },
```

`src/i18n/strings.ts`, EN:

```ts
    "settings.contextAutoK": "Notes from vault-rag",
    "settings.contextAutoK.desc": "How many notes the vault-rag plugin contributes: in the Vault mode the notes that best match your question, in the Note mode the notes similar to the active one. 0 turns both off. Without vault-rag this setting has no effect.",
```

DE:

```ts
    "settings.contextAutoK": "Notizen aus vault-rag",
    "settings.contextAutoK.desc": "Wie viele Notizen das Plugin vault-rag beisteuert: im Modus Vault die Notizen, die am besten zu deiner Frage passen, im Modus Notiz die Notizen, die der aktiven ähneln. 0 schaltet beides ab. Ohne vault-rag hat die Einstellung keine Wirkung.",
```

- [ ] **Step 4:** `npx vitest run tests/settings_types.test.ts` → PASS. Danach `npm run gate`; schlägt dabei ein anderer Test fehl, weil er die vollständige Schlüsselliste von `DEFAULT_SETTINGS` vergleicht, dort `contextAutoK: 5` ergänzen.

- [ ] **Step 5: Commit**

```bash
git add src/core/settings-types.ts src/obsidian/settings.ts src/i18n/strings.ts tests/settings_types.test.ts
git commit -m "feat(context): Einstellung contextAutoK (0-20, Default 5) fuer vault-rag-Quellen"
```

---

### Task 2: `semantic.ts` — Treffer holen, Fehler als Wert

**Files:**
- Create: `src/core/context/semantic.ts`
- Test: `tests/context_semantic.test.ts`

**Interfaces:**
- Consumes: `RetrievalApi` aus `src/core/tools/retrieval.ts` (Felder `status()`, `search(q, {k})`, `related(path, {k})`, Rückgabe `ApiResult`)
- Produces:
  - `MIN_QUERY_CHARS = 3`
  - `type SemanticFailure = "absent" | "no-index" | "offline" | "not-indexed" | "error"`
  - `type SemanticHits = { kind: "none" } | { kind: "ok"; paths: string[] } | { kind: "failed"; reason: SemanticFailure }`
  - `NO_HITS: SemanticHits`
  - `interface SemanticRequest { mode: ContextMode; query: string; activePath: string | null; k: number }`
  - `fetchSemanticHits(api: RetrievalApi | null, req: SemanticRequest): Promise<SemanticHits>`
  - `semanticNotice(reason: SemanticFailure, lang: "de" | "en"): string`

- [ ] **Step 1: Failing tests** — `tests/context_semantic.test.ts`:

```ts
/* Treffer aus vault-rag als WERT: der Vault-Modus meldet einen Fehler, der Modus Notiz
 * schweigt (Spec, Etappe-3-Zuschnitt Punkte 2 und 4). */
import { describe, it, expect, vi } from "vitest";
import { fetchSemanticHits, semanticNotice, NO_HITS } from "../src/core/context/semantic";
import type { ApiResult, RetrievalApi } from "../src/core/tools/retrieval";

function api(search: ApiResult, related: ApiResult = search, indexed = true): RetrievalApi & { search: ReturnType<typeof vi.fn>; related: ReturnType<typeof vi.fn> } {
  return {
    apiVersion: 1,
    status: () => ({ apiVersion: 1, indexed, noteCount: 3 }),
    search: vi.fn(() => Promise.resolve(search)),
    related: vi.fn(() => Promise.resolve(related)),
  };
}
const ok: ApiResult = { ok: true, hits: [{ path: "V1.md", score: 0.9 }, { path: "V2.md", score: 0.8 }] };

describe("fetchSemanticHits — Modus Vault", () => {
  it("sucht mit der getrimmten Frage und K, liefert die Pfade in Trefferreihenfolge", async () => {
    const a = api(ok);
    const hits = await fetchSemanticHits(a, { mode: "vault", query: "  Wie geht Verdichtung?  ", activePath: null, k: 5 });
    expect(hits).toEqual({ kind: "ok", paths: ["V1.md", "V2.md"] });
    expect(a.search).toHaveBeenCalledWith("Wie geht Verdichtung?", { k: 5 });
  });
  it("fragt bei weniger als drei Zeichen gar nicht erst", async () => {
    const a = api(ok);
    expect(await fetchSemanticHits(a, { mode: "vault", query: "ab", activePath: null, k: 5 })).toEqual(NO_HITS);
    expect(a.search).not.toHaveBeenCalled();
  });
  it("K = 0 schaltet ab, ohne zu fragen", async () => {
    const a = api(ok);
    expect(await fetchSemanticHits(a, { mode: "vault", query: "Frage", activePath: null, k: 0 })).toEqual(NO_HITS);
    expect(a.search).not.toHaveBeenCalled();
  });
  it("ohne vault-rag: failed/absent — der Block soll es sagen", async () => {
    expect(await fetchSemanticHits(null, { mode: "vault", query: "Frage", activePath: null, k: 5 }))
      .toEqual({ kind: "failed", reason: "absent" });
  });
  it("reicht den Grund der API durch", async () => {
    const a = api({ ok: false, reason: "offline" });
    expect(await fetchSemanticHits(a, { mode: "vault", query: "Frage", activePath: null, k: 5 }))
      .toEqual({ kind: "failed", reason: "offline" });
  });
  it("ein Wurf im fremden Plugin wird zu failed/error, nicht zu einer Ausnahme", async () => {
    const a = api(ok);
    a.search.mockImplementation(() => Promise.reject(new Error("kaputt")));
    expect(await fetchSemanticHits(a, { mode: "vault", query: "Frage", activePath: null, k: 5 }))
      .toEqual({ kind: "failed", reason: "error" });
  });
});

describe("fetchSemanticHits — Modus Notiz", () => {
  it("fragt related() fuer die aktive Notiz", async () => {
    const a = api(ok);
    const hits = await fetchSemanticHits(a, { mode: "note", query: "", activePath: "A.md", k: 3 });
    expect(hits).toEqual({ kind: "ok", paths: ["V1.md", "V2.md"] });
    expect(a.related).toHaveBeenCalledWith("A.md", { k: 3 });
  });
  it("schweigt ohne vault-rag, ohne Index, ohne aktive Notiz und bei Fehlern", async () => {
    const req = { mode: "note" as const, query: "", activePath: "A.md", k: 3 };
    expect(await fetchSemanticHits(null, req)).toEqual(NO_HITS);
    expect(await fetchSemanticHits(api(ok, ok, false), req)).toEqual(NO_HITS);
    expect(await fetchSemanticHits(api(ok), { ...req, activePath: null })).toEqual(NO_HITS);
    expect(await fetchSemanticHits(api(ok, { ok: false, reason: "not-indexed", path: "A.md" }), req)).toEqual(NO_HITS);
  });
});

describe("fetchSemanticHits — andere Modi", () => {
  it("fragt in Arbeitsplatz und Alle Tabs nie", async () => {
    const a = api(ok);
    for (const mode of ["off", "workspace", "tabs"] as const) {
      expect(await fetchSemanticHits(a, { mode, query: "Frage", activePath: "A.md", k: 5 })).toEqual(NO_HITS);
    }
    expect(a.search).not.toHaveBeenCalled();
    expect(a.related).not.toHaveBeenCalled();
  });
});

describe("semanticNotice", () => {
  it("nennt den Grund in beiden Sprachen", () => {
    expect(semanticNotice("offline", "de")).toContain("Vault-Suche nicht verfügbar");
    expect(semanticNotice("absent", "de")).toContain("vault-rag");
    expect(semanticNotice("offline", "en")).toContain("Vault search unavailable");
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/context_semantic.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: Implementieren** — `src/core/context/semantic.ts`:

```ts
/* Semantische Kandidaten aus vault-rag — Treffer zur Frage (Modus Vault) und Nachbarn der
 * aktiven Notiz (Modus Notiz). Pure: die API kommt als Port herein (`readRetrievalApi` im
 * Adapter liefert sie oder null).
 *
 * Zwei Haltungen, bewusst verschieden (Spec, Etappe-3-Zuschnitt Punkte 2 und 4):
 * - Vault: der Modus IST die Suche. Schlaegt sie fehl, meldet der Block es — still leer
 *   waere eine Kappung, die sich nicht nennt.
 * - Notiz: die Nachbarn sind eine Zugabe. Fehlen sie, fehlt der Abschnitt, sonst nichts.
 *
 * Koda beurteilt Treffer nicht (Dach-AGENTS.md, Zustaendigkeits-Zuschnitt): keine Schwelle,
 * kein Score im Block — die Reihenfolge der API ist die Reihenfolge der Kandidaten. */
import type { RetrievalApi } from "../tools/retrieval";
import type { ContextMode } from "./types";

// uebernommen aus vault-rag/src/context_panel.ts:10 (MIN_QUERY), 2026-09-18
export const MIN_QUERY_CHARS = 3;

export type SemanticFailure = "absent" | "no-index" | "offline" | "not-indexed" | "error";
export type SemanticHits =
  | { kind: "none" }
  | { kind: "ok"; paths: string[] }
  | { kind: "failed"; reason: SemanticFailure };

export const NO_HITS: SemanticHits = { kind: "none" };

export interface SemanticRequest {
  mode: ContextMode;
  query: string;
  activePath: string | null;
  k: number;
}

export async function fetchSemanticHits(api: RetrievalApi | null, req: SemanticRequest): Promise<SemanticHits> {
  if (req.k <= 0) return NO_HITS;

  if (req.mode === "vault") {
    const q = req.query.trim();
    if (q.length < MIN_QUERY_CHARS) return NO_HITS;
    if (api === null) return { kind: "failed", reason: "absent" };
    try {
      const res = await api.search(q, { k: req.k });
      return res.ok ? { kind: "ok", paths: res.hits.map((h) => h.path) } : { kind: "failed", reason: res.reason };
    } catch {
      return { kind: "failed", reason: "error" };
    }
  }

  if (req.mode === "note") {
    if (api === null || req.activePath === null) return NO_HITS;
    try {
      if (!api.status().indexed) return NO_HITS;
      const res = await api.related(req.activePath, { k: req.k });
      return res.ok ? { kind: "ok", paths: res.hits.map((h) => h.path) } : NO_HITS;
    } catch {
      return NO_HITS;
    }
  }

  return NO_HITS;
}

const NOTICE = {
  de: {
    head: "Vault-Suche nicht verfügbar",
    absent: "das Plugin vault-rag fehlt oder ist deaktiviert",
    "no-index": "vault-rag hat keinen Index geladen",
    offline: "der Embedding-Endpunkt von vault-rag ist nicht erreichbar",
    "not-indexed": "die Notiz steht nicht im Index von vault-rag",
    error: "vault-rag hat einen Fehler gemeldet",
  },
  en: {
    head: "Vault search unavailable",
    absent: "the vault-rag plugin is missing or disabled",
    "no-index": "vault-rag has no index loaded",
    offline: "vault-rag's embedding endpoint is not reachable",
    "not-indexed": "the note is not in vault-rag's index",
    error: "vault-rag reported an error",
  },
} as const;

/** Eine Zeile fuer Block UND Kontext-Tab — ein Wortlaut, zwei Orte. */
export function semanticNotice(reason: SemanticFailure, lang: "de" | "en"): string {
  const t = NOTICE[lang];
  return `[${t.head}: ${t[reason]}]`;
}
```

- [ ] **Step 4:** `npx vitest run tests/context_semantic.test.ts` → PASS; `npm run check:pure` → grün.

- [ ] **Step 5: Commit**

```bash
git add src/core/context/semantic.ts tests/context_semantic.test.ts
git commit -m "feat(context): semantic.ts — vault-rag-Treffer und -Nachbarn als Wert statt Ausnahme"
```

---

### Task 3: Kandidaten — Modus Vault und Quelle `related`

**Files:**
- Modify: `src/core/context/candidates.ts`
- Test: `tests/context_candidates_semantic.test.ts` (neu; die bestehende `tests/context_candidates.test.ts` bleibt unverändert grün)

**Interfaces:**
- Produces: `CandidateInput.mode: "note" | "tabs" | "vault"`, neues optionales Feld `CandidateInput.semantic?: readonly string[]`. Reihenfolge: aktiv · manuell · (Tabs | Vault-Treffer | Links, Backlinks, dann `related`).

- [ ] **Step 1: Failing tests** — `tests/context_candidates_semantic.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { collectCandidates } from "../src/core/context/candidates";
import type { LinkPort, WorkspaceSnapshot } from "../src/core/context/ports";

const snap: WorkspaceSnapshot = {
  active: { path: "A.md", frontmatter: null, selection: "", cursorLine: 1, lineCount: 1 },
  tabs: [{ path: "A.md", viewType: "markdown" }, { path: "T.md", viewType: "markdown" }],
};
const links: LinkPort = {
  outgoing: (p) => (p === "A.md" ? ["B.md"] : []),
  backlinks: (p) => (p === "A.md" ? ["C.md"] : []),
};

describe("collectCandidates — Modus Vault", () => {
  it("aktive Notiz, dann Manuelles, dann Treffer; Dubletten nur einmal", () => {
    const out = collectCandidates({
      mode: "vault", snap, links, linkDepth: 1, manual: ["M.md"],
      semantic: ["V1.md", "A.md", "M.md", "V2.md"],
    });
    expect(out).toEqual([
      { source: "active", path: "A.md" },
      { source: "manual", path: "M.md" },
      { source: "vault", path: "V1.md" },
      { source: "vault", path: "V2.md" },
    ]);
  });
  it("liefert Treffer auch ohne aktive Notiz", () => {
    const out = collectCandidates({
      mode: "vault", snap: { active: null, tabs: [] }, links, linkDepth: 1, manual: [], semantic: ["V1.md"],
    });
    expect(out).toEqual([{ source: "vault", path: "V1.md" }]);
  });
  it("folgt keinen Links und nimmt keine Tabs", () => {
    const out = collectCandidates({ mode: "vault", snap, links, linkDepth: 2, manual: [], semantic: [] });
    expect(out).toEqual([{ source: "active", path: "A.md" }]);
  });
});

describe("collectCandidates — semantische Nachbarn im Modus Notiz", () => {
  it("haengt related() nach den Backlinks an, ohne depth; ein schon verlinkter Pfad bleibt link", () => {
    const out = collectCandidates({
      mode: "note", snap, links, linkDepth: 1, manual: [], semantic: ["B.md", "R.md"],
    });
    expect(out).toEqual([
      { source: "active", path: "A.md" },
      { source: "link", path: "B.md", depth: 1 },
      { source: "backlink", path: "C.md", depth: 1 },
      { source: "related", path: "R.md" },
    ]);
  });
  it("ohne semantic bleibt alles wie in Etappe 2", () => {
    const out = collectCandidates({ mode: "note", snap, links, linkDepth: 1, manual: [] });
    expect(out.map((c) => c.source)).toEqual(["active", "link", "backlink"]);
  });
  it("Modus Alle Tabs ignoriert semantic", () => {
    const out = collectCandidates({ mode: "tabs", snap, links, linkDepth: 1, manual: [], semantic: ["R.md"] });
    expect(out.map((c) => c.path)).toEqual(["A.md", "T.md"]);
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/context_candidates_semantic.test.ts` → FAIL (Typfehler/fehlende Einträge).

- [ ] **Step 3: Implementieren** — in `src/core/context/candidates.ts`:

`CandidateInput` wird zu:

```ts
export interface CandidateInput {
  mode: "note" | "tabs" | "vault";
  snap: WorkspaceSnapshot;
  links: LinkPort;
  /** Ebenen fuer Links und Backlinks (Einstellung `contextLinkDepth`). Nur im Modus Notiz. */
  linkDepth: number;
  /** Vom Nutzer hinzugefuegte Pfade, in der Reihenfolge des Hinzufuegens. */
  manual: readonly string[];
  /** Pfade aus vault-rag (`semantic.ts`): im Modus Vault die Treffer zur Frage, im Modus
   *  Notiz die Nachbarn der aktiven Notiz. Reihenfolge der API — Koda sortiert nicht um. */
  semantic?: readonly string[];
}
```

Den Kopfkommentar um den Satz ergänzen: „Vault: aktiv · Manuelles · Treffer. Notiz: … · Backlinks · semantische Nachbarn (Quelle `related`, ohne Ebene — sie haben keine).“

Nach dem `if (input.mode === "tabs") { … return out; }`-Block einfügen:

```ts
  if (input.mode === "vault") {
    for (const p of input.semantic ?? []) nimm({ source: "vault", path: p });
    return out;
  }
```

Und direkt vor dem letzten `return out;` (nach der Breitensuche):

```ts
  // Semantische Nachbarn zuletzt: sie sind eine Zugabe zur Link-Nachbarschaft. Ein Pfad, den
  // die Breitensuche schon gefunden hat, behaelt seine Link-Quelle — `nimm` entdoppelt.
  for (const p of input.semantic ?? []) nimm({ source: "related", path: p });
```

- [ ] **Step 4:** `npx vitest run tests/context_candidates_semantic.test.ts tests/context_candidates.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/context/candidates.ts tests/context_candidates_semantic.test.ts
git commit -m "feat(context): Kandidaten fuer Modus Vault und semantische Nachbarn (Quelle related)"
```

---

### Task 4: Rendern und Bauen — Modus Vault, Hinweiszeile

**Files:**
- Modify: `src/core/context/render.ts`, `src/core/context/build.ts`
- Test: `tests/context_render.test.ts`, `tests/context_build.test.ts` (Fälle anhängen)

**Interfaces:**
- Consumes: `SemanticHits`, `NO_HITS`, `semanticNotice` (Task 2); `CandidateInput.semantic` (Task 3)
- Produces:
  - `renderFullContext(entries, mode: "note" | "tabs" | "vault", lang, extras?: RenderExtras)` mit `export interface RenderExtras { notice?: string }`
  - `BuildOptions.mode: "note" | "tabs" | "vault"`, `BuildOptions.hits?: SemanticHits`

- [ ] **Step 1: Failing tests**

An `tests/context_render.test.ts` anhängen (Import `renderFullContext` ist dort schon vorhanden — sonst ergänzen):

```ts
describe("renderFullContext — Modus Vault und Hinweiszeile", () => {
  it("setzt den Hinweis direkt unter die Kopfzeile", () => {
    const ctx = renderFullContext([], "vault", "de", { notice: "[Vault-Suche nicht verfügbar: x]" });
    const zeilen = ctx.text.split("\n");
    expect(zeilen[0]).toBe("[Arbeitskontext · Vault]");
    expect(zeilen[1]).toBe("[Vault-Suche nicht verfügbar: x]");
  });
  it("benennt Vault-Treffer und semantische Nachbarn als Herkunft", () => {
    const e = (source: "vault" | "related") => ({ source, path: `${source}.md`, shown: "x", fullChars: 1, cut: false });
    const ctx = renderFullContext([e("vault"), e("related")], "vault", "de");
    expect(ctx.text).toContain("## vault.md (Treffer der Vault-Suche)");
    expect(ctx.text).toContain("## related.md (semantisch ähnlich)");
  });
});
```

An `tests/context_build.test.ts` anhängen:

```ts
describe("buildFullContext — Modus Vault", () => {
  it("legt Treffer im Volltext in den Block, Quelle vault", async () => {
    const content = inhalt({ "A.md": "Text A", "V.md": "Text V" });
    const ctx = await buildFullContext({
      mode: "vault", snap, links, content, manual: [], off: new Set(),
      linkDepth: 1, budget: 10000, lang: "de", hits: { kind: "ok", paths: ["V.md"] },
    });
    expect(ctx.mode).toBe("vault");
    expect(ctx.items.map((i) => `${i.source}:${i.path}`)).toEqual(["active:A.md", "vault:V.md"]);
  });
  it("meldet eine fehlgeschlagene Suche im Block, statt still leer zu bleiben", async () => {
    const ctx = await buildFullContext({
      mode: "vault", snap, links, content: inhalt({ "A.md": "Text A" }), manual: [], off: new Set(),
      linkDepth: 1, budget: 10000, lang: "de", hits: { kind: "failed", reason: "offline" },
    });
    expect(ctx.text).toContain("Vault-Suche nicht verfügbar");
    expect(ctx.items.map((i) => i.path)).toEqual(["A.md"]);
  });
  it("ein abgewaehlter Treffer wird nicht gelesen", async () => {
    const content = inhalt({ "A.md": "Text A", "V.md": "Text V" });
    await buildFullContext({
      mode: "vault", snap, links, content, manual: [], off: new Set([itemKey("vault", "V.md")]),
      linkDepth: 1, budget: 10000, lang: "de", hits: { kind: "ok", paths: ["V.md"] },
    });
    expect(content.read).not.toHaveBeenCalledWith("V.md");
  });
  it("Modus Notiz: related-Treffer kommen als Nachbarn, fehlgeschlagene schweigen", async () => {
    const content = inhalt({ "A.md": "Text A", "B.md": "Text B", "R.md": "Text R" });
    const ctx = await buildFullContext({
      mode: "note", snap, links, content, manual: [], off: new Set(),
      linkDepth: 1, budget: 10000, lang: "de", hits: { kind: "ok", paths: ["R.md"] },
    });
    expect(ctx.items.map((i) => i.source)).toEqual(["active", "link", "related"]);
    const still = await buildFullContext({
      mode: "note", snap, links, content, manual: [], off: new Set(),
      linkDepth: 1, budget: 10000, lang: "de", hits: { kind: "failed", reason: "offline" },
    });
    expect(still.text).not.toContain("nicht verfügbar");
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/context_render.test.ts tests/context_build.test.ts` → FAIL.

- [ ] **Step 3: Implementieren**

`src/core/context/render.ts`:
- In `T.de.mode` ergänzen: `vault: "Vault"`; in `T.en.mode`: `vault: "Vault"`.
- In `T.de.src` ergänzen: `related: "semantisch ähnlich", vault: "Treffer der Vault-Suche"`; in `T.en.src`: `related: "semantically similar", vault: "vault search match"`.
- Neue Schnittstelle und Signatur:

```ts
/** Was ein Block zusaetzlich zu den Eintraegen tragen kann. */
export interface RenderExtras {
  /** Eine Zeile direkt unter der Kopfzeile — z. B. „Vault-Suche nicht verfuegbar". */
  notice?: string;
}

export function renderFullContext(
  entries: readonly AllocatedEntry[],
  mode: "note" | "tabs" | "vault",
  lang: Lang,
  extras: RenderExtras = {},
): ContextAttachment {
  const t = T[lang];
  const bloecke: string[] = [t.head(t.mode[mode])];
  const items: ContextItem[] = [];
  const kopf = extras.notice !== undefined ? `${bloecke[0]}\n${extras.notice}` : bloecke[0];
  bloecke[0] = kopf;

  if (entries.length === 0) {
    bloecke.push(t.empty);
    return { mode, items, text: bloecke.join("\n") };
  }
  // … Schleife unverändert …
}
```

(Die Zuweisung an `bloecke[0]` hält den Hinweis mit **einem** Zeilenumbruch an der Kopfzeile, während die Einträge wie bisher mit `"\n\n"` verbunden werden.)

`src/core/context/build.ts`:
- Imports: `import { NO_HITS, semanticNotice, type SemanticHits } from "./semantic";`
- `BuildOptions.mode: "note" | "tabs" | "vault";` und neues Feld

```ts
  /** vault-rag-Ergebnis (`fetchSemanticHits`). Fehlt es, verhaelt sich der Bau wie in Etappe 2. */
  hits?: SemanticHits;
```

- In `buildFullContext`:

```ts
  const hits = opts.hits ?? NO_HITS;
  const kandidaten = collectCandidates({
    mode: opts.mode, snap: opts.snap, links: opts.links,
    linkDepth: opts.linkDepth, manual: opts.manual,
    semantic: hits.kind === "ok" ? hits.paths : [],
  }).filter((c) => !opts.off.has(itemKey(c.source, c.path)));
  // Nur der Vault-Modus meldet einen Fehlschlag: dort IST die Suche der Modus. Im Modus Notiz
  // sind die Nachbarn eine Zugabe und fehlen still (Etappe-3-Zuschnitt Punkt 4).
  const notice = opts.mode === "vault" && hits.kind === "failed" ? semanticNotice(hits.reason, opts.lang) : undefined;
```

und beim Budget die Hinweiszeile mit abziehen, dann rendern:

```ts
  const overhead = geladen.reduce((sum, c) => sum + overheadFor(c, opts.lang), 0) + (notice?.length ?? 0) + 1;
  const inhaltsBudget = Math.max(0, opts.budget - overhead);
  return renderFullContext(allocateBudget(geladen, inhaltsBudget), opts.mode, opts.lang, notice !== undefined ? { notice } : {});
```

- [ ] **Step 4:** `npx vitest run tests/context_render.test.ts tests/context_build.test.ts` → PASS; danach `npm test` (alle alten Build-Tests müssen unverändert grün bleiben — `+ 1` im Overhead ändert keine bestehende Erwartung, weil dort das Budget groß ist; prüfe `tests/context_build.test.ts` auf eine exakte Budget-Erwartung und melde, falls eine bricht, statt sie anzupassen).

- [ ] **Step 5: Commit**

```bash
git add src/core/context/render.ts src/core/context/build.ts tests/context_render.test.ts tests/context_build.test.ts
git commit -m "feat(context): Volltext-Block fuer Modus Vault, Hinweiszeile bei fehlgeschlagener Suche"
```

---

### Task 5: Modus Vault anbieten — Dropdown mit Sperre, ein Füllweg

**Files:**
- Modify: `src/core/context/types.ts` (`AVAILABLE_MODES`)
- Modify: `src/core/context/labels.ts` (`modeOptions`)
- Create: `src/obsidian/mode-select.ts`
- Modify: `src/obsidian/view.ts` (Dropdown im Chat), `src/obsidian/context-panel.ts` (Dropdown im Kontext-Tab), `src/obsidian/settings.ts` (Kommentar)
- Modify: `src/main.ts` (`vaultAvailable`, Guard in `setContextMode`, Rückfall in `onLayoutReady`)
- Modify: `src/i18n/strings.ts`
- Test: `tests/context_types.test.ts` (Erwartung umstellen), `tests/context_labels.test.ts` (neue Fälle)

**Interfaces:**
- Produces:
  - `AVAILABLE_MODES = ["off", "workspace", "note", "tabs", "vault"]`
  - `interface ModeOption { value: ContextMode; label: string; disabled: boolean }`, `modeOptions(lang, vaultAvailable: boolean): ModeOption[]`
  - `fillModeSelect(sel: HTMLSelectElement, lang: "de" | "en", vaultAvailable: boolean, current: ContextMode): void`
  - `KodaPlugin.vaultAvailable(): boolean`
  - `ContextPanelHost.vaultAvailable(): boolean` (neu)

- [ ] **Step 1: Failing tests**

`tests/context_types.test.ts`, den Block `describe("AVAILABLE_MODES", …)` ersetzen durch:

```ts
describe("AVAILABLE_MODES", () => {
  it("bietet seit Etappe 3 alle fuenf Modi an — die Verfuegbarkeit von Vault prueft die Oberflaeche zur Laufzeit", () => {
    expect([...AVAILABLE_MODES]).toEqual(["off", "workspace", "note", "tabs", "vault"]);
    expect([...AVAILABLE_MODES]).toEqual([...CONTEXT_MODES]);
  });
});
```

`tests/context_labels.test.ts` anhängen (Import `modeOptions` ergänzen):

```ts
describe("modeOptions", () => {
  it("sperrt Vault ohne vault-rag und sagt warum", () => {
    const opts = modeOptions("de", false);
    const vault = opts.find((o) => o.value === "vault");
    expect(vault).toEqual({ value: "vault", label: "Vault (braucht vault-rag)", disabled: true });
    expect(opts.filter((o) => o.disabled)).toHaveLength(1);
  });
  it("gibt Vault mit vault-rag frei", () => {
    expect(modeOptions("en", true).find((o) => o.value === "vault")).toEqual({ value: "vault", label: "Vault", disabled: false });
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/context_types.test.ts tests/context_labels.test.ts` → FAIL.

- [ ] **Step 3: Implementieren**

`src/core/context/types.ts` — Kommentar und Konstante:

```ts
/** Angeboten wird nur, was gebaut ist (Spec E6: „ein Eintrag, der nie geht, ist kein
 *  Versprechen"). Seit Etappe 3 sind alle fuenf Modi gebaut. „vault" haengt zusaetzlich am
 *  fremden Plugin vault-rag — ob er WAEHLBAR ist, entscheidet die Oberflaeche zur Laufzeit
 *  (`modeOptions` in labels.ts), nicht diese Liste. */
export const AVAILABLE_MODES: readonly ContextMode[] = ["off", "workspace", "note", "tabs", "vault"];
```

`src/core/context/labels.ts` — Import `AVAILABLE_MODES` aus `./types` ergänzen, dann:

```ts
export interface ModeOption { value: ContextMode; label: string; disabled: boolean }

const NEEDS_RAG: Record<Lang, string> = { de: "braucht vault-rag", en: "needs vault-rag" };

/** Die Eintraege beider Modus-Dropdowns (Chat und Kontext-Tab) — ein Wortlaut, zwei
 *  Bedienstellen. Vault ohne vault-rag bleibt SICHTBAR, aber gesperrt und nennt den Grund
 *  (Spec E1: „derselbe Wortlaut wie bei related_notes"). */
export function modeOptions(lang: Lang, vaultAvailable: boolean): ModeOption[] {
  return AVAILABLE_MODES.map((m) => {
    const disabled = m === "vault" && !vaultAvailable;
    const label = disabled ? `${modeLabel(m, lang)} (${NEEDS_RAG[lang]})` : modeLabel(m, lang);
    return { value: m, label, disabled };
  });
}
```

`src/obsidian/mode-select.ts` (neu):

```ts
import type { ContextMode } from "../core/context/types";
import { modeOptions } from "../core/context/labels";

/** Fuellt ein Modus-Dropdown neu — bei JEDEM Sync, nicht nur beim Aufbau: vault-rag kann
 *  nach Koda geladen oder zur Laufzeit abgeschaltet werden, und die Sperre muss folgen. */
export function fillModeSelect(sel: HTMLSelectElement, lang: "de" | "en", vaultAvailable: boolean, current: ContextMode): void {
  sel.empty();
  for (const o of modeOptions(lang, vaultAvailable)) {
    const opt = sel.createEl("option", { value: o.value, text: o.label });
    opt.disabled = o.disabled;
  }
  sel.value = current;
}
```

`src/obsidian/view.ts`:
- In `mountChat` die Zeile `for (const m of AVAILABLE_MODES) this.modeEl.createEl("option", …);` **entfernen** (das Füllen übernimmt `syncContextMode`, das unmittelbar danach schon aufgerufen wird).
- `syncContextMode()` wird zu:

```ts
  syncContextMode(): void {
    if (this.modeEl !== null) fillModeSelect(this.modeEl, this.lang(), this.plugin.vaultAvailable(), this.plugin.contextMode);
    this.ctxPanel?.render();
  }
```

- Import `fillModeSelect` ergänzen; `AVAILABLE_MODES`/`modeLabel`-Importe entfernen, falls danach ungenutzt (Lint meldet es).
- Im `ContextPanel`-Host-Objekt ergänzen: `vaultAvailable: () => this.plugin.vaultAvailable(),`.

`src/obsidian/context-panel.ts`:
- `ContextPanelHost` um `vaultAvailable(): boolean;` ergänzen.
- In `mount` die `for (const m of AVAILABLE_MODES) …`-Zeile entfernen.
- In `paint` die Zeile `if (this.modeEl !== null) this.modeEl.value = this.host.mode();` ersetzen durch:

```ts
    if (this.modeEl !== null) fillModeSelect(this.modeEl, this.host.lang(), this.host.vaultAvailable(), this.host.mode());
```

- Importe entsprechend anpassen (`fillModeSelect` rein, `AVAILABLE_MODES`/`modeLabel` raus, falls ungenutzt).

`src/obsidian/settings.ts` — nur den Kommentar über `options:` im Modus-Dropdown auf den neuen Stand bringen: „Alle fünf Modi sind gebaut; Vault als *Default* ist auch ohne vault-rag erlaubt — der Chat fällt beim Start auf Arbeitsplatz zurück, wenn vault-rag fehlt (`onLayoutReady` in main.ts).“

`src/main.ts`:
- Methode ergänzen (neben `setContextMode`):

```ts
  /** Ist vault-rags API da (Version und Form geprueft)? Je Aufruf frisch — vault-rag kann zur
   *  Laufzeit an- oder abgeschaltet werden (Muster `readRetrievalApi`). Ob ein Index geladen
   *  ist, entscheidet diese Frage NICHT: das meldet die Suche selbst als Grund. */
  vaultAvailable(): boolean {
    return readRetrievalApi(this.app) !== null;
  }
```

- `setContextMode` wird zu:

```ts
  setContextMode(mode: ContextMode): void {
    if (!AVAILABLE_MODES.includes(mode)) return;
    if (mode === "vault" && !this.vaultAvailable()) {
      // Befehl oder veraltetes Dropdown: nicht still ignorieren, sondern sagen, was fehlt.
      new Notice(t("context.vaultNeedsRag"));
      return;
    }
    this.contextMode = mode;
    for (const v of this.views()) v.syncContextMode();
  }
```

- In `onload` nach der Registrierung der View (vor oder nach den Befehlen, egal) ergänzen:

```ts
    // Erst wenn alle Plugins geladen sind, ist die Frage „gibt es vault-rag?" beantwortbar.
    // Ein gespeicherter Default „vault" ohne vault-rag faellt dann auf Arbeitsplatz zurueck,
    // und die Dropdowns bekommen ihre Sperre (sie wurden womoeglich vor vault-rag gebaut).
    this.app.workspace.onLayoutReady(() => {
      if (this.contextMode === "vault" && !this.vaultAvailable()) this.contextMode = "workspace";
      for (const v of this.views()) v.syncContextMode();
    });
```

`src/i18n/strings.ts` — EN: `"context.vaultNeedsRag": "The Vault mode needs the vault-rag plugin.",` · DE: `"context.vaultNeedsRag": "Der Modus Vault braucht das Plugin vault-rag.",`

- [ ] **Step 4:** `npx vitest run tests/context_types.test.ts tests/context_labels.test.ts` → PASS; `npm run gate` → grün.

- [ ] **Step 5: Commit**

```bash
git add src/core/context/types.ts src/core/context/labels.ts src/obsidian/mode-select.ts src/obsidian/view.ts src/obsidian/context-panel.ts src/obsidian/settings.ts src/main.ts src/i18n/strings.ts tests/context_types.test.ts tests/context_labels.test.ts
git commit -m "feat(context): Modus Vault im Dropdown, gesperrt ohne vault-rag, ein Fuellweg fuer beide Dropdowns"
```

---

### Task 6: ViewModel des Kontext-Tabs — Vault-Abschnitt, Hinweiszeile, K-Stepper

**Files:**
- Modify: `src/core/context/panel-vm.ts`
- Test: `tests/context_panel_vm.test.ts` (Fälle anhängen)

**Interfaces:**
- Consumes: `SemanticHits`, `NO_HITS`, `semanticNotice`, `MIN_QUERY_CHARS` (Task 2); `buildFullContext` mit `hits` (Task 4)
- Produces:
  - `buildPanelViewModel(mode: Exclude<ContextMode, "off">, snap, off, opts)`
  - `PanelOptions` neu: `autoK: number`, `hits?: SemanticHits`, `query?: string`
  - `PanelSection.note: string` (Hinweiszeile über den Chips; `""` = keine)
  - `PanelViewModel.autoK: number | null` (in den Modi Notiz und Vault gesetzt, sonst `null`)

- [ ] **Step 1: Failing tests** — an `tests/context_panel_vm.test.ts` anhängen. `opts` im Kopf der Datei bekommt zusätzlich `autoK: 5,` (ohne das Feld bricht der Typecheck der alten Fälle):

```ts
describe("buildPanelViewModel — Modus Vault", () => {
  const content = { read: (p: string) => Promise.resolve(p === "Notes/Tools.md" ? "Tools text" : "Plan text") };
  it("zeigt aktive Notiz und Treffer im Abschnitt Vault", async () => {
    const vm = await buildPanelViewModel("vault", snap, new Set(), {
      ...opts, content, query: "Welche Werkzeuge gibt es?", hits: { kind: "ok", paths: ["Notes/Tools.md"] },
    });
    const sec = vm.sections.find((s) => s.id === "vault");
    expect(sec?.title).toBe("Vault");
    expect(sec?.chips.map((c) => `${c.source}:${c.path}`)).toEqual(["active:Notes/Project plan.md", "vault:Notes/Tools.md"]);
    expect(sec?.note).toBe("");
    expect(vm.autoK).toBe(5);
  });
  it("nennt eine fehlgeschlagene Suche in der Hinweiszeile — auch wenn die aktive Notiz als Chip dasteht", async () => {
    const vm = await buildPanelViewModel("vault", snap, new Set(), {
      ...opts, content, query: "Welche Werkzeuge?", hits: { kind: "failed", reason: "offline" },
    });
    const sec = vm.sections.find((s) => s.id === "vault");
    expect(sec?.chips).toHaveLength(1);
    expect(sec?.note).toContain("Vault-Suche nicht verfügbar");
  });
  it("bittet bei zu kurzer Frage ums Tippen", async () => {
    const vm = await buildPanelViewModel("vault", snap, new Set(), { ...opts, content, query: "ab" });
    expect(vm.sections.find((s) => s.id === "vault")?.note).toContain("Tippe eine Frage");
  });
  it("sagt es, wenn die Suche nichts fand", async () => {
    const vm = await buildPanelViewModel("vault", snap, new Set(), {
      ...opts, content, query: "Welche Werkzeuge?", hits: { kind: "ok", paths: [] },
    });
    expect(vm.sections.find((s) => s.id === "vault")?.note).toBe("Keine passenden Notizen im Index.");
  });
});

describe("buildPanelViewModel — semantische Nachbarn und K", () => {
  it("markiert related-Chips im Modus Notiz", async () => {
    const vm = await buildPanelViewModel("note", snap, new Set(), {
      ...opts, content: { read: () => Promise.resolve("x") }, hits: { kind: "ok", paths: ["Notes/Similar.md"] },
    });
    const chip = vm.sections.find((s) => s.id === "note")?.chips.find((c) => c.source === "related");
    expect(chip?.hint).toContain("ähnlich");
  });
  it("zeigt den K-Stepper nur in Notiz und Vault", async () => {
    expect((await buildPanelViewModel("note", snap, new Set(), opts)).autoK).toBe(5);
    expect((await buildPanelViewModel("tabs", snap, new Set(), opts)).autoK).toBeNull();
    expect((await buildPanelViewModel("workspace", snap, new Set(), opts)).autoK).toBeNull();
  });
  it("jeder Abschnitt hat ein note-Feld (leer, wenn nichts zu sagen ist)", async () => {
    const vm = await buildPanelViewModel("workspace", snap, new Set(), opts);
    for (const s of vm.sections) expect(s.note).toBe("");
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/context_panel_vm.test.ts` → FAIL.

- [ ] **Step 3: Implementieren** — in `src/core/context/panel-vm.ts`:

- Import: `import { MIN_QUERY_CHARS, NO_HITS, semanticNotice, type SemanticHits } from "./semantic";`
- `PanelSection` bekommt `/** Eine Zeile ueber den Chips — z. B. warum der Vault-Abschnitt leer ist. "" = keine. */ note: string;`
- `PanelViewModel` bekommt `/** Trefferzahl fuer den K-Stepper; `null` ausserhalb von Notiz und Vault. */ autoK: number | null;`
- `PanelOptions` bekommt `autoK: number;`, `/** vault-rag-Ergebnis fuer Vault-Treffer bzw. Nachbarn. */ hits?: SemanticHits;`, `/** Der Entwurf im Eingabefeld — nur fuer den Hinweis „Tippe eine Frage". */ query?: string;`
- In beiden `T`-Tabellen ergänzen — DE: `vault: "Vault", related: "ähnlich", vaultQuery: "Tippe eine Frage (ab 3 Zeichen) — passende Notizen erscheinen hier.", vaultNone: "Keine passenden Notizen im Index."`; `manualOff` auf `"wirkt in den Modi Notiz, Alle Tabs und Vault"` erweitern. EN: `vault: "Vault", related: "similar", vaultQuery: "Type a question (3 characters or more) — matching notes appear here.", vaultNone: "No matching notes in the index."`, `manualOff: "takes effect in the Note, All tabs and Vault modes"`. (Sucht ein bestehender Test den alten `manualOff`-Wortlaut, zieht er mit.)
- `workspaceSection` und `manualSection` geben zusätzlich `note: ""` zurück.
- `sourceSection` bekommt den Modus `"vault"` und setzt den Hinweis je Quelle:

```ts
function sourceSection(
  mode: "note" | "tabs" | "vault",
  kandidaten: readonly Candidate[],
  manual: ReadonlySet<string>,
  off: ReadonlySet<SelectionKey>,
  groessen: ReadonlyMap<string, { chars: number }>,
  t: (typeof T)[keyof typeof T],
  note: string,
): PanelSection {
  const chips: PanelChip[] = kandidaten
    .filter((c) => !manual.has(c.path))
    .map((c) => {
      const chipOff = off.has(itemKey(c.source, c.path));
      const groesse = groessen.get(`${c.source}:${c.path}`);
      const teile: string[] = [];
      if (groesse !== undefined) teile.push(t.chars(groesse.chars));
      if (c.depth !== undefined) teile.push(t.level(c.depth));
      if (c.source === "related") teile.push(t.related);
      return {
        source: c.source, path: c.path, label: chipLabel(c.path),
        hint: teile.join(", "), off: chipOff, removable: false,
      };
    });
  const id = mode;
  const title = mode === "note" ? t.note : mode === "tabs" ? t.tabs : t.vault;
  const empty = mode === "note" ? t.emptyNote : mode === "tabs" ? t.emptyTabs : "";
  return { id, title, chips, empty: chips.length === 0 ? empty : "", note };
}
```

(Im Modus Vault ist `empty` bewusst `""`: das Warum steht in `note`, eine zweite leere Zeile darunter wäre doppelt.)

- Neue Hilfsfunktion:

```ts
/** Was der Vault-Abschnitt ueber seine Treffer sagt. Nur Vault meldet sich — die Nachbarn im
 *  Modus Notiz sind eine Zugabe und schweigen (Etappe-3-Zuschnitt Punkt 4). */
function vaultNote(hits: SemanticHits, query: string, lang: "de" | "en", t: (typeof T)[keyof typeof T]): string {
  if (hits.kind === "failed") return semanticNotice(hits.reason, lang);
  if (query.trim().length < MIN_QUERY_CHARS) return t.vaultQuery;
  if (hits.kind === "ok" && hits.paths.length === 0) return t.vaultNone;
  return "";
}
```

- In `buildPanelViewModel`: Signatur `mode: Exclude<ContextMode, "off">`; `const hits = opts.hits ?? NO_HITS;`. Im `else`-Zweig `buildFullContext({ …, hits })` und `collectCandidates({ …, semantic: hits.kind === "ok" ? hits.paths : [] })`; `sourceSection(mode, kandidaten, manualSet, off, groessen, t, mode === "vault" ? vaultNote(hits, opts.query ?? "", opts.lang, t) : "")`. Im Rückgabeobjekt `autoK: mode === "note" || mode === "vault" ? opts.autoK : null,`.

- [ ] **Step 4:** `npx vitest run tests/context_panel_vm.test.ts tests/context_panel_visibility.test.ts` → PASS. (`context_panel_visibility` baut womöglich eigene `PanelOptions`/`PanelSection`-Objekte — dort `autoK: 5` bzw. `note: ""` ergänzen, falls der Typecheck es verlangt.)

- [ ] **Step 5: Commit**

```bash
git add src/core/context/panel-vm.ts tests/context_panel_vm.test.ts tests/context_panel_visibility.test.ts
git commit -m "feat(context): Kontext-Tab mit Vault-Abschnitt, Hinweiszeile und Trefferzahl"
```

---

### Task 7: Verdrahtung — Frage, Debounce, K-Stepper, `currentContext(query)`

**Files:**
- Modify: `src/main.ts`, `src/obsidian/view.ts`, `src/obsidian/context-panel.ts`, `src/i18n/strings.ts`, `styles.css`

**Interfaces:**
- Consumes: `fetchSemanticHits` (Task 2), `buildFullContext` mit `mode: "vault"`/`hits` (Task 4), `buildPanelViewModel` mit `autoK`/`hits`/`query` (Task 6), `vaultAvailable` (Task 5)
- Produces:
  - `KodaPlugin.contextQuery: string`, `setContextQuery(q: string): void`, `setContextAutoK(n: number): void`
  - `KodaPlugin.currentContext(query?: string): Promise<ContextAttachment | null>` — `ask(question)` ruft `currentContext(question)`
  - `ContextPanelHost.setAutoK(n: number): void`

Kein eigener Unit-Test: diese Schicht fasst Obsidian an. Belegt wird sie durch die Prüfpunkte 42–45 (Task 8). Die puren Teile sind in Tasks 2–6 getestet.

- [ ] **Step 1: `main.ts`**

Imports ergänzen: `fetchSemanticHits, type SemanticHits` aus `./core/context/semantic`, `CONTEXT_AUTO_K_MIN, CONTEXT_AUTO_K_MAX` aus `./core/settings-types`, `WorkspaceSnapshot` (Typ) aus `./core/context/ports`.

Neben `contextManual`:

```ts
  /** Der Entwurf im Eingabefeld, entprellt aus der View gemeldet. Speist NUR die Vorschau im
   *  Kontext-Tab — gesendet wird mit dem echten Nachrichtentext (`ask(question)`), sonst
   *  haette wer vor Ablauf der Verzoegerung sendet, Treffer zu einem halben Satz im Block
   *  (Etappe-3-Zuschnitt Punkt 2). */
  contextQuery = "";

  setContextQuery(q: string): void {
    if (q === this.contextQuery) return;
    this.contextQuery = q;
    // Nur der Vault-Modus haengt an der Frage — in allen anderen waere ein Neuzeichnen je
    // Tastendruck reine Arbeit ohne sichtbare Aenderung.
    if (this.contextMode === "vault") for (const v of this.views()) v.syncContextPanel();
  }

  /** vault-rag fragen, falls der Modus es verlangt. Ein Weg fuer Vorschau und Senden. */
  private semanticHits(mode: ContextMode, query: string, snap: WorkspaceSnapshot): Promise<SemanticHits> {
    return fetchSemanticHits(readRetrievalApi(this.app), {
      mode, query, activePath: snap.active?.path ?? null, k: this.settings.contextAutoK,
    });
  }

  setContextAutoK(n: number): void {
    const geklemmt = Math.min(CONTEXT_AUTO_K_MAX, Math.max(CONTEXT_AUTO_K_MIN, Math.round(n)));
    if (geklemmt === this.settings.contextAutoK) return;
    this.settings.contextAutoK = geklemmt;
    void this.saveSettings();
    for (const v of this.views()) v.syncContextPanel();
  }
```

`contextViewModel` wird `async` und reicht Modus Vault, Treffer, K und Frage durch:

```ts
  async contextViewModel(): Promise<PanelViewModel> {
    const s = this.settings;
    const modus = this.contextMode === "off" ? "workspace" : this.contextMode;
    const snap = readWorkspace(this.app, VIEW_TYPE_KODA);
    const hits = await this.semanticHits(modus, this.contextQuery, snap);
    return buildPanelViewModel(modus, snap, this.contextOff, {
      lang: this.promptLang(),
      selectionMax: s.contextSelectionChars,
      tabsMax: s.contextTabsMax,
      frontmatterMax: s.contextFrontmatterChars,
      windowTokens: s.contextWindowTokens,
      budget: s.contextBudgetChars,
      linkDepth: s.contextLinkDepth,
      autoK: s.contextAutoK,
      hits,
      query: this.contextQuery,
      manual: this.contextManual,
      links: linkPort(this.app),
      content: contentPort(this.app),
    });
  }
```

`currentContext` bekommt den Parameter; der Zweig `note`/`tabs` wird um `vault` erweitert, der `default`-Zweig mit dem Etappe-3-Kommentar entfällt:

```ts
  async currentContext(query?: string): Promise<ContextAttachment | null> {
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
      case "vault":
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
          // `query` fehlt nur beim GUI-Smoke und bei gui:ask ohne Frage — dann gilt der Entwurf.
          hits: await this.semanticHits(this.contextMode, query ?? this.contextQuery, snap),
        });
    }
  }
```

Im Doc-Kommentar von `currentContext` einen Satz ergänzen: „`query` ist die Frage, die gerade gesendet wird; der Vault-Modus sucht mit ihr, nicht mit dem Entwurf.“ In `ask` die Zeile `const ctx = await this.currentContext();` ersetzen durch `const ctx = await this.currentContext(question);`.

- [ ] **Step 2: `view.ts` — Debounce am Eingabefeld**

Feld und Konstante:

```ts
// uebernommen aus vault-rag/src/chat_view.ts:103-106 (scheduleQuery, 400 ms), 2026-09-18
const CONTEXT_QUERY_DEBOUNCE_MS = 400;
```

(auf Modulebene), dazu in der Klasse `private queryTimer: number | null = null;`.

In `mountChat` nach dem `keydown`-Listener:

```ts
    // Der Entwurf speist die Vault-Vorschau im Kontext-Tab — entprellt, damit nicht jeder
    // Tastendruck eine Embedding-Anfrage ausloest. Der Generationszaehler im Panel verwirft
    // eine verspaetete Antwort, falls die Anfragen sich ueberholen.
    this.inputEl.addEventListener("input", () => {
      if (this.queryTimer !== null) window.clearTimeout(this.queryTimer);
      this.queryTimer = window.setTimeout(() => {
        this.queryTimer = null;
        this.plugin.setContextQuery(this.inputEl.value);
      }, CONTEXT_QUERY_DEBOUNCE_MS);
    });
```

`send()`:

```ts
  private send(): void {
    const q = this.inputEl.value.trim();
    if (q === "" || this.plugin.busy) return;
    this.inputEl.value = "";
    if (this.queryTimer !== null) { window.clearTimeout(this.queryTimer); this.queryTimer = null; }
    void this.plugin.ask(q);
    // Nach dem Start von ask(): der Block ist mit `q` gebaut, der Entwurf ist jetzt leer.
    this.plugin.setContextQuery("");
  }
```

`onClose()` räumt den Timer: vor `this.hub?.destroy();` die Zeile `if (this.queryTimer !== null) { window.clearTimeout(this.queryTimer); this.queryTimer = null; }` einfügen.

Im `ContextPanel`-Host-Objekt: `setAutoK: (n) => { this.plugin.setContextAutoK(n); },`.

- [ ] **Step 3: `context-panel.ts` — Stepper-Helfer, K-Stepper, Hinweiszeile**

`ContextPanelHost` um `setAutoK(n: number): void;` ergänzen.

Den bestehenden Tiefe-Stepper-Block (`if (vm.depth !== null) { … }`) durch einen privaten Helfer ersetzen und zweimal nutzen:

```ts
  /** Ein Stepper „Beschriftung − n +". Zwei Exemplare (Link-Tiefe, Trefferzahl) — derselbe
   *  Aufbau samt aria-label und Tastaturbedienung, deshalb EINE Methode. */
  private stepper(body: HTMLElement, label: string, value: number, decAria: string, incAria: string, onStep: (n: number) => void): void {
    const wrap = body.createDiv({ cls: "koda-ctx-depth" });
    wrap.createSpan({ text: label });
    const knopf = (text: string, aria: string, ziel: number): void => {
      const b = wrap.createEl("button", { text });
      b.setAttribute("role", "button");
      b.setAttribute("tabindex", "0");
      b.setAttribute("aria-label", aria);
      b.addEventListener("click", () => { onStep(ziel); });
      b.addEventListener("keydown", (evt: KeyboardEvent) => {
        if (evt.key === "Enter" || evt.key === " ") { evt.preventDefault(); onStep(ziel); }
      });
    };
    knopf("−", decAria, value - 1);
    wrap.createSpan({ text: String(value) });
    knopf("+", incAria, value + 1);
  }
```

In `paint` statt des alten Blocks:

```ts
    if (vm.depth !== null) {
      this.stepper(body, t("context.depth"), vm.depth, t("context.depthDec"), t("context.depthInc"), (n) => { this.host.setDepth(n); });
    }
    if (vm.autoK !== null) {
      this.stepper(body, t("context.autoK"), vm.autoK, t("context.autoKDec"), t("context.autoKInc"), (n) => { this.host.setAutoK(n); });
    }
```

(Die Reihenfolge der Knöpfe und ihre Beschriftung bleiben wie vorher: `−`, Zahl, `+`. Die CSS-Klasse `koda-ctx-depth` gilt für beide Stepper — ein Aussehen, keine neue Regel.)

In der Abschnittsschleife direkt nach `const inner = collapsibleSection(…);`:

```ts
      if (sec.note !== "") inner.createDiv({ cls: "koda-ctx-note", text: sec.note });
```

- [ ] **Step 4: Strings und CSS**

`src/i18n/strings.ts` — EN: `"context.autoK": "Notes from vault-rag"`, `"context.autoKDec": "Fewer notes from vault-rag"`, `"context.autoKInc": "More notes from vault-rag"` · DE: `"context.autoK": "Notizen aus vault-rag"`, `"context.autoKDec": "Weniger Notizen aus vault-rag"`, `"context.autoKInc": "Mehr Notizen aus vault-rag"`.

`styles.css`, nach `.koda-ctx-depth button { … }`:

```css
.koda-ctx-note { font-size: var(--font-ui-smaller); color: var(--text-muted); margin: var(--size-2-1) 0; }
```

- [ ] **Step 5: Gate**

Run: `npm run gate` → 0 Errors, 0 Warnings, alle Tests grün.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/obsidian/view.ts src/obsidian/context-panel.ts src/i18n/strings.ts styles.css
git commit -m "feat(context): Vault-Modus verdrahtet — Suche beim Senden, entprellte Vorschau, Trefferzahl im Kontext-Tab"
```

---

### Task 8: GUI-Smoke 42–45, Doku, Abschluss 3a

**Files:**
- Modify: `scripts/gui-smoke.ts` (neue Prüfpunkte direkt nach Punkt 41, vor dem äußeren `} finally {`)
- Modify: `docs/SMOKE.md`, `CHANGELOG.md` (`## [Unreleased]` → `### Added`), `README.md` (Modi-Liste und Einstellungstabelle), `CLAUDE.md` (Abschnitt `npm run smoke:gui`: Zahl 41 → 45 und die vier neuen Punkte), `docs/images/fixture/README.md` (nichts Neues nötig, nur prüfen)

Alle vier Punkte benutzen einen **Stub** der vault-rag-API unter `app.plugins.plugins["vault-retrieval"]` (Muster: Punkt 41, llm-lab-Stub). Die Gründe sind dieselben wie dort: Der Punkt prüft Kodas Seite der Naht, nicht vault-rags Treffergüte, und ein echter Index im Staging-Vault wäre nicht deterministisch. Existiert dort bereits ein Eintrag (echtes Plugin oder Rest eines Laufs), werden die Punkte **übersprungen und als übersprungen gemeldet**, nicht grün gemeldet.

- [ ] **Step 1: Baseline** — Zweitinstanz nach Rahmenregel 6 starten, Lock nehmen, `npm run smoke:gui -- --vault koda-agent --port <port>` fahren. Erwartung: **41/41**. Die Zahl in die Auftragsnote eintragen.

- [ ] **Step 2: Stub-Helfer und Prüfpunkte** — in `scripts/gui-smoke.ts` nach Punkt 41 einfügen:

```ts
    // ── 42–45: Etappe 3a — vault-rag als Quelle (Stub, Muster Punkt 41) ─────────────────
    // Der Stub erfuellt `readRetrievalApi` (apiVersion 1, status/search/related als Funktionen)
    // und protokolliert jede Anfrage in window.__kodaRagSeen. `window.__kodaRagFail` schaltet
    // search() auf { ok:false, reason:"offline" } — die Gegenprobe fuer den Hinweis im Block.
    const ragVorher = await cdp.evaluate<boolean>(`return !!app.plugins.plugins["vault-retrieval"];`);
    const installRagStub = (): Promise<unknown> => cdp.evaluate(`
      window.__kodaRagSeen = [];
      window.__kodaRagFail = false;
      app.plugins.plugins["vault-retrieval"] = {
        __kodaSmokeStub: true,
        api: {
          apiVersion: 1,
          status: () => ({ apiVersion: 1, indexed: true, noteCount: 4, reindexing: false }),
          search: async (q, o) => {
            window.__kodaRagSeen.push({ op: "search", q, k: o && o.k });
            return window.__kodaRagFail
              ? { ok: false, reason: "offline" }
              : { ok: true, hits: [{ path: "Notes/Compaction.md", score: 0.9 }] };
          },
          related: async (p, o) => {
            window.__kodaRagSeen.push({ op: "related", p, k: o && o.k });
            return { ok: true, hits: [{ path: "Koda/Memory.md", score: 0.8 }] };
          },
        },
      };
      return true;
    `);
    const removeRagStub = (): Promise<unknown> => cdp.evaluate(`
      if (app.plugins.plugins["vault-retrieval"]?.__kodaSmokeStub) delete app.plugins.plugins["vault-retrieval"];
      delete window.__kodaRagSeen; delete window.__kodaRagFail;
      return true;
    `).catch(() => undefined);

    if (ragVorher) {
      const grund = "uebersprungen — ein vault-retrieval-Eintrag existiert bereits (echtes Plugin oder Rest eines abgebrochenen Laufs); Stub wuerde ihn ueberschreiben";
      record("42. Modus Vault: Treffer zur gesendeten Frage im Volltext, Fehlschlag meldet sich", true, grund);
      record("43. Modus Vault ist ohne vault-rag gesperrt (Dropdown und Befehl)", true, grund);
      record("44. Modus Notiz: semantische Nachbarn aus related(), K = 0 schaltet ab", true, grund);
      record("45. Kontext-Tab: Vault-Vorschau folgt dem Entwurf im Eingabefeld (entprellt)", true, grund);
    } else {
      // ── 42 ──
      let ok42 = false; let detail42 = "";
      try {
        await installRagStub();
        const r = await cdp.evaluate<{ mode: string; items: string[]; seen: { op: string; q: string; k: number }[]; k: number; failText: string; failItems: string[] }>(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.setContextMode("vault");
          const frage = "Wie funktioniert die Verdichtung?";
          const ctx = await p.currentContext(frage);
          window.__kodaRagFail = true;
          const fail = await p.currentContext(frage);
          return {
            mode: ctx?.mode ?? "",
            items: (ctx?.items ?? []).map((i) => i.source + ":" + i.path + ":" + i.kind),
            seen: window.__kodaRagSeen,
            k: p.settings.contextAutoK,
            failText: fail?.text ?? "",
            failItems: (fail?.items ?? []).map((i) => i.source + ":" + i.path),
          };
        `);
        const suche = r.seen.find((s) => s.op === "search");
        ok42 = r.mode === "vault"
          && r.items.includes("vault:Notes/Compaction.md:full")
          && suche?.q === "Wie funktioniert die Verdichtung?" && suche.k === r.k
          && /Vault-Suche nicht verfügbar|Vault search unavailable/.test(r.failText)
          && !r.failItems.some((i) => i.startsWith("vault:"));
        detail42 = `Modus ${r.mode} · Eintraege ${r.items.join(", ")} · Suche „${suche?.q ?? "—"}" k=${String(suche?.k)} · Gegenprobe offline: ${/nicht verfügbar|unavailable/.test(r.failText) ? "Hinweis im Block" : "KEIN Hinweis"}`;
      } catch (error) {
        detail42 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      }
      record("42. Modus Vault: Treffer zur gesendeten Frage im Volltext, Fehlschlag meldet sich", ok42, detail42);

      // ── 43 ── (Stub steht noch: erst MIT, dann OHNE vault-rag messen)
      let ok43 = false; let detail43 = "";
      try {
        const mit = await cdp.evaluate<boolean>(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          for (const v of app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})) v.view.syncContextMode();
          const opt = document.querySelector('.koda-input-bar select.koda-mode option[value="vault"]');
          return opt !== null && opt.disabled === false;
        `);
        await removeRagStub();
        const ohne = await cdp.evaluate<{ disabled: boolean; label: string; modeNachBefehl: string }>(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.setContextMode("workspace");
          p.setContextMode("vault");
          const opt = document.querySelector('.koda-input-bar select.koda-mode option[value="vault"]');
          return { disabled: opt?.disabled === true, label: opt?.textContent ?? "", modeNachBefehl: p.contextMode };
        `);
        ok43 = mit && ohne.disabled && ohne.modeNachBefehl === "workspace" && /vault-rag/.test(ohne.label);
        detail43 = `mit Stub waehlbar: ${String(mit)} · ohne: gesperrt ${String(ohne.disabled)} („${ohne.label}"), Befehl laesst Modus auf „${ohne.modeNachBefehl}"`;
      } catch (error) {
        detail43 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      }
      record("43. Modus Vault ist ohne vault-rag gesperrt (Dropdown und Befehl)", ok43, detail43);

      // ── 44 ──
      let ok44 = false; let detail44 = "";
      try {
        await installRagStub();
        const r = await cdp.evaluate<{ mit: string[]; ohne: string[]; seenRelated: boolean }>(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          const file = app.vault.getFileByPath("Notes/Project plan.md");
          await app.workspace.getLeaf(false).openFile(file);
          p.setContextMode("note");
          const kVorher = p.settings.contextAutoK;
          const mit = await p.currentContext();
          p.settings.contextAutoK = 0;
          const ohne = await p.currentContext();
          p.settings.contextAutoK = kVorher;
          return {
            mit: (mit?.items ?? []).map((i) => i.source + ":" + i.path),
            ohne: (ohne?.items ?? []).map((i) => i.source + ":" + i.path),
            seenRelated: window.__kodaRagSeen.some((s) => s.op === "related" && s.p === "Notes/Project plan.md"),
          };
        `);
        ok44 = r.seenRelated && r.mit.includes("related:Koda/Memory.md") && !r.ohne.some((i) => i.startsWith("related:"));
        detail44 = `related() fuer die aktive Notiz: ${String(r.seenRelated)} · mit K: ${r.mit.join(", ")} · K=0: ${r.ohne.join(", ")}`;
      } catch (error) {
        detail44 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      }
      record("44. Modus Notiz: semantische Nachbarn aus related(), K = 0 schaltet ab", ok44, detail44);

      // ── 45 ──
      let ok45 = false; let detail45 = "";
      try {
        await cdp.evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.setContextMode("vault");
          window.__kodaRagSeen = [];
          const view = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0].view;
          view.setTab("context");
          const input = view.containerEl.querySelector("textarea.koda-input");
          input.value = "Welche Werkzeuge hat Koda?";
          input.dispatchEvent(new Event("input"));
          return true;
        `);
        const r = await pollUntil<{ chips: string[]; queries: string[] }>(cdp, `
          const view = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0].view;
          const chips = [...view.containerEl.querySelectorAll(".koda-ctx-chip")].map((c) => c.getAttribute("title"));
          const queries = (window.__kodaRagSeen || []).filter((s) => s.op === "search").map((s) => s.q);
          return chips.includes("Notes/Compaction.md") ? { chips, queries } : null;
        `, 5_000);
        ok45 = r !== null && r.queries.includes("Welche Werkzeuge hat Koda?");
        detail45 = r === null
          ? "kein Vault-Chip binnen 5 s nach dem Tippen"
          : `Chips ${r.chips.join(", ")} · Suchen ${r.queries.map((q) => `„${q}"`).join(", ")}`;
      } catch (error) {
        detail45 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        await cdp.evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          const view = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0].view;
          const input = view.containerEl.querySelector("textarea.koda-input");
          if (input) input.value = "";
          p.setContextQuery("");
          p.setContextMode("workspace");
          view.setTab("chat");
          return true;
        `).catch(() => undefined);
        await removeRagStub();
      }
      record("45. Kontext-Tab: Vault-Vorschau folgt dem Entwurf im Eingabefeld (entprellt)", ok45, detail45);
    }
```

Den Kopfkommentar des Treibers (Liste der Punkte ~Zeile 100–140) um die vier Punkte ergänzen.

- [ ] **Step 3: Lauf und Gegenproben** — `npm run smoke:gui -- --vault koda-agent --port <port>` → Erwartung **45/45**. Danach für jeden neuen Punkt eine Gegenprobe (CORE-TEST-01: ein Prüfpunkt, der nicht rot werden kann, belegt nichts). Jede Mutation einzeln einbauen, bauen mit `node esbuild.config.mjs production` (nicht `npm run build`, siehe Handoff-Kontext), Punkt muss **rot** werden, Mutation zurücknehmen:
  - 42: in `build.ts` den `notice` fest auf `undefined` setzen → 42 rot.
  - 43: in `main.ts` den `vaultAvailable`-Guard in `setContextMode` auskommentieren → 43 rot.
  - 44: in `candidates.ts` die `related`-Schleife auskommentieren → 44 rot.
  - 45: in `view.ts` den `input`-Listener auskommentieren → 45 rot.
  
  Ergebnis (rot/grün je Mutation) in `docs/SMOKE.md` unter einem neuen Abschnitt „Belegter Lauf: <Datum> — Etappe 3a“ festhalten, samt Obsidian-Version der Zweitinstanz und Port. Lock sofort nach dem letzten Lauf freigeben, Zweitinstanz beenden.

- [ ] **Step 4: Doku**
  - `CHANGELOG.md` unter `## [Unreleased]` → `### Added`: ein Eintrag für den **Vault-Modus**: Treffer von vault-rag zur gesendeten Frage im Volltext, Vorschau im Kontext-Tab während des Tippens, Hinweis im Block, wenn die Suche nicht verfügbar ist, gesperrt ohne vault-rag. Ein zweiter für die **semantischen Nachbarn** im Modus Notiz. Dazu die Einstellung **„Notizen aus vault-rag“** (0–20, Default 5, 0 = aus) und der Stepper im Kontext-Tab.
  - `README.md`: in der Modi-Liste (um Zeile 59) Vault ergänzen. Die Tabellenzeile „Context mode on startup“ (Zeile 200) ohne „(Vault reserved for a later stage)“, dazu eine Zeile für „Notes from vault-rag“.
  - `CLAUDE.md`: Abschnitt `npm run smoke:gui` von „41 Punkte“ auf „45 Punkte“ und die vier neuen Punkte in einem Satz, nach dem Muster der bestehenden Einträge.

- [ ] **Step 5: Gate + Commit + Push**

```bash
npm run gate && git add scripts/gui-smoke.ts docs/SMOKE.md CHANGELOG.md README.md CLAUDE.md && git commit -m "test(smoke): Pruefpunkte 42-45 fuer Vault-Modus und semantische Nachbarn (Etappe 3a)" && git push origin main && git push github main
```

- [ ] **Step 6: Halt.** Etappe 3a ist releasefähig. **Kein Release ohne Freigabe.** Melde dem Master Gate und Smoke vorher/nachher (in vier Zuständen), die Commits und die Gegenproben. Erst danach geht es mit Teil 3b weiter.

---

# Teil 3b — Bases-Ansicht „Koda-Kontext"

### Task 9: `bases.ts` — Schnappschuss, Form, Tabelle, Liste

**Files:**
- Create: `src/core/context/bases.ts`
- Test: `tests/context_bases.test.ts`

**Interfaces:**
- Produces:
  - `BASE_FORMS = ["table", "notes", "both"] as const`, `type BaseForm`
  - `interface BaseRow { path: string; group: string | null; values: (string | null)[] }`
  - `interface BaseSnapshot { id: string; basePath: string; viewName: string; takenAt: string; form: BaseForm; columns: string[]; rows: BaseRow[] }`
  - `normalizeForm(raw: unknown): BaseForm`
  - `formatStamp(d: Date): string` → `"YYYY-MM-DD HH:MM"` (lokale Zeit)
  - `snapshotId(basePath: string, viewName: string): string`
  - `upsertBase(list, snap): BaseSnapshot[]`, `removeBase(list, id): BaseSnapshot[]` — beide geben bei „nichts geändert“ die Eingangsliste zurück (Referenzgleichheit wie `manual.ts`)
  - `basePaths(list): string[]` — Zeilenpfade aller Schnappschüsse mit Form `notes`/`both`, entdoppelt, in Reihenfolge
  - `interface TableRender { blocks: string[]; items: ContextItem[]; used: number }`
  - `renderTables(list, budget: number, lang): TableRender` — nur Form `table`/`both`
  - `withBaseTables(ctx: ContextAttachment, tables: TableRender): ContextAttachment`

- [ ] **Step 1: Failing tests** — `tests/context_bases.test.ts`:

```ts
/* Bases als Kontextquelle — der pure Kern. Die Fallen aus dem Spike (docs/LAB.md) sind hier
 * schon im Adapter erledigt: fehlende Werte kommen als null an, nie als "null". */
import { describe, it, expect } from "vitest";
import {
  basePaths, formatStamp, normalizeForm, removeBase, renderTables, snapshotId, upsertBase, withBaseTables,
  type BaseSnapshot,
} from "../src/core/context/bases";

function snap(over: Partial<BaseSnapshot> = {}): BaseSnapshot {
  return {
    id: snapshotId("Notes/Koda context.base", "Context table"),
    basePath: "Notes/Koda context.base",
    viewName: "Context table",
    takenAt: "2026-09-18 14:02",
    form: "table",
    columns: ["Status", "Owner"],
    rows: [
      { path: "Notes/Tools.md", group: null, values: ["active", null] },
      { path: "Notes/Compaction.md", group: null, values: ["note | draft", null] },
    ],
    ...over,
  };
}

describe("normalizeForm — der Default steht im Lesecode (Spike-Nachzug 1)", () => {
  it("liefert table fuer undefined, Unsinn und Nicht-Strings", () => {
    expect(normalizeForm(undefined)).toBe("table");
    expect(normalizeForm("tabelle")).toBe("table");
    expect(normalizeForm(3)).toBe("table");
  });
  it("uebernimmt gueltige Werte", () => {
    expect(normalizeForm("notes")).toBe("notes");
    expect(normalizeForm("both")).toBe("both");
  });
});

describe("formatStamp", () => {
  it("formatiert lokale Zeit auf Minuten", () => {
    expect(formatStamp(new Date(2026, 8, 18, 9, 5))).toBe("2026-09-18 09:05");
  });
});

describe("upsertBase / removeBase", () => {
  it("ersetzt einen Schnappschuss derselben Ansicht, statt einen zweiten anzulegen", () => {
    const a = snap();
    const b = snap({ takenAt: "2026-09-18 15:00" });
    const liste = upsertBase(upsertBase([], a), b);
    expect(liste).toHaveLength(1);
    expect(liste[0]?.takenAt).toBe("2026-09-18 15:00");
  });
  it("gibt bei nichts zu entfernen die Eingangsliste zurueck (Referenz)", () => {
    const liste = [snap()];
    expect(removeBase(liste, "gibt-es-nicht")).toBe(liste);
    expect(removeBase(liste, liste[0]!.id)).toEqual([]);
  });
});

describe("basePaths", () => {
  it("nimmt nur Schnappschuesse mit notes/both, entdoppelt", () => {
    const t = snap();
    const n = snap({ id: "n", form: "notes", rows: [{ path: "Notes/Tools.md", group: null, values: [] }, { path: "X.md", group: null, values: [] }] });
    const b = snap({ id: "b", form: "both", rows: [{ path: "X.md", group: null, values: [] }] });
    expect(basePaths([t, n, b])).toEqual(["Notes/Tools.md", "X.md"]);
  });
});

describe("renderTables", () => {
  it("rendert Kopf mit Stand, Notiz-Spalte zuerst, leere Zelle fuer fehlende Werte — nie das Wort null", () => {
    const r = renderTables([snap()], 10_000, "de");
    const text = r.blocks.join("\n\n");
    expect(text).toContain("## Base: Notes/Koda context.base · Context table (Stand 2026-09-18 14:02)");
    expect(text).toContain("| Notiz | Status | Owner |");
    expect(text).toContain("| Notes/Tools.md | active |  |");
    expect(text).not.toMatch(/\bnull\b/);
    expect(text).toContain("note \\| draft");
    expect(r.items).toEqual([{ source: "base", path: "Notes/Koda context.base", kind: "table", via: snap().id, chars: text.length }]);
    expect(r.used).toBe(text.length);
  });
  it("laesst Form notes aus", () => {
    expect(renderTables([snap({ form: "notes" })], 10_000, "de").blocks).toEqual([]);
  });
  it("kuerzt zeilenweise und nennt beide Zahlen", () => {
    const viele = snap({ rows: Array.from({ length: 50 }, (_, i) => ({ path: `N${i}.md`, group: null, values: ["x", "y"] })) });
    const r = renderTables([viele], 400, "de");
    const text = r.blocks.join("\n\n");
    expect(text.length).toBeLessThanOrEqual(400);
    expect(text).toMatch(/\[gekürzt: \d+ von 50 Zeilen/);
    expect(r.items[0]?.fullChars).toBeGreaterThan(r.items[0]!.chars);
  });
  it("rendert Gruppen als Zwischenueberschriften", () => {
    const g = snap({ rows: [
      { path: "A.md", group: "active", values: ["a", null] },
      { path: "B.md", group: null, values: ["b", null] },
    ] });
    const text = renderTables([g], 10_000, "de").blocks.join("\n");
    expect(text).toContain("### active");
    expect(text).toContain("### (ohne Wert)");
  });
  it("teilt das Budget: die zweite Tabelle bekommt nur den Rest", () => {
    const r = renderTables([snap(), snap({ id: "zwei" })], 10_000, "de");
    expect(r.used).toBe(r.blocks.join("").length);
    expect(r.blocks).toHaveLength(2);
  });
});

describe("withBaseTables", () => {
  it("haengt Bloecke und Items an einen bestehenden Kontext", () => {
    const r = renderTables([snap()], 10_000, "en");
    const ctx = withBaseTables({ mode: "workspace", items: [{ source: "active", path: "A.md", kind: "pointer", chars: 3 }], text: "[Working context · Workspace]" }, r);
    expect(ctx.text.startsWith("[Working context · Workspace]\n\n## Base:")).toBe(true);
    expect(ctx.items.map((i) => i.source)).toEqual(["active", "base"]);
  });
  it("aendert ohne Tabellen nichts (Referenz)", () => {
    const ctx = { mode: "workspace" as const, items: [], text: "x" };
    expect(withBaseTables(ctx, { blocks: [], items: [], used: 0 })).toBe(ctx);
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/context_bases.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: Implementieren** — `src/core/context/bases.ts`:

```ts
/* Bases als Kontextquelle (Spec E7, Etappe 3b). Pure: Obsidians Bases-Objekte erreichen
 * diesen Kern nie. Der Adapter (src/obsidian/bases-view.ts) kopiert beim Uebernehmen Pfade
 * und Zeichenketten — alte BasesEntry liefern nach einem Update still veraltete Werte
 * (docs/LAB.md, Spike-Falle 4). Fehlende Werte kommen hier als `null` an; das Wort „null"
 * (NullValue.toString(), Falle 1) darf nie in einen Block.
 *
 * Schnappschuss statt Live-Abo (Etappe-3-Zuschnitt Punkt 5): eine Base im Hintergrund
 * liefert keine Updates (Falle 3) — der Zeitstempel sagt, welchen Stand der Block zeigt. */
import type { ContextAttachment, ContextItem } from "./types";

export const BASE_FORMS = ["table", "notes", "both"] as const;
export type BaseForm = (typeof BASE_FORMS)[number];

export interface BaseRow {
  path: string;
  /** Anzeigetext des groupBy-Werts; null = keine Gruppierung oder Zeile ohne Wert. */
  group: string | null;
  /** Je Spalte der Anzeigetext; null = Wert fehlt. */
  values: (string | null)[];
}

export interface BaseSnapshot {
  /** Ein Schnappschuss je Ansicht: `snapshotId(basePath, viewName)`. */
  id: string;
  basePath: string;
  viewName: string;
  /** Lokal, `formatStamp`. */
  takenAt: string;
  form: BaseForm;
  columns: string[];
  rows: BaseRow[];
}

export function normalizeForm(raw: unknown): BaseForm {
  return typeof raw === "string" && (BASE_FORMS as readonly string[]).includes(raw) ? (raw as BaseForm) : "table";
}

export function formatStamp(d: Date): string {
  const zwei = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())} ${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
}

export function snapshotId(basePath: string, viewName: string): string {
  return `${basePath} · ${viewName}`;
}

export function upsertBase(list: readonly BaseSnapshot[], snap: BaseSnapshot): BaseSnapshot[] {
  const i = list.findIndex((b) => b.id === snap.id);
  if (i === -1) return [...list, snap];
  const next = [...list];
  next[i] = snap;
  return next;
}

export function removeBase(list: readonly BaseSnapshot[], id: string): BaseSnapshot[] {
  return list.some((b) => b.id === id) ? list.filter((b) => b.id !== id) : (list as BaseSnapshot[]);
}

export function basePaths(list: readonly BaseSnapshot[]): string[] {
  const out: string[] = [];
  const gesehen = new Set<string>();
  for (const b of list) {
    if (b.form === "table") continue;
    for (const r of b.rows) {
      if (gesehen.has(r.path)) continue;
      gesehen.add(r.path);
      out.push(r.path);
    }
  }
  return out;
}

type Lang = "de" | "en";
const T = {
  de: {
    head: (b: BaseSnapshot) => `## Base: ${b.basePath} · ${b.viewName} (Stand ${b.takenAt})`,
    note: "Notiz",
    noGroup: "(ohne Wert)",
    cut: (a: number, n: number) => `[gekürzt: ${a} von ${n} Zeilen — die Base in Obsidian zeigt alle]`,
  },
  en: {
    head: (b: BaseSnapshot) => `## Base: ${b.basePath} · ${b.viewName} (as of ${b.takenAt})`,
    note: "Note",
    noGroup: "(no value)",
    cut: (a: number, n: number) => `[cut: ${a} of ${n} rows — the base in Obsidian shows all]`,
  },
} as const;

function cell(v: string | null): string {
  return v === null ? "" : v.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

/** Eine Base als Text, hoechstens `max` Zeichen — gekuerzt wird zeilenweise, nie mitten in
 *  einer Zeile. Liefert den Text und wie viele Zeilen er zeigt. */
function renderOne(b: BaseSnapshot, max: number, lang: Lang): { text: string; full: string; shown: number } {
  const t = T[lang];
  const kopfzeilen = [`| ${[t.note, ...b.columns].map(cell).join(" | ")} |`, `| ${["---", ...b.columns.map(() => "---")].join(" | ")} |`];
  const gruppiert = b.rows.some((r) => r.group !== null);
  const bau = (bis: number): string => {
    const teile: string[] = [t.head(b)];
    let gruppe: string | null | undefined;
    for (const r of b.rows.slice(0, bis)) {
      if (gruppiert && r.group !== gruppe) {
        gruppe = r.group;
        teile.push(`### ${gruppe ?? t.noGroup}`, ...kopfzeilen);
      } else if (!gruppiert && teile.length === 1) {
        teile.push(...kopfzeilen);
      }
      teile.push(`| ${[r.path, ...r.values].map(cell).join(" | ")} |`);
    }
    if (bis < b.rows.length) teile.push(t.cut(bis, b.rows.length));
    return teile.join("\n");
  };
  const full = bau(b.rows.length);
  if (full.length <= max) return { text: full, full, shown: b.rows.length };
  // Rueckwaerts suchen, bis Text samt Kuerzungs-Meldung passt; 0 Zeilen ist erlaubt.
  for (let n = b.rows.length - 1; n >= 0; n--) {
    const text = bau(n);
    if (text.length <= max) return { text, full, shown: n };
  }
  return { text: "", full, shown: 0 };
}

export interface TableRender { blocks: string[]; items: ContextItem[]; used: number }

export function renderTables(list: readonly BaseSnapshot[], budget: number, lang: Lang): TableRender {
  const blocks: string[] = [];
  const items: ContextItem[] = [];
  let rest = Math.max(0, budget);
  for (const b of list) {
    if (b.form === "notes") continue;
    const r = renderOne(b, rest, lang);
    if (r.text === "") continue;
    blocks.push(r.text);
    const item: ContextItem = { source: "base", path: b.basePath, kind: "table", via: b.id, chars: r.text.length };
    if (r.shown < b.rows.length) item.fullChars = r.full.length;
    items.push(item);
    rest -= r.text.length;
  }
  return { blocks, items, used: blocks.reduce((s, x) => s + x.length, 0) };
}

export function withBaseTables(ctx: ContextAttachment, tables: TableRender): ContextAttachment {
  if (tables.blocks.length === 0) return ctx;
  return {
    ...ctx,
    text: [ctx.text, ...tables.blocks].join("\n\n"),
    items: [...ctx.items, ...tables.items],
  };
}
```

- [ ] **Step 4:** `npx vitest run tests/context_bases.test.ts` → PASS; `npm run check:pure` → grün. Scheitert „kuerzt zeilenweise“, weil der Text trotz `n = 0` über 400 Zeichen liegt, dann ist der Test richtig und die Implementierung falsch. **Den Test nicht lockern.**

- [ ] **Step 5: Commit**

```bash
git add src/core/context/bases.ts tests/context_bases.test.ts
git commit -m "feat(context): bases.ts — Schnappschuss, Uebergabeform mit Default im Lesecode, Tabelle zeilenweise gekuerzt"
```

---

### Task 10: Bases in Kandidaten, Budget und Block

**Files:**
- Modify: `src/core/context/candidates.ts`, `src/core/context/render.ts`, `src/core/context/build.ts`
- Test: `tests/context_build.test.ts`, `tests/context_candidates_semantic.test.ts` (anhängen)

**Interfaces:**
- Consumes: `BaseSnapshot`, `basePaths`, `renderTables`, `TableRender` (Task 9)
- Produces:
  - `CandidateInput.basePaths?: readonly string[]` — Quelle `"base"`, eingereiht nach Manuellem
  - `RenderExtras.extraBlocks?: string[]`, `RenderExtras.extraItems?: ContextItem[]` — hinter den Einträgen; der Block gilt nur dann als leer, wenn Einträge **und** Zusatzblöcke fehlen
  - `BuildOptions.bases?: readonly BaseSnapshot[]`

- [ ] **Step 1: Failing tests**

An `tests/context_candidates_semantic.test.ts`:

```ts
describe("collectCandidates — Pfade aus Bases (Form notes/both)", () => {
  it("reiht sie nach Manuellem und vor den Modus-Quellen ein", () => {
    const out = collectCandidates({
      mode: "tabs", snap, links, linkDepth: 1, manual: ["M.md"], basePaths: ["X.md", "T.md"],
    });
    expect(out.map((c) => `${c.source}:${c.path}`)).toEqual(["active:A.md", "manual:M.md", "base:X.md", "base:T.md"]);
  });
});
```

An `tests/context_build.test.ts` (Import `type BaseSnapshot` aus `../src/core/context/bases` ergänzen):

```ts
describe("buildFullContext — Bases", () => {
  const tabelle: BaseSnapshot = {
    id: "K.base · V", basePath: "K.base", viewName: "V", takenAt: "2026-09-18 14:02", form: "table",
    columns: ["Status"], rows: [{ path: "A.md", group: null, values: ["active"] }],
  };
  it("haengt die Tabelle hinter die Notizen und zieht sie vom Budget ab", async () => {
    const ctx = await buildFullContext({
      mode: "note", snap, links, content: inhalt({ "A.md": "Text A", "B.md": "Text B" }), manual: [], off: new Set(),
      linkDepth: 1, budget: 10000, lang: "de", bases: [tabelle],
    });
    expect(ctx.text).toContain("## Base: K.base · V");
    expect(ctx.text.indexOf("## Base:")).toBeGreaterThan(ctx.text.indexOf("Text B"));
    expect(ctx.items[ctx.items.length - 1]).toMatchObject({ source: "base", kind: "table", via: "K.base · V" });
  });
  it("Form notes: die Zeilen gehen als Volltext mit, Quelle base", async () => {
    const ctx = await buildFullContext({
      mode: "tabs", snap, links, content: inhalt({ "A.md": "Text A", "T.md": "Text T", "X.md": "Text X" }), manual: [], off: new Set(),
      linkDepth: 1, budget: 10000, lang: "de",
      bases: [{ ...tabelle, form: "notes", rows: [{ path: "X.md", group: null, values: [] }] }],
    });
    expect(ctx.items.map((i) => `${i.source}:${i.path}`)).toContain("base:X.md");
    expect(ctx.text).not.toContain("## Base:");
  });
  it("nur eine Tabelle, keine Notizen: der Block sagt nicht „nichts ausgewählt“", async () => {
    const ctx = await buildFullContext({
      mode: "note", snap: { active: null, tabs: [] }, links, content: inhalt({}), manual: [], off: new Set(),
      linkDepth: 1, budget: 10000, lang: "de", bases: [tabelle],
    });
    expect(ctx.text).not.toContain("nichts ausgewählt");
    expect(ctx.text).toContain("## Base:");
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/context_build.test.ts tests/context_candidates_semantic.test.ts` → FAIL.

- [ ] **Step 3: Implementieren**

`candidates.ts` — Feld

```ts
  /** Zeilenpfade aus Bases-Schnappschuessen mit Uebergabeform notes/both (`basePaths`). */
  basePaths?: readonly string[];
```

und direkt nach der `manual`-Schleife:

```ts
  // Bases nach Manuellem: ebenfalls vom Nutzer gewaehlt (per „Als Kontext uebernehmen"),
  // aber ueber einen Filter statt einzeln — Einzelwahl gewinnt bei knappem Budget.
  for (const p of input.basePaths ?? []) nimm({ source: "base", path: p });
```

`render.ts` — `RenderExtras` erweitern:

```ts
export interface RenderExtras {
  notice?: string;
  /** Fertige Bloecke hinter den Eintraegen (Bases-Tabellen) samt ihren Items. */
  extraBlocks?: string[];
  extraItems?: ContextItem[];
}
```

In `renderFullContext` die Leer-Prüfung und das Ende:

```ts
  const extraBlocks = extras.extraBlocks ?? [];
  if (entries.length === 0 && extraBlocks.length === 0) {
    bloecke.push(t.empty);
    return { mode, items, text: bloecke.join("\n") };
  }
  for (const e of entries) { /* … unverändert … */ }
  bloecke.push(...extraBlocks);
  items.push(...(extras.extraItems ?? []));
  return { mode, items, text: bloecke.join("\n\n") };
```

In `T.de.src`/`T.en.src` ergänzen: `base: "aus einer Base"` / `base: "from a base"`.

`build.ts` — Import `import { basePaths, renderTables, type BaseSnapshot } from "./bases";`, Feld `/** Uebernommene Bases (Etappe 3b). */ bases?: readonly BaseSnapshot[];`. In `buildFullContext`:

```ts
  const bases = opts.bases ?? [];
  // Tabellen zuerst ans Budget: sie sind klein und die Form, die Bases besonders macht (Spec E7).
  // Was sie verbrauchen, fehlt den Notizen — ein Budget, nicht zwei.
  const tabellen = renderTables(bases, opts.budget, opts.lang);
```

`collectCandidates` bekommt `basePaths: basePaths(bases)`. Beim Budget: `const inhaltsBudget = Math.max(0, opts.budget - overhead - tabellen.used);`. Beim Rendern:

```ts
  const extras: RenderExtras = { extraBlocks: tabellen.blocks, extraItems: tabellen.items };
  if (notice !== undefined) extras.notice = notice;
  return renderFullContext(allocateBudget(geladen, inhaltsBudget), opts.mode, opts.lang, extras);
```

(`type RenderExtras` aus `./render` importieren.)

- [ ] **Step 4:** `npx vitest run` → PASS (alle Dateien).

- [ ] **Step 5: Commit**

```bash
git add src/core/context/candidates.ts src/core/context/render.ts src/core/context/build.ts tests/context_build.test.ts tests/context_candidates_semantic.test.ts
git commit -m "feat(context): Bases-Tabellen und -Notizen im Volltext-Block, ein gemeinsames Budget"
```

---

### Task 11: Kontext-Tab — Abschnitt Bases

**Files:**
- Modify: `src/core/context/panel-vm.ts`, `src/obsidian/context-panel.ts`
- Test: `tests/context_panel_vm.test.ts` (anhängen)

**Interfaces:**
- Consumes: `BaseSnapshot`, `renderTables`, `withBaseTables` (Task 9); `buildFullContext` mit `bases` (Task 10)
- Produces:
  - `PanelOptions.bases?: readonly BaseSnapshot[]`
  - `PanelChip.openPath?: string` (was ein Klick auf den Namen öffnet; fehlt es, gilt `path`)
  - Abschnitt `id: "bases"`, **immer** vorhanden (Empty-State erklärt, wie man eine Base übernimmt)
  - `ContextPanelHost.removeBase(id: string): void`

- [ ] **Step 1: Failing tests** — an `tests/context_panel_vm.test.ts` (Import `type BaseSnapshot` ergänzen):

```ts
describe("buildPanelViewModel — Bases", () => {
  const b: BaseSnapshot = {
    id: "Notes/Koda context.base · Context table", basePath: "Notes/Koda context.base", viewName: "Context table",
    takenAt: "2026-09-18 14:02", form: "table", columns: ["Status"],
    rows: [{ path: "Notes/Tools.md", group: null, values: ["active"] }],
  };
  it("zeigt je Schnappschuss einen entfernbaren Chip, der die Base-Datei oeffnet", async () => {
    const vm = await buildPanelViewModel("workspace", snap, new Set(), { ...opts, bases: [b] });
    const chip = vm.sections.find((s) => s.id === "bases")?.chips[0];
    expect(chip).toMatchObject({
      source: "base", path: b.id, openPath: "Notes/Koda context.base",
      label: "Koda context · Context table", removable: true,
    });
    expect(chip?.hint).toContain("1 Zeile");
    expect(chip?.hint).toContain("14:02");
  });
  it("zaehlt die Tabelle im Modus Arbeitsplatz in die Summenzeile", async () => {
    const ohne = await buildPanelViewModel("workspace", snap, new Set(), opts);
    const mit = await buildPanelViewModel("workspace", snap, new Set(), { ...opts, bases: [b] });
    expect(mit.chars).toBeGreaterThan(ohne.chars);
  });
  it("nennt im Modus Arbeitsplatz, dass Form notes dort nicht wirkt", async () => {
    const vm = await buildPanelViewModel("workspace", snap, new Set(), { ...opts, bases: [{ ...b, form: "notes" }] });
    expect(vm.sections.find((s) => s.id === "bases")?.chips[0]?.hint).toContain("wirken in den Modi");
  });
  it("hat ohne Schnappschuss einen erklaerenden Empty-State", async () => {
    const sec = (await buildPanelViewModel("workspace", snap, new Set(), opts)).sections.find((s) => s.id === "bases");
    expect(sec?.chips).toEqual([]);
    expect(sec?.empty).toContain("Als Kontext übernehmen");
  });
  it("Zeilen aus Form notes erscheinen im Modus-Abschnitt mit Hinweis „aus Base“", async () => {
    const vm = await buildPanelViewModel("tabs", snap, new Set(), {
      ...opts, content: { read: () => Promise.resolve("x") },
      bases: [{ ...b, form: "notes", rows: [{ path: "Notes/Other.md", group: null, values: [] }] }],
    });
    const chip = vm.sections.find((s) => s.id === "tabs")?.chips.find((c) => c.source === "base");
    expect(chip?.hint).toContain("aus Base");
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/context_panel_vm.test.ts` → FAIL.

- [ ] **Step 3: Implementieren**

`panel-vm.ts`:
- Imports: `renderTables, withBaseTables, type BaseSnapshot` aus `./bases`.
- `PanelChip` um `/** Was ein Klick auf den Namen oeffnet; fehlt es, gilt `path`. Base-Chips tragen als `path` die Schnappschuss-ID — die ist keine Datei. */ openPath?: string;` ergänzen.
- `PanelOptions` um `bases?: readonly BaseSnapshot[];`.
- `T`, DE: `bases: "Bases"`, `fromBase: "aus Base"`, `rows: (n: number) => (n === 1 ? "1 Zeile" : `${n} Zeilen`)`, `emptyBases: "Keine Base übernommen — öffne eine Base, wähle die Ansicht „Koda-Kontext“ und drücke „Als Kontext übernehmen“."`, `baseNotesOff: "Notizen wirken in den Modi Notiz, Alle Tabs und Vault"`. EN: `bases: "Bases"`, `fromBase: "from a base"`, `rows: (n: number) => (n === 1 ? "1 row" : `${n} rows`)`, `emptyBases: "No base adopted — open a base, pick the view “Koda context” and press “Use as context”."`, `baseNotesOff: "notes take effect in the Note, All tabs and Vault modes"`.
- In `sourceSection` bei den Hinweisen: `if (c.source === "base") teile.push(t.fromBase);`.
- Neue Funktion:

```ts
function basesSection(bases: readonly BaseSnapshot[], fullMode: boolean, t: (typeof T)[keyof typeof T]): PanelSection {
  const chips: PanelChip[] = bases.map((b) => {
    const teile = [t.rows(b.rows.length), b.takenAt.slice(11)];
    if (b.form === "notes" && !fullMode) teile.push(t.baseNotesOff);
    return {
      source: "base" as const, path: b.id, openPath: b.basePath,
      label: `${chipLabel(b.basePath).replace(/\.base$/, "")} · ${b.viewName}`,
      hint: teile.join(", "), off: false, removable: true,
    };
  });
  return { id: "bases", title: t.bases, chips, empty: chips.length === 0 ? t.emptyBases : "", note: "" };
}
```

- In `buildPanelViewModel`: `const bases = opts.bases ?? [];`. Im Zweig `workspace`: `text = withBaseTables(renderWorkspaceContext(applySelection(snap, off), opts), renderTables(bases, opts.budget, opts.lang)).text;`. Im `else`-Zweig: `buildFullContext({ …, bases })` und `collectCandidates({ …, basePaths: basePaths(bases) })` (Import `basePaths`). Nach dem Manuell-Abschnitt: `sections.push(basesSection(bases, mode !== "workspace", t));`. `hasOff` wird zu `off.size > 0 || opts.manual.length > 0 || bases.length > 0`.

`context-panel.ts`:
- `ContextPanelHost` um `removeBase(id: string): void;`.
- Beim Namen: `const openNote = (): void => { this.host.openNote(chip.openPath ?? chip.path); };`
- Im `removable`-Zweig: `const removeChip = (): void => { if (chip.source === "base") this.host.removeBase(chip.path); else this.host.remove(chip.path); };`

In `src/obsidian/view.ts` im Host-Objekt `removeBase: (id) => { this.plugin.removeContextBase(id); },` ergänzen. Die Methode entsteht in Task 12. Bis dahin schlägt der Typecheck fehl, deshalb wird dieser Task **zusammen mit Task 12 committet** (siehe Task 12, Step 5).

- [ ] **Step 4:** `npx vitest run tests/context_panel_vm.test.ts` → PASS.

- [ ] **Step 5:** Kein eigener Commit: weiter mit Task 12, der gemeinsame Commit folgt dort.

---

### Task 12: Adapter — Bases-Ansicht „Koda-Kontext" und Zustand im Plugin

**Files:**
- Create: `src/obsidian/bases-view.ts`
- Modify: `src/main.ts`, `src/i18n/strings.ts`, `styles.css`

**Interfaces:**
- Consumes: `BaseSnapshot`, `BaseRow`, `formatStamp`, `normalizeForm`, `snapshotId`, `upsertBase`, `removeBase`, `renderTables`, `withBaseTables` (Task 9); `buildFullContext` mit `bases` (Task 10); `PanelOptions.bases` (Task 11)
- Produces:
  - `KODA_BASES_VIEW = "koda-context"`, `FORM_KEY = "uebergabeform"`
  - `registerKodaBasesView(plugin: Plugin, host: { adopt(snap: BaseSnapshot): void }): boolean`
  - `KodaPlugin.contextBases: BaseSnapshot[]`, `adoptContextBase(snap)`, `removeContextBase(id)`

- [ ] **Step 1: `src/obsidian/bases-view.ts`**

```ts
/* Die Bases-Ansicht „Koda-Kontext" (Spec E7). Bases liefern Daten NUR an eine registrierte
 * Ansicht — ein Filter-Nachbau von aussen bekommt nichts (Spike 2026-09-06, docs/LAB.md).
 *
 * Zwei Versionsgrenzen, beide am Laden gemessen, nicht am Aufruf:
 * - `registerBasesView` gibt es ab Obsidian 1.10; das Manifest erlaubt 1.8.7. Ohne die
 *   Methode wird nichts registriert, sonst aendert sich nichts.
 * - `BasesView` ist auf 1.8/1.9 `undefined`. Die Unterklasse entsteht deshalb IN der
 *   Funktion: eine Klasse auf Modulebene wuerde schon beim Laden des Plugins werfen.
 *
 * Uebernommen wird ein SCHNAPPSCHUSS (Etappe-3-Zuschnitt Punkt 5): Pfade und Anzeigetexte
 * werden kopiert, keine BasesEntry gehalten (Spike-Falle 4). */
import { BasesView, NullValue, type BasesPropertyId, type Plugin, type QueryController, type Value } from "obsidian";
import { formatStamp, normalizeForm, snapshotId, type BaseRow, type BaseSnapshot } from "../core/context/bases";
import { t } from "../vendor/kit/i18n";

export const KODA_BASES_VIEW = "koda-context";
export const FORM_KEY = "uebergabeform";
const SHOW_ROWS = 50;

export interface BasesHost {
  adopt(snap: BaseSnapshot): void;
}

/** Anzeigetext oder null. Zwei Abwesenheitsformen (Spike-Falle 1): eine unbekannte Formel
 *  liefert echtes `null`, eine fehlende Eigenschaft ein `NullValue` — dessen `toString()`
 *  ergibt „null" und darf nie in den Block. */
function valueText(v: Value | null): string | null {
  if (v === null || v instanceof NullValue) return null;
  return v.toString();
}

export function registerKodaBasesView(plugin: Plugin, host: BasesHost): boolean {
  const register = (plugin as unknown as { registerBasesView?: Plugin["registerBasesView"] }).registerBasesView;
  if (typeof register !== "function") return false;

  class KodaBasesView extends BasesView {
    readonly type = KODA_BASES_VIEW;
    private readonly root: HTMLElement;

    constructor(controller: QueryController, containerEl: HTMLElement) {
      super(controller);
      this.root = containerEl.createDiv({ cls: "koda-bases-view" });
      // Vor dem ersten onDataUpdated — und in einer eingebetteten Base fuer immer (Spike:
      // der Embed instanziiert die Ansicht, versorgt sie aber nicht).
      this.root.createDiv({ cls: "koda-empty", text: t("bases.waiting") });
    }

    onDataUpdated(): void { this.paint(); }

    private paint(): void {
      const root = this.root;
      root.empty();
      const zeilen = this.data.data.length;
      const kopf = root.createDiv({ cls: "koda-bases-head" });
      const knopf = kopf.createEl("button", { cls: "mod-cta koda-bases-adopt", text: t("bases.adopt") });
      knopf.disabled = zeilen === 0;
      knopf.addEventListener("click", () => { this.adopt(); });
      kopf.createSpan({ cls: "koda-bases-meta", text: t("bases.rows", String(zeilen)) });

      const liste = root.createDiv({ cls: "koda-bases-rows" });
      const order = this.config.getOrder();
      for (const e of this.data.data.slice(0, SHOW_ROWS)) {
        const werte = order.map((p) => valueText(e.getValue(p))).filter((v): v is string => v !== null);
        liste.createDiv({ cls: "koda-bases-row", text: werte.length > 0 ? `${e.file.path} — ${werte.join(" · ")}` : e.file.path });
      }
      if (zeilen > SHOW_ROWS) liste.createDiv({ cls: "koda-bases-more", text: t("bases.more", String(zeilen - SHOW_ROWS)) });
    }

    /** Kopiert, was die Ansicht JETZT zeigt. Die Base-Datei ist beim Klick die aktive Datei
     *  (der Knopf sitzt in ihrem eigenen Tab); die API nennt den Pfad einer Ansicht nicht. */
    private adopt(): void {
      const basePath = this.app.workspace.getActiveFile()?.path ?? "Base";
      const order: BasesPropertyId[] = this.config.getOrder();
      const rows: BaseRow[] = [];
      for (const g of this.data.groupedData) {
        const group = g.hasKey() && g.key !== undefined ? valueText(g.key) : null;
        for (const e of g.entries) {
          rows.push({ path: e.file.path, group, values: order.map((p) => valueText(e.getValue(p))) });
        }
      }
      host.adopt({
        id: snapshotId(basePath, this.config.name),
        basePath,
        viewName: this.config.name,
        takenAt: formatStamp(new Date()),
        form: normalizeForm(this.config.get(FORM_KEY)),
        columns: order.map((p) => this.config.getDisplayName(p)),
        rows,
      });
    }
  }

  return register.call(plugin, KODA_BASES_VIEW, {
    name: t("bases.viewName"),
    icon: "dog",
    factory: (controller: QueryController, containerEl: HTMLElement) => new KodaBasesView(controller, containerEl),
    // Die Deklaration zeigt nur das Dropdown — den Default traegt `normalizeForm` im Lesecode:
    // `config.get` setzt `default` nicht ein, und `options` wird nie von selbst gerufen (Spike).
    options: () => [{
      type: "dropdown",
      key: FORM_KEY,
      displayName: t("bases.form"),
      default: "table",
      options: { table: t("bases.form.table"), notes: t("bases.form.notes"), both: t("bases.form.both") },
    }],
  });
}
```

Wenn `tsc` an `readonly type = …` gegen `abstract type: string` meckert, `type: string = KODA_BASES_VIEW;` schreiben. Meckert er an `g.key !== undefined`, weil `key?: Value` ist, bleibt die Prüfung trotzdem stehen.

- [ ] **Step 2: `main.ts`**

Imports: `registerKodaBasesView` aus `./obsidian/bases-view`; `removeBase, renderTables, upsertBase, withBaseTables, type BaseSnapshot` aus `./core/context/bases`.

Neben `contextManual`:

```ts
  /** Uebernommene Bases-Schnappschuesse — wie `contextManual` nur fuer diese Sitzung.
   *  „Auswahl zuruecksetzen" und ein neues Gespraech raeumen sie mit ab. */
  contextBases: BaseSnapshot[] = [];

  adoptContextBase(snap: BaseSnapshot): void {
    this.contextBases = upsertBase(this.contextBases, snap);
    new Notice(t("bases.adopted", String(snap.rows.length), snap.viewName));
    for (const v of this.views()) v.syncContextPanel();
  }

  removeContextBase(id: string): void {
    const naechste = removeBase(this.contextBases, id);
    if (naechste === this.contextBases) return;
    this.contextBases = naechste;
    for (const v of this.views()) v.syncContextPanel();
  }
```

`resetContextSelection` räumt die Bases mit ab:

```ts
  resetContextSelection(): void {
    if (this.contextOff.size === 0 && this.contextManual.length === 0 && this.contextBases.length === 0) return;
    this.contextOff.clear();
    this.contextManual = [];
    this.contextBases = [];
    for (const v of this.views()) v.syncContextPanel();
  }
```

`currentContext`, Zweig `workspace`:

```ts
      case "workspace":
        return withBaseTables(
          renderWorkspaceContext(applySelection(snap, this.contextOff), {
            lang: this.promptLang(),
            selectionMax: s.contextSelectionChars,
            tabsMax: s.contextTabsMax,
            frontmatterMax: s.contextFrontmatterChars,
          }),
          renderTables(this.contextBases, s.contextBudgetChars, this.promptLang()),
        );
```

Im Zweig `note`/`tabs`/`vault` an `buildFullContext` `bases: this.contextBases,` ergänzen. In `contextViewModel` an `buildPanelViewModel` `bases: this.contextBases,` ergänzen.

In `onload` nach `this.registerView(VIEW_TYPE_KODA, …)`:

```ts
    // Ab Obsidian 1.10; darunter bleibt es bei false, und Koda laeuft wie bisher.
    registerKodaBasesView(this, { adopt: (snap) => { this.adoptContextBase(snap); } });
```

- [ ] **Step 3: Strings und CSS**

`src/i18n/strings.ts`, EN:

```ts
    "bases.viewName": "Koda context",
    "bases.adopt": "Use as context",
    "bases.rows": "{0} rows",
    "bases.more": "… and {0} more",
    "bases.waiting": "Waiting for data. An embedded base gets none from Obsidian — open the .base file itself.",
    "bases.adopted": "Koda: {0} rows from “{1}” adopted as context",
    "bases.form": "Hand over as",
    "bases.form.table": "Table",
    "bases.form.notes": "Notes",
    "bases.form.both": "Table and notes",
```

DE:

```ts
    "bases.viewName": "Koda-Kontext",
    "bases.adopt": "Als Kontext übernehmen",
    "bases.rows": "{0} Zeilen",
    "bases.more": "… und {0} weitere",
    "bases.waiting": "Warte auf Daten. Eine eingebettete Base bekommt von Obsidian keine — öffne die .base-Datei selbst.",
    "bases.adopted": "Koda: {0} Zeilen aus „{1}“ als Kontext übernommen",
    "bases.form": "Übergeben als",
    "bases.form.table": "Tabelle",
    "bases.form.notes": "Notizen",
    "bases.form.both": "Tabelle und Notizen",
```

(Achtung: der Empty-State in `panel-vm.ts`, Task 11, nennt den Knopf wörtlich „Als Kontext übernehmen“ bzw. „Use as context“ und die Ansicht „Koda-Kontext“ bzw. „Koda context“. Beide Stellen müssen denselben Wortlaut tragen.)

`styles.css`:

```css
.koda-bases-view { padding: var(--size-4-2); }
.koda-bases-head { display: flex; align-items: center; gap: var(--size-4-2); margin-bottom: var(--size-4-2); }
.koda-bases-meta, .koda-bases-more { font-size: var(--font-ui-smaller); color: var(--text-muted); }
.koda-bases-row { font-size: var(--font-ui-small); padding: var(--size-2-1) 0; border-bottom: 1px solid var(--background-modifier-border); }
```

- [ ] **Step 4: Gate** — `npm run gate` → 0/0. Achte besonders auf `typecheck:tests`: kein Test darf `src/obsidian/bases-view.ts` importieren (der Mock kennt `BasesView` nicht, und das ist Absicht: diese Schicht belegt der GUI-Smoke).

- [ ] **Step 5: Commit (Tasks 11 + 12 zusammen)**

```bash
git add src/core/context/panel-vm.ts src/obsidian/context-panel.ts src/obsidian/view.ts tests/context_panel_vm.test.ts src/obsidian/bases-view.ts src/main.ts src/i18n/strings.ts styles.css
git commit -m "feat(context): Bases-Ansicht „Koda-Kontext“ mit Uebernahme als Schnappschuss, Abschnitt Bases im Kontext-Tab"
```

---

### Task 13: GUI-Smoke 46–47, Fixture, Doku, Abschluss 3b

**Files:**
- Create: `docs/images/fixture/notes/Notes/Koda context.base`, `docs/images/fixture/notes/Notes/Koda notes.base`
- Modify: `docs/images/fixture/README.md`, `scripts/gui-smoke.ts`, `docs/SMOKE.md`, `CHANGELOG.md`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: Fixture** — `Notes/Koda context.base` (Übergabeform **nicht** gesetzt: der Punkt misst den Default aus dem Lesecode; Spalte `owner` fehlt in allen Notizen, der Punkt misst also die `NullValue`-Falle):

```yaml
filters:
  and:
    - 'status != ""'
views:
  - type: koda-context
    name: Context table
    order:
      - file.name
      - status
      - owner
```

`Notes/Koda notes.base`:

```yaml
filters:
  and:
    - 'status != ""'
views:
  - type: koda-context
    name: Context notes
    uebergabeform: notes
    order:
      - file.name
      - status
```

⚠️ **Ungemessen:** Ob Obsidian `uebergabeform` auf **dieser** Ebene (Feld der Ansicht) liest, ist nicht bestätigt. Der Spike hat nur gezeigt, dass `config.set(...)` dort *schreibt*. Meldet Punkt 47 `form: table`, dann: in der Zweitinstanz die Ansicht öffnen, im Ansichts-Menü „Übergeben als → Notizen“ wählen, die von Obsidian umgeschriebene `.base` lesen und die Fixture mit genau dieser Form nachziehen. Das Ergebnis gehört als Befund in `docs/LAB.md` und in die Meldung an den Master.

`docs/images/fixture/README.md`, neuer Spiegelstrich unter „What the checks need“:

```md
- **`Notes/Koda context.base` and `Notes/Koda notes.base` with a view of type `koda-context`**
  — checks 46 and 47 open them and press “Use as context”. The first sets no hand-over form
  (the check measures the default in the reading code) and lists a column `owner` that no
  note has (the check measures that a missing value arrives empty, never as the word “null”).
  The second sets `uebergabeform: notes`. Both filter on `status != ""`, like `Overview.base`.
```

- [ ] **Step 2: Prüfpunkte** — in `scripts/gui-smoke.ts` nach Punkt 45:

```ts
    // ── 46–47: Etappe 3b — Bases-Ansicht „Koda-Kontext" ──────────────────────────────
    // Braucht Obsidian >= 1.10 (Bases). Die Zweitinstanz laeuft mit der kopierten .asar
    // (Rahmenregel 6) und damit auf 1.13+; ohne registerBasesView wird uebersprungen.
    const basesDa = await cdp.evaluate<boolean>(`return typeof app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].registerBasesView === "function";`);
    const adoptFrom = async (pfad: string): Promise<{ ok: boolean; detail: string }> => {
      await cdp.evaluate(`
        const f = app.vault.getFileByPath(${JSON.stringify(pfad)});
        await app.workspace.getLeaf("tab").openFile(f);
        return true;
      `);
      const bereit = await pollUntil<boolean>(cdp, `
        const b = document.querySelector(".workspace-leaf.mod-active .koda-bases-view .koda-bases-adopt");
        return b && !b.disabled ? true : null;
      `, 10_000);
      if (bereit === null) return { ok: false, detail: `Uebernehmen-Knopf in ${pfad} nicht binnen 10 s bereit` };
      await cdp.evaluate(`document.querySelector(".workspace-leaf.mod-active .koda-bases-view .koda-bases-adopt").click(); return true;`);
      return { ok: true, detail: "" };
    };

    if (!basesDa) {
      record("46. Bases: Uebernahme als Tabelle, Default aus dem Lesecode, fehlende Werte leer", true, "uebersprungen — registerBasesView fehlt (Obsidian < 1.10)");
      record("47. Bases: Uebergabeform Notizen schickt die Zeilen im Volltext", true, "uebersprungen — registerBasesView fehlt (Obsidian < 1.10)");
    } else {
      // ── 46 ──
      let ok46 = false; let detail46 = "";
      try {
        await cdp.evaluate(`app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].resetContextSelection(); return true;`);
        const a = await adoptFrom("Notes/Koda context.base");
        if (!a.ok) throw new Error(a.detail);
        const r = await cdp.evaluate<{ bases: { id: string; form: string; rows: number; columns: string[] }[]; text: string; items: string[] }>(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.setContextMode("workspace");
          const ctx = await p.currentContext();
          return {
            bases: p.contextBases.map((b) => ({ id: b.id, form: b.form, rows: b.rows.length, columns: b.columns })),
            text: ctx?.text ?? "",
            items: (ctx?.items ?? []).map((i) => i.source + ":" + i.kind),
          };
        `);
        const b = r.bases[0];
        const tabelle = r.text.slice(r.text.indexOf("## Base:"));
        ok46 = r.bases.length === 1 && b !== undefined
          && b.id === "Notes/Koda context.base · Context table"
          && b.form === "table" && b.rows === 3
          && r.items.includes("base:table")
          && tabelle.includes("Notes/Tools.md")
          && !/\bnull\b/.test(tabelle);
        detail46 = `Schnappschuss ${b?.id ?? "—"} · Form ${b?.form ?? "—"} · ${String(b?.rows)} Zeilen · Spalten ${b?.columns.join(", ") ?? "—"} · „null" in Tabelle: ${String(/\bnull\b/.test(tabelle))}`;
      } catch (error) {
        detail46 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      }
      record("46. Bases: Uebernahme als Tabelle, Default aus dem Lesecode, fehlende Werte leer", ok46, detail46);

      // ── 47 ──
      let ok47 = false; let detail47 = "";
      try {
        const a = await adoptFrom("Notes/Koda notes.base");
        if (!a.ok) throw new Error(a.detail);
        const r = await cdp.evaluate<{ form: string; items: string[]; hatTabelle: boolean }>(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.setContextMode("tabs");
          const ctx = await p.currentContext();
          const notes = p.contextBases.find((b) => b.viewName === "Context notes");
          return {
            form: notes?.form ?? "",
            items: (ctx?.items ?? []).map((i) => i.source + ":" + i.path + ":" + i.kind),
            hatTabelle: (ctx?.text ?? "").includes("· Context notes (") ,
          };
        `);
        const baseVolltext = r.items.filter((i) => i.startsWith("base:") && i.endsWith(":full"));
        ok47 = r.form === "notes" && baseVolltext.length >= 1 && !r.hatTabelle;
        detail47 = `Form ${r.form} · Volltext aus Base: ${baseVolltext.join(", ") || "keiner"} · Tabelle der Notizen-Ansicht im Block: ${String(r.hatTabelle)}`;
      } catch (error) {
        detail47 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        await cdp.evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.resetContextSelection();
          p.setContextMode("workspace");
          for (const l of app.workspace.getLeavesOfType("bases")) l.detach();
          return true;
        `).catch(() => undefined);
      }
      record("47. Bases: Uebergabeform Notizen schickt die Zeilen im Volltext", ok47, detail47);
    }
```

(Hinweis zu 47: Aktive Notiz und Tabs können dieselben Pfade schon mit anderer Quelle tragen; `nimm` entdoppelt dann zugunsten der früheren Quelle. Die Fixture hat drei Notizen mit `status`, die Tabs zu diesem Zeitpunkt sind die zwei `.base`-Dateien. Mindestens ein Pfad muss deshalb als `base:…:full` ankommen. Kommt keiner, ist das ein Befund und kein Anlass, den Punkt aufzuweichen. Ob der View-Typ der Bases-Leaves tatsächlich `"bases"` heißt, beim ersten Lauf mit `app.workspace.activeLeaf.view.getViewType()` messen und den Aufräum-Selektor danach richten.)

- [ ] **Step 3: Lauf und Gegenproben** — Zweitinstanz, Lock, `npm run smoke:gui -- --setup` (die Fixture ist neu), danach `npm run smoke:gui -- --vault koda-agent --port <port>` → **47/47**. Gegenproben, jede einzeln, gebaut mit `node esbuild.config.mjs production`:
  - 46a: in `bases-view.ts` `valueText` auf `return v === null ? null : v.toString();` → 46 rot (Wort „null“ in der Tabelle).
  - 46b: in `bases.ts` `normalizeForm` auf `return raw as BaseForm;` → 46 rot (Form `undefined`).
  - 47: in `candidates.ts` die `basePaths`-Schleife auskommentieren → 47 rot.
  
  Ergebnisse in `docs/SMOKE.md` unter „Belegter Lauf: <Datum> — Etappe 3b“ festhalten, mit Obsidian-Version. Den Lock direkt nach dem Lauf freigeben und die Zweitinstanz beenden.

- [ ] **Step 4: Doku**
  - `CHANGELOG.md` → `### Added`: die Bases-Ansicht **„Koda-Kontext“**. „Als Kontext übernehmen“ legt einen Schnappschuss mit Zeitstempel an, und die Übergabeform lässt sich als Tabelle, als Notizen oder als beides wählen. Die Tabelle geht in jedem Modus außer Aus mit, die Notizen nur in den Volltext-Modi. Der Abschnitt Bases im Kontext-Tab zeigt die Schnappschüsse. Die Ansicht setzt Obsidian 1.10 voraus, darunter bleibt alles wie bisher.
  - `README.md`: in der Modi-Liste bei Bases ergänzen (quer zu den Modi, wie Manuell).
  - `CLAUDE.md`: „45 Punkte“ → „47 Punkte“, die zwei neuen Punkte in einem Satz. Den Status-Absatz ganz oben **nicht** umschreiben: das macht die Release-Session.
  - `docs/LAB.md`: nur falls Step 1 den Ort von `uebergabeform` nachgemessen hat, einen Nachtrag unter dem Bases-Abschnitt ergänzen.

- [ ] **Step 5: Gate + Commit + Push**

```bash
npm run gate && git add "docs/images/fixture/notes/Notes/Koda context.base" "docs/images/fixture/notes/Notes/Koda notes.base" docs/images/fixture/README.md scripts/gui-smoke.ts docs/SMOKE.md CHANGELOG.md README.md CLAUDE.md && git commit -m "test(smoke): Pruefpunkte 46-47 fuer die Bases-Ansicht (Etappe 3b)" && git push origin main && git push github main
```

(`docs/LAB.md` nur mit in `git add` nehmen, wenn Step 4 die Datei geändert hat.)

- [ ] **Step 6: Halt und Meldung.** Etappe 3 ist komplett. **Kein Release ohne Freigabe.** Melde dem Master Gate und Smoke vorher/nachher (vier Zustände), alle Commits, jede Gegenprobe mit ihrem Rot und den Befund zum Ort von `uebergabeform`. Dazu Punkte außerhalb des Auftrags. Einen kenne ich schon: `tools/obsidian-cdp` hat keinen Bases-Helfer, falls 46/47 einen gebraucht hätten.

---

## Nicht in diesem Plan

- Kein Store-Rescan, kein Release (siehe Global Constraints).
- Kein Kit-Rückfluss: Koda ist nach 3a das zweite Exemplar eines Live-Kandidaten-Panels mit Debounce und Generationszähler (vault-rag ist das erste). Das ist ein **REGISTRY-Nachtrag für den Master**, kein Kit-Extrakt.
- Die Transform-Fähigkeit (eigene Task, Messauftrag Welle 8).
