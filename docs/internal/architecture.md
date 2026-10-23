# Architektur — Aufbau von koda-agent

Wo was liegt und wie die Teile zusammenhängen. Das Warum steht in `docs/internal/decisions.md`, die Nutzer-Doku unter `docs/` (Index `docs/README.md`). Stand: Welle 25 (2026-10-23, Version 0.28.0 und Unreleased).

## Schichten

- `src/core/` — rein, kein Obsidian-Import (`npm run check:pure` erzwingt das). Alles Entscheiden: Agent-Loop, Werkzeug-Definitionen und -Regeln, Memory, Sessions, Diff, Prompt-Bau, Kontext, Fähigkeiten.
- `src/obsidian/` — die Obsidian-Schicht: View, Vault-Werkzeuge, Bestätigungs-Dialog, Settings-Tab, Picker. Obsidian-Zugriffe gehen über Ports in den Kern.
- `src/llm/` — `KodaChatClient`, der Streaming-Chat-Client (Transport XHR statt fetch, Anthropic-Messages-API über den Kit-Transport).
- `src/i18n/strings.ts` — alle Nutzertexte, EN und DE.
- `src/vendor/kit/` und `src/vendor/kit-obsidian/` — verbatim vendorter `obsidian-kit` und `code-kit`, `tests/vendor/kit/` der Obsidian-Mock. Pins in `tools/kit-sync.json`, Re-Sync über `tools/sync-kit.sh` (Wrapper um das zentrale `kit-sync` des Dachs); maßgeblich ist `VENDOR.json` im jeweiligen Ordner. Nie von Hand editieren.
- `src/main.ts` — das Plugin: Befehle, Sitzungszustand, `ask()`, Verdrahtung.

## Der Kern im Einzelnen

- `core/prompt/` — der Prompt-Bau. `rules.ts` (`DEFAULT_RULES`, `renderRules`, `checkRules`: der ersetzbare Regelblock mit den Platzhaltern `{{sprache}}` und `{{ordner}}` und der Warn-Heuristik), `build.ts` (`buildSystemPrompt()`: Regelblock, Memory, Skills; dieselbe Funktion speist die Modal-Vorschau und `gui:ask --full`, kein Nachbau), `view-model.ts`/`effective.ts` (Zeilen der Modell-Steuerung, welche Lesewerkzeuge gerade angeboten werden), `now.ts` (Anhang `## Now`).
- `core/skills/` — Skill-Parser, Budget-Auswahl, Pfad-Bau.
- `core/abilities/` — Fähigkeiten und Arbeiten, pure: `types` (SkillMode, Arbeit, Overlay, SessionState), `parse` (Arbeit aus dem Frontmatter, ungültige Einträge benannt), `resolve` (Vorrang Overlay → Arbeit → Grundeinstellung; effektive Werkzeuge und Kontext), `save` (der effektive Stand als Abweichung), `session` (Sitzungs-Marke im JSONL, „Neues Gespräch“, Zeile im Chat), `projection` (Skill-Regel der Projektion), `panel-vm` (ViewModel des Tabs), `base-ref` (`base: "<Pfad>.base#<Ansicht>"` einer Arbeit und die Prüfung, ob die Ansicht vom Typ `koda-context` ist).
- `core/chat/` — die Sidebar-Logik: `activity.ts` (was Koda gerade tut, als Zustandsautomat; die Statuszeile bildet ihn nur ab), `context-usage.ts` (Belegung des Kontextfensters, dieselbe Schätzung und Schwelle wie die Verdichtung), `reasoning-toggle.ts` (Abbildung des Kit-Zustands `think-toggle` auf Kodas Texte, Icons und Klassen; Zustand und die Request-Seite kommen aus dem Kit — wer nur die Anzeige nimmt, hat die Hälfte).
- `core/context/` — der Arbeitskontext. `types`, `ports`, `workspace-line` (der Arbeitsplatz-Block, nur Zeiger), `selection` (Abwahl-Zustand: abgewählt wird der Snapshot **vor** dem Rendern, abgewählte Einträge werden markiert, nicht entfernt), `candidates` (welche Notizen ein Modus anbietet, ohne Inhalte; Reihenfolge Quelle → Ebene → Pfad: aktive Notiz · Manuelles · Bases · Tabs · Links · Backlinks · Nachbarn), `select` (`allocateBudget`), `render` (der Volltext-Block mit Kürzungs-Meldung), `build` (`buildFullContext`, die einzige Stelle, die Kandidaten, Zuteilung und Rendern verbindet), `manual` (`addPaths`/`removePath`), `semantic` (Treffer aus vault-rag, Fehler als Wert), `bases` (Schnappschuss, Übergabeform, Tabelle), `panel-vm` (das ViewModel des Kontext-Tabs; ruft dieselbe Render-Funktion wie `currentContext()`, damit die Summenzeile den gesendeten Block misst statt ihn nachzurechnen), `labels`. Adapter: `src/obsidian/workspace.ts` (Snapshot des Arbeitsplatzes), `links.ts` (`LinkPort` aus `metadataCache.resolvedLinks`: ausgehend ein Lookup, Backlinks eine Iteration über alle Quellen), `note-picker.ts` (Fuzzy-Notiz-Picker, übernommen aus vault-rag, Herkunftsstempel in der Datei) und `folder-picker.ts` (Modal um den vendorten `FolderSuggest`, weil es für Ordner keinen nativen Fuzzy-Picker gibt), `context-panel.ts` (das Hub-Panel: schmaler Host-Vertrag, `viewModel()` liest nur), `bases-view.ts` (die Bases-Ansicht „Koda-Kontext“).
- `core/agent/` — `loop.ts` (Tool-Calling-Loop), `types.ts`, `text-fallback.ts`, `lab-trace.ts` (pure Bausteine der llm-lab-Meldung: `toLabMessages`, `describeLlmFailure`, `readNotePathOf`; Gegenstück `src/vendor/kit-obsidian/lab-client.ts`, verdrahtet in `ask()` als `reportToLab`, ein `turnId` je Nutzer-Handlung). `core/agent/compaction/` — zweistufige Verdichtung (`project`, `estimate`, `stage1`, `stage2`): Projektion statt Umschreiben, positionsbasierte Marken, Tool-Stubs vor Modell-Zusammenfassung, Nutzer-Nachrichten unantastbar.
- `core/tools/` — `defs.ts` (`TOOL_DEFS`, `toolSet()`: die eine Menge aus eigenen Werkzeugen und montierten Anbieter-Werkzeugen für Draht **und** Route), `write-policy.ts` (Schreibregel), `path-guard.ts`, `move.ts`, `images.ts`, `decode-byte-tokens.ts` (Byte-Token-Guard vor dem Bestätigen), `where.ts` (Filter von `list_notes`), `list.ts` (Ordnerauswahl flach/rekursiv, Kappung mit Warnung in Zeile 1, leerer Ordner als Fehler mit Vorschlägen; das Frontmatter kommt aus Obsidians `metadataCache`, kein Datei-Lesen je Notiz), `tree.ts` (Ordnerbaum für `depth` ≥ 2, gekappt nach ganzen Ebenen, nie ein halber Ast), `retrieval.ts` (Volltext- und Index-Treffer zusammenführen, beschriften, Ausfall-Meldungen).
- `core/llm/` — `failover.ts`, `probe.ts`, `context-probe.ts`, `chat-error.ts`, `endpoint-status-view.ts`.
- `core/memory/` — `memory.ts` (Memory-Notiz), `session.ts` (Sitzungen als JSONL; `SessionStore`).

## Die Obsidian-Schicht im Einzelnen

- `vault-tools.ts` — `VaultTools.run()`: führt Werkzeuge aus, routet nach der **Route** (Anbieter oder Wirt), nie nach dem Namen; fragt vor jedem Schreiben über `confirm-write.ts` (Vorschau gleich dem geschriebenen Inhalt; ein Ersetzen zeigt den Diff als Redline des Kits).
- `view.ts` — die Sidebar: Hub-Tabs (Chat · Kontext · Fähigkeiten), Kopfzeile im View-Inhalt, Verlauf, Eingabe mit „/“-Menü, Statuszeile; der Denkblock einer fertigen Antwort kommt aus dem Kit (`buildReasoningBlock`), der Strom aus `buildStreamArea`.
- `settings.ts` — der Settings-Tab; die Endpunkt-Liste kommt aus dem Kit (`buildEndpointList`), die Kontextfenster-Übernahme hängt im `clientFor().probe()` der Zeile. `model-control.ts` hängt die Zeilen der Modell-Steuerung in die deklarative Tabelle (Anweisung mit Laden, Kopieren und Zurücksetzen, Werkzeug-Liste mit Schalter und eigener Beschreibung); `prompt-modal.ts` zeigt die aktive Anweisung (ruft dieselbe `buildSystemPrompt` wie `ask()`); `skill-defaults.ts` die Skills als Grundeinstellung.
- `abilities-panel.ts`, `arbeiten.ts`, `arbeit-name-modal.ts`, `skill-segment.ts` (dünne Hülle um den Kit-Schalter `buildSegmentedControl`) — der Tab „Fähigkeiten“ und das Lesen und Schreiben der Arbeiten.
- `retrieval.ts` — liest die Plugin-API von vault-rag defensiv aus `app.plugins` (`apiVersion: 1`, Form geprüft).
- Werkzeuge fremder Plugins: `src/vendor/kit/tool-provider.ts` (Vertrag `ToolProviderApi`, `mountProviderTools`: der Wirt gewinnt jede Kollision, unter Anbietern der zuerst gelesene; Kollisionen werden gemeldet, nie überschrieben) und `src/vendor/kit-obsidian/tool-providers.ts` (`readProviderOffers`: liest alle Plugins mit `api.tools`, sortiert nach Id, frisch je Aufruf).

## Zustand

- Der Sitzungszustand liegt in **einem** Objekt, `plugin.session` (`arbeit`, `overlay`, `manual`, `bases`), und kommt mit dem Gespräch als `kind:"session"`-Marke im JSONL zurück; `contextMode`/`contextManual`/`contextBases` sind Zugriffsmethoden darauf. `contextOff` (Abwahl je Nachricht) bleibt bewusst außerhalb.
- Anzeige-Felder an Nachrichten, die nie an den Draht gehen: `thinking` (Denktext, Einstellung `saveThinking`), `context` (der Arbeitskontext-Block der Nutzer-Nachricht; nur in der Projektion eingewoben).

## Herkunft der Bausteine

Die LLM-Klempnerei kommt aus der Bibliothek, nicht aus Eigenbau (Prüfung vor jedem Neubau: `REGISTRY.md` im Dach, `naehte_suche.py`):

- SSE, Denk-Trennung, Reasoning, Capabilities, Kontextlängen: code-kit (`sse`, `think-splitter`, `reasoning`, `capabilities`, `model-context`, `think-toggle`, `sampling-profiles`, `stream-blocks`: fertige Absätze rendern, den laufenden als Rohtext lassen, ein offener ```-Zaun ist keine Grenze); Chat-Transport und Anthropic-Transport: obsidian-kit (`chat-transport`, `anthropic-transport`).
- Endpunkte: code-kit `endpoint`, `endpoint_config`, obsidian-kit `endpoint-list`, `endpoint-secrets`, `endpoint-source` (LLM Endpoint Manager).
- Pfade und Ordner: code-kit `rel-path` (Pfad-Guard) und `folder-scope` (Zugehörigkeit zu einem Ordner, Lesart `filesystem` für geschützte Unterordner).
- Tolerantes JSON aus Modellantworten: code-kit `llm-json`. Eingabe-Prüfung gegen das Schema der Anbieter-Werkzeuge: `validate-input`.
- UI-Bausteine: Hub-Tabs, Streaming-Bereich samt Denkblock, Segment-Schalter, Redline, Confirm-Dialog, Textarea-Vorschläge, Einklappbares, Zwischenablage mit Quittung — alle aus obsidian-kit.
- Genuin neu: der Agent-Kern (Tool-Calling-Loop, Skill-Loader, Compaction), der Arbeitskontext und die Fähigkeiten und Arbeiten.
