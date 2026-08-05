# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status: MVP implementiert (feat/mvp, Stand 2026-08-06)

Koda ist ein agentisches Obsidian-Plugin („Freund/Begleiter im Vault", Lakota) —
Chat-Sidebar + Vault-Tools + Markdown-Memory. Der MVP-Kern steht: Agent-Loop, vier
Tools (`search_notes`/`read_note`/`write_note`/`save_memory`), Schreibregel mit
Bestätigungs-Modal, Memory-Notiz, Sessions als JSONL, Settings-Tab, i18n DE/EN. Gate
ist grün (Lint/Typecheck/Tests/`check:pure`/Build), `main.js` baut. Details zu
Nutzung/Setup: `README.md`; Smoke-Checkliste vor jedem Release: `docs/SMOKE.md`.
Spezifiziert in `docs/superpowers/specs/2026-08-05-koda-agent-mvp-design.md` — dort
stehen die Entscheidungen (Community-Store ab Commit 1, Schreibmodell „Koda-Ordner
frei, Rest bestätigt", Agent-Kern im Plugin, Roadmap-Stufen). Ideen-Quelle:
`10_Pallas/00_Inbox/Koda Agent Plugin Recherche.md` (Pallas-Vault).

## Nächster Schritt (geseedet 2026-08-06)

QoL-Ausbau — Verbindungstest je Endpoint, Modell-Dropdown, Failover, Presets.
Vollständiger Seed mit Registry-Ankern und offenen Design-Punkten:
`docs/NEXT-SESSION.md`. Parallel offen: GUI-Smoke durch Jay (Handover-Note im
Pallas-Cockpit), danach REGISTRY-Einträge im Dach, `gui-smoke-setup`,
`plugin-release-setup`.

## Verbindlicher Rahmen

Es gilt das Dach-`AGENTS.md` (`../AGENTS.md`, wird automatisch geladen):
Kit-first (REGISTRY.md vor jeder Neuentwicklung prüfen), `UI-STANDARD.md` vor
UI-Arbeit, eigenständiges Git-Repo mit eigenem Release-Takt (PROF-OBS-09),
Release-Infra über Skill `plugin-release-setup`, Test-Setup über Skill
`obsidian-plugin-test-pattern` (vitest + Obsidian-Mock aus `obsidian-kit/testing`).

## Scope-Entscheidung (2026-08-05, Details in der Spec)

1. **Stufe 1 (MVP, implementiert):** Vault-Q&A mit Aktion — Chat-Sidebar, vier Tools
   (`search_notes`/`read_note`/`write_note`/`save_memory`), Memory-Notiz,
   Sessions als JSONL.
2. **Stufe 2:** Markdown-Skill-System (inkl. Selbst-Autorschaft mit
   Bestätigung), Compaction, Aufräum-Assistent.
3. **Stufe 3:** Synthese-Workflows, MCP-Anbindung (vault-rag als Tool), Voice
   (STT/TTS gehört zu Koda, NICHT zu vault-rag), optional OpenClaw-Gateway.
4. **Nie:** Full System Access / Terminal-Ausführung (Store + Sicherheit).

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

- `npm run gate` — voller Gate: `lint` + `typecheck` + `typecheck:scripts` + `test` +
  `check:pure` + `build`. Vor jedem Commit erwartet.
- `npm run dev` — esbuild-Watch-Build für lokale Plugin-Entwicklung.
- `npm test` — `check-no-abs-paths` + vitest (78/78 bei MVP-Abschluss).
- `npm run lab:tools` — koda-lab, das skriptgesteuerte Tool-Calling-Sondieren gegen
  einen laufenden Endpoint (Befunde in `docs/LAB.md`).
- `npm run build` — Typecheck + Production-esbuild (`main.js`).

## Struktur-Kurzüberblick

- `src/core/` — rein (kein Obsidian-Import, `check:pure` erzwingt das): Agent-Loop,
  Tool-Policy/-Defs, Memory, Sessions, Diff.
- `src/llm/` — `KodaChatClient` + `XhrSseTransport` (Streaming-Chat-Client).
- `src/obsidian/` — View, Vault-Tools-Adapter, Bestätigungs-Modal, Settings-Tab.
- `src/vendor/kit` + `src/vendor/kit-obsidian/` — verbatim vendorter `../obsidian-kit`
  (0.23.0), Re-Sync über `tools/sync-kit.sh` — nie von Hand editieren.
- `src/i18n/` — DE/EN-Strings.
