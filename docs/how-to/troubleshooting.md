# Troubleshooting

> **Diátaxis: How-to.** Task-oriented: you have a problem and want it gone.

Each entry starts with the message as Koda shows it (English interface; the German wording says the same). Find yours with your browser's search.

- [The endpoint check](#the-endpoint-check)
- [In the chat](#in-the-chat)
- [In the Context tab and the context modes](#in-the-context-tab-and-the-context-modes)
- [Images](#images)
- [Skills](#skills)
- [Tasks and the Abilities tab](#tasks-and-the-abilities-tab)
- [Settings and tools](#settings-and-tools)
- [Getting help](#getting-help)

## The endpoint check

When **Settings → Koda** opens, every endpoint row is checked: a check mark means the server answers, a cross means it does not. **Hover over the cross** for the reason; the messages below are what it says. **Test** below the list checks all rows again.

### "Connection refused — server not running, or wrong port."

**Cause:** Nothing listens at that address.

**Fix:** Start the server, and compare the port: LM Studio uses `1234`, Ollama `11434`.

### "Unknown host — typo in the address?"

**Cause:** The host name does not resolve.

**Fix:** Check the spelling, or use an IP address.

### "Timed out — network unreachable (wrong network, VPN off?)."

**Cause:** The address exists but cannot be reached from here, typically a server on another machine while you are on a different network.

**Fix:** Connect to the right network. If you use Koda at home and on the road, add both addresses as rows: Koda uses the first one that answers.

### "Answers, but is not an OpenAI-compatible endpoint — wrong path or service?"

**Cause:** Something answers, but not an OpenAI-compatible API.

**Fix:** Enter the server's base address (`http://127.0.0.1:1234`), without `/v1/chat/completions`.

### "Access denied — API key missing or invalid."

**Cause:** A hosted provider, or a server with authentication, needs a key.

**Fix:** Enter it in the row's API key field.

## In the chat

### "No endpoint reachable. Check the endpoint list in the settings — the test button says which one answers."

**Cause:** None of the endpoint rows answered.

**Fix:** Open **Settings → Koda** and hover over the cross next to each endpoint row; it says why that row does not answer.

### "The LLM Endpoint Manager has no usable endpoint. Add or switch on an endpoint in the manager's settings."

**Cause:** **Take endpoints from the LLM Endpoint Manager** is on, and the manager has no switched-on endpoint that can chat.

**Fix:** Open the manager's settings (**Open manager settings** in Koda's settings), add or switch on an endpoint, or switch the setting off to use Koda's own list again.

### "The endpoint chosen in Koda's settings no longer exists in the LLM Endpoint Manager. Pick another one."

**Cause:** The endpoint you picked was removed or renamed in the manager.

**Fix:** Pick another one under **Endpoint** in Koda's settings, or choose **Automatic**.

### "The endpoint chosen in Koda's settings is switched off in the LLM Endpoint Manager. Switch it on there."

**Fix:** Switch the endpoint on in the manager's settings.

### "The chosen endpoint has no API key in the LLM Endpoint Manager. Add it in the manager's settings."

**Cause:** The key lives in the manager's key store, not in Koda. A Claude endpoint without a key cannot answer.

**Fix:** Enter the key in the manager's settings.

### "The LLM Endpoint Manager did not answer. Check that the plugin is switched on."

**Fix:** Switch the LLM Endpoint Manager plugin on, then ask again.

### "The Claude API can't be reached — check your network connection."

**Cause:** The request to the Anthropic API failed on the network, twice (the second time without streaming).

**Fix:** Check the connection and any proxy or VPN. An invalid key is a different message: "Access denied — API key missing or invalid."

### "The endpoint answers the connection test but not the chat request from Obsidian. A local server usually needs CORS enabled for that — …"

**Cause:** CORS. Obsidian sends the chat with its own origin (`app://obsidian.md`), which a local server rejects until CORS is switched on. The endpoint check in the settings cannot show this, because it takes a different route that sends no origin.

**Fix:** LM Studio: switch on **Enable CORS** in the server settings, or start it with `lms server start --cors`. Ollama: set `OLLAMA_ORIGINS`.

### "Stopped after 8 tool rounds — ask me to continue if you want more."

**Cause:** Koda may chain only so many tool calls per question, so that a confused model cannot loop through your vault forever. The number is your setting.

**Fix:** Reply *"continue"*, or raise **Max tool calls per answer** (1–50). If it happens with simple questions, the model is struggling with the tools; see [Tune Koda for a smaller model](model-control.md).

### "Context window exceeded — even after compaction. The model says: … Start a new chat, or check "Context window" in the settings (currently …)."

**Cause:** The conversation no longer fits the model. Koda compacts it before every call, but it can only estimate sizes, and it has to know the real window.

**Fix:** Set **Context window (tokens)** to what the model actually has loaded (in LM Studio, the context length you loaded it with). The endpoint check fills this in when the server reports it and the field is still on its default. Or start a **New chat**.

### "The model "…" has a context window of … tokens, but Koda is set to …. Koda may send more than the model can take."

**Cause:** The model name (a suffix like `-ctx128k`) or the endpoint says the model's context window is smaller than **Context window** in the settings. Koda sizes its compaction by the setting, so it would send more than the model accepts. The notice shows once per model and session.

**Fix:** Select **Use …** in the notice to adopt the model's value, or set **Context window** yourself. Koda never changes the setting on its own.

### "Response cut off at the token limit — the text above may be incomplete."

**Cause:** The model hit its output limit mid-answer.

**Fix:** Ask it to continue, or raise the maximum output tokens on the server.

### "The response was cut off at the token limit before any text came out — …"

**Cause:** Typical for reasoning models: the thinking used up the output budget before the answer began.

**Fix:** Raise `max_tokens` on the endpoint, switch **Suppress thinking** on, or try again.

### "The model only thought and gave no answer. Turn thinking off in the settings, or pick another model."

**Cause:** The model produced reasoning but no answer text.

**Fix:** Switch **Suppress thinking** on, or use the **Thinking** button in the sidebar's header row.

### The Thinking button says "Thinking: always on"

**Cause:** Koda recognised a model that reasons regardless of what it is told.

**Fix:** None needed. Turning thinking off will probably not have an effect; that is the model, not Koda.

### Koda answers without looking into the vault

**Cause:** The model does not support tool calling, or does not recognise Koda's tool format. Or the instructions under **Model control** were rewritten without mentioning tools; the warning *"These instructions never mention tools — …"* below the field says so.

**Fix:** Load a model with tool calling, or switch on **Text tool-call fallback** (for models that write tool calls as JSON in plain text; less reliable). Empty the instructions field to go back to the shipped version.

### "Request failed: …"

**Cause:** Any other error from the server, quoted as the server sent it.

**Fix:** If the text mentions a model, check that the endpoint row's model matches a model the server has loaded.

## In the Context tab and the context modes

### The Vault mode is greyed out with "(needs vault-rag)", or "The Vault mode needs the vault-rag plugin."

**Cause:** The Vault mode searches your vault by meaning, and that search belongs to the [Vault Retrieval](https://github.com/johannes-kaindl/vault-rag) plugin.

**Fix:** Install Vault Retrieval and let it build its index. Everything else in Koda works without it.

### "[Vault search unavailable: …]" in the context block

**Cause:** Vault Retrieval is installed, but the search failed this time. The reason follows the colon: *the vault-rag plugin is missing or disabled*, *vault-rag has no index loaded*, *vault-rag's embedding endpoint is not reachable*, *vault-rag has paused semantic search*, *the note is not in vault-rag's index*, or *vault-rag reported an error*.

**Fix:** Let vault-rag finish indexing, start the server it embeds with, resume semantic search in vault-rag if you paused it, or reindex after adding notes. In a `search_notes` result the same state reads "Die semantische Suche ist pausiert"; the full-text hits above it are complete. The question still goes out, with the active note.

### A note I added by hand does not reach Koda

**Cause:** Notes added with **+ Active note**, **+ Note…** or **+ Folder…** go along only in the full-text modes. The **Workspace** mode sends pointers, never contents.

**Fix:** Switch the dropdown next to **Send** to **Note**, **All tabs** or **Vault**.

### My deselected chips came back

**Cause:** **Reset selection** and **New chat** bring everything back, by design. If it happens after every single message, **Keep context choices** is off.

**Fix:** Switch **Keep context choices** on.

### "An empty field means the whole vault — that would add every note. Pick a folder, or cancel."

**Cause:** The folder picker refuses the vault root on purpose.

**Fix:** Pick a folder.

### "No notes in "…"."

**Cause:** The folder you picked contains no Markdown notes, subfolders included.

**Fix:** Pick another folder.

### "Could not load the context — try again or reload the note."

**Cause:** Building the preview of what goes along failed.

**Fix:** Switch to another note and back, or reopen the note. If it persists, report it with the steps that led there.

## Images

### "The model could not take the image — Koda read the text in it instead (…)."

**Cause:** The server answered a request carrying an image with an HTTP error, so the model behind it cannot take images (or not in this form). Koda replaced the image by the text Image to Markdown recognised and repeated the round.

**Fix:** Nothing is needed. To let the model see images, pick a vision model; a model name without a clear vision hint counts as "probably not", and Koda then offers text recognition first.

### "Koda kann dieses Bild nicht lesen: das Modell sieht keine Bilder und kein Texterkennungs-Plugin (image-to-markdown) ist aktiv."

**Cause:** `read_image` was called, but the model name gives no hint that it sees images and Image to Markdown is not active. (Tool results are in German; the tool appears in the list only when one of the two is possible, so this message means the situation changed during the conversation.)

**Fix:** Activate Image to Markdown, or choose a model that sees images, and start a new chat.

### "Bild zu groß: "…" hat … KB, die Grenze liegt bei … KB (Einstellung „Größtes Bild, das Koda liest“)."

**Cause:** The image is larger than **Largest image Koda reads** and no text recognition is active to fall back on.

**Fix:** Raise the setting (a local server may still refuse a very large request), shrink the image, or activate Image to Markdown, which then reads the text.

### "Bildgenerierung nicht verfügbar: das Plugin local-image-generator ist nicht (mehr) aktiv." and its siblings

**Cause:** Local Image Generator is off, or its backend is not reachable. The siblings say the same in other words: "…hat zu lange gebraucht", "…ist beschäftigt, später erneut versuchen", "…hat den Auftrag abgelehnt", "…fehlgeschlagen" — each followed by the plugin's own reason.

**Fix:** Start the plugin's backend (see its settings), wait if it says busy, then ask again. The message goes back to the model, which usually tells you.

### "vom Nutzer abgelehnt" after asking for an image

**Cause:** You answered **Cancel** in the dialog "Koda wants to generate an image". Nothing was generated.

**Fix:** Ask again, or name a folder inside the Koda folder, where Koda does not ask.

## Skills

### "⚠ Skipped, no description in frontmatter: …"

**Cause:** Every skill needs a `description` field in its frontmatter.

**Fix:** Add one; see [Write a skill](skills.md).

### "⚠ Pinned skills are over budget: … characters"

**Cause:** The skills with `pinned: true` are together longer than **Skill budget**. They load in full anyway; the number is by how many characters they exceed it.

**Fix:** Raise the budget, pin fewer skills, or shorten them.

### "⚙ … skill(s) on demand"

Not an error. These skills are not pinned: Koda sees their name and description and reads the full text with `load_skill` when a task matches. Add `pinned: true` to a skill that must always apply; see [Write a skill](skills.md).

### "⚠ Could not be read: …"

**Cause:** The skill note could not be read.

**Fix:** Check that it is a normal Markdown note directly in `<Koda folder>/Skills/`; subfolders are not read.

## Tasks and the Abilities tab

A task is a note in `<Koda folder>/Arbeiten/`; see [Work in tasks](tasks.md). A task you write by hand does not have to be right: what cannot be used is skipped, the rest applies, and the Abilities tab lists each skipped entry under the task dropdown.

### "Task “…” not found — it was renamed or deleted. Pick another or “No task”."

**Cause:** The task picked in this conversation no longer exists as a note under `<Koda folder>/Arbeiten/` (renamed, moved, deleted, or its `koda: arbeit` line is gone). It stays picked so it does not disappear without a word, but nothing of it applies.

**Fix:** Pick another task or **No task**, or restore the note.

### "Invalid entry in the task, ignored: …"

**Cause:** A value is not allowed: a skill position other than `aus`, `beschreibung` or `ganz`, a tool or plugin value other than `an` or `aus`, a context mode other than `off`, `workspace`, `note`, `tabs` or `vault`, a number outside its range (`tiefe` 1–3, `budget` 2000–200000, `nachbarn` 0–20), a list where a map belongs. The entry names the key (`skills.b`, `kontext.tiefe`). An entry such as `uebrige-skills (übrige-skills?)` means the key is spelled without the umlaut.

**Fix:** Correct that line in the task note. The rest of the task applies meanwhile.

### "The task names something that does not exist, ignored: …"

**Cause:** The task names a skill, one of Koda's tools or a plugin that is not there (`skills.old-skill`, `werkzeuge.fly`, `anbieter.some-plugin`), because it was deleted, renamed or is not installed or active.

**Fix:** Remove or correct the entry, or install the plugin.

### "A note of the task was not found: …"

**Cause:** An entry of `kontext.notizen` points to a note that does not exist, or to a folder without notes. A folder is read when you pick the task.

**Fix:** Correct the path in the task note; a folder ends with `/`.

### "A task with this name already exists." / "This name cannot be used as a file name."

**Cause:** **Save as new task …** never replaces an existing task, and the name must be usable as a file name (no `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`, `#`, `^`, `[`, `]`).

**Fix:** Choose another name, or pick the existing task and use **Save**.

### "Skill "…" ist abgeschaltet (in diesem Gespraech oder in der gewaehlten Arbeit). Verfuegbar: …"

**Cause:** The model asked for a skill with `load_skill` that is switched off in this conversation or by the picked task. Koda's tool messages are German; the list after "Verfuegbar" names the skills that are on.

**Fix:** Nothing, if you meant it. To allow the skill, switch it to **description** or **full** in the Abilities tab.

## Settings and tools

### "The endpoint returns no model list — type the name."

**Cause:** Some servers do not list their models.

**Fix:** Type the model id exactly as the server expects it.

### "Endpoint unreachable — the saved value is kept. Use "Fetch models" once it is running."

**Cause:** The model list could not be fetched. Your saved model stays.

**Fix:** Start the server and press **Fetch models** again.

### `related_notes` is greyed out with "needs the vault-rag plugin"

**Cause:** The tool exists only while Vault Retrieval is installed and has an index. It stays in the list so that a switch never silently disappears.

**Fix:** Install Vault Retrieval, or ignore it.

### The tools of another plugin are missing from the tool list

**Cause:** Other plugins can lend Koda their tools (see [Tools and commands](../reference/tools.md#tools-from-other-plugins)). Under **Settings → Koda → Model control → Tools** they appear in their own group "From the plugin …", each with a switch. A plugin that is installed but does not follow the tool contract (version 1) is not offered to Koda, and the list says why with a warning such as "its tools are not offered to Koda — it does not follow tool contract version 1 (found: —); update the plugin".

**Fix:** Update the providing plugin. A switch or description you set for a tool whose plugin is not loaded stays under "Settings for tools of plugins that are not loaded", greyed out with "plugin not loaded", so you can take it back.

## Getting help

Still stuck? [Open an issue](https://github.com/johannes-kaindl/koda-agent/issues) with your Obsidian version, the Koda version (Settings → Community plugins), the server and model you use, and the message word for word.
