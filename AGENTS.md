# AGENTS.md

Conventions for AI agents (Claude Code, Codex, …) working on this repository. `CLAUDE.md` ist die ausführliche Chronik (Status je Release, Etappen, Befunde); diese Datei ist der kurze Einstieg. Es gilt außerdem das Dach-`AGENTS.md` (`../AGENTS.md`): Kit-first (REGISTRY.md vor jeder Neuentwicklung), `UI-STANDARD.md` vor UI-Arbeit.

## Project character

Koda ist eine Chat-Sidebar in Obsidian, die Notizen des Vaults sucht, liest und schreibt und vor jeder Änderung an Nutzerdaten nachfragt. Sie spricht mit einem OpenAI-kompatiblen Modell, das der Nutzer wählt (typisch lokal: LM Studio, Ollama). Alles, was Koda steuert (Anweisungen, Memory, Skills), ist eine Markdown-Notiz. `isDesktopOnly: false`, `minAppVersion` 1.8.7 (`manifest.json`), also muss alles auch auf Mobile laufen.

Bewusste Grenzen (`CLAUDE.md` § Scope-Entscheidung und § Retrieval-Andockung):

- Nie Terminal-/System-Zugriff.
- Kein eigenes Retrieval, keine Aufgabenverwaltung, kein Persona-/Ablauf-System. Fähigkeiten wandern zur Quelle: Retrieval kommt aus vault-rag über dessen Plugin-API, Abläufe gehören vault-crews.
- Genuin neu gebaut ist nur der Agent-Kern (Tool-Calling-Loop, Skill-Loader, Compaction).

## Architecture principles

- `src/core/` ist rein: kein Obsidian-Import, `npm run check:pure` erzwingt das. Obsidian-Zugriffe liegen in `src/obsidian/` und werden über Ports in den Kern gereicht.
- `src/llm/` enthält den Streaming-Chat-Client (`KodaChatClient`, `XhrSseTransport`).
- `src/i18n/strings.ts` trägt alle Nutzertexte (EN und DE).
- Die Kopplung an vault-rag und andere Plugins ist weich: fehlt das Plugin, verhält sich Koda wie ohne. Die APIs anderer Plugins werden defensiv aus `app.plugins` gelesen.
- Werkzeuge fremder Plugins montiert `toolSet()` (`src/core/tools/defs.ts`); der Wirt gewinnt jede Namenskollision.
- `src/vendor/kit` und `src/vendor/kit-obsidian/` sind verbatim vendorter `obsidian-kit`. Nie von Hand editieren, sondern über `tools/sync-kit.sh` (feste Refs `KIT_REF` und `MOCK_REF`, nicht der Arbeitsstand des Nachbar-Repos). Maßgebliche Version: `src/vendor/kit/VENDOR.json`.
- Das Kit-CSS steht nach Kit-Vertrag in `styles.css`; den Block ersetzen, nicht von Hand ändern.

Struktur im Einzelnen: `CLAUDE.md` § Struktur-Kurzüberblick.

## Commands

- `npm install`
- `npm run dev` — esbuild-Watch
- `npm run build` — Typecheck plus Production-Build (`main.js`)
- `npm test` — `check-no-abs-paths` plus vitest
- `npm run lint`, `npm run typecheck`, `npm run typecheck:tests`, `npm run typecheck:scripts`, `npm run check:pure`
- `npm run gate` — alles davon; vor jedem Commit erwartet, Ziel 0 Fehler / 0 Warnungen
- `npm run smoke:gui -- --vault <name>` — GUI-Smoke gegen ein laufendes Obsidian per CDP; `--setup` stellt den Staging-Vault `$STAGING_VAULTS_DIR/koda-agent` aus dem Fixture `docs/images/fixture/` her. Gefahren wird gegen diesen Vault, nicht gegen den Arbeits-Vault.
- `npm run gui:ask -- --vault <name> --ask "<Frage>" --full` — Praxistest gegen ein echtes Modell (langsam, nicht deterministisch)
- `npm run lab:tools` — Sondieren des Tool-Callings gegen einen laufenden Endpoint (Befunde in `docs/LAB.md`)
- `npm run shots -- --port <p> --vault koda-agent` und `npm run shots:check` — README-Bilder (Vertrag `docs/images/README.md`)
- `npm run release` — Minor/Patch-Release über das zentrale Tooling `../tools/release/`; das Repo muss im Dach `obsidian-plugins/` liegen.
- `python3 ~/Projects/jkaindl/workspace/_docs/readme/readme_lint.py . --strict` — README- und Doku-Standard

## Conventions

- Workspace-weite Standards: `~/Projects/jkaindl/workspace/_docs/CONVENTIONS.md`.
- Conventional Commits, Trailer laut Session-Vorgabe. Nur berührte Dateien per Pathspec stagen, nie `git add -A`.
- Push nur nach `origin`. GitHub bekommt Branch und Tag ausschließlich über `release.mjs`.
- TDD; ein Test, der nicht nachweislich fehlschlagen kann, ist keine Absicherung (CORE-TEST-01), also die Gegenprobe mitfahren.
- Nutzer-Doku liegt unter `docs/` (Index `docs/README.md`), Standard CORE-META-04. Wer eine Meldung in `src/i18n/strings.ts` ändert, zieht `docs/how-to/troubleshooting.md` mit, weil dort jeder Text wörtlich steht.
- Specs und Pläne liegen unter `docs/superpowers/`; Messprotokolle des GUI-Smokes in `docs/SMOKE.md`.

## Gotchas

Alle mit Beleg in `CLAUDE.md`:

- `activeEditor` ist aus der Seitenleiste heraus leer. Die aktive Notiz kommt über `getMostRecentLeaf()`.
- Restaurierte, nicht besuchte Tabs sind `DeferredView`s ohne `view.file`; der Pfad steht in `getViewState().state.file`. Seitenleisten-Ansichten (Backlinks, Gliederung) sind keine Tabs.
- Obsidian blendet den View-Kopf in jeder Seitenleiste aus: Aktionen per `addAction()` sind unsichtbar (Ursache von 0.10.1). Aktionen brauchen eine eigene Kopfzeile und einen Befehl.
- `.koda-log { flex: 1 }` hält die Eingabezeile nur unten, solange der Elternknoten ein Flex-Container ist. Wer den Teilbaum umhängt, prüft Prüfpunkt 32 (Geometrie).
- `collectCandidates` (`src/core/context/`): die Menge „gesehen" (sammeln) und „expandiert" (Suche steuern) dürfen nicht vermischt werden, sonst verschwinden Notizen ab Tiefe 2.
- Der Chip-Schlüssel ist der Schlüssel des Kandidaten, nicht der der Platzierung; sonst bewirkt das Abwählen nichts.
- Der Runner routet Werkzeugaufrufe nach der Route, nicht nach dem Namen; ein montiertes `related_notes` gehört dem Anbieter.
- `sync-kit.sh` hat zwei Refs mit Absicht: `MOCK_REF` zieht nur `tests/vendor/kit/obsidian-mock.ts`. Nach jedem Umbau am Skript darf ein zweiter Lauf mit denselben Refs keine Datei ändern.
- Das Budget des Arbeitskontexts wird per Wasserfüllung verteilt (`allocateBudget`), nicht gleichverteilt.

## Memory

Projekt-Memory unter `~/.claude/projects/<slug>/memory/` (Index: `MEMORY.md`).
Session-Handoff unter `.remember/`.

## Abweichungen von der Leitkonvention

Keine dokumentiert.
