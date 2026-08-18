# Compaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Koda verdichtet seinen Gesprächsverlauf **im Agent-Loop** (zwischen Tool-Runden), bevor das Kontextfenster eines kleinen lokalen Modells überläuft — deterministische Tool-Stubs zuerst, Modell-Zusammenfassung abgeschlossener Runden nur wenn nötig, Überlauf-Fehler als reaktives Netz — und zeigt jede Verdichtung im Chat, ohne den vollen Verlauf für den Nutzer anzutasten.

**Architecture:** Der Verlauf wird `LogEntry[]` = `ChatMessage | CompactionRecord`; ein Record referenziert nichts, seine **Position** ist die Referenz („alles vor mir nach dieser Regel"). Eine pure Funktion `projectForModel(entries)` faltet die Records zur Nachrichtenliste, die auf den Draht geht — ohne Record identisch zum Verlauf. `runAgent` schätzt vor jedem Modellaufruf das Budget (Zeichen÷4), erzeugt bei Überschreitung Records (Stufe 1 pure, Stufe 2 über den Port `summarize`) und legt sie in denselben Rückgabekanal wie Nachrichten; `main.ts` persistiert (append-only JSONL) und rendert sie. Fünf neue Settings in einer Gruppe „Kontext & Verdichtung"; der Verbindungstest befüllt das Fenster vor, wenn der Endpunkt es meldet.

**Tech Stack:** TypeScript, vitest (globals: `describe`/`it`/`expect` ohne Import), esbuild, Obsidian-API, vendored obsidian-kit (aktuell 0.25.0; Task 10 zieht per `tools/sync-kit.sh` auf 0.26.1 — alle bisher vendorten Module sind byte-identisch, gemessen 2026-08-18).

**Spec:** `docs/superpowers/specs/2026-08-18-koda-compaction-design.md`

## Global Constraints

- `src/core/**` darf **nichts** aus `obsidian` importieren — `npm run check:pure` bricht sonst. Projektion, Schätzung, Stufe 1/2, Loop bleiben dort; DOM/API-Berührung nur in `src/obsidian/` und `src/main.ts`.
- **Modell-gerichtete Texte** (Stub-Text, zusammengesetzter Nutzer-Block) sind **deutsch** wie die Tool-Rückgabetexte in `retrieval.ts`/`vault-tools.ts`. Der Stufe-2-System-Prompt ist **englisch** mit Sprachanweisung („Write the summary in German/English") — dieselbe Form wie `buildSystemPrompt` in `src/core/memory/memory.ts`. **Oberflächentexte** laufen über `t()` und existieren DE **und** EN in `src/i18n/strings.ts`.
- Vendored Kit-Dateien (`src/vendor/**`) werden **nie von Hand** editiert — nur über `tools/sync-kit.sh`.
- Herkunftsstempel in Zeile 1 jeder übernommenen Datei/Funktion: `// uebernommen aus <repo>/<pfad>, 2026-08-18`.
- Keine `eslint-disable`-Kommentare (`scripts/check-no-inline-disables.mjs` ist Teil von `npm run lint`); keine absoluten Pfade in Quellcode/Tests (`scripts/check-no-abs-paths.mjs` läuft vor `npm test`).
- Vor jedem Commit: `npm run gate` (lint + typecheck + typecheck:scripts + test + check:pure + build). Bei reinen Doku-Tasks genügt `npm test`.
- Zahlen aus der Spec, verbatim: Fenster-Default **8192** Token (2048–1 000 000) · Schwelle **75 %** (40–95, Step 5) · **K = 3** (0–20) · Zusammenfassung **10 %** des Fensters (3–30) · Stufe 2 Default **an** · Packgrenze rollende Zusammenfassung **60 %** des Budgets (Konstante, keine Einstellung) · Schätzung **Zeichen ÷ 4** · Stub nur für Tool-Ergebnisse **> 160 Zeichen** (`STUB_MIN_CHARS`) · reaktive Wiederholung **genau einmal pro `ask()`**, zählt nicht gegen `maxRounds`.
- Der reaktive Pfad ist **nicht abschaltbar**; nur Stufe 2 hat einen Schalter.
- Neue Fehlerart `"overflow"` in `LlmResult.kind` und `AgentEvent.errorKind`; sie ist wie `"http"` **kein** Failover-Grund.

---

### Task 1: Überlauf-Erkennung — `isContextOverflow` + `kind: "overflow"`

Lücke 2 aus dem Seed. Lohnt allein: Ein Überlauf ist danach klassifiziert statt „irgendein HTTP-Fehler".

**Files:**
- Modify: `src/core/llm/chat-error.ts` (Export ergänzen)
- Modify: `src/llm/KodaChatClient.ts:30-32` (Union) und `:133-140` (Status-Zweig)
- Modify: `src/core/agent/loop.ts:15-20` (`errorKind`-Union)
- Modify: `src/main.ts:257-262` (Fehlertext) 
- Modify: `src/i18n/strings.ts` (Key `view.overflow`, DE+EN)
- Test: `tests/chat_error.test.ts`, `tests/chat_client.test.ts`

**Interfaces:**
- Produces: `isContextOverflow(body: string): boolean` in `src/core/llm/chat-error.ts`; `LlmResult` bekommt `kind: "overflow"`; `AgentEvent` `errorKind` bekommt `"overflow"`.

- [ ] **Step 1: Failing Tests für `isContextOverflow`** — ans Ende von `tests/chat_error.test.ts`:

```ts
import { isContextOverflow } from "../src/core/llm/chat-error";

describe("isContextOverflow", () => {
  it("erkennt LM-Studio-, Ollama- und OpenAI-Formulierungen", () => {
    expect(isContextOverflow('{"error":"The number of tokens to keep from the initial prompt is greater than the context length"}')).toBe(true);
    expect(isContextOverflow('{"error":{"message":"This model\'s maximum context length is 8192 tokens. However, your messages resulted in 9000 tokens."}}')).toBe(true);
    expect(isContextOverflow("context window exceeded")).toBe(true);
    expect(isContextOverflow("Too many tokens in prompt")).toBe(true);
  });
  it("laesst gewoehnliche Fehler durch", () => {
    expect(isContextOverflow('{"detail":"Not authenticated"}')).toBe(false);
    expect(isContextOverflow("")).toBe(false);
  });
});
```

(Der Import steht schon oben in der Datei für die anderen Symbole — dort `isContextOverflow` in die bestehende Import-Liste aufnehmen statt eines zweiten Imports.)

- [ ] **Step 2: Test läuft rot** — `npx vitest run tests/chat_error.test.ts` → FAIL „isContextOverflow is not a function".

- [ ] **Step 3: Implementieren** — in `src/core/llm/chat-error.ts` nach `ChatHttpError` einfügen:

```ts
// uebernommen aus vault-crews/src/core/chat-response.ts, 2026-08-18
const OVERFLOW_RE = /context (length|window)|too many tokens|maximum context length/i;

/** True, wenn ein (Fehler-)Body auf ein überschrittenes Kontextfenster hindeutet.
 *  Der Server-Text bleibt daneben erhalten — hier wird nur klassifiziert, nicht ersetzt. */
export function isContextOverflow(body: string): boolean {
  return OVERFLOW_RE.test(body);
}
```

- [ ] **Step 4: Test grün** — `npx vitest run tests/chat_error.test.ts` → PASS.

- [ ] **Step 5: Failing Test für den Client** — in `tests/chat_client.test.ts` hinter dem 401-Test:

```ts
  it("klassifiziert einen Kontext-Ueberlauf als kind overflow und behaelt den Server-Text", async () => {
    const body = '{"error":{"message":"This model\'s maximum context length is 8192 tokens."}}';
    const client = new KodaChatClient(transportOf([body], 400), 1000, fakeClock);
    const r = await client.complete(cfg, msgs, [], () => {}, () => {}, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, kind: "overflow" });
    if (!r.ok) expect(r.detail).toMatch(/8192/);
  });
```

- [ ] **Step 6: Test läuft rot** — `npx vitest run tests/chat_client.test.ts` → FAIL (kind ist "http").

- [ ] **Step 7: Client anpassen** — `src/llm/KodaChatClient.ts`: Import erweitern (`import { ChatHttpError, chatErrorMessage, isContextOverflow } from "../core/llm/chat-error";`), Union und Status-Zweig:

```ts
export type LlmResult =
  | { ok: true; content: string; toolCalls: ToolCall[]; finishReason?: string }
  | { ok: false; kind: "aborted" | "http" | "network" | "timeout" | "overflow"; detail: string; partial: string };
```

```ts
    if (status < 200 || status >= 300) {
      const detail = chatErrorMessage(new ChatHttpError(status, rawBody.slice(0, ERROR_BODY_CAP)));
      // Ueberlauf ist ein HTTP-Fehler mit eigener Bedeutung: der Loop kann darauf mit
      // Verdichtung reagieren, auf einen 401 nicht. Der Server-Text bleibt im detail.
      return { ok: false, kind: isContextOverflow(rawBody) ? "overflow" : "http", detail, partial: content };
    }
```

- [ ] **Step 8: Loop-Union + Fehlertext + i18n** — `src/core/agent/loop.ts`:

```ts
  | { kind: "error"; message: string; partial: string; errorKind: "aborted" | "http" | "network" | "timeout" | "overflow" }
```

`src/i18n/strings.ts` (in `en` und `de`):

```ts
    "view.overflow": "Context window exceeded — even after compaction. The model says: {0}. Start a new chat, or check “Context window” in the settings (currently {1}).",
```
```ts
    "view.overflow": "Kontextfenster überschritten — auch nach Verdichtung. Das Modell meldet: {0}. Neues Gespräch starten oder „Kontextfenster“ in den Einstellungen prüfen (aktuell {1}).",
```

`src/main.ts` im `onEvent`-Callback (Zeile ~257):

```ts
          if (e.kind === "error") {
            this.lastNotice = e.errorKind === "aborted"
              ? { text: t("view.stopped"), kind: "neutral" }
              : e.errorKind === "overflow"
                ? { text: t("view.overflow", e.message, s.contextWindowTokens), kind: "error" }
                : { text: t("err.generic", e.message), kind: "error" };
          }
```

`s.contextWindowTokens` gibt es erst ab Task 8 — **bis dahin** `t("view.overflow", e.message, "?")` schreiben und in Task 8 ersetzen. (Der Platzhalter ist absichtlich sichtbar, damit er nicht vergessen wird; Task 8 Step 6 räumt ihn auf.)

- [ ] **Step 9: Gate + Commit**

```bash
npm run gate
git add src/core/llm/chat-error.ts src/llm/KodaChatClient.ts src/core/agent/loop.ts src/main.ts src/i18n/strings.ts tests/chat_error.test.ts tests/chat_client.test.ts
git commit -m "feat(llm): Kontext-Ueberlauf als eigene Fehlerart klassifizieren (isContextOverflow aus vault-crews)"
```

---

### Task 2: Datenmodell — `CompactionRecord`, `LogEntry`, Persistenz

**Files:**
- Modify: `src/core/agent/types.ts`
- Modify: `src/core/memory/session.ts`
- Modify: `src/main.ts:38` (`chatLog`-Typ) und `:90`, `:265-266`
- Modify: `src/obsidian/view.ts:93-112` (Record-Zeilen vorerst überspringen)
- Test: `tests/session.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CompactionRecord {
    kind: "compaction"; stage: 1 | 2; at: string; forced?: true;
    keepToolResults: number; summary?: string; turns?: number;
    stats: { stubbed: number; bytes: number };
  }
  export type LogEntry = ChatMessage | CompactionRecord;
  export function isCompactionRecord(e: LogEntry): e is CompactionRecord;
  export function isChatMessage(e: LogEntry): e is ChatMessage;
  ```
  `ChatMessage` bekommt zwei **interne Projektions-Flags** `stubbed?: true` und `merged?: true` (nie persistiert, `toWireMessages` lässt sie ohnehin fallen).
  `parseLines(text): LogEntry[]`, `SessionStore.load(): Promise<LogEntry[]>`, `SessionStore.appendMessages(entries: LogEntry[])`.

- [ ] **Step 1: Failing Tests** — `tests/session.test.ts` ergänzen:

```ts
import type { CompactionRecord } from "../src/core/agent/types";

describe("CompactionRecord im JSONL", () => {
  const rec: CompactionRecord = { kind: "compaction", stage: 1, at: "2026-08-18T20:00:00.000Z", keepToolResults: 3, stats: { stubbed: 2, bytes: 4096 } };
  const rec2: CompactionRecord = { kind: "compaction", stage: 2, at: "2026-08-18T20:01:00.000Z", keepToolResults: 3, summary: "Bisher: A gelesen.", turns: 2, stats: { stubbed: 0, bytes: 900 } };

  it("Roundtrip Record neben Nachrichten, Reihenfolge bleibt", () => {
    const text = serializeLine(msg) + serializeLine(rec) + serializeLine({ role: "assistant", content: "Hi" }) + serializeLine(rec2);
    expect(parseLines(text)).toEqual([msg, rec, { role: "assistant", content: "Hi" }, rec2]);
  });
  it("Record ohne gueltige stage wird uebersprungen, kostet nur die Zeile", () => {
    const text = '{"kind":"compaction","stage":9}\n' + serializeLine(msg);
    expect(parseLines(text)).toEqual([msg]);
  });
  it("Store persistiert Records ueber appendMessages + load", async () => {
    const store = new SessionStore(memSink(), "sessions");
    await store.appendMessages([msg, rec]);
    expect(await store.load()).toEqual([msg, rec]);
  });
});
```

- [ ] **Step 2: Rot** — `npx vitest run tests/session.test.ts` → FAIL (Typfehler/parse verwirft den Record).

- [ ] **Step 3: Typen** — `src/core/agent/types.ts`, direkt nach `ChatMessage`:

```ts
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  /** Nur in der Projektion (`projectForModel`): dieses Tool-Ergebnis ist ein Stub. Nie persistiert. */
  stubbed?: true;
  /** Nur in der Projektion: zusammengesetzte fruehere Nutzer-Nachrichten (Stufe 2). Nie persistiert. */
  merged?: true;
}

/** Verdichtungs-Marke im Verlauf. Referenziert nichts — ihre POSITION ist die Referenz:
 *  „alles vor mir wird nach dieser Regel verdichtet“. Robust gegen verlorene JSONL-Zeilen,
 *  braucht keine Nachrichten-IDs und keine Migration (Spec § Datenmodell). */
export interface CompactionRecord {
  kind: "compaction";
  stage: 1 | 2;
  /** ISO-Zeitstempel, nur fuer Anzeige/Log. */
  at: string;
  /** Reaktiv nach einem Ueberlauf erzwungen — die Marke im Chat sagt es dazu. */
  forced?: true;
  /** Stufe 1: die K juengsten Tool-Ergebnisse vor mir bleiben woertlich. */
  keepToolResults: number;
  /** Stufe 2: Zusammenfassungstext. Ohne Text kein Record (leer waere schlimmer als keiner). */
  summary?: string;
  /** Stufe 2: wie viele abgeschlossene Runden zusammengefasst wurden (Anzeige). */
  turns?: number;
  /** Was Stufe 1 gekuerzt hat (Anzahl, Zeichen) — fuer die Marke im Chat. */
  stats: { stubbed: number; bytes: number };
}

export type LogEntry = ChatMessage | CompactionRecord;

export function isCompactionRecord(e: LogEntry): e is CompactionRecord {
  return (e as CompactionRecord).kind === "compaction";
}
export function isChatMessage(e: LogEntry): e is ChatMessage {
  return !isCompactionRecord(e);
}
```

- [ ] **Step 4: Persistenz** — `src/core/memory/session.ts`:

```ts
import type { LogEntry } from "../agent/types";

export function serializeLine(m: LogEntry): string {
  return JSON.stringify(m) + "\n";
}

export function parseLines(text: string): LogEntry[] {
  const out: LogEntry[] = [];
  for (const raw of text.split("\n")) {
    const lineText = raw.trim();
    if (lineText === "") continue;
    try {
      const parsed = JSON.parse(lineText) as Record<string, unknown>;
      if (parsed.kind === "compaction") {
        // Zweiter Shape neben ChatMessage. Minimal geprueft: stage 1|2 und stats-Objekt —
        // eine kaputte Marke kostet die Marke, nicht die Session.
        if ((parsed.stage === 1 || parsed.stage === 2) && typeof parsed.stats === "object" && parsed.stats !== null) {
          out.push(parsed as unknown as LogEntry);
        }
        continue;
      }
      if (typeof parsed.role === "string" && typeof parsed.content === "string") out.push(parsed as unknown as LogEntry);
    } catch {
      // Eine kaputte Zeile kostet eine Nachricht, nicht die Session.
    }
  }
  return out;
}
```

und in `SessionStore`: `load(): Promise<LogEntry[]>`, `appendMessages(msgs: LogEntry[])`.

- [ ] **Step 5: Aufrufer nachziehen** — `src/main.ts`: Import `type LogEntry` statt `type ChatMessage` dort, wo `chatLog` typisiert ist; `chatLog: LogEntry[] = [];`. `ChatMessage` bleibt für `userMsg`/`system` importiert. `src/obsidian/view.ts` in `renderLog()` am Anfang der Schleife:

```ts
    for (const m of this.plugin.chatLog) {
      if (isCompactionRecord(m)) continue; // Rendering kommt in Task 9
      if (m.role === "user") {
```

(Import: `import { isCompactionRecord } from "../core/agent/types";`.) `runAgent` nimmt vorerst weiterhin `ChatMessage[]` — `[system, ...this.chatLog]` ist jetzt `LogEntry[]`; bis Task 5 filtern: `[system, ...this.chatLog.filter(isChatMessage)]` (Import `isChatMessage`). Task 5 hebt den Filter wieder auf.

- [ ] **Step 6: Grün + Gate + Commit**

```bash
npx vitest run tests/session.test.ts
npm run gate
git add src/core/agent/types.ts src/core/memory/session.ts src/main.ts src/obsidian/view.ts tests/session.test.ts
git commit -m "feat(session): CompactionRecord als zweiter JSONL-Shape, Verlauf wird LogEntry[]"
```

---

### Task 3: `projectForModel` — die Projektion

**Files:**
- Create: `src/core/agent/compaction/project.ts`
- Test: `tests/compaction_project.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const STUB_MIN_CHARS = 160;
  export function shouldStub(m: ChatMessage): boolean;              // tool && !stubbed && content.length > STUB_MIN_CHARS
  export function formatStub(name: string, args: string, chars: number): string;
  export function projectForModel(entries: LogEntry[]): ChatMessage[];
  ```

- [ ] **Step 1: Failing Tests** — `tests/compaction_project.test.ts`:

```ts
import { projectForModel, formatStub, STUB_MIN_CHARS } from "../src/core/agent/compaction/project";
import type { ChatMessage, CompactionRecord, LogEntry } from "../src/core/agent/types";

const sys: ChatMessage = { role: "system", content: "SYS" };
const u = (c: string): ChatMessage => ({ role: "user", content: c });
const a = (c: string): ChatMessage => ({ role: "assistant", content: c });
const call = (id: string, name: string, args: string): ChatMessage => ({ role: "assistant", content: "", toolCalls: [{ id, name, arguments: args }] });
const tool = (id: string, c: string): ChatMessage => ({ role: "tool", toolCallId: id, content: c });
const big = (tag: string): string => `${tag} ${"x".repeat(STUB_MIN_CHARS + 40)}`;
const s1 = (keep: number): CompactionRecord => ({ kind: "compaction", stage: 1, at: "t", keepToolResults: keep, stats: { stubbed: 0, bytes: 0 } });
const s2 = (summary: string, turns: number): CompactionRecord => ({ kind: "compaction", stage: 2, at: "t", keepToolResults: 3, summary, turns, stats: { stubbed: 0, bytes: 0 } });

/** Ein Verlauf mit zwei abgeschlossenen Runden und einer laufenden. */
function history(): LogEntry[] {
  return [
    sys,
    u("Frage 1"), call("c1", "read_note", '{"path":"A.md"}'), tool("c1", big("A")), a("Antwort 1"),
    u("Frage 2"), call("c2", "list_notes", '{"folder":"P"}'), tool("c2", big("P")), a("Antwort 2"),
    u("Frage 3"), call("c3", "read_note", '{"path":"B.md"}'), tool("c3", big("B")),
    call("c4", "search_notes", '{"query":"q"}'), tool("c4", "kurz"),
  ];
}

describe("projectForModel", () => {
  it("ohne Record ist die Projektion identisch zum Verlauf", () => {
    const h = history();
    expect(projectForModel(h)).toEqual(h);
  });

  it("Stufe 1: die K juengsten Tool-Ergebnisse bleiben, aeltere werden gestubbt, Aufrufe bleiben", () => {
    const out = projectForModel([...history(), s1(1)]);
    const tools = out.filter((m) => m.role === "tool");
    expect(tools).toHaveLength(4);
    // c4 ist juengstes (bleibt woertlich, ist ohnehin kurz), c3 zweitjuengstes -> gestubbt (K=1)
    expect(tools[3]).toMatchObject({ toolCallId: "c4", content: "kurz" });
    expect(tools[2].content).toBe(formatStub("read_note", '{"path":"B.md"}', big("B").length));
    expect(tools[2].stubbed).toBe(true);
    expect(tools[0].content).toContain('read_note "A.md"');
    // Der Aufruf selbst bleibt vollstaendig
    expect(out.find((m) => m.toolCalls?.[0]?.id === "c1")).toEqual(call("c1", "read_note", '{"path":"A.md"}'));
  });

  it("Stufe 1 mit K=0 stubbt alles Lange; kurze Ergebnisse bleiben, weil ein Stub nichts spart", () => {
    const out = projectForModel([...history(), s1(0)]);
    const tools = out.filter((m) => m.role === "tool");
    expect(tools.slice(0, 3).every((m) => m.stubbed === true)).toBe(true);
    expect(tools[3]).toEqual(tool("c4", "kurz"));
  });

  it("Stufe 1 mit K groesser als vorhanden aendert nichts", () => {
    const h = history();
    expect(projectForModel([...h, s1(10)])).toEqual(h);
  });

  it("Stufe 2: abgeschlossene Runden -> ein user(merged) + ein assistant(summary); laufende Runde bleibt", () => {
    const out = projectForModel([...history(), s2("ZUSAMMENFASSUNG", 2)]);
    expect(out[0]).toEqual(sys);
    expect(out[1]).toMatchObject({ role: "user", merged: true });
    expect(out[1].content).toContain("1. Frage 1");
    expect(out[1].content).toContain("2. Frage 2");
    expect(out[2]).toEqual({ role: "assistant", content: "ZUSAMMENFASSUNG" });
    expect(out[3]).toEqual(u("Frage 3"));
    expect(out.slice(3)).toEqual(history().slice(9));
  });

  it("Stufe 2 ohne abgeschlossene Runden ist ein No-op", () => {
    const h: LogEntry[] = [sys, u("Frage 1"), call("c1", "read_note", "{}"), tool("c1", big("A"))];
    expect(projectForModel([...h, s2("X", 0)])).toEqual(h);
  });

  it("Stufe 2 ohne summary (kaputte Marke) ist ein No-op", () => {
    const h = history();
    const broken = { ...s2("X", 2) };
    delete broken.summary;
    expect(projectForModel([...h, broken])).toEqual(h);
  });

  it("zwei Stufe-2-Records: der merged-Block bleibt flach, die aeltere Zusammenfassung wird Material", () => {
    const first: LogEntry[] = [...history(), s2("ZF1", 2)];
    const later: LogEntry[] = [...first, a("Antwort 3"), u("Frage 4"), a("laeuft"), s2("ZF2", 3)];
    const out = projectForModel(later);
    expect(out[1]).toMatchObject({ role: "user", merged: true });
    expect(out[1].content).toContain("1. Frage 1");
    expect(out[1].content).toContain("3. Frage 3");
    expect(out[1].content).not.toContain("Frühere Anfragen (wörtlich):\n1. Frühere");
    expect(out[2]).toEqual({ role: "assistant", content: "ZF2" });
    expect(out[3]).toEqual(u("Frage 4"));
  });

  it("Stufe 1 nach Stufe 2 wirkt auf die projizierte Folge (auch auf die laufende Runde)", () => {
    const out = projectForModel([...history(), s2("ZF", 2), s1(0)]);
    const tools = out.filter((m) => m.role === "tool");
    expect(tools).toHaveLength(2);
    expect(tools[0].stubbed).toBe(true);
  });

  it("Invariante: nie zwei user hintereinander, jedes tool hat sein toolCalls-Gegenstueck", () => {
    // deterministischer Pseudo-Zufall, damit der Test reproduzierbar ist
    let seed = 42;
    const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let run = 0; run < 200; run++) {
      const entries: LogEntry[] = [sys];
      let id = 0;
      const turns = 1 + rnd(5);
      for (let t = 0; t < turns; t++) {
        entries.push(u(`F${t}`));
        const calls = rnd(4);
        for (let c = 0; c < calls; c++) {
          const cid = `c${id++}`;
          entries.push(call(cid, "read_note", `{"path":"${cid}.md"}`));
          entries.push(tool(cid, rnd(2) === 0 ? "kurz" : big(cid)));
          if (rnd(3) === 0) entries.push(s1(rnd(3)));
        }
        if (t < turns - 1) entries.push(a(`A${t}`));
        if (rnd(3) === 0) entries.push(s2(`ZF${t}`, t));
      }
      const out = projectForModel(entries);
      for (let i = 1; i < out.length; i++) {
        expect(!(out[i - 1].role === "user" && out[i].role === "user")).toBe(true);
      }
      const known = new Set<string>();
      for (const m of out) {
        if (m.role === "assistant" && m.toolCalls) for (const c of m.toolCalls) known.add(c.id);
        if (m.role === "tool") expect(known.has(m.toolCallId ?? "")).toBe(true);
      }
    }
  });
});

describe("formatStub", () => {
  it("nennt Werkzeug, Kernargument und Groesse und sagt, wie man es zurueckbekommt", () => {
    expect(formatStub("read_note", '{"path":"Projekte/X.md"}', 4300)).toBe('[read_note "Projekte/X.md" — 4,2 KB, verdichtet; bei Bedarf erneut aufrufen]');
    expect(formatStub("search_notes", '{"query":"Rezepte"}', 900)).toBe('[search_notes "Rezepte" — 0,9 KB, verdichtet; bei Bedarf erneut aufrufen]');
    expect(formatStub("list_notes", "kaputt", 300)).toBe("[list_notes — 0,3 KB, verdichtet; bei Bedarf erneut aufrufen]");
  });
});
```

- [ ] **Step 2: Rot** — `npx vitest run tests/compaction_project.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: Implementieren** — `src/core/agent/compaction/project.ts`:

```ts
/* Projektion des Verlaufs fuer das Modell.
 *
 * Der Verlauf (`LogEntry[]`) bleibt, was er ist — der Nutzer sieht ihn vollstaendig, das
 * JSONL ist append-only. Was auf den Draht geht, ist eine PROJEKTION: ein Fold von links
 * ueber die Verdichtungs-Marken. Eine Marke referenziert nichts; ihre Position ist die
 * Referenz („alles vor mir nach dieser Regel“). Ohne Marke ist die Projektion identisch
 * zum Verlauf. Spec: docs/superpowers/specs/2026-08-18-koda-compaction-design.md */
import { isCompactionRecord, type ChatMessage, type CompactionRecord, type LogEntry } from "../types";

/** Unter dieser Laenge spart ein Stub nichts — Fehler-Ergebnisse (`ERROR: …`) bleiben. */
export const STUB_MIN_CHARS = 160;

export const MERGED_HEADER = "Frühere Anfragen (wörtlich):";

export function shouldStub(m: ChatMessage): boolean {
  return m.role === "tool" && m.stubbed !== true && m.content.length > STUB_MIN_CHARS;
}

function coreArgument(args: string): string | null {
  try {
    const parsed: unknown = JSON.parse(args);
    if (typeof parsed !== "object" || parsed === null) return null;
    const rec = parsed as Record<string, unknown>;
    for (const key of ["path", "query", "folder"]) {
      if (typeof rec[key] === "string" && rec[key] !== "") return rec[key] as string;
    }
  } catch {
    // kein JSON — dann ohne Kernargument
  }
  return null;
}

function formatKb(chars: number): string {
  return `${(chars / 1024).toFixed(1).replace(".", ",")} KB`;
}

/** Stub-Text: sagt dem Modell WAS weg ist und WIE es zurueckkommt. */
export function formatStub(name: string, args: string, chars: number): string {
  const arg = coreArgument(args);
  const head = arg === null ? name : `${name} "${arg}"`;
  return `[${head} — ${formatKb(chars)}, verdichtet; bei Bedarf erneut aufrufen]`;
}

/** Ein projizierter Eintrag traegt seine Quelle mit — die braucht Stufe 1 fuer den Stub-Text
 *  (Originalgroesse) und Stufe 2 fuer die flache Fortschreibung des merged-Blocks. */
interface Slot {
  msg: ChatMessage;
  /** Nur bei merged-Nachrichten: die woertlichen Nutzer-Anfragen. */
  parts?: string[];
}

function renderMerged(parts: string[]): ChatMessage {
  const body = parts.map((p, i) => `${i + 1}. ${p}`).join("\n");
  return { role: "user", content: `${MERGED_HEADER}\n${body}`, merged: true };
}

function applyStage1(slots: Slot[], rec: CompactionRecord, calls: Map<string, { name: string; args: string }>): void {
  let seen = 0;
  for (let i = slots.length - 1; i >= 0; i--) {
    const m = slots[i].msg;
    if (m.role !== "tool") continue;
    seen++;
    if (seen <= rec.keepToolResults) continue;
    if (!shouldStub(m)) continue;
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

function applyStage2(slots: Slot[], rec: CompactionRecord): Slot[] {
  if (rec.summary === undefined || rec.summary === "") return slots;
  const start = slots.findIndex((s) => s.msg.role !== "system");
  if (start === -1) return slots;
  let lastUser = -1;
  for (let i = slots.length - 1; i >= start; i--) {
    if (slots[i].msg.role === "user") { lastUser = i; break; }
  }
  // Region = [start, lastUser): abgeschlossene Runden. Leer -> nichts zu tun.
  if (lastUser <= start) return slots;
  const parts: string[] = [];
  for (let i = start; i < lastUser; i++) {
    const s = slots[i];
    if (s.msg.role !== "user") continue;
    if (s.parts) parts.push(...s.parts); // flach fortschreiben statt verschachteln
    else parts.push(s.msg.content);
  }
  const merged: Slot = { msg: renderMerged(parts), parts };
  const summary: Slot = { msg: { role: "assistant", content: rec.summary } };
  return [...slots.slice(0, start), merged, summary, ...slots.slice(lastUser)];
}

export function projectForModel(entries: LogEntry[]): ChatMessage[] {
  let slots: Slot[] = [];
  const calls = new Map<string, { name: string; args: string }>();
  for (const e of entries) {
    if (isCompactionRecord(e)) {
      if (e.stage === 1) applyStage1(slots, e, calls);
      else slots = applyStage2(slots, e);
      continue;
    }
    if (e.role === "assistant" && e.toolCalls) {
      for (const c of e.toolCalls) calls.set(c.id, { name: c.name, args: c.arguments });
    }
    slots.push({ msg: e });
  }
  return slots.map((s) => s.msg);
}
```

- [ ] **Step 4: Grün** — `npx vitest run tests/compaction_project.test.ts` → PASS. Falls der Identitäts-Test scheitert, weil `toEqual` `stubbed: undefined`-Felder sieht: keine `undefined`-Felder setzen (der Code oben setzt Flags nur, wenn `true`).

- [ ] **Step 5: Gate + Commit**

```bash
npm run gate
git add src/core/agent/compaction/project.ts tests/compaction_project.test.ts
git commit -m "feat(compaction): projectForModel — positionsbasierter Fold ueber Verdichtungs-Marken"
```

---

### Task 4: `estimateTokens` + Stufe 1 (`planStage1`)

**Files:**
- Create: `src/core/agent/compaction/estimate.ts`
- Create: `src/core/agent/compaction/stage1.ts`
- Test: `tests/compaction_stage1.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function estimateTokens(msgs: ChatMessage[], overheadChars?: number): number;   // ceil((JSON(wire).length + overhead) / 4)
  export function planStage1(projected: ChatMessage[], keep: number, at: string, forced?: boolean): CompactionRecord | null;
  ```

- [ ] **Step 1: Failing Tests** — `tests/compaction_stage1.test.ts`:

```ts
import { estimateTokens } from "../src/core/agent/compaction/estimate";
import { planStage1 } from "../src/core/agent/compaction/stage1";
import { projectForModel, STUB_MIN_CHARS } from "../src/core/agent/compaction/project";
import type { ChatMessage, LogEntry } from "../src/core/agent/types";

const u = (c: string): ChatMessage => ({ role: "user", content: c });
const call = (id: string, name: string, args: string): ChatMessage => ({ role: "assistant", content: "", toolCalls: [{ id, name, arguments: args }] });
const tool = (id: string, c: string): ChatMessage => ({ role: "tool", toolCallId: id, content: c });
const big = (tag: string): string => `${tag} ${"x".repeat(STUB_MIN_CHARS + 40)}`;

describe("estimateTokens", () => {
  it("ist Zeichen der Wire-Form durch 4, aufgerundet, plus Overhead", () => {
    const msgs: ChatMessage[] = [u("abcd")];
    const wireChars = JSON.stringify([{ role: "user", content: "abcd" }]).length;
    expect(estimateTokens(msgs)).toBe(Math.ceil(wireChars / 4));
    expect(estimateTokens(msgs, 400)).toBe(Math.ceil((wireChars + 400) / 4));
  });
  it("ist monoton: mehr Text, mehr Token", () => {
    expect(estimateTokens([u("a".repeat(100))])).toBeLessThan(estimateTokens([u("a".repeat(1000))]));
  });
});

describe("planStage1", () => {
  const h: LogEntry[] = [
    u("F"), call("c1", "read_note", '{"path":"A.md"}'), tool("c1", big("A")),
    call("c2", "read_note", '{"path":"B.md"}'), tool("c2", big("B")),
    call("c3", "search_notes", '{"query":"q"}'), tool("c3", "kurz"),
  ];
  it("zaehlt genau die Kandidaten jenseits von K, die ein Stub kuerzen wuerde", () => {
    const rec = planStage1(projectForModel(h), 1, "T");
    // K=1 schuetzt c3 (kurz, waere ohnehin nicht gestubbt); c2 und c1 sind Kandidaten
    expect(rec).toMatchObject({ kind: "compaction", stage: 1, at: "T", keepToolResults: 1, stats: { stubbed: 2, bytes: big("A").length + big("B").length } });
    expect(rec?.forced).toBeUndefined();
  });
  it("liefert null, wenn nichts zu kuerzen ist (K deckt alles oder alles ist kurz/gestubbt)", () => {
    expect(planStage1(projectForModel(h), 5, "T")).toBeNull();
    const already = projectForModel([...h, planStage1(projectForModel(h), 0, "T")!]);
    expect(planStage1(already, 0, "T")).toBeNull();
  });
  it("forced setzt das Kennzeichen", () => {
    expect(planStage1(projectForModel(h), 0, "T", true)?.forced).toBe(true);
  });
  it("Record und Projektion stimmen ueberein: nach Anwendung sind genau stats.stubbed Stubs mehr", () => {
    const before = projectForModel(h).filter((m) => m.stubbed).length;
    const rec = planStage1(projectForModel(h), 0, "T")!;
    const after = projectForModel([...h, rec]).filter((m) => m.stubbed).length;
    expect(after - before).toBe(rec.stats.stubbed);
  });
});
```

- [ ] **Step 2: Rot** — `npx vitest run tests/compaction_stage1.test.ts` → FAIL.

- [ ] **Step 3: Implementieren** — `src/core/agent/compaction/estimate.ts`:

```ts
import { toWireMessages, type ChatMessage } from "../types";

/** Grobe Token-Schaetzung: Zeichen der Wire-Form durch 4. Kein Tokenizer im Plugin — die
 *  Schwelle (Default 75 %) und das reaktive Netz fangen den Schaetzfehler. `overheadChars`
 *  ist, was neben den Nachrichten mitgeht (Tool-Definitionen). */
export function estimateTokens(msgs: ChatMessage[], overheadChars = 0): number {
  return Math.ceil((JSON.stringify(toWireMessages(msgs)).length + overheadChars) / 4);
}
```

`src/core/agent/compaction/stage1.ts`:

```ts
import type { ChatMessage, CompactionRecord } from "../types";
import { shouldStub } from "./project";

/** Stufe 1: Tool-Ergebnisse jenseits der K juengsten durch Stubs ersetzen. Deterministisch,
 *  kostenlos. Liefert nur dann einen Record, wenn er etwas kuerzt — sonst null (der Loop
 *  geht dann zu Stufe 2). Die Zaehlung folgt exakt der Regel in `applyStage1`, damit die
 *  Marke im Chat sagt, was die Projektion tut. */
export function planStage1(projected: ChatMessage[], keep: number, at: string, forced = false): CompactionRecord | null {
  let seen = 0;
  let stubbed = 0;
  let bytes = 0;
  for (let i = projected.length - 1; i >= 0; i--) {
    const m = projected[i];
    if (m.role !== "tool") continue;
    seen++;
    if (seen <= keep) continue;
    if (!shouldStub(m)) continue;
    stubbed++;
    bytes += m.content.length;
  }
  if (stubbed === 0) return null;
  const rec: CompactionRecord = { kind: "compaction", stage: 1, at, keepToolResults: keep, stats: { stubbed, bytes } };
  if (forced) rec.forced = true;
  return rec;
}
```

- [ ] **Step 4: Grün + Gate + Commit**

```bash
npx vitest run tests/compaction_stage1.test.ts
npm run gate
git add src/core/agent/compaction/estimate.ts src/core/agent/compaction/stage1.ts tests/compaction_stage1.test.ts
git commit -m "feat(compaction): Token-Schaetzung und Stufe 1 (Tool-Stubs)"
```

---

### Task 5: Loop — proaktive Verdichtung (Stufe 1) + `compaction`-Event

**Files:**
- Modify: `src/core/agent/loop.ts`
- Modify: `src/main.ts` (Filter aus Task 2 aufheben; `compaction`-Event vorerst ignorieren)
- Test: `tests/loop.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CompactionDeps {
    budgetTokens: number;
    keepToolResults: number;
    overheadChars: number;
    summarize: ((msgs: ChatMessage[]) => Promise<string | null>) | null;  // Task 7 nutzt es; hier schon im Typ
    summaryMaxChars: number;
    lang: "de" | "en";
    now: () => string;
  }
  export interface AgentDeps { …; compaction?: CompactionDeps }   // undefined = keine Verdichtung (Bestandsverhalten)
  export type AgentEvent = … | { kind: "compaction"; record: CompactionRecord };
  export async function runAgent(deps, history: LogEntry[], …): Promise<LogEntry[]>;
  ```

- [ ] **Step 1: Bestehende Tests auf `LogEntry[]` ziehen** — in `tests/loop.test.ts` oben:

```ts
import { isChatMessage, type ChatMessage, type LogEntry, type ToolOutcome, type ToolRunner } from "../src/core/agent/types";
/** Nur die Nachrichten eines Laufs — Verdichtungs-Marken interessieren die Alt-Tests nicht. */
const msgsOf = (out: LogEntry[]): ChatMessage[] => out.filter(isChatMessage);
```

und an allen 11 `const out = await runAgent(` -Stellen: `const out = msgsOf(await runAgent(` … `));`. (Mechanisch; die 7 `out[…]`/`out.map`-Zugriffe bleiben dann unverändert.)

- [ ] **Step 2: Failing Tests** — ans Ende von `tests/loop.test.ts`:

```ts
import { STUB_MIN_CHARS } from "../src/core/agent/compaction/project";
import { isCompactionRecord } from "../src/core/agent/types";

const big = (tag: string): string => `${tag} ${"x".repeat(STUB_MIN_CHARS + 40)}`;
const compaction = (budgetTokens: number, keep = 3) => ({
  budgetTokens, keepToolResults: keep, overheadChars: 0, summarize: null, summaryMaxChars: 400, lang: "de" as const, now: () => "T",
});
const bigTools: ToolRunner = { run: async (name): Promise<ToolOutcome> => ({ ok: true, content: big(name) }) };
const readThenFinal = (n: number): LlmResult[] => [
  ...Array.from({ length: n }, (_, i): LlmResult => ({ ok: true, content: "", toolCalls: [{ id: `c${i}`, name: "read_note", arguments: `{"path":"N${i}.md"}` }] })),
  { ok: true, content: "Fertig", toolCalls: [] },
];

describe("runAgent · Verdichtung (proaktiv)", () => {
  it("ohne compaction-Dep: keine Records, Bestandsverhalten", async () => {
    const out = await runAgent(
      { llm: scripted(readThenFinal(4)), tools: bigTools, maxRounds: 8, textFallback: false },
      user, () => {}, () => {}, () => {}, sig(),
    );
    expect(out.some(isCompactionRecord)).toBe(false);
  });

  it("ueber Budget: Stufe-1-Record im Rueckgabekanal, compaction-Event, das Modell sieht Stubs", async () => {
    const seen: ChatMessage[][] = [];
    const llm: LoopLlm = { complete: async (m) => { seen.push(m); return scriptedResults[Math.min(seen.length - 1, scriptedResults.length - 1)]; } };
    const scriptedResults = readThenFinal(4);
    const events: string[] = [];
    // Budget so klein, dass nach zwei grossen Ergebnissen verdichtet werden muss, K=1
    const out = await runAgent(
      { llm, tools: bigTools, maxRounds: 8, textFallback: false, compaction: compaction(150, 1) },
      user, () => {}, () => {}, (e) => events.push(e.kind), sig(),
    );
    const recs = out.filter(isCompactionRecord);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0]).toMatchObject({ stage: 1, keepToolResults: 1 });
    expect(events).toContain("compaction");
    // Im letzten Aufruf ans Modell sind aeltere Tool-Ergebnisse Stubs, das juengste nicht
    const last = seen[seen.length - 1];
    const tools = last.filter((m) => m.role === "tool");
    expect(tools[tools.length - 1].stubbed).toBeUndefined();
    expect(tools.slice(0, -1).some((m) => m.stubbed === true)).toBe(true);
    // Reihenfolge: Record steht VOR den Nachrichten der Runde, in der er entstand
    const firstRec = out.findIndex(isCompactionRecord);
    expect(out[firstRec + 1]).toMatchObject({ role: "assistant" });
  });

  it("unter Budget: kein Record", async () => {
    const out = await runAgent(
      { llm: scripted(readThenFinal(2)), tools: bigTools, maxRounds: 8, textFallback: false, compaction: compaction(100_000) },
      user, () => {}, () => {}, () => {}, sig(),
    );
    expect(out.some(isCompactionRecord)).toBe(false);
  });
});
```

- [ ] **Step 3: Rot** — `npx vitest run tests/loop.test.ts` → FAIL (Typ/`compaction` unbekannt).

- [ ] **Step 4: Loop umbauen** — `src/core/agent/loop.ts` vollständig:

```ts
import {
  isChatMessage,
  type ChatMessage,
  type CompactionRecord,
  type LogEntry,
  type ToolCall,
  type ToolOutcome,
  type ToolRunner,
} from "./types";
import type { LlmResult } from "../../llm/KodaChatClient";
import { parseTextToolCall } from "./text-fallback";
import { projectForModel } from "./compaction/project";
import { estimateTokens } from "./compaction/estimate";
import { planStage1 } from "./compaction/stage1";

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
  | { kind: "error"; message: string; partial: string; errorKind: "aborted" | "http" | "network" | "timeout" | "overflow" }
  | { kind: "round-limit" }
  | { kind: "compaction"; record: CompactionRecord };

/** Verdichtung — alle Zahlen kommen aus den Settings, umgerechnet in `main.ts`.
 *  `summarize === null` heisst: Stufe 2 ist aus. */
export interface CompactionDeps {
  /** Schwelle in Token (Fenster × Prozent). Darueber wird verdichtet. */
  budgetTokens: number;
  /** K — Tool-Ergebnisse, die woertlich bleiben. */
  keepToolResults: number;
  /** Zeichen, die neben den Nachrichten mitgehen (Tool-Definitionen). */
  overheadChars: number;
  /** Stufe 2: ein Modellaufruf ohne Tools; null bei Fehler/leer. */
  summarize: ((msgs: ChatMessage[]) => Promise<string | null>) | null;
  /** Obergrenze fuer den Zusammenfassungstext in Zeichen. */
  summaryMaxChars: number;
  lang: "de" | "en";
  /** ISO-Zeitstempel fuer Records — injiziert, damit Tests deterministisch sind. */
  now: () => string;
}

export interface AgentDeps {
  llm: LoopLlm;
  tools: ToolRunner;
  maxRounds: number;
  /** true: JSON-Tool-Objekte im Antworttext werden als Tool-Call behandelt
   *  (Default laut koda-lab-Befund, docs/LAB.md). */
  textFallback: boolean;
  /** Fehlt: keine Verdichtung (Bestandsverhalten, alte Tests). */
  compaction?: CompactionDeps;
}

/** Der Agent-Loop: LLM → Tools → LLM … bis finale Antwort, Fehler oder Runden-Limit.
 *  Pure: kennt nur die Ports. Rueckgabe sind die NEU erzeugten Eintraege — Nachrichten
 *  UND Verdichtungs-Marken im selben Kanal; der Aufrufer haengt sie an seine Session
 *  und persistiert. Vor jedem Modellaufruf wird der Verlauf projiziert und bei Bedarf
 *  verdichtet (Spec § Architektur). */
export async function runAgent(
  deps: AgentDeps,
  history: LogEntry[],
  onToken: (t: string) => void,
  onReasoning: (t: string) => void,
  onEvent: (e: AgentEvent) => void,
  signal: AbortSignal,
): Promise<LogEntry[]> {
  const appended: LogEntry[] = [];
  const entries = (): LogEntry[] => [...history, ...appended];
  const c = deps.compaction;

  const overBudget = (msgs: ChatMessage[]): boolean =>
    c !== undefined && estimateTokens(msgs, c.overheadChars) > c.budgetTokens;

  /** Verdichtet, wenn noetig (oder erzwungen). true, wenn mindestens ein Record entstand. */
  const compact = async (forced: boolean): Promise<boolean> => {
    if (c === undefined) return false;
    let did = false;
    let msgs = projectForModel(entries());
    if (forced || overBudget(msgs)) {
      const r1 = planStage1(msgs, forced ? 0 : c.keepToolResults, c.now(), forced);
      if (r1 !== null) {
        appended.push(r1);
        onEvent({ kind: "compaction", record: r1 });
        did = true;
        msgs = projectForModel(entries());
      }
    }
    // Stufe 2 folgt in Task 7 an genau dieser Stelle.
    return did;
  };

  let round = 0;
  while (round < deps.maxRounds) {
    await compact(false);
    const r = await deps.llm.complete(projectForModel(entries()), onToken, onReasoning, signal);

    if (!r.ok) {
      if (r.partial !== "") appended.push({ role: "assistant", content: r.partial });
      onEvent({ kind: "error", message: r.detail, partial: r.partial, errorKind: r.kind });
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
      if (signal.aborted) {
        onEvent({ kind: "error", message: "", partial: "", errorKind: "aborted" });
        return appended;
      }
      onEvent({ kind: "tool-start", call });
      const outcome = await runOne(deps.tools, call);
      onEvent({ kind: "tool-end", call, outcome });
      appended.push({
        role: "tool",
        toolCallId: call.id,
        content: outcome.ok ? outcome.content : `ERROR: ${outcome.error}`,
      });
    }
    round++;
  }

  onEvent({ kind: "round-limit" });
  return appended;
}
```

(`runOne` bleibt unverändert; `isChatMessage` wird in Task 7 gebraucht — falls `noUnusedLocals` meckert: es steht auf `false`, der Import darf stehen bleiben; sonst erst in Task 7 importieren.)

- [ ] **Step 5: `main.ts` nachziehen** — Filter aus Task 2 entfernen: `[system, ...this.chatLog]` (jetzt `LogEntry[]`, passt). `const appended = await runAgent(…)` ist `LogEntry[]`; `this.chatLog.push(...appended)` und `this.store.appendMessages(appended)` passen. `compaction`-Dep noch **nicht** übergeben (Task 9).

- [ ] **Step 6: Grün + Gate + Commit**

```bash
npx vitest run tests/loop.test.ts
npm run gate
git add src/core/agent/loop.ts src/main.ts tests/loop.test.ts
git commit -m "feat(loop): proaktive Verdichtung vor jedem Modellaufruf (Stufe 1) + compaction-Event"
```

---

### Task 6: Loop — reaktiver Pfad (Überlauf → erzwungen → einmal wiederholen)

**Files:**
- Modify: `src/core/agent/loop.ts`
- Test: `tests/loop.test.ts`

- [ ] **Step 1: Failing Tests** — ans Ende von `tests/loop.test.ts`:

```ts
describe("runAgent · Verdichtung (reaktiv)", () => {
  const overflow: LlmResult = { ok: false, kind: "overflow", detail: "maximum context length is 8192", partial: "" };

  it("erster Ueberlauf: erzwungene Stufe 1 mit K=0 (forced), dieselbe Runde wiederholt, dann ok", async () => {
    let n = 0;
    const script: LlmResult[] = [
      ...readThenFinal(2).slice(0, 2),        // zwei read_note-Runden
      overflow,                                // dritte Anfrage scheitert am Fenster
      { ok: true, content: "Fertig", toolCalls: [] },
    ];
    const llm: LoopLlm = { complete: async () => script[Math.min(n++, script.length - 1)] };
    const events: string[] = [];
    const out = await runAgent(
      { llm, tools: bigTools, maxRounds: 3, textFallback: false, compaction: compaction(100_000, 3) },
      user, () => {}, () => {}, (e) => events.push(e.kind), sig(),
    );
    const recs = out.filter(isCompactionRecord);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ stage: 1, keepToolResults: 0, forced: true });
    expect(events.filter((k) => k === "error")).toHaveLength(0);
    expect(events[events.length - 1]).toBe("final");
    // maxRounds=3, drei Tool-Runden waeren das Limit — die Wiederholung zaehlt nicht mit
    expect(n).toBe(4);
  });

  it("zweiter Ueberlauf: Fehler-Event overflow mit Server-Text, keine Endlosschleife", async () => {
    let n = 0;
    const script: LlmResult[] = [...readThenFinal(1).slice(0, 1), overflow, overflow];
    const llm: LoopLlm = { complete: async () => script[Math.min(n++, script.length - 1)] };
    const errors: { errorKind: string; message: string }[] = [];
    const out = await runAgent(
      { llm, tools: bigTools, maxRounds: 8, textFallback: false, compaction: compaction(100_000, 3) },
      user, () => {}, () => {},
      (e) => { if (e.kind === "error") errors.push({ errorKind: e.errorKind, message: e.message }); }, sig(),
    );
    expect(errors).toEqual([{ errorKind: "overflow", message: "maximum context length is 8192" }]);
    expect(out.filter(isCompactionRecord)).toHaveLength(1);
    expect(n).toBe(3);
  });

  it("Ueberlauf ohne Verdichtungsmasse (nichts zu stubben, Stufe 2 aus): sofort Fehler-Event", async () => {
    let n = 0;
    const llm: LoopLlm = { complete: async () => { n++; return overflow; } };
    const errors: string[] = [];
    await runAgent(
      { llm, tools: okTools, maxRounds: 8, textFallback: false, compaction: compaction(100_000, 3) },
      user, () => {}, () => {}, (e) => { if (e.kind === "error") errors.push(e.errorKind); }, sig(),
    );
    expect(errors).toEqual(["overflow"]);
    expect(n).toBe(1);
  });

  it("Ueberlauf ohne compaction-Dep: Fehler-Event wie jeder andere Fehler", async () => {
    const errors: string[] = [];
    await runAgent(
      { llm: scripted([overflow]), tools: okTools, maxRounds: 8, textFallback: false },
      user, () => {}, () => {}, (e) => { if (e.kind === "error") errors.push(e.errorKind); }, sig(),
    );
    expect(errors).toEqual(["overflow"]);
  });
});
```

- [ ] **Step 2: Rot** — `npx vitest run tests/loop.test.ts` → FAIL (kein Retry).

- [ ] **Step 3: Implementieren** — in `runAgent` vor der `while`-Schleife `let overflowRetried = false;` und der Fehlerzweig:

```ts
    if (!r.ok) {
      // Reaktives Netz: beim ERSTEN Ueberlauf einmal erzwungen verdichten (K=0, dann
      // Stufe 2) und dieselbe Runde wiederholen — sie zaehlt nicht gegen maxRounds. Nur,
      // wenn noch kein Token beim Nutzer war (sonst stuende die halbe Antwort doppelt in
      // der Blase — dieselbe Regel wie beim Failover). Beim zweiten Mal oder ohne
      // Verdichtungsmasse: Fehler mit dem Server-Text; die Session bleibt benutzbar, der
      // naechste ask() darf wieder verdichten.
      if (r.kind === "overflow" && r.partial === "" && !overflowRetried) {
        overflowRetried = true;
        if (await compact(true)) continue;
      }
      if (r.partial !== "") appended.push({ role: "assistant", content: r.partial });
      onEvent({ kind: "error", message: r.detail, partial: r.partial, errorKind: r.kind });
      return appended;
    }
```

(`continue` ohne `round++` = dieselbe Runde. Achtung: `compact(false)` am Schleifenanfang läuft dann erneut — nach einer erzwungenen Verdichtung ist es unter Budget oder es gibt nichts mehr; das ist gewollt und billig.)

- [ ] **Step 4: Grün + Gate + Commit**

```bash
npx vitest run tests/loop.test.ts
npm run gate
git add src/core/agent/loop.ts tests/loop.test.ts
git commit -m "feat(loop): reaktiver Pfad — Ueberlauf erzwingt Verdichtung und wiederholt die Runde einmal"
```

---

### Task 7: Stufe 2 — Zusammenfassung abgeschlossener Runden (rollend)

**Files:**
- Create: `src/core/agent/compaction/stage2.ts`
- Modify: `src/core/agent/loop.ts` (Stufe-2-Aufruf in `compact`)
- Test: `tests/compaction_stage2.test.ts`, `tests/loop.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const PACK_RATIO = 0.6;
  export function splitTurns(projected: ChatMessage[]): { completed: ChatMessage[][]; current: ChatMessage[] };
  export function buildSummaryPrompt(lang: "de" | "en", maxChars: number, carry: string | null): string;
  export function summarizeTurns(turns: ChatMessage[][], opts: { lang; maxChars: number; packChars: number; summarize: (msgs: ChatMessage[]) => Promise<string | null> }): Promise<string | null>;
  export function makeStage2Record(turns: ChatMessage[][], summary: string, keep: number, at: string, forced?: boolean): CompactionRecord;
  ```

- [ ] **Step 1: Failing Tests** — `tests/compaction_stage2.test.ts`:

```ts
import { splitTurns, buildSummaryPrompt, summarizeTurns, makeStage2Record, PACK_RATIO } from "../src/core/agent/compaction/stage2";
import type { ChatMessage } from "../src/core/agent/types";

const sys: ChatMessage = { role: "system", content: "SYS" };
const u = (c: string): ChatMessage => ({ role: "user", content: c });
const a = (c: string): ChatMessage => ({ role: "assistant", content: c });
const tool = (id: string, c: string): ChatMessage => ({ role: "tool", toolCallId: id, content: c });

describe("splitTurns", () => {
  it("trennt System-Praefix, abgeschlossene Runden und die laufende", () => {
    const { completed, current } = splitTurns([sys, u("F1"), a("A1"), u("F2"), tool("c", "x"), a("A2"), u("F3"), a("laeuft")]);
    expect(completed).toEqual([[u("F1"), a("A1")], [u("F2"), tool("c", "x"), a("A2")]]);
    expect(current).toEqual([u("F3"), a("laeuft")]);
  });
  it("nur eine Runde: nichts abgeschlossen", () => {
    expect(splitTurns([sys, u("F1"), a("x")]).completed).toEqual([]);
  });
});

describe("buildSummaryPrompt", () => {
  it("englischer Prompt mit Sprachanweisung, Laengengrenze und Behalte/Lass-weg-Liste", () => {
    const p = buildSummaryPrompt("de", 800, null);
    expect(p).toMatch(/Write the summary in German/);
    expect(p).toMatch(/800 characters/);
    expect(p).toMatch(/decisions/i);
    expect(p).toMatch(/paths/i);
    expect(p).not.toMatch(/Summary so far/);
  });
  it("traegt eine Zwischen-Zusammenfassung im System-Prompt weiter (nicht als zweite user-Nachricht)", () => {
    expect(buildSummaryPrompt("en", 800, "CARRY")).toMatch(/Summary so far[\s\S]*CARRY/);
  });
});

describe("summarizeTurns (rollend)", () => {
  const turn = (i: number, size: number): ChatMessage[] => [u(`F${i}`), a("y".repeat(size))];

  it("Normalfall: EIN Aufruf, System-Prompt + Runden + abschliessende user-Anweisung", async () => {
    const calls: ChatMessage[][] = [];
    const out = await summarizeTurns([turn(1, 100), turn(2, 100)], {
      lang: "de", maxChars: 500, packChars: 5000,
      summarize: async (m) => { calls.push(m); return " ZF "; },
    });
    expect(out).toBe("ZF");
    expect(calls).toHaveLength(1);
    expect(calls[0][0].role).toBe("system");
    expect(calls[0][calls[0].length - 1]).toMatchObject({ role: "user" });
    expect(calls[0].filter((m) => m.role === "user").map((m) => m.content)).toEqual(["F1", "F2", expect.stringMatching(/summary/i)]);
  });

  it("Riesenverlauf: mehrere Aufrufe, jeder unter packChars, Zwischenstand wandert in den naechsten Prompt", async () => {
    const calls: ChatMessage[][] = [];
    let n = 0;
    const out = await summarizeTurns([turn(1, 400), turn(2, 400), turn(3, 400)], {
      lang: "en", maxChars: 500, packChars: 900,
      summarize: async (m) => { calls.push(m); n++; return `ZF${n}`; },
    });
    expect(calls.length).toBeGreaterThan(1);
    expect(out).toBe(`ZF${n}`);
    expect(calls[1][0].content).toContain("ZF1");
    // Eine Runde, die allein ueber packChars liegt, wird trotzdem allein geschickt (kein Endlos-Loop)
  });

  it("liefert null, wenn ein Aufruf nichts Brauchbares liefert — dann kein Record", async () => {
    expect(await summarizeTurns([turn(1, 10)], { lang: "de", maxChars: 500, packChars: 5000, summarize: async () => null })).toBeNull();
    expect(await summarizeTurns([turn(1, 10)], { lang: "de", maxChars: 500, packChars: 5000, summarize: async () => "   " })).toBeNull();
  });
  it("PACK_RATIO ist 0.6", () => { expect(PACK_RATIO).toBe(0.6); });
});

describe("makeStage2Record", () => {
  it("zaehlt Runden und Zeichen der Nicht-Nutzer-Anteile", () => {
    const rec = makeStage2Record([[u("F1"), a("abcd")], [u("F2"), tool("c", "xy"), a("z")]], "ZF", 3, "T");
    expect(rec).toEqual({ kind: "compaction", stage: 2, at: "T", keepToolResults: 3, summary: "ZF", turns: 2, stats: { stubbed: 0, bytes: 7 } });
    expect(makeStage2Record([[u("F")]], "ZF", 3, "T", true).forced).toBe(true);
  });
});
```

- [ ] **Step 2: Rot** — `npx vitest run tests/compaction_stage2.test.ts` → FAIL.

- [ ] **Step 3: Implementieren** — `src/core/agent/compaction/stage2.ts`:

```ts
/* Stufe 2: abgeschlossene Runden durch das Modell zusammenfassen. Teuer (lokal Minuten)
 * und die unzuverlaessigste Stelle im System — deshalb zuletzt, selten, abschaltbar, und
 * ohne Ergebnis lieber KEIN Record als ein leerer. Rollend, weil die Eingabe selbst ins
 * Fenster passen muss (sie ist ja der Grund, warum wir ueber Budget sind). */
import type { ChatMessage, CompactionRecord } from "../types";

/** Anteil des Budgets, den ein Zusammenfassungs-Aufruf hoechstens fuellt. Konstante, keine
 *  Einstellung: sie aendert nur, in wie viele Aufrufe eine Zusammenfassung zerfaellt. */
export const PACK_RATIO = 0.6;

const LANGUAGE_NAME: Record<"de" | "en", string> = { de: "German", en: "English" };

/** Runden = ab jeder user-Nachricht bis vor die naechste. Der System-Praefix zaehlt nicht,
 *  die letzte Runde ist die laufende. */
export function splitTurns(projected: ChatMessage[]): { completed: ChatMessage[][]; current: ChatMessage[] } {
  const turns: ChatMessage[][] = [];
  for (const m of projected) {
    if (m.role === "system" && turns.length === 0) continue;
    if (m.role === "user" || turns.length === 0) turns.push([m]);
    else turns[turns.length - 1].push(m);
  }
  const current = turns.pop() ?? [];
  return { completed: turns, current };
}

/** Englischer Prompt mit Sprachanweisung — dieselbe Form wie buildSystemPrompt. */
export function buildSummaryPrompt(lang: "de" | "en", maxChars: number, carry: string | null): string {
  const parts = [
    "You are Koda. Below is your own earlier work in this conversation: the user's requests and what you did (tool calls, tool results, your answers).",
    "Summarize YOUR work so the conversation can continue without the original messages.",
    "Keep: results you obtained, decisions you made, promises you gave the user, open points, and every note path you read or wrote.",
    "Leave out: raw note contents and tool output — they can be fetched again.",
    `Write the summary in ${LANGUAGE_NAME[lang]}. At most ${maxChars} characters. Plain prose or short bullets, no headings.`,
  ];
  if (carry !== null) parts.push(`Summary so far (fold it in, do not repeat it verbatim):\n${carry}`);
  return parts.join("\n\n");
}

const turnChars = (t: ChatMessage[]): number => t.reduce((n, m) => n + m.content.length, 0);

export async function summarizeTurns(
  turns: ChatMessage[][],
  opts: { lang: "de" | "en"; maxChars: number; packChars: number; summarize: (msgs: ChatMessage[]) => Promise<string | null> },
): Promise<string | null> {
  let carry: string | null = null;
  let i = 0;
  while (i < turns.length) {
    const batch: ChatMessage[][] = [];
    let size = carry === null ? 0 : carry.length;
    // Mindestens eine Runde je Aufruf — sonst kaeme eine uebergrosse Runde nie dran.
    while (i < turns.length && (batch.length === 0 || size + turnChars(turns[i]) <= opts.packChars)) {
      size += turnChars(turns[i]);
      batch.push(turns[i]);
      i++;
    }
    const msgs: ChatMessage[] = [
      { role: "system", content: buildSummaryPrompt(opts.lang, opts.maxChars, carry) },
      ...batch.flat(),
      { role: "user", content: "Write the summary now." },
    ];
    const text = await opts.summarize(msgs);
    if (text === null || text.trim() === "") return null;
    carry = text.trim();
  }
  return carry;
}

export function makeStage2Record(turns: ChatMessage[][], summary: string, keep: number, at: string, forced = false): CompactionRecord {
  const bytes = turns.flat().filter((m) => m.role !== "user").reduce((n, m) => n + m.content.length, 0);
  const rec: CompactionRecord = { kind: "compaction", stage: 2, at, keepToolResults: keep, summary, turns: turns.length, stats: { stubbed: 0, bytes } };
  if (forced) rec.forced = true;
  return rec;
}
```

- [ ] **Step 4: Loop-Einbau** — in `src/core/agent/loop.ts` Imports ergänzen (`import { splitTurns, summarizeTurns, makeStage2Record, PACK_RATIO } from "./compaction/stage2";`) und in `compact` an der markierten Stelle:

```ts
    if ((forced || overBudget(msgs)) && c.summarize !== null) {
      const { completed } = splitTurns(msgs);
      if (completed.length > 0) {
        const summary = await summarizeTurns(completed, {
          lang: c.lang,
          maxChars: c.summaryMaxChars,
          packChars: Math.floor(c.budgetTokens * 4 * PACK_RATIO),
          summarize: c.summarize,
        });
        if (summary !== null) {
          const r2 = makeStage2Record(completed, summary, c.keepToolResults, c.now(), forced);
          appended.push(r2);
          onEvent({ kind: "compaction", record: r2 });
          did = true;
        }
      }
    }
```

- [ ] **Step 5: Loop-Tests für Stufe 2** — ans Ende von `tests/loop.test.ts`:

```ts
describe("runAgent · Stufe 2", () => {
  /** Verlauf mit einer abgeschlossenen Runde (lange Antwort) und der laufenden Frage. */
  const twoTurns: LogEntry[] = [
    { role: "user", content: "F1" }, { role: "assistant", content: "A".repeat(2000) },
    { role: "user", content: "F2" },
  ];

  it("Stufe 1 reicht nicht (nichts zu stubben) -> Stufe 2, Record mit summary, Modell sieht merged+summary", async () => {
    const seen: ChatMessage[][] = [];
    const llm: LoopLlm = { complete: async (m) => { seen.push(m); return { ok: true, content: "Fertig", toolCalls: [] }; } };
    const summarizeCalls: ChatMessage[][] = [];
    const out = await runAgent(
      { llm, tools: okTools, maxRounds: 8, textFallback: false,
        compaction: { ...compaction(100, 3), summarize: async (m) => { summarizeCalls.push(m); return "ZUSAMMENFASSUNG"; } } },
      twoTurns, () => {}, () => {}, () => {}, sig(),
    );
    const recs = out.filter(isCompactionRecord);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ stage: 2, summary: "ZUSAMMENFASSUNG", turns: 1 });
    expect(summarizeCalls).toHaveLength(1);
    expect(seen[0].map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(seen[0][0]).toMatchObject({ merged: true });
    expect(seen[0][1].content).toBe("ZUSAMMENFASSUNG");
    expect(seen[0][2].content).toBe("F2");
  });

  it("Stufe 2 aus (summarize null): kein Stufe-2-Record, Lauf geht weiter", async () => {
    const out = await runAgent(
      { llm: scripted([{ ok: true, content: "Fertig", toolCalls: [] }]), tools: okTools, maxRounds: 8, textFallback: false, compaction: compaction(100, 3) },
      twoTurns, () => {}, () => {}, () => {}, sig(),
    );
    expect(out.some(isCompactionRecord)).toBe(false);
  });

  it("summarize liefert null oder wirft: kein Record, Lauf geht weiter", async () => {
    const outNull = await runAgent(
      { llm: scripted([{ ok: true, content: "Fertig", toolCalls: [] }]), tools: okTools, maxRounds: 8, textFallback: false,
        compaction: { ...compaction(100, 3), summarize: async () => null } },
      twoTurns, () => {}, () => {}, () => {}, sig(),
    );
    expect(outNull.some(isCompactionRecord)).toBe(false);
    expect(outNull[outNull.length - 1]).toMatchObject({ role: "assistant", content: "Fertig" });
  });
});
```

Für „wirft": `summarize` darf im Loop werfen? **Nein** — `main.ts` fängt das im Port ab (Task 9 gibt `null` zurück). Der Loop wickelt `summarizeTurns` **zusätzlich** in `try/catch` → `null`, damit ein werfender Port den Lauf nicht abbricht:

```ts
        const summary = await summarizeTurns(…).catch(() => null);
```

und ein Test dafür: `summarize: async () => { throw new Error("kaputt"); }` → kein Record, `final` kommt.

- [ ] **Step 6: Grün + Gate + Commit**

```bash
npx vitest run tests/compaction_stage2.test.ts tests/loop.test.ts
npm run gate
git add src/core/agent/compaction/stage2.ts src/core/agent/loop.ts tests/compaction_stage2.test.ts tests/loop.test.ts
git commit -m "feat(compaction): Stufe 2 — rollende Zusammenfassung abgeschlossener Runden ueber den summarize-Port"
```

---

### Task 8: Settings — fünf Felder, Clamps, Gruppe, i18n

**Files:**
- Modify: `src/core/settings-types.ts`
- Modify: `src/obsidian/settings.ts:66-160` (`getSettingDefinitions`)
- Modify: `src/i18n/strings.ts`
- Modify: `src/main.ts` (Platzhalter aus Task 1 ersetzen)
- Test: `tests/settings_types.test.ts`

**Interfaces:**
- Produces in `KodaSettings`: `contextWindowTokens: number` (8192), `compactAtPercent: number` (75), `keepToolResults: number` (3), `summarizeEnabled: boolean` (true), `summaryPercent: number` (10). Konstanten `CONTEXT_WINDOW_MIN=2048`, `CONTEXT_WINDOW_MAX=1_000_000`, `COMPACT_AT_MIN=40`, `COMPACT_AT_MAX=95`, `COMPACT_AT_STEP=5`, `KEEP_TOOLS_MIN=0`, `KEEP_TOOLS_MAX=20`, `SUMMARY_PCT_MIN=3`, `SUMMARY_PCT_MAX=30`.

- [ ] **Step 1: Failing Tests** — `tests/settings_types.test.ts` ergänzen (Import-Liste um die neuen Konstanten erweitern):

```ts
describe("mergeKodaSettings · Kontext & Verdichtung", () => {
  it("Defaults: 8192 / 75 % / K=3 / Stufe 2 an / 10 %", () => {
    const s = mergeKodaSettings(null);
    expect(s.contextWindowTokens).toBe(8192);
    expect(s.compactAtPercent).toBe(75);
    expect(s.keepToolResults).toBe(3);
    expect(s.summarizeEnabled).toBe(true);
    expect(s.summaryPercent).toBe(10);
  });
  it("klemmt alle vier Zahlen in ihre Spannen", () => {
    expect(mergeKodaSettings({ contextWindowTokens: 100 }).contextWindowTokens).toBe(CONTEXT_WINDOW_MIN);
    expect(mergeKodaSettings({ contextWindowTokens: 5_000_000 }).contextWindowTokens).toBe(CONTEXT_WINDOW_MAX);
    expect(mergeKodaSettings({ compactAtPercent: 10 }).compactAtPercent).toBe(COMPACT_AT_MIN);
    expect(mergeKodaSettings({ compactAtPercent: 100 }).compactAtPercent).toBe(COMPACT_AT_MAX);
    expect(mergeKodaSettings({ keepToolResults: -1 }).keepToolResults).toBe(KEEP_TOOLS_MIN);
    expect(mergeKodaSettings({ keepToolResults: 99 }).keepToolResults).toBe(KEEP_TOOLS_MAX);
    expect(mergeKodaSettings({ summaryPercent: 0 }).summaryPercent).toBe(SUMMARY_PCT_MIN);
    expect(mergeKodaSettings({ summaryPercent: 50 }).summaryPercent).toBe(SUMMARY_PCT_MAX);
  });
  it("Muellwerte fallen auf den Default zurueck, alte data.json ohne die Felder laedt", () => {
    expect(mergeKodaSettings({ contextWindowTokens: "viel" }).contextWindowTokens).toBe(8192);
    expect(mergeKodaSettings({ maxRounds: 8 }).summarizeEnabled).toBe(true);
  });
});
```

- [ ] **Step 2: Rot** — `npx vitest run tests/settings_types.test.ts` → FAIL.

- [ ] **Step 3: Implementieren** — `src/core/settings-types.ts`, Konstanten nach `LIST_ROWS_STEP`:

```ts
/** Spannen fuer „Kontext & Verdichtung“ (Spec 2026-08-18-koda-compaction-design.md).
 *  Alle vier sind Einstellungen und keine Konstanten, weil sie beobachtbares Verhalten
 *  steuern: das Fenster ist die Bezugsgroesse, die Schwelle sagt WANN verdichtet wird, K
 *  entscheidet, ob Koda seinen Arbeitsplan noch woertlich hat, die Zusammenfassungslaenge,
 *  wie viel er „erinnert“. Das Fenster ist ein Zahlenfeld, kein Slider — 2048 bis eine
 *  Million in Rasten waere unbedienbar. */
export const CONTEXT_WINDOW_MIN = 2048;
export const CONTEXT_WINDOW_MAX = 1_000_000;
export const COMPACT_AT_MIN = 40;
export const COMPACT_AT_MAX = 95;
export const COMPACT_AT_STEP = 5;
export const KEEP_TOOLS_MIN = 0;
export const KEEP_TOOLS_MAX = 20;
export const SUMMARY_PCT_MIN = 3;
export const SUMMARY_PCT_MAX = 30;
```

`KodaSettings` + Defaults:

```ts
  contextWindowTokens: number;
  compactAtPercent: number;
  keepToolResults: number;
  summarizeEnabled: boolean;
  summaryPercent: number;
```
```ts
  contextWindowTokens: 8192,
  compactAtPercent: 75,
  keepToolResults: 3,
  summarizeEnabled: true,
  summaryPercent: 10,
```

im Merge:

```ts
    contextWindowTokens: clampInt(merged.contextWindowTokens, CONTEXT_WINDOW_MIN, CONTEXT_WINDOW_MAX, DEFAULT_SETTINGS.contextWindowTokens),
    compactAtPercent: clampInt(merged.compactAtPercent, COMPACT_AT_MIN, COMPACT_AT_MAX, DEFAULT_SETTINGS.compactAtPercent),
    keepToolResults: clampInt(merged.keepToolResults, KEEP_TOOLS_MIN, KEEP_TOOLS_MAX, DEFAULT_SETTINGS.keepToolResults),
    summaryPercent: clampInt(merged.summaryPercent, SUMMARY_PCT_MIN, SUMMARY_PCT_MAX, DEFAULT_SETTINGS.summaryPercent),
```

(`summarizeEnabled` kommt über `mergeSettings` als Boolean; falls `mergeSettings` Typ-Müll durchlässt: `summarizeEnabled: typeof merged.summarizeEnabled === "boolean" ? merged.summarizeEnabled : true`.)

- [ ] **Step 4: Settings-Gruppe** — in `src/obsidian/settings.ts` Import um die neuen Konstanten erweitern und in `getSettingDefinitions()` **nach** dem `listRows`-Eintrag einfügen:

```ts
      {
        // Eigene Gruppe: alles, was beobachtbares Verdichtungs-Verhalten steuert. Der
        // deklarative Host kennt keine aufklappbaren Gruppen — eine Ueberschrift ist, was
        // beide Renderpfade koennen.
        type: "group",
        heading: t("settings.compaction"),
        items: [
          {
            name: t("settings.contextWindow"),
            desc: t("settings.contextWindow.desc"),
            control: { type: "number", key: "contextWindowTokens" },
          },
          {
            name: t("settings.compactAt"),
            desc: t("settings.compactAt.desc"),
            control: { type: "slider", key: "compactAtPercent", min: COMPACT_AT_MIN, max: COMPACT_AT_MAX, step: COMPACT_AT_STEP },
          },
          {
            name: t("settings.keepTools"),
            desc: t("settings.keepTools.desc"),
            control: { type: "slider", key: "keepToolResults", min: KEEP_TOOLS_MIN, max: KEEP_TOOLS_MAX, step: 1 },
          },
          {
            name: t("settings.summarize"),
            desc: t("settings.summarize.desc"),
            control: { type: "toggle", key: "summarizeEnabled" },
          },
          {
            name: t("settings.summaryLen"),
            desc: t("settings.summaryLen.desc"),
            control: { type: "slider", key: "summaryPercent", min: SUMMARY_PCT_MIN, max: SUMMARY_PCT_MAX, step: 1 },
          },
        ],
      } as SettingDefinitionItem<keyof KodaSettings>,
```

Falls der `SettingDefinitionItem`-Typ aus `obsidian` das `group`-Objekt nicht so annimmt, den Cast anpassen, bis `tsc` zufrieden ist — Form siehe `settings_walker.ts:118-128` (`type: "group"`, `heading`, `items`).

- [ ] **Step 5: i18n** — `src/i18n/strings.ts`, `en`:

```ts
    "settings.compaction": "Context & compaction",
    "settings.contextWindow": "Context window (tokens)",
    "settings.contextWindow.desc": "Size of the model's context window. One number for all endpoints. “Test” on an endpoint row fills it in when the server reports it (LM Studio, Ollama) and the field is still on its default.",
    "settings.compactAt": "Compact at (% of window)",
    "settings.compactAt.desc": "Koda compacts the conversation before a model call once the estimate exceeds this share of the window. Tokens are estimated as characters ÷ 4 — the margin covers the error.",
    "settings.keepTools": "Keep tool results verbatim",
    "settings.keepTools.desc": "How many of the most recent tool results stay in full. Older ones become a one-line stub that names the tool and how to fetch the material again.",
    "settings.summarize": "Summarize with the model (stage 2)",
    "settings.summarize.desc": "If stubs are not enough, Koda asks the model to summarize completed turns. Your own messages are never summarized. Costs an extra model call — turn it off if you distrust the local model or the minutes.",
    "settings.summaryLen": "Summary length (% of window)",
    "settings.summaryLen.desc": "Upper bound for the summary text.",
    "view.compaction.stage1": "History compacted — {0} tool results ({1} KB) shortened",
    "view.compaction.stage2": "History summarized ({0} turns)",
    "view.compaction.forced": " — after a context overflow",
```

`de`:

```ts
    "settings.compaction": "Kontext & Verdichtung",
    "settings.contextWindow": "Kontextfenster (Token)",
    "settings.contextWindow.desc": "Größe des Kontextfensters des Modells. Eine Zahl für alle Endpunkte. „Testen“ in einer Endpunkt-Zeile trägt sie ein, wenn der Server sie meldet (LM Studio, Ollama) und das Feld noch auf dem Standard steht.",
    "settings.compactAt": "Verdichten ab (% des Fensters)",
    "settings.compactAt.desc": "Koda verdichtet den Verlauf vor einem Modellaufruf, sobald die Schätzung diesen Anteil des Fensters überschreitet. Token werden als Zeichen ÷ 4 geschätzt — der Abstand fängt den Fehler.",
    "settings.keepTools": "Tool-Ergebnisse wörtlich behalten",
    "settings.keepTools.desc": "Wie viele der jüngsten Tool-Ergebnisse vollständig bleiben. Ältere werden zu einer Zeile, die das Werkzeug nennt und wie man das Material zurückholt.",
    "settings.summarize": "Zusammenfassung durch Modell (Stufe 2)",
    "settings.summarize.desc": "Reichen die Stubs nicht, lässt Koda das Modell abgeschlossene Runden zusammenfassen. Deine eigenen Nachrichten werden nie zusammengefasst. Kostet einen zusätzlichen Modellaufruf — ausschalten, wenn du dem lokalen Modell oder den Minuten nicht traust.",
    "settings.summaryLen": "Länge der Zusammenfassung (% des Fensters)",
    "settings.summaryLen.desc": "Obergrenze für den Zusammenfassungstext.",
    "view.compaction.stage1": "Verlauf verdichtet — {0} Tool-Ergebnisse ({1} KB) gekürzt",
    "view.compaction.stage2": "Verlauf zusammengefasst ({0} Runden)",
    "view.compaction.forced": " — nach Kontext-Überlauf",
```

- [ ] **Step 6: Platzhalter aus Task 1 ersetzen** — `src/main.ts`: `t("view.overflow", e.message, "?")` → `t("view.overflow", e.message, s.contextWindowTokens)`.

- [ ] **Step 7: Grün + Gate + Commit**

```bash
npx vitest run tests/settings_types.test.ts
npm run gate
git add src/core/settings-types.ts src/obsidian/settings.ts src/i18n/strings.ts src/main.ts tests/settings_types.test.ts
git commit -m "feat(settings): Gruppe „Kontext & Verdichtung“ — Fenster, Schwelle, K, Stufe-2-Schalter, Laenge"
```

---

### Task 9: Verdrahtung in `main.ts` + Marken in der View

**Files:**
- Modify: `src/main.ts:151-270` (`ask()`)
- Modify: `src/obsidian/view.ts` (`renderLog`, neue Methode `compactionMark`)
- Modify: `styles.css`
- Test: keine Unit-Tests für View/main (Obsidian-Schicht) — GUI-Smoke in Task 12. **Manuell prüfen** nach `npm run build` (Step 5).

- [ ] **Step 1: `summarize`-Port und `CompactionDeps` in `ask()`** — in `src/main.ts` nach dem `llm`-Objekt:

```ts
      // Stufe 2 laeuft ueber DENSELBEN Client und Failover, ohne Werkzeuge und mit
      // unterdruecktem Denken. Fehler und Abbruch werden zu null: der Loop macht dann
      // ohne Zusammenfassung weiter (Spec: kein Record ist besser als ein leerer).
      const summarize = async (messages: ChatMessage[]): Promise<string | null> => {
        const r = await withFailover(
          this.resolver,
          (ep) =>
            client.complete(
              { endpoint: ep.url, apiKey: ep.apiKey ?? "", model: effectiveModel(ep, s.model), suppressThinking: true },
              messages, [], () => {}, () => {}, this.abort?.signal ?? new AbortController().signal,
            ),
          (r) => !r.ok && r.kind === "network" && r.partial === "",
          () => ({ ok: false, kind: "network", detail: t("error.noEndpoint"), partial: "" }),
        );
        return r.ok && r.content.trim() !== "" ? r.content : null;
      };
      const compaction: CompactionDeps = {
        budgetTokens: Math.floor((s.contextWindowTokens * s.compactAtPercent) / 100),
        keepToolResults: s.keepToolResults,
        overheadChars: JSON.stringify(toWireTools(defs)).length,
        summarize: s.summarizeEnabled ? summarize : null,
        summaryMaxChars: Math.floor((s.contextWindowTokens * 4 * s.summaryPercent) / 100),
        lang,
        now: () => new Date().toISOString(),
      };
```

Imports: `import { runAgent, type LoopLlm, type CompactionDeps } from "./core/agent/loop";`, `import { toolDefs, toWireTools } from "./core/tools/defs";`, `import { isCompactionRecord, type ChatMessage, type LogEntry } from "./core/agent/types";`. Im `runAgent`-Aufruf: `{ llm, tools, maxRounds: s.maxRounds, textFallback: s.textFallback, compaction }`. Im `onEvent`:

```ts
          if (e.kind === "compaction") for (const v of this.views()) v.compactionMark(e.record);
```

- [ ] **Step 2: View — dritter Zweig + Live-Marke** — `src/obsidian/view.ts`: den `continue` aus Task 2 ersetzen:

```ts
    for (const m of this.plugin.chatLog) {
      if (isCompactionRecord(m)) { this.renderCompaction(this.logEl, m); continue; }
```

und neue Methoden (Import: `import { isCompactionRecord, type CompactionRecord } from "../core/agent/types";`):

```ts
  /** Verdichtungs-Marke: Stufe 1 als Notizzeile, Stufe 2 aufklappbar mit dem Text — lesbar,
   *  pruefbar, widersprechbar. Der volle Verlauf darueber bleibt stehen: verdichtet wird,
   *  was das MODELL sieht, nicht, was der Nutzer gesagt und gesehen hat. */
  private renderCompaction(host: HTMLElement, rec: CompactionRecord): void {
    const forced = rec.forced === true ? t("view.compaction.forced") : "";
    if (rec.stage === 1) {
      const kb = (rec.stats.bytes / 1024).toFixed(1);
      host.createDiv({ cls: "koda-msg koda-notice koda-compaction", text: t("view.compaction.stage1", rec.stats.stubbed, kb) + forced });
      return;
    }
    const d = host.createEl("details", { cls: "koda-compaction koda-compaction-summary" });
    d.createEl("summary", { text: t("view.compaction.stage2", rec.turns ?? 0) + forced });
    d.createEl("pre", { text: rec.summary ?? "" });
  }

  /** Live waehrend eines Laufs (onEvent) — bei einem 90-Sekunden-Loop soll man sehen, dass er lebt. */
  compactionMark(rec: CompactionRecord): void {
    this.streamEl = null;
    this.renderCompaction(this.logEl, rec);
    this.logEl.scrollTo({ top: this.logEl.scrollHeight });
  }
```

- [ ] **Step 3: CSS** — `styles.css` nach `.koda-skills`:

```css
/* Verdichtungs-Marke: sichtbar, aber leise — sie sagt, was das Modell ab hier nicht mehr
   woertlich hat. Der Verlauf darueber bleibt vollstaendig. */
.koda-compaction { font-size: var(--font-ui-smaller); color: var(--text-muted); border-top: 1px dashed var(--background-modifier-border); padding-top: var(--size-4-1); margin: var(--size-4-2) 0; }
.koda-compaction-summary pre { white-space: pre-wrap; margin: var(--size-4-1) 0 0 0; }
```

- [ ] **Step 4: Gate**

```bash
npm run gate
```

- [ ] **Step 5: Manuell prüfen** (Obsidian mit Test-Vault, kein Modell nötig): `cp main.js styles.css <vault>/.obsidian/plugins/koda-agent/`, Plugin neu laden, Settings → Gruppe „Kontext & Verdichtung" sichtbar, Zahlenfeld nimmt 4096 an und klemmt 100 auf 2048. Dann in der Dev-Konsole:

```js
const p = app.plugins.plugins["koda-agent"];
p.chatLog.push({ kind:"compaction", stage:1, at:new Date().toISOString(), keepToolResults:3, stats:{stubbed:6, bytes:38912} });
p.chatLog.push({ kind:"compaction", stage:2, at:new Date().toISOString(), keepToolResults:3, summary:"Testtext", turns:3, forced:true, stats:{stubbed:0, bytes:900} });
p.views().forEach(v => v.renderLog());
```

→ beide Marken erscheinen, die zweite mit „…nach Kontext-Überlauf" und aufklappbarem Text. Danach `p.chatLog.splice(-2, 2); p.views().forEach(v => v.renderLog());` (in-memory, nichts persistiert).

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/obsidian/view.ts styles.css
git commit -m "feat(view): Verdichtung verdrahtet — CompactionDeps aus Settings, summarize-Port, Marken im Chat"
```

---

### Task 10: Vorbefüllung — Kontextfenster vom Endpunkt

**Files:**
- Modify: `tools/sync-kit.sh` (Modul `model-context` aufnehmen), dann ausführen
- Create: `src/core/llm/context-probe.ts`
- Modify: `src/core/llm/probe.ts` (`HttpProbe.postJson`)
- Modify: `src/obsidian/http-probe.ts`
- Modify: `src/core/llm/endpoint-status-view.ts`
- Modify: `src/main.ts` (`probeContext`)
- Modify: `src/obsidian/settings.ts:280-300` (Testknopf)
- Modify: `src/i18n/strings.ts`
- Test: `tests/context_probe.test.ts`, `tests/endpoint_status_view.test.ts`, `tests/probe.test.ts` (Fake um `postJson` ergänzen)

**Interfaces:**
- Produces: `probeModelContext(ep, model, http, clock, timeoutMs?): Promise<number | null>`; `HttpProbe.postJson(url, body, headers): Promise<{ status; json }>`; `endpointStatusView(status, contextTokens?: number | null)` — Tooltip bekommt ` · <t("settings.probe.context", n)>` angehängt, wenn `contextTokens` eine Zahl ist.

- [ ] **Step 1: Kit-Modul vendoren** — in `tools/sync-kit.sh` die Schleife `for m in think-splitter … frontmatter` um `model-context` erweitern **und** die `vendored`-Zeile im generierten `VENDOR.json` um `model-context.ts`. Dann:

```bash
sh tools/sync-kit.sh
git status --short   # erwartet: VENDOR.json (Version 0.26.1), neues src/vendor/kit/model-context.ts, sonst nur Header-Zeilen mit neuer Version
npm run gate
```

Falls andere vendorte Dateien **inhaltlich** abweichen (nicht nur die Header-Zeile): stoppen und melden — gemessen am 2026-08-18 waren alle byte-identisch.

- [ ] **Step 2: Failing Tests** — `tests/context_probe.test.ts`:

```ts
import { probeModelContext } from "../src/core/llm/context-probe";
import type { HttpProbe } from "../src/core/llm/probe";

const clock = { now: () => 0, setTimeout: () => 1, clearTimeout: () => {} };
const ep = { url: "http://127.0.0.1:1234" };

function http(lm: { status: number; json: unknown } | Error, oll: { status: number; json: unknown } | Error): HttpProbe & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async getJson(url) { calls.push(url); if (lm instanceof Error) throw lm; return lm; },
    async postJson(url) { calls.push(url); if (oll instanceof Error) throw oll; return oll; },
  };
}

describe("probeModelContext", () => {
  it("LM Studio: loaded_context_length vor max_context_length, per Modell-Id", async () => {
    const h = http({ status: 200, json: { data: [{ id: "qwen", max_context_length: 32768, loaded_context_length: 8192 }] } }, new Error("nicht gefragt"));
    expect(await probeModelContext(ep, "qwen", h, clock)).toBe(8192);
    expect(h.calls).toEqual(["http://127.0.0.1:1234/api/v0/models"]);
  });
  it("Ollama als Fallback: model_info.<arch>.context_length", async () => {
    const h = http({ status: 404, json: null }, { status: 200, json: { model_info: { "llama.context_length": 4096 } } });
    expect(await probeModelContext(ep, "llama3", h, clock)).toBe(4096);
    expect(h.calls[1]).toBe("http://127.0.0.1:1234/api/show");
  });
  it("meldet keiner etwas (oder wirft alles): null, kein Throw", async () => {
    expect(await probeModelContext(ep, "x", http(new Error("boom"), new Error("boom")), clock)).toBeNull();
    expect(await probeModelContext(ep, "x", http({ status: 200, json: { data: [] } }, { status: 200, json: {} }), clock)).toBeNull();
  });
  it("leerer Modellname: null ohne Anfrage (LM Studio meldet je Modell)", async () => {
    const h = http({ status: 200, json: { data: [] } }, { status: 200, json: {} });
    expect(await probeModelContext(ep, "", h, clock)).toBeNull();
    expect(h.calls).toEqual([]);
  });
});
```

`tests/endpoint_status_view.test.ts` ergänzen:

```ts
  it("haengt das gemeldete Kontextfenster an den Tooltip, wenn vorhanden", () => {
    const ok = { reachable: true, kind: "ok" } as EndpointStatus;
    expect(endpointStatusView(ok, 32768).tooltip).toMatch(/32768/);
    expect(endpointStatusView(ok, null).tooltip).toBe(endpointStatusView(ok).tooltip);
  });
```

(Import/Typ von `EndpointStatus` wie in den bestehenden Tests dieser Datei.)

- [ ] **Step 3: Rot** — `npx vitest run tests/context_probe.test.ts tests/endpoint_status_view.test.ts` → FAIL.

- [ ] **Step 4: Implementieren** — `src/core/llm/probe.ts`, Interface erweitern:

```ts
export interface HttpProbe {
  /** Muss den echten Status zurückgeben statt bei 4xx/5xx zu werfen. Nur ein
   *  Transportfehler (kein Server, kein DNS) darf werfen. */
  getJson(url: string, headers: Record<string, string>): Promise<{ status: number; json: unknown }>;
  /** Dito fuer POST mit JSON-Body (Ollama `/api/show`). */
  postJson(url: string, body: unknown, headers: Record<string, string>): Promise<{ status: number; json: unknown }>;
}
```

`src/obsidian/http-probe.ts`:

```ts
  async postJson(url, body, headers) {
    const res = await requestUrl({ url, method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body), throw: false });
    let json: unknown = null;
    try { json = res.json; } catch { json = null; }
    return { status: res.status, json };
  },
```

`src/core/llm/context-probe.ts`:

```ts
// uebernommen aus vim-dojo/src/llm/modelContext.ts, 2026-08-18 — HTTP hier injiziert statt requestUrl (core bleibt obsidian-frei)
/* Best-effort-Abfrage des Kontextfensters: erst LM Studio (`/api/v0/models`, je Modell),
   dann Ollama (`POST /api/show`). Rein informativ — wirft nie; null heisst „dieser Endpunkt
   meldet es nicht“ (OpenWebUI, vLLM, gehostete Anbieter). Reihenfolge wie vault-crews'
   local-llm-client. Dritter Consumer dieses Musters (vault-crews, vim-dojo, koda). */
import { normalizeEndpoint } from "../../vendor/kit/endpoint";
import { authHeaders, type EndpointConfig } from "../../vendor/kit/endpoint_config";
import { parseLmStudioContext, parseOllamaContext } from "../../vendor/kit/model-context";
import { withTimeout } from "../../vendor/kit/timeout";
import type { ClockPort } from "../../vendor/kit-obsidian/clock";
import { PROBE_TIMEOUT_MS, type HttpProbe } from "./probe";

export async function probeModelContext(
  ep: EndpointConfig,
  model: string,
  http: HttpProbe,
  clock: ClockPort,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<number | null> {
  if (model === "") return null;
  const base = normalizeEndpoint(ep.url);
  const headers = authHeaders(ep.apiKey === "" || ep.apiKey === undefined ? undefined : ep.apiKey);

  try {
    const lm = await withTimeout(http.getJson(`${base}/api/v0/models`, headers), timeoutMs, clock);
    if (!lm.timedOut && lm.value.status >= 200 && lm.value.status < 300) {
      const ctx = parseLmStudioContext(lm.value.json, model);
      if (ctx) return ctx.loadedContextLength ?? ctx.maxContextLength ?? null;
    }
  } catch {
    // weiter zu Ollama
  }
  try {
    const oll = await withTimeout(http.postJson(`${base}/api/show`, { model }, headers), timeoutMs, clock);
    if (!oll.timedOut && oll.value.status >= 200 && oll.value.status < 300) {
      const ctx = parseOllamaContext(oll.value.json);
      if (ctx) return ctx.maxContextLength ?? null;
    }
  } catch {
    // niemand meldet ein Fenster
  }
  return null;
}
```

`src/core/llm/endpoint-status-view.ts`:

```ts
export function endpointStatusView(status: EndpointStatus | null, contextTokens: number | null = null): EndpointStatusView {
  if (status === null) {
    return { icon: "loader", ok: null, tooltip: t("settings.probe.testing") };
  }
  const base = status.kind === "unknown" ? t("settings.probe.unknown", status.raw ?? "") : t(`settings.probe.${status.kind}`);
  const tooltip = contextTokens === null ? base : `${base} · ${t("settings.probe.context", contextTokens)}`;
  return { icon: status.reachable ? "circle-check" : "circle-x", ok: status.reachable, tooltip };
}
```

i18n: `"settings.probe.context": "Context window per endpoint: {0}"` / `"Kontextfenster laut Endpunkt: {0}"`.

`src/main.ts` neben `probe`:

```ts
  /** Kontextfenster laut Endpunkt (LM Studio/Ollama), sonst null. Nutzt das Modell, das fuer
   *  diese Zeile effektiv gilt. */
  probeContext(ep: EndpointConfig): Promise<number | null> {
    return probeModelContext(ep, effectiveModel(ep, this.settings.model), requestUrlProbe, realClock);
  }
```

`src/obsidian/settings.ts` im Testknopf-Handler:

```ts
              void this.plugin
                .probe(current)
                .then(async (status) => {
                  if (!status.reachable) { showStatus(status); return; }
                  // Erreichbar: zusaetzlich das Fenster erfragen. BERICHTET wird immer;
                  // GESCHRIEBEN nur, wenn das Feld noch auf dem Default steht — wer bewusst
                  // kleiner eingestellt hat, wird nicht ueberschrieben (Regel ohne Flag).
                  const ctx = await this.plugin.probeContext(current);
                  showStatus(status, ctx);
                  if (ctx !== null && this.plugin.settings.contextWindowTokens === DEFAULT_SETTINGS.contextWindowTokens) {
                    await this.setControlValue("contextWindowTokens", ctx);
                    this.refreshUi();
                  }
                })
                .finally(() => {
                  b.buttonEl.disabled = false;
                });
```

`showStatus` erweitern: `const showStatus = (s: EndpointStatus | null, ctx: number | null = null): void => { const view = endpointStatusView(s, ctx); … }`. `DEFAULT_SETTINGS` importieren.

`tests/probe.test.ts`: den Fake-`HttpProbe` um `postJson: async () => { throw new Error("nicht erwartet"); }` ergänzen, damit der Typ passt.

- [ ] **Step 5: Grün + Gate + Commit**

```bash
npx vitest run tests/context_probe.test.ts tests/endpoint_status_view.test.ts tests/probe.test.ts
npm run gate
git add tools/sync-kit.sh src/vendor tests/vendor src/core/llm/context-probe.ts src/core/llm/probe.ts src/obsidian/http-probe.ts src/core/llm/endpoint-status-view.ts src/main.ts src/obsidian/settings.ts src/i18n/strings.ts tests/context_probe.test.ts tests/endpoint_status_view.test.ts tests/probe.test.ts
git commit -m "feat(settings): Kontextfenster vom Endpunkt vorbefuellen (model-context aus dem Kit, Probe aus vim-dojo)"
```

---

### Task 11: Lab-Gegenprobe — Alternierungs-Annahme messen

Die Projektion setzt frühere Nutzer-Nachrichten zu **einer** zusammen, weil Gemma-Templates zwei `user` hintereinander ablehnen sollen. Das ist eine Annahme aus HF-Templates; hier wird sie gegen LM Studio gemessen. **Das Ergebnis ändert den Code nicht** (Zusammensetzen schadet nie), es entscheidet nur, ob die Begründung im Kommentar „gemessen" oder „vorsorglich" heißt.

**Files:**
- Modify: `scripts/koda-lab.ts` (Flag `--alternation`)
- Modify: `docs/LAB.md`

- [ ] **Step 1: Fall ins Lab** — in `scripts/koda-lab.ts` neben den `CASES` einen eigenen Modus: bei `--alternation` wird je Modell **eine** Anfrage mit `[user("Merke dir: A"), user("Was habe ich dir gesagt?")]` ohne Tools über `client.complete` geschickt und der Ausgang protokolliert (`ok`, oder `kind` + `detail` — ein 4xx mit „alternate" im Text ist der erwartete Befund):

```ts
if (flag("alternation") !== null || process.argv.includes("--alternation")) {
  for (const model of models) {
    const r = await client.complete(
      { endpoint, apiKey: "", model, suppressThinking: true },
      [{ role: "user", content: "Merke dir: A" }, { role: "user", content: "Was habe ich dir gesagt?" }],
      [], () => {}, () => {}, new AbortController().signal,
    );
    console.log(`${model}: ${r.ok ? "OK — zwei user hintereinander akzeptiert" : `${r.kind} — ${r.detail}`}`);
  }
  process.exit(0);
}
```

(Bestehende Variablen `models`/`endpoint`/`client` des Skripts verwenden — Namen im Skript nachsehen, sie stehen in `main()`.) `npm run typecheck:scripts` muss grün bleiben.

- [ ] **Step 2: Messen** — LM Studio läuft (`127.0.0.1:1234`) mit den installierten Modellen; `npm run lab:tools -- --alternation`. Ausgabe je Modell notieren.

- [ ] **Step 3: Protokollieren** — `docs/LAB.md`, neuer Abschnitt `## 2026-08-18 · Alternierung (zwei user hintereinander)` mit Tabelle Modell → Ergebnis und dem Satz, was daraus für `renderMerged` folgt (gemessen bestätigt / vorsorglich). Im Kommentar zu `renderMerged` in `project.ts` das Ergebnis in einem Halbsatz nachtragen.

- [ ] **Step 4: Commit**

```bash
npm run gate
git add scripts/koda-lab.ts docs/LAB.md src/core/agent/compaction/project.ts
git commit -m "docs(lab): Alternierungs-Annahme fuer den merged-Block gegen LM Studio gemessen"
```

---

### Task 12: GUI-Smoke — Marken und Settings-Gruppe

**Files:**
- Modify: `scripts/gui-smoke.ts`
- Modify: `docs/SMOKE.md`

- [ ] **Step 1: Baseline VOR dem Umbau des Treibers** (Lesson 2026-08-18: der Smoke ist hier zugleich Prüfling): Obsidian mit `--remote-debugging-port=9222`, aktuelles `main.js`+`styles.css` deployt, `npm run smoke:gui -- --vault <vault>` → Ergebnis (n/n grün) in `docs/SMOKE.md` § Durchläufe als „Baseline vor Compaction-Prüfpunkten" festhalten.

- [ ] **Step 2: Prüfpunkte ergänzen** — in `scripts/gui-smoke.ts` nach dem letzten bestehenden Punkt, **in-memory und ohne Persistenz** (der echte Verlauf des Vaults wird nicht angefasst):

```ts
    // --- 9. Verdichtungs-Marken werden gerendert -----------------------------
    // Records nur im Speicher anhaengen, rendern, pruefen, wieder entfernen — current.jsonl
    // bleibt unberuehrt. Kein Modell noetig: geprueft wird der dritte Render-Zweig.
    const marks = await cdp.evaluate<{ stage1: number; stage2: number; forced: number; summaryText: string }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const n = p.chatLog.length;
      p.chatLog.push({ kind: "compaction", stage: 1, at: new Date().toISOString(), keepToolResults: 3, stats: { stubbed: 6, bytes: 38912 } });
      p.chatLog.push({ kind: "compaction", stage: 2, at: new Date().toISOString(), keepToolResults: 3, summary: "SMOKE-ZUSAMMENFASSUNG", turns: 3, forced: true, stats: { stubbed: 0, bytes: 900 } });
      p.views().forEach((v) => v.renderLog());
      const root = document.querySelector(".koda-log");
      const out = {
        stage1: root.querySelectorAll(".koda-compaction:not(details)").length,
        stage2: root.querySelectorAll("details.koda-compaction-summary").length,
        forced: [...root.querySelectorAll(".koda-compaction")].filter((e) => /Überlauf|overflow/.test(e.textContent)).length,
        summaryText: root.querySelector("details.koda-compaction-summary pre")?.textContent ?? "",
      };
      p.chatLog.splice(n);
      p.views().forEach((v) => v.renderLog());
      return out;
    `);
    record(
      "9. Verdichtungs-Marken (Stufe 1 + Stufe 2, erzwungen) werden gerendert",
      marks.stage1 === 1 && marks.stage2 === 1 && marks.forced === 1 && marks.summaryText === "SMOKE-ZUSAMMENFASSUNG",
      JSON.stringify(marks),
    );
```

Für die Settings-Gruppe: dort, wo der Treiber das Einstellungs-Fenster schon offen hat (Prüfpunkte 3/4), zusätzlich prüfen, dass eine Überschrift mit „Kontext & Verdichtung" bzw. „Context & compaction" existiert und ein Zahlenfeld für das Fenster den Wert der Settings zeigt:

```ts
          const group = await settings.evaluate<{ heading: boolean; field: string | null }>(`
            const heads = [...document.querySelectorAll(".setting-item-heading .setting-item-name")].map((e) => e.textContent);
            const heading = heads.some((h) => /Kontext & Verdichtung|Context & compaction/.test(h));
            const item = [...document.querySelectorAll(".setting-item")].find((e) => /Kontextfenster|Context window/.test(e.querySelector(".setting-item-name")?.textContent ?? ""));
            return { heading, field: item?.querySelector("input")?.value ?? null };
          `);
          record("10. Settings-Gruppe „Kontext & Verdichtung“ mit Fenster-Feld", group.heading && group.field !== null, JSON.stringify(group));
```

(`settings` ist der Name der Settings-Fenster-Brücke im Skript — Namen dort nachsehen; Nummern der Prüfpunkte an die bestehende Zählung anpassen.)

- [ ] **Step 3: Gegenprobe** — einen der beiden Punkte gezielt rot machen (z. B. `summaryText` erwartet „FALSCH"), Lauf → rot; zurückdrehen → grün. Ergebnis mit in die SMOKE.md-Zeile.

- [ ] **Step 4: SMOKE.md** — Handpunkt-Liste ergänzen: „14. Fenster auf 4096 setzen, Auftrag ‚lies die fünf längsten Notizen in `<Ordner>` und fasse jede zusammen' → Marke ‚Verlauf verdichtet' erscheint während des Laufs; Antwort konsistent (Praxistest `gui:ask --full`)." § Automatisierter Teil: die zwei neuen Punkte in die Aufzählung, § Durchläufe: Baseline + Lauf danach + Gegenprobe.

- [ ] **Step 5: Commit**

```bash
npm run gate
git add scripts/gui-smoke.ts docs/SMOKE.md
git commit -m "test(smoke): Verdichtungs-Marken und Settings-Gruppe pruefen (in-memory, ohne Persistenz)"
```

---

### Task 13: Praxistest + Doku + Buchführung

**Files:**
- Modify: `README.md` (Settings-Tabelle, Constraints), `CLAUDE.md` (Statusblock), `docs/NEXT-SESSION.md` (Baustein B erledigt), `CHANGELOG.md` (`[Unreleased]`)
- Modify (Dach, eigenes Repo): `../REGISTRY.md`

- [ ] **Step 1: Praxistest** — Voraussetzung: der CORS-Verdacht bei `gui:ask` (Memory `gui-ask-cors-verdacht`, `docs/SMOKE.md` 2026-08-18) ist geklärt, sonst gibt es keine Modell-Antwort. Wenn geklärt: Fenster in den Settings auf 4096, dann

```bash
npm run gui:ask -- --vault <vault> --ask "Lies die fünf längsten Notizen im Ordner <Ordner> und fasse jede in zwei Sätzen zusammen." --full
```

Erwartung: mindestens eine `compaction`-Marke im Verlauf, Antwort nennt fünf Notizen, keine `overflow`-Meldung. Ergebnis in `docs/SMOKE.md` § Durchläufe. **Wenn nicht geklärt:** den Punkt als offen in SMOKE.md und Cockpit-TaskNote lassen — nicht als bestanden führen.

- [ ] **Step 2: README** — Settings-Tabelle um die fünf Zeilen erweitern (Form wie die bestehenden), § Constraints: „No compaction …" streichen und durch einen Satz ersetzen: „Compaction is two-staged (tool stubs first, model summary of completed turns second) and always visible in the chat; your own messages are never summarized." § How it works: ein Absatz zu Verdichtung.

- [ ] **Step 3: CLAUDE.md + NEXT-SESSION.md + CHANGELOG** — Statusblock: „Compaction (Stufe-2-Baustein B) implementiert — Spec `2026-08-18-koda-compaction-design.md`", Testzahl aktualisieren (aus `npm test`), Struktur-Kurzüberblick um `src/core/agent/compaction/` ergänzen. `NEXT-SESSION.md`: Nachtrag „Baustein B erledigt 2026-08-18; offen bleibt Baustein C". `CHANGELOG.md` `[Unreleased]` → `### Added` mit Verdichtung, Settings-Gruppe, Fenster-Vorbefüllung; `### Changed` mit `overflow`-Fehlerart.

- [ ] **Step 4: REGISTRY (Dach)** — in `../REGISTRY.md`:
  - Zeile „Non-Streaming Chat-Response interpretieren" (§ Streaming / SSE / LLM): `· **5. Exemplar** koda-agent/src/core/llm/chat-error.ts (2026-08-18, isContextOverflow verbatim aus vault-crews)`.
  - Neue Zeile § Streaming / SSE / LLM: **„Kontextfenster eines Endpunkts abfragen (LM Studio `/api/v0/models` je Modell, Ollama `POST /api/show`), best-effort, HTTP injiziert"** → `koda-agent/src/core/llm/context-probe.ts` · Exemplare: `vault-crews/src/core/local-llm-client.ts` (1.), `vim-dojo/src/llm/modelContext.ts` (2., `requestUrl` direkt), koda (3., pure mit `HttpProbe`) → **Kit-Kandidat n=3**.
  - Neue Zeile (§ Streaming / SSE / LLM oder § Utils): **„Gesprächsverlauf für ein Modell verdichten, ohne ihn für den Nutzer anzutasten (Projektion statt Umschreiben, positionsbasierte Marken, Tool-Stubs vor Modell-Zusammenfassung, Nutzer-Nachrichten unantastbar)"** → `koda-agent/src/core/agent/compaction/` (`projectForModel`/`planStage1`/`summarizeTurns`, Tests) · Muster-Referenz (**erstes Exemplar** 2026-08-18).
  - Commit im Dach: `cd .. && git add REGISTRY.md && git commit -m "registry: Compaction-Muster (koda), Kontextfenster-Probe n=3, chat-error 5. Exemplar"`. Vorher `ListAgents` prüfen (Memory `parallele-cc-sessions`).

- [ ] **Step 5: Gate + Commit im Plugin**

```bash
npm run gate
git add README.md CLAUDE.md docs/NEXT-SESSION.md CHANGELOG.md docs/SMOKE.md
git commit -m "docs: Compaction dokumentiert — README-Settings, Statusblock, Seed, Changelog"
```

Kein Release in diesem Plan — der Release (0.7.0) ist eine eigene Entscheidung nach dem Praxistest.

---

## Self-Review (durchgeführt beim Schreiben)

- **Spec-Abdeckung:** Trigger proaktiv+reaktiv (T5, T6) · Verlust-Regel (T3: user nie angefasst, Property-Test) · Fenster-Setting + Vorbefüllung (T8, T10) · zweistufig (T4, T7) · zwei Schichten + Marke (T2, T9) · Persistenz append-only (T2) · Alternierung (T3, T11) · rollend 60 % (T7) · Fehlertext (T1, T8) · Failover unverändert (T1 Constraint) · Settings-Gruppe (T8) · Tests inkl. Smoke/Praxis (T12, T13) · Kit-first-Buchführung (T13).
- **Typkonsistenz:** `CompactionDeps` (T5) ↔ `main.ts` (T9): gleiche Feldnamen. `planStage1(projected, keep, at, forced)` (T4) ↔ Loop (T5/T6). `summarizeTurns` Optionen (T7) ↔ Loop (T7). `endpointStatusView(status, contextTokens)` (T10) ↔ `settings.ts` (T10). `HttpProbe.postJson` (T10) ↔ Fake in `tests/probe.test.ts`.
- **Bekannte Stellen mit Ermessen für den Ausführenden:** exakter TS-Cast des `group`-Eintrags (T8 Step 4), Variablennamen im Lab-Skript (T11) und im Smoke-Treiber (T12) — jeweils im Plan benannt, wo nachzusehen ist.
