# Koda

Koda is an agentic companion for your Obsidian vault — a chat sidebar that can search
your notes, read them, and write new ones, always with a clear rule for when it needs
your approval first. It runs entirely against an OpenAI-compatible LLM endpoint you
configure (a local server such as [LM Studio](https://lmstudio.ai), or a hosted
provider if you add an API key) and keeps its own memory in a plain Markdown note you
can read and edit yourself.

*Status: MVP, pre-release — no Community Store listing yet, no signed builds. See
`CLAUDE.md` for the current scope and design decisions.*

## Features (MVP)

- **Chat sidebar** (ribbon icon + command) with streaming answers, a collapsible
  "thinking" block for reasoning models, and a Stop button that leaves the partial
  answer in place.
- **Five tools:** `search_notes`, `read_note`, `write_note`, `save_memory`,
  `write_skill` — the model calls these itself while answering, with each step
  shown inline in the chat.
- **A durable, transparent memory** — `save_memory` appends dated lines to
  `<Koda folder>/Memory.md`, which is also fed back into the system prompt on every
  question. Nothing is stored anywhere you can't open and edit.
- **Sessions persist** — chat history is written to a JSONL log inside the plugin
  folder and restored on Obsidian restart. "New chat" starts a fresh log.
- **Settings:** one or more endpoints (URL, optional API key, optional per-endpoint
  model override — reorder to change which one is used), global model id, max tool
  rounds per question, suppress-thinking toggle, text-tool-call fallback for models
  without native tool calling, UI language, and an opt-in "open on startup" toggle
  (off by default).

## The write rule

Koda writes freely inside the **Koda folder** you set in settings (default: `Koda`) —
that's where its own memory and drafts live. Any write **outside** that folder opens a
confirmation modal first: a preview of the new text for create/append, a line diff for
replace. Reject it and Koda is told the write was declined (the file stays untouched);
confirm and it goes through. There is no other way for Koda to touch a note outside its
own folder.

## Endpoints

The endpoint list in settings is a priority list, not a failover chain: **the first
entry is always the one used.** Reorder the list (the "move to top" button on each row)
to switch which server Koda talks to — there is no automatic fallback to the next
entry in the MVP.

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

## Install

Koda is in the Obsidian community plugin store: **Settings → Community plugins →
Browse → "Koda" → Install → Enable**. Alternatively, drop `main.js`, `manifest.json`
and `styles.css` from a [release](https://github.com/johannes-kaindl/koda-agent/releases)
into `<vault>/.obsidian/plugins/koda-agent/`.

## Setup

1. Start an OpenAI-compatible LLM server with a tool-calling-capable model (e.g. LM
   Studio, listening on `http://127.0.0.1:1234` by default).
2. In Obsidian, enable Koda and open **Settings → Koda**.
3. Add the endpoint URL (and API key, if it needs one). Set the **Model** field to the
   model id the server reports, unless the endpoint row already has its own override.
4. Optionally change the **Koda folder** (default `Koda`) — this is where memory and
   free writes live.
5. Open the sidebar via the ribbon dog icon or the **Open Koda** command and ask a
   question.

## Development

```bash
npm install
npm run gate       # lint + typecheck + typecheck:scripts + test + check:pure + build
npm run dev        # esbuild watch build
npm test           # vitest + no-abs-paths check
npm run lab:tools  # scripted tool-calling probe against a live endpoint (see docs/LAB.md)
```

### Structure

- `src/core/` — pure logic: agent loop, tool policy, memory, sessions, diff (no
  Obsidian imports; enforced by `check:pure`).
- `src/llm/` — `KodaChatClient` + `XhrSseTransport` (streaming chat client).
- `src/obsidian/` — the view, vault-facing tool adapter, write-confirmation modal,
  settings tab.
- `src/vendor/kit` + `src/vendor/kit-obsidian/` — a verbatim snapshot of
  `../obsidian-kit` (endpoint config, i18n, reasoning/think-splitter, confirm modal,
  folder suggest, …), re-vendored via `tools/sync-kit.sh`. Never hand-edit these files.
- `src/i18n/` — DE/EN UI strings.
- `scripts/koda-lab.ts` — the tool-calling probe behind `npm run lab:tools`; findings
  are recorded in [`docs/LAB.md`](docs/LAB.md).

See [`docs/SMOKE.md`](docs/SMOKE.md) for the manual GUI smoke checklist run before each
release.

## Constraints (deliberate, not yet, or never)

- No terminal/full-system access — out of scope permanently (store policy + safety).
- No compaction or synthesis workflows yet — planned for later stages, see
  `CLAUDE.md`.
- No heartbeat, no scheduled background work — Koda acts only when you ask it to.

## License

[AGPL-3.0-or-later](LICENSE) — © 2026 Jay.
