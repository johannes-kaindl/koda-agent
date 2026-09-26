# Settings

All settings are under **Settings → Koda**, in this order. Numbers outside the range are clamped to it when saved.

## General

| Setting | Default | Range | What it does |
|---|---|---|---|
| Endpoints | `http://127.0.0.1:1234` | | OpenAI-compatible servers, each with URL, optional API key and optional model override. **The first reachable entry wins**: Koda tries them top to bottom once per session and remembers the winner; if a request fails, it looks again once. Reorder with **Move to top**. **Test** checks a row and names the cause when it does not answer. |
| Model | *(empty)* | | Model id sent to the endpoint, unless the row has its own override. **Fetch models** fills a list to pick from. |
| Suppress thinking | on | | Asks reasoning models not to think out loud, and hides the thinking block. |
| Koda folder | `Koda` | | The folder Koda writes to without asking (memory, drafts). Skills in its `Skills/` subfolder still ask. |
| Max tool calls per answer | 8 | 1–50 | How many tool calls Koda may chain for one question before it has to answer. |
| Response timeout (seconds) | 300 | 30–900 | How long Koda waits for the endpoint to say anything. The clock restarts with every piece received, so only silence runs into it, not a long answer. Raise it for models that load on demand. |
| Skill budget | 6000 characters | 1000–100000 | How much skill text goes into the system prompt. Skills beyond it are named with their description only. |
| Maximum listed notes | 150 | 20–1000 | How many notes (and folders) `list_notes` returns at most. A capped result says so in its first line. |

## Shorten history

Long conversations are compacted before they overflow the model. Compaction changes only what is sent, never the conversation you see, and your own messages are never summarized. Each compaction leaves a mark in the chat.

| Setting | Default | Range | What it does |
|---|---|---|---|
| Context window (tokens) | 8192 | 2048–1000000 | The model's context window, one number for all endpoints. **Test** on an endpoint row fills it in when the server reports it and the field is still on its default. |
| Compact at (% of window) | 75 | 40–95 | Koda compacts before a model call once the estimate (characters ÷ 4) exceeds this share. |
| Keep tool results verbatim | 3 | 0–20 | How many recent tool results stay in full; older ones shrink to a one-line stub. |
| Summarize older replies | on | | If shortening is not enough, the model summarizes older replies (an extra model call). |
| Summary length (% of window) | 10 | 3–30 | Upper bound for that summary. |

## Working context

See [Choose what goes along with a question](../how-to/working-context.md).

| Setting | Default | Range | What it does |
|---|---|---|---|
| Context mode on startup | Workspace | Off, Workspace, Note, All tabs, Vault | The mode Koda starts with; the dropdown next to **Send** changes it per question. Vault falls back to Workspace without Vault Retrieval. |
| Selection in the context (characters) | 600 | 100–5000 | How much of a selection is quoted in the Workspace block. `get_workspace` returns all of it. |
| Open tabs in the context | 12 | 1–100 | How many open tabs are listed by path; the rest is counted. |
| Properties in the context (characters) | 300 | 0–2000 | How much of the active note's frontmatter goes along. 0 leaves it out everywhere, including `get_workspace`. |
| Content budget per message (characters) | 20000 | 2000–200000 | How much note text the modes Note, All tabs and Vault (and notes added by hand) may send per message. Short notes go along complete; cuts are announced. With many small notes, headers and cut notices can add up to about 50 % on top. |
| Link depth in the Note mode | 1 | 1–3 | How many levels of links and backlinks the Note mode follows. |
| Notes from vault-rag | 5 | 0–20 | How many notes Vault Retrieval contributes in the Vault and Note modes. 0 turns that off. |
| Keep context choices | on | | Whether what you deselect or add in the Context tab lasts beyond the next message. |

## Model control

See [Tune Koda for a smaller model](../how-to/model-control.md).

| Setting | Default | What it does |
|---|---|---|
| Instructions for Koda | *(empty = shipped version)* | Replaces Koda's rule block. **Restore the shipped version** empties it, **Show active instructions** shows the full prompt. |
| Tools | all on | A switch and a description field for each of Koda's own tools. |

## Other

| Setting | Default | What it does |
|---|---|---|
| Text tool-call fallback | off | Accepts JSON tool calls written in plain text, for models without native tool calling. |
| Language | Auto | Interface and prompt language: follows Obsidian, or Deutsch / English. |
| Open sidebar on startup | off | Koda never opens itself without this. |

Not in the settings tab: which sections of the Context tab are collapsed (remembered automatically), and `toolsDisabled` / `toolDescriptions` for tools from other plugins, which only exist in `data.json` (see [Troubleshooting](../how-to/troubleshooting.md#a-tool-from-another-plugin-has-no-switch-in-the-tool-list)).
