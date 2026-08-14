# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

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
