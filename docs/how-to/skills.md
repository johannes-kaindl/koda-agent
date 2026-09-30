# Write a skill

A skill is a standing instruction: a Markdown note that Koda knows at the start of every conversation (by name and description, or in full if pinned). Use it for rules that should keep applying ("always answer in bullet points", "our tasks live in `Projects/_Tasks`"). For single facts, Koda's memory is the better place.

## Write one yourself

1. Create a note in `<Koda folder>/Skills/`, e.g. `Koda/Skills/Short answers.md`. The file name (without `.md`) is the skill's name.
2. Give it a `description` in the frontmatter, one sentence saying what changes. It is required: a skill without it is skipped.
3. Write the instruction as the body.

```markdown
---
description: Answers stay under five sentences
enabled: true
pinned: true
---

Keep every answer under five sentences unless I ask for detail.
```

4. Start a **New chat**. Skills are read when a conversation begins.

At the top of the new conversation, a line **⚙ Skills active: …** names the pinned skills, which are in effect in full. `pinned: true` is optional; see below.

## Let Koda write one

Tell Koda a rule and ask it to keep it, e.g. *"From now on, always link the notes you mention. Make that a skill."* Koda uses its `write_skill` tool, and a dialog shows the skill with **From now on:** and its description before anything is written.

Writing a skill **always asks first**, even though skills live in the Koda folder where Koda otherwise writes freely. A skill is not a draft; it changes what Koda does from then on.

## Turn a skill off

Set `enabled: false` in its frontmatter. The note stays, Koda ignores it. Deleting the note works too.

## Pin a skill, load the rest on demand

By default a skill appears in the system prompt with its name and description only (the chat says **⚙ N skill(s) on demand**). When a task matches, Koda reads the full text itself with its `load_skill` tool. That keeps the prompt short with many skills.

A skill Koda should always follow, for example a start routine, gets `pinned: true` in its frontmatter. Pinned skills always load in full. **Skill budget** (default 6000 characters) is the upper limit for them together: if they exceed it, they load anyway and the chat says **⚠ Pinned skills are over budget: N characters**. Raise the budget or pin fewer skills.

When Koda rewrites a skill with `write_skill`, the pin stays.

Only notes directly in `Skills/` count; subfolders are not read.
