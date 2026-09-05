# Fixture — the staging vault for the GUI smoke

`npm run smoke:gui -- --setup` builds a self-contained Obsidian vault
(`$STAGING_VAULTS_DIR/koda-agent`) from this folder. The vault is **disposable**: its
content comes entirely from here, so losing it costs nothing — the next run rebuilds it.

```
notes/      the scenery: generic English notes, no personal data
obsidian/   vault configuration: ONLY koda-agent enabled, light theme, no inline titles
```

## Why a vault of its own

Two of the checks **write settings**: check 16 sets `systemPromptOverride`, check 17 sets
`toolsDisabled`. Both save the previous value and restore it in a `finally`, but a run that
is killed hard still leaves a foreign state behind — in a working vault that state would be
the user's own configuration. On top of that, a working vault carries the *store build*
rather than the repo build, which is how four green runs elsewhere in this workspace turned
out to be unproven (see `../../../../AGENTS.md`, § Staging-Vaults).

## What the checks need from the scenery

Change the notes freely, but keep these five properties or the smoke goes red for reasons
that have nothing to do with the plugin:

- **At least two notes** — check 6 clicks a wikilink and needs a target that is not the
  currently open note.
- **At least one note with frontmatter** — check 1c measures the seam `list_notes` is built
  on (`metadataCache.getFileCache(f).frontmatter`).
- **`Koda/Memory.md` with content** and **at least one enabled skill under `Koda/Skills/`** —
  check 18 opens the composed system prompt and expects a `## Memory` and a `## Skills`
  block. An empty memory or a skill with `enabled: false` makes that block disappear.
- **No plugin other than koda-agent** in `obsidian/community-plugins.json` — check 6 was red
  once in a working vault because a foreign plugin replaced the wikilink with its own inline
  widget.
- **`Notes/Project plan.md` with `status: active` in its frontmatter and the text
  `Model control makes` at the start of line 9** — checks 20 and 23 open this note, select
  the first 13 characters of that line and read the working context; check 23 replaces the
  selection through `edit_active_note` and restores the file afterwards.
- **`Notes/Project plan.md` must link to `Notes/Tools.md` and `Notes/Compaction.md`, and
  `Notes/Tools.md` must link back to `Notes/Project plan.md`** — check 33 opens the plan note
  in mode Note and expects both linked neighbours in the block, in full text.
- **`Notes/Overview.base` must exist** — check 36 reads it through `read_note` and expects
  the string `views:` in the result. It is the only non-Markdown file in the scenery; its
  content is irrelevant beyond being valid YAML with that key.

Plugin settings are *not* part of the fixture: `buildVault` deletes `data.json`, so every run
starts from the shipped defaults — including the default endpoint `http://127.0.0.1:1234`.
That is deliberate: the smoke should measure what a fresh install does.

## Keep the scenery generic and English

Everything here can end up in a screenshot and travel with the repo: no real people,
companies, numbers or addresses — not the maintainer's either. English, because `README.md`
is the canonical language of this plugin.

The folder is `docs/images/fixture/` rather than something smoke-specific because that is the
workspace-wide place for fixture vaults (skill `readme-shots`); a later README illustration
takes this same scenery instead of adding a second one.
