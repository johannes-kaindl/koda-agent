# Tools and commands

## Koda's tools

The model decides which tool to call while it answers; every call appears as a step in the chat. Each tool can be switched off or reworded under **Settings → Koda → Model control → Tools** (see [Tune Koda for a smaller model](../how-to/model-control.md)).

"Asks first" means a dialog shows the change and nothing happens until you select the confirming button. The **Koda folder** (setting, default `Koda`) is where Koda may write without asking.

| Tool | What it does | Asks first |
|---|---|---|
| `search_notes` | Searches note text for a term (case-insensitive), 10 results by default. With Vault Retrieval installed, it also returns matches by meaning, as a separate, labelled block: a literal hit proves a wording exists, a semantic one does not. | never |
| `read_note` | Reads one note in full: `.md`, `.base` (a Bases view, YAML) or `.canvas` (JSON). | never |
| `list_notes` | Lists the notes in a folder, optionally recursive, with the frontmatter fields asked for. A flat listing also names the subfolders with their note counts, empty folders included. With `depth` 2 or 3 it shows the folder tree instead. A note named like its folder is marked as the folder note. Capped by **Maximum listed notes**; a capped list says so in its first line. | never |
| `get_workspace` | What you are looking at: the active note with its properties, the full selection, the lines around the cursor, every open tab. | never |
| `related_notes` | Notes similar to a given note, from Vault Retrieval's index. Only present while Vault Retrieval is installed and has an index. | never |
| `write_note` | Creates, appends to or replaces a Markdown note. Replacing shows a line diff. | outside the Koda folder |
| `edit_active_note` | Replaces the selection in the note you are working in, or inserts at the cursor. Fails if another note became active or the selection changed since the preview. | always |
| `move_note` | Moves or renames a note; Obsidian updates the links pointing to it. Never overwrites. The dialog names both paths and how many notes link there. | outside the Koda folder |
| `delete_note` | Moves a note to the vault's trash (as configured in Obsidian). The dialog warns how many links will break. | always |
| `save_memory` | Appends a dated line to `<Koda folder>/Memory.md`, which goes into every conversation. | never (Koda folder) |
| `write_skill` | Creates or replaces a skill in `<Koda folder>/Skills/`. | always |

Only `.md` notes are written; `.base` and `.canvas` are read-only for Koda.

## Tools from other plugins

Other Obsidian plugins can offer Koda their tools. Koda looks for them each time it sends a question and adds them next to its own. A plugin tool with the same name as one of Koda's own never replaces it, with one exception: if Vault Retrieval offers `related_notes` itself, its version takes the place of Koda's built-in one. When a plugin tool wants to write, it asks through Koda's dialog **Koda wants to write through another plugin**, which names the affected paths. Whether and when it asks is up to the providing plugin; Koda only supplies the dialog.

Tools from other plugins do not appear in the tool list of the settings in this version. To turn one off, disable the plugin that provides it, or see [Troubleshooting](../how-to/troubleshooting.md#a-tool-from-another-plugin-has-no-switch-in-the-tool-list).

## Commands

All commands appear in the command palette with the prefix **Koda:**. None has a default hotkey; assign one under **Settings → Hotkeys**.

| Command | What it does |
|---|---|
| Open Koda | Opens the sidebar (also the dog icon in the ribbon). |
| New chat | Discards the conversation after a confirmation and starts a new one. |
| Toggle thinking | Shows or hides the model's reasoning, like the **Thinking** button in the header row. |
| Context mode: Off / Workspace / Note / All tabs / Vault | Sets the context mode for the next question. Vault needs Vault Retrieval. |
| Ask Koda about the selection | Opens the sidebar with the cursor in the input; switches the mode from Off to Workspace so the selection goes along. Also in the editor's right-click menu as **Ask Koda**, when text is selected. |
| Show Chat tab / Show Context tab | Switches the sidebar tab. |
| Context: add the active note / add a note… / add a folder… | Adds notes to the context by hand (see [Choose what goes along with a question](../how-to/working-context.md)). |
