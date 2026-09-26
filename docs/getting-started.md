# Getting started

This walks you from nothing to a first conversation in which Koda looks something up in your vault and writes a note, with your approval. It takes about ten minutes, most of it downloading a model.

You need Obsidian 1.8.7 or newer (desktop or mobile) and a machine that can run a local language model. A hosted OpenAI-compatible provider works too; then skip step 2 and use its URL and API key in step 3.

## 1. Install Koda

1. Open **Settings → Community plugins → Browse**.
2. Search for **Koda** and select **Install**, then **Enable**.

Other ways to install (AnySource Sideloader, by hand) are in the [README](../README.md#install).

## 2. Start a local model server

Koda talks to any OpenAI-compatible chat endpoint. The example uses [LM Studio](https://lmstudio.ai); Ollama works the same way.

1. In LM Studio, download and load a model that supports **tool calling**. Koda's practice tests run against `qwen/qwen3.8-27b`; smaller models work, but pick their tools less reliably.
2. Switch on **Enable CORS** in LM Studio's server settings and start the server. It listens on `http://127.0.0.1:1234` by default.

**Do not skip CORS.** Obsidian sends every chat request with its own origin, and a local server rejects that until CORS is on. The connection test in the next step passes either way, because it takes a different route — so a green test is no proof. From the terminal: `lms server start --cors`. For Ollama, set `OLLAMA_ORIGINS`.

## 3. Point Koda at the server

1. Open **Settings → Koda**.
2. Under **Endpoints**, the first row already reads `http://127.0.0.1:1234`. Press **Test** on that row. It should say **Connected**. If it says something else, the message names the cause; see [Troubleshooting](how-to/troubleshooting.md#the-test-button).
3. Under **Model**, press **Fetch models** and pick the model you loaded. (If the server returns no list, type the model id as LM Studio shows it.)
4. Leave **Koda folder** on `Koda` for now. This is the one folder Koda may write to without asking.

## 4. Ask the first question

1. Open a note you know something about.
2. Open Koda: select the **dog icon** in the ribbon (tooltip **Open Koda**), or run **Koda: Open Koda** from the command palette. The sidebar opens with a **Chat** and a **Context** tab.
3. Type a question about your vault, for example *"Which notes mention the project plan?"*, and press **Send**.

While Koda works, the status line above the input says what it is doing, e.g. *Searching the vault for "project plan"…* or *Reading Notes/Project plan.md…*. Each tool call also appears in the chat as a step, so you can see which notes the answer is built on. The answer streams in; **Stop** ends it and keeps what has arrived.

Under your message, a collapsible line **Context: …** shows what went along with the question. By default that is the **Workspace** context: which note is open, what is selected, which tabs exist, as pointers only. The dropdown next to **Send** changes that per question; [Choose what goes along with a question](how-to/working-context.md) explains the modes.

## 5. Let Koda write something

1. Ask: *"Write a short summary of that note to Summaries/Project plan.md."*
2. Because `Summaries/` is outside the Koda folder, a dialog opens first: **Koda wants to create: Summaries/Project plan.md**, with the text it is about to write.
3. Select **Write** to let it through, or **Cancel**. After **Cancel**, the file is not touched, and Koda is told that you declined.

Inside the Koda folder, Koda writes and moves notes without asking. Two things always ask first, wherever they happen: deleting a note (it goes to the vault's trash) and writing a skill.

## 6. Let Koda remember something

Ask: *"Remember that I prefer short answers."* Koda appends a dated line to `Koda/Memory.md` and reads that note back at the start of every question. It is an ordinary note: open it, edit it, delete lines you do not want Koda to know.

## Where to go next

- [Write a skill](how-to/skills.md): standing instructions as a Markdown note.
- [Choose what goes along with a question](how-to/working-context.md): whole notes, linked neighbours, open tabs.
- [Settings reference](reference/settings.md): every setting with its default.
- **New chat** in the header row of the sidebar starts over (after a confirmation; discarding is final).
