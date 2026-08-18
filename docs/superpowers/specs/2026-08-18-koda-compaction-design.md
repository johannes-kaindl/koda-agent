# Koda: Compaction — Verdichtung des Gesprächsverlaufs (Design)

Stand: 2026-08-18. Stufe-2-Baustein B aus `docs/NEXT-SESSION.md`. Betrifft nur
`koda-agent`. Entstanden im Brainstorming (Fragen → Entscheidungen → fünf
Design-Abschnitte, jeder einzeln bestätigt).

## Anlass

Koda soll mit **kleinen lokalen Modellen** laufen (Kontextfenster 4K–32K), und die
Aufträge, für die es gebaut ist, wachsen *innerhalb einer Runde*: „geh die 80 Notizen
in diesem Ordner durch" ist ein `ask()` mit bis zu 50 Tool-Runden, und jedes
`read_note`/`list_notes` schleppt sich fortan mit. Ohne Verdichtung stirbt so ein
Auftrag am Kontextfenster — je nach Server mit HTTP-Fehler oder still gekürzt.
Koda selbst wurde bisher wenig eingesetzt; die Spec **antizipiert** den Fall, statt
einen gemessenen Ausfall zu reparieren. Das ist bewusst: Compaction ist ein Schnitt
(*was darf ein Gespräch verlieren?*), und ein falsch gezogener wandert durch jede
spätere Session.

## Vorgelagert: der Zuschnitt

Aufgekommen ist im Brainstorming auch der Wunsch nach unbeaufsichtigtem Betrieb
(Nachtlauf über den ganzen Vault, Ralph-Loops). Das ist per Dach-`AGENTS.md`
§ „Zuständigkeits-Zuschnitt" **nicht Koda**: *„Soll etwas ohne dich laufen, ist es
eine Crew. Wird etwas mit dir besprochen, ist es Koda."* Koda darf frei entscheiden,
*weil* ein Mensch danebensitzt und jeden Schreibvorgang außerhalb des Koda-Ordners
bestätigt — ein Modal, das nachts niemand klickt. Diese Spec legt Compaction deshalb
auf **lange, beaufsichtigte Einzelaufträge** aus. Der Mechanismus (Verdichtung im
Loop) wäre für einen autonomen Modus derselbe; ob es den je gibt, ist eine eigene
Entscheidung im Dach, keine Nebenwirkung dieser Spec. (Entschieden 2026-08-18,
Option (a) von dreien.)

## Gemessener Ausgangsbefund

Erhoben am 2026-08-18 gegen den Code, nicht angenommen — und in zwei Punkten
kleiner als der Seed vom 2026-08-07 befürchtete:

- **Lücke 2 (Überlauf-Erkennung) ist eine Fünf-Zeilen-Übernahme.** vault-crews'
  `chat-response.ts` hat `isContextOverflow(body)` = `/context (length|window)|too many
  tokens/i` auf dem Fehlerbody. Kodas `chat-error.ts` ist ohnehin die verbatim
  übernommene Fehler-Familie (REGISTRY: n=4-Kette). Heute liefert Koda bei Überlauf
  `LlmResult.kind = "http"` mit dem Server-Text — sichtbar, aber unklassifiziert.
- **Lücke 3 (Runden-Datenmodell) ist kleiner als gedacht.** `chatLog` ist eine flache
  `ChatMessage[]`, aber der System-Prompt wird je `ask()` frisch gebaut und **nicht**
  gespeichert; im JSONL stehen nur `user`/`assistant`/`tool`. Eine Runde beginnt damit
  eindeutig bei jeder `user`-Nachricht und ist aus der flachen Liste rekonstruierbar.
  Was fehlt, ist keine Klammer, sondern eine Repräsentation für „ersetzt durch".
- **Compaction gibt es im Ökosystem nirgends.** vault-crews macht bei Overflow einen
  reaktiven Retry mit halbiertem Material; `kuro-gamification` verdichtet Tagesnotizen,
  keine Verläufe. Genuin neu — wie CLAUDE.md sagt („nur der Agent-Kern ist neu").
- Im Kit vorhanden, in Koda noch nicht vendored: `model-context.ts`
  (`parseLmStudioContext`/`parseOllamaContext`, 5 Nutzer).
- `runAgent` (`src/core/agent/loop.ts`, 104 Zeilen) ist pure, kennt nur Ports und
  gibt die *neu erzeugten* Nachrichten zurück; `main.ts` persistiert und rendert sie.
  Genau dieser Rückgabekanal trägt auch die Verdichtungs-Records.
- Die View rendert Tool-Ergebnisse heute schon als eingeklappte `<details>`; das
  Muster für „aufklappbar, prüfbar" existiert.

## Entscheidungen

Fünf Weichen, im Brainstorming je mit Empfehlung gestellt und bestätigt:

1. **Trigger: proaktiv im Loop + reaktives Netz.** Verdichtet wird *zwischen
   Tool-Runden* nach Budget-Schätzung, nicht erst beim nächsten Nutzer-Turn; der
   Überlauf-Fehler des Servers ist die zweite Verteidigungslinie. Reaktiv allein
   kostet je Verdichtung einen verlorenen Request und greift bei Servern, die still
   kürzen, nie.
2. **Verlust-Regel: Nutzer-Nachrichten sind unantastbar, alles andere ist
   verdichtbar.** Sie sind die einzige Sorte, deren Verlust *unsichtbar* schadet (eine
   weggekürzte Korrektur zeigt sich nur als wiederholter Fehler), und zugleich die
   billigste (kurz, wenige). Tool-Ergebnisse sind aus dem Vault rekonstruierbar und
   im Moment des Lesens schon verarbeitet; ihr Verlust ist *sichtbar* (Koda liest neu).
3. **Fenster: sichtbare Einstellung als Wahrheit, vom Endpunkt vorbefüllt, wo er es
   meldet.** Grenzen, die still Verhalten weglassen, gehören sichtbar (Skill-Budget,
   `list_notes`-Kappung — dieselbe Linie). Nur LM Studio und Ollama melden ihr Fenster;
   reine Auto-Erkennung wäre bei der Hälfte der Endpunkte blind. Token werden als
   Zeichen÷4 geschätzt — grob, aber wir zielen auf eine Schwelle, nicht auf die Kante.
4. **Zweistufig: erst deterministisch (Tool-Stubs), Modell-Zusammenfassung nur, wenn
   das nicht reicht.** In einem Agent-Lauf steckt das Volumen fast ausschließlich in
   Tool-Ergebnissen (Kilobytes je `read_note`); Stufe 1 ist kostenlos, pure,
   deterministisch und deckt die meisten Läufe. Stufe 2 kostet lokal Minuten und ist
   die unzuverlässigste Stelle im System — deshalb zuletzt und selten, aber sie muss
   existieren, sonst ist der Mehrstunden-Fall (Grund des Bausteins) offen.
5. **Zwei Schichten mit Marke: der Nutzer sieht immer den vollen Verlauf, das Modell
   die verdichtete Projektion, jede Verdichtung hinterlässt eine Marke im Chat.**
   Compaction ändert, was das *Modell* weiß — nicht, was der Nutzer gesagt und gesehen
   hat. Die Zusammenfassung ist lesbar, prüfbar, widersprechbar (dasselbe Muster wie
   die Skill-Notiz am Gesprächsanfang). Persistenz bleibt append-only.

Nachträglich (Abschnitt 3): **Was beobachtbares Verhalten steuert, wird eine
Einstellung** in einer eigenen Gruppe; reine Mechanik bleibt Konstante. Ein Nutzer
mit 128K-Fenster will nie verdichten, einer mit 4K will K=1.

## Architektur & Datenfluss

**Grundidee: Der Verlauf bleibt, was er ist; neu ist eine *Projektion* fürs Modell.**

Zwischen Verlauf und Draht steht `projectForModel(entries): ChatMessage[]`. Der
Verlauf wird `LogEntry[]` = `ChatMessage | CompactionRecord`. Ohne Record ist die
Projektion identisch zum Verlauf — **Bestandsverhalten unverändert, alte
JSONL-Dateien lesen sich wie bisher.**

Der Loop (`src/core/agent/loop.ts`, bleibt pure):

```
für jede Runde:
  msgs = projectForModel([system, ...history, ...appended])
  wenn estimateTokens(msgs, toolDefs) > budget:
      rec = compactStage1(...)            → appended.push(rec); neu projizieren
      wenn immer noch > budget und Stufe 2 an und abgeschlossene Runden existieren:
          rec = await compactStage2(...)  → appended.push(rec); neu projizieren
  r = llm.complete(msgs, …)
  wenn r.kind === "overflow" (reaktiv, pro ask() genau einmal):
      erzwungene Verdichtung (Stufe 1 mit K=0, dann Stufe 2) + dieselbe Runde wiederholen
      beim zweiten Mal (oder ohne Verdichtungsmasse): Fehler-Event "overflow" mit Klartext
```

Records landen in `appended` — **im selben Rückgabekanal wie Nachrichten**;
`main.ts` persistiert und rendert sie ohne neuen Pfad.

Modulschnitt, alles unter `src/core/` (obsidian-frei, `check:pure`):

| Modul | tut | hängt ab von |
|---|---|---|
| `core/agent/compaction/project.ts` | `projectForModel(entries)` — Fold über Records | Typen |
| `core/agent/compaction/estimate.ts` | `estimateTokens(msgs, defs)` — Zeichen÷4 über die Wire-Form | `toWireMessages` |
| `core/agent/compaction/stage1.ts` | Tool-Stubs bauen, Record erzeugen | Typen |
| `core/agent/compaction/stage2.ts` | Zusammenfassungs-Prompt bauen, rollend paketieren, Antwort in Record gießen | Port `summarize` |
| `core/llm/chat-error.ts` | `isContextOverflow` (aus vault-crews, Herkunftsstempel) | — |
| `loop.ts` | Orchestrierung; neue `AgentDeps.compaction` | alle oben |

```ts
interface CompactionDeps {
  budgetTokens: number;        // contextWindowTokens * compactAtPercent / 100
  keepToolResults: number;     // K
  summarize: ((msgs: ChatMessage[]) => Promise<string | null>) | null;  // null = Stufe 2 aus
  summaryMaxChars: number;
}
```

`summarize` baut `main.ts` aus **demselben** `KodaChatClient` + Failover — ohne
Tool-Defs, mit `suppressThinking`. Der Loop kennt kein zweites Modell und keinen
Transport. Stufe 2 arbeitet nur über **abgeschlossene** Runden, nie über die laufende
(sie ist Kodas Arbeitsgedächtnis; sprengt *sie allein* das Budget, greift nur noch der
reaktive Pfad). Kein manueller „Verdichten"-Befehl (YAGNI; „Neues Gespräch" gibt es).

## Datenmodell & Persistenz

**Der Record referenziert nichts — seine *Position* im Verlauf ist die Referenz.**
Nachrichten haben keine IDs, und `parseLines` lässt kaputte Zeilen still fallen;
Index-Referenzen wären fragil, IDs ein Umbau aller Nachrichten. Ein Record sagt:
„alles *vor mir* wird nach dieser Regel verdichtet." Robust gegen verlorene Zeilen,
keine Migration.

```ts
interface CompactionRecord {
  kind: "compaction";
  stage: 1 | 2;
  at: string;                    // ISO, für Anzeige/Log
  forced?: true;                 // reaktiv nach Überlauf erzwungen (Marke sagt es)
  keepToolResults: number;       // Stufe 1: die K jüngsten Tool-Ergebnisse vor mir bleiben wörtlich
  summary?: string;              // Stufe 2: Zusammenfassungstext (kein Modellaufruf → kein Record)
  stats: { stubbed: number; bytes: number };   // was Stufe 1 gekürzt hat, für die Marke
}
type LogEntry = ChatMessage | CompactionRecord;
```

**Projektionsregeln** (`projectForModel` = Fold von links; ein Record wirkt auf die
*bis dahin projizierte* Folge, spätere Records ersetzen frühere):

- **Stufe 1:** Alle `tool`-Nachrichten vor dem Record außer den K jüngsten → Inhalt
  ersetzt durch Stub `[read_note "Projekte/X.md" — 4,2 KB, verdichtet; bei Bedarf
  erneut aufrufen]`. Der `assistant`-Eintrag mit `toolCalls` bleibt vollständig (Name +
  Argumente): Koda weiß weiter, *was* er getan hat. Wire-Struktur (assistant→tool-Paare)
  bleibt intakt.
- **Stufe 2:** Alle *abgeschlossenen* Runden vor dem Record (= alles vor der letzten
  `user`-Nachricht vor dem Record) → ersetzt durch **eine** `user`-Nachricht mit den
  wörtlich zusammengesetzten früheren Nutzer-Nachrichten („Frühere Anfragen, wörtlich:
  1. … 2. …") gefolgt von **einer** `assistant`-Nachricht mit `summary`. Die laufende
  Runde bleibt komplett.
- **Warum genau ein `user` + ein `assistant`:** Gemma-Chat-Templates lehnen zwei
  aufeinanderfolgende `user`-Rollen ab („roles must alternate") — mehrere wörtliche
  Nutzer-Nachrichten hintereinander wären auf lokalen Endpunkten ein 4xx.
  Zusammensetzen hält die Alternierung. *(Bekannt aus HF-Templates; wird im Lab gegen
  LM Studio gegengeprüft, bevor der Plan es festnagelt — s. Tests.)*
- Wiederholte Stufe 2 fasst „alte Zusammenfassung + neue Runden" zusammen (Summary of
  summary). Der zusammengesetzte Nutzer-Block wird dabei **flach** fortgeschrieben,
  nicht verschachtelt: die projizierte Sammel-Nachricht trägt ein internes Kennzeichen
  (`merged: true`, nur in der Projektion, nie auf dem Draht — `toWireMessages` lässt es
  fallen), und Stufe 2 hängt an sie an statt sie zu zitieren.

**Persistenz:** `serializeLine`/`parseLines` lernen den zweiten Shape (`kind ===
"compaction"` mit `stage` 1|2). Append-only bleibt: Original-Nachrichten stehen weiter
in `current.jsonl`, der Record *hinter* ihnen. Beim Laden rekonstruiert die Projektion
den Modellstand exakt. `chatLog` wird `LogEntry[]`; die View bekommt einen dritten
Zweig für Records.

Kein Undo: der Verlauf ist ja nicht verändert; eine falsche Zusammenfassung korrigiert
man, indem man Koda widerspricht — die Korrektur ist eine Nutzer-Nachricht und damit
unantastbar. `toWireMessages` bleibt, bekommt nur die Projektion statt des Verlaufs.

## Stufe 1 — Tool-Stubs (deterministisch, kostenlos)

- Kandidaten: alle `tool`-Nachrichten der aktuellen Projektion, die noch **nicht**
  gestubbt sind und länger als der Stub selbst wären. Fehler-Ergebnisse (`ERROR: nicht
  gefunden`) sind kürzer — die bleiben, es gibt nichts zu sparen.
- Regel: die **K jüngsten** Tool-Ergebnisse bleiben wörtlich (Koda arbeitet vermutlich
  gerade mit ihnen), alle älteren werden gestubbt — **alle Werkzeuge gleich**, älteste
  zuerst. Default **K = 3** (Einstellung).
- Stub-Text: `[<tool> <Kernargument> — <Größe>, verdichtet; bei Bedarf erneut
  aufrufen]`. Kernargument = `path`/`query`/`folder` aus den Argumenten, falls
  vorhanden. Der Stub sagt dem Modell, *wie* es das Material zurückbekommt.
- Ein Record entsteht **nur, wenn er etwas kürzt** (mind. ein Kandidat) — sonst direkt
  Stufe 2. Ist nach Stufe 1 das Budget gehalten, ist Schluss.
- *Bekannter Trade-off:* das `list_notes`-Ergebnis, das bei „geh den Ordner durch" der
  Arbeitsplan ist, wird nach drei weiteren Lesevorgängen gestubbt. Koda muss es dann neu
  abrufen — kostet eine Runde, keine Korrektheit. Werkzeuge nach Wichtigkeit zu
  gewichten wäre eine Heuristik ohne Messgrundlage; erst `gui:ask` gegen einen echten
  Ordner-Auftrag zeigt, ob das nötig ist.

## Stufe 2 — Zusammenfassung abgeschlossener Runden (Modell, teuer, selten)

- Eingabe: die *projizierten* abgeschlossenen Runden (Stufe 1 also schon drin) —
  Nutzer-Nachrichten als Kontext, Assistant-/Tool-Anteile als das, was zu verdichten
  ist.
- Fester System-Prompt (i18n, in der Session-Sprache), Kern: *„Fasse deinen bisherigen
  Arbeitsverlauf zu den obigen Anfragen zusammen. Behalte: erzielte Ergebnisse,
  getroffene Entscheidungen, Zusagen an den Nutzer, offene Punkte, gelesene und
  geschriebene Pfade. Lass weg: Rohinhalte von Notizen. Höchstens N Zeichen."* —
  N = `summaryPercent` des Fensters in Zeichen (Default 10 %). Keine Tools,
  `suppressThinking`, gleicher Client + Failover.
- **Rollend statt in einem Rutsch:** die Eingabe muss selbst ins Fenster passen — und
  sie ist der Grund, warum wir über Budget sind. Runden werden von der ältesten her in
  einen Aufruf gepackt, bis 60 % des Budgets erreicht sind; die
  Zwischen-Zusammenfassung wandert als Auftakt in den nächsten Aufruf. Im Normalfall
  **ein** Aufruf; bei einem Riesenverlauf mehrere, jeder für sich bounded. (vault-crews'
  Overflow-Retry halbiert nur einmal — hier reicht das nicht, weil der Verlauf beliebig
  lang wird.) Die 60 % sind Konstante mit Kommentar: sie ändern nur, in wie viele
  Aufrufe eine Zusammenfassung zerfällt, und ein falscher Wert kann sie kaputtmachen.
- Liefert der Aufruf nichts Brauchbares (Fehler, Timeout, Abbruch, leerer Text) →
  **kein Record**; der Loop läuft mit dem Stufe-1-Stand weiter. Scheitert dann der
  Modellaufruf am Fenster, meldet der reaktive Pfad Klartext. Eine leere
  Zusammenfassung wäre schlimmer als keine.
- Abschaltbar (Einstellung „Zusammenfassung durch Modell"): wer dem lokalen Modell
  nicht traut oder die Minuten scheut, hat nur Stubs + reaktives Netz.

## Reaktiver Pfad, Fehler, Sichtbarkeit, Vorbefüllung

**Überlauf erkennen.** `KodaChatClient` klassifiziert einen HTTP-Fehler zusätzlich:
`isContextOverflow(rawBody)` (verbatim aus vault-crews' `chat-response.ts`,
Herkunftsstempel) → `LlmResult.kind = "overflow"` als **fünfte** Fehlerart neben
`aborted|http|network|timeout`. Der Detail-Text bleibt der Server-Text — wir ersetzen
keine Begründung durch eine Vermutung (Lehre aus `chat-error.ts`).

**Reagieren (im Loop, pro `ask()` genau einmal):**

1. Erste `overflow`-Antwort → *erzwungene* Verdichtung: Stufe 1 mit **K=0** (alle
   Tool-Ergebnisse stubben, auch die jüngsten — die Runde ist ohnehin gescheitert, Koda
   muss neu lesen), dann Stufe 2, falls eingeschaltet und abgeschlossene Runden
   existieren. Dieselbe Runde wird **einmal** wiederholt (zählt nicht gegen `maxRounds`).
2. Zweite `overflow`-Antwort, oder erste ohne verbleibende Verdichtungsmasse →
   `AgentEvent { kind: "error", errorKind: "overflow" }`. Klartext im Chat (i18n):
   *„Kontextfenster überschritten — auch nach Verdichtung. Das Modell meldet:
   ‹Server-Text›. Neues Gespräch starten oder ‚Kontextfenster' in den Einstellungen
   prüfen (aktuell 8192)."* Die Session ist danach **nicht** tot: der nächste `ask()`
   darf wieder verdichten (der Zähler ist pro Aufruf).
3. Failover: `overflow` ist wie `http` **kein** Failover-Grund — der Server hat
   geantwortet, und ein anderer Endpunkt hätte dasselbe Fenster-Problem oder ein
   anderes; die Regel `network && partial === ""` bleibt.

**Sichtbarkeit im Chat** (View rendert `CompactionRecord` als dritten Zweig):

- Stufe 1: einzeilige Notiz-Marke, Klasse `koda-notice koda-compaction`: *„Verlauf
  verdichtet — 6 Tool-Ergebnisse (38 KB) gekürzt"* (i18n mit Zahlen).
- Stufe 2: `<details>` wie bei Tool-Schritten, Summary-Zeile *„Verlauf zusammengefasst
  (3 Runden)"*, aufgeklappt der Text — lesbar, prüfbar, widersprechbar.
- Erzwungene (reaktive) Verdichtung: dieselben Marken plus *„…nach Kontext-Überlauf"*
  (`forced`), damit sichtbar ist, dass der proaktive Weg nicht gereicht hat — das ist
  der Hinweis, das Fenster zu prüfen.
- Live: Marken erscheinen sofort über `onEvent` (`{ kind: "compaction", record }`),
  nicht erst beim `renderLog` am Ende — bei einem 90-Sekunden-Loop will man sehen,
  dass er lebt.

**Vorbefüllung des Fensters.** Der bestehende Verbindungstest (`probe.ts`) fragt nach
Erfolg zusätzlich LM Studio `/api/v0/models` bzw. Ollama `/api/show` ab (Kit
`parseLmStudioContext`/`parseOllamaContext`, wird vendored) und **berichtet** den Wert
in seiner Statuszeile: *„erreichbar · Kontextfenster laut Endpunkt: 32768"*.
**Geschrieben** wird er nur, wenn das Feld noch auf dem Default steht — wer bewusst
kleiner eingestellt hat, wird nicht überschrieben (Regel ohne Flag: `value ===
DEFAULT`). Meldet der Endpunkt nichts (OpenWebUI, vLLM, gehostet), steht da nur
„erreichbar" wie heute. Eine Zahl für alle Endpunkte — dass das Fenster eigentlich je
Modell gilt, ist eine bewusste Vereinfachung, im Settings-Text benannt.

## Einstellungen — Gruppe „Kontext & Verdichtung"

Eigene aufklappbare Gruppe (Kit `collapsibleSection`) im Settings-Tab. Alles, was
beobachtbares Verhalten steuert, ist hier; die 60-%-Packgrenze nicht.

| Einstellung (Feld) | Default | Spanne | wirkt |
|---|---|---|---|
| Kontextfenster (Token) — `contextWindowTokens` | 8192 | 2048 – 1 000 000 | Bezugsgröße; Verbindungstest befüllt vor, wenn noch auf Default |
| Verdichten ab (% des Fensters) — `compactAtPercent` | 75 | 40 – 95 | proaktive Schwelle |
| Tool-Ergebnisse wörtlich behalten (K) — `keepToolResults` | 3 | 0 – 20 | Stufe 1 |
| Zusammenfassung durch Modell (Stufe 2) — `summarizeEnabled` | an | Schalter | Stufe 2 an/aus |
| Länge der Zusammenfassung (% des Fensters) — `summaryPercent` | 10 | 3 – 30 | Stufe 2 |

Der reaktive Pfad ist **nicht** abschaltbar — er ist der Unterschied zwischen einer
Fehlermeldung und einer toten Session. Clamp-Konstanten wie bei `MAX_ROUNDS_LIMIT` in
`settings-types.ts` (einzige Quelle für Merge und Slider), Merge über
`mergeKodaSettings`, i18n DE/EN.

## Tests

TDD; alles unter `core/` pure.

- `project.ts`: leerer Verlauf ohne Record ≡ Identität · Stufe 1 mit K=0/3/größer als
  vorhanden · Stufe 2 → genau ein `user`(merged) + ein `assistant`(summary), laufende
  Runde unberührt · zwei Records hintereinander (Fold, spätere ersetzt frühere; merged
  bleibt flach) · **Invariante: die Projektion enthält nie zwei aufeinanderfolgende
  `user`-Rollen, und jedes `tool` hat sein `assistant.toolCalls`-Gegenstück** — als
  Property-Test über zufällige Verläufe.
- `estimate.ts`: Schätzung über Wire-Form + Defs; monoton (mehr Text → mehr Token).
- `stage1.ts`: Kandidatenwahl (kurze Ergebnisse bleiben, schon gestubbte nicht
  doppelt), Stub-Text mit Kernargument, `stats`, kein Record ohne Kürzung.
- `stage2.ts`: Prompt-Bau DE/EN, rollende Paketierung (ein Aufruf im Normalfall,
  mehrere bei Riesenverlauf), `null` bei leerem Ergebnis → kein Record.
- `loop.ts` mit Fake-LLM: proaktiv Stufe 1 reicht · Stufe 1+2 · Stufe 2 aus → nur
  Stufe 1 · reaktiv: `overflow` → erzwungen K=0 → Wiederholung → ok · zweimal
  `overflow` → Fehler-Event · Wiederholung zählt nicht gegen `maxRounds` · `summarize`
  wirft → kein Record, Lauf geht weiter · Records liegen in `appended` · Marken-Event
  live.
- `session.ts`: Roundtrip Record ↔ JSONL, alte Dateien ohne Records unverändert,
  kaputte Record-Zeile kostet nur den Record.
- `chat-error.ts`: `isContextOverflow` gegen LM-Studio-/Ollama-/OpenAI-Bodys (Fixtures
  aus vault-crews übernommen).
- `settings-types.ts`: Clamps der fünf Felder, Merge alter `data.json`.
- **GUI-Smoke** (kein Modell nötig, `scripts/gui-smoke.ts`): `current.jsonl` mit
  Stufe-1- und Stufe-2-Record einspielen → beide Marken sichtbar, Details aufklappbar;
  Settings-Gruppe vorhanden, Slider-Grenzen. **Baseline vor dem Umbau festhalten**
  (Lesson 2026-08-18: der Smoke ist hier zugleich Prüfling).
- **`gui:ask --full`** als Praxistest: Fenster auf 4096, Auftrag „lies die fünf
  längsten Notizen in `<Ordner>` und fasse jede zusammen" → Marke erscheint, Antwort
  bleibt konsistent. Nicht deterministisch, aber die einzige Messung des Verhaltens.
  Voraussetzung: der offene CORS-Verdacht bei `gui:ask` (Memory `gui-ask-cors-verdacht`)
  muss vorher geklärt sein, sonst gibt es keine Modell-Antwort zu messen.
- **Lab-Gegenprobe vorab** (`npm run lab:tools`): zwei `user`-Nachrichten hintereinander
  gegen Gemma/Qwen in LM Studio — 4xx oder nicht? Ergebnis nach `docs/LAB.md`. Fällt
  sie *negativ* aus (kein Server lehnt ab), bleibt die Zusammensetzung trotzdem — sie
  schadet nicht und die Annahme kann beim nächsten Template wieder gelten.

## Reihenfolge

1. `isContextOverflow` übernehmen + `kind: "overflow"` im Client (Lücke 2 — lohnt auch
   allein).
2. `CompactionRecord` + `LogEntry` + `parseLines`/`serializeLine` + `projectForModel`
   (Fold, Invarianten-Tests).
3. `estimate.ts` + Stufe 1 + Loop-Einbau proaktiv.
4. Reaktiver Pfad (erzwungen, Wiederholung, Fehler-Event) + i18n-Texte.
5. Settings-Gruppe + Clamps + Merge.
6. View: dritter Zweig, Live-Marke, CSS.
7. Stufe 2 (`summarize`-Port in `main.ts`, Prompt, rollende Paketierung, Schalter).
8. Vorbefüllung im Verbindungstest (`model-context.ts` vendoren via `tools/sync-kit.sh`).
9. GUI-Smoke-Prüfpunkte, `docs/SMOKE.md`, Praxistest via `gui:ask --full`.

Schritt 1–3 sind ohne 7 schon ein nutzbarer Stand (Stubs + Fehlererkennung).

## Grenzen, benannt

- Zeichen÷4 ist grob; deshalb 75 % Default und das reaktive Netz. Ein Tokenizer im
  Plugin ist es nicht wert.
- Stufe 2 überspringt die laufende Runde. Sprengt *sie allein* das Budget (ein Auftrag
  mit 40 Lesevorgängen und ohne Zwischen-Antwort), hilft nur K=0 reaktiv — dann liest
  Koda neu.
- `finishReason === "length"` (abgeschnittene *Antwort*, nicht überlaufener *Kontext*)
  bleibt außen vor — anderes Problem, anderer Baustein.
- Ein Fenster für alle Endpunkte/Modelle.

## Nicht-Ziele

Unbeaufsichtigter Betrieb (Dach-Grenze, s. o.) · manueller Verdichten-Befehl · Undo ·
Gewichtung von Werkzeugen in Stufe 1 (erst nach Messung) · Änderung von `write_note`
oder des Bestätigungs-Modals · ein Tokenizer.

## Kit-first-Buchführung

- `isContextOverflow` = 5. Exemplar der Fehler-Kette (REGISTRY-Eintrag „Non-Streaming
  Chat-Response interpretieren" fortschreiben; die Kette ist längst Kit-Kandidat).
- `model-context.ts` wird vendored (6. Nutzer; nach `tools/sync-kit.sh`, nicht von
  Hand).
- `projectForModel` + Stufe 1 sind das **erste Exemplar** eines
  Verlaufs-Compaction-Musters → REGISTRY-Eintrag „Muster-Referenz (erstes Exemplar
  2026-08)"; Kit-Extraktion frühestens beim dritten Consumer.

## Nachträge aus der Umsetzung (2026-08-18, Branch `feat/compaction` → `main` `1df1720`)

Vier Punkte, an denen die Umsetzung von diesem Text abweicht oder ihn präzisiert —
jeweils als Controller-Ruling im SDD-Lauf entschieden, hier festgehalten, damit die
Spec nicht hinter dem Code zurückbleibt:

1. **K zählt positionell.** „Die K jüngsten Tool-Ergebnisse bleiben wörtlich" meint die
   K jüngsten *Tool-Nachrichten* — auch kurze oder schon gestubbte zählen mit; gestubbt
   wird davon jenseits, was `shouldStub` erlaubt. Die andere Lesart (K jüngste
   *Kandidaten*) wäre möglich, kostet aber zwei Testsätze für marginalen Nutzen bei K=3.
   Eine Regel für Marke und Projektion: `stage1Targets` in `project.ts`.
2. **Stufe 2 feuert nicht ohne Fortschritt.** Besteht die abgeschlossene Region nur noch
   aus dem Ergebnis der letzten Stufe 2 (`[merged user, summary]`), wird Stufe 2
   übersprungen — sonst kostete jede weitere Runde einen Minuten-Aufruf ohne neues
   Material. Vom Task-Reviewer als Spec-Lücke benannt; Guard + Test in `loop.ts`.
3. **Die Summarize-Anfrage ist abgeflacht.** `summarizeTurns` schickt je Runde genau
   `[user, assistant]`; Kodas Anteile der Runde stehen als Text im `assistant`
   (`[Werkzeugaufruf: …]`, `[Ergebnis: …]`), keine `tool`-Rollen, keine `tool_calls`
   ohne Tool-Definitionen (strikte Server: 400), strikte Alternierung. Projektion und
   Records sind davon unberührt. Dazu: Fehlgrund von Stufe 2 wird geloggt
   (`console.warn`), und vor dem Aufruf erscheint ein Lebenszeichen im Chat
   (`view.compaction.summarizing`).
4. **Alternierungs-Annahme gemessen, nicht bestätigt.** 8 lokale Modelle (Gemma 4, Qwen
   3.6/3.8, Qwen 2.5) akzeptierten zwei `user` hintereinander (`docs/LAB.md`
   2026-08-18). Der zusammengesetzte Nutzer-Block bleibt vorsorglich — er schadet nicht.

**Offen als Release-Gate (nicht Merge-Gate):** der Praxistest `gui:ask --full` mit
Fenster 4096 (`docs/SMOKE.md` Handpunkt 20) — blockiert durch den CORS-Verdacht bei
`gui:ask` (Memory `gui-ask-cors-verdacht`). Vor 0.7.0 fahren.
