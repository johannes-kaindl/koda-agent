# Koda Agent — MVP-Design (Stufe 1)

**Datum:** 2026-08-05 · **Status:** entworfen, von Jay abschnittsweise freigegeben
(Brainstorming-Session) · **Repo:** `obsidian-plugins/koda-agent`

## Ziel

Koda („Freund/Begleiter", Lakota) ist ein agentisches Obsidian-Plugin: eine
Chat-Sidebar, in der ein LLM-Agent Fragen über den Vault beantwortet
(suchen → lesen → antworten mit `[[Links]]`) und auf Wunsch Notizen
anlegt/ergänzt. Ideen-Quelle: `10_Pallas/00_Inbox/Koda Agent Plugin Recherche.md`
(OpenClaw/Selma-Konzepte, auf Plugin-Territorium eingedampft).

**Erfolgskriterium MVP:** Jay stellt eine Frage an seinen Vault, Koda findet und
verlinkt die relevanten Notizen und kann daraus auf Zuruf eine Notiz erzeugen —
nachvollziehbar (sichtbare Tool-Schritte) und sicher (Schreibregel).

## Getroffene Entscheidungen

1. **Community-Store von Anfang an.** Store-sauber ab Commit 1
   (`eslint-plugin-obsidianmd`, alles Automatische opt-in, keine externen
   Pflicht-Abhängigkeiten). Konsequenz: kein vault-rag-, kein Python-Backend im
   Kern.
2. **Schreibmodell „Koda-Ordner frei, Rest bestätigt".** Innerhalb des
   konfigurierbaren Koda-Ordners schreibt der Agent ohne Nachfrage; außerhalb
   nur nach Bestätigungs-Modal mit Vorschau.
3. **Architektur A: Agent-Kern im Plugin.** Purer TypeScript-Agent-Loop mit
   injizierten Ports; Obsidian-Adapter außen. Kein MCP-Layer im MVP (Ansatz B,
   Andockpunkt bleibt), kein Backend-Prozess (Ansatz C, kollidiert mit Store).
4. **Tool-Calling nativ (OpenAI-`tools`-Format), tolerant geparst.** Vor dem
   UI-Bau misst ein `koda-lab`-Skript die Tool-Call-Zuverlässigkeit der lokalen
   Zielmodelle; das Ergebnis bestimmt die Dicke des Fallback-Parsings.
5. **Selbstverbesserung = Markdown-Lernen** (Hermes-Idee, sicher übersetzt):
   Memory-Notiz im Vault ab MVP, selbst-autorierte Skill-Notizen ab Stufe 2.
   Kein selbst-modifizierender Code, kein Fine-Tuning. Git im Vault ist der
   Undo-Button.
6. **TTS/STT gehört zu Koda, nicht zu vault-rag** — Sprache ist ein Kanal der
   Konversationsschicht. Deshalb ist die Chat-Ein-/Ausgabe ab MVP
   kanal-agnostisch geschnitten (schmales Interface zwischen View und
   Agent-Loop). vault-rag bleibt Retrieval und dockt später als Tool an.

## Roadmap (nur Stufe 1 ist Gegenstand dieser Spec)

- **Stufe 1 (MVP):** Vault-Q&A mit Aktion, Memory-Notiz, Sessions.
- **Stufe 2:** Markdown-Skill-System (inkl. Selbst-Autorschaft mit Bestätigung),
  Compaction, Aufräum-Assistent.
- **Stufe 3:** Synthese-Workflows, MCP-Anbindung (vault-rag als Tool),
  Voice (STT lokal via Whisper, TTS via Piper/Kokoro), optional
  OpenClaw-Gateway-Kanal.
- **Explizit nie:** Full System Access / Terminal-Ausführung (Store + Sicherheit).

## Architektur & Komponenten

Ökosystem-Standard: purer, obsidian-freier Kern; Adapter außen; esbuild-Bundle.

```
src/core/agent/    Agent-Loop (Zustandsautomat), Tool-Protokoll, Runden-Limit
src/core/tools/    Tool-Definitionen, Pfad-Guard, writePolicy (pure)
src/core/memory/   Memory-Notiz-Logik, Session-Datenmodell
src/llm/           Chat-Client (KuroChatClient-Muster vendored) + Kit-Bausteine
src/obsidian/      Hub-View (Chat), Confirm-Modal mit Vorschau, Settings, main.ts
scripts/koda-lab.ts  Mess-Lab: Tool-Call-Zuverlässigkeit lokaler Modelle
```

**Agent-Loop (`src/core/agent/`)** — das genuin Neue. Purer Zustandsautomat:
User-Nachricht → LLM (streamend) → bei Tool-Aufrufen: ausführen, Ergebnisse als
Tool-Messages anhängen, weiter — bis finale Antwort oder Runden-Limit
(Default 8). Kennt nur drei injizierte Ports:

- `LlmPort` — Chat-Completion mit Streaming (SSE), Abbruch, Modell/Endpoint.
- `ToolPort` — führt einen benannten Tool-Aufruf aus, liefert Result **oder
  Fehler-Result** (der Loop crasht nie an einem Tool).
- `ConfirmPort` — fragt eine Schreibfreigabe mit Vorschau an
  (`approved | rejected`).

Dadurch ist der Loop ohne Obsidian vollständig testbar und kanal-agnostisch
(View, später Voice, später Gateway sprechen dasselbe Interface).

**LLM-Schicht (`src/llm/`):** Chat-Client nach `kuro-gamification/src/llm/KuroChatClient.ts`
(n=4) vendored — Transport und `ClockPort` injiziert. Die Kit-Extraktion (Koda
wäre n=5) läuft als separater drift-audit-Task, nicht im MVP-Pfad. Aus dem Kit
kommen: `parseSSE`, `ThinkSplitter`, `reasoning` (suppressParams/
isAlwaysOnThinker), `capabilities`, `endpoint_config` (@0.23.0, API-Key je
Endpunkt), `classifyEndpointStatus`, `mergeSettings`, i18n
(`defineStrings`/`t`/`pickLang`). SSE-Transport per XHR (`vault-rag/src/sse.ts`-Muster).

## Tools (MVP: genau vier)

1. `search_notes(query)` — Dateinamen + Volltext über Vault-API/`metadataCache`;
   liefert Pfade + Kontext-Schnipsel. Kein Embedding-Index (vault-rags Revier;
   Stufe 3 als optionales Tool).
2. `read_note(path)` — Pfad-Guard nach `vault-rag/src/mcp/tools.ts`
   (`resolveNotePath`-Muster, security-reviewed): vault-relativ erzwungen,
   `..`-Traversal geblockt.
3. `write_note(path, content, mode)` — `create | append | replace`, läuft durch
   die Schreibregel.
4. `save_memory(text)` — hängt einen Lernpunkt an `<Koda-Ordner>/Memory.md` an;
   liegt im Koda-Ordner → immer frei.

**Schreibregel (pure, TDD):** `writePolicy(path, kodaFolder)` → `free | confirm`.
`confirm` öffnet über den `ConfirmPort` ein Modal: Volltext-Vorschau bei
Neuanlage, Diff bei Änderung (Diff-Gruppierung nach
`image-to-markdown/src/diff.ts`). Die Freigabe gilt **genau für den gezeigten
Inhalt** — jeder abweichende Schreibversuch erzeugt ein neues Modal
(Registry-Fehlerklasse „angezeigt ≠ ausgeführt"). Ablehnung geht als
Tool-Result „vom Nutzer abgelehnt" zurück ans Modell.

## Memory & Sessions

**Koda-Ordner** (Default `Koda/`, Settings via `FolderSuggest`):

```
Koda/Memory.md    von Koda beschrieben (save_memory), von Jay editierbar;
                  wird bei jedem Gespräch in den System-Prompt geladen
Koda/Entwürfe/    freier Schreibraum des Agenten
Koda/Skills/      Stufe 2 — Loader ist im MVP eine leere Andockstelle
```

**Sessions:** Append-only-JSONL im Plugin-Datenordner
(`traceStore`-Muster, `vim-dojo/src/storage/traceStore.ts`) — bewusst nicht im
Vault. Sidebar kann das letzte Gespräch fortsetzen. Kontext-Überlauf wird
erkannt (`isContextOverflow`, vault-crews) und klartextlich gemeldet; Compaction
ist Stufe 2, das Session-Datenmodell sieht sie vor (Verlauf als Liste von
Runden, ersetzbar durch Zusammenfassungs-Runde).

## UI

Nach `UI-STANDARD.md` (Obsidian-nativ, Theme-CSS-Variablen, ein Frontend):

- **Sidebar-Hub-View** (Regel-der-Drei-Muster). Chat-Verlauf, Eingabefeld
  unten, Stop-Button (bricht Stream **und** Loop ab), „Neues Gespräch".
- **Streaming-Anzeige:** Reasoning via `ThinkSplitter` abgetrennt, als
  einklappbarer „Denkt nach…"-Block. `thoughtOnly`-Fall wird als solcher
  angezeigt, nie als leere Antwort.
- **Tool-Transparenz:** Jeder Tool-Aufruf erscheint als einklappbarer Schritt
  im Verlauf („🔍 search_notes: 3 Treffer"), inkl. Fehler-Results.
- Kein Auto-Öffnen der Sidebar ohne Opt-in-Setting (Registry-Muster
  „Opt-in-Gate für Startup-Seiteneffekt").

**Settings** (deklarativ mit `display()`-Fallback, n=4-Muster):
Endpoint-Zeilen-Editor (vault-crews-Vorlage, Kit-`endpoint_config`),
Modellwahl mit ehrlichem Offline-Verhalten (`resolveModelChoice`-Muster),
Koda-Ordner (`FolderSuggest`), Runden-Limit, Sprache (PROF-OBS-07 DE/EN),
Opt-in Sidebar-Autostart.

## Fehlerbehandlung

- Endpoint-Fehler → Klartext-Klassen (`classifyEndpointStatus`, Kit).
- HTTP-/Chat-Fehler → `ChatHttpError`/`chatErrorMessage`-Muster
  (`vault-rag/src/chat_error.ts`, Kit-Kandidat n=2 — Koda macht n=3).
- Tool-Fehler (nicht gefunden, Pfad geblockt, abgelehnt) → Fehler-Result zurück
  ans Modell; der Agent darf sich korrigieren.
- Runden-Limit erreicht → ehrliche Meldung im Chat statt Endlosschleife.
- Abbruch (Stop-Button) → Loop-Zustand `aborted`, Session bleibt konsistent
  persistiert.

## Testing & Qualität

- **Purer Kern:** vitest, Obsidian-Mock aus `obsidian-kit/testing` (Skill
  `obsidian-plugin-test-pattern`). Agent-Loop mit Fake-`LlmPort`/`ToolPort`/
  `ConfirmPort` durch alle Pfade: Happy-Path, Tool-Fehler, Ablehnung,
  Runden-Limit, Abbruch, Kontext-Überlauf. `writePolicy` + Pfad-Guard pure/TDD.
- **`koda-lab`** (Iterations-Lab-Muster n=2, importiert Produktionscode):
  misst je Zielmodell die Tool-Call-Zuverlässigkeit (natives Format vs.
  JSON-im-Text) — **erster Implementierungsschritt nach dem Scaffold**, vor dem
  UI-Bau.
- **Gates ab Commit 1:** `typecheck`, `lint` (Store-Scanner +
  Inline-disable-Blocker), `check:pure`, NUL-Byte-Check
  (`_docs/templates/scripts/check-no-nul-bytes.mjs`), `test`.
- **GUI-Smoke** via Skill `gui-smoke-setup` nach erstem lauffähigem UI-Stand.

## Release & Store

- Release-Infra über Skill `plugin-release-setup` (zentrale
  `tools/release/release.mjs`, `release.yml`, Dual-Push Forgejo→GitHub,
  Preflight inkl. „description ohne ‚Obsidian‘"-Regel).
- **User-Schritte (Jay, als Handover festhalten):** GitHub-Remote-Anlage falls
  Account-Aktion nötig, Store-Erst-Einreichung im Developer Dashboard
  (`community.obsidian.md`), Rescan-Anstoß nach jedem Release + Status prüfen.
  Der PR-Flow ist tot (seit Mai 2026); der Rescan startet nie von selbst.

## Registry-Pflicht (Kit-first)

Nach dem MVP mindestens eintragen: Agent-Loop-Muster (erstes Exemplar im
Ökosystem), `writePolicy`, Tool-Protokoll mit tolerantem Parsen,
`koda-lab`-Befunde. `chat_error`-Übernahme macht den Kit-Kandidaten n=3 →
im drift-audit melden.
