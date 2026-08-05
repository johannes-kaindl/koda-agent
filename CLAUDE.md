# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status: Greenfield (Stand 2026-08-05)

Koda ist ein **geplantes** agentisches Obsidian-Plugin („Freund/Begleiter im Vault",
Lakota) — es gibt noch keinen Code, kein Build-Setup, keine Tests. Ideen-Quelle:
`10_Pallas/00_Inbox/Koda Agent Plugin Recherche.md` (Pallas-Vault). Der Scope ist
noch **nicht entschieden** — vor jeder Implementierung gehört eine
Brainstorming-/Design-Session an den Anfang.

## Verbindlicher Rahmen

Es gilt das Dach-`AGENTS.md` (`../AGENTS.md`, wird automatisch geladen):
Kit-first (REGISTRY.md vor jeder Neuentwicklung prüfen), `UI-STANDARD.md` vor
UI-Arbeit, eigenständiges Git-Repo mit eigenem Release-Takt (PROF-OBS-09),
Release-Infra über Skill `plugin-release-setup`, Test-Setup über Skill
`obsidian-plugin-test-pattern` (vitest + Obsidian-Mock aus `obsidian-kit/testing`).

## Scope-Frage (offen)

Die Recherche-Notiz mischt drei Ausbaustufen, die getrennt gehören:

1. **Vault-Agent-Plugin** — Chat-Sidebar + Obsidian-API als Tools + Session-Memory.
   Das ist Plugin-Territorium und der plausible MVP.
2. **Multi-Channel-Gateway** (Telegram, STT-Kanäle) — das ist das Territorium von
   OpenClaw (läuft bereits lokal beim User, siehe Skill `openclaw`). Nicht neu
   bauen; das Plugin kann später ein Kanal/Consumer davon werden.
3. **„Jarvis"** (STT/TTS, Docker-Container, Full System Access) — separates
   System-Projekt, kein Plugin-Scope. Full System Access / Terminal-Ausführung
   wäre zudem ein Community-Store-Review-Problem.

## Wiederverwendung (Kit-first-Anker aus REGISTRY.md)

Die gesamte LLM-Klempnerei existiert im Ökosystem bereits — **nicht neu bauen**:

- **SSE/Streaming/Reasoning/Capabilities:** `obsidian-kit/pure` (`parseSSE`,
  `ThinkSplitter`, `reasoning.ts`, `capabilities.ts`, `model-context.ts`);
  Transport (XHR statt fetch): `vault-rag/src/sse.ts`
- **Kompletter Chat-Client:** `kuro-gamification/src/llm/KuroChatClient.ts`
  (n=4, Kit-Extraktion steht an — Koda wäre der 5. Consumer und damit Anlass,
  die Extraktion zu ziehen statt zu kopieren)
- **Endpoint-Handling:** Kit `endpoint_config` (@0.23.0, API-Key je Endpunkt) +
  `classifyEndpointStatus`/`ENDPOINT_PRESETS`; Settings-Zeilen-Editor nach
  Vorlage `vault-crews` (n=3, guter Schnitt)
- **Vault-Tools mit Pfad-Guard (security-reviewed):** `vault-rag/src/mcp/`
  (`resolveNotePath`, `vault_read_guard`) — direkte Basis für Agent-Tools
- **Tolerantes JSON aus LLM-Antworten** (relevant für Tool-Calls):
  `obsidian-transmute/src/core/llm/response.ts`
- **Session-Persistenz:** Append-only-JSONL `vim-dojo/src/storage/traceStore.ts`;
  Chat-Gedächtnis-Muster `kuro-gamification/src/llm/kuroNotes.ts`; Verlauf mit
  Rückwahl (n=2, image-to-markdown/transmute)
- **UI-Bausteine:** Hub-/Sidebar-View (Regel-der-Drei erreicht), deklarative
  Settings mit `display()`-Fallback (n=4), `confirm.ts`/`FolderSuggest`/
  `collapsibleSection` im Kit, i18n via `defineStrings`/`t`/`pickLang`

**Genuin neu zu bauen ist nur der Agent-Kern:** Tool-Calling-Loop,
Markdown-Skill-Loader, Heartbeat-Scheduler (opt-in!), Compaction.

## Commands

Noch keine — Build-/Lint-/Test-Setup entsteht mit dem Scaffold
(esbuild + vitest nach Ökosystem-Standard, Gate-Konvention der Nachbar-Repos).
