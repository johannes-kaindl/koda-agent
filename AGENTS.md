# AGENTS.md

Conventions for AI agents (Claude Code, Codex, …) working on this repository. `CLAUDE.md` importiert diese Datei (`@AGENTS.md`); der Stand steht in `CHANGELOG.md` und im Coding-Cockpit, nicht hier. Es gilt außerdem das Dach-`AGENTS.md` (`../AGENTS.md`): Kit-first (`REGISTRY.md` vor jeder Neuentwicklung), `UI-STANDARD.md` vor UI-Arbeit, und seine Regeln unter `../.claude/rules/` laden mit den passenden Dateien.

## Project character

Koda ist eine Chat-Sidebar in Obsidian, die Notizen des Vaults sucht, liest und schreibt und vor jeder Änderung an Nutzerdaten nachfragt. Sie spricht mit einem OpenAI-kompatiblen Modell, das der Nutzer wählt (typisch lokal: LM Studio, Ollama; seit 0.28.0 auch Claude über den LLM Endpoint Manager, Opt-in). Memory, Skills und Arbeiten, mit denen man Koda steuert, sind Markdown-Notizen; die Anweisung (der Regelblock) ist eine Einstellung. `isDesktopOnly: false`, `minAppVersion` 1.11.4 (`manifest.json`), also muss alles auch auf Mobile laufen. Im Community-Store gelistet.

Bewusste Grenzen (Warum: `docs/internal/decisions.md`):

- Nie Terminal-/System-Zugriff.
- Kein eigenes Retrieval, keine Aufgabenverwaltung, kein Persona-/Ablauf-System. Fähigkeiten wandern zur Quelle: Retrieval und `related_notes` kommen von vault-rag über dessen Plugin-API und den Werkzeug-Anbieter-Vertrag, Abläufe gehören vault-crews.
- Genuin neu gebaut ist nur der Agent-Kern (Tool-Calling-Loop, Skill-Loader, Compaction), der Arbeitskontext und die Fähigkeiten und Arbeiten.

## Architecture principles

- `src/core/` ist rein: kein Obsidian-Import, `npm run check:pure` erzwingt das. Obsidian-Zugriffe liegen in `src/obsidian/` und werden über Ports in den Kern gereicht.
- `src/llm/` enthält den Streaming-Chat-Client, `src/i18n/strings.ts` alle Nutzertexte (EN und DE).
- Die Kopplung an vault-rag und andere Plugins ist weich: fehlt das Plugin, verhält sich Koda wie ohne. APIs anderer Plugins werden defensiv aus `app.plugins` gelesen.
- Werkzeuge fremder Plugins montiert `toolSet()` (`src/core/tools/defs.ts`); der Wirt gewinnt jede Namenskollision.
- Der Sitzungszustand (Arbeit, Overlay, Notizen, Bases) liegt in einem Objekt, `plugin.session`, und kommt mit dem Gespräch als Marke im JSONL zurück.
- `src/vendor/kit`, `src/vendor/kit-obsidian/` und `tests/vendor/kit/` sind verbatim vendorter Kit. Nie von Hand editieren, sondern über `tools/sync-kit.sh` (Pins in `tools/kit-sync.json`, feste Refs, nicht der Arbeitsstand des Nachbar-Repos); maßgeblich ist die `VENDOR.json` im Ordner. Das Kit-CSS steht verbatim in `styles.css`: den Block ersetzen, nicht ändern.

Aufbau im Einzelnen: `docs/internal/architecture.md`.

## Commands

- `npm install`
- `npm run dev` — esbuild-Watch
- `npm run build` — Typecheck plus Production-Build (`main.js`)
- `npm test` — `check-no-abs-paths` plus vitest
- `npm run lint`, `npm run typecheck`, `npm run typecheck:tests`, `npm run typecheck:scripts`, `npm run check:pure`
- `npm run gate` — alles davon; vor jedem Commit erwartet, Ziel 0 Fehler / 0 Warnungen
- `npm run smoke:gui -- --port <p> --vault koda-agent` — GUI-Smoke gegen ein laufendes Obsidian per CDP, nur in einer Zweitinstanz; `-- --setup` stellt den Staging-Vault `$STAGING_VAULTS_DIR/koda-agent` aus dem Fixture `docs/images/fixture/` her. Gefahren wird gegen diesen Vault, nie gegen den Arbeits-Vault. Prüft die Naht zum Host, bewusst ohne echte Modell-Antwort.
- `npm run gui:ask -- --vault <name> --ask "<Frage>" [--expect <text>] --full` — Praxistest gegen ein echtes Modell (langsam, nicht deterministisch; bei Gegenproben immer `--full`)
- `npm run lab:tools` — Sondieren des Tool-Callings gegen einen laufenden Endpoint
- `npm run shots -- --port <p> --vault koda-agent` und `npm run shots:check` — README-Bilder (Vertrag `docs/images/README.md`)
- `npm run release` — Minor/Patch-Release über das zentrale Tooling `../tools/release/`; das Repo muss im Dach `obsidian-plugins/` liegen. Ein Release ist kein Minion-Auftrag.
- `python3 ~/Projects/jkaindl/workspace/_docs/readme/readme_lint.py . --strict` — README- und Doku-Standard

## Conventions

- Workspace-weite Standards: `~/Projects/jkaindl/workspace/_docs/CONVENTIONS.md`.
- Conventional Commits, Trailer laut Session-Vorgabe. Nur berührte Dateien per Pathspec stagen, nie `git add -A`.
- Push nur nach `origin`.
- TDD (Skill `obsidian-plugin-test-pattern`: vitest mit dem Obsidian-Mock des Kits); ein Test, der nicht nachweislich fehlschlagen kann, ist keine Absicherung (CORE-TEST-01), also die Gegenprobe mitfahren. Jeder neue GUI-Smoke-Punkt bekommt eine Gegenprobe und einen Eintrag in `docs/SMOKE.md`.
- Nutzer-Doku liegt unter `docs/` (Index `docs/README.md`), Standard CORE-META-04. Wer eine Meldung in `src/i18n/strings.ts` ändert, zieht `docs/how-to/troubleshooting.md` mit, weil dort jeder Text wörtlich steht.
- Specs und Pläne liegen im Coding-Cockpit unter `_SDD` (CORE-META-14), interne Befunde unter `_Intern`; Messprotokolle des GUI-Smokes in `docs/SMOKE.md`; Warum und Aufbau in `docs/internal/`.

## Gotchas

- Ein lokaler LLM-Server braucht CORS (LM Studio „Enable CORS“, `lms server start --cors`): der Chat streamt als XHR aus dem Renderer, die Testen-Probe läuft über `requestUrl`. „Probe grün, Chat rot“ heißt meist fehlendes CORS, nicht ein Plugin-Defekt.
- Ein Test, der `src/main.ts` lädt, zieht `src/obsidian/bases-view.ts` mit; der Kit-Mock hat dafür nur leere Hüllen (`tests/__mocks__/obsidian.ts`).
- Alles Weitere zu Kontext, Sidebar, Werkzeugen, Kit und Smoke steht als Pfadregel unter `.claude/rules/` (siehe Index) und lädt, sobald eine passende Datei gelesen wird. Nach einem `/compact` oder einer Suche per Glob/`grep -r` lädt sie nicht von selbst: dann den Index unten befolgen.

## Context index

- Bevor du Dateien unter `src/core/context/`, die Bases-Ansicht, das Kontext-Panel oder `src/obsidian/workspace.ts` liest oder änderst: `.claude/rules/kontext.md` (Kandidaten-Sammlung, Chip-Schlüssel, Budget, Bases-Fallen).
- Bevor du `src/obsidian/view.ts`, den Tab „Fähigkeiten“ oder `styles.css` änderst: `.claude/rules/sidebar.md` (unsichtbare View-Kopf-Aktionen, Flex-Eltern, Kit-CSS).
- Bevor du `src/core/tools/`, `src/obsidian/vault-tools.ts`, den Bestätigungs-Dialog oder den Agent-Loop änderst: `.claude/rules/werkzeuge.md` (Route statt Name, Schreibregel, Byte-Token-Guard).
- Bevor du etwas unter `src/vendor/`, `tests/vendor/`, `tests/__mocks__/` oder `tools/kit-sync.json` anfasst, oder einen Kit-Pin hebst: `.claude/rules/kit-vendor.md`.
- Bevor du den GUI-Smoke, `gui:ask`, die README-Bilder oder die Fixture änderst oder fährst: `.claude/rules/smoke.md`; dazu im Dach `obsidian-plugins:.claude/rules/obsidian-instanz.md`, `obsidian-plugins:.claude/rules/cdp-lock.md`, `obsidian-plugins:.claude/rules/staging-vaults.md`, `obsidian-plugins:.claude/rules/gui-smoke-treiber.md` und `obsidian-plugins:.claude/rules/readme-shots.md`.
- Bevor du die Zuständigkeiten, die Schreibregel, das Budget, die Bases-Übernahme oder eine Altentscheidung übernimmst: `docs/internal/decisions.md`.
- Bevor du die Arbeiten, den Sitzungszustand, die Base einer Arbeit oder `src/main.ts` änderst: `.claude/rules/arbeiten.md`.
- Vor Änderungen an der Modulstruktur oder bevor du ein neues Modul anlegst: `docs/internal/architecture.md`.
- Vor einem Release, einer Store-Einreichung oder einem Rescan: `obsidian-plugins:.claude/rules/release-und-store.md`, Skills `plugin-release-setup` und `store-rescan`.
- Vor UI-Arbeit: `obsidian-plugins:.claude/rules/ui-bausteine.md` und `obsidian-plugins:UI-STANDARD.md`.
- Beim Ändern von Nutzer-Doku oder Meldungen: `docs/README.md` (Diátaxis-Index), `docs/how-to/troubleshooting.md`.
- Katalog und Belege der Prüfpunkte des GUI-Smokes: `docs/SMOKE.md`.

## Memory

Projekt-Memory unter `~/.claude/projects/<slug>/memory/` (Index: `MEMORY.md`).
Session-Handoff unter `.remember/`.

## Abweichungen von der Leitkonvention

Keine dokumentiert.

## UI-Abweichungen

Keine. (Die Abweichung „thinking-control“ ist mit obsidian-kit 0.70.1 entfallen: der Kit-Knopf sitzt in der Modellzeile, der gesperrte Zustand „immer an“ läuft über sein Feld `locked`; das Warum und die Nachprüfung stehen in `docs/internal/decisions.md`.)
