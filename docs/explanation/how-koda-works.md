# How Koda works

## The agent loop

A question starts a loop. Koda sends your message, the working context and a system prompt to the model. The model either answers, or calls one of Koda's tools. Koda runs the tool against the vault, puts the result into the conversation and gives the model another turn, until it answers or reaches **Max tool calls per answer**. The limit is what stops a confused model from wandering through your vault forever; after it, Koda tells you it stopped and you can say *continue*.

## What steers Koda is readable

The system prompt is rebuilt for every conversation from three parts: Koda's rule block (replaceable under **Model control**), your memory note `<Koda folder>/Memory.md`, and the active skills in `<Koda folder>/Skills/` that fit the skill budget. All of it is plain text you can open. **Show active instructions** in the settings shows the exact result. There is no hidden state: conversations are stored as JSONL in the plugin folder and restored after a restart.

## The write rule

Koda writes freely in one place: the **Koda folder**. That is where its memory and its drafts live, so writing there cannot change anything you wrote. Everything outside asks first: a dialog shows the new text (create, append) or a line diff (replace), and only the confirming button lets it through. If you cancel, the file stays untouched and Koda is told the write was declined, so it does not pretend otherwise.

Two things ask first even inside the Koda folder. Deleting a note, because it breaks links. And writing a skill, because a skill is not a draft: it changes what Koda does from then on. That check sits in the write rule itself, not in the skill tool, so it cannot be sidestepped by writing a skill file with the ordinary write tool.

What Koda will never do: run programs or touch anything outside your vault. There is no terminal access and no background work; Koda acts only when you ask.

## Compaction: shortening without forgetting what you said

Every model has a context window, and a long conversation eventually overflows it. Before each model call, Koda estimates the conversation's size. Past **Compact at**, it shortens in two stages. First, older tool results shrink to a one-line stub that names the tool, so the model can fetch the material again. If that is not enough and **Summarize older replies** is on, the model summarizes the older completed turns.

Compaction is a projection: it changes what goes to the model, never the conversation stored and shown in the sidebar. Your own messages are never summarized, and every compaction leaves a visible mark in the chat.

## Why Koda borrows instead of building

Koda is one of several plugins by the same author, and each owns one job. Koda owns the conversation. Searching by meaning belongs to [Vault Retrieval](https://github.com/johannes-kaindl/vault-rag), so Koda asks that plugin through its interface instead of keeping a second index. If it is missing, Koda works exactly as without it: no dead tool, no setting to fill in.

Its results stay labelled apart from the literal search, never merged into one ranking. A literal hit proves a wording exists in a note; a match by meaning does not, and the scores of the two cannot be compared.

The same idea runs the other way: plugins can lend Koda their own tools. Koda keeps its own tools when names collide and supplies the confirmation dialog for writes, so a borrowed tool is held to the same rule as Koda's own.

## Why a local model

Koda talks to any OpenAI-compatible endpoint, and it is built for one running on your own machine: your notes then never leave it. Nothing in Koda needs a hosted provider. If you want one, add its URL and API key as an endpoint; then your notes go to that provider, and the settings say so next to the key field.
