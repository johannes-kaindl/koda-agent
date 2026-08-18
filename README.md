# Koda

Koda is an agentic companion for your Obsidian vault — a chat sidebar that can search
your notes, read them, and write new ones, always with a clear rule for when it needs
your approval first. It runs entirely against an OpenAI-compatible LLM endpoint you
configure (a local server such as [LM Studio](https://lmstudio.ai), or a hosted
provider if you add an API key) and keeps its own memory in a plain Markdown note you
can read and edit yourself.

*Status: 0.4.0 — listed in the Obsidian Community Plugin store, no signed builds.
See `CLAUDE.md` for the current scope and design decisions.*

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/gitea/v/release/jkaindl/koda-agent?gitea_url=https%3A%2F%2Fgit.jkaindl.de&label=release)](https://git.jkaindl.de/jkaindl/koda-agent/releases)
[![Obsidian](https://img.shields.io/badge/obsidian-1.8.7%2B-purple)](https://obsidian.md)

*Auch auf Deutsch verfügbar: [`README.de.md`](README.de.md).*

## Features

- **Chat sidebar** (ribbon icon + command) with streaming answers, a collapsible
  "thinking" block for reasoning models, and a Stop button that leaves the partial
  answer in place.
- **Six tools:** `search_notes`, `read_note`, `write_note`, `save_memory`,
  `write_skill`, `list_notes` — the model calls these itself while answering, with each
  step shown inline in the chat. `list_notes` returns every note under a vault folder,
  optionally recursive, together with whichever frontmatter fields were asked for, in
  one call; a folder note (a note named like its folder) is marked as one, so it is not
  counted as ordinary content. A seventh, `related_notes`, appears when semantic retrieval is available
  (see below).
- **Semantic retrieval, if you already have it** *(optional)* — if the
  [Vault Retrieval](https://github.com/johannes-kaindl/vault-rag) plugin is installed
  and has indexed your vault, Koda uses its embedding index: `search_notes` adds
  meaning-based matches when the literal search comes up thin (fewer than three hits),
  and a `related_notes` tool answers "what else is about this?" straight from the
  index — offline, no endpoint required. Literal and semantic hits are shown as
  **separate, labelled blocks**, never merged into one ranking: a literal hit proves a
  wording exists, a semantic one does not. Without that plugin Koda behaves exactly as
  before — nothing to configure, and no dead tool in the prompt.
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

## Requirements

- **Obsidian 1.8.7** or newer. Desktop and mobile — Koda is not desktop-only.
- **An OpenAI-compatible chat endpoint** with a **tool-calling-capable model**. That
  can be a local server ([LM Studio](https://lmstudio.ai), Ollama, …) or a hosted
  provider if you add an API key. Models without native tool calling can still be used
  via the text-tool-call fallback, less reliably.
  **A local server needs CORS enabled.** The chat streams from Obsidian's renderer,
  which always sends `Origin: app://obsidian.md`; most local servers reject that until
  CORS is switched on (LM Studio: "Enable CORS" in the server settings, or
  `lms server start --cors`; Ollama: `OLLAMA_ORIGINS`). The "Test" button in the
  settings passes either way — it takes a different route that sends no `Origin` — so
  a green test with a chat that reports the endpoint as unreachable is the CORS
  signature, and Koda names it as such.
- *Optional:* the [Vault Retrieval](https://github.com/johannes-kaindl/vault-rag)
  plugin with an indexed vault, which adds semantic search and the `related_notes`
  tool. Koda works fully without it.

## Install

Koda is in the Obsidian community plugin store: **Settings → Community plugins →
Browse → "Koda" → Install → Enable**. Alternatively, drop `main.js`, `manifest.json`
and `styles.css` from a [release](https://github.com/johannes-kaindl/koda-agent/releases)
into `<vault>/.obsidian/plugins/koda-agent/`.

## Usage

1. Open the sidebar — ribbon dog icon or the **Open Koda** command.
2. Ask a question. Koda streams its answer; for reasoning models the "thinking" block
   sits collapsed above it, and **Stop** ends the stream while keeping what arrived.
3. **Watch the tools work.** Each `search_notes` / `read_note` / `write_note` /
   `list_notes` call appears inline in the chat as it happens, so you can see which
   notes an answer is built on rather than taking it on trust.
4. **Approve writes outside the Koda folder.** A modal shows the new text (create and
   append) or a line diff (replace) before anything is written — see
   [The write rule](#the-write-rule).
5. **New chat** starts a fresh session log. Old sessions are restored after an Obsidian
   restart; they are plain JSONL in the plugin folder.

Ask Koda to remember something and it appends a dated line to
`<Koda folder>/Memory.md` — an ordinary note you can open, edit or delete.

## Configuration

First-time setup:

1. Start an OpenAI-compatible LLM server with a tool-calling-capable model (e.g. LM
   Studio, listening on `http://127.0.0.1:1234` by default).
2. In Obsidian, enable Koda and open **Settings → Koda**.
3. Add the endpoint URL (and API key, if it needs one). Set the **Model** field to the
   model id the server reports, unless the endpoint row already has its own override.
4. Optionally change the **Koda folder** (default `Koda`) — this is where memory and
   free writes live.
5. Open the sidebar via the ribbon dog icon or the **Open Koda** command and ask a
   question.

The full settings list:

| Setting | Default | Meaning |
|---|---|---|
| Endpoints | `http://127.0.0.1:1234` | URL, optional API key, optional per-endpoint model override. A priority list — see [Endpoints](#endpoints) |
| Model | *(empty)* | Model id sent to the endpoint, unless that row overrides it |
| Koda folder | `Koda` | Where memory, skills and free writes live |
| Max tool rounds | 8 (1–50) | How many tool calls Koda may chain per question before it has to answer |
| Request timeout | 300 s (30–900) | Hard limit per model call |
| Skill budget | 6000 chars (1000–100000) | How much skill text fits into the system prompt |
| Suppress thinking | on | Hides the reasoning block by default |
| Text tool-call fallback | off | For models without native tool calling |
| UI language | auto | Follows Obsidian, or force German/English |
| Open on startup | off | Opt-in; the sidebar stays closed unless you ask for it |
| Context window (tokens) | 8192 (2048–1000000) | Size of the model's context window; one number for all endpoints. "Test" on an endpoint row fills it in when the server reports it (LM Studio, Ollama) and the field is still on its default |
| Compact at (% of window) | 75 (40–95) | Koda compacts the conversation before a model call once the estimate exceeds this share of the window |
| Keep tool results verbatim | 3 (0–20) | How many of the most recent tool results stay in full; older ones become a one-line stub |
| Summarize with the model (stage 2) | on | If stubs are not enough, Koda asks the model to summarize completed turns; your own messages are never summarized |
| Summary length (% of window) | 10 (3–30) | Upper bound for the summary text |

## How it works

A question starts an **agent loop**: Koda sends your message plus a system prompt to
the endpoint, and the model may answer directly or call one of its tools. A tool call
is executed against the vault, its result goes back into the conversation, and the
model gets another turn — up to **Max tool rounds**, after which it has to answer with
what it has. This is what keeps a stuck model from looping forever on your vault.

The system prompt is assembled fresh for every question from three sources: Koda's own
instructions, the contents of `Memory.md`, and the active skills that fit into the
skill budget. All three are plain Markdown in your vault, so what steers Koda is
readable and editable — there is no hidden state.

Writes never go straight through. `write_note` is checked against the Koda folder
first; anything outside it is routed through the confirmation modal, and a rejection is
reported back to the model as a declined write rather than silently swallowed.

Retrieval degrades rather than breaks: Koda looks up Vault Retrieval's plugin API
defensively at runtime. If it is there, `search_notes` tops up thin literal results
with semantic ones (kept in a separate, labelled block) and `related_notes` is
registered as a seventh tool; if it is not, neither appears in the prompt at all.

A long conversation would eventually overflow the model's context window, so before
each model call Koda estimates the conversation's size against **Context window** and
**Compact at**. Past that share, it compacts in two stages: first, older tool results
collapse into one-line stubs (**Keep tool results verbatim** decides how many stay in
full); if that alone is not enough and **Summarize with the model** is on, Koda asks
the model itself to summarize the completed turns it just dropped. Compaction is a
*projection* — it changes what goes to the model, never the stored conversation you
see in the chat, and your own messages are never touched. Every compaction leaves a
visible mark in the conversation so you can tell it happened.

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

A skill is a Markdown note in `<Koda folder>/Skills/` that steers Koda's behavior.
You write it yourself — or let Koda write it, which always requires confirmation.

```markdown
---
description: Always answer with an exclamation mark at the end
enabled: true
---

Append a "!" to every answer.
```

- The **name is the filename** without `.md`.
- `description` is required — it explains in one sentence what changes, and it's
  what you see in the confirmation modal.
- `enabled: false` turns a skill off without deleting it.
- Subfolders are not read.

At the start of a conversation, all active skills go into Koda's system prompt. How
much text that can hold at most is controlled by **Skill budget** in settings
(default 6000 characters); anything that no longer fits shows up with only its
description — Koda then knows the skill exists but can't follow it. Which skills are
currently in effect is shown at the top of the conversation.

**Skills always require confirmation**, even inside the Koda folder where Koda can
otherwise write freely. The reason: a skill isn't a draft — it changes what Koda does
going forward.

## Development

```bash
npm install
npm run gate       # lint + typecheck + typecheck:scripts + test + check:pure + build
npm run dev        # esbuild watch build
npm test           # vitest + no-abs-paths check
npm run lab:tools  # scripted tool-calling probe against a live endpoint (see docs/LAB.md)
```

### Structure

- `src/core/` — pure logic: agent loop, tool policy, memory, sessions, diff,
  retrieval merging (no Obsidian imports; enforced by `check:pure`).
- `src/core/agent/compaction/` — two-staged conversation compaction (tool-result
  stubbing, model summary of completed turns), pure projection over the stored log.
- `src/llm/` — `KodaChatClient` + `XhrSseTransport` (streaming chat client).
- `src/obsidian/` — the view, vault-facing tool adapter, write-confirmation modal,
  settings tab, and the defensive lookup of Vault Retrieval's plugin API.
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
- Compaction is two-staged (tool stubs first, model summary of completed turns
  second) and always visible in the chat; your own messages are never summarized.
  No synthesis workflows yet — planned for a later stage, see `CLAUDE.md`.
- No heartbeat, no scheduled background work — Koda acts only when you ask it to.

## License

[AGPL-3.0-or-later](LICENSE) — © 2026 Jay.
