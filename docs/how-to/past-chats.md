# Keep and reopen conversations

Koda can file every conversation in your vault and open it again later. It is **off by default**: a conversation you discard with *New chat* is then gone.

## Turn it on

1. **Settings → Koda → Past chats.**
2. Set **Keep** above 0 (the number of conversations to keep, 1–500). Optionally change **Folder** (default `Koda/Chats`).

From now on the clock icon next to *New chat* appears under the input.

## What happens

- **Each answer files the conversation** as it ends, also a stopped one or an error. The conversation is one `.json` file in the folder; it holds your questions, the answers, the thinking and the task and overlay that belonged to it.
- **New chat** files the conversation, clears the window and says *Conversation saved to past chats*, without asking. If the file cannot be written, it asks first.
- **Open past chats…** (the clock icon, or the command) lists the conversations by title, newest first. Type to search. **Enter** opens one, **Shift+Enter** saves it as a note (a copy in Markdown, never read back), **Alt+Enter** deletes it. Deleting is final; there is no trash.
- An opened conversation continues in its own file. The one you had open is filed first.
- Lowering **Keep** deletes the oldest conversations above the number at the next save, without asking. **0** turns the history off and never deletes anything.

## Good to know

- The files are ordinary files in your vault, so Obsidian Sync and git see them. Whether Sync carries `.json` files is not measured.
- Older versions appended discarded conversations to `.obsidian/plugins/koda-agent/sessions/archive.jsonl`. That file is not written any more and is not imported (it has no separators); delete it if you do not need it.
- Koda's memory and skills are not part of a conversation file; they stay notes.
