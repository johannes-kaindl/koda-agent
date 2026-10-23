# Choose what goes along with a question

Every question can carry what you are working on, so you do not have to paste it. This page shows how to pick how much, and how to check what actually went out.

## Pick a mode

The dropdown next to **Send** sets the mode for the next question. The same choice is in the command palette as **Koda: Context mode: Off / Workspace / Note / All tabs / Vault**, and in the Context tab.

| Mode | What goes along |
|---|---|
| **Off** | Nothing. |
| **Workspace** | Pointers only: the active note with its properties, the selection, the cursor line, the open tabs. No note contents. Koda can fetch more with its `get_workspace` and `read_note` tools. |
| **Note** | The active note in full text, plus the notes it links to and the notes linking to it. With Vault Retrieval installed, notes similar to the active one join them. |
| **All tabs** | Every open note, in full text. |
| **Vault** | The notes that best match the question you are sending, found by meaning, in full text, next to the active note. Needs the [Vault Retrieval](https://github.com/johannes-kaindl/vault-rag) plugin. |

The mode Koda starts with after Obsidian starts is the setting **Context mode on startup** (default **Workspace**).

To ask about a passage directly: select it, right-click, and choose **Ask Koda** (or run **Koda: Ask Koda about the selection**). The sidebar opens with the cursor in the input field; if the mode was **Off**, it switches to **Workspace**, so the selection goes along.

## Take rows from a base along

A base is a table of your notes with filters and properties. Koda can take over what a base shows right now:

1. Open the base and pick (or add) a view of the type **Koda context**. Its option **Hand over as** chooses **Table**, **Notes** (the notes behind the rows, in full text) or **Table and notes**.
2. Press **Use as context** at the top of the view. Koda stores a snapshot with the time it was taken: later changes to the vault do not alter it, press the button again to refresh it.
3. The table goes along in every mode except **Off**; the notes only in the modes that send full text (**Note**, **All tabs**, **Vault**). Tables and notes share the context budget. A table that does not fit is cut by whole rows and says how many it shows.

The **Bases** section of the Context tab lists the snapshots, one per view; the **×** removes one. A task can take a base along on its own, see [Work in tasks](tasks.md#take-a-base-along). An embedded base gets no data from Obsidian: open the `.base` file itself.

## Check what goes along: the Context tab

Open the **Context** tab at the top of the sidebar (or run **Koda: Show Context tab**). It shows the next question's context as chips, grouped in collapsible sections, with a summary line saying how much of the model's context window it fills.

- Click a chip's **×** to leave it out of the next message. Click it again to put it back.
- Click a chip's name to open the note.
- **Reset selection** brings back everything you left out and clears what you added by hand. Starting a **New chat** does the same.

Whether a deselection lasts beyond the next message is the setting **Keep context choices** (default on). Off means every message starts from the full context again.

In the **Vault** mode, the tab previews the matching notes while you type, so you see what will go along before you send.

## Add notes and folders by hand

The buttons **+ Active note**, **+ Note…** and **+ Folder…** in the Context tab (and the commands **Koda: Context: add the active note / add a note… / add a folder…**) add notes to the context, in the section **Manual**. A folder is added as its notes at that moment, including subfolders; notes created later are not picked up. The **×** on a manual chip removes it.

Notes added by hand go along in the full-text modes (**Note**, **All tabs**, **Vault**). The **Workspace** mode only sends pointers.

## Control the size

Full text is capped by **Content budget per message** (default 20,000 characters). The budget is shared out so that short notes go along complete and only the long ones are cut. Nothing is dropped silently: a cut names how much was left out, and Koda can fetch the full text with `read_note`.

In the **Note** mode, **Link depth** (1–3, in the Context tab and in the settings) decides how many levels of links are followed. The slider in the tab changes it for the current conversation only (a task can set it, and **New chat** without a task keeps it); the settings hold the default. Every level multiplies the notes and splits the budget further, so raise it for a small cluster of notes, not for a hub note.

**Notes from vault-rag** (0–20, default 5) decides how many notes Vault Retrieval contributes in the **Vault** and **Note** modes; 0 turns that off. Like the depth, its slider in the tab is for the current conversation.

Context, skills and tools for a recurring job can be saved as a task; see [Work in tasks](tasks.md).

## See what went out

Under each of your messages, a collapsible **Context: …** line shows what went along, also after a restart. Under Koda's answer, **Sources:** lists the notes that went along in full text; click one to open it.
