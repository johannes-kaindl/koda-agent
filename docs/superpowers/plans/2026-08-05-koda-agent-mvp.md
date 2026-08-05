# Koda Agent MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chat-Sidebar-Plugin, in dem ein LLM-Agent den Vault durchsucht/liest/beschreibt (Koda-Ordner frei, Rest bestätigt) und über eine Memory-Notiz lernt — store-sauber ab Commit 1.

**Architecture:** Purer TypeScript-Agent-Loop (`src/core/agent/`) mit injizierten Ports (`LlmPort`, `ToolRunner`); Obsidian-Adapter außen (`src/obsidian/`). LLM-Schicht nach dem KuroChatClient-Muster (XHR-SSE, injizierter Transport + ClockPort), erweitert um natives OpenAI-Tool-Calling mit eigenem SSE-Parser. Kit-Module werden **vendored** (nie als npm-Dependency — Ökosystem-Konvention).

**Tech Stack:** TypeScript strict, esbuild (cjs-Bundle → `main.js` im Repo-Root), vitest (node-env, `pool: "forks"`), eslint-plugin-obsidianmd (Store-Scanner), obsidian-kit @0.23.0 vendored.

## Global Constraints

- Spec: `../specs/2026-08-05-koda-agent-mvp-design.md` — bei Widerspruch gilt die Spec.
- `manifest.json`: id `koda-agent`, minAppVersion **1.8.7**, `description` ohne die Wörter "Obsidian" und "plugin", `isDesktopOnly: false`.
- `src/core/` importiert NIE `obsidian` (Gate `check:pure`).
- KEIN inline `eslint-disable` in `src/` (Gate + Store-Review). Ausnahmen nur file-scoped in `eslint.config.mjs` mit Begründung.
- Timer nur über den vendorten `ClockPort` (`src/vendor/kit-obsidian/clock.ts`), nie bare `setTimeout` in getestetem Code.
- Alle UI-Strings über `t(key, ...)` (Kit-i18n, DE+EN — PROF-OBS-07). Tool-Beschreibungen für das Modell sind Englisch und NICHT i18n.
- Vendorte Dateien (`src/vendor/**`, `tests/vendor/**`) NIE von Hand editieren — nur via `tools/sync-kit.sh`.
- In getrackten `.md`-Dateien keine absoluten Maintainer-Pfade (`check-no-abs-paths`); Nachbar-Repos relativ referenzieren (`../vault-rag/…`).
- Commits: konventionelle Präfixe (`feat:`, `test:`, `docs:`, `chore:`); nach jedem Task ist `npm run gate` grün.
- Das Nachbar-Repo-Kit liegt unter `../obsidian-kit` (Dach-Verzeichnis-Annahme wie bei allen Repos).

---

### Task 1: Scaffold + Gates

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `tsconfig.scripts.json`, `vitest.config.ts`, `esbuild.config.mjs`, `eslint.config.mjs`, `manifest.json`, `versions.json`, `styles.css`, `.gitignore`, `src/main.ts` (Stub), `tests/smoke.test.ts`
- Create: `scripts/check-pure.mjs`, `scripts/check-no-nul-bytes.mjs`, `scripts/check-no-inline-disables.mjs`, `scripts/check-no-abs-paths.mjs`

**Interfaces:**
- Produces: lauffähiges Build-/Test-/Lint-Gerüst; `npm run gate` grün. Alle späteren Tasks verlassen sich auf die npm-Scripts aus diesem Task.

- [ ] **Step 1: Gate-Skripte aus Nachbar-Repos kopieren (kanonische Quellen, byte-identisch)**

```bash
cp ../3d-codeblocks/scripts/check-pure.mjs scripts/check-pure.mjs
cp ../3d-codeblocks/scripts/check-no-nul-bytes.mjs scripts/check-no-nul-bytes.mjs
cp ../epub-exporter/scripts/check-no-inline-disables.mjs scripts/check-no-inline-disables.mjs
cp ../kuro-gamification/scripts/check-no-abs-paths.mjs scripts/check-no-abs-paths.mjs
```

Danach in `scripts/check-pure.mjs` die Zeile `const FORBIDDEN = …` anpassen — Koda verbietet nur `obsidian` (kein three):

```js
const FORBIDDEN = /(?:from|import)\s*\(?\s*["'](obsidian)(\/[^"']*)?["']/;
```

- [ ] **Step 2: package.json schreiben**

```json
{
  "name": "koda-agent",
  "version": "0.1.0",
  "private": true,
  "description": "Agentic vault companion: chat, search, and note-writing with approval.",
  "license": "AGPL-3.0-or-later",
  "author": { "name": "Jay", "url": "https://github.com/v6t2b9" },
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc -p tsconfig.build.json -noEmit -skipLibCheck && node esbuild.config.mjs production",
    "test": "node scripts/check-no-abs-paths.mjs && vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.build.json --noEmit",
    "typecheck:scripts": "tsc -p tsconfig.scripts.json --noEmit",
    "lint": "node scripts/check-no-inline-disables.mjs && eslint src --max-warnings 0",
    "check:pure": "node scripts/check-pure.mjs && node scripts/check-no-nul-bytes.mjs",
    "gate": "npm run lint && npm run typecheck && npm run typecheck:scripts && npm test && npm run check:pure && npm run build",
    "lab:tools": "esbuild scripts/koda-lab.ts --bundle --platform=node --format=esm --outfile=.lab-tools.mjs --log-level=warning && node .lab-tools.mjs"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "esbuild": "^0.21.0",
    "eslint": "^9.39.5",
    "eslint-plugin-obsidianmd": "^0.4.1",
    "obsidian": "^1.13.1",
    "typescript": "^5.4.0",
    "typescript-eslint": "^8.65.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 3: tsconfigs schreiben**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "inlineSourceMap": true,
    "inlineSources": true,
    "module": "ESNext",
    "target": "ES2018",
    "allowSyntheticDefaultImports": true,
    "moduleResolution": "bundler",
    "importHelpers": true,
    "isolatedModules": true,
    "strict": true,
    "noUnusedLocals": false,
    "noImplicitAny": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "lib": ["ES2018", "DOM"],
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

`tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src/**/*.ts"]
}
```

`tsconfig.scripts.json` (nach dem transmute-Muster — Skripte typchecken mit):

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src/**/*.ts", "scripts/**/*.ts"]
}
```

- [ ] **Step 4: vitest.config.ts schreiben**

⚠️ `pool: "forks"` ist load-bearing: mit dem Re-Export-Mock (Task 2) crasht der Default-Pool `threads` intermittierend mit V8-FATALs (gemessen in image-to-markdown: threads 4/30, forks 0/30).

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    pool: "forks",
  },
  resolve: {
    alias: {
      // Mock-Alias gehoert in vitest, NIE in tsconfig.json (PROF-OBS-08):
      obsidian: fileURLToPath(new URL("./tests/__mocks__/obsidian.ts", import.meta.url)),
    },
  },
});
```

- [ ] **Step 5: esbuild.config.mjs kopieren und anpassen**

`../kuro-gamification/esbuild.config.mjs` verbatim kopieren, nur die zwei `[kuro-build]`-Log-Präfixe auf `[koda-build]` ändern.

- [ ] **Step 6: eslint.config.mjs schreiben** (Muster kuro-gamification, ohne Biome)

```js
import obsidianmd from "eslint-plugin-obsidianmd";

// ESLint v9 flat config — der lokale Spiegel des Community-Store-Scanners.
export default [
  {
    ignores: [
      "main.js",
      "coverage/**",
      "node_modules/**",
      "tests/**",
      ".remember/**",
      "docs/**",
      "*.config.mjs",
      "*.config.ts",
      "*.config.js",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.build.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // display()/setWarning() sind ab 1.13 deprecated; Koda haelt minAppVersion 1.8.7
    // und braucht den display()-Fallback deshalb bewusst (wie kuro-gamification).
    // confirm.ts ist verbatim aus obsidian-kit vendored (nie von Hand editieren).
    files: ["src/obsidian/settings.ts", "src/vendor/kit-obsidian/confirm.ts"],
    rules: {
      "@typescript-eslint/no-deprecated": "off",
    },
  },
];
```

- [ ] **Step 7: manifest.json, versions.json, styles.css, .gitignore schreiben**

`manifest.json`:

```json
{
  "id": "koda-agent",
  "name": "Koda",
  "version": "0.1.0",
  "minAppVersion": "1.8.7",
  "description": "Agentic vault companion: chat with an assistant that searches and reads your notes, writes only with your approval, and learns through a transparent memory note.",
  "author": "Jay",
  "authorUrl": "https://github.com/v6t2b9",
  "isDesktopOnly": false
}
```

`versions.json`: `{}` (füllt das Release-Tooling). `styles.css`: leer anlegen (Task 13 füllt sie). `.gitignore`:

```
node_modules/
main.js
coverage/
.lab-tools.mjs
```

- [ ] **Step 8: Stub `src/main.ts` + Smoke-Test schreiben**

`src/main.ts`:

```ts
import { Plugin } from "obsidian";

export default class KodaPlugin extends Plugin {
  onload(): void {
    // Wiring folgt in spaeteren Tasks.
  }
}
```

`tests/smoke.test.ts` (beweist nur, dass der Test-Runner läuft; fliegt in Task 3 raus):

```ts
describe("scaffold", () => {
  it("test runner is alive", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Übergangs-Mock, damit der Alias auflöst (wird in Task 2 durch den Kit-Re-Export ersetzt) — `tests/__mocks__/obsidian.ts`:

```ts
export class Plugin {}
```

- [ ] **Step 9: Installieren und Gate fahren**

Run: `npm install && npm run gate`
Expected: alle Schritte grün (lint/typecheck/test/check:pure/build; `main.js` entsteht).

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "chore: scaffold — build/test/lint gates nach Oekosystem-Standard"
```

---

### Task 2: Kit vendoren (sync-kit.sh + Test-Mock)

**Files:**
- Create: `tools/sync-kit.sh`, `src/vendor/kit/{think-splitter,reasoning,endpoint,endpoint_config,settings,i18n,num}.ts` + `VENDOR.json`, `src/vendor/kit-obsidian/{clock,confirm,folder-suggest}.ts` + `VENDOR.json`, `tests/vendor/kit/obsidian-mock.ts`
- Modify: `tests/__mocks__/obsidian.ts`

**Interfaces:**
- Produces: `ThinkSplitter`, `suppressParams`/`isAlwaysOnThinker`, `normalizeEndpoint`, `EndpointConfig`/`authHeaders`/`effectiveModel`/`migrateEndpointList`/`applyEndpointEdit`/`moveEndpointToFront`, `mergeSettings<T>`, `defineStrings`/`t`/`pickLang`/`setLang`/`getLang`, `clampInt`, `ClockPort`/`realClock`, `confirmAction`/`applyDestructive`, `FolderSuggest`, `createObsidianMock` — alle unter `src/vendor/…` bzw. `tests/vendor/…`. Kein kit-`parseSSE`: Koda hat in Task 5 einen eigenen Agent-SSE-Parser (tool_calls).

- [ ] **Step 1: `tools/sync-kit.sh` schreiben** (Muster `../obsidian-paperize/tools/sync-kit.sh`, gleiche `stamp`-Mechanik, flaches VENDOR.json-Schema)

```sh
#!/bin/sh
# Re-vendor kit modules from ../obsidian-kit. Run after kit updates.
set -e

KIT=../obsidian-kit
VER=$(node -p "require('$KIT/package.json').version")
SHA=$(git -C "$KIT" rev-parse --short HEAD)

stamp() { # stamp <vendored-file> <kit-relative-path>
  header="// vendored from obsidian-kit@$VER, $2 — do not hand-edit; re-vendor via tools/sync-kit.sh"
  printf '%s\n' "$header" | cat - "$1" > "$1.tmp"
  mv "$1.tmp" "$1"
}

mkdir -p src/vendor/kit src/vendor/kit-obsidian tests/vendor/kit

for m in think-splitter reasoning endpoint endpoint_config settings i18n num; do
  cp "$KIT/src/pure/$m.ts" "src/vendor/kit/$m.ts"
  stamp "src/vendor/kit/$m.ts" "src/pure/$m.ts"
  echo "vendored obsidian-kit@$VER/pure/$m.ts"
done

for m in clock confirm folder-suggest; do
  cp "$KIT/src/obsidian/$m.ts" "src/vendor/kit-obsidian/$m.ts"
  stamp "src/vendor/kit-obsidian/$m.ts" "src/obsidian/$m.ts"
  echo "vendored obsidian-kit@$VER/obsidian/$m.ts"
done

cp "$KIT/src/testing/obsidian-mock.ts" "tests/vendor/kit/obsidian-mock.ts"
stamp "tests/vendor/kit/obsidian-mock.ts" "src/testing/obsidian-mock.ts"

cat > src/vendor/kit/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "vendored": "think-splitter.ts, reasoning.ts, endpoint.ts, endpoint_config.ts, settings.ts, i18n.ts, num.ts",
  "note": "Verbatim snapshot. Never hand-edit. Re-vendor via tools/sync-kit.sh. kit-obsidian/ und tests/vendor/kit/ siehe deren VENDOR.json."
}
JSON
cat > src/vendor/kit-obsidian/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "vendored": "clock.ts, confirm.ts, folder-suggest.ts",
  "note": "Verbatim snapshot. Never hand-edit. Re-vendor via tools/sync-kit.sh."
}
JSON
echo "VENDOR.json → $VER ($SHA)"
```

- [ ] **Step 2: Ausführen**

Run: `chmod +x tools/sync-kit.sh && ./tools/sync-kit.sh`
Expected: 11 Dateien vendored, zwei VENDOR.json mit Version 0.23.0 (oder neuer — dann Versionsnummer in diesem Plan-Kontext notieren).

- [ ] **Step 3: Test-Mock auf Kit-Re-Export umstellen**

`tests/__mocks__/obsidian.ts` ersetzen durch:

```ts
export * from "../vendor/kit/obsidian-mock";
```

- [ ] **Step 4: Gate fahren**

Run: `npm run gate`
Expected: grün. Falls `tsc` über vendorte Dateien stolpert (fehlende Referenzen): NICHT die vendorte Datei editieren, sondern das fehlende Modul zusätzlich in `sync-kit.sh` aufnehmen und neu vendoren.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: obsidian-kit vendored (pure + obsidian + testing mock)"
```

---

### Task 3: writePolicy + Pfad-Guard (pure, TDD)

**Files:**
- Create: `src/core/tools/path-guard.ts`, `src/core/tools/write-policy.ts`
- Test: `tests/path_guard.test.ts`, `tests/write_policy.test.ts`
- Delete: `tests/smoke.test.ts`

**Interfaces:**
- Produces: `resolveNotePath(rel: string): string` (throws bei Verstoß), `normalizeRel(rel: string): string`, `writePolicy(path: string, kodaFolder: string): "free" | "confirm"`. Task 10 (VaultTools) konsumiert beide.

- [ ] **Step 1: Failing Tests schreiben**

`tests/path_guard.test.ts`:

```ts
import { resolveNotePath } from "../src/core/tools/path-guard";

describe("resolveNotePath", () => {
  it("normalisiert Backslashes und ./-Segmente", () => {
    expect(resolveNotePath("Ordner\\.\\Note.md")).toBe("Ordner/Note.md");
  });
  it("wirft bei absolutem Pfad", () => {
    expect(() => resolveNotePath("/etc/passwd.md")).toThrow(/vault-relativ/i);
  });
  it("wirft bei ..-Traversal", () => {
    expect(() => resolveNotePath("a/../../geheim.md")).toThrow(/verlässt/);
  });
  it("wirft bei Nicht-Markdown", () => {
    expect(() => resolveNotePath("bild.png")).toThrow(/\.md/);
  });
  it("akzeptiert Gross-Klein-Varianten von .MD", () => {
    expect(resolveNotePath("Note.MD")).toBe("Note.MD");
  });
});
```

`tests/write_policy.test.ts`:

```ts
import { writePolicy } from "../src/core/tools/write-policy";

describe("writePolicy", () => {
  it("Koda-Ordner selbst und darunter ist frei", () => {
    expect(writePolicy("Koda/Memory.md", "Koda")).toBe("free");
    expect(writePolicy("Koda/Entwürfe/idee.md", "Koda")).toBe("free");
  });
  it("Gross/klein zaehlt nicht als Unterschied", () => {
    expect(writePolicy("koda/x.md", "Koda")).toBe("free");
  });
  it("Praefix-Kollision ist KEIN Treffer (Koda-Archiv/ vs Koda/)", () => {
    expect(writePolicy("Koda-Archiv/x.md", "Koda")).toBe("confirm");
  });
  it("alles andere braucht Bestaetigung", () => {
    expect(writePolicy("Projekte/plan.md", "Koda")).toBe("confirm");
  });
  it("konfigurierter Ordner mit Slash-Suffix verhaelt sich identisch", () => {
    expect(writePolicy("Koda/x.md", "Koda/")).toBe("free");
  });
});
```

- [ ] **Step 2: Rot laufen lassen** — Run: `npx vitest run tests/path_guard.test.ts tests/write_policy.test.ts` · Expected: FAIL (Module fehlen).

- [ ] **Step 3: Implementieren**

`src/core/tools/path-guard.ts` (adaptiert aus `../vault-rag/src/retrieval_facade.ts` → `resolveNotePath`; Koda braucht keine exclude-Liste):

```ts
/** Path-Guard: vault-relativ, kein Traversal, nur .md. Reine String-Logik (kein node:path).
 *  Adaptiert aus vault-rag (security-reviewed), ohne exclude-Praefixe. */
export function normalizeRel(rel: string): string {
  return rel.split(/[\\/]/).filter((s) => s !== "" && s !== ".").join("/");
}

export function resolveNotePath(rel: string): string {
  if (rel.startsWith("/")) throw new Error(`Nur vault-relative Pfade erlaubt: "${rel}"`);
  const parts = rel.split(/[\\/]/).filter((s) => s !== "" && s !== ".");
  if (parts.some((s) => s === "..")) throw new Error(`Pfad verlässt den Vault: "${rel}"`);
  const norm = parts.join("/");
  if (!norm.toLowerCase().endsWith(".md")) throw new Error(`Nur Markdown-Notizen (.md) erlaubt: "${rel}"`);
  return norm;
}
```

`src/core/tools/write-policy.ts`:

```ts
import { normalizeRel } from "./path-guard";

export type WriteDecision = "free" | "confirm";

/** Schreibregel des MVP: im Koda-Ordner frei, sonst Bestaetigung.
 *  Vergleich case-insensitiv und segment-genau ("Koda-Archiv" matcht "Koda" NICHT). */
export function writePolicy(path: string, kodaFolder: string): WriteDecision {
  const p = normalizeRel(path).toLowerCase();
  const folder = normalizeRel(kodaFolder).toLowerCase();
  if (folder === "") return "confirm";
  return p === folder || p.startsWith(folder + "/") ? "free" : "confirm";
}
```

- [ ] **Step 4: Grün laufen lassen** — Run: `npx vitest run` · Expected: PASS. Dann `tests/smoke.test.ts` löschen.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: path-guard + writePolicy (pure, TDD)"`

---

### Task 4: Agent-Typen, Tool-Definitionen, Text-Fallback-Parser (pure, TDD)

**Files:**
- Create: `src/core/agent/types.ts`, `src/core/tools/defs.ts`, `src/core/agent/text-fallback.ts`
- Test: `tests/text_fallback.test.ts`, `tests/wire.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `ChatMessage { role: "system"|"user"|"assistant"|"tool"; content: string; toolCalls?: ToolCall[]; toolCallId?: string }` · `ToolCall { id: string; name: string; arguments: string }` · `ToolOutcome = { ok: true; content: string } | { ok: false; error: string }` · `ToolRunner { run(name: string, args: unknown): Promise<ToolOutcome> }` · `toWireMessages(msgs: ChatMessage[]): unknown[]` (OpenAI-Shape inkl. `tool_calls`/`tool_call_id`)
  - `defs.ts`: `ToolDef { name; description; parameters }` · `TOOL_DEFS: ToolDef[]` (search_notes, read_note, write_note, save_memory) · `toWireTools(defs: ToolDef[]): unknown[]`
  - `text-fallback.ts`: `parseTextToolCall(content: string): { name: string; arguments: string } | null`

- [ ] **Step 1: Failing Tests schreiben**

`tests/wire.test.ts`:

```ts
import { toWireMessages } from "../src/core/agent/types";

describe("toWireMessages", () => {
  it("mappt assistant-toolCalls in das tool_calls-Wire-Format", () => {
    const wire = toWireMessages([
      { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "read_note", arguments: '{"path":"A.md"}' }] },
      { role: "tool", content: "Inhalt", toolCallId: "c1" },
    ]);
    expect(wire[0]).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [{ id: "c1", type: "function", function: { name: "read_note", arguments: '{"path":"A.md"}' } }],
    });
    expect(wire[1]).toEqual({ role: "tool", content: "Inhalt", tool_call_id: "c1" });
  });
  it("laesst Nachrichten ohne toolCalls unangetastet", () => {
    expect(toWireMessages([{ role: "user", content: "Hi" }])).toEqual([{ role: "user", content: "Hi" }]);
  });
});
```

`tests/text_fallback.test.ts` (Muster: `firstJsonObject` aus `../obsidian-transmute/src/core/llm/response.ts`):

```ts
import { parseTextToolCall } from "../src/core/agent/text-fallback";

describe("parseTextToolCall", () => {
  it("erkennt ein JSON-Tool-Objekt im Fliesstext (auch in ```json-Fences)", () => {
    const c = 'Ich suche mal.\n```json\n{"tool":"search_notes","arguments":{"query":"Rezepte"}}\n```';
    expect(parseTextToolCall(c)).toEqual({ name: "search_notes", arguments: '{"query":"Rezepte"}' });
  });
  it("null bei normaler Prosa-Antwort", () => {
    expect(parseTextToolCall("Hier ist deine Antwort mit [[Link]].")).toBeNull();
  });
  it("null bei JSON ohne tool-Feld — kein falsch-positiver Zugriff", () => {
    expect(parseTextToolCall('{"regex":"a"}')).toBeNull();
  });
  it("ignoriert <think>-Blöcke vor dem JSON", () => {
    const c = '<think>{"tool":"x"}</think>{"tool":"read_note","arguments":{"path":"A.md"}}';
    expect(parseTextToolCall(c)).toEqual({ name: "read_note", arguments: '{"path":"A.md"}' });
  });
});
```

- [ ] **Step 2: Rot** — Run: `npx vitest run tests/wire.test.ts tests/text_fallback.test.ts` · Expected: FAIL.

- [ ] **Step 3: Implementieren**

`src/core/agent/types.ts`:

```ts
export interface ToolCall { id: string; name: string; arguments: string }

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export type ToolOutcome = { ok: true; content: string } | { ok: false; error: string };

export interface ToolRunner {
  run(name: string, args: unknown): Promise<ToolOutcome>;
}

/** ChatMessage → OpenAI-Wire-Format. Die interne Form bleibt flach und testbar,
 *  die Wire-Form entsteht nur am Transport-Rand. */
export function toWireMessages(msgs: ChatMessage[]): unknown[] {
  return msgs.map((m) => {
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: m.content,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: c.arguments },
        })),
      };
    }
    if (m.role === "tool") return { role: "tool", content: m.content, tool_call_id: m.toolCallId ?? "" };
    return { role: m.role, content: m.content };
  });
}
```

`src/core/tools/defs.ts` (Beschreibungen englisch — sie gehen ans Modell, nicht an den Nutzer):

```ts
export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "search_notes",
    description:
      "Search the vault by file name and full text. Returns matching note paths with a short snippet. Use before answering questions about the vault.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term (case-insensitive substring)" },
        max_results: { type: "integer", description: "Maximum results, default 10" },
      },
      required: ["query"],
    },
  },
  {
    name: "read_note",
    description: "Read the full content of one Markdown note. Path must be vault-relative and end in .md.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Vault-relative path, e.g. Projekte/Plan.md" } },
      required: ["path"],
    },
  },
  {
    name: "write_note",
    description:
      "Create, append to, or replace a Markdown note. Writing outside the Koda folder requires the user's approval; a rejected write is reported back to you.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path ending in .md" },
        content: { type: "string", description: "Markdown content to write" },
        mode: { type: "string", enum: ["create", "append", "replace"] },
      },
      required: ["path", "content", "mode"],
    },
  },
  {
    name: "save_memory",
    description:
      "Append one learned fact, preference, or correction to Koda's persistent memory note. Use sparingly for durable knowledge, not conversation details.",
    parameters: {
      type: "object",
      properties: { text: { type: "string", description: "One concise memory line" } },
      required: ["text"],
    },
  },
];

export function toWireTools(defs: ToolDef[]): unknown[] {
  return defs.map((d) => ({ type: "function", function: d }));
}
```

`src/core/agent/text-fallback.ts`:

```ts
/** Fallback fuer Modelle ohne natives Tool-Calling (Dicke laut koda-lab-Messung):
 *  findet ein {"tool": …, "arguments": …}-Objekt im Antworttext.
 *  firstJsonObject-Scanner nach dem transmute-Muster (balancierte Klammern, Strings uebersprungen). */
function stripThink(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*?<\/think>/, "");
}

function stripFence(raw: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  return fenced ? fenced[1] : raw;
}

function firstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

export function parseTextToolCall(content: string): { name: string; arguments: string } | null {
  const candidate = firstJsonObject(stripFence(stripThink(content)));
  if (candidate === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.tool !== "string" || obj.tool.length === 0) return null;
  const args = obj.arguments !== undefined ? JSON.stringify(obj.arguments) : "{}";
  return { name: obj.tool, arguments: args };
}
```

- [ ] **Step 4: Grün** — Run: `npx vitest run` · Expected: PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: agent-typen, tool-defs, text-fallback-parser"`

---

### Task 5: Agent-SSE-Parser + ToolCallAssembler (pure, TDD)

**Files:**
- Create: `src/core/agent/stream.ts`
- Test: `tests/stream.test.ts`

**Interfaces:**
- Produces: `parseAgentSSE(buffer: string): AgentSSE` mit `AgentSSE { content: string[]; reasoning: string[]; toolCalls: ToolCallDelta[]; finishReason?: string; rest: string; done: boolean }` · `ToolCallDelta { index: number; id?: string; name?: string; argsDelta?: string }` · `class ToolCallAssembler { push(d: ToolCallDelta): void; finish(): ToolCall[] }`. Task 6 (Client) konsumiert beides.
- Kontext: Kit-`parseSSE` kennt keine `tool_calls`-Deltas — dieser Parser ist das plugin-spezifische Pendant (gleiche `rest`-Semantik). Registry-Eintrag nach MVP: erstes Exemplar „SSE-Parser mit tool_calls".

- [ ] **Step 1: Failing Tests schreiben**

`tests/stream.test.ts`:

```ts
import { parseAgentSSE, ToolCallAssembler } from "../src/core/agent/stream";

const line = (obj: unknown): string => `data: ${JSON.stringify(obj)}\n`;

describe("parseAgentSSE", () => {
  it("liefert content- und reasoning-Deltas", () => {
    const r = parseAgentSSE(
      line({ choices: [{ delta: { content: "Hal" } }] }) +
      line({ choices: [{ delta: { reasoning_content: "denk" } }] }),
    );
    expect(r.content).toEqual(["Hal"]);
    expect(r.reasoning).toEqual(["denk"]);
    expect(r.done).toBe(false);
  });
  it("sammelt tool_calls-Deltas mit index/id/name/argsDelta", () => {
    const r = parseAgentSSE(
      line({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "read_note", arguments: "" } }] } }] }) +
      line({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"path":' } }] } }] }) +
      line({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"A.md"}' } }] } }] }),
    );
    expect(r.toolCalls).toEqual([
      { index: 0, id: "c1", name: "read_note", argsDelta: "" },
      { index: 0, argsDelta: '{"path":' },
      { index: 0, argsDelta: '"A.md"}' },
    ]);
  });
  it("faengt finish_reason und [DONE]", () => {
    const r = parseAgentSSE(line({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }) + "data: [DONE]\n");
    expect(r.finishReason).toBe("tool_calls");
    expect(r.done).toBe(true);
  });
  it("unvollstaendige letzte Zeile bleibt in rest", () => {
    const r = parseAgentSSE(line({ choices: [{ delta: { content: "x" } }] }) + 'data: {"cho');
    expect(r.content).toEqual(["x"]);
    expect(r.rest).toBe('data: {"cho');
  });
  it("vertraegt \\r\\n-Zeilenenden und kaputtes JSON (Zeile wird uebersprungen)", () => {
    const r = parseAgentSSE('data: {kaputt}\r\n' + line({ choices: [{ delta: { content: "ok" } }] }));
    expect(r.content).toEqual(["ok"]);
  });
});

describe("ToolCallAssembler", () => {
  it("baut aus Deltas vollstaendige ToolCalls, nach index sortiert", () => {
    const a = new ToolCallAssembler();
    a.push({ index: 1, id: "c2", name: "search_notes", argsDelta: '{"query":"x"}' });
    a.push({ index: 0, id: "c1", name: "read_note", argsDelta: '{"path":' });
    a.push({ index: 0, argsDelta: '"A.md"}' });
    expect(a.finish()).toEqual([
      { id: "c1", name: "read_note", arguments: '{"path":"A.md"}' },
      { id: "c2", name: "search_notes", arguments: '{"query":"x"}' },
    ]);
  });
  it("laesst Eintraege ohne name weg (kaputter Stream)", () => {
    const a = new ToolCallAssembler();
    a.push({ index: 0, argsDelta: "{}" });
    expect(a.finish()).toEqual([]);
  });
  it("vergibt eine Fallback-id, wenn der Server keine schickt", () => {
    const a = new ToolCallAssembler();
    a.push({ index: 0, name: "read_note", argsDelta: "{}" });
    expect(a.finish()[0].id).toBe("call_0");
  });
});
```

- [ ] **Step 2: Rot** — Run: `npx vitest run tests/stream.test.ts` · Expected: FAIL.

- [ ] **Step 3: Implementieren**

`src/core/agent/stream.ts`:

```ts
import type { ToolCall } from "./types";

export interface ToolCallDelta {
  index: number;
  id?: string;
  name?: string;
  argsDelta?: string;
}

export interface AgentSSE {
  content: string[];
  reasoning: string[];
  toolCalls: ToolCallDelta[];
  finishReason?: string;
  rest: string;
  done: boolean;
}

/** SSE-Parser fuer den Agent-Pfad. Gleiche rest-Semantik wie Kit-parseSSE
 *  (unvollstaendige letzte Zeile bleibt liegen), zusaetzlich tool_calls-Deltas
 *  und finish_reason — beides kennt der Kit-Parser nicht. */
export function parseAgentSSE(buffer: string): AgentSSE {
  const out: AgentSSE = { content: [], reasoning: [], toolCalls: [], rest: "", done: false };
  const lastBreak = buffer.lastIndexOf("\n");
  const complete = lastBreak === -1 ? "" : buffer.slice(0, lastBreak + 1);
  out.rest = lastBreak === -1 ? buffer : buffer.slice(lastBreak + 1);

  for (const rawLine of complete.split(/\r?\n/)) {
    const lineText = rawLine.trim();
    if (!lineText.startsWith("data:")) continue;
    const payload = lineText.slice(5).trim();
    if (payload === "[DONE]") {
      out.done = true;
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      continue; // halbes/kaputtes JSON: Zeile verwerfen, Stream weiterlesen
    }
    const choice = firstChoice(parsed);
    if (choice === null) continue;
    const finish = choice.finish_reason;
    if (typeof finish === "string" && out.finishReason === undefined) out.finishReason = finish;
    const delta = isRecord(choice.delta) ? choice.delta : {};
    if (typeof delta.content === "string" && delta.content !== "") out.content.push(delta.content);
    const reasoning = delta.reasoning_content ?? delta.reasoning;
    if (typeof reasoning === "string" && reasoning !== "") out.reasoning.push(reasoning);
    if (Array.isArray(delta.tool_calls)) {
      delta.tool_calls.forEach((tc: unknown, i: number) => {
        if (!isRecord(tc)) return;
        const fn = isRecord(tc.function) ? tc.function : {};
        out.toolCalls.push({
          index: typeof tc.index === "number" ? tc.index : i,
          ...(typeof tc.id === "string" ? { id: tc.id } : {}),
          ...(typeof fn.name === "string" ? { name: fn.name } : {}),
          ...(typeof fn.arguments === "string" ? { argsDelta: fn.arguments } : {}),
        });
      });
    }
  }
  return out;
}

/** Sammelt tool_calls-Deltas eines Streams zu fertigen ToolCalls ein. */
export class ToolCallAssembler {
  private map = new Map<number, { id: string; name: string; args: string }>();

  push(d: ToolCallDelta): void {
    const entry = this.map.get(d.index) ?? { id: "", name: "", args: "" };
    if (d.id !== undefined) entry.id = d.id;
    if (d.name !== undefined) entry.name = d.name;
    if (d.argsDelta !== undefined) entry.args += d.argsDelta;
    this.map.set(d.index, entry);
  }

  finish(): ToolCall[] {
    return [...this.map.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, e]) => e.name !== "")
      .map(([index, e]) => ({ id: e.id !== "" ? e.id : `call_${index}`, name: e.name, arguments: e.args }));
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function firstChoice(res: unknown): Record<string, unknown> | null {
  if (!isRecord(res) || !Array.isArray(res.choices) || res.choices.length === 0) return null;
  return isRecord(res.choices[0]) ? res.choices[0] : null;
}
```

- [ ] **Step 4: Grün** — Run: `npx vitest run` · Expected: PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: agent-SSE-parser mit tool_calls + assembler (TDD)"`

---

### Task 6: chat_error übernehmen (Kit-Kandidat → n=3)

**Files:**
- Create: `src/core/llm/chat-error.ts`
- Test: `tests/chat_error.test.ts`

**Interfaces:**
- Produces: `ChatHttpError(status, body)`, `chatErrorMessage(e: unknown): string`, `extractErrorMessage(body: unknown): string | null`. Task 7 wirft/übersetzt damit HTTP-Fehler.

- [ ] **Step 1: Quelle + Tests kopieren**

```bash
cp ../vault-rag/src/chat_error.ts src/core/llm/chat-error.ts
cp ../vault-rag/tests/chat_error.test.ts tests/chat_error.test.ts
```

Im Test den Import auf `../src/core/llm/chat-error` umbiegen. Quell-Datei inhaltlich NICHT verändern (Übernahme zählt als 3. Exemplar des Kit-Kandidaten; Divergenz würde die Extraktion verwässern). Die deutschen Fehlertexte sind akzeptiert — sie sind das vendorte Muster; die i18n-Pflicht gilt für Koda-eigene UI-Strings.

- [ ] **Step 2: Grün** — Run: `npx vitest run tests/chat_error.test.ts` · Expected: PASS (alle übernommenen Fälle).
- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat: chat_error uebernommen (vault-rag-Muster, Kit-Kandidat n=3)"`

---

### Task 7: KodaChatClient + XhrSseTransport

**Files:**
- Create: `src/llm/KodaChatClient.ts`, `src/llm/XhrSseTransport.ts`
- Test: `tests/chat_client.test.ts`

**Interfaces:**
- Consumes: `parseAgentSSE`/`ToolCallAssembler` (Task 5), `toWireMessages`/`toWireTools`/`ChatMessage`/`ToolCall` (Task 4), `ThinkSplitter`/`suppressParams`/`isAlwaysOnThinker`/`normalizeEndpoint`/`authHeaders` (vendor), `ClockPort`/`realClock` (vendor), `ChatHttpError` (Task 6).
- Produces:
  - `SseTransport { postStream(url, body, headers, onChunk, signal): Promise<number> }` (identisch zum Kuro-Muster; `XhrSseTransport` implementiert es verbatim nach `../kuro-gamification/src/llm/XhrSseTransport.ts`, nur der Import zeigt auf `./KodaChatClient`)
  - `ChatConfig { endpoint: string; apiKey: string; model: string; suppressThinking: boolean }`
  - `LlmResult = { ok: true; content: string; toolCalls: ToolCall[]; finishReason?: string } | { ok: false; kind: "aborted"|"http"|"network"|"timeout"; detail: string; partial: string }`
  - `class KodaChatClient { constructor(transport, timeoutMs?, clock?); complete(cfg, messages, tools, onToken, onReasoning, signal): Promise<LlmResult> }`

- [ ] **Step 1: Failing Tests schreiben**

`tests/chat_client.test.ts` (Fake-Transport, kein XHR):

```ts
import { KodaChatClient, type SseTransport } from "../src/llm/KodaChatClient";
import type { ChatMessage } from "../src/core/agent/types";

const cfg = { endpoint: "http://127.0.0.1:1234", apiKey: "", model: "m", suppressThinking: true };
const msgs: ChatMessage[] = [{ role: "user", content: "Hi" }];
const fakeClock = { now: () => 0, setTimeout: () => 1, clearTimeout: () => {} };

function transportOf(chunks: string[], status = 200): SseTransport {
  return {
    async postStream(_u, _b, _h, onChunk) {
      for (const c of chunks) onChunk(c);
      return status;
    },
  };
}

const line = (obj: unknown): string => `data: ${JSON.stringify(obj)}\n`;

describe("KodaChatClient.complete", () => {
  it("streamt content-Token und liefert das Akkumulat", async () => {
    const client = new KodaChatClient(transportOf([
      line({ choices: [{ delta: { content: "Hal" } }] }),
      line({ choices: [{ delta: { content: "lo" } }] }) + "data: [DONE]\n",
    ]), 1000, fakeClock);
    const tokens: string[] = [];
    const r = await client.complete(cfg, msgs, [], (t) => tokens.push(t), () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: true, content: "Hallo", toolCalls: [] });
    expect(tokens.join("")).toBe("Hallo");
  });

  it("assembliert tool_calls ueber mehrere Chunks", async () => {
    const client = new KodaChatClient(transportOf([
      line({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "read_note", arguments: '{"path":' } }] } }] }),
      line({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"A.md"}' } }] }, }] }) +
        line({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }) + "data: [DONE]\n",
    ]), 1000, fakeClock);
    const r = await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(r).toMatchObject({
      ok: true,
      finishReason: "tool_calls",
      toolCalls: [{ id: "c1", name: "read_note", arguments: '{"path":"A.md"}' }],
    });
  });

  it("routet inline <think> in den reasoning-Kanal statt in den content", async () => {
    const client = new KodaChatClient(transportOf([
      line({ choices: [{ delta: { content: "<think>weil</think>Antwort" } }] }) + "data: [DONE]\n",
    ]), 1000, fakeClock);
    const reasoning: string[] = [];
    const r = await client.complete(cfg, msgs, [], () => {}, (t) => reasoning.push(t), new AbortController().signal);
    expect(r).toMatchObject({ ok: true, content: "Antwort" });
    expect(reasoning.join("")).toBe("weil");
  });

  it("uebersetzt HTTP-Fehlerstatus in kind http mit chatErrorMessage-Detail", async () => {
    const client = new KodaChatClient(transportOf(['{"detail":"Not authenticated"}'], 401), 1000, fakeClock);
    const r = await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, kind: "http" });
    if (!r.ok) expect(r.detail).toMatch(/Schlüssel/);
  });

  it("bereits abgebrochenes Signal startet den Transport gar nicht", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const client = new KodaChatClient(transportOf([]), 1000, fakeClock);
    const r = await client.complete(cfg, msgs, [], () => {}, () => {}, ctrl.signal);
    expect(r).toMatchObject({ ok: false, kind: "aborted" });
  });
});
```

- [ ] **Step 2: Rot** — Run: `npx vitest run tests/chat_client.test.ts` · Expected: FAIL.

- [ ] **Step 3: Implementieren**

`src/llm/XhrSseTransport.ts`: verbatim von `../kuro-gamification/src/llm/XhrSseTransport.ts` kopieren, Import-Zeile auf `./KodaChatClient` ändern.

`src/llm/KodaChatClient.ts` (Struktur = KuroChatClient; Unterschiede: Agent-Parser statt Kit-parseSSE, tools-Parameter, reasoning wird durchgereicht statt verworfen, LlmResult mit toolCalls):

```ts
/* Streaming-Call gegen /v1/chat/completions mit Tool-Calling — pure, kein Obsidian-Import.
   Struktur nach dem KuroChatClient-Muster (Transport + ClockPort injiziert, n=4 im Oekosystem). */
import { ThinkSplitter } from "../vendor/kit/think-splitter";
import { normalizeEndpoint } from "../vendor/kit/endpoint";
import { authHeaders } from "../vendor/kit/endpoint_config";
import { suppressParams, isAlwaysOnThinker } from "../vendor/kit/reasoning";
import { realClock, type ClockPort } from "../vendor/kit-obsidian/clock";
import { parseAgentSSE, ToolCallAssembler } from "../core/agent/stream";
import { toWireMessages, type ChatMessage, type ToolCall } from "../core/agent/types";
import { toWireTools, type ToolDef } from "../core/tools/defs";
import { ChatHttpError, chatErrorMessage } from "../core/llm/chat-error";

export interface SseTransport {
  postStream(
    url: string,
    body: unknown,
    headers: Record<string, string>,
    onChunk: (raw: string) => void,
    signal: AbortSignal,
  ): Promise<number>;
}

export interface ChatConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  suppressThinking: boolean;
}

export type LlmResult =
  | { ok: true; content: string; toolCalls: ToolCall[]; finishReason?: string }
  | { ok: false; kind: "aborted" | "http" | "network" | "timeout"; detail: string; partial: string };

const ERROR_BODY_CAP = 2048;
const DEFAULT_TIMEOUT_MS = 120_000;

export function effectiveSuppress(model: string, wanted: boolean): boolean {
  return wanted && !isAlwaysOnThinker(model);
}

export class KodaChatClient {
  constructor(
    private readonly transport: SseTransport,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
    private readonly clock: ClockPort = realClock,
  ) {}

  async complete(
    cfg: ChatConfig,
    messages: ChatMessage[],
    tools: ToolDef[],
    onToken: (t: string) => void,
    onReasoning: (t: string) => void,
    signal: AbortSignal,
  ): Promise<LlmResult> {
    if (signal.aborted) return { ok: false, kind: "aborted", detail: "stream aborted", partial: "" };

    const url = `${normalizeEndpoint(cfg.endpoint)}/v1/chat/completions`;
    const headers = authHeaders(cfg.apiKey === "" ? undefined : cfg.apiKey);
    const body: Record<string, unknown> = {
      model: cfg.model,
      messages: toWireMessages(messages),
      stream: true,
      temperature: 0.2,
      max_tokens: 2048,
      ...suppressParams(effectiveSuppress(cfg.model, cfg.suppressThinking)),
    };
    if (tools.length > 0) body.tools = toWireTools(tools);

    const ctrl = new AbortController();
    let timedOut = false;
    const onCallerAbort = (): void => ctrl.abort();
    signal.addEventListener("abort", onCallerAbort, { once: true });
    const timer = this.clock.setTimeout(() => { timedOut = true; ctrl.abort(); }, this.timeoutMs);

    const splitter = new ThinkSplitter();
    const assembler = new ToolCallAssembler();
    let content = "";
    let reasoning = "";
    let finishReason: string | undefined;
    let rest = "";
    let rawBody = "";

    const emit = (c: string, r: string): void => {
      if (c !== "") { content += c; onToken(c); }
      if (r !== "") { reasoning += r; onReasoning(r); }
    };
    const drainSplitter = (): void => {
      const tail = splitter.flush();
      emit(tail.content, tail.reasoning);
    };
    const consume = (raw: string): void => {
      if (rawBody.length < ERROR_BODY_CAP) rawBody += raw;
      const p = parseAgentSSE(rest + raw);
      rest = p.rest;
      if (p.finishReason !== undefined && finishReason === undefined) finishReason = p.finishReason;
      for (const r of p.reasoning) emit("", r);
      for (const c of p.content) { const s = splitter.push(c); emit(s.content, s.reasoning); }
      for (const d of p.toolCalls) assembler.push(d);
    };

    let status: number;
    try {
      status = await this.transport.postStream(url, body, headers, consume, ctrl.signal);
    } catch (e) {
      const err = e instanceof Error ? e : new Error("unknown stream error");
      drainSplitter();
      if (err.name === "AbortError") {
        return timedOut
          ? { ok: false, kind: "timeout", detail: `no answer within ${this.timeoutMs / 1000}s`, partial: content }
          : { ok: false, kind: "aborted", detail: "stream aborted", partial: content };
      }
      return { ok: false, kind: "network", detail: chatErrorMessage(err), partial: content };
    } finally {
      this.clock.clearTimeout(timer);
      signal.removeEventListener("abort", onCallerAbort);
    }

    drainSplitter();

    if (status < 200 || status >= 300) {
      return {
        ok: false,
        kind: "http",
        detail: chatErrorMessage(new ChatHttpError(status, rawBody.slice(0, ERROR_BODY_CAP))),
        partial: content,
      };
    }
    return { ok: true, content, toolCalls: assembler.finish(), ...(finishReason !== undefined ? { finishReason } : {}) };
  }
}
```

Hinweis: `reasoning` wird akkumuliert, aber nur via `onReasoning` nach außen gereicht — die View zeigt es einklappbar (Task 13); ins Gesprächs-Log geht es NICHT (sonst erklärt sich das Modell die eigenen Gedanken, ChatSession-Lektion aus kuro).

- [ ] **Step 4: Grün** — Run: `npx vitest run` · Expected: PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: KodaChatClient (streaming + tool-calling) nach KuroChatClient-Muster"`

---

### Task 8: koda-lab — Tool-Call-Zuverlässigkeit messen

**Files:**
- Create: `scripts/koda-lab.ts`, `docs/LAB.md` (Befund-Protokoll)

**Interfaces:**
- Consumes: `KodaChatClient` (Task 7 — Produktionscode, nicht gespiegelt; Lab-Muster n=2: `../obsidian-transmute/scripts/diagnose-lab.ts`), `TOOL_DEFS` (Task 4), `parseTextToolCall` (Task 4).
- Produces: Messbefund in `docs/LAB.md`; er entscheidet den Default von `textFallback` in Task 9 (Loop-Option). Spec-Vorgabe: dieser Task läuft VOR dem UI-Bau.

- [ ] **Step 1: Lab-Skript schreiben**

`scripts/koda-lab.ts`:

```ts
/**
 * koda-lab — misst je Modell eines lokalen OpenAI-kompatiblen Endpunkts,
 * ob natives Tool-Calling funktioniert (Muster: transmute/diagnose-lab, importiert Produktionscode).
 *
 *   npm run lab:tools
 *   npm run lab:tools -- --endpoint http://127.0.0.1:11434 --model qwen3:8b
 */
import { KodaChatClient, type SseTransport } from "../src/llm/KodaChatClient";
import { TOOL_DEFS } from "../src/core/tools/defs";
import { parseTextToolCall } from "../src/core/agent/text-fallback";
import type { ChatMessage } from "../src/core/agent/types";

/** fetch-basierter Streaming-Transport fuer Node — nur fuers Lab, nie im Plugin. */
const transport: SseTransport = {
  async postStream(url, body, headers, onChunk, signal) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal,
    });
    const reader = res.body?.getReader();
    if (reader) {
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        onChunk(dec.decode(value, { stream: true }));
      }
    }
    return res.status;
  },
};

const nodeClock = {
  now: () => Date.now(),
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id: number) => clearTimeout(id),
};

const CASES: { name: string; question: string; expectTool: string | null }[] = [
  { name: "Suche", question: "Welche Notizen habe ich zum Thema Rezepte? Bitte such im Vault.", expectTool: "search_notes" },
  { name: "Lesen", question: "Lies bitte die Notiz Koda/Memory.md und fasse sie zusammen.", expectTool: "read_note" },
  { name: "Kein Tool", question: "Was ist die Hauptstadt von Frankreich? Antworte direkt.", expectTool: null },
];

function flag(name: string): string | null {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? null : (process.argv[at + 1] ?? null);
}

async function listModels(endpoint: string): Promise<string[]> {
  const res = await fetch(`${endpoint}/v1/models`);
  const json = (await res.json()) as { data?: { id?: string }[] };
  return (json.data ?? []).map((m) => m.id ?? "").filter((id) => id !== "" && !id.includes("embed"));
}

async function main(): Promise<void> {
  const endpoint = flag("endpoint") ?? "http://127.0.0.1:1234";
  const models = flag("model") !== null ? [flag("model") as string] : await listModels(endpoint);
  if (models.length === 0) {
    console.log(`Kein Modell erreichbar unter ${endpoint} — läuft der Server?`);
    process.exitCode = 1;
    return;
  }
  const client = new KodaChatClient(transport, 180_000, nodeClock);
  const system: ChatMessage = {
    role: "system",
    content: "You are Koda, a vault assistant. Use the provided tools to search and read notes before answering.",
  };

  for (const model of models) {
    console.log(`\n${"=".repeat(72)}\nMODELL: ${model}\n${"=".repeat(72)}`);
    for (const c of CASES) {
      const started = Date.now();
      const r = await client.complete(
        { endpoint, apiKey: flag("apikey") ?? "", model, suppressThinking: true },
        [system, { role: "user", content: c.question }],
        TOOL_DEFS,
        () => {}, () => {},
        new AbortController().signal,
      );
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      if (!r.ok) {
        console.log(`  ${c.name}: FEHLER nach ${secs}s — ${r.detail.slice(0, 160)}`);
        continue;
      }
      const native = r.toolCalls.length > 0 ? r.toolCalls[0] : null;
      const textual = native === null ? parseTextToolCall(r.content) : null;
      const argsOk = ((): boolean => {
        const raw = native?.arguments ?? textual?.arguments;
        if (raw === undefined) return false;
        try { JSON.parse(raw); return true; } catch { return false; }
      })();
      const verdict =
        c.expectTool === null
          ? (native === null && textual === null ? "OK (direkt geantwortet)" : "ABWEICHUNG (unnoetiger Tool-Call)")
          : native?.name === c.expectTool
            ? `OK nativ (args ${argsOk ? "valide" : "KAPUTT"})`
            : textual?.name === c.expectTool
              ? `NUR TEXT-FALLBACK (args ${argsOk ? "valide" : "KAPUTT"})`
              : `FEHLT (content: ${r.content.slice(0, 80).replace(/\n/g, " ")})`;
      console.log(`  ${c.name}: ${verdict} · ${secs}s · finish=${r.finishReason ?? "-"}`);
    }
  }
}

void main();
```

- [ ] **Step 2: Typecheck** — Run: `npm run typecheck:scripts` · Expected: PASS.

- [ ] **Step 3: Gegen laufenden Endpoint messen**

Run: `npm run lab:tools` (LM Studio muss laufen; sonst `-- --endpoint http://127.0.0.1:11434` für Ollama).
Expected: Tabelle pro Modell. **Befund in `docs/LAB.md` protokollieren** (Datum, Endpoint, Modelle, je Fall OK/Fallback/FEHLT) — Vorlage:

```markdown
# koda-lab Befunde

## JJJJ-MM-TT · <endpoint>
| Modell | Suche | Lesen | Kein Tool | Konsequenz |
|---|---|---|---|---|
```

Entscheidung dokumentieren: liefern die Zielmodelle nativ zuverlässig → `textFallback` bleibt default `false`; überwiegt der Text-Fallback → default `true` (Task 9 setzt den Wert).

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: koda-lab — tool-call-messung gegen lokale modelle + befund"`

---

### Task 9: Agent-Loop (pure, TDD — das Herz)

**Files:**
- Create: `src/core/agent/loop.ts`
- Test: `tests/loop.test.ts`

**Interfaces:**
- Consumes: `ChatMessage`/`ToolCall`/`ToolOutcome`/`ToolRunner` (Task 4), `LlmResult`-Form (Task 7 — der Loop kennt aber nur das schmale `LoopLlm`-Interface unten, nicht den Client), `parseTextToolCall` (Task 4).
- Produces:
  - `LoopLlm { complete(messages: ChatMessage[], onToken, onReasoning, signal): Promise<LlmResult> }` (Task 13 adaptiert KodaChatClient darauf — Endpoint/Modell/Tools sind dort schon gebunden)
  - `AgentEvent = { kind: "tool-start"; call: ToolCall } | { kind: "tool-end"; call: ToolCall; outcome: ToolOutcome } | { kind: "final"; text: string } | { kind: "error"; message: string; partial: string } | { kind: "round-limit" }` (Token/Reasoning laufen über die onToken/onReasoning-Callbacks des LoopLlm)
  - `runAgent(deps: { llm: LoopLlm; tools: ToolRunner; maxRounds: number; textFallback: boolean }, history: ChatMessage[], onToken, onReasoning, onEvent, signal): Promise<ChatMessage[]>` — Rückgabe: die NEU angehängten Nachrichten (assistant/tool), Aufrufer persistiert sie.

- [ ] **Step 1: Failing Tests schreiben**

`tests/loop.test.ts`:

```ts
import { runAgent, type LoopLlm } from "../src/core/agent/loop";
import type { ChatMessage, ToolOutcome, ToolRunner } from "../src/core/agent/types";
import type { LlmResult } from "../src/llm/KodaChatClient";

const sig = (): AbortSignal => new AbortController().signal;
const user: ChatMessage[] = [{ role: "user", content: "Frage" }];

/** LoopLlm, das eine Skript-Liste von Antworten abspielt. */
function scripted(results: LlmResult[]): LoopLlm {
  let i = 0;
  return { complete: async () => results[Math.min(i++, results.length - 1)] };
}

const okTools: ToolRunner = {
  run: async (name): Promise<ToolOutcome> => ({ ok: true, content: `ergebnis von ${name}` }),
};

describe("runAgent", () => {
  it("ohne Tool-Calls: final-Event + eine assistant-Nachricht", async () => {
    const events: string[] = [];
    const out = await runAgent(
      { llm: scripted([{ ok: true, content: "Antwort", toolCalls: [] }]), tools: okTools, maxRounds: 8, textFallback: false },
      user, () => {}, () => {}, (e) => events.push(e.kind), sig(),
    );
    expect(events).toEqual(["final"]);
    expect(out).toEqual([{ role: "assistant", content: "Antwort" }]);
  });

  it("eine Tool-Runde: assistant(toolCalls) + tool + finale assistant-Nachricht", async () => {
    const events: string[] = [];
    const out = await runAgent(
      {
        llm: scripted([
          { ok: true, content: "", toolCalls: [{ id: "c1", name: "search_notes", arguments: '{"query":"x"}' }] },
          { ok: true, content: "Fertig", toolCalls: [] },
        ]),
        tools: okTools, maxRounds: 8, textFallback: false,
      },
      user, () => {}, () => {}, (e) => events.push(e.kind), sig(),
    );
    expect(events).toEqual(["tool-start", "tool-end", "final"]);
    expect(out.map((m) => m.role)).toEqual(["assistant", "tool", "assistant"]);
    expect(out[1]).toMatchObject({ role: "tool", toolCallId: "c1", content: "ergebnis von search_notes" });
  });

  it("Tool-Fehler geht als ERROR-Result zurueck ans Modell, kein Crash", async () => {
    const failing: ToolRunner = { run: async () => ({ ok: false, error: "Pfad geblockt" }) };
    const out = await runAgent(
      {
        llm: scripted([
          { ok: true, content: "", toolCalls: [{ id: "c1", name: "read_note", arguments: "{}" }] },
          { ok: true, content: "Verstanden", toolCalls: [] },
        ]),
        tools: failing, maxRounds: 8, textFallback: false,
      },
      user, () => {}, () => {}, () => {}, sig(),
    );
    expect(out[1].content).toBe("ERROR: Pfad geblockt");
  });

  it("ungueltiges Argument-JSON wird zum Tool-Fehler, nicht zur Exception", async () => {
    const out = await runAgent(
      {
        llm: scripted([
          { ok: true, content: "", toolCalls: [{ id: "c1", name: "read_note", arguments: "{kaputt" }] },
          { ok: true, content: "Ok", toolCalls: [] },
        ]),
        tools: okTools, maxRounds: 8, textFallback: false,
      },
      user, () => {}, () => {}, () => {}, sig(),
    );
    expect(out[1].content).toMatch(/^ERROR:/);
  });

  it("round-limit: nach maxRounds Tool-Runden kommt round-limit statt Endlosschleife", async () => {
    const events: string[] = [];
    await runAgent(
      {
        llm: scripted([{ ok: true, content: "", toolCalls: [{ id: "c", name: "search_notes", arguments: "{}" }] }]),
        tools: okTools, maxRounds: 2, textFallback: false,
      },
      user, () => {}, () => {}, (e) => events.push(e.kind), sig(),
    );
    expect(events.filter((k) => k === "tool-start")).toHaveLength(2);
    expect(events[events.length - 1]).toBe("round-limit");
  });

  it("LLM-Fehler: error-Event mit partial, Rueckgabe enthaelt den Teiltext als assistant", async () => {
    const events: { kind: string; partial?: string }[] = [];
    const out = await runAgent(
      { llm: scripted([{ ok: false, kind: "timeout", detail: "zu langsam", partial: "Teil" }]), tools: okTools, maxRounds: 8, textFallback: false },
      user, () => {}, () => {}, (e) => events.push(e as never), sig(),
    );
    expect(events[0]).toMatchObject({ kind: "error", partial: "Teil" });
    expect(out).toEqual([{ role: "assistant", content: "Teil" }]);
  });

  it("textFallback: erkennt JSON-Tool-Call im content, wenn keine nativen toolCalls kamen", async () => {
    const out = await runAgent(
      {
        llm: scripted([
          { ok: true, content: '{"tool":"search_notes","arguments":{"query":"x"}}', toolCalls: [] },
          { ok: true, content: "Fertig", toolCalls: [] },
        ]),
        tools: okTools, maxRounds: 8, textFallback: true,
      },
      user, () => {}, () => {}, () => {}, sig(),
    );
    expect(out.map((m) => m.role)).toEqual(["assistant", "tool", "assistant"]);
  });
});
```

- [ ] **Step 2: Rot** — Run: `npx vitest run tests/loop.test.ts` · Expected: FAIL.

- [ ] **Step 3: Implementieren**

`src/core/agent/loop.ts`:

```ts
import type { ChatMessage, ToolCall, ToolOutcome, ToolRunner } from "./types";
import type { LlmResult } from "../../llm/KodaChatClient";
import { parseTextToolCall } from "./text-fallback";

export interface LoopLlm {
  complete(
    messages: ChatMessage[],
    onToken: (t: string) => void,
    onReasoning: (t: string) => void,
    signal: AbortSignal,
  ): Promise<LlmResult>;
}

export type AgentEvent =
  | { kind: "tool-start"; call: ToolCall }
  | { kind: "tool-end"; call: ToolCall; outcome: ToolOutcome }
  | { kind: "final"; text: string }
  | { kind: "error"; message: string; partial: string }
  | { kind: "round-limit" };

export interface AgentDeps {
  llm: LoopLlm;
  tools: ToolRunner;
  maxRounds: number;
  /** true: JSON-Tool-Objekte im Antworttext werden als Tool-Call behandelt
   *  (Default laut koda-lab-Befund, docs/LAB.md). */
  textFallback: boolean;
}

/** Der Agent-Loop: LLM → Tools → LLM … bis finale Antwort, Fehler oder Runden-Limit.
 *  Pure: kennt nur die Ports. Rueckgabe sind die NEU erzeugten Nachrichten —
 *  der Aufrufer haengt sie an seine Session und persistiert. */
export async function runAgent(
  deps: AgentDeps,
  history: ChatMessage[],
  onToken: (t: string) => void,
  onReasoning: (t: string) => void,
  onEvent: (e: AgentEvent) => void,
  signal: AbortSignal,
): Promise<ChatMessage[]> {
  const appended: ChatMessage[] = [];
  const messages = (): ChatMessage[] => [...history, ...appended];

  for (let round = 0; round < deps.maxRounds; round++) {
    const r = await deps.llm.complete(messages(), onToken, onReasoning, signal);

    if (!r.ok) {
      if (r.partial !== "") appended.push({ role: "assistant", content: r.partial });
      onEvent({ kind: "error", message: r.detail, partial: r.partial });
      return appended;
    }

    let calls: ToolCall[] = r.toolCalls;
    if (calls.length === 0 && deps.textFallback) {
      const textual = parseTextToolCall(r.content);
      if (textual !== null) calls = [{ id: `text_${round}`, name: textual.name, arguments: textual.arguments }];
    }

    if (calls.length === 0) {
      appended.push({ role: "assistant", content: r.content });
      onEvent({ kind: "final", text: r.content });
      return appended;
    }

    appended.push({ role: "assistant", content: r.content, toolCalls: calls });
    for (const call of calls) {
      onEvent({ kind: "tool-start", call });
      const outcome = await runOne(deps.tools, call);
      onEvent({ kind: "tool-end", call, outcome });
      appended.push({
        role: "tool",
        toolCallId: call.id,
        content: outcome.ok ? outcome.content : `ERROR: ${outcome.error}`,
      });
    }
  }

  onEvent({ kind: "round-limit" });
  return appended;
}

async function runOne(tools: ToolRunner, call: ToolCall): Promise<ToolOutcome> {
  let args: unknown;
  try {
    args = call.arguments === "" ? {} : JSON.parse(call.arguments);
  } catch {
    return { ok: false, error: `ungültige Tool-Argumente (kein JSON): ${call.arguments.slice(0, 120)}` };
  }
  try {
    return await tools.run(call.name, args);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Tool-Ausführung fehlgeschlagen" };
  }
}
```

- [ ] **Step 4: Grün** — Run: `npx vitest run` · Expected: PASS. Danach `textFallback`-Default NICHT hier festlegen — der Wert kommt in Task 13 aus den Settings, Initialwert laut `docs/LAB.md`.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: agent-loop (rounds, tool-fehler, limit, abort) — TDD"`

---

### Task 10: Memory + System-Prompt (pure, TDD)

**Files:**
- Create: `src/core/memory/memory.ts`
- Test: `tests/memory.test.ts`

**Interfaces:**
- Produces: `buildSystemPrompt(opts: { lang: "de" | "en"; memory: string; kodaFolder: string }): string` · `appendMemoryLine(existing: string, text: string, isoDate: string): string` · `MEMORY_HEADER: string`. Task 13 lädt `Koda/Memory.md`, ruft `buildSystemPrompt`; das `save_memory`-Tool (Task 12) nutzt `appendMemoryLine`.

- [ ] **Step 1: Failing Tests schreiben**

`tests/memory.test.ts`:

```ts
import { appendMemoryLine, buildSystemPrompt, MEMORY_HEADER } from "../src/core/memory/memory";

describe("appendMemoryLine", () => {
  it("startet eine leere Memory mit Header + erster Zeile", () => {
    const r = appendMemoryLine("", "Jay mag kurze Antworten", "2026-08-05");
    expect(r.startsWith(MEMORY_HEADER)).toBe(true);
    expect(r).toContain("- [2026-08-05] Jay mag kurze Antworten");
  });
  it("haengt an bestehende Memory an, ohne sie umzubauen", () => {
    const existing = `${MEMORY_HEADER}\n- [2026-08-01] alt\n`;
    const r = appendMemoryLine(existing, "neu", "2026-08-05");
    expect(r).toBe(`${MEMORY_HEADER}\n- [2026-08-01] alt\n- [2026-08-05] neu\n`);
  });
});

describe("buildSystemPrompt", () => {
  it("enthaelt Sprache, Koda-Ordner und die Memory", () => {
    const p = buildSystemPrompt({ lang: "de", memory: "- [x] Fakt", kodaFolder: "Koda" });
    expect(p).toContain("German");
    expect(p).toContain("Koda/");
    expect(p).toContain("- [x] Fakt");
  });
  it("ohne Memory kein leerer Memory-Block", () => {
    expect(buildSystemPrompt({ lang: "en", memory: "", kodaFolder: "Koda" })).not.toContain("## Memory");
  });
});
```

- [ ] **Step 2: Rot** — Run: `npx vitest run tests/memory.test.ts` · Expected: FAIL.

- [ ] **Step 3: Implementieren**

`src/core/memory/memory.ts` (Zielsprache wird explizit benannt — Registry-Lektion „Zielsprache im Prompt nennen statt ‚in the user's language'"):

```ts
export const MEMORY_HEADER = "# Koda Memory\n\nVon Koda gepflegt — du kannst hier jederzeit editieren oder löschen.";

const LANGUAGE_NAME: Record<"de" | "en", string> = { de: "German", en: "English" };

export function appendMemoryLine(existing: string, text: string, isoDate: string): string {
  const base = existing.trim() === "" ? `${MEMORY_HEADER}\n` : existing.replace(/\n*$/, "\n");
  return `${base}- [${isoDate}] ${text}\n`;
}

export function buildSystemPrompt(opts: { lang: "de" | "en"; memory: string; kodaFolder: string }): string {
  const folder = opts.kodaFolder.replace(/\/+$/, "");
  const parts = [
    "You are Koda, a friendly companion living inside the user's personal knowledge vault.",
    `Always answer in ${LANGUAGE_NAME[opts.lang]}.`,
    "Use the provided tools to search and read notes BEFORE answering questions about the vault; cite notes as [[wikilinks]] (path without .md).",
    `You may write freely inside the folder "${folder}/". Writing anywhere else asks the user for approval — a rejection is an answer, respect it.`,
    "Use save_memory only for durable facts, preferences, or corrections — never for conversation details.",
    "If a tool fails, read the error, adjust, and try a different way. Never invent note contents.",
  ];
  if (opts.memory.trim() !== "") {
    parts.push(`## Memory\n${opts.memory.trim()}`);
  }
  return parts.join("\n\n");
}
```

- [ ] **Step 4: Grün** — Run: `npx vitest run` · Expected: PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: memory-notiz-logik + system-prompt (TDD)"`

---

### Task 11: Session-Store (JSONL, pure, TDD)

**Files:**
- Create: `src/core/memory/session.ts`
- Test: `tests/session.test.ts`

**Interfaces:**
- Consumes: `ChatMessage` (Task 4).
- Produces: `SessionSink { read(path: string): Promise<string | null>; write(path: string, data: string): Promise<void>; append(path: string, data: string): Promise<void> }` (Obsidians `vault.adapter` erfüllt das in Task 13 mit einem dünnen Wrapper) · `class SessionStore { constructor(sink, dir: string); load(): Promise<ChatMessage[]>; appendMessages(msgs: ChatMessage[]): Promise<void>; startNew(): Promise<void> }` · `serializeLine(m: ChatMessage): string` · `parseLines(text: string): ChatMessage[]`.
- Ablage: `<dir>/current.jsonl` (aktuelles Gespräch), `<dir>/archive.jsonl` (bei „Neues Gespräch" wird current angehängt und geleert). Fehler beim Append werden geschluckt (traceStore-Lektion: Telemetrie darf den Erfolg nicht kippen) — Fehler beim `startNew` NICHT (Datenverlust-Gefahr).

- [ ] **Step 1: Failing Tests schreiben**

`tests/session.test.ts`:

```ts
import { SessionStore, parseLines, serializeLine, type SessionSink } from "../src/core/memory/session";
import type { ChatMessage } from "../src/core/agent/types";

function memSink(): SessionSink & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    read: async (p) => files.get(p) ?? null,
    write: async (p, d) => void files.set(p, d),
    append: async (p, d) => void files.set(p, (files.get(p) ?? "") + d),
  };
}

const msg: ChatMessage = { role: "user", content: "Hallo" };

describe("serialize/parse", () => {
  it("Roundtrip inkl. toolCalls und toolCallId", () => {
    const m: ChatMessage = { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "read_note", arguments: "{}" }] };
    expect(parseLines(serializeLine(m) + serializeLine({ role: "tool", content: "x", toolCallId: "c1" }))).toEqual([
      m, { role: "tool", content: "x", toolCallId: "c1" },
    ]);
  });
  it("kaputte Zeilen werden uebersprungen statt alles zu verlieren", () => {
    expect(parseLines('{kaputt}\n' + serializeLine(msg))).toEqual([msg]);
  });
});

describe("SessionStore", () => {
  it("load auf leerem Store liefert []", async () => {
    const store = new SessionStore(memSink(), "sessions");
    expect(await store.load()).toEqual([]);
  });
  it("appendMessages + load ist der Roundtrip", async () => {
    const sink = memSink();
    const store = new SessionStore(sink, "sessions");
    await store.appendMessages([msg, { role: "assistant", content: "Hi" }]);
    expect(await store.load()).toHaveLength(2);
  });
  it("startNew archiviert current und leert es", async () => {
    const sink = memSink();
    const store = new SessionStore(sink, "sessions");
    await store.appendMessages([msg]);
    await store.startNew();
    expect(await store.load()).toEqual([]);
    expect(sink.files.get("sessions/archive.jsonl")).toContain("Hallo");
  });
});
```

- [ ] **Step 2: Rot** — Run: `npx vitest run tests/session.test.ts` · Expected: FAIL.

- [ ] **Step 3: Implementieren**

`src/core/memory/session.ts`:

```ts
import type { ChatMessage } from "../agent/types";

export interface SessionSink {
  read(path: string): Promise<string | null>;
  write(path: string, data: string): Promise<void>;
  append(path: string, data: string): Promise<void>;
}

export function serializeLine(m: ChatMessage): string {
  return JSON.stringify(m) + "\n";
}

export function parseLines(text: string): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const raw of text.split("\n")) {
    const lineText = raw.trim();
    if (lineText === "") continue;
    try {
      const parsed = JSON.parse(lineText) as ChatMessage;
      if (typeof parsed.role === "string" && typeof parsed.content === "string") out.push(parsed);
    } catch {
      // Eine kaputte Zeile kostet eine Nachricht, nicht die Session.
    }
  }
  return out;
}

/** Append-only-JSONL im Plugin-Datenordner (traceStore-Muster aus vim-dojo).
 *  Bewusst NICHT im Vault: JSONL wuerde Suche und Sync zumuellen. */
export class SessionStore {
  constructor(private readonly sink: SessionSink, private readonly dir: string) {}

  private get current(): string { return `${this.dir}/current.jsonl`; }
  private get archive(): string { return `${this.dir}/archive.jsonl`; }

  async load(): Promise<ChatMessage[]> {
    const text = await this.sink.read(this.current);
    return text === null ? [] : parseLines(text);
  }

  async appendMessages(msgs: ChatMessage[]): Promise<void> {
    try {
      await this.sink.append(this.current, msgs.map(serializeLine).join(""));
    } catch (e) {
      console.warn("Koda: session append failed", e);
    }
  }

  async startNew(): Promise<void> {
    const text = await this.sink.read(this.current);
    if (text !== null && text.trim() !== "") await this.sink.append(this.archive, text);
    await this.sink.write(this.current, "");
  }
}
```

- [ ] **Step 4: Grün** — Run: `npx vitest run` · Expected: PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: session-store JSONL (traceStore-Muster) — TDD"`

---

### Task 12: VaultTools + Bestätigungs-Modal mit Diff-Vorschau

**Files:**
- Create: `src/obsidian/vault-tools.ts`, `src/obsidian/confirm-write.ts`, `src/core/diff.ts` (Kopie), `src/core/settings-types.ts`
- Test: `tests/vault_tools.test.ts`, `tests/settings_types.test.ts`

**Interfaces:**
- Consumes: `ToolRunner`/`ToolOutcome` (Task 4), `resolveNotePath`/`writePolicy` (Task 3), `appendMemoryLine` (Task 10), `mergeSettings`/`clampInt`/`EndpointConfig`/`migrateEndpointList` (vendor), `confirmAction` ist NICHT genug — Schreibvorschau braucht ein eigenes Modal.
- Produces:
  - `src/core/settings-types.ts`: `KodaSettings { endpoints: EndpointConfig[]; model: string; suppressThinking: boolean; kodaFolder: string; maxRounds: number; textFallback: boolean; language: "auto" | "de" | "en"; openOnStartup: boolean }` · `DEFAULT_SETTINGS` · `mergeKodaSettings(raw: unknown): KodaSettings` (Kit-`mergeSettings` + `clampInt(maxRounds, 1, 16, 8)` + `migrateEndpointList`-Durchlauf)
  - `src/obsidian/vault-tools.ts`: `interface VaultPort { listMarkdownPaths(): string[]; read(path): Promise<string>; exists(path): Promise<boolean>; create(path, content): Promise<void>; append(path, content): Promise<void>; overwrite(path, content): Promise<void> }` · `interface ConfirmWritePort { (req: { path: string; mode: "create"|"append"|"replace"; oldText: string; newText: string }): Promise<boolean> }` · `class VaultTools implements ToolRunner { constructor(vault: VaultPort, confirm: ConfirmWritePort, opts: { kodaFolder(): string; today(): string }) }`
  - `src/obsidian/confirm-write.ts`: `confirmWrite(app: App, req): Promise<boolean>` — Modal mit Volltext- (create/append) bzw. Diff-Vorschau (replace)
- **Testbarkeit:** `VaultTools` hängt nur an `VaultPort`/`ConfirmWritePort` → mit Fakes in node testbar; der Obsidian-`VaultPort`-Adapter entsteht in Task 13.

- [ ] **Step 1: Diff-Kern kopieren**

```bash
cp ../image-to-markdown/src/diff.ts src/core/diff.ts
```

Nur nutzen: `diffLines`, `DiffLine` (Signaturen: `diffLines(oldText, newText): DiffLine[]`, `DiffLine { kind: "ctx"|"add"|"del"; text: string }`). Datei unverändert lassen (2. Verwendung des Musters → Registry-Vermerk nach MVP).

- [ ] **Step 2: Failing Tests schreiben**

`tests/settings_types.test.ts`:

```ts
import { DEFAULT_SETTINGS, mergeKodaSettings } from "../src/core/settings-types";

describe("mergeKodaSettings", () => {
  it("leerer Input liefert Defaults", () => {
    expect(mergeKodaSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
  it("klemmt maxRounds in 1..16", () => {
    expect(mergeKodaSettings({ maxRounds: 99 }).maxRounds).toBe(16);
    expect(mergeKodaSettings({ maxRounds: 0 }).maxRounds).toBe(1);
  });
  it("migriert eine alte String-Endpoint-Liste zu EndpointConfig", () => {
    const s = mergeKodaSettings({ endpoints: ["http://a:1234"] });
    expect(s.endpoints).toEqual([{ url: "http://a:1234" }]);
  });
});
```

`tests/vault_tools.test.ts`:

```ts
import { VaultTools, type VaultPort } from "../src/obsidian/vault-tools";

function fakeVault(files: Record<string, string>): VaultPort & { files: Record<string, string> } {
  return {
    files,
    listMarkdownPaths: () => Object.keys(files),
    read: async (p) => {
      if (!(p in files)) throw new Error("not found");
      return files[p];
    },
    exists: async (p) => p in files,
    create: async (p, c) => void (files[p] = c),
    append: async (p, c) => void (files[p] = (files[p] ?? "") + c),
    overwrite: async (p, c) => void (files[p] = c),
  };
}

const opts = { kodaFolder: () => "Koda", today: () => "2026-08-05" };
const yes = async (): Promise<boolean> => true;
const no = async (): Promise<boolean> => false;

describe("VaultTools", () => {
  it("search_notes findet Dateinamen- und Volltext-Treffer mit Snippet", async () => {
    const tools = new VaultTools(fakeVault({ "Rezepte/Lasagne.md": "Nudeln und Käse", "Anderes.md": "hier steht lasagne drin" }), yes, opts);
    const r = await tools.run("search_notes", { query: "lasagne" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content).toContain("Rezepte/Lasagne.md");
      expect(r.content).toContain("Anderes.md");
    }
  });
  it("read_note liest ueber den Pfad-Guard (Traversal blockt)", async () => {
    const tools = new VaultTools(fakeVault({ "A.md": "Inhalt" }), yes, opts);
    expect(await tools.run("read_note", { path: "A.md" })).toEqual({ ok: true, content: "Inhalt" });
    const blocked = await tools.run("read_note", { path: "../geheim.md" });
    expect(blocked.ok).toBe(false);
  });
  it("write_note im Koda-Ordner schreibt OHNE confirm", async () => {
    let asked = 0;
    const vault = fakeVault({});
    const tools = new VaultTools(vault, async () => { asked++; return true; }, opts);
    const r = await tools.run("write_note", { path: "Koda/Entwürfe/x.md", content: "Hi", mode: "create" });
    expect(r.ok).toBe(true);
    expect(asked).toBe(0);
    expect(vault.files["Koda/Entwürfe/x.md"]).toBe("Hi");
  });
  it("write_note ausserhalb fragt; Ablehnung wird als Fehler-Result gemeldet", async () => {
    const vault = fakeVault({ "Plan.md": "alt" });
    const tools = new VaultTools(vault, no, opts);
    const r = await tools.run("write_note", { path: "Plan.md", content: "neu", mode: "replace" });
    expect(r).toEqual({ ok: false, error: "vom Nutzer abgelehnt" });
    expect(vault.files["Plan.md"]).toBe("alt");
  });
  it("create auf existierende Datei ist ein Fehler-Result (kein Ueberschreiben)", async () => {
    const tools = new VaultTools(fakeVault({ "Koda/x.md": "da" }), yes, opts);
    const r = await tools.run("write_note", { path: "Koda/x.md", content: "neu", mode: "create" });
    expect(r.ok).toBe(false);
  });
  it("save_memory haengt an Koda/Memory.md an (immer frei)", async () => {
    const vault = fakeVault({});
    const tools = new VaultTools(vault, no, opts);
    const r = await tools.run("save_memory", { text: "Jay mag kurze Antworten" });
    expect(r.ok).toBe(true);
    expect(vault.files["Koda/Memory.md"]).toContain("- [2026-08-05] Jay mag kurze Antworten");
  });
  it("unbekanntes Tool ist ein Fehler-Result", async () => {
    const tools = new VaultTools(fakeVault({}), yes, opts);
    expect((await tools.run("gibt_es_nicht", {})).ok).toBe(false);
  });
});
```

- [ ] **Step 3: Rot** — Run: `npx vitest run tests/vault_tools.test.ts tests/settings_types.test.ts` · Expected: FAIL.

- [ ] **Step 4: Implementieren**

`src/core/settings-types.ts`:

```ts
import { mergeSettings } from "../vendor/kit/settings";
import { clampInt } from "../vendor/kit/num";
import { migrateEndpointList, type EndpointConfig } from "../vendor/kit/endpoint_config";

export interface KodaSettings {
  endpoints: EndpointConfig[];
  model: string;
  suppressThinking: boolean;
  kodaFolder: string;
  maxRounds: number;
  textFallback: boolean;
  language: "auto" | "de" | "en";
  openOnStartup: boolean;
}

export const DEFAULT_SETTINGS: KodaSettings = {
  endpoints: [{ url: "http://127.0.0.1:1234" }],
  model: "",
  suppressThinking: true,
  kodaFolder: "Koda",
  maxRounds: 8,
  textFallback: false, // Default laut koda-lab-Befund setzen (docs/LAB.md)
  language: "auto",
  openOnStartup: false,
};

export function mergeKodaSettings(raw: unknown): KodaSettings {
  const merged = mergeSettings(DEFAULT_SETTINGS, raw);
  const rawEndpoints = (raw as { endpoints?: unknown } | null)?.endpoints;
  return {
    ...merged,
    endpoints: Array.isArray(rawEndpoints)
      ? migrateEndpointList(undefined, rawEndpoints as (string | EndpointConfig)[])
      : merged.endpoints,
    maxRounds: clampInt(merged.maxRounds, 1, 16, DEFAULT_SETTINGS.maxRounds),
  };
}
```

`src/obsidian/vault-tools.ts` (liegt unter `src/obsidian/`, importiert aber KEIN obsidian — der echte Adapter kommt in Task 13; hier nur Ports):

```ts
import type { ToolOutcome, ToolRunner } from "../core/agent/types";
import { resolveNotePath } from "../core/tools/path-guard";
import { writePolicy } from "../core/tools/write-policy";
import { appendMemoryLine } from "../core/memory/memory";

export interface VaultPort {
  listMarkdownPaths(): string[];
  read(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  create(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  overwrite(path: string, content: string): Promise<void>;
}

export interface WriteRequest {
  path: string;
  mode: "create" | "append" | "replace";
  oldText: string;
  newText: string;
}

export type ConfirmWritePort = (req: WriteRequest) => Promise<boolean>;

const SEARCH_CAP = 10;
const SNIPPET = 80;

export class VaultTools implements ToolRunner {
  constructor(
    private readonly vault: VaultPort,
    private readonly confirm: ConfirmWritePort,
    private readonly opts: { kodaFolder(): string; today(): string },
  ) {}

  async run(name: string, args: unknown): Promise<ToolOutcome> {
    const a = (typeof args === "object" && args !== null ? args : {}) as Record<string, unknown>;
    try {
      switch (name) {
        case "search_notes": return await this.search(str(a.query), num(a.max_results, SEARCH_CAP));
        case "read_note": return await this.read(str(a.path));
        case "write_note": return await this.write(str(a.path), str(a.content), str(a.mode));
        case "save_memory": return await this.saveMemory(str(a.text));
        default: return { ok: false, error: `unbekanntes Tool: ${name}` };
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Tool fehlgeschlagen" };
    }
  }

  private async search(query: string, cap: number): Promise<ToolOutcome> {
    if (query.trim() === "") return { ok: false, error: "query fehlt" };
    const q = query.toLowerCase();
    const hits: string[] = [];
    for (const path of this.vault.listMarkdownPaths()) {
      if (hits.length >= cap) break;
      if (path.toLowerCase().includes(q)) {
        hits.push(`${path} (Dateiname)`);
        continue;
      }
      const text = await this.vault.read(path).catch(() => "");
      const at = text.toLowerCase().indexOf(q);
      if (at !== -1) {
        const from = Math.max(0, at - SNIPPET / 2);
        const snippet = text.slice(from, from + SNIPPET).replace(/\s+/g, " ").trim();
        hits.push(`${path}: …${snippet}…`);
      }
    }
    return hits.length === 0
      ? { ok: true, content: `Keine Treffer für "${query}".` }
      : { ok: true, content: hits.join("\n") };
  }

  private async read(path: string): Promise<ToolOutcome> {
    const norm = resolveNotePath(path);
    const text = await this.vault.read(norm).catch(() => null);
    return text === null ? { ok: false, error: `Notiz nicht gefunden: "${path}"` } : { ok: true, content: text };
  }

  private async write(path: string, content: string, mode: string): Promise<ToolOutcome> {
    if (mode !== "create" && mode !== "append" && mode !== "replace") {
      return { ok: false, error: `mode muss create|append|replace sein, war: "${mode}"` };
    }
    const norm = resolveNotePath(path);
    const exists = await this.vault.exists(norm);
    if (mode === "create" && exists) return { ok: false, error: `existiert schon: "${norm}" — nutze append oder replace` };
    if (mode !== "create" && !exists) return { ok: false, error: `nicht gefunden: "${norm}" — nutze create` };

    if (writePolicy(norm, this.opts.kodaFolder()) === "confirm") {
      const oldText = exists ? await this.vault.read(norm) : "";
      const approved = await this.confirm({ path: norm, mode, oldText, newText: content });
      // Die Freigabe gilt genau fuer DIESEN Inhalt — der Schreibpfad unten
      // verwendet dieselbe content-Variable, nichts dazwischen darf sie aendern.
      if (!approved) return { ok: false, error: "vom Nutzer abgelehnt" };
    }

    if (mode === "create") await this.vault.create(norm, content);
    else if (mode === "append") await this.vault.append(norm, content.startsWith("\n") ? content : `\n${content}`);
    else await this.vault.overwrite(norm, content);
    return { ok: true, content: `geschrieben: ${norm} (${mode})` };
  }

  private async saveMemory(text: string): Promise<ToolOutcome> {
    if (text.trim() === "") return { ok: false, error: "text fehlt" };
    const path = `${this.opts.kodaFolder().replace(/\/+$/, "")}/Memory.md`;
    const existing = (await this.vault.exists(path)) ? await this.vault.read(path) : "";
    await this.vault.overwrite(path, appendMemoryLine(existing, text.trim(), this.opts.today()));
    return { ok: true, content: `gemerkt: ${text.trim()}` };
  }
}

function str(v: unknown): string { return typeof v === "string" ? v : ""; }
function num(v: unknown, fallback: number): number { return typeof v === "number" && v > 0 ? Math.min(v, 25) : fallback; }
```

`src/obsidian/confirm-write.ts` (echtes Modal — UI-STANDARD: native Modal-Klasse, CSS-Variablen, Cancel links):

```ts
import { Modal, Setting, type App } from "obsidian";
import { applyDestructive } from "../vendor/kit-obsidian/confirm";
import { diffLines } from "../core/diff";
import { t } from "../vendor/kit/i18n";
import type { WriteRequest } from "./vault-tools";

/** Schreibfreigabe mit Vorschau: create/append zeigen den neuen Text,
 *  replace zeigt den Zeilen-Diff. Esc/Wegklicken = Ablehnung (loest genau einmal auf). */
export function confirmWrite(app: App, req: WriteRequest): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: boolean): void => {
      if (!settled) { settled = true; resolve(v); }
    };
    const modal = new (class extends Modal {
      onOpen(): void {
        this.titleEl.setText(t("confirm.title", req.mode, req.path));
        const box = this.contentEl.createDiv({ cls: "koda-preview" });
        if (req.mode === "replace") {
          for (const lineItem of diffLines(req.oldText, req.newText)) {
            box.createDiv({ cls: `koda-diff-${lineItem.kind}`, text: lineItem.text });
          }
        } else {
          box.createEl("pre", { text: req.newText });
        }
        new Setting(this.contentEl)
          .addButton((b) => b.setButtonText(t("confirm.cancel")).onClick(() => { done(false); this.close(); }))
          .addButton((b) => {
            applyDestructive(b.setButtonText(t("confirm.write")).setCta());
            b.onClick(() => { done(true); this.close(); });
          });
      }
      onClose(): void {
        done(false);
        this.contentEl.empty();
      }
    })(app);
    modal.open();
  });
}
```

- [ ] **Step 5: Grün** — Run: `npx vitest run` · Expected: PASS (das Modal selbst ist GUI-Smoke-Territorium, nicht unit-getestet).
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: vault-tools mit schreibregel + confirm-modal mit diff-vorschau"`

---

### Task 13: Hub-View, i18n-Strings, main.ts-Wiring, styles.css

**Files:**
- Create: `src/obsidian/view.ts`, `src/i18n/strings.ts`
- Modify: `src/main.ts`, `styles.css`

**Interfaces:**
- Consumes: alles Bisherige. Produces: lauffähiges Plugin.
- View-Typ: `VIEW_TYPE_KODA = "koda-agent-view"`. Die View spricht NUR mit dem Plugin über `plugin.ask(question)`, `plugin.stopRun()`, `plugin.newChat()`, `plugin.chatLog` (readonly) — kanal-agnostischer Schnitt: ein späterer Voice-Kanal ruft dieselben drei Methoden.

- [ ] **Step 1: i18n-Strings anlegen**

`src/i18n/strings.ts` (Kit-Engine; Aufruf einmal beim Plugin-Load importieren):

```ts
import { defineStrings } from "../vendor/kit/i18n";

defineStrings({
  en: {
    "view.title": "Koda",
    "view.placeholder": "Ask your vault…",
    "view.send": "Send",
    "view.stop": "Stop",
    "view.newChat": "New chat",
    "view.thinking": "Thinking…",
    "view.toolStep": "{0}: {1}",
    "view.roundLimit": "Stopped after {0} tool rounds — ask me to continue if you want more.",
    "confirm.title": "Koda wants to {0}: {1}",
    "confirm.cancel": "Cancel",
    "confirm.write": "Write",
    "cmd.open": "Open Koda",
    "err.generic": "Request failed: {0}",
    "settings.endpoints": "Endpoints",
    "settings.endpoints.desc": "OpenAI-compatible servers, first reachable wins. URL, optional API key, optional model override.",
    "settings.addEndpoint": "Add endpoint",
    "settings.remove": "Remove",
    "settings.model": "Model",
    "settings.model.desc": "Model id as reported by the server (e.g. from LM Studio).",
    "settings.suppress": "Suppress thinking",
    "settings.suppress.desc": "Ask hybrid reasoning models to skip the thinking phase (faster).",
    "settings.folder": "Koda folder",
    "settings.folder.desc": "Koda writes freely here (memory, drafts). Everything else asks first.",
    "settings.rounds": "Max tool rounds",
    "settings.rounds.desc": "Safety limit for tool loops per question.",
    "settings.fallback": "Text tool-call fallback",
    "settings.fallback.desc": "Accept JSON tool calls written in plain text (for models without native tool calling).",
    "settings.language": "Language",
    "settings.startup": "Open sidebar on startup",
    "settings.startup.desc": "Off by default; Koda never opens itself without this.",
  },
  de: {
    "view.title": "Koda",
    "view.placeholder": "Frag deinen Vault…",
    "view.send": "Senden",
    "view.stop": "Stopp",
    "view.newChat": "Neues Gespräch",
    "view.thinking": "Denkt nach…",
    "view.toolStep": "{0}: {1}",
    "view.roundLimit": "Nach {0} Tool-Runden gestoppt — sag mir, wenn ich weitermachen soll.",
    "confirm.title": "Koda möchte {0}: {1}",
    "confirm.cancel": "Abbrechen",
    "confirm.write": "Schreiben",
    "cmd.open": "Koda öffnen",
    "err.generic": "Anfrage fehlgeschlagen: {0}",
    "settings.endpoints": "Endpunkte",
    "settings.endpoints.desc": "OpenAI-kompatible Server, der erste erreichbare gewinnt. URL, optionaler API-Schlüssel, optionales Modell-Override.",
    "settings.addEndpoint": "Endpunkt hinzufügen",
    "settings.remove": "Entfernen",
    "settings.model": "Modell",
    "settings.model.desc": "Modell-ID, wie der Server sie meldet (z. B. aus LM Studio).",
    "settings.suppress": "Denken unterdrücken",
    "settings.suppress.desc": "Hybride Reasoning-Modelle bitten, die Denkphase zu überspringen (schneller).",
    "settings.folder": "Koda-Ordner",
    "settings.folder.desc": "Hier schreibt Koda frei (Memory, Entwürfe). Alles andere fragt vorher.",
    "settings.rounds": "Max. Tool-Runden",
    "settings.rounds.desc": "Sicherheitslimit für Tool-Schleifen pro Frage.",
    "settings.fallback": "Text-Tool-Call-Fallback",
    "settings.fallback.desc": "JSON-Tool-Aufrufe im Fließtext akzeptieren (für Modelle ohne natives Tool-Calling).",
    "settings.language": "Sprache",
    "settings.startup": "Sidebar beim Start öffnen",
    "settings.startup.desc": "Standardmäßig aus; Koda öffnet sich nie von selbst ohne diese Option.",
  },
});
```

- [ ] **Step 2: View schreiben**

`src/obsidian/view.ts` — Aufbau (Struktur-Referenz: `../kuro-gamification/src/views/KuroChatPanel.ts`):

```ts
import { ItemView, type WorkspaceLeaf } from "obsidian";
import { t } from "../vendor/kit/i18n";
import type KodaPlugin from "../main";

export const VIEW_TYPE_KODA = "koda-agent-view";

/** Chat-Sidebar. Rendert plugin.chatLog; Streaming/Tool-Schritte kommen als
 *  gezielte DOM-Appends (kein Voll-Redraw pro Token). */
export class KodaView extends ItemView {
  private logEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private streamEl: HTMLElement | null = null;
  private reasonEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: KodaPlugin) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE_KODA; }
  getDisplayText(): string { return t("view.title"); }
  getIcon(): string { return "dog"; }

  onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("koda-root");
    this.logEl = root.createDiv({ cls: "koda-log" });
    const bar = root.createDiv({ cls: "koda-input-bar" });
    this.inputEl = bar.createEl("textarea", { cls: "koda-input", attr: { placeholder: t("view.placeholder"), rows: "2" } });
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.send(); }
    });
    const buttons = bar.createDiv({ cls: "koda-buttons" });
    buttons.createEl("button", { text: t("view.send") }).addEventListener("click", () => this.send());
    buttons.createEl("button", { text: t("view.stop") }).addEventListener("click", () => this.plugin.stopRun());
    buttons.createEl("button", { text: t("view.newChat") }).addEventListener("click", () => void this.plugin.newChat());
    this.renderLog();
    return Promise.resolve();
  }

  private send(): void {
    const q = this.inputEl.value.trim();
    if (q === "" || this.plugin.busy) return;
    this.inputEl.value = "";
    void this.plugin.ask(q);
  }

  /** Voll-Redraw aus plugin.chatLog (Sessionstart, final, Fehler). */
  renderLog(): void {
    this.logEl.empty();
    this.streamEl = null;
    this.reasonEl = null;
    for (const m of this.plugin.chatLog) {
      if (m.role === "user") this.logEl.createDiv({ cls: "koda-msg koda-user", text: m.content });
      else if (m.role === "assistant" && (!m.toolCalls || m.toolCalls.length === 0) && m.content !== "") {
        this.logEl.createDiv({ cls: "koda-msg koda-assistant", text: m.content });
      } else if (m.role === "tool") {
        const d = this.logEl.createEl("details", { cls: "koda-tool" });
        d.createEl("summary", { text: t("view.toolStep", m.toolCallId ?? "tool", m.content.slice(0, 60)) });
        d.createEl("pre", { text: m.content });
      }
    }
    this.logEl.scrollTo({ top: this.logEl.scrollHeight });
  }

  // — Streaming-Hooks, vom Plugin gerufen —
  streamToken(text: string): void {
    if (this.streamEl === null) this.streamEl = this.logEl.createDiv({ cls: "koda-msg koda-assistant koda-streaming" });
    this.streamEl.setText(this.streamEl.getText() + text);
    this.logEl.scrollTo({ top: this.logEl.scrollHeight });
  }
  streamReasoning(text: string): void {
    if (this.reasonEl === null) {
      const d = this.logEl.createEl("details", { cls: "koda-reasoning" });
      d.createEl("summary", { text: t("view.thinking") });
      this.reasonEl = d.createEl("pre");
    }
    this.reasonEl.setText(this.reasonEl.getText() + text);
  }
  toolStep(label: string, detail: string): void {
    this.streamEl = null; // naechster Token-Block ist eine neue Blase
    const d = this.logEl.createEl("details", { cls: "koda-tool" });
    d.createEl("summary", { text: label });
    d.createEl("pre", { text: detail });
  }
  showNotice(text: string): void {
    this.logEl.createDiv({ cls: "koda-msg koda-error", text });
  }
}
```

- [ ] **Step 3: main.ts verdrahten**

`src/main.ts` ersetzen:

```ts
import { Plugin, WorkspaceLeaf, normalizePath } from "obsidian";
import "./i18n/strings";
import { getLanguage } from "obsidian";
import { pickLang, setLang, t } from "./vendor/kit/i18n";
import { effectiveModel } from "./vendor/kit/endpoint_config";
import { KodaChatClient } from "./llm/KodaChatClient";
import { XhrSseTransport } from "./llm/XhrSseTransport";
import { runAgent, type LoopLlm } from "./core/agent/loop";
import type { ChatMessage } from "./core/agent/types";
import { TOOL_DEFS } from "./core/tools/defs";
import { buildSystemPrompt } from "./core/memory/memory";
import { SessionStore } from "./core/memory/session";
import { DEFAULT_SETTINGS, mergeKodaSettings, type KodaSettings } from "./core/settings-types";
import { VaultTools, type VaultPort } from "./obsidian/vault-tools";
import { confirmWrite } from "./obsidian/confirm-write";
import { KodaView, VIEW_TYPE_KODA } from "./obsidian/view";
import { KodaSettingsTab } from "./obsidian/settings";

export default class KodaPlugin extends Plugin {
  settings: KodaSettings = DEFAULT_SETTINGS;
  chatLog: ChatMessage[] = [];
  busy = false;
  private abort: AbortController | null = null;
  private client = new KodaChatClient(new XhrSseTransport());
  private store!: SessionStore;

  async onload(): Promise<void> {
    this.settings = mergeKodaSettings(await this.loadData());
    this.applyLanguage();

    const dir = normalizePath(`${this.manifest.dir ?? ""}/sessions`);
    const adapter = this.app.vault.adapter;
    this.store = new SessionStore(
      {
        read: async (p) => ((await adapter.exists(p)) ? adapter.read(p) : null),
        write: async (p, d) => {
          await this.ensureDir(dir);
          await adapter.write(p, d);
        },
        append: async (p, d) => {
          await this.ensureDir(dir);
          await adapter.append(p, d);
        },
      },
      dir,
    );
    this.chatLog = await this.store.load();

    this.registerView(VIEW_TYPE_KODA, (leaf) => new KodaView(leaf, this));
    this.addRibbonIcon("dog", t("cmd.open"), () => void this.activateView());
    this.addCommand({ id: "open", name: t("cmd.open"), callback: () => void this.activateView() });
    this.addSettingTab(new KodaSettingsTab(this.app, this));

    if (this.settings.openOnStartup) {
      this.app.workspace.onLayoutReady(() => void this.activateView());
    }
  }

  applyLanguage(): void {
    const raw = this.settings.language;
    setLang(raw === "auto" ? pickLang(safeGetLanguage()) : raw);
  }

  private async ensureDir(dir: string): Promise<void> {
    if (!(await this.app.vault.adapter.exists(dir))) await this.app.vault.adapter.mkdir(dir);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.applyLanguage();
  }

  async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_KODA)[0];
    const leaf: WorkspaceLeaf | null = existing ?? this.app.workspace.getRightLeaf(false);
    if (leaf === null) return;
    await leaf.setViewState({ type: VIEW_TYPE_KODA, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  private views(): KodaView[] {
    return this.app.workspace
      .getLeavesOfType(VIEW_TYPE_KODA)
      .map((l) => l.view)
      .filter((v): v is KodaView => v instanceof KodaView);
  }

  stopRun(): void {
    this.abort?.abort();
  }

  async newChat(): Promise<void> {
    await this.store.startNew();
    this.chatLog = [];
    for (const v of this.views()) v.renderLog();
  }

  async ask(question: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.abort = new AbortController();

    const userMsg: ChatMessage = { role: "user", content: question };
    this.chatLog.push(userMsg);
    await this.store.appendMessages([userMsg]);
    for (const v of this.views()) v.renderLog();

    const s = this.settings;
    const endpoint = s.endpoints[0] ?? { url: "" };
    const memory = await this.readMemory();
    const lang = s.language === "auto" ? pickLang(safeGetLanguage()) : s.language;
    const system: ChatMessage = {
      role: "system",
      content: buildSystemPrompt({ lang, memory, kodaFolder: s.kodaFolder }),
    };

    const llm: LoopLlm = {
      complete: (messages, onToken, onReasoning, signal) =>
        this.client.complete(
          {
            endpoint: endpoint.url,
            apiKey: endpoint.apiKey ?? "",
            model: effectiveModel(endpoint, s.model),
            suppressThinking: s.suppressThinking,
          },
          messages, TOOL_DEFS, onToken, onReasoning, signal,
        ),
    };
    const vaultPort: VaultPort = {
      listMarkdownPaths: () => this.app.vault.getMarkdownFiles().map((f) => f.path),
      read: async (p) => {
        const f = this.app.vault.getFileByPath(p);
        if (f === null) throw new Error(`nicht gefunden: ${p}`);
        return this.app.vault.cachedRead(f);
      },
      exists: async (p) => this.app.vault.getFileByPath(p) !== null,
      create: async (p, c) => {
        await this.ensureParents(p);
        await this.app.vault.create(p, c);
      },
      append: async (p, c) => {
        const f = this.app.vault.getFileByPath(p);
        if (f === null) throw new Error(`nicht gefunden: ${p}`);
        await this.app.vault.append(f, c);
      },
      overwrite: async (p, c) => {
        const f = this.app.vault.getFileByPath(p);
        if (f === null) {
          await this.ensureParents(p);
          await this.app.vault.create(p, c);
        } else {
          await this.app.vault.modify(f, c);
        }
      },
    };
    const tools = new VaultTools(vaultPort, (req) => confirmWrite(this.app, req), {
      kodaFolder: () => this.settings.kodaFolder,
      today: () => new Date().toISOString().slice(0, 10),
    });

    const appended = await runAgent(
      { llm, tools, maxRounds: s.maxRounds, textFallback: s.textFallback },
      [system, ...this.chatLog],
      (tok) => { for (const v of this.views()) v.streamToken(tok); },
      (r) => { for (const v of this.views()) v.streamReasoning(r); },
      (e) => {
        if (e.kind === "tool-start") for (const v of this.views()) v.toolStep(`⚙ ${e.call.name}`, e.call.arguments);
        if (e.kind === "tool-end") for (const v of this.views()) v.toolStep(
          `${e.outcome.ok ? "✓" : "✗"} ${e.call.name}`,
          e.outcome.ok ? e.outcome.content.slice(0, 400) : e.outcome.error,
        );
        if (e.kind === "error") for (const v of this.views()) v.showNotice(t("err.generic", e.message));
        if (e.kind === "round-limit") for (const v of this.views()) v.showNotice(t("view.roundLimit", s.maxRounds));
      },
      this.abort.signal,
    );

    this.chatLog.push(...appended);
    await this.store.appendMessages(appended);
    this.busy = false;
    this.abort = null;
    for (const v of this.views()) v.renderLog();
  }

  private async ensureParents(path: string): Promise<void> {
    const parts = path.split("/").slice(0, -1);
    let cur = "";
    for (const part of parts) {
      cur = cur === "" ? part : `${cur}/${part}`;
      if (this.app.vault.getFolderByPath(cur) === null) {
        await this.app.vault.createFolder(cur).catch(() => {});
      }
    }
  }

  private async readMemory(): Promise<string> {
    const path = `${this.settings.kodaFolder.replace(/\/+$/, "")}/Memory.md`;
    const f = this.app.vault.getFileByPath(path);
    return f === null ? "" : this.app.vault.cachedRead(f);
  }
}

function safeGetLanguage(): string {
  try {
    return getLanguage();
  } catch {
    return "";
  }
}
```

Hinweis: `KodaSettingsTab` existiert erst nach Task 14 — für diesen Task eine minimale Platzhalter-Klasse in `src/obsidian/settings.ts` anlegen (leerer `display()`), Task 14 ersetzt sie vollständig:

```ts
import { PluginSettingTab, type App } from "obsidian";
import type KodaPlugin from "../main";

export class KodaSettingsTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: KodaPlugin) {
    super(app, plugin);
  }
  display(): void {
    this.containerEl.empty();
  }
}
```

- [ ] **Step 4: styles.css füllen** (nur Theme-Variablen — UI-STANDARD):

```css
.koda-root { display: flex; flex-direction: column; height: 100%; }
.koda-log { flex: 1; overflow-y: auto; padding: var(--size-4-2); }
.koda-msg { margin-bottom: var(--size-4-2); padding: var(--size-4-2); border-radius: var(--radius-m); white-space: pre-wrap; }
.koda-user { background: var(--background-secondary); }
.koda-assistant { background: var(--background-primary-alt); }
.koda-error { color: var(--text-error); }
.koda-tool, .koda-reasoning { margin-bottom: var(--size-4-1); font-size: var(--font-ui-smaller); color: var(--text-muted); }
.koda-tool pre, .koda-reasoning pre { white-space: pre-wrap; margin: var(--size-4-1) 0 0 0; }
.koda-input-bar { border-top: 1px solid var(--background-modifier-border); padding: var(--size-4-2); }
.koda-input { width: 100%; resize: vertical; }
.koda-buttons { display: flex; gap: var(--size-4-1); margin-top: var(--size-4-1); }
.koda-preview { max-height: 40vh; overflow-y: auto; border: 1px solid var(--background-modifier-border); border-radius: var(--radius-s); padding: var(--size-4-2); margin-bottom: var(--size-4-2); }
.koda-preview pre { white-space: pre-wrap; margin: 0; }
.koda-diff-add { background: rgba(var(--color-green-rgb), 0.15); }
.koda-diff-del { background: rgba(var(--color-red-rgb), 0.15); text-decoration: line-through; }
.koda-diff-ctx { color: var(--text-muted); }
```

- [ ] **Step 5: Gate** — Run: `npm run gate` · Expected: grün (Build inklusive).
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: chat-sidebar, i18n, wiring — lauffaehiger MVP-Kern"`

---

### Task 14: Settings-Tab (deklarativ + Endpoint-Zeilen)

**Files:**
- Modify: `src/obsidian/settings.ts` (Platzhalter aus Task 13 ersetzen)
- Test: `tests/settings_types.test.ts` (unverändert — UI selbst ist Smoke-Territorium)

**Interfaces:**
- Consumes: `KodaSettings`/`mergeKodaSettings` (Task 12), Kit `applyEndpointEdit`/`moveEndpointToFront`, `FolderSuggest`, `t`.
- Muster: **Zweigleisig** — `getSettingDefinitions()` als eine Wahrheit + `display()`-Fallback-Walker (minimale Form aus `../3d-codeblocks/src/obsidian/settings.ts`, oben in Task-13-Referenz beschrieben; für die Endpoint-Liste eine `render`-Hatch nach dem Vorbild `../vault-rag/src/settings.ts` — **diese Datei vor Implementierung lesen**, sie ist das Erst-Exemplar der Hatch-Mechanik).

- [ ] **Step 1: Deklarative Definitionen + Walker schreiben**

Aufbau exakt nach dem 3d-codeblocks-Muster (Task-13-Referenz), mit diesen Controls:

- `kodaFolder` → `text` (im `display()`-Fallback zusätzlich `new FolderSuggest(this.app, inputEl)` an das Textfeld hängen — der native ≥1.13-Renderer bekommt nur das Textfeld; bewusst akzeptierter Trade-off wie kuros Collapsibles)
- `model` → `text`
- `suppressThinking` → `toggle`
- `maxRounds` → `slider` min 1 max 16 step 1 (Obergrenze aus derselben Konstante, gegen die `mergeKodaSettings` klemmt — Konstante `MAX_ROUNDS_LIMIT = 16` nach `src/core/settings-types.ts` ziehen und an beiden Stellen verwenden)
- `textFallback` → `toggle`
- `language` → `dropdown` {auto, de, en}
- `openOnStartup` → `toggle`
- Endpoint-Liste → `render`-Hatch (siehe Step 2)

`setControlValue` IMMER durch `mergeKodaSettings({ ...this.plugin.settings, [key]: value })` und `plugin.saveSettings()` (3d-codeblocks-Muster: der deklarative Host validiert Typen, nicht unsere Grenzen).

- [ ] **Step 2: Endpoint-Zeilen-Editor als Hatch implementieren**

Pro Endpunkt eine `Setting`-Zeile: URL-Textfeld, API-Key-Textfeld (`inputEl.type = "password"`), Modell-Override-Textfeld, „Entfernen"-Button; darunter eine Adder-Zeile (`t("settings.addEndpoint")`). Jede Änderung läuft durch Kit-`applyEndpointEdit(eps, index, field, value, isAdder)`, Ergebnis via `mergeKodaSettings` speichern, Liste neu rendern. Ein „nach oben"-Button pro Zeile ruft `moveEndpointToFront` (die Listenreihenfolge IST die Priorität). Kein Test-pro-Zeile-Button im MVP (bewusster Schnitt; kommt mit der Endpoint-Diagnose in einer Ausbaustufe).

- [ ] **Step 3: Gate** — Run: `npm run gate` · Expected: grün.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: settings-tab (deklarativ + endpoint-zeilen + FolderSuggest)"`

---

### Task 15: Abschluss — Gate, Smoke-Checkliste, Doku

**Files:**
- Create: `docs/SMOKE.md`, `README.md`
- Modify: `CLAUDE.md` (Status + Commands aktualisieren)

- [ ] **Step 1: `docs/SMOKE.md` schreiben** — manuelle GUI-Checkliste (bis `gui-smoke-setup` das Repo automatisiert):

```markdown
# Koda GUI-Smoke (manuell, pro Release)

Vorbereitung: `npm run build`, Plugin in Test-Vault deployen, LM Studio mit Tool-faehigem Modell starten.

1. Sidebar öffnen (Ribbon-Hund) → Chat erscheint, Sprache folgt der UI-Sprache.
2. Frage "Welche Notizen habe ich zu X?" → ⚙ search_notes-Schritt sichtbar, Antwort mit [[Links]].
3. "Lies [[bekannte Notiz]] und fasse zusammen" → ⚙ read_note, Zusammenfassung korrekt.
4. "Leg unter Koda/Entwürfe/test.md eine Notiz an" → KEIN Modal, Datei existiert.
5. "Ergänze in <Notiz außerhalb> eine Zeile" → Modal mit Vorschau; Ablehnen → Koda meldet Ablehnung im Chat, Datei unverändert; Wiederholen + Bestätigen → Zeile da.
6. "Merk dir: <Fakt>" (bzw. save_memory-Anlass) → Koda/Memory.md enthält die Zeile mit Datum.
7. Stopp-Button mitten im Stream → Stream endet, UI bedienbar, Teiltext bleibt stehen.
8. Obsidian neu starten → Verlauf ist wieder da; "Neues Gespräch" leert ihn.
9. Falschen Endpoint eintragen → Klartext-Fehler (kein roher Stacktrace).
10. Reasoning-Modell ohne Suppress → "Denkt nach…"-Block einklappbar, Antwort sauber getrennt.
```

- [ ] **Step 2: README.md schreiben** — kurz: was Koda ist (3 Sätze), Feature-Liste MVP, Einrichtung (Endpoint, Modell, Koda-Ordner), Schreibregel erklärt, Verweis auf LAB.md/SMOKE.md. Keine absoluten Pfade.

- [ ] **Step 3: CLAUDE.md aktualisieren** — Status auf „MVP implementiert", Commands-Sektion mit `npm run gate` / `dev` / `lab:tools` füllen, Struktur-Kurzüberblick (core/llm/obsidian/vendor).

- [ ] **Step 4: Volles Gate + Endstand**

Run: `npm run gate`
Expected: alles grün. Danach `git status` sauber.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "docs: smoke-checkliste, README, CLAUDE.md-stand"`

**Nach diesem Task (außerhalb des Plans, eigene Sessions):** Release-Infra via Skill `plugin-release-setup`; GUI-Smoke-Automatisierung via Skill `gui-smoke-setup`; REGISTRY.md-Einträge im Dach (Agent-Loop, tool_calls-SSE-Parser, writePolicy, chat_error n=3, Lab-Befunde) — Dach-Repo gehört nicht zu diesem Working-Tree.

---

## Self-Review-Protokoll

- **Spec-Abdeckung:** Vier Tools (T4/T12), Schreibregel+Vorschau (T3/T12), Agent-Loop mit Runden-Limit/Abbruch/Fehler-Results (T9), Memory+System-Prompt (T10), Sessions JSONL + Fortsetzen + Neues Gespräch (T11/T13), Streaming-UI mit Reasoning-Block + Tool-Transparenz + Stop (T13), Settings inkl. Endpoint-Zeilen/FolderSuggest/Opt-in-Autostart (T14), koda-lab vor UI (T8), Gates ab Commit 1 (T1), i18n DE/EN (T13). Bewusste Plan-Präzisierungen gegenüber der Spec: kein Endpoint-Failover im MVP (erster Endpunkt gewinnt; Kit-`resolveActiveEndpointConfig` liegt vendored bereit), kein Test-Button pro Endpoint-Zeile, `ConfirmPort` lebt im VaultTools-Adapter statt als dritter Loop-Port. `isContextOverflow` aus der Spec ist im MVP über `chatErrorMessage`-Klartext abgedeckt; die dedizierte Erkennung kommt mit der Compaction (Stufe 2).
- **Platzhalter:** keine offenen TBD; T14 verweist bewusst auf das Lesen von `../vault-rag/src/settings.ts` (Erst-Exemplar der Hatch-Mechanik) statt sie blind nachzubauen.
- **Typ-Konsistenz:** `LlmResult` (T7) wird von `LoopLlm` (T9) wiederverwendet; `ToolRunner`/`ToolOutcome` (T4) von T9/T12; `WriteRequest` (T12) vom Modal; `SessionSink` (T11) vom adapter-Wrapper (T13).
