# Retrieval-Andockung (Koda-Seite) — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Koda nutzt vault-rags Embedding-Index — hybride Suche in `search_notes` und ein neues `related`-Tool — ohne hart an vault-rag zu koppeln.

**Architecture:** vault-rag stellt seit 2026-08-13 `app.plugins.plugins["vault-retrieval"].api` bereit (fertig, Gate grün). Koda holt sie bei jedem Aufruf frisch, kapselt sie hinter einem schmalen Port und hält die gesamte Aufbereitung (Zusammenführen, Dedup, Beschriftung, Schwellenlogik) in `src/core/` — obsidian-frei und ohne Netz testbar.

**Tech Stack:** TypeScript, esbuild, vitest, Obsidian-Mock aus `obsidian-kit/testing`.

**Spec:** `docs/superpowers/specs/2026-08-13-koda-retrieval-andockung-design.md`

## Global Constraints

- `src/core/` darf **keinen** `obsidian`-Import enthalten (`npm run check:pure` erzwingt das).
- Kodas Kopie der API-Typen ist **dupliziert, nicht importiert** — kein Build-Coupling zwischen zwei eigenständigen Repos (PROF-OBS-09). Erste Zeile trägt den Herkunftsstempel nach Kit-first-Regel §1: `// uebernommen aus vault-rag/src/plugin_api.ts, 2026-08-13`.
- Tool-Ergebnistexte sind **deutsch** — konsistent mit dem bestehenden `VaultTools` (`"Keine Treffer für …"`, `"query fehlt"`). Tool-*Beschreibungen* in `TOOL_DEFS` bleiben **englisch**, ebenfalls wie bisher.
- Keine `eslint-disable`-Kommentare (`scripts/check-no-inline-disables.mjs`).
- Vor jedem Commit: `npm run gate`.
- Semantische Suche erst ab **weniger als 3** Volltext-Treffern (Spec E4), Konstante an einer Stelle.
- `related` nur registrieren, wenn `api.status().indexed === true` (Spec E3).

---

### Task 1: Pure Kern — Typen, Schwelle, Zusammenführung

**Files:**
- Create: `src/core/tools/retrieval.ts`
- Test: `tests/retrieval.test.ts`

**Interfaces:**
- Consumes: nichts (reiner Kern)
- Produces: `RetrievalApi`, `ApiResult`, `ApiHit`, `SEMANTIC_THRESHOLD`, `needsSemantic(textHitCount)`, `formatSearchResult(text, semantic)`, `formatRelatedResult(result, path)`, `TextHit`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  needsSemantic, SEMANTIC_THRESHOLD, formatSearchResult, formatRelatedResult,
} from "../src/core/tools/retrieval";

describe("Schwelle", () => {
  it("fragt semantisch nur unterhalb der Schwelle", () => {
    expect(needsSemantic(0)).toBe(true);
    expect(needsSemantic(SEMANTIC_THRESHOLD - 1)).toBe(true);
    expect(needsSemantic(SEMANTIC_THRESHOLD)).toBe(false);
    expect(needsSemantic(10)).toBe(false);
  });
});

describe("formatSearchResult", () => {
  const t = [{ path: "a.md", snippet: "…Plan…" }];

  it("zeigt ohne semantischen Teil nur die Volltext-Liste ohne Ueberschrift", () => {
    expect(formatSearchResult(t, null)).toBe("a.md: …Plan…");
  });

  it("beschriftet beide Bloecke, wenn semantische Treffer dazukommen", () => {
    const out = formatSearchResult(t, { ok: true, hits: [{ path: "b.md", score: 0.7123 }] });
    expect(out).toContain("Volltext (wörtlich gefunden):");
    expect(out).toContain("a.md: …Plan…");
    expect(out).toContain("Inhaltlich ähnlich (semantisch/Index, 0–1):");
    expect(out).toContain("b.md (0.71)");
  });

  it("nennt einen Pfad nur EINMAL — im Volltext-Block, mit Score-Vermerk", () => {
    const out = formatSearchResult(t, { ok: true, hits: [{ path: "a.md", score: 0.9 }] });
    expect(out.match(/a\.md/g)).toHaveLength(1);
    expect(out).toContain("a.md: …Plan… (0.90)");
    expect(out).not.toContain("Inhaltlich ähnlich");
  });

  it("meldet fehlenden Index als Klartextzeile statt still zu schweigen", () => {
    expect(formatSearchResult(t, { ok: false, reason: "no-index" }))
      .toContain("semantisch: kein Index vorhanden");
  });

  it("meldet einen nicht erreichbaren Embedding-Endpunkt", () => {
    expect(formatSearchResult(t, { ok: false, reason: "offline" }))
      .toContain("semantisch: Embedding-Endpunkt nicht erreichbar");
  });

  it("sagt bei null Treffern beider Wege deutlich, dass nichts gefunden wurde", () => {
    const out = formatSearchResult([], { ok: true, hits: [] });
    expect(out).toContain("Keine Treffer");
  });
});

describe("formatRelatedResult", () => {
  it("listet verwandte Notizen mit Score", () => {
    const out = formatRelatedResult({ ok: true, hits: [{ path: "b.md", score: 0.66 }] }, "a.md");
    expect(out).toBe("Verwandt zu a.md:\nb.md (0.66)");
  });

  it("meldet eine nicht indexierte Notiz als solche", () => {
    expect(formatRelatedResult({ ok: false, reason: "not-indexed", path: "x.md" }, "x.md"))
      .toContain("nicht im Index");
  });

  it("meldet fehlenden Index", () => {
    expect(formatRelatedResult({ ok: false, reason: "no-index" }, "a.md"))
      .toContain("kein Index vorhanden");
  });

  it("sagt bei leerer Trefferliste, dass nichts Verwandtes gefunden wurde", () => {
    expect(formatRelatedResult({ ok: true, hits: [] }, "a.md")).toContain("nichts");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/retrieval.test.ts`
Expected: FAIL — `Cannot find module '../src/core/tools/retrieval'`

- [ ] **Step 3: Write minimal implementation**

```ts
// uebernommen aus vault-rag/src/plugin_api.ts, 2026-08-13
// Bewusst KOPIERT statt importiert: koda-agent und vault-rag sind eigenstaendige
// Repos (PROF-OBS-09), ein Import waere ein Build-Coupling. Aendert sich der Vertrag
// drueben, steigt dort `apiVersion` — siehe `readApi` in src/obsidian/retrieval.ts.

export interface ApiHit { path: string; score: number }

export type ApiResult =
  | { ok: true; hits: ApiHit[] }
  | { ok: false; reason: "no-index" }
  | { ok: false; reason: "offline" }
  | { ok: false; reason: "not-indexed"; path: string };

export interface ApiStatus { apiVersion: number; indexed: boolean; noteCount: number }

export interface RetrievalApi {
  readonly apiVersion: number;
  status(): ApiStatus;
  search(query: string, opts?: { k?: number; minSim?: number }): Promise<ApiResult>;
  related(path: string, opts?: { k?: number; minSim?: number }): Promise<ApiResult>;
}

/** Ein Volltext-Treffer, wie ihn Kodas eigene Suche erzeugt. */
export interface TextHit { path: string; snippet: string }

/** Ab wie vielen Volltext-Treffern die semantische Suche NICHT mehr noetig ist.
 *  Startwert aus der Spec (E4), kein Messergebnis — bewusst eine Konstante an genau
 *  einer Stelle, damit ein Praxisbefund sie ohne Suche korrigieren kann. */
export const SEMANTIC_THRESHOLD = 3;

export function needsSemantic(textHitCount: number): boolean {
  return textHitCount < SEMANTIC_THRESHOLD;
}

const score = (n: number): string => n.toFixed(2);

/** Warum Bloecke statt einer gemischten Rangfolge: Volltext hat keinen Score,
 *  semantische Treffer haben keinen Snippet — eine gemeinsame Sortierung waere
 *  erfunden. Und ein Volltext-Treffer BELEGT ein woertliches Vorkommen, ein
 *  semantischer nicht; die Unterscheidung ist fuer die Antwort wertvoll. */
export function formatSearchResult(text: TextHit[], semantic: ApiResult | null): string {
  const semHits = semantic?.ok ? semantic.hits : [];
  const byPath = new Map(semHits.map(h => [h.path, h.score]));

  const textLines = text.map(h => {
    const s = byPath.get(h.path);
    return s === undefined ? `${h.path}: ${h.snippet}` : `${h.path}: ${h.snippet} (${score(s)})`;
  });
  const rest = semHits.filter(h => !text.some(t => t.path === h.path));

  const note = semantic && !semantic.ok
    ? semantic.reason === "no-index"
      ? "(semantisch: kein Index vorhanden — vault-rag hat den Vault noch nicht indexiert)"
      : semantic.reason === "offline"
        ? "(semantisch: Embedding-Endpunkt nicht erreichbar — nur Volltext-Treffer)"
        : `(semantisch: "${semantic.path}" nicht im Index)`
    : null;

  if (textLines.length === 0 && rest.length === 0) {
    return ["Keine Treffer.", note].filter(Boolean).join("\n");
  }
  if (rest.length === 0) {
    return [textLines.join("\n"), note].filter(Boolean).join("\n");
  }

  const blocks: string[] = [];
  if (textLines.length > 0) blocks.push(`Volltext (wörtlich gefunden):\n${textLines.join("\n")}`);
  blocks.push(
    `Inhaltlich ähnlich (semantisch/Index, 0–1):\n${rest.map(h => `${h.path} (${score(h.score)})`).join("\n")}`,
  );
  if (note) blocks.push(note);
  return blocks.join("\n");
}

export function formatRelatedResult(r: ApiResult, path: string): string {
  if (!r.ok) {
    if (r.reason === "no-index") return "Semantischer Index: kein Index vorhanden — vault-rag hat den Vault noch nicht indexiert.";
    if (r.reason === "offline") return "Semantischer Index: Endpunkt nicht erreichbar.";
    return `"${r.path}" ist (noch) nicht im Index — verwandte Notizen lassen sich dafür nicht bestimmen.`;
  }
  if (r.hits.length === 0) return `Zu ${path} wurde nichts inhaltlich Verwandtes gefunden.`;
  return `Verwandt zu ${path}:\n${r.hits.map(h => `${h.path} (${score(h.score)})`).join("\n")}`;
}
```

- [ ] **Step 4: Run tests + purity check**

Run: `npx vitest run tests/retrieval.test.ts && npm run check:pure`
Expected: PASS, `check:pure` ohne Befund

- [ ] **Step 5: Commit**

```bash
git add src/core/tools/retrieval.ts tests/retrieval.test.ts
git commit -m "feat(core): Retrieval-Zusammenfuehrung als pure Logik"
```

---

### Task 2: Adapter — die API defensiv finden

**Files:**
- Create: `src/obsidian/retrieval.ts`
- Test: `tests/retrieval_port.test.ts`

**Interfaces:**
- Consumes: `RetrievalApi` aus Task 1
- Produces: `readRetrievalApi(app: unknown): RetrievalApi | null`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { readRetrievalApi } from "../src/obsidian/retrieval";

const api = {
  apiVersion: 1,
  status: () => ({ apiVersion: 1, indexed: true, noteCount: 3 }),
  search: async () => ({ ok: true as const, hits: [] }),
  related: async () => ({ ok: true as const, hits: [] }),
};
const appWith = (plugin: unknown) => ({ plugins: { plugins: { "vault-retrieval": plugin } } });

describe("readRetrievalApi", () => {
  it("findet eine vollstaendige API", () => {
    expect(readRetrievalApi(appWith({ api }))).toBe(api);
  });

  it("gibt null zurueck, wenn vault-rag gar nicht installiert ist", () => {
    expect(readRetrievalApi({ plugins: { plugins: {} } })).toBeNull();
  });

  it("gibt null zurueck, wenn das Plugin da ist, aber keine api traegt (aeltere Version)", () => {
    expect(readRetrievalApi(appWith({}))).toBeNull();
  });

  it("lehnt eine fremde Hauptversion ab, statt auf gut Glueck zu rufen", () => {
    expect(readRetrievalApi(appWith({ api: { ...api, apiVersion: 2 } }))).toBeNull();
  });

  it("lehnt ein Objekt ab, dem eine Methode fehlt", () => {
    expect(readRetrievalApi(appWith({ api: { apiVersion: 1, status: api.status } }))).toBeNull();
  });

  it("faellt bei kaputter app-Struktur auf null statt zu werfen", () => {
    for (const bad of [null, undefined, {}, { plugins: null }, { plugins: { plugins: null } }]) {
      expect(readRetrievalApi(bad)).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/retrieval_port.test.ts`
Expected: FAIL — Modul fehlt

- [ ] **Step 3: Write minimal implementation**

```ts
import type { RetrievalApi } from "../core/tools/retrieval";

/** Version, gegen die Koda gebaut ist. Meldet vault-rag eine andere, wird die API
 *  ignoriert statt geraten — genau dafuer traegt sie die Nummer. */
const SUPPORTED_API_VERSION = 1;
const PLUGIN_ID = "vault-retrieval";

/** Liest die API defensiv aus dem Plugin-Register. Bewusst bei JEDEM Aufruf statt
 *  einmal beim Laden: vault-rag kann zur Laufzeit aktiviert oder deaktiviert werden,
 *  und der Zugriff ist ein Objekt-Lookup. `unknown` als Parameter, weil `app.plugins`
 *  nicht Teil der offiziellen Obsidian-Typen ist. */
export function readRetrievalApi(app: unknown): RetrievalApi | null {
  const reg = (app as { plugins?: { plugins?: Record<string, unknown> } } | null)?.plugins?.plugins;
  if (reg === null || typeof reg !== "object") return null;
  const api = (reg[PLUGIN_ID] as { api?: unknown } | undefined)?.api as RetrievalApi | undefined;
  if (!api || api.apiVersion !== SUPPORTED_API_VERSION) return null;
  if (typeof api.status !== "function" || typeof api.search !== "function" || typeof api.related !== "function") {
    return null;
  }
  return api;
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run tests/retrieval_port.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/retrieval.ts tests/retrieval_port.test.ts
git commit -m "feat(obsidian): vault-rag-API defensiv lesen"
```

---

### Task 3: Werkzeugliste wird zustandsabhängig

**Files:**
- Modify: `src/core/tools/defs.ts`
- Test: `tests/tool_defs.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces: `toolDefs(opts: { related: boolean }): ToolDef[]`; `TOOL_DEFS` bleibt als Basis erhalten

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { toolDefs, TOOL_DEFS } from "../src/core/tools/defs";

describe("toolDefs", () => {
  it("enthaelt ohne Retrieval genau die bisherigen fuenf Werkzeuge", () => {
    const names = toolDefs({ related: false }).map(t => t.name);
    expect(names).toEqual(TOOL_DEFS.map(t => t.name));
    expect(names).not.toContain("related_notes");
  });

  it("ergaenzt related_notes, wenn ein Index da ist", () => {
    const names = toolDefs({ related: true }).map(t => t.name);
    expect(names).toContain("related_notes");
    expect(names).toHaveLength(TOOL_DEFS.length + 1);
  });

  it("beschreibt related_notes englisch wie die uebrigen und verlangt einen Pfad", () => {
    const d = toolDefs({ related: true }).find(t => t.name === "related_notes");
    expect(d?.description).toMatch(/^[\x20-\x7E]+$/);
    expect((d?.parameters as { required: string[] }).required).toEqual(["path"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tool_defs.test.ts`
Expected: FAIL — `toolDefs is not a function`

- [ ] **Step 3: Write minimal implementation**

Am Ende von `src/core/tools/defs.ts` anfügen:

```ts
/** Nur verfuegbar, wenn vault-rag einen Index bereitstellt — deshalb kein Teil von
 *  TOOL_DEFS. Ein Werkzeug im Prompt, das nicht laufen kann, kostet Kontext und
 *  provoziert Fehlversuche. */
const RELATED_DEF: ToolDef = {
  name: "related_notes",
  description:
    "Find notes that are semantically related to a given note, using the vault's embedding index. Use it to explore context around a note — it finds connections that share no literal wording.",
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "Vault-relative path of the note to start from" } },
    required: ["path"],
  },
};

/** Die Werkzeugliste haengt am Zustand der Nachbarplugins und wird deshalb je
 *  Gespraech gebaut statt als Konstante ausgeliefert. */
export function toolDefs(opts: { related: boolean }): ToolDef[] {
  return opts.related ? [...TOOL_DEFS, RELATED_DEF] : [...TOOL_DEFS];
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run tests/tool_defs.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/tools/defs.ts tests/tool_defs.test.ts
git commit -m "feat(core): Werkzeugliste je Gespraech statt als Konstante"
```

---

### Task 4: VaultTools — hybride Suche und related_notes

**Files:**
- Modify: `src/obsidian/vault-tools.ts`
- Test: `tests/vault_tools_retrieval.test.ts`

**Interfaces:**
- Consumes: `needsSemantic`, `formatSearchResult`, `formatRelatedResult`, `TextHit`, `RetrievalApi` (Task 1)
- Produces: `VaultTools`-Konstruktor nimmt ein viertes Feld `retrieval?: () => RetrievalApi | null` in `opts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { VaultTools, type VaultPort } from "../src/obsidian/vault-tools";
import type { RetrievalApi } from "../src/core/tools/retrieval";

function vault(files: Record<string, string>): VaultPort {
  return {
    listMarkdownPaths: () => Object.keys(files),
    read: async (p) => files[p] ?? (() => { throw new Error("nope"); })(),
    exists: async (p) => p in files,
    create: async () => {}, append: async () => {}, overwrite: async () => {},
  };
}
const opts = (retrieval?: () => RetrievalApi | null) =>
  ({ kodaFolder: () => "Koda", today: () => "2026-08-13", retrieval });

const api = (over: Partial<RetrievalApi> = {}): RetrievalApi => ({
  apiVersion: 1,
  status: () => ({ apiVersion: 1, indexed: true, noteCount: 2 }),
  search: async () => ({ ok: true, hits: [{ path: "sem.md", score: 0.8 }] }),
  related: async () => ({ ok: true, hits: [{ path: "r.md", score: 0.7 }] }),
  ...over,
});

describe("search_notes — hybrid", () => {
  it("laesst die semantische Suche AUS, wenn Volltext genug liefert", async () => {
    const search = vi.fn();
    const t = new VaultTools(
      vault({ "a.md": "plan", "b.md": "plan", "c.md": "plan" }),
      async () => true, opts(() => api({ search })),
    );
    const r = await t.run("search_notes", { query: "plan" });
    expect(search).not.toHaveBeenCalled();
    expect(r.ok && r.content).not.toContain("Inhaltlich ähnlich");
  });

  it("fragt semantisch nach, wenn Volltext duenn bleibt", async () => {
    const t = new VaultTools(vault({ "a.md": "plan" }), async () => true, opts(() => api()));
    const r = await t.run("search_notes", { query: "plan" });
    expect(r.ok && r.content).toContain("sem.md (0.80)");
  });

  it("reicht max_results als k an die API durch", async () => {
    const search = vi.fn(async () => ({ ok: true as const, hits: [] }));
    const t = new VaultTools(vault({}), async () => true, opts(() => api({ search })));
    await t.run("search_notes", { query: "x", max_results: 4 });
    expect(search).toHaveBeenCalledWith("x", { k: 4 });
  });

  it("verhaelt sich ohne vault-rag exakt wie bisher — ohne Zusatzmeldung", async () => {
    const t = new VaultTools(vault({ "a.md": "plan" }), async () => true, opts(() => null));
    const r = await t.run("search_notes", { query: "plan" });
    expect(r.ok && r.content).toBe("a.md: …plan…");
  });

  it("meldet einen Ausfall der semantischen Seite, statt ihn zu verschlucken", async () => {
    const t = new VaultTools(vault({ "a.md": "plan" }), async () => true,
      opts(() => api({ search: async () => ({ ok: false, reason: "offline" }) })));
    const r = await t.run("search_notes", { query: "plan" });
    expect(r.ok && r.content).toContain("Embedding-Endpunkt nicht erreichbar");
  });

  it("laesst einen Fehler der API die Volltextsuche nicht mitreissen", async () => {
    const t = new VaultTools(vault({ "a.md": "plan" }), async () => true,
      opts(() => api({ search: async () => { throw new Error("boom"); } })));
    const r = await t.run("search_notes", { query: "plan" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.content).toContain("a.md");
  });
});

describe("related_notes", () => {
  it("liefert verwandte Notizen", async () => {
    const t = new VaultTools(vault({ "a.md": "x" }), async () => true, opts(() => api()));
    const r = await t.run("related_notes", { path: "a.md" });
    expect(r.ok && r.content).toContain("r.md (0.70)");
  });

  it("meldet klar, wenn die API zwischenzeitlich verschwunden ist", async () => {
    const t = new VaultTools(vault({ "a.md": "x" }), async () => true, opts(() => null));
    const r = await t.run("related_notes", { path: "a.md" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("nicht verfügbar");
  });

  it("normalisiert den Pfad wie read_note", async () => {
    const related = vi.fn(async () => ({ ok: true as const, hits: [] }));
    const t = new VaultTools(vault({}), async () => true, opts(() => api({ related })));
    await t.run("related_notes", { path: "Ordner/Notiz" });
    expect(related).toHaveBeenCalledWith("Ordner/Notiz.md", undefined);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/vault_tools_retrieval.test.ts`
Expected: FAIL — `related_notes` unbekannt, `retrieval` nicht im Typ

- [ ] **Step 3: Write minimal implementation**

In `src/obsidian/vault-tools.ts`: Import ergänzen, `opts`-Typ um `retrieval?` erweitern, `search` umbauen, `relatedNotes` ergänzen, Dispatch-Zweig hinzufügen.

```ts
import {
  needsSemantic, formatSearchResult, formatRelatedResult,
  type RetrievalApi, type TextHit,
} from "../core/tools/retrieval";
```

Konstruktor-`opts`:

```ts
private readonly opts: {
  kodaFolder(): string;
  today(): string;
  /** Frisch je Aufruf gelesen — vault-rag kann zur Laufzeit an- oder abgeschaltet werden. */
  retrieval?: () => RetrievalApi | null;
},
```

Dispatch:

```ts
case "related_notes": return await this.relatedNotes(str(a.path));
```

`search` ersetzen (sammelt jetzt `TextHit[]` statt fertiger Zeilen):

```ts
private async search(query: string, cap: number): Promise<ToolOutcome> {
  if (query.trim() === "") return { ok: false, error: "query fehlt" };
  const q = query.toLowerCase();
  const hits: TextHit[] = [];
  for (const path of this.vault.listMarkdownPaths()) {
    if (hits.length >= cap) break;
    if (path.toLowerCase().includes(q)) { hits.push({ path, snippet: "(Dateiname)" }); continue; }
    const text = await this.vault.read(path).catch(() => "");
    const at = text.toLowerCase().indexOf(q);
    if (at !== -1) {
      const from = Math.max(0, at - SNIPPET / 2);
      const snippet = text.slice(from, from + SNIPPET).replace(/\s+/g, " ").trim();
      hits.push({ path, snippet: `…${snippet}…` });
    }
  }

  // Semantik nur, wenn Volltext duenn bleibt (Spec E4). Ein Fehler der Fremd-API darf
  // die Volltextsuche NIE mitreissen — sie ist der verlaessliche Teil der Antwort.
  const api = needsSemantic(hits.length) ? this.opts.retrieval?.() ?? null : null;
  const semantic = api === null ? null : await api.search(query, { k: cap }).catch(() => null);

  return { ok: true, content: formatSearchResult(hits, semantic) };
}

private async relatedNotes(path: string): Promise<ToolOutcome> {
  const api = this.opts.retrieval?.() ?? null;
  if (api === null) {
    return { ok: false, error: "Semantischer Index nicht verfügbar — das Plugin „Vault Retrieval\" ist nicht aktiv." };
  }
  const norm = resolveNotePath(path);
  const r = await api.related(norm).catch(() => null);
  if (r === null) return { ok: false, error: "Semantischer Index nicht verfügbar — Abfrage fehlgeschlagen." };
  return { ok: true, content: formatRelatedResult(r, norm) };
}
```

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: PASS — auch `tests/vault_tools.test.ts`; falls dort Snippet-Formate erwartet werden, an `TextHit` angleichen.

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/vault-tools.ts tests/vault_tools_retrieval.test.ts tests/vault_tools.test.ts
git commit -m "feat(tools): hybride Suche und related_notes"
```

---

### Task 5: Verdrahtung in main.ts

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `readRetrievalApi` (Task 2), `toolDefs` (Task 3), `VaultTools`-`opts.retrieval` (Task 4)
- Produces: nichts für spätere Tasks

- [ ] **Step 1: Import umstellen**

```ts
import { toolDefs } from "./core/tools/defs";
import { readRetrievalApi } from "./obsidian/retrieval";
```

- [ ] **Step 2: Retrieval in VaultTools reichen**

```ts
const tools = new VaultTools(vaultPort, (req) => confirmWrite(this.app, req), {
  kodaFolder: () => this.settings.kodaFolder,
  today: () => new Date().toISOString().slice(0, 10),
  retrieval: () => readRetrievalApi(this.app),
});
```

- [ ] **Step 3: Werkzeugliste je Anfrage bauen**

`TOOL_DEFS` an der Übergabestelle ersetzen. `status()` ist synchron und netzfrei, darf also hier stehen:

```ts
const retrievalApi = readRetrievalApi(this.app);
const defs = toolDefs({ related: retrievalApi?.status().indexed === true });
// … messages, defs, onToken, onReasoning, signal,
```

- [ ] **Step 4: Gate**

Run: `npm run gate`
Expected: alles grün

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat: Retrieval-Andockung verdrahten"
```

---

### Task 6: Dokumentation angleichen

**Files:**
- Modify: `README.md`, `README.de.md` (falls vorhanden), `CLAUDE.md`, `docs/SMOKE.md`, `docs/NEXT-SESSION.md`
- Modify: `../REGISTRY.md` (Dach)

- [ ] **Step 1: README** — Werkzeug-Aufzählung um `related_notes` erweitern, hybride Suche als optionales Zusammenspiel mit Vault Retrieval beschreiben. Ausdrücklich: **ohne** vault-rag funktioniert Koda unverändert.

- [ ] **Step 2: CLAUDE.md** — Werkzeugliste und Statuszeile aktualisieren, Verweis auf Spec und Dach-Zuschnitt.

- [ ] **Step 3: docs/SMOKE.md** — drei Prüfpunkte ergänzen: hybride Suche mit dünnem Volltext, `related_notes` auf indexierter Notiz, Lauf mit deaktiviertem vault-rag (Werkzeug fehlt, Suche unverändert).

- [ ] **Step 4: REGISTRY.md (Dach)** — Zeile „Plugin-zu-Plugin-API zwischen Obsidian-Plugins" mit Ort und Status.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md docs/SMOKE.md docs/NEXT-SESSION.md
git commit -m "docs: Retrieval-Andockung dokumentieren"
```

---

### Task 7: Release 0.3.0

- [ ] **Step 1: Voraussetzung prüfen** — vault-rag muss die API in einem getaggten Release haben. Ist die dortige Arbeit noch uncommitted oder ungetaggt: **hier anhalten** und melden, nicht releasen.
- [ ] **Step 2:** `npm run gate` — muss vollständig grün sein.
- [ ] **Step 3:** `npm run preflight`
- [ ] **Step 4:** `npm run version-bump` auf `0.3.0`
- [ ] **Step 5:** `npm run release`
- [ ] **Step 6:** Prüfen, worauf der GitHub-Tag zeigt (`git ls-remote --tags github`) — der native Forgejo-Push-Mirror ist oft schneller als der Dual-Push, dann meldet `release.mjs` fälschlich „Store-Release entsteht erst nach manuellem Push" (Dach-AGENTS.md).
- [ ] **Step 7:** Melden, dass der Store-Rescan im Developer Dashboard aussteht — das kann nur der Maintainer.
