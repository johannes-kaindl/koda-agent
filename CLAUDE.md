# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status: 0.6.0 im Community-Store; 0.7.0 release-fertig auf main (Stand 2026-08-19)

Koda ist ein agentisches Obsidian-Plugin („Freund/Begleiter im Vault", Lakota) —
Chat-Sidebar + Vault-Tools + Markdown-Memory. **Im Community-Store gelistet**
(Gate-Scan „passed" beim ersten Anlauf) und über ihn installierbar. Stufe 1 steht:
Agent-Loop, sechs Tools (`search_notes`/`read_note`/`write_note`/`save_memory`/
`write_skill`/`list_notes`) plus ein optionales siebtes (`related_notes`, nur mit
vault-rag), Schreibregel mit Bestätigungs-Modal, Memory-Notiz, Sessions als JSONL,
Settings-Tab, i18n DE/EN, dazu die QoL-Schicht (Verbindungstest, Modell-Auswahl,
Failover, Presets) und ein automatisierter GUI-Smoke (`scripts/gui-smoke.ts`, CDP
gegen ein laufendes Obsidian) plus ein Praxistest-Treiber gegen ein echtes Modell
(`scripts/gui-ask.ts`). **Compaction (Stufe-2-Baustein B) ist auf `main`** — Spec
`2026-08-18-koda-compaction-design.md` — und hat am 2026-08-19 den Praxistest gegen ein
echtes Modell bestanden (`docs/SMOKE.md`, Handpunkt 20: Stufe 1 und 2 sichtbar, kein
overflow, GUI-Smoke 10/10). Release 0.7.0 steht aus (Push/Tag von Hand, siehe TaskNote
im Cockpit). Gate ist grün (336/336), `main.js` baut. Details zu Nutzung/Setup:
`README.md`; Smoke-Checkliste vor jedem Release: `docs/SMOKE.md`. **Ein lokaler
LLM-Server braucht CORS** (LM Studio „Enable CORS"/`lms server start --cors`): der Chat
streamt als XHR aus dem Renderer, die Testen-Probe läuft über `requestUrl` — Koda benennt
den Widerspruch „Probe grün, Chat rot" seit `3232660` selbst.
Spezifiziert in `docs/superpowers/specs/2026-08-05-koda-agent-mvp-design.md` — dort
stehen die Entscheidungen (Community-Store ab Commit 1, Schreibmodell „Koda-Ordner
frei, Rest bestätigt", Agent-Kern im Plugin, Roadmap-Stufen). Ideen-Quelle:
`10_Pallas/00_Inbox/Koda Agent Plugin Recherche.md` (Pallas-Vault).

## Nächster Schritt (geseedet 2026-08-07, Baustein A geseedet+erledigt 2026-08-07,
Baustein B erledigt 2026-08-18)

**Stufe 2** — Markdown-Skill-System, Compaction, Aufräum-Assistent. **Baustein A
(Markdown-Skill-System) ist implementiert** (Branch `feat/skill-system`, 160/160
Tests grün): Frontmatter-`description`/`enabled`, Budget-Auswahl beim
Gesprächsstart, Selbst-Autorschaft über `write_skill` — immer bestätigungspflichtig,
auch im Koda-Ordner. **Baustein B (Compaction) ist implementiert** (Branch
`feat/compaction`, 331/331 Tests grün): zweistufige Verdichtung (Tool-Stubs, dann
Modell-Zusammenfassung abgeschlossener Runden), Settings-Gruppe „Kontext &
Verdichtung", Fenster-Vorbefüllung über die Endpunkt-Probe, GUI-Smoke-Punkte 7/8.
Der Praxistest gegen ein echtes Modell ist **bestanden** (2026-08-19, `docs/SMOKE.md`);
der „CORS-Verdacht" bei `gui:ask` war LM Studio ohne CORS, kein Plugin-Defekt. Spec:
`docs/superpowers/specs/2026-08-18-koda-compaction-design.md`.
Offen bleibt **Baustein C** (Aufräum-Assistent) — beginnt mit
`superpowers:brainstorming`, nicht mit Code: das ist ein Schnitt, kein Feature.
Voller Seed mit offenen Design-Punkten und Kit-Ankern: `docs/NEXT-SESSION.md`.
Erledigt und nicht mehr offen: QoL-Ausbau, GUI-Smoke-Automatisierung, Release-Infra,
Store-Einreichung (0.1.0 ist gelistet). Geparkt: Freeze-Gegenprobe.

## Verbindlicher Rahmen

Es gilt das Dach-`AGENTS.md` (`../AGENTS.md`, wird automatisch geladen):
Kit-first (REGISTRY.md vor jeder Neuentwicklung prüfen), `UI-STANDARD.md` vor
UI-Arbeit, eigenständiges Git-Repo mit eigenem Release-Takt (PROF-OBS-09),
Release-Infra über Skill `plugin-release-setup`, Test-Setup über Skill
`obsidian-plugin-test-pattern` (vitest + Obsidian-Mock aus `obsidian-kit/testing`).

## Scope-Entscheidung (2026-08-05, Details in der Spec)

1. **Stufe 1 (MVP, implementiert):** Vault-Q&A mit Aktion — Chat-Sidebar, vier Tools
   (`search_notes`/`read_note`/`write_note`/`save_memory`), Memory-Notiz,
   Sessions als JSONL. Später ergänzt: `write_skill` (Stufe 2) und `related_notes`
   (optional, nur mit vault-rag).
2. **Stufe 2:** Markdown-Skill-System (inkl. Selbst-Autorschaft mit
   Bestätigung), Compaction, Aufräum-Assistent.
3. **Stufe 3:** Synthese-Workflows, Voice
   (STT/TTS gehört zu Koda, NICHT zu vault-rag), optional OpenClaw-Gateway.
   *(Die vault-rag-Anbindung ist seit 2026-08-13 erledigt — über dessen Plugin-API
   statt über MCP, siehe unten.)*
4. **Nie:** Full System Access / Terminal-Ausführung (Store + Sicherheit).

## Retrieval-Andockung an vault-rag (2026-08-13)

Koda nutzt vault-rags Embedding-Index über dessen **Plugin-API**
(`app.plugins.plugins["vault-retrieval"]?.api`, `apiVersion: 1`) — nicht über MCP
(Koda ist `isDesktopOnly: false`; ein HTTP-Server steht auf Mobile nicht bereit) und
nicht durch Selbstlesen von `_vaultrag/index.bin` (zwei Kopien, eine veraltet).
`search_notes` fragt **immer beide Wege** ab; Ergebnisse werden **beschriftet statt
gemischt**, weil die Scores nicht vergleichbar sind. (Bis 0.5.0 gab es eine Schwelle
— semantisch nur bei weniger als drei Volltext-Treffern. Sie schnitt gemessen genau
die thematischen Fragen ab, für die es den semantischen Weg gibt; Begründung der
Rücknahme im Kommentar in `src/core/tools/retrieval.ts` und im Nachtrag zu E4 der
Spec.) Die Kopplung ist weich: fehlt vault-rag, verhält sich Koda
wie vorher und `related_notes` erscheint nicht im Prompt.

Spec: `docs/superpowers/specs/2026-08-13-koda-retrieval-andockung-design.md`,
Plan: `docs/superpowers/plans/2026-08-13-koda-retrieval-andockung.md`.
Verbindlich vorgelagert ist der **Zuständigkeits-Zuschnitt** im Dach
(`../AGENTS.md` § „Zuständigkeits-Zuschnitt"): Fähigkeiten wandern zur Quelle —
Koda baut kein eigenes Retrieval, keine Aufgabenverwaltung und kein Persona-/
Ablauf-System (das ist vault-crews).

## Wiederverwendung (Kit-first-Anker aus REGISTRY.md)

Die gesamte LLM-Klempnerei existiert im Ökosystem bereits — **nicht neu bauen**:

- **SSE/Streaming/Reasoning/Capabilities:** `obsidian-kit/pure` (`parseSSE`,
  `ThinkSplitter`, `reasoning.ts`, `capabilities.ts`, `model-context.ts`);
  Transport (XHR statt fetch): `vault-rag/src/sse.ts`
- **Kompletter Chat-Client:** `kuro-gamification/src/llm/KuroChatClient.ts`
  (n=4, Kit-Extraktion steht an — Koda wäre der 5. Consumer und damit Anlass,
  die Extraktion zu ziehen statt zu kopieren)
- **Endpoint-Handling:** Kit `endpoint_config` (@0.25.0, API-Key je Endpunkt) +
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
- `npm test` — `check-no-abs-paths` + vitest (336/336).
- `npm run lab:tools` — koda-lab, das skriptgesteuerte Tool-Calling-Sondieren gegen
  einen laufenden Endpoint (Befunde in `docs/LAB.md`).
- `npm run smoke:gui -- --vault <name>` — GUI-Smoke gegen ein laufendes Obsidian (CDP).
  Prüft die Naht zum Host, bewusst **ohne** Modell-Antwort.
- `npm run gui:ask -- --vault <name> --ask "<Frage>" [--expect <text>] [--full]` —
  Praxistest: stellt Koda im laufenden Obsidian eine echte Frage und berichtet, **welche
  Werkzeuge er wählt**. Das Gegenstück zum Smoke — langsam und nicht deterministisch,
  dafür die einzige Messung von Kodas Verhalten. Bei Gegenproben immer `--full`, sonst
  ist der Beleg abgeschnitten.
- `npm run build` — Typecheck + Production-esbuild (`main.js`).

## Struktur-Kurzüberblick

- `src/core/` — rein (kein Obsidian-Import, `check:pure` erzwingt das): Agent-Loop,
  Tool-Policy/-Defs, Memory, Sessions, Diff.
- `src/core/skills/` — Skill-Parser, Budget-Auswahl, Pfad-Bau (obsidian-frei wie der
  Rest von `core/`).
- `src/core/agent/compaction/` — zweistufige Verdichtung des Gesprächsverlaufs
  (`project.ts`/`estimate.ts`/`stage1.ts`/`stage2.ts`): Projektion statt Umschreiben,
  positionsbasierte Marken, Tool-Stubs vor Modell-Zusammenfassung, Nutzer-Nachrichten
  unantastbar (pure).
- `src/core/tools/retrieval.ts` — Zusammenführung von Volltext- und Index-Treffern,
  Schwellenlogik, Ausfall-Meldungen (pure). Gegenstück: `src/obsidian/retrieval.ts`
  liest vault-rags API defensiv aus `app.plugins`.
- `src/core/tools/list.ts` — `list_notes`: Ordnerauswahl (flach/rekursiv), Kappung
  mit Warnung in Zeile 1, leerer Ordner als Fehler mit Vorschlägen (pure). Frontmatter
  kommt aus Obsidians `metadataCache`, kein Datei-Lesen je Notiz.
- `src/llm/` — `KodaChatClient` + `XhrSseTransport` (Streaming-Chat-Client).
- `src/obsidian/` — View, Vault-Tools-Adapter, Bestätigungs-Modal, Settings-Tab.
- `src/vendor/kit` + `src/vendor/kit-obsidian/` — verbatim vendorter `../obsidian-kit`
  (0.25.0), Re-Sync über `tools/sync-kit.sh` — nie von Hand editieren.
- `src/i18n/` — DE/EN-Strings.
