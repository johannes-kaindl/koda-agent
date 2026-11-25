# Messrahmen — Kodas Agenten-Rahmen gegen echte Modelle messen

Seit Welle 38 (2026-11-25). Anlass ist der Abgleich des Agenten-Rahmens mit dem Stand der Technik (Coding-Cockpit, `_SDD/2026-11-25-abgleich-agenten-rahmen`): Bis dahin gab es keinen Aufgabensatz mit Prüfung des Ergebnisses und keine Wiederholungen; ein Lauf je Fall ist eine Anekdote (Dach-`REGISTRY.md`, Methodik-Gotcha).

## Zweck

Der Rahmen beantwortet zwei Fragen mit Zahlen statt mit Eindrücken: Wie gut bedient ein lokales Modell Kodas Loop (Erfolgsrate, pass^3, Runden, Fehlaufrufe)? Und hilft eine der drei billigen Änderungen (Arme a bis c) oder schadet sie?

## Aufbau

Alles liegt unter `scripts/messrahmen/` und läuft in Node, ohne Obsidian.

- `laeufer.ts` fährt eine Aufgabe durch den echten `runAgent` mit den echten `VaultTools`, dem echten `buildSystemPrompt` und dem echten `KodaChatClient` (Temperatur 0.2 und `max_tokens` 8192 wie im Betrieb; alle übrigen Werte aus `DEFAULT_SETTINGS`). Ersetzt sind nur die Ränder: ein Speicher-Vault hinter `VaultPort` (`speicher-vault.ts`), ein fetch-Transport statt XHR, eine TaskNotes-Attrappe (`tasknotes-attrappe.ts`), automatische Bestätigung (immer ja, gezählt) und eine feste Uhr (2026-11-25 14:37, Europe/Berlin).
- `vault-stand.ts` baut den Startstand aus der Fixture `docs/images/fixture/notes/` und erfundenen Zusatznotizen (Rezeptordner, langes Sitzungsprotokoll, vier Notizen mit eingeschleustem Satz, TaskNotes-Aufgaben).
- `aufgaben.ts` enthält 24 Aufgaben: Suchen (2), Lesen mehrerer Notizen (2), Ordner listen (2), Notiz im Koda-Ordner anlegen (2), Anhängen, Merken, Verschieben mit Bestätigung, TaskNotes (2), Datum (2), Skill laden, ein Gespräch mit drei Folgefragen, vier Fälle mit eingeschleustem Satz, drei Fälle ohne Werkzeug. Jede Aufgabe nennt ihren Anlass, ihre Prüfungen, eine Musterlösung und eine falsche Lösung.
- `pruefer.ts` prüft deterministisch, ohne Modell als Richter: Endzustand (Datei da, Inhalt enthält X, unverändert, verschoben), Antwort enthält X, und an jeder Aufgabe „kein Schreiben außerhalb der erlaubten Pfade“ (am Protokoll jedes Schreibvorgangs, nicht nur am Endzustand). Die Werkzeugfolge wird nur geprüft, wo sie zwingend ist: Skill laden, drei Notizen lesen, kein Werkzeug.
- `auswertung.ts` schreibt den Bericht; `attrappe.ts` ist der Attrappen-Endpunkt für den Trockenlauf; `cli.ts` ist der Aufruf.

Die Form der Prüfer und des Berichts folgt `tool-calling-parcour` (eigenes Lab-Repo, siehe Dach-`REGISTRY.md`): `{ pass, note }`, Fähigkeit und Tempo getrennt, Ladezeit als eigene Spalte. Importiert wird von dort nichts: das Parcour misst Modelle ohne Konsumenten-Code, dieser Rahmen misst Kodas Loop.

## Arme

Die drei Arme sind interne Schalter (`src/core/agent/rahmen.ts`), kein Settings-Feld und keine Oberfläche; nur der Läufer setzt sie. Der Standard ist das Verhalten davor, `tests/rahmen_schalter.test.ts` belegt das je Schalter.

| Arm | Schalter | Wirkung |
|---|---|---|
| `basis` | keiner | Stand des Plugins |
| `a` | `nowNurDatum` | `## Now` trägt Datum und Wochentag statt der Minute; die Uhrzeit liefert `get_datetime` |
| `b` | `leseGrenzeZeichen` 8000, `memoryGrenzeZeichen` 2000 | `read_note` kappt hinten, `Memory.md` im Prompt vorn; die Kappung steht in Zeile 1 |
| `c` | `wiederholungsHinweis` | Scheitert derselbe Aufruf zweimal hintereinander gleich, trägt der zweite Fehler einen Hinweis |

## Aufruf

Aus dem Repo-Ordner (der Läufer liest die Fixture relativ zum Arbeitsverzeichnis). Der Bundle-Schritt legt die Datei außerhalb des Repos ab:

```bash
npx esbuild scripts/messrahmen/cli.ts --bundle --platform=node --format=esm --outfile="$TMPDIR/messrahmen.mjs" --log-level=warning
node "$TMPDIR/messrahmen.mjs" --endpoint http://127.0.0.1:1234 --modelle <id>[,<id>] --arme basis,a,b,c --wiederholungen 5 --out <ordner>
node "$TMPDIR/messrahmen.mjs" --attrappe muster --out <ordner>    # Trockenlauf, kein Modell
```

Weitere Schalter: `--aufgaben <id,…>`, `--fenster <Token>` (Standard 8192 wie die Einstellung), `--timeout-sec`, `--denken` (Denken nicht unterdrücken), `--seed`, `--kein-aufwaermen`, `--apikey-env <NAME>` (der Schlüssel kommt nur aus der Umgebung, nie von der Befehlszeile). Ein abgebrochener Lauf setzt mit demselben `--out` fort: fertige Läufe stehen in `laeufe.jsonl` und werden übersprungen. Die Ergebnisse gehören ins Coding-Cockpit (`_SDD/`), nicht ins Repo.

## Maße

Je Lauf: bestanden mit Gründen, Runden (Modellaufrufe des Loops ohne Zusammenfassungen), Werkzeugaufrufe, Fehler-Ergebnisse, identische Wiederholungen (Name und Argumente wie ein früherer Aufruf), Verdichtungen, Überlauf-Wiederholungen (erzwungene Verdichtung), Rundenlimit, Bestätigungen, Prompt- und Antwort-Token und wiederverwendete Prompt-Token (falls der Server sie meldet), Zeit bis zum ersten Token des ersten Aufrufs, Gesamtzeit. Die Ladezeit misst ein Aufwärmlauf je Modell vor der Serie, getrennt in `ladezeit.json`. Der Bericht (`bericht.md`) rechnet je Modell und Arm Erfolgsrate, pass^3 (Schätzer C(c,3)/C(n,3) je Aufgabe, gemittelt) und Median der Runden; dazu Erfolg je Aufgabe und eine Zeile je Fehlschlag. Die Aufgaben laufen je Wiederholung in gemischter, fester Reihenfolge.

## Gegenprobe

`tests/messrahmen.test.ts` fährt jede Aufgabe zweimal durch den echten Loop und HTTP gegen die Attrappe: die Musterlösung besteht, die falsche fällt durch. Dazu belegt er, dass Arm a am Draht und Arm b am Werkzeug ankommt. Eine Mutation, die `antwortTrifft` immer bestehen lässt, macht neun Tests rot (gemessen 2026-11-25).

## Grenzen

- Kein Failover zwischen Endpunkten, keine Bilder, kein llm-lab, keine Arbeit und kein Overlay, kein Arbeitskontext-Block an der Nutzer-Nachricht (der Läufer ist kein offenes Obsidian). Fälle, die die Ansicht oder den Bestätigungs-Dialog brauchen, bleiben bei `gui:ask`.
- Ohne vault-rag: `search_notes` liefert nur die Volltextsuche, `related_notes` fehlt.
- Die TaskNotes-Attrappe vereinfacht Dateinamen, Feld-Mapping und Standardwerte des echten Plugins.
- Bestätigungen sind immer ja. Für die Injektionsfälle ist das der ungünstigste Fall (ein Mensch, der blind bestätigt); gezählt wird, ob das Modell den eingeschleusten Schritt versucht.
- Der Transport sendet zusätzlich `stream_options.include_usage`, damit der Server Token meldet; das Plugin sendet es nicht.
- Das Kontextfenster ist die Einstellung, nicht das geladene Fenster des Servers; ein Server mit kleinerem Fenster meldet Überläufe, die das Plugin genauso sähe.
- Fünf Läufe je Aufgabe beurteilen eine einzelne Aufgabe nur grob; belastbar ist die Rate über den Satz.
- Die Musterlösungen prüfen den Prüfer, nicht die Aufgabe: eine Aufgabe, die ein Modell aus gutem Grund anders löst, fällt trotzdem durch. Deshalb vor jedem Urteil die Verläufe der Fehlschläge lesen.
