# Capture contract — README images

This folder holds the images that `README.md` and `README.de.md` embed. This file is the contract for them: which images exist, what each must show, which class it has, and how to reproduce it. `readme_lint.py` (workspace tool, `npm run shots:check`) matches contract ↔ files ↔ README embeds in every direction.

## Images

| File | Class | Referenced by | Must show |
|---|---|---|---|
| `hero.png` | hero | README.md, README.de.md | A note open on the left, Koda's sidebar on the right: a question, the context line, three tool steps (`search_notes`, `read_note` twice) and a streamed answer with wikilinks |
| `confirm-write.png` | feature | README.md, README.de.md | The confirmation dialog for a write outside the Koda folder: action and path in the title, the full text, **Cancel** / **Write** |
| `context-tab.png` | feature | README.md, README.de.md | The Context tab in mode Note: mode dropdown, usage summary, link depth, the active note plus its linked notes as chips, the Manual section with its three add buttons |
| `settings.png` | detail | README.md, README.de.md | Settings → Koda, top: an endpoint row checked (green mark, **Active**), **+ LM Studio** / **+ Ollama** / **Test**, the model field, the first general settings |

Captured at 1200 px, device pixel ratio 2, English interface. The sidebar images are embedded at their real on-screen width (not stretched to the class width).

## What is real and what is scripted

The model's **words are scripted**: `scripts/shots.ts` starts a stub endpoint (OpenAI-compatible, streaming) that answers each scene with a fixed sequence of tool calls and then a fixed text. Everything else is Koda itself: it runs the tool calls against the staging vault for real, renders its own tool steps, context line and status, and opens its real confirmation dialog. A real model would word the answer differently; the interface would be the same.

## Reproduce

Images are captured in a **second Obsidian instance** on its own port (profile, `.asar`, Restricted Mode and vault entry as in the umbrella `AGENTS.md`, § Staging-Vaults), never in the regular instance. The interface must be English (`obsidian.json` `language` and `localStorage.language` set to `en`, then restart); the driver checks this.

```bash
npm run build && npm run shots -- --setup        # staging vault from docs/images/fixture/ (deploys main.js)
# start the second instance on e.g. port 9329 with that vault, take the CDP lock for the port
npm run shots -- --port 9329 --vault koda-agent  # all images
npm run shots -- --port 9329 --vault koda-agent --only hero.png
npm run shots:check                              # contract, files, embeds, budgets
```

The scenery is `docs/images/fixture/` (shared with the GUI smoke; its `README.md` lists what the smoke needs from it). The `Garden/` notes exist for these images.

## Status

**2026-09-26: all four images captured** (Obsidian 1.14.2, second instance, Koda 0.17.0 + docs commit). Every image was looked at, not just measured.

Findings from the capture, kept here because they will bite again:

- **`newChat()` does nothing while Koda is busy.** A confirmation dialog left open by the previous scene keeps the run alive, and the next scene showed the old conversation and the dialog. The driver now cancels dialogs by their **Cancel** button (the close ✕ via `click()` left Koda's dialog standing), calls `stopRun()` and waits for idle before every scene.
- **The sidebar width applies one layout pass late.** The first image took the narrow default sidebar; the driver now waits until the width has arrived.
- **The endpoint row is checked automatically; Test sits below the list.** The first draft of the user docs said "press Test on the row"; the capture showed otherwise, and the docs were corrected (reason in the tooltip of the status icon).
