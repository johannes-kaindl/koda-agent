# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

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
