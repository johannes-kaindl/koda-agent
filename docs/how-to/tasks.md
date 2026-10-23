# Work in tasks: pick skills, tools and context for one conversation

Most of the time you know before a conversation what you want done. If you want to tidy your inbox, you need the inbox skill and a few tools, and not the twenty other skills that would only give a small model more to choose from. A **task** is a named set of skills, tools and context that you pick when the conversation starts. It applies to this conversation and lies over your settings instead of changing them.

## The three layers

1. **Defaults** (permanent): the frontmatter of each skill (`enabled`, `pinned`), the switches for tools in Settings → Koda → Model control, and the context settings.
2. **A task** (a note): only what differs from the defaults. You pick it in the **Abilities** tab or with **/** in the input field.
3. **This conversation** (what you switch in the tab or with **/**): lies over the task. It is kept with the conversation, so it comes back after a restart, and **New chat** clears it.

For each skill the order is: this conversation, then the task, then the task's `übrige-skills` line, then the skill's own frontmatter. For tools and tool plugins: this conversation, then the task, then your settings.

## The Abilities tab

Open **Abilities** next to **Chat** and **Context** (or run **Koda: Show Abilities tab**).

- **Task:** the dropdown picks a task or **No task**. Picking a task clears what you switched in this conversation and applies the task freshly.
- **Skills:** each skill has three positions. **off**: Koda does not see it, not even with `load_skill`. **description**: Koda sees name and description and reads the text when a task matches (the default). **full**: the whole text is in the prompt.
- **Tools · Koda** and **Tools · Plugins:** a switch per tool of Koda and one per plugin that lends Koda tools. Switching a plugin off removes all its tools; on means "as in the settings", so a tool you switched off there stays off. A plugin that offers three tools of which one is off in the settings shows "2 of 3".
- A **dot** in front of a name marks a value that comes from this conversation. The line **Changes compared to the task: N · reset** counts them.
- Every switch applies from the next question. Nothing is sent between two questions, so several switches change the prompt once.

At the bottom the tab shows how many characters the skills on **full** take against the **Skill budget**. Going over is reported, not cut.

## Choose skills and tasks with /

Type `/` at the start of the input field or after a space: a list opens with two groups, **Skills** and **Tasks**, and narrows with every letter. **Enter** or **Tab** picks the highlighted entry, **Escape** closes the list, the arrow keys move. While the list is open, Enter does not send your message. A skill you pick goes to **full** for this conversation until you switch it back in the tab; a task is picked like in the dropdown. A path such as `https://…` or `a/b` does not open the list.

## Write a task

A task is a note in `<Koda folder>/Arbeiten/` (the folder name is German, `Arbeiten`, as the keys below). The file name without `.md` is the name of the task. A note counts as a task when its frontmatter says `koda: arbeit`.

```yaml
---
koda: arbeit
skills:
  inbox-triage: ganz        # aus | beschreibung | ganz
übrige-skills: aus          # aus | grundeinstellung (default: grundeinstellung)
werkzeuge:
  write_skill: aus          # an | aus — Koda's own tools
anbieter:
  vault-retrieval: an       # an | aus — per plugin id
kontext:
  modus: note               # off | workspace | note | tabs | vault
  tiefe: 1
  budget: 20000
  nachbarn: 5
  notizen:
    - Inbox/
base: "Bases/Inbox.base#Koda context"   # optional: a base and the view in it
---
Free text for you. It does not go to the model.
```

The keys and the values are German on purpose and are written exactly like this.

- Only differences are stored. What is missing follows your settings.
- **`übrige-skills: aus`** keeps skills you write later out of the task. Without it, every skill you did not name follows its frontmatter.
- **`kontext.notizen`** takes note paths and folders (a path ending in `/`). A folder is turned into its notes **when you pick the task**, including subfolders; the context then holds those notes like notes you added by hand.
- **`base`** names a base file and one of its views, `<path>.base#<view name>`. See [Take a base along](#take-a-base-along).
- The text under the frontmatter is for you. Instructions for the model belong in skills.
- A task you write by hand does not have to be right: an entry that does not exist (a skill you deleted, a tool that was renamed, a plugin that is not installed), a wrong value or a note that is not found is skipped, the rest applies, and the Abilities tab lists each skipped entry. A key written without umlaut (`uebrige-skills`) is named there too, with the spelling Koda expects.

## Take a base along

A task can name a base, so the rows of a view go along with the conversation without you opening the base and pressing a button each time.

1. In the base, add a view of the type **Koda context** (in the view menu, next to table and cards). Its options say how the rows are handed over: as a **table**, as **notes** (the notes behind the rows, in full text) or **both**.
2. Name the base and the view in the task: `base: "Bases/Inbox.base#Koda context"`.
3. Pick the task. Koda checks that the file and the view exist and that the view is of type **Koda context**, opens the base in a tab and takes the rows over as soon as Obsidian delivers them. A notice says so ("base … adopted from the task"), and the **Bases** section of the Context tab lists the snapshot. **New chat** with the task picked clears the old snapshot and takes the base over freshly; the tab Koda opened is closed and opened again (a tab you opened yourself stays).

If the file or the view is missing, or the view is of another type, the Abilities tab names the reason and nothing is opened. Koda never changes a base file: switch the view type in the base yourself.

## Save what you changed

**Save** (when a task is picked) writes the effective state into the task: skills and tools that differ from your defaults, the context values that differ, and the notes you added by hand as single paths (a folder you named is written as its notes). The text under the frontmatter stays. **Save as new task …** asks for a name and creates the note; it never replaces an existing one. A deselected chip in the Context tab is not saved, it applies per message.

When Koda itself writes into `<Koda folder>/Arbeiten/`, it asks first, like for skills. Saving from the tab is your action and does not ask.

## Skills as defaults in the settings

Settings → Koda → **Skills** lists every skill with the same three positions. It writes `enabled` and `pinned` into the skill's frontmatter and leaves everything else in the note alone.
