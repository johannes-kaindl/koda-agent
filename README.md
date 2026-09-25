# Koda

Koda is an agentic companion for your Obsidian vault — a chat sidebar that can search
your notes, read them, and write new ones, always with a clear rule for when it needs
your approval first. It runs entirely against an OpenAI-compatible LLM endpoint you
configure (a local server such as [LM Studio](https://lmstudio.ai), or a hosted
provider if you add an API key) and keeps its own memory in a plain Markdown note you
can read and edit yourself.

*Status: 0.11.0 — distributed via Forgejo releases and the AnySource Sideloader
catalogue, no signed builds. Not currently listed in the Community plugin store (see
[Install](#install)). See `CLAUDE.md` for the current scope and design decisions.*

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/gitea/v/release/jkaindl/koda-agent?gitea_url=https%3A%2F%2Fgit.jkaindl.de&label=release)](https://git.jkaindl.de/jkaindl/koda-agent/releases)
[![Obsidian](https://img.shields.io/badge/obsidian-1.8.7%2B-purple)](https://obsidian.md)

*Auch auf Deutsch verfügbar: [`README.de.md`](README.de.md).*

## Features

- **Chat sidebar** (ribbon icon + command) with streaming answers, a collapsible
  "thinking" block for reasoning models, and a Stop button that leaves the partial
  answer in place.
- **A Context tab beside the chat.** The sidebar has two tabs. The Context tab shows what
  your next message will carry — the active note, your selection, the open tabs — as chips
  you can click away one by one, plus a line telling you how much of the model's context
  window it fills. Deselect a note and it leaves the block Koda sends; press
  **Reset selection** (or start a new chat) to bring everything back. The setting
  *Keep context choices* decides whether a deselection outlives the message it was made for.
- **Ten tools:** `search_notes`, `read_note`, `write_note`, `move_note`, `delete_note`,
  `save_memory`, `write_skill`, `list_notes`, `get_workspace`, `edit_active_note` — the model calls these itself while answering, with each
  step shown inline in the chat. `read_note` reads all three note formats — `.md`,
  `.base` and `.canvas`; writing stays `.md`-only. `list_notes` returns every note under a vault folder,
  optionally recursive, together with whichever frontmatter fields were asked for, in
  one call; a non-recursive listing also names the subfolders and how many notes each holds, including folders without any note; a folder note (a note named like its folder) is marked as one, so it is not
  counted as ordinary content. `move_note` renames or relocates a note and lets Obsidian
  update the wikilinks pointing at it; `delete_note` moves a note to the vault's trash and
  always asks first, even inside the Koda folder. An eleventh, `related_notes`, appears when
  semantic retrieval is available (see below).
- **Semantic retrieval, if you already have it** *(optional)* — if the
  [Vault Retrieval](https://git.jkaindl.de/jkaindl/vault-rag) plugin is installed
  and has indexed your vault, Koda uses its embedding index: `search_notes` adds
  meaning-based matches when the literal search comes up thin (fewer than three hits),
  and a `related_notes` tool answers "what else is about this?" straight from the
  index — offline, no endpoint required. Literal and semantic hits are shown as
  **separate, labelled blocks**, never merged into one ranking: a literal hit proves a
  wording exists, a semantic one does not. Without that plugin Koda behaves exactly as
  before — nothing to configure, and no dead tool in the prompt.
- **Working context** — every question can carry what you are looking at. The dropdown next
  to Send switches the mode per question (commands and a right-click entry on selected text
  exist too), and the block that went along is shown under each of your messages, collapsible,
  also after a restart:
  - **Workspace** — the active note with its properties, the selection, the cursor line and
    the open tabs, as pointers only. `get_workspace` returns the full selection, the lines
    around the cursor and every tab; `edit_active_note` replaces the selection or inserts at
    the cursor — after the usual approval dialog, and only if the selection is still the one
    it previewed.
  - **Note** and **All tabs** — the active note plus its linked neighbours (outgoing links and
    backlinks, depth 1–3), or every open note, go along in **full text**, not just as a
    pointer, capped by a character budget.
  - **Manual** — add a note or a whole folder by hand, from the Context tab or three
    commands; remove it again the same way.

  Cut-offs (selection length, tab count, properties, and the content budget for Note/All
  tabs/Manual) are settings and announce themselves in the block: nothing is dropped
  silently, a cut always names both numbers and the way to the rest. **Source chips** under
  the answer name which notes went along in full text, and clicking one opens it.

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
- *Optional:* the [Vault Retrieval](https://git.jkaindl.de/jkaindl/vault-rag)
  plugin with an indexed vault, which adds semantic search and the `related_notes`
  tool. Koda works fully without it.

## Install

Repository: [git.jkaindl.de/jkaindl/koda-agent](https://git.jkaindl.de/jkaindl/koda-agent)
(GitHub mirror: currently unavailable)

> **Note (2026-09-03):** Koda is currently **not listed in the Community plugins
> browser**. The GitHub account hosting the mirror is unavailable, which also removed the
> store listing. The plugin itself is unaffected and fully maintained — releases are
> published on Forgejo, and the two routes below both work today.

### With AnySource Sideloader (recommended)

[AnySource Sideloader](https://git.jkaindl.de/jkaindl/anysource-sideloader) installs and
updates plugins from any git forge, independent of the Community Store.

1. Install and enable AnySource Sideloader. (Its own first install is manual — being
   independent of the store is the point — but it only has to be done once, and it then
   keeps itself and everything else updated.)
2. Subscribe to the catalogue, which lists Koda alongside the other plugins from the
   same author:
   `https://git.jkaindl.de/jkaindl/obsidian-catalog/raw/branch/main/catalog.json`
   — or add just this one repository as a source:
   `https://git.jkaindl.de/jkaindl/koda-agent`
3. Install Koda, then point it at an LLM endpoint in the settings.

Updates then arrive the same way any other plugin update does.

### From Obsidian's Community plugins browser

Available again once the store listing returns:

1. Open **Settings → Community plugins → Browse**.
2. Search for **"Koda"** and select **Install**.
3. **Enable** Koda, then point it at an LLM endpoint in the settings.

### Manual install

Download `main.js`, `manifest.json` and `styles.css` from the
[latest Forgejo release](https://git.jkaindl.de/jkaindl/koda-agent/releases/latest)
and copy them into your vault. Each release also ships `checksums.sha256`, so you can
verify what you downloaded with `shasum -a 256 -c checksums.sha256`.

```bash
cp manifest.json main.js styles.css "<your-vault>/.obsidian/plugins/koda-agent/"
```

Then enable Koda under **Settings → Community plugins**.

## Usage

1. Open the sidebar — ribbon dog icon or the **Open Koda** command.
2. Ask a question. Koda streams its answer; for reasoning models the "thinking" block
   sits collapsed above it, and **Stop** ends the stream while keeping what arrived.
3. **Check what goes along.** The **Context** tab lists the active note, your selection, the
   open tabs and — in Note/All tabs/Manual mode — the notes going along in full text, all as
   chips. Click a chip's × to leave it out of the next message, or its name to open the note.
   Three commands and buttons in the tab add a note or a folder to the context by hand.
   Commands *Show Chat tab* and *Show Context tab* switch without the mouse.
4. **Watch the tools work.** Each `search_notes` / `read_note` / `write_note` /
   `list_notes` call appears inline in the chat as it happens, so you can see which
   notes an answer is built on rather than taking it on trust.
5. **Approve writes outside the Koda folder.** A modal shows the new text (create and
   append) or a line diff (replace) before anything is written — see
   [The write rule](#the-write-rule).
6. **New chat** starts a fresh session log, after a confirmation — discarding is final.
   The button sits in the header row at the top of the sidebar, next to the thinking
   toggle. Both are also commands (`Koda: New chat`, `Koda: Toggle thinking`), so you can
   reach them from the command palette or bind a hotkey. Old sessions are restored after an
   Obsidian restart; they are plain JSONL in the plugin folder.

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
| Max tool calls per answer | 8 (1–50) | How many tool calls Koda may chain per question before it has to answer |
| Request timeout | 300 s (30–900) | Hard limit per model call |
| Skill budget | 6000 chars (1000–100000) | How much skill text fits into the system prompt |
| Suppress thinking | on | Hides the reasoning block by default |
| Text tool-call fallback | off | For models without native tool calling |
| UI language | auto | Follows Obsidian, or force German/English |
| Open on startup | off | Opt-in; the sidebar stays closed unless you ask for it |
| Context mode on startup | Workspace | Off / Workspace / Note / All tabs (Vault reserved for a later stage) |
| Selection in the context | 600 chars (100–5000) | How many characters of the selected text to include in the context block |
| Open tabs in the context | 12 (1–100) | How many open tabs to list in the context block |
| Properties in the context | 300 chars (0–2000) | How many characters of the frontmatter properties to include (0 = none) |
| Content budget per message | 20,000 chars (2000–200000) | How much note content the modes Note, All tabs and Manual may put into one message; cut entries are named, never dropped silently. Does not affect Workspace, which only sends pointers |
| Link depth in the Note mode | 1 (1–3) | How many levels of outgoing links and backlinks are collected around the active note; each level multiplies the note count and splits the budget further |
| Context window (tokens) | 8192 (2048–1000000) | Size of the model's context window; one number for all endpoints. "Test" on an endpoint row fills it in when the server reports it (LM Studio, Ollama) and the field is still on its default |
| Compact at (% of window) | 75 (40–95) | Koda compacts the conversation before a model call once the estimate exceeds this share of the window |
| Keep tool results verbatim | 3 (0–20) | How many of the most recent tool results stay in full; older ones become a one-line stub |
| Summarize older replies | on | If shortening alone is not enough, Koda asks the model to summarize older replies; your own messages are never summarized |
| Summary length (% of window) | 10 (3–30) | Upper bound for the summary text |
| Instructions for Koda | *(empty)* | Replaces the shipped rule block — see [Model control](#model-control) |
| Tools | all enabled | Turns individual tools off and rewords their descriptions — see [Model control](#model-control) |

## How it works

A question starts an **agent loop**: Koda sends your message plus a system prompt to
the endpoint, and the model may answer directly or call one of its tools. A tool call
is executed against the vault, its result goes back into the conversation, and the
model gets another turn — up to **Max tool calls per answer**, after which it has to answer with
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
full); if that alone is not enough and **Summarize older replies** is on, Koda asks
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

## Model control

**Settings → Koda → Model control** lets you replace the instructions Koda follows and
turn individual tools off — useful for a weaker or smaller model that needs more explicit
guidance and fewer tools to choose from.

The instructions textarea starts **empty**, with the shipped version shown greyed out as
a placeholder. An empty field always means "the shipped version applies" — never "no
instructions". This matters beyond the moment you open the field: because nothing is
copied in until you actually type something, a later improvement to the shipped
instructions still reaches you if you never touched the field, and the "Restore the
shipped version" button (↺) puts you back on that state at any time. Two placeholders,
`{{sprache}}` and `{{ordner}}`, stand in for your language and Koda folder settings and
are filled in on every run — keep them in a rewritten version so it keeps following you
if you change either setting later.

Below the textarea, a warning appears (without blocking anything) if the instructions
never mention tools, drop one of the two placeholders, or if every tool that looks into
the vault has been turned off — or if only some reading tools are disabled, in which case
the warning names them, so you know which ones Koda is not told about. **Show active instructions** opens a preview of the exact prompt the next conversation will start with, including the current memory and
skills blocks.

Each tool — including the reading ones (`search_notes`, `read_note`, `list_notes`,
`related_notes`) — has its own switch and its own description field, which follows the
same empty-means-shipped rule as the instructions. A tool that is switched off is left
out of what is sent to the model entirely; it does not just get ignored. `related_notes`
stays visible even without vault-rag installed, greyed out with a note why, so it never
looks like a setting that quietly disappeared.

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
