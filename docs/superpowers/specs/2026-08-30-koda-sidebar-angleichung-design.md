# Koda — Sidebar ans Ökosystem angleichen (Design)

**Datum:** 2026-08-30 · **Status:** ausdesignt, Umsetzung freigegeben
**Ersetzt:** Teil B von `docs/superpowers/plans/2026-08-08-koda-endpunkt-und-sidebar.md`
**Task:** `[[25_Coding/koda-agent/_Tasks/UI ans Oekosystem angleichen]]` (Sidebar-Hälfte)
**Vorgänger:** Endpunkt-Teil derselben Task, erledigt 2026-08-28 (0.8.0)

## Anlass

Fünf Punkte aus Johannes' Quicktask-Liste betreffen dieselbe View
(`src/obsidian/view.ts`, 191 Zeilen). Der bestehende Plan Teil B vom 2026-08-08 deckt sie
**nicht** — er wurde gegen die Liste gehalten und traf in drei von vier Punkten daneben:

| Quicktask (Wortlaut Johannes) | Plan Teil B | Befund |
|---|---|---|
| „Hinweis, **was gerade getan wird**, mit einem **animierten** Element" | statischer Text „Arbeitet…" (`nextPending`) | halb — Lebenszeichen ja, Tätigkeit und Animation nein |
| „Button-Reihenfolge unintuitiv … man klickt versehentlich *Neues Gespräch* und **verliert alles ohne Rückkehrmöglichkeit**" | Senden bekommt `mod-cta` | verfehlt — färbt einen Knopf, ordnet nichts um, rettet nichts |
| „Thinking auch **im Frontend in der Sidebar togglen**" | Default `suppressThinking` → `false` drehen | verfehlt — ein anderer Default ist kein Schalter |
| „Outputs erst als Markdown gerendert, wenn die **gesamte Ausgabe** durch ist" | — | fehlt ganz |
| „Hinweis, wieviel **Prozent des Kontextfensters** bereits verbraucht" | — | fehlt ganz |

Der alte Plan begründete das Drehen des Thinking-Defaults damit, dass die Oberfläche
sonst „tot aussieht". **Diese Begründung erledigt die Statuszeile dieses Designs.** Der
Default bleibt deshalb auf „unterdrückt"; geliefert wird der Schalter, der eigentlich
gemeint war.

## Kit-first-Befund (gemessen 2026-08-30)

Vier der fünf Punkte existieren im Ökosystem bereits. Der Check wurde **vor** dem Entwurf
gefahren, nachdem Johannes ihn eingefordert hatte — der erste Entwurf hätte den
Thinking-Toggle neu gebaut, und zwar schlechter als der Bestand (er kannte nur zwei
Zustände statt drei).

| Punkt | Bestand | Konsequenz |
|---|---|---|
| Thinking-Toggle | `REGISTRY.md` Z. 44: **„Kit-reif (n=3+)"** — `image-to-markdown/src/reasoning_toggle.ts`, `obsidian-transmute/src/core/reasoning-toggle.ts` (verbatim übernommen), `vim-dojo/src/llm/thinkToggle.ts`, vault-rag inline | **übernehmen** mit Herkunftsstempel |
| Aktivitätsanzeige | `UI-STANDARD.md` §8 „Status-Indikator", **verbindlich (n≥3)**: Form + Farbe + `is-ok`/`is-error`/`is-checking` + `aria-label`, Icon-Vokabel `loader`/`circle-check`/`circle-x`/`alert-triangle`. Referenz `image-to-markdown` (`img2md-status`) | Baustein anwenden, nicht erfinden — `loader` **ist** das animierte Element |
| Verwerfen-Bestätigung | `confirmAction` (Kit, §8 verbindlich, n=4) — in Koda bereits vendored (`src/vendor/kit-obsidian/confirm.ts`) | nur verdrahten |
| Kontextfenster | Abfrage im Kit 0.27.0 (`model-context`, Koda nutzt sie über `core/llm/context-probe.ts`); Schätzung in `core/agent/compaction/estimate.ts` | **Anzeige** ist neu, Fundament liegt |
| Markdown im Stream | kein Exemplar im gesamten Workspace (geprüft: alle `MarkdownRenderer`-Nutzer rendern statisch) | genuin neu |

**Entscheidung zur Kit-Extraktion (Johannes, 2026-08-30):** Der Thinking-Toggle wird
**übernommen**, nicht jetzt extrahiert — obwohl die Schwelle erreicht ist. Grund:
`obsidian-kit` steht auf 0.28.0 mit dem `code-kit`-Umzug, und Kodas `tools/sync-kit.sh`
ist bewusst auf `KIT_REF=0.27.0` festgenagelt. Eine Extraktion zwänge Koda, diesen Pin
mitzuheben und damit den halben Umzug in eine Session zu ziehen, die Sidebar-UI baut.
`obsidian-transmute` ist denselben Weg gegangen. Die fällige Extraktion wird als
Dach-Task hinterlegt; die REGISTRY-Zeile steigt auf n=5.

**Bereits vorhanden und deshalb kein Arbeitspunkt:** `effectiveSuppress` — Kodas
`src/llm/KodaChatClient.ts:38` hat die Request-Hälfte, vor deren Fehlen die REGISTRY
ausdrücklich warnt, korrekt an `isAlwaysOnThinker` gebunden. Es fehlt allein die
Anzeige-Hälfte. Bei der Übernahme wandert die dortige lokale Definition ins übernommene
Modul, damit es **eine** Definition bleibt.

## Architektur

Alles Verhalten wird **pure** in `src/core/chat/` gebaut — `check:pure` erzwingt
Obsidian-Freiheit —, die View bleibt eine dünne Zeichenschicht. Das ist die Bauart, die
`src/core/agent/compaction/` schon trägt.

| Modul | Aufgabe | Herkunft |
|---|---|---|
| `core/chat/activity.ts` | Zustandsautomat: Ereignis → *was gerade läuft* (i18n-Key + Argument) | neu |
| `core/chat/context-usage.ts` | belegte Prozent des Kontextfensters, auf `estimateTokens` | neu |
| `core/chat/stream-blocks.ts` | schneidet den Stream in „fertig" und „läuft noch" | neu |
| `core/chat/reasoning-toggle.ts` | drei Toggle-Zustände + `effectiveSuppress` | **übernommen** aus `image-to-markdown` |

**Der Ereignis-Kanal existiert bereits** und liefert alles Nötige: `src/main.ts:294`
bekommt `tool-start` mit `call.name` **und** `call.arguments`; daraus entsteht der
Klartext („durchsucht den Vault nach ‚Stress'") ohne neue Verdrahtung im Agent-Loop.
Ebenso vorhanden: `tool-end`, `compaction`, `summarizing`.

### Vendoring-Nachzug

`reasoning-toggle.ts` braucht `guessFromName` aus `capabilities.ts` für den
`hintKey`-Tooltip. Das Modul ist in Koda **nicht** vendored. `tools/sync-kit.sh` bekommt
`capabilities` in die `PURE`-Liste. Gegenprobe nach dem Umbau (Regel aus `CLAUDE.md`):
ein zweiter Lauf mit demselben `KIT_REF` darf keine vendorte Datei ändern.

## Komponenten

### 1. Statuszeile (`.koda-status`)

Ein Element zwischen Verlauf und Eingabeleiste, gebaut nach dem verbindlichen
§8-Baustein „Status-Indikator": Icon aus der festen Vokabel, Zustandsklasse, `aria-label`,
Farbe nie als alleiniger Bedeutungsträger. Zwei Betriebszustände:

- **arbeitet** (`is-checking`) — `loader`-Icon plus Tätigkeit im Klartext
- **ruht** (`is-ok`) — Kontextfenster-Auslastung („Kontext 31 % belegt"); ab der
  Verdichtungsschwelle (`compactAtPercent`, dieselbe Zahl, die die Compaction auslöst)
  in `--text-warning`

Die Schwelle wird bewusst geteilt, damit die Zeile **erklärt**, warum gleich verdichtet
wird, statt es nur zu tun.

**Der heutige `summarizingHint()` wird ersetzt.** Er ist derselbe Mechanismus (ein
transientes Lebenszeichen) an einem zweiten Ort; nebeneinander meldeten beide dasselbe
Ereignis. Die Verdichtungs**marken** im Verlauf (`compactionMark`) bleiben unangetastet —
das ist Historie, nicht Jetzt-Zustand.

### 2. Aktivitäts-Zustandsautomat (`activity.ts`, pure)

```ts
export type ActivityEvent =
  | { kind: "ask" }
  | { kind: "tool-start"; name: string; args: string }
  | { kind: "tool-end" }
  | { kind: "token" }
  | { kind: "reasoning" }
  | { kind: "summarizing" }
  | { kind: "done" };

export interface Activity { busy: boolean; labelKey: string; labelArg: string }
export function nextActivity(prev: Activity, e: ActivityEvent): Activity
```

Anders als `nextPending` aus dem alten Plan trägt der Zustand **die Tätigkeit**, nicht nur
ein Ja/Nein. Die Zuordnung Werkzeugname → Klartext ist eine Tabelle im selben Modul (die
sieben Werkzeuge sind bekannt), das Argument wird aus `call.arguments` gezogen und gekappt;
ein unbekannter Name fällt auf den Namen selbst zurück statt auf eine leere Zeile.

`reasoning` bedeutet „denkt nach" und ist **nicht** dasselbe wie `token` („schreibt") —
das ist genau der Zustand, in dem die Oberfläche heute tot wirkt.

### 3. Kontext-Auslastung (`context-usage.ts`, pure)

```ts
export interface ContextUsage { percent: number; warn: boolean }
export function contextUsage(used: number, windowTokens: number, warnAt: number): ContextUsage
```

Gefüttert aus `estimateTokens(chatLog, overheadChars)` — derselben Schätzung, auf der die
Compaction ihre Entscheidung trifft. Zwei Zahlen aus einer Quelle: eine Anzeige, die von
der Auslösung abweicht, wäre schlimmer als keine. `percent` wird gekappt (ein Überlauf
zeigt 100 %, nicht 137 %).

### 4. Stream-Blöcke (`stream-blocks.ts`, pure)

```ts
export interface StreamSplit { stable: string; tail: string }
export function splitStable(text: string): StreamSplit
```

Schneidet am letzten Absatzende (`\n\n`), **das nicht innerhalb eines offenen Codefence
liegt** — ein angefangener ```-Block ist keine Grenze, sonst zerreißt Code mitten im
Stream. `streamToken()` rendert neu stabil gewordenes einmalig via `MarkdownRenderer` in
den bestehenden `mdComp` und führt den Rest als Rohtext-Schwanz nach.

Damit gilt: **kein Neu-Rendern von bereits Gezeichnetem** (kein Flackern, keine springende
Scrollposition, kein quadratischer Aufwand). Der Preis ist, dass der laufende Absatz
Rohtext bleibt — bewusst, denn genau dort ist der Text noch unvollständig.

### 5. Knopfleiste und Kopf

- Leiste behält **Senden** (`mod-cta`) und **Stopp**.
- „Neues Gespräch" verlässt die Leiste und wird View-Action im Kopf (`addAction("plus")`),
  davor `confirmAction`. Der Fehlklick ist damit strukturell weg, und Senden/Stopp bleiben,
  wo das Muskelgedächtnis sie hat.
- Zweite View-Action: Thinking-Schalter aus `thinkToggleView`. Drei Zustände — an / aus /
  **immer an, gesperrt**. Bei gpt-oss/harmony zeigt er „immer an", statt etwas zu
  versprechen, das der Request nicht einhält.

Der Settings-Toggle `suppressThinking` bleibt bestehen und zeigt denselben Zustand: ein
Zustand, zwei Zugänge.

## Datenfluss

```
main.ts (onEvent)  ──►  view.activity(ActivityEvent)  ──►  nextActivity()  ──►  Statuszeile
                                                                  │
chatLog + settings ──►  estimateTokens ──► contextUsage() ────────┘ (nur wenn !busy)

streamToken(text)  ──►  splitStable() ──► MarkdownRenderer (stable, einmalig)
                                      └─► textContent      (tail)

settings.model + suppressThinking ──► thinkToggleView() ──► Kopf-Action
                                   └─► effectiveSuppress() ──► Request (bereits vorhanden)
```

## Fehlerbehandlung

- **Kein Kontextfenster bekannt / Schätzung 0** → Ruhezustand zeigt kein Prozent, sondern
  nichts. Eine Anzeige „0 % belegt" wäre eine Aussage, die die Schätzung nicht trägt.
- **Unbekannter Werkzeugname** → Fallback auf den Rohnamen, kein leeres Label.
- **`MarkdownRenderer` wirft beim Stream-Block** → der Block bleibt Rohtext, der Stream
  läuft weiter. Ein kaputter Block kostet die Formatierung, nicht die Antwort (dieselbe
  Doktrin wie `parseLines` in `session.ts`).
- **`mdComp === null`** (vor dem ersten `renderLog`) → Rendern wird übersprungen, wie heute.

## Tests

Die vier puren Module per TDD (vitest, Basis 332). Schwerpunkte:

- `activity.ts` — die Ereignisfolge einer echten Runde inkl. mehrfacher Tool-Schritte;
  `done` räumt in jedem Zwischenzustand auf.
- `context-usage.ts` — Kappung bei Überlauf, Warnschwelle genau an `compactAtPercent`,
  Fenster 0 als Sonderfall.
- `stream-blocks.ts` — offener Codefence ist keine Grenze; mehrere Absätze in einem Token;
  Text ohne jede Grenze bleibt vollständig `tail`.
- `reasoning-toggle.ts` — die drei Zustände; `effectiveSuppress` bleibt an
  `isAlwaysOnThinker` gebunden (Nicht-Regressions-Test, den die REGISTRY verlangt).

**Vier neue GUI-Smoke-Punkte** (`scripts/gui-smoke.ts`), zwei davon schließen die im
Cockpit seit 2026-08-28 offenen Messlücken:

1. Statuszeile über eine echte Tool-Runde: erscheint, benennt das Werkzeug, verschwindet.
2. Kontext-Prozent im Ruhezustand vorhanden und plausibel.
3. Thinking-Action schaltet und überlebt einen View-Neuaufbau.
4. „Neues Gespräch" öffnet das Modal; Abbruch lässt den Verlauf stehen.

Der Staging-Vault wird über `STAGING_VAULTS_DIR` aufgelöst (`stagingVaultDir(repoName)`
aus der zentralen Brücke), nie selbst zusammengebaut — Dach-`AGENTS.md`, seit 2026-08-30.

## Ausdrücklich nicht in diesem Schnitt

- **Gesprächs-History / Zurückholen.** `startNew()` hängt den alten Verlauf **ohne
  Trenner** an `archive.jsonl` (`src/core/memory/session.ts:57`) — die Gespräche sind
  darin nicht mehr voneinander trennbar. Ein Zurückholen braucht zuerst eine Marke beim
  Archivieren. Eigener Punkt; die Bestätigung deckt das akute Ärgernis ab.
- **Kit-Extraktion des Thinking-Toggles** — Dach-Task, siehe oben.
- **Wortlaut-Reparatur** — wartet auf die Dach-Inventur, damit Koda keine Präzedenz
  schafft, statt sich anzugleichen.
- **Default `suppressThinking`** bleibt `true`; die Begründung für das Drehen ist durch
  die Statuszeile entfallen.
