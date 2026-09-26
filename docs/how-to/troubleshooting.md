# Troubleshooting

> **Diátaxis: How-to.** Task-oriented: you have a problem and want it gone.

Each entry starts with the message as Koda shows it (English interface; the German wording says the same). Find yours with your browser's search.

- [The Test button](#the-test-button)
- [In the chat](#in-the-chat)
- [In the Context tab and the context modes](#in-the-context-tab-and-the-context-modes)
- [Skills](#skills)
- [Settings and tools](#settings-and-tools)
- [Getting help](#getting-help)

## The Test button

The **Test** button on an endpoint row (**Settings → Koda → Endpoints**) checks whether the server answers, and names the cause when it does not.

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

**Fix:** Press **Test** on each row; each row then says why it did not answer.

### "The endpoint answers the connection test but not the chat request from Obsidian. A local server usually needs CORS enabled for that — …"

**Cause:** CORS. Obsidian sends the chat with its own origin (`app://obsidian.md`), which a local server rejects until CORS is switched on. The Test button cannot show this, because it takes a different route that sends no origin.

**Fix:** LM Studio: switch on **Enable CORS** in the server settings, or start it with `lms server start --cors`. Ollama: set `OLLAMA_ORIGINS`.

### "Stopped after 8 tool rounds — ask me to continue if you want more."

**Cause:** Koda may chain only so many tool calls per question, so that a confused model cannot loop through your vault forever. The number is your setting.

**Fix:** Reply *"continue"*, or raise **Max tool calls per answer** (1–50). If it happens with simple questions, the model is struggling with the tools; see [Tune Koda for a smaller model](model-control.md).

### "Context window exceeded — even after compaction. The model says: … Start a new chat, or check "Context window" in the settings (currently …)."

**Cause:** The conversation no longer fits the model. Koda compacts it before every call, but it can only estimate sizes, and it has to know the real window.

**Fix:** Set **Context window (tokens)** to what the model actually has loaded (in LM Studio, the context length you loaded it with). **Test** on an endpoint row fills this in when the server reports it and the field is still on its default. Or start a **New chat**.

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

**Fix:** If the text mentions a model, check that **Model** (or the row's model override) matches a model the server has loaded.

## In the Context tab and the context modes

### The Vault mode is greyed out with "(needs vault-rag)", or "The Vault mode needs the vault-rag plugin."

**Cause:** The Vault mode searches your vault by meaning, and that search belongs to the [Vault Retrieval](https://github.com/johannes-kaindl/vault-rag) plugin.

**Fix:** Install Vault Retrieval and let it build its index. Everything else in Koda works without it.

### "[Vault search unavailable: …]" in the context block

**Cause:** Vault Retrieval is installed, but the search failed this time. The reason follows the colon: *the vault-rag plugin is missing or disabled*, *vault-rag has no index loaded*, *vault-rag's embedding endpoint is not reachable*, *the note is not in vault-rag's index*, or *vault-rag reported an error*.

**Fix:** Let vault-rag finish indexing, start the server it embeds with, or reindex after adding notes. The question still goes out, with the active note.

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

## Skills

### "⚠ Skipped, no description in frontmatter: …"

**Cause:** Every skill needs a `description` field in its frontmatter.

**Fix:** Add one; see [Write a skill](skills.md).

### "⚙ Description only (budget exhausted): …"

**Cause:** The active skills together are longer than **Skill budget**. The named skills are only announced, not followed.

**Fix:** Raise the budget, shorten skills, or turn some off with `enabled: false`.

### "⚠ Could not be read: …"

**Cause:** The skill note could not be read.

**Fix:** Check that it is a normal Markdown note directly in `<Koda folder>/Skills/`; subfolders are not read.

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

### A tool from another plugin has no switch in the tool list

**Cause:** Other plugins can lend Koda their tools (see [Tools and commands](../reference/tools.md#tools-from-other-plugins)). In this version they do not appear under **Settings → Koda → Model control → Tools**; the list shows Koda's own tools only.

**Fix:** Disable the plugin that provides the tool. Or, with Obsidian closed, add the tool's name to the `toolsDisabled` list in `.obsidian/plugins/koda-agent/data.json`; Koda then leaves it out and tells the model it was switched off.

## Getting help

Still stuck? [Open an issue](https://github.com/johannes-kaindl/koda-agent/issues) with your Obsidian version, the Koda version (Settings → Community plugins), the server and model you use, and the message word for word.
