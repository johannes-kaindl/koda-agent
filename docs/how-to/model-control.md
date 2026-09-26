# Tune Koda for a smaller model

A small local model often handles fewer tools and more explicit instructions better. **Settings → Koda → Model control** lets you change both, and shows you exactly what the model receives.

## See the active instructions

Select **Show active instructions**. The dialog shows the exact prompt the next conversation starts with: Koda's rules, your memory note and the active skills.

## Replace the instructions

The field **Instructions for Koda** starts empty, with the shipped version greyed out as a placeholder.

1. Copy the placeholder text into the field (or write your own) and change what you need.
2. Keep the two placeholders `{{sprache}}` and `{{ordner}}`. Koda fills in your language and Koda folder on every run; without them, a later change of either setting would not reach the instructions.
3. Click outside the field to save.

**An empty field means "the shipped version applies"**, never "no instructions". As long as you leave it empty, improvements to the shipped instructions in later Koda versions reach you. The button **Restore the shipped version** (↺) empties the field again.

Below the field, a warning appears (it blocks nothing) when:

- the instructions never mention tools (*"These instructions never mention tools — Koda will answer without looking into your vault."*),
- one of the two placeholders is missing,
- every reading tool is switched off, or some of them are, in which case the warning names them.

## Switch tools off or reword them

Under **Tools**, every tool has its own switch and its own description field. A switched-off tool is left out of what is sent to the model entirely. A description you write replaces the shipped one; an empty field again means the shipped one.

Fewer tools usually means a weaker model picks the right one more often. A sensible reduced set for a small model is `search_notes`, `read_note`, `list_notes` and `write_note`. If you switch off reading tools, keep in mind that Koda is not told about it: it may keep trying the others until it runs out of tool rounds.

`related_notes` stays in the list without Vault Retrieval, greyed out with *"needs the vault-rag plugin"*, so no switch ever silently disappears.

## Other settings that help a weak model

- **Text tool-call fallback**: for models that write tool calls as JSON in their text instead of using native tool calling.
- **Suppress thinking**: saves context and time with reasoning models.
- **Max tool calls per answer**: lower it to stop a confused model sooner.
