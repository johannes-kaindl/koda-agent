# Tune Koda for a smaller model

A small local model often handles fewer tools and more explicit instructions better. **Settings → Koda → Model control** lets you change both, and shows you exactly what the model receives.

## See the active instructions

Select **Show active instructions**. The dialog shows the exact prompt the next conversation starts with: Koda's rules, your memory note and the active skills. **Copy** in the dialog puts that whole text on the clipboard, for example to file it away before you change anything.

## Replace the instructions

The field **Instructions for Koda** starts empty, with the shipped version greyed out as a placeholder.

1. Press **Edit the shipped version**: the shipped text goes into the field and you change what you need. (The button works only while the field is empty, so it never overwrites your own text. The copy button next to the field copies the instructions that apply, so you can keep your version before you overwrite it.) You can also write your own from scratch.
2. Keep the two placeholders `{{sprache}}` and `{{ordner}}`. Koda fills in your language and Koda folder on every run; without them, a later change of either setting would not reach the instructions.
3. Click outside the field to save.

**An empty field means "the shipped version applies"**, never "no instructions". If you load the shipped text and change nothing, or type it back unchanged, the field still counts as empty. As long as you leave it empty, improvements to the shipped instructions in later Koda versions reach you. The button **Restore the shipped version** (↺) empties the field again.

Below the field, a warning appears (it blocks nothing) when:

- the instructions never mention tools (*"These instructions never mention tools — Koda will answer without looking into your vault."*),
- one of the two placeholders is missing,
- every reading tool is switched off, or some of them are, in which case the warning names them.

## Switch tools off or reword them

Under **Tools**, every tool has its own switch and its own description field. A switched-off tool is left out of what is sent to the model entirely. A description you write replaces the shipped one; an empty field again means the shipped one.

Fewer tools usually means a weaker model picks the right one more often. A sensible reduced set for a small model is `search_notes`, `read_note`, `list_notes` and `write_note`. If you switch off reading tools, keep in mind that Koda is not told about it: it may keep trying the others until it runs out of tool rounds.

`related_notes` is not Koda's own tool: Vault Retrieval offers it, and it appears in that plugin's group with its own switch. Without Vault Retrieval there is no such tool; a switch you set earlier stays under *"Settings for tools of plugins that are not loaded"*, so it never silently disappears.

## Other settings that help a weak model

- **Text tool-call fallback**: for models that write tool calls as JSON in their text instead of using native tool calling.
- **Suppress thinking**: saves context and time with reasoning models.
- **Max tool calls per answer**: lower it to stop a confused model sooner.
