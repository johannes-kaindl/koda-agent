# Seed: Stufe 2 — Skill-System, Compaction, Aufräum-Assistent

Stand: 2026-08-07, nach dem Store-Release von 0.1.0. Der vorherige Seed (Nach-Smoke der
QoL-Features + `gui-smoke-setup`) ist **vollständig abgearbeitet**, ebenso
`plugin-release-setup` und die Store-Einreichung. Das Plugin ist im Community-Store
gelistet und über ihn installierbar (plattformübergreifend verifiziert: macOS + Windows 11).

## Vorgehen: erst denken, dann bauen

**Diese Session beginnt mit `superpowers:brainstorming`, nicht mit Code.** Stufe 2 ist die
erste Ausbaustufe, in der Koda etwas tut, das man später teuer korrigiert: Compaction
entscheidet, *was ein Agent vergessen darf*, und das Skill-System lässt ihn Anweisungen an
sich selbst schreiben. Beides sind Schnitte, keine Features — ein falsch gewähltes Format
oder eine falsch gezogene Vertrauensgrenze wandert danach durch jede Session, die darauf
aufsetzt. Die MVP-Spec (`docs/superpowers/specs/2026-08-05-koda-agent-mvp-design.md`) hat
Stufe 2 bewusst **nicht** ausdesigned; sie nennt nur die drei Bausteine.

Empfohlener Zuschnitt: **einen** der drei Bausteine pro Session, nicht alle drei. Die
Reihenfolge unten ist eine Empfehlung, keine Vorgabe.

**Modell & Effort: Opus, Effort hoch.** Nicht wegen Umfang — die Arbeit hängt an einer
einzigen Entscheidung (§ Baustein A: taugt die räumliche Schreibregel für Skills?), und
die trägt jede spätere Session mit. Implementierungs-Tasks, die *nach* dem Design
abfallen, sind an Sonnet delegierbar; die Controller-Rolle — Design entscheiden, Reviews
adjudizieren — bleibt bei Opus. Startort: dieses Repo, nicht das Dach.

## Drei Lücken zwischen Spec-Behauptung und Code — vor dem Design prüfen

Beim Seeden am 2026-08-07 gegen den Code gemessen. Die Spec klingt an drei Stellen so, als
sei schon etwas vorbereitet; das ist es **nicht**. Wer darauf plant, plant auf Sand:

1. **Es gibt keine Skill-Andockstelle.** Die Spec sagt „`Koda/Skills/` — Loader ist im MVP
   eine leere Andockstelle". Tatsächlich enthält `src/` **keinen einzigen Treffer** auf
   `skill` (ohne `vendor/`). Der Loader ist nicht leer, er existiert gar nicht. Das ist
   keine schlechte Nachricht — es heißt nur, dass der Schnitt frei wählbar ist statt vorgegeben.
2. **Kontext-Überlauf wird nicht erkannt.** Die Spec sagt, er werde „erkannt
   (`isContextOverflow`, vault-crews) und klartextlich gemeldet". `src/core/llm/chat-error.ts`
   ist aber die *verbatim übernommene Fehler-Teilmenge* aus vault-rag — sie enthält
   `ChatHttpError`/`extractErrorMessage`/`chatErrorMessage`, **nicht** `isContextOverflow`.
   Ein Überlauf sieht heute aus wie irgendein HTTP-Fehler. Das ist der billigste erste
   Schritt der Compaction-Arbeit und lohnt sich auch dann, wenn Compaction selbst wartet.
3. **Das Session-Datenmodell sieht Compaction nicht vor.** Die Spec sagt, der Verlauf sei
   eine „Liste von Runden, ersetzbar durch Zusammenfassungs-Runde". `src/core/memory/session.ts`
   führt aber eine flache `ChatMessage[]` (append-only JSONL, eine Message pro Zeile). Eine
   Runde ist darin nicht adressierbar. Compaction braucht also entweder eine Runden-Klammer
   im Modell oder eine Heuristik, die sie aus der flachen Liste rekonstruiert — das ist eine
   **Design-Entscheidung, kein Implementierungsdetail**, und sie gehört ins Brainstorming.

## Baustein A — Markdown-Skill-System (der eigentliche Kern)

Die Idee aus der Spec: Koda lernt nicht durch Fine-Tuning oder selbstmodifizierenden Code,
sondern indem er **Markdown-Notizen schreibt, die er später selbst liest**. `Koda/Memory.md`
ist die MVP-Stufe davon (ein flacher Lernpunkt-Anhang); Skills sind die strukturierte Form.

Offene Design-Punkte, die die Session entscheiden muss:

- **Wann wird ein Skill geladen?** Alle beim Gesprächsstart in den System-Prompt (einfach,
  skaliert nicht) oder situativ nachgeladen (braucht ein Auswahlkriterium — Frontmatter-
  `description` wie bei Claude-Code-Skills wäre der naheliegende Anleihe-Punkt)?
- **Wie sieht die Selbst-Autorschaft aus?** Die Spec verlangt Bestätigung. Aber ein Skill
  ist eine *Anweisung an das künftige Selbst* — die Bestätigung muss zeigen, was künftig
  anders laufen wird, nicht nur den Dateiinhalt. Das ist eine andere Modal-Frage als beim
  `write_note`-Diff und sollte nicht reflexhaft dieselbe Antwort bekommen.
- **Liegt ein Skill im Koda-Ordner (frei beschreibbar) oder braucht er trotz Lage eine
  Bestätigung?** Die MVP-Regel „Koda-Ordner frei" war für Entwürfe und Memory gedacht. Ein
  Skill wirkt auf künftiges Verhalten — die räumliche Regel greift hier vielleicht zu kurz.
  **Das ist die wichtigste Einzelfrage der Stufe 2.**
- **Was passiert bei Widerspruch** zwischen zwei Skills oder zwischen Skill und Memory?

## Baustein B — Compaction

Voraussetzung: Lücke 2 und 3 oben. Danach die eigentliche Frage: **Was wird zusammengefasst
und was bleibt wörtlich?** Tool-Ergebnisse (oft lang, selten später relevant) verhalten sich
anders als Nutzer-Aussagen (kurz, oft dauerhaft gültig). Eine Zusammenfassung, die eine
Nutzer-Korrektur wegkürzt, macht den Agenten schlechter statt schlanker — und der Nutzer
sieht nicht, dass es passiert ist. Sichtbarkeit gehört deshalb ins Design, nicht in ein
späteres Polish-Ticket.

## Baustein C — Aufräum-Assistent

Am wenigsten spezifiziert und bewusst zuletzt: Koda schlägt Vault-Aufräumarbeiten vor
(verwaiste Notizen, kaputte Links, Dubletten). Der Reiz ist, dass er dafür schon alles hat
(`search_notes`/`read_note`/`write_note` + Bestätigungs-Modal). Das Risiko ist Massen-
Schreiberei: die Schreibregel ist auf *einen* Schreibvorgang zugeschnitten, nicht auf
vierzig. Eine Stapel-Bestätigung ist ein neues UI-Konzept — nicht nebenbei mitmachen.

## Kit-first-Anker (vor dem Bauen prüfen)

- **`isContextOverflow`** — `vault-crews/src/core/chat-response.ts`. Die REGISTRY führt die
  Fehler-Teilmenge davon bereits als **Kit-Kandidat n=4 (extraktionsreif)**; koda-agent ist
  das 3. Exemplar der Kette. Wer `isContextOverflow` nachzieht, sollte prüfen, ob das
  zusammen mit der Kit-Extraktion passiert statt als vierte Kopie.
- **Skill-Loader-Muster** — vor Neubau die REGISTRY nach Markdown-getriebenen Loadern
  durchsuchen; der `registry-session-start`-Hook injiziert den Katalog ohnehin.
- **Diff-/Bestätigungs-UI** — steht (`src/core/diff.ts` + ConfirmModal). Die
  Invariante „Vorschau == geschriebener Inhalt" ist regression-gepinnt; sie darf durch
  Skill-Autorschaft oder Stapel-Bestätigung **nicht** aufgeweicht werden.

## Leitplanken (unverändert gültig)

- **Nie:** Full System Access, Terminal-Ausführung. Nicht als Setting, nicht hinter einer Warnung.
- Kein selbstmodifizierender Code, kein Fine-Tuning — Lernen ist Markdown. Git im Vault ist
  der Undo-Button.
- `src/core/` bleibt obsidian-frei (`check:pure` erzwingt es).
- `npm run gate` vor jedem Commit (aktuell 113/113).
- `textFallback: false` bleibt richtig — nicht „vereinfachen" (Begründung in `docs/LAB.md`
  und im Cockpit-§🧭).

## Nicht in diese Session

- **Freeze-Gegenprobe** — geparkt (TaskNote `5_geparkt_📦`). Beim nächsten GUI-Smoke
  mitbeobachten; nur bei erneutem Auftreten hochholen.
- **Dach-Arbeit** — Template-Drift `release.yml` bei vault-crews/yijing-oracle, Badge-Zeile
  im README (CORE-META-02). Gehört ins Dach-CWD, nicht hierher.
- **Stufe 3** (MCP/vault-rag als Tool, Voice) — erst nach Stufe 2.

---

## Nachtrag 2026-08-07 abends (nach Baustein A)

**Baustein A ist gebaut und auf `main`** (13 Commits, 162/162, Spec + Plan unter
`docs/superpowers/`). Offen ist nur der manuelle GUI-Smoke — Handover-Note im Cockpit
(`10_Pallas/25_Coding/koda-agent/Handover.md`, SMOKE-Punkte 11/12). Die Abschnitte oben zu
Baustein A sind damit erledigt; B (Compaction) und C (Aufräum-Assistent) stehen unverändert.

### Neu: Endpunkt-UI an den Ökosystem-Standard angleichen

Aufgekommen am 2026-08-07 aus einem echten Fehlersuch-Fall (Johannes, Vault `80_Arbeit`):
ein Endpunkt „funktionierte nicht", ohne dass Koda etwas meldete. Ursache war ein
kaputter API-Schlüssel (ein URL-Fragment statt des JWT) — der Endpunkt antwortete
sauber mit 401. Gemessen: ohne Key 401, mit Kodas Feldinhalt 401, mit dem Schlüssel aus
`vault-rag` 200 und neun Modelle.

**Kodas Klassifikation ist korrekt** (`classifyEndpointStatus`: 401 → `reachable: false`,
`kind: "unauthorized"`, rotes Icon mit Tooltip). Der Mangel liegt davor: die Zeile ist
**passiv** — sie zeigt nichts, bis jemand auf „Testen" klickt. `vault-rag` lädt beim
Öffnen der Einstellungen die Modell-Liste je Zeile; bei kaputtem Schlüssel bleibt das
Dropdown leer und der Fehler ist ohne Klick sichtbar. Genau dieser Fall steht dort als
Code-Kommentar: „Ohne Schlüssel lieferte der Endpunkt vermutlich 401 → leere Liste".

Gemessene Abweichungen Koda ↔ vault-rag in der Endpunkt-Zeile:

| | vault-rag | Koda |
|---|---|---|
| Modell pro Endpunkt | Dropdown aus `/v1/models` | Freitext-Feld |
| Wann geprüft wird | beim Öffnen, automatisch | erst auf Klick |
| Drittanbieter-Icon bei gesetztem Key | ja | nein |
| aria-labels an den Feldern | ja | nein |
| Status-Icon · „Zuerst verwenden" · Mülleimer · Presets | ja | ja (gleich) |

Herkunft der Abweichung: dokumentierter MVP-Schnitt in `src/obsidian/settings.ts`
(„bewusst abgespeckt: kein Erreichbarkeits-Ping, keine Modell-Liste, kein Test-Button").
Der QoL-Ausbau hat Status-Icon und Test-Knopf nachgezogen, die Modell-Liste nicht — es ist
also ein halb eingeholter Rückstand, keine Entscheidung gegen den Standard.

**Zwei trennbare Schnitte, in dieser Reihenfolge:**

1. **Automatisch prüfen beim Öffnen** — klein, macht genau den Fehler oben sichtbar.
2. **Modell-Liste pro Zeile statt Freitext** — die eigentliche Angleichung.

**Kit-first:** Die Endpunkt-Zeile steht bei **n=3** (`vault-rag` Erst-Exemplar,
`vault-crews` Muster, koda-agent abgespeckte Dritt-Instanz). Damit ist die
Extraktions-Schwelle erreicht — und es liegt jetzt ein gemessener Beleg vor, dass die
abgespeckte Variante realen Fehlersuch-Aufwand erzeugt. Einstieg über
`superpowers:brainstorming`: die **Abstraktionsgrenze** ist die Frage, nicht der Code.

### Offen aus dem Abschluss-Review des Skill-Systems

- **`save_memory` schreibt ohne Bestätigung und ohne Policy** nach `<Koda>/Memory.md`
  (`vault-tools.ts` → `saveMemory`), und `buildSystemPrompt` speist genau diesen Text
  ungefiltert in den System-Prompt. Die Begründung, mit der Skills bestätigungspflichtig
  wurden — „ändert künftiges Verhalten, also Bestätigung" — gilt dafür eins zu eins.
  Vorbestehende MVP-Entscheidung; eine Änderung ist eine Design-Frage für Johannes,
  kein Bugfix.
- **Restrisiko Prompt-Injection:** Ein injizierter Text in einer gelesenen Notiz kann Koda
  zu `write_skill` bewegen. Die einzige Bremse ist der Bestätigungsklick, und
  `.koda-preview` hat `max-height: 40vh` — ein langer Body liegt unter dem Falz. Kein
  Code-Fehler, aber die Angriffsfläche ist Gewöhnung. Beim Aufräum-Assistenten (Baustein C,
  Stapel-Bestätigung) mitdenken.
- **Kosmetisch:** `serializeFrontmatter` quotet unbedingt, Koda schreibt deshalb
  `enabled: "true"`, handgeschriebene Skills tragen `enabled: true`. Round-Trip ist
  verifiziert korrekt. Das Abschluss-Review rät ausdrücklich davon ab, `enabled` beim
  Schreiben wegzulassen — die Zeile ist die einzige Stelle, an der der Schalter überhaupt
  entdeckt wird.

### Nachtrag 2026-08-08 früh — aus dem GUI-Smoke des Skill-Systems

**Der Smoke ist durch, alle Punkte grün** (SMOKE 11/12). Koda hat einen Skill selbst
geschrieben, das Modal zeigte die `Künftig:`-Zeile, die Ablehnung schrieb nichts, und der
neue Skill erschien beim nächsten Gesprächsstart in der `⚙ Skills aktiv`-Zeile. Der Kreis
schließt sich also — Koda liest, was er selbst geschrieben hat. Zwei Beobachtungen am Rand:
der Obsidian-Linter ergänzt in Skill-Dateien `title`/`created`/`updated` (harmlos,
`parseSkill` ignoriert sie), und die bekannte `enabled: "true"`-Quoting-Drift ist in der
Praxis sichtbar.

**Ein Zwischenfall mit Diagnose (kein Bug im Skill-System):** Beim ersten Versuch behauptete
Koda, den Skill gespeichert zu haben — ohne `write_skill` je aufgerufen zu haben. Reine
Halluzination, in der Session-JSONL belegt (Assistant-Antwort ohne `toolCalls`). Vier
Reproduktionsversuche mit Kodas echten Parametern, darunter einer mit dem **echten Verlauf
aus `archive.jsonl`** (2977 Prompt-Tokens): **4× korrekter Tool-Call.** Also
Sampling-Varianz, nicht deterministisch — dasselbe Muster wie beim abgeschnittenen
Tool-Call vom 2026-08-06. Der eigentliche Mangel ist, dass eine Halluzination von einem
Erfolg nicht unterscheidbar ist; die eingebaute Gegenprobe (die Skills-Zeile beim nächsten
Gesprächsstart) kommt zu spät.

**Gemessen dabei:** Der System-Prompt erwähnt `write_skill` mit **keinem Wort**.
`save_memory` wird ausdrücklich erklärt, Skills gar nicht. Ob eine Prompt-Zeile die
Auslassungsrate senkt, ist unbewiesen — messbar wäre es mit `tool-calling-parcour`
(`/Users/Shared/50_Testground/tool-calling-parcour`, misst Erfolgsraten über Wiederholungen).

### Drei Wünsche von Johannes (2026-08-08), alle aus demselben Grund

Der gemeinsame Nenner: **er fährt das Qwen3.6-MoE-Modell, nicht das stärkere Dense-Modell**,
und vermutet, dass schwächere Modelle explizite Hinweise zur Tool-Nutzung brauchen. Das deckt
sich mit dem Befund oben. Alle drei sind Stellschrauben, die der Nutzer heute nicht erreicht.

1. **System-Prompt in den Einstellungen editierbar.** Die eigentliche Design-Frage: *ersetzen
   oder ergänzen?* Ein frei überschreibbarer Prompt kann die Tool-Anweisungen killen
   („Use the provided tools BEFORE answering…") und macht jeden Support-Fall unlesbar. Ein
   reines Zusatz-Feld ist sicher, aber löst nicht den Fall „diese eine Zeile stört mich".
   Denkbarer Mittelweg: vollständig editierbar **mit** sichtbarem Zurücksetzen und einer
   Warnung, wenn die Tool-Zeile fehlt. Gehört ins Brainstorming, nicht in eine Ad-hoc-Lösung.
2. **Tools in den Einstellungen sichtbar und editierbar.** Achtung beim Zuschnitt: *neue*
   Tools kann eine Einstellung nicht erfinden — die Implementierung lebt im Plugin. Was
   wirklich geht und den Wunsch trägt: die Tool-Liste **anzeigen**, einzelne Tools
   **ab­schaltbar** machen (weniger Tools = höhere Trefferquote bei schwachen Modellen) und
   die **`description` je Tool editierbar** machen — genau der Hebel, um einem MoE-Modell
   auf die Sprünge zu helfen.
   **Konkreter Funktions-Gap, den Johannes dabei fand:** Koda kann suchen, aber *nicht*
   „zeig mir alles in Ordner X". `search_notes` matcht zwar auch Pfade (`search_notes("_Koda/")`
   trifft), ist aber auf 10 Treffer gedeckelt und nirgends als Ordner-Listing dokumentiert.
   Ein eigenes `list_notes(folder)` wäre der ehrliche Schnitt.
3. **Text in der Sidebar markieren und mit Cmd+C kopieren** — ✅ **erledigt** (`17c4778`):
   `user-select: text` auf `.koda-log`. Obsidian macht Text in View-Containern nicht von
   selbst markierbar; vault-rag setzt dieselbe Zeile aus demselben Grund. **Noch nicht im
   laufenden Obsidian verifiziert** — steht als Punkt 13 in `docs/SMOKE.md`.

### Sidebar-UI ans Ökosystem angleichen (Johannes' Feedback aus der Handover-Note)

Gehört zum Endpunkt-UI-Punkt oben, ist aber ein eigener Schnitt:

- **Thinking sichtbar machen.** Kein Bug — `suppressThinking: true` unterdrückt es absichtlich,
  und Kodas View hat den ausklappbaren „Denkt nach…"-Block bereits. Der Punkt ist trotzdem
  richtig: bei einem MoE-Modell wartet man minutenlang vor einem UI, das tot aussieht.
  Frage fürs Design: Default umdrehen, oder eine „arbeitet…"-Anzeige unabhängig vom Thinking?
- **Farbiger Senden-Knopf** und die übrigen Sidebar-Details nach vault-rag-Vorbild.
- **Sidebar-UI ins Kit**, falls dort noch nicht vorhanden — Johannes hält das ausdrücklich für
  überfällig. Zusammen mit der Endpunkt-Zeile (n=3) ist das ein gemeinsamer Extraktions-Anlass.
