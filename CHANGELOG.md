# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

### Changed

- The author in the manifest now reads "Johannes Kaindl" (shown in Obsidian's plugin list).
- The changelog is now written entirely in English.
- Internal design notes moved out of the repository; the user documentation is unchanged.

## [0.21.0] — 2026-09-30

### Added

- **Koda can look at images.** A new tool `read_image` opens a `.png`, `.jpg`, `.jpeg`, `.gif` or `.webp` from the vault. If the model sees images (judged by its name; "probably" is enough), the picture goes to the model together with the tool result. Otherwise, with [Image to Markdown](https://github.com/johannes-kaindl/image-to-markdown) active, Koda reads the text in the image instead. Without either, the tool is not offered. The session file keeps only the image's path, never the picture itself.
- If the server rejects a request that carries an image (HTTP error) and text recognition is available, Koda swaps the image for the recognised text and repeats the round once; a notice says so.
- **Koda can generate images.** A new tool `generate_image` asks [Local Image Generator](https://github.com/johannes-kaindl/local-image-generator) for a picture and answers with an embed so the image shows in the chat. Inside the Koda folder (default: `Koda/images`) it runs without asking; anywhere else a dialog shows the prompt and the target folder **before** anything is generated. The tool appears only while that plugin is active.
- Setting **Largest image Koda reads (KB)** (default 4096). Above it, `read_image` does not hand the picture to the model: with text recognition active it reads the text, otherwise it says the image is too large.

### Changed

- **Settings → Koda → Model control → Tools** lists `read_image` and `generate_image` with a switch like the other tools, greyed out with the reason while the tool cannot work (no vision model and no Image to Markdown, or no Local Image Generator).
- Kit modules `ocr-provider` and `image-gen-provider` 0.45.1 (the contracts the two neighbour plugins answer to).

## [0.20.0] — 2026-09-30

### Added

- Koda knows the date and time. Every conversation's prompt ends with a `## Now` section (for example `2026-09-30 (Wednesday) 23:45, Europe/Berlin`), and a new tool `get_datetime` answers again when a long conversation needs it. Before, Koda had no clock and made dates up (session logs dated `2026-10-01`). The section sits outside the editable rules block, so the rules comparison does not report a daily change.
- The GitHub release now also carries a ready-to-unpack `koda-agent.zip` (the plugin folder with `main.js`, `manifest.json` and `styles.css`) and a `checksums.sha256` file. For a manual install, download the zip and unpack it into `.obsidian/plugins/` instead of creating the folder and saving three files by hand.

### Fixed

- Koda warns when the model's context window is smaller than the setting. If the model name says so (a suffix like `-ctx128k`, as in `gpt-oss:120b-ctx128k`) or the endpoint reports a smaller window, a notice names the model and both numbers and offers **Use N** to adopt the model's value. Koda never changes the setting by itself; the notice shows once per model and session.
- Memory lines (`save_memory`) were dated with the UTC date, so between 00:00 and 02:00 (summer time, Central Europe) they carried the previous day. They now use your local date.
- Some local models write non-ASCII characters into notes as literal byte tokens (`<0xF0><0x9F><0x97><0x82>` instead of 🗂). Koda now decodes such sequences before writing (`write_note`, `write_skill`, `save_memory`, `edit_active_note`), so the confirmation preview shows exactly what lands in the file. An incomplete sequence is rejected with a message naming the line, instead of being silently repaired; nothing is written.

### Changed

- **Skills load in two steps.** Only skills with `pinned: true` in their frontmatter go into the system prompt in full; all others appear with their name and description and a hint to call the new tool `load_skill`, which returns the full text from `<Koda folder>/Skills/` (only that folder; a disabled skill or a name with a path is refused with the list of available names). Before, every skill was loaded in full up to the skill budget, so many skills filled the prompt. **To keep the old behaviour for a skill, add `pinned: true`** (for example to a start routine). **Skill budget** is now the upper limit for pinned skills: pinned skills always load, and the chat reports by how much they exceed it (**⚠ Pinned skills are over budget: N characters**). `write_skill` with `replace` keeps an existing pin. The chat line for the rest reads **⚙ N skill(s) on demand** instead of **⚙ Description only (budget exhausted)**.
- Kit chat client 0.44.0 (no user-visible change).

## [0.19.0] — 2026-09-26

### Changed
- **Chat calls go through the Kit client** (obsidian-kit 0.43.0, `createChatClient` with XHR transport): Koda's own streaming client and transport are gone, and Koda's earlier repairs (tool-call arguments are awaited without aborting, truncated calls, the reasoning echo for models like `verdigado-pro`) stay unchanged. Visible consequences: if a server answers with HTTP 200 but a JSON error in the body (e.g. "model not loaded"), Koda now reports the server's message instead of an empty answer. An answer without a stream (the server ignores `stream: true`) is read instead of discarded. An abort before the stream starts no longer reaches the server at all. A transport error still reads "not reachable"; falling back to a request without a stream when the origin is refused is deliberately not done.
- **llm-lab connection through the Kit** (`lab-client`): same recording as before (apiVersion 4). New: if the installed llm-lab has a different contract version, Koda writes a warning to the console once per session instead of silently skipping the recording.
- The endpoint list and the answer area in the settings and in the chat carry the style of Kit 0.43.0 (endpoint row: child selectors; an empty status line in the answer area hides itself).

## [0.18.0] — 2026-09-26

### Added
- Help row at the top of the settings with links to the documentation and the issue tracker (English and German).

## [0.17.1] — 2026-09-26

### Changed
- **New README and user documentation**: The README is trimmed to the essentials (features, installation, usage, links) and no longer names an outdated version. The details now live in user documentation under `docs/`: Getting started, Troubleshooting (every message verbatim, with cause and remedy), how-tos on working context, skills and model control, a reference of all settings, tools and commands, and an explanation of how Koda works. Corrected against the old README: the endpoint list takes the first reachable entry (not a fixed first one), the answer timeout measures silence rather than total duration, and `search_notes` always queries Vault Retrieval as well, not only when there are few hits.

## [0.17.0] — 2026-09-26

### Added
- **`list_notes` shows the folder tree**: With `depth` (e.g. 2 or 3), `list_notes` returns the structure of a folder across several levels in one call — every folder with its full path and the number of notes in it, empty folders included. That way Koda sees at a glance whether every project folder has the same subfolders, instead of opening each one. The tree respects the maximum number of listed notes; if it is cut off, the first line says so and names the depth up to which it is complete. Without `depth`, everything stays as before.
- **Tools from other plugins**: A plugin that offers its capabilities under the tool contract (`api.tools()`/`api.execute()`, first instance vault-rag) gets its tools mounted in Koda without Koda rebuilding them. They appear in the list sent to the model after Koda's own, can be switched off and re-described in the settings like those, and a writing tool asks first with the provider's preview. If vault-rag offers `related_notes` itself, it replaces Koda's built-in version. A tool whose name collides with a Koda tool is not mounted.

## [0.16.0] — 2026-09-25

### Added
- **Vault mode** in the working context: Koda queries vault-rag with the question you are sending and puts the best hits into the context in full text. In the Context tab the hits appear while you type (debounced by 400 ms), as chips marked "vault-rag". If the search is unavailable (plugin missing, no index, endpoint not reachable), that shows as a notice line in the block and in the Context tab instead of staying silently empty. Without vault-rag the entry stays visible in the dropdown but locked ("Vault (needs vault-rag)").
- **Semantic neighbours in Note mode**: in addition to links and backlinks, Koda takes along the notes that vault-rag finds similar to the active note (marked "similar" in the Context tab). If they are missing, only that section is missing, without a message.
- In Vault mode, the context line under your message names the source: "vault-rag · 3 hits" or "Vault search unavailable".
- New setting **"Notes from vault-rag"** (0–20, default 5, 0 switches off vault hits and neighbours) and a stepper for it in the Context tab.

### Fixed
- The Context tab was not visible in Obsidian (since 0.13.0): the chat stayed below the tab and pushed the Context tab out of view. The chat is now hidden there.

## [0.15.2] — 2026-09-25

### Fixed
- `list_notes` no longer hides subfolders. Without `recursive`, the result already says in the header line how many subfolders there are and how many notes lie beneath them, and names each one in the second line — including folders without a single note. Recursively, the folders without a note that cannot show up in the paths are named. Reason: Koda took inhabited subfolders of `_Koda` for non-existent, because the flat list did not mention them at all.
- A folder that does not exist is now reported as such; an existing folder without a note is a finding rather than an error.

## [0.15.1] — 2026-09-24

### Changed
- `authorUrl` in the manifest points to the GitHub profile again (return to the Community Store); no functional change.

## [0.15.0] — 2026-09-23

### Added

- Tool use hardened against LM Studio/MLX (special assignment "Koda fix tool use", findings
  llm-setup `6f75737` + `~/Projects/verdigado/llm-configs`):
  - A tool call counts as complete only with `finish_reason: "tool_calls"`. If the head chunk
    (name present) arrives with a different `finish_reason` (e.g. `"length"`, measured 9 times
    with LM Studio), it is NOT executed but reported as truncated — the text fallback
    (`parseTextToolCall`) is exempt, since it never has `finish_reason: "tool_calls"`.
  - New long idle deadline (`TOOL_CALL_IDLE_TIMEOUT_MS`, 900 s) from the tool-call head chunk
    on: LM Studio buffers the arguments until the end of their generation without sending a
    byte in between — the normal 120 s timeout tore down healthy write calls. In this phase
    the status line shows "Writing tool call …" instead of continuing with "thinking".
  - `reasoning` echo for multi-round tool runs: the thinking of a tool-call round goes back in
    the next round of the SAME run as `reasoning`+`reasoning_content` (model: llm-benchmark-harness
    `fade3f6`). Without this echo, multi-round runs against Open WebUI/gpt-oss silently abort
    after exactly two rounds (measured 2026-09-21, `verdigado-pro`). Not persisted — only
    relevant within one `runAgent` run.
  - `max_tokens` raised from 2048 to 8192 (provisional, the sampling spec sets budgets per mode
    later) — 2048 was not enough for a `write_note` with ~9 KB of text.
  - The `mode` fields of `edit_active_note`, `write_note` and `write_skill` no longer carry an
    `enum` in the tool schema (google/gemma-4-31b with the original template fails on it with
    HTTP 400 "Unknown test: sequence"); the allowed values are still in the description, and
    the existing validation in `vault-tools.ts` remains the instance that reports a wrong value
    back to the model as a tool result.
- A truncated answer (`finish_reason: "length"`) is now evaluated instead of carried along and
  discarded: with usable text a notice under the answer (not an error), without text an error
  that names the token limit — the normal reasoning case, where the thinking uses up the budget
  before the answer. REGISTRY pattern "Truncated LLM answer as its own error class" (n=4 with
  this repo).
- Koda now reports every LLM answer to `llm-lab` if installed (consumer side, `apiVersion` 4 —
  `turnId`, `promptTemplate`, `contextPaths`): model, endpoint, messages, latency/TTFT, one
  `turnId` per user action (brackets the several LLM calls of one agent-loop pass), the stable
  rules block as `promptTemplate`, and the paths of the notes read via `read_note` as
  `contextPaths`. Fire-and-forget, never throws — if llm-lab is not installed, nothing
  happens. `src/obsidian/lab.ts` taken over from `vault-rag/src/lab_client.ts`.

### Changed

- Seven explanatory texts now come from `obsidian-kit`'s `explain-texts.ts` (v0.38.0,
  vendored individually — Koda is the first consumer of this Kit design) instead of its own
  wording; three of them become visibly more detailed as a result (EN/DE):
  - Model hint "no model list": "Endpoint does not publish a model list — type the
    name yourself." → "The endpoint returns no model list — type the name."
  - API key warning: "This endpoint has an API key — requests leave your machine." →
    "Carries an API key — the request with your messages goes to this provider, not to a
    local server."
  - Endpoint-unreachable hint: "Endpoint not reachable — the stored name is kept.
    Fetch again once it is running." → "Endpoint unreachable — the saved value is kept. Use
    "Fetch models" once it is running."
  - The "only thought" placeholder changes from a parenthetical note to a full sentence
    with two ways out: "The model only thought and gave no answer. Turn thinking off in the
    settings, or pick another model."
  - The "suppress thinking" description now names the mechanism (shared token budget)
    instead of only the result: "Sends suppress hints for the Chat call. On by default: thinking
    and answer share the same token budget, and a long thinking phase can use it up before
    the answer even starts. Turn it off only if your model produces better structured output
    after thinking."
  Two texts (CORS block, token limit before text) are unchanged verbatim — they were the Kit
  template itself (origin Koda, according to the Kit header comment). No eighth text: Koda has
  no counterpart for "model keeps thinking despite suppress" (`reasoningIgnoresSuppress`) —
  that is not a behaviour change but an existing gap, outside this assignment.
- The thinking switch in the header now shows its state through at least two channels instead
  of colour alone (UI-STANDARD §8 "state button", binding since 2026-09-16, reason: unreadable
  for the maintainer's red-green colour weakness): icon change `brain` (on/locked) ↔ `brain-cog`
  (off) — Lucide has no `brain-off`, the UI-STANDARD example for it is invented (reported to
  the umbrella repo); `aria-pressed="true|false"`; the tooltip names the action in addition to
  the state ("Thinking: on — click switches off"); the locked state (model always on) now carries
  the real HTML `disabled` attribute, not only `aria-disabled`.
- Wording of Koda's four own settings/history terms aligned (UI-STANDARD §10, no technical term
  without explanation): "Kontext & Verdichtung" → "Verlauf kürzen"/"Shorten history"
  (settings group + compaction mark), "Listen-Grenze" → "Höchstzahl aufgelisteter
  Notizen"/"Maximum listed notes" (model: vault-rag), "Max. Tool-Runden" →
  "Maximale Tool-Aufrufe pro Antwort"/"Max tool calls per answer", and the incomprehensible
  stage-2 help text (`settings.summarize.desc`) completely reworded — without "stage 2",
  "stubs" or "completed rounds". README and `docs/SMOKE.md` (evergreen section)
  updated.
- Streaming answer area now uses `obsidian-kit`'s `buildStreamArea`/`createStableWriter`
  (§8 building block) instead of the hand-rolled version. Two behaviour changes: the
  reasoning block stays open for the duration of a stream (was collapsed by default), and
  scrolling now follows the stream only while the reader is already at the bottom, instead
  of forcing the view to the end on every token.
- Kit pin bumped `0.27.0` → `0.35.0` (code-kit `0.6.0`); the local `resolveModelChoice`
  duplicate is gone, `../vendor/kit/model-choice` is now the single source.

## [0.14.0] — 2026-09-06

### Added

- Context modes **Note** and **All tabs**: the active note with its linked neighbours, or
  every open note, go along in full text, capped by a budget.
- **Manual**: notes and folders can be added to the context through two pickers (three new
  commands, three buttons in the Context tab).
- **Source chips under the answer** — which notes went along in full text, clickable.
- Settings **Content budget per message** (`contextBudgetChars`, default 20,000) and
  **Link depth in Note mode** (`contextLinkDepth`, default 1).
- `read_note` also reads `.base` and `.canvas`. Writing stays `.md`-only.

### Changed

- The Context tab now shows sections per source and a stepper for the link depth; it renders
  asynchronously, because the full-text modes read notes.

## [0.13.0] — 2026-09-05

### Added

- **A Context tab next to the chat.** Koda's sidebar now has two tabs. The Context tab shows
  what the next message will carry — the active note, your selection, the open tabs — as chips
  you can click away one by one, with a line telling you how much of the model's context window
  it fills. What you deselect stays deselected until you press "Reset selection" or start a new
  chat — that is what the setting "Keep context choices" (on by default) does; turning it off
  reverses it, so every new message starts from the full context again.

## [0.12.0] — 2026-09-05

### Added

- **`move_note` and `delete_note`.** Koda can now finish the vault's lifecycle steps
  instead of stopping one hand movement short of them — moving a log into `2-erledigt/`,
  clearing a processed inbox file. Moving uses Obsidian's own rename, so every wikilink
  pointing at the note is updated; deleting goes to the vault's configured trash rather
  than erasing, and always asks first — even inside the Koda folder, where writing is
  free. The confirmation dialog names both paths and how many notes link to the one being
  moved, because a move looks like it touches one file while it touches several.

### Changed

- **The working context no longer lists the same note twice.** A note open in two tabs (a
  split, a second window) used to appear once per tab. That told the model nothing and cost
  a slot in the tab limit, pushing a real tab out of the list; duplicates are now folded
  before the limit applies. The active note stays in the list — that it is open is part of
  the answer to "what is open".
- **"Properties in the context" now says what it does to `get_workspace`.** A value above 0
  caps the block only; the tool still returns the properties in full, the same way it does
  for the selection and the tab list. The 0 is not a cap but an opt-out and now applies
  everywhere, including `get_workspace` — only this setting can be set to 0 at all, and
  whoever picks it means "not", not "shorter".
- **The instruction warning names a single switched-off reading tool.** Until now it only
  fired when *all* reading tools were off. Switching off just `read_note` left no trace in
  the interface, while Koda kept trying `search_notes` with ever more desperate queries
  until it ran out of rounds. The warning now names the tools that are off and says what it
  costs. The model itself is still not told — switched off stays switched off.

## [0.11.0] — 2026-09-02

### Added

- **Working context, stage 1.** A user message can carry a short block naming the active
  note (with its properties and cursor line), the selection and the open tabs — pointers,
  no contents. Mode *Off* / *Workspace* per question via a dropdown next to Send, three
  commands (`Context mode: Off`, `Context mode: Workspace`, `Ask Koda about the selection`) and a right-click entry on
  selected text. The block is stored with the message and shown under it, collapsible. The
  Workspace mode is on by default after the update; set "Context mode on startup" to Off to
  opt out.
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

## [0.10.1] — 2026-09-01

### Fixed

- **"New chat" and the thinking toggle are visible again — they were unreachable since
  0.9.0.** Both sat in the view header, which Obsidian hides in *every* sidebar
  (`.workspace-split.mod-right-split .view-header { display: none }` in its own `app.css`).
  They existed in the DOM and nobody could see or click them; since "New chat" had no
  command either, discarding a conversation was impossible from the sidebar for two
  releases. They now live in a header row inside the view itself, which is what
  `UI-STANDARD.md` §4 asks for anyway — and what every neighbouring plugin already did.
- **Two new commands, `New chat` and `Toggle thinking`**, give both actions a second route
  that does not depend on how the interface is drawn. If the sidebar is closed, the command
  opens it first rather than silently doing nothing.
- **The GUI smoke check now measures size, not existence.** Check 2 was green throughout the
  outage because it counted elements; it now reads `getBoundingClientRect()` and additionally
  asserts that the view really is in a sidebar while it measures — in the main area the header
  is visible, so the broken version would have passed there too.

## [0.10.0] — 2026-09-01

### Added

- **A new "Model control" settings group lets you replace Koda's instructions and turn
  individual tools off.** The instructions textarea starts empty — empty means "the shipped
  version applies", shown greyed out as a placeholder — and a reset button restores that
  state at any time. Because only the deviation is ever saved, a later improvement to the
  shipped instructions still reaches everyone who never touched the field, and reaches no
  one who wrote their own.
- **Every tool, including the reading ones, can be switched off**, and each can be given its
  own description (again: empty means the shipped one). Turning off all four tools that look
  into the vault (`search_notes`, `read_note`, `list_notes`, `related_notes`) shows a warning
  — it names the consequence and does not block it, the same stance the write rule already
  takes. Two more checks share that warning line: no mention of tools at all, and a missing
  `{{sprache}}`/`{{ordner}}` placeholder (which would silently stop following a later
  language or folder change).
- **"Show active instructions"** opens a preview of the exact prompt the next conversation
  will start with, memory and skills included. `npm run gui:ask -- --full` shows the prompt
  that was actually sent for the last question, and marks whether it deviated from the
  shipped version.

## [0.9.0] — 2026-08-30

### Added

- **A status line in the sidebar says what Koda is doing.** Between the conversation and the
  input box, a line now shows the current activity in plain words — thinking, writing,
  searching the vault for a term, reading a note, summarising earlier turns — with a spinning
  icon while work is under way. Until now the two long silences (before the first token, and
  between tool steps) were indistinguishable from a frozen window.
- **The same line shows how much of the context window is in use** when Koda is idle, and
  turns amber once the compaction threshold is reached — so the line explains why the history
  is about to be compacted instead of just doing it. The number comes from the same estimate
  and the same threshold that trigger compaction.
- **A thinking switch in the view header.** It toggles the same setting as the one in the
  settings tab, and knows three states rather than two: with a model that cannot turn
  reasoning off (gpt-oss/harmony) it reads "always on" and stays disabled, instead of
  promising something the request will not honour.

### Fixed

- **The interface language is detected once at startup, not re-detected on every settings
  save.** The shared i18n module asks for exactly that, and the neighbouring plugins do it that
  way; Koda did not, which meant the language could change mid-session. Picking a language
  explicitly in the settings still takes effect immediately. A failed detection no longer
  silently counts as "English" either — it keeps the current language and says so in the log.
- **The system prompt takes its language from the same source as the interface.** Until now
  the two were detected independently and could disagree, so Koda might answer in a different
  language than its own buttons were labelled in.

### Changed

- **Answers are formatted while they stream in, not only when they finish.** Paragraphs that
  are complete get rendered as Markdown right away; only the paragraph still being written
  stays plain text. An unfinished code block is never split mid-fence.
- **"New chat" left the button row and became a header action with a confirmation.** It sat
  next to "Send" and was easy to hit by accident, which discarded the conversation with no way
  back. Send (now the primary button) and Stop keep their places.


## [0.8.0] — 2026-08-28

### Fixed

- **Endpoint rows no longer run past the right edge of the settings window.** Below
  roughly 1100 px of window width the row's controls overflowed their container — the
  second row worse than the first, because only it carries the "move to top" button.
  Koda's three input fields had a fixed width and did not shrink with the window. They
  now behave like every other plugin's endpoint list. Measured before and after across
  five window widths.

### Changed

- **The endpoint list is now the shared component used by the other plugins.** Same
  behaviour, one visible addition per row: a role line (active / standby / unreachable)
  and a model dropdown that is filled from the endpoint itself, so a per-endpoint model
  no longer has to be typed by hand. The global model setting stays and applies to every
  row that carries no model of its own.
- **Opening the settings now contacts your endpoints without being asked.** Each row
  fetches its model list when the tab is drawn, instead of waiting for a click. For a
  local server this is a request to your own machine. For an endpoint with an API key it
  means one request to that provider every time you open the settings — it asks for the
  model list (`/v1/models`) and sends no vault content, but it does happen unprompted.

## [0.7.1] — 2026-08-21

### Changed

- **Settings are now validated against a closed set of keys.** Loading `data.json`
  produces exactly the settings Koda knows about; anything else is dropped, and the
  next save writes the reduced file. If you hand-edited `data.json` to carry notes or
  keys of your own, they will not survive — copy them out first. No Koda setting is
  affected, and nothing is lost for a file Koda wrote itself.

### Fixed

- **A server's reason is no longer swallowed when the error body carries an empty
  field.** A body like `{"error":"","message":"model not found"}` used to show only
  "request rejected (HTTP 400)" — the empty `error` counted as a hit and hid the
  message sitting right next to it. The reason is now shown, and surrounding
  whitespace is trimmed off it.
- **A broken endpoint list in `data.json` falls back to the default instead of being
  used.** A non-list value (say a bare string) used to be passed through untouched
  and reached the endpoint resolver as if it were a list of endpoints.
- **An unknown interface language falls back to "auto".** Any string used to be
  accepted and handed to the language switch; only `auto`, `de` and `en` are now.
  Same for a non-text model name, which falls back to empty.

## [0.7.0] — 2026-08-19

### Added

- **Two-staged conversation compaction** so a long chat no longer overflows the
  model's context window: past a configurable share of the window, older tool
  results collapse into one-line stubs first, and if that alone is not enough the
  model summarizes the completed turns it just dropped. Compaction is a pure
  projection — it changes only what goes to the model, never the stored
  conversation, and your own messages are never touched. Every compaction leaves a
  visible mark in the chat.
- **New settings group "Context & compaction"** — Context window (tokens), Compact
  at (% of window), Keep tool results verbatim, Summarize with the model (stage 2),
  Summary length (% of window).
- **Context-window prefill**: "Test" on an endpoint row now fills in the context
  window from the server's own reporting (LM Studio `/api/v0/models`, Ollama
  `POST /api/show`), best-effort, when the field is still on its default.
- GUI-Smoke checkpoints 7 (compaction marks) and 8 (the new settings group).

### Changed

- **`overflow` is now its own chat-error kind**, distinct from a plain unreachable
  endpoint, so a context-window overrun is reported to the user for what it is.
- **The stored conversation is now `LogEntry[]` with compaction marks**, persisted
  in the existing JSONL session format — backward compatible with sessions written
  before this change.
- **A chat request blocked by a local server without CORS is now named for what it
  is.** When the endpoint answers the connection test but the chat request fails on
  the network twice on a freshly resolved endpoint, Koda no longer says "server off,
  wrong address" (all of which are false in that case) but points to CORS (LM
  Studio "Enable CORS" / `lms server start --cors`, Ollama `OLLAMA_ORIGINS`). The
  probe runs through Obsidian's `requestUrl` in the main process and sends no
  `Origin`; the chat streams as XHR from the renderer and always does. README
  documents the requirement.
- **The stage-2 "Summarizing earlier turns…" hint now disappears as soon as the
  summary lands** (or the next tool step / token arrives) instead of lingering until
  the run's final redraw — measured ~100 s too long in the first live compaction run.

## [0.6.0] — 2026-08-14

### Changed

- **Semantic search is no longer gated on the number of full-text hits.** `search_notes`
  used to add semantic results only when full-text returned fewer than 3 — measured on
  2026-08-13, three incidental literal hits in a 1,219-note vault (two of them archived)
  cut off the semantic path entirely, hiding a whole area folder whose notes are named
  "Ollama" and "Modell-Benchmark". The threshold counted hits instead of weighing them;
  weighing them would be retrieval, which belongs to vault-rag, so both paths now always
  run. Results stay labelled separately, and the cost is one embedding request per search.
- **Folder notes are marked as such.** A note named like the folder it sits in
  (`_Tasks/_Tasks.md`) is flagged inline and counted in the header line — it was
  previously indistinguishable from a content note, which made a list of 12 tasks read
  as 13. Structural detection, so it needs no frontmatter or vault convention.
- **Empty-folder suggestions are ordered by nearness**, not alphabetically: shared path
  segments first, then name similarity, alphabet last. A typo in a vault with many
  same-named subfolders used to suggest five *foreign* project folders.

### Fixed

- Paths and field values containing the column separator (` · `) or `=` are now quoted,
  so a list line cannot be misread as having extra columns.
- Folder lookup and suggestions normalise Unicode (NFC) before comparing — a correctly
  spelled folder with an umlaut no longer misses every note because macOS stores the
  name decomposed.
- Field values are clipped by code point, so a surrogate pair (emoji) is never cut in half.

## [0.5.0] — 2026-08-14

### Added

- **`list_notes` tool.** All notes in a vault folder — with the frontmatter fields you
  ask for — in one call, instead of opening notes one by one or inferring a list from
  prose read elsewhere. Frontmatter comes from Obsidian's `metadataCache`, so no note
  is read from disk just to list it.
  - A capped result says so in **line 1**, not as a footnote below the list: the error
    this tool exists to prevent is "incomplete, looks complete", and a warning at the
    end of a long list reproduces exactly that.
  - An empty folder is reported as an **error with suggestions**, not an empty list —
    "folder is empty" and "folder name is wrong" would otherwise look identical.
  - New setting **"List limit"** (`listNotesMaxRows`, default 150, range 20–1000) — a
    visible cap rather than a silent one, in the same spirit as the skill budget.
  - A missing `folder` argument is reported as an **error**, not silently treated as
    the vault root — `folder: ""` still means the root, but only when passed explicitly.

## [0.4.0] — 2026-08-13

### Changed

- **The round and skill-budget limits now fit real collections.** `maxRounds` can be set up
  to 50 (was 16) and `skillBudgetChars` up to 100,000 (was 20,000). Neither number ever
  protected anything: they were the settings sliders' upper ends, written when the settings
  tab was built and never justified. Against the runaway loop the round limit exists for, 50
  works as well as 16 did. In practice they cut values down in silence — a `data.json` asking
  for 25 rounds and an 80,000-character budget quietly ran on 16 and 20,000.
- The skill budget is spent **across all loaded skills together**, not per skill. A grown
  collection therefore outruns a small budget quickly, and does so quietly: whatever no longer
  fits appears in the prompt with its description only. Worth knowing when picking a value.

### Fixed

- **`not-indexed` is no longer reported as if it were temporary when it is permanent.** A note
  whose body is empty — nothing outside the frontmatter — produces no chunks and will never be
  indexed. Koda now checks the note itself and says so, instead of pointing at a wait that
  never ends. This hits Koda's own writes first: a fresh `write_skill` note is frontmatter only,
  and so is `Memory.md` before its first entry.
- An empty note is now reported as empty **conditionally** rather than as a final verdict, since
  the check approximates the indexer's rule rather than reproducing it.

## [0.3.0] — 2026-08-13

### Added

- **Semantic retrieval through Vault Retrieval's plugin API** *(optional)*. If the
  [Vault Retrieval](https://github.com/johannes-kaindl/vault-rag) plugin (0.23.0 or newer)
  is installed and has indexed your vault, Koda now uses its embedding index:
  - `search_notes` adds meaning-based matches when the literal search comes up thin —
    fewer than three hits. Above that threshold nothing changes and no embedding request is
    made, so a well-worded search costs exactly what it did before.
  - Literal and semantic hits are shown as **separate, labelled blocks**, never merged into
    one ranking. Their scores are not comparable, and a literal hit proves a wording exists
    while a semantic one does not — Koda can tell the two apart when it answers.
  - A new `related_notes` tool answers "what else is about this?" straight from the index —
    offline, no embedding endpoint required, and available on mobile. It only appears when
    an index actually exists, so it never sits unusable in the prompt.
  - When the semantic side fails — no index, endpoint unreachable, note not indexed — Koda
    says so in plain words instead of quietly returning a thinner list.

### Notes

- **Nothing to configure, and nothing to lose.** Without Vault Retrieval, Koda behaves
  exactly as it did in 0.2.1: one result list, no extra tool, no message about a capability
  you do not have. The coupling is deliberately soft — the API is looked up fresh on every
  call, checked for version *and* shape, and its absence is a normal state rather than an error.

## [0.2.1] — 2026-08-08

### Fixed

- The community store scan no longer warns about control characters in a regular expression
  (`no-control-regex`). The skill filename sanitiser now strips the C0 range by code point
  instead of by regex range. Behaviour is unchanged and pinned by tests; the local ESLint
  override that had been hiding the warning from us — but never from the store — is gone.

## [0.2.0] — 2026-08-08

### Added

- **Markdown skill system.** Notes in `<Koda folder>/Skills/` steer Koda's behaviour.
  Each carries a required `description` and an optional `enabled` flag in its frontmatter;
  all active skills go into the system prompt when a conversation starts.
- `write_skill` tool — Koda can author its own skills. Path and frontmatter are built by
  the plugin, not by the model, and the write **always** asks for approval, even inside the
  Koda folder where every other write is free: a skill changes what the tool does in future
  conversations, so location alone is not enough to grant it.
- The confirmation modal now states in plain language what will change from now on, above
  the unchanged full preview.
- A line at the top of the conversation names the skills currently in effect, plus notices
  when the budget was exceeded or a file was skipped for lacking a description.
- **Skill budget** setting (default 6000 characters) bounding how much skill text enters the
  system prompt; anything beyond it is listed by description only.

### Fixed

- Answers in the sidebar can be selected and copied — Obsidian does not make text in view
  containers selectable on its own.

## [0.1.0] — 2026-08-07

### Added

- Chat sidebar with a streaming agent loop against any OpenAI-compatible endpoint.
- Four vault tools: `search_notes`, `read_note`, `write_note`, `save_memory`.
- Write policy: free inside the Koda folder, confirmation modal with diff preview elsewhere.
- Markdown memory note the assistant maintains transparently.
- Session history persisted as append-only JSONL.
- Settings tab with multiple endpoints, per-endpoint API keys, connection test,
  model dropdown, failover and presets.
- Idle timeout for long model answers (measures silence, not total duration).
- German and English UI strings.
