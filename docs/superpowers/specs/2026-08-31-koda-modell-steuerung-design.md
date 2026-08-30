# Koda — Modell-Steuerung: System-Prompt und Werkzeuge (Design)

**Datum:** 2026-08-31 · **Status:** ausdesignt, Umsetzung freigegeben
**Task:** `[[25_Coding/koda-agent/_Tasks/Modell-Steuerung — System-Prompt und Tools]]`
**Vorentscheidung:** 2026-08-28 (Johannes) — „vollständig ersetzbar", nicht Zusatz-Feld
**Herausgeschnitten aus:** dem UI-Vorhaben vom 2026-08-08 (eigener Zuschnitt, eigene Spec)

## Anlass

Johannes fährt das Qwen3.6-**MoE**-Modell, nicht das stärkere Dense-Modell. Schwächere
Modelle brauchen explizite Hinweise zur Werkzeugnutzung — und weniger Werkzeuge zur Auswahl.
Beides ist heute unerreichbar: der System-Prompt steht fest im Code
(`src/core/memory/memory.ts:12`), die Werkzeugliste ebenso (`src/core/tools/defs.ts`).

Ein gemessener Beleg, dass der ausgelieferte Prompt nicht das letzte Wort sein sollte: er
erklärt `save_memory` ausdrücklich, erwähnt `write_skill` dagegen **mit keinem Wort**.

## Ausgangslage (gemessen 2026-08-31)

Der System-Prompt ist **kein Textblock, sondern drei Schichten** — das ist die Tatsache, an
der der ganze Zuschnitt hängt, und die Task stellt sie nicht:

| Schicht | Herkunft | Ändert sich |
|---|---|---|
| Regelblock (7 Sätze) | Konstante in `buildSystemPrompt` | nie |
| `## Memory` | Memory-Notiz im Vault | pro Lauf |
| `## Skills` | `selectSkills`, budgetiert | pro Lauf |

Zwei der sieben Regelsätze tragen eingesetzte Werte: `Always answer in German.` aus
`settings.language`, `folder "Koda/"` aus `settings.kodaFolder`.

Die Werkzeugliste entsteht je Gespräch in `toolDefs({ related })`
(`src/core/tools/defs.ts:124`) — sieben Werkzeuge, davon `related_notes` nur, wenn
vault-rag einen Index bereitstellt.

## Kit-first-Befund (gemessen 2026-08-31, **vor** dem Entwurf)

Der Check lief vor der ersten Option, nicht vor der ersten Codezeile — dieselbe Reihenfolge,
die Johannes am 2026-08-30 eingefordert hat und die dort vier von fünf Punkten korrigierte.

| Punkt | Bestand | Konsequenz |
|---|---|---|
| Prompt-Override in den Einstellungen | `yijing-oracle/src/core/llm/settings-defaults.ts:36` + `src/obsidian/settings/llm-section.ts:110` — Default `""`, leer heißt „Auslieferungsstand", Reset schreibt `""` | **Bauart übernehmen** (E2) |
| Textarea-Zeile mit Reset-Knopf | zwei Exemplare (`yijing-oracle`, `image-to-markdown/src/settings.ts:378`), **kein** §8-Baustein | nach Vorlage bauen, nicht extrahieren (n=2) |
| Werkzeug-Liste als UI | `UI-STANDARD.md` §8 „Listen-Zeile", vertikale Grammatik | Baustein anwenden |
| Warnzustand | §8 „Status-Indikator", Vokabel `is-warning` + `alert-triangle` (seit 2026-08-30 vollständig) | Baustein anwenden |
| Deklarative Settings mit `display()`-Fallback | in Koda vorhanden (`getSettingDefinitions()`), Kit-Muster n=4 | vorhandene Bauform weiterführen |

Der Prompt-Override ist damit **keine Neuentwicklung**. Das ist mehr als eine
Aufwandsersparnis: die yijing-Bauart löst ein Problem, das ein naiver Entwurf einbaut —
siehe E2.

## E1 — Was ist editierbar: der Regelblock, mit Platzhaltern

**Entscheidung (Johannes, 2026-08-31):** Editierbar ist der **Regelblock**. Darin stehen
`{{sprache}}` und `{{ordner}}` als Platzhalter, die Koda beim Lauf einsetzt. Memory- und
Skills-Block bleiben systemgesetzt und werden unverändert angehängt.

Die Platzhalter heißen **deutsch**, obwohl der Prompt englisch ist: sie sind Bedienelemente,
keine Prompt-Sprache, und die Zeile daneben erklärt sie. Englische Aliasse (`{{lang}}`,
`{{folder}}`) gibt es **nicht** — zwei Namen für dieselbe Sache wären zwei Dinge, die
auseinanderlaufen können, und die Warnung aus E5 müsste beide kennen.

Verworfen wurden:

- **Fertiger Text ohne Platzhalter** (WYSIWYG, leichter zu lesen). Preis: ein überschriebener
  Prompt behält den alten Ordner und die alte Sprache, wenn der Nutzer sie später umstellt —
  und zwar lautlos. Der Prompt sagt dann `"Koda/"`, während frei beschreibbar `"Assistent/"`
  ist; das Fehlerbild sieht nach einem Modell-Problem aus und ist keines.
- **Ein Feld für den ganzen Prompt** (`{{memory}}`/`{{skills}}` im Text). Maximale Kontrolle,
  aber wer einen Platzhalter versehentlich löscht, schaltet Memory oder Skills stumm ab,
  während die Oberfläche sie weiter als aktiv führt. Genau die Sorte stiller Widerspruch,
  gegen die die Verdichtung ihre Marken hat.

## E2 — Gespeichert wird die Abweichung, nie der Default

`systemPromptOverride: ""` heißt „nimm den Auslieferungsstand". Der Default wird **nicht**
in die `data.json` kopiert.

Der Unterschied ist nicht kosmetisch. Kopierte man den Auslieferungs-Prompt beim ersten
Öffnen des Feldes hinein, wäre er ab diesem Moment eingefroren: jede spätere Verbesserung des
ausgelieferten Prompts erreichte genau die Nutzer nicht mehr, die das Feld einmal angesehen
haben. Die Bauart aus `yijing-oracle` vermeidet das strukturell — der Platzhalter der
Textarea zeigt den Auslieferungsstand, der gespeicherte Wert bleibt leer, bis jemand
wirklich etwas anderes will.

Dasselbe gilt für die Werkzeug-Beschreibungen (E4).

## E3 — Alle Werkzeuge abschaltbar, mit Warnung statt Verbot

**Entscheidung (Johannes, 2026-08-31):** Jedes der sieben Werkzeuge ist abschaltbar,
einschließlich der lesenden. Ist kein lesendes Werkzeug mehr aktiv, erscheint eine Warnung,
die die Folge benennt und sie zulässt.

Begründung: für den System-Prompt ist diese Linie am 2026-08-28 bereits gezogen worden — „Die
Warnung ist **kein Verbot**: sie benennt, was fehlt, und lässt es zu." Eine Sperre bei den
Werkzeugen würde dem Nutzer im selben Einstellungs-Tab zweimal Verschiedenes über seine
Mündigkeit sagen. Sie träfe zudem ausgerechnet den Fall, für den das Feature gebaut wird: ein
schwaches Modell, dem man bewusst fast alles wegnimmt.

Verworfen: ein zusätzlicher Sammelschalter „Nur lesen". Er wäre ein **zweiter Ort für
denselben Zustand** — zwei Wahrheiten, sobald sie auseinanderlaufen.

**Abgeschaltet heißt: nicht in der gesendeten Liste.** Das Modell erfährt nichts von dem
Werkzeug. Ein trotzdem halluzinierter Aufruf muss von der Tool-Policy sauber abgelehnt werden;
das ist beim Bauen zu prüfen, nicht anzunehmen.

**Lesend im Sinne dieser Warnung** sind `search_notes`, `read_note`, `list_notes` und
`related_notes` — die vier Werkzeuge, die Vault-Inhalt in das Gespräch holen. Sind sie alle
abgeschaltet, kann Koda über den Vault nur noch reden, nicht in ihn sehen; die Liste steht
einmal im Code und nicht verstreut in Bedingungen.

**`related_notes` bleibt sichtbar, auch ohne vault-rag** — ausgegraut, mit dem Hinweis, woran
es liegt. Ein Werkzeug, das spurlos verschwindet, schickt den Nutzer auf die Suche nach einem
Schalter, den es nie gab.

## E4 — Beschreibungen: Override je Werkzeug, unbekannte Namen überleben

`toolDescriptions: Record<string, string>` — Name → eigener Text; fehlend oder leer heißt
Auslieferungsstand (E2).

**Der Record wird bei der Validierung NICHT gegen die bekannte Werkzeugmenge gefiltert**,
obwohl `validateKodaSettings` sonst eine geschlossene Welt fährt („das Ergebnis hat GENAU die
Schlüssel von `DEFAULT_SETTINGS`"). Grund: `related_notes` ist nur vorhanden, solange
vault-rag läuft. Ein Filter löschte die angepasste Beschreibung genau dann, wenn vault-rag
gerade aus ist — unwiederbringlich und ohne Meldung. Dieselbe Überlegung gilt für
`toolsDisabled`.

Die geschlossene Welt gilt weiterhin auf der **Feld**-Ebene; sie endet an den Schlüsseln
innerhalb dieser beiden Felder. Das ist eine bewusste Ausnahme und gehört so kommentiert.

## E5 — Die Warnung ist eine Heuristik und wird als solche gebaut

Die Warnung prüft **nicht**, ob der Satz „Use the provided tools BEFORE answering…" wörtlich
dasteht. Jede Umformulierung wäre sonst ein Fehlalarm, und Fehlalarme erziehen zum Wegsehen —
dieselbe Mechanik, die beim CDP-Guard am 2026-08-30 dazu geführt hat, dass jemand das Muster
unterlief statt den Fehlalarm zu melden.

Geprüft wird deshalb grob:

1. **Keine Rede von Werkzeugen** — weder `tool` noch `werkzeug` (ohne Rücksicht auf Groß-/
   Kleinschreibung) kommt im Text vor.
2. **Ein Platzhalter fehlt** — `{{sprache}}` oder `{{ordner}}` ist nicht mehr enthalten.
3. **Kein lesendes Werkzeug aktiv** (aus E3, gehört zur selben Warnzeile).

Eine Warnung darf ungenau sein, weil sie nichts verbietet. Eine Sperre dürfte es nicht — das
ist der eigentliche Grund, warum hier keine Sperre steht.

## E6 — Auslesbarkeit: Modal für „das nächste Mal", Treiber für „das letzte Mal"

**Entscheidung (Johannes, 2026-08-31):** beides.

- **Modal „Aktiven Prompt ansehen"** neben dem Textfeld: der fertig zusammengesetzte Prompt
  inklusive Memory und Skills. Es ruft **dieselbe** `buildSystemPrompt` wie `ask()` — kein
  Nachbau. Ein zweiter Weg zu demselben Text ist eine zweite Wahrheit, und genau die hat am
  2026-08-30 den Sprach-Befund erzeugt (System-Prompt und Oberfläche zogen aus unabhängigen
  Erkennungen).
- **`gui:ask --full`** gibt den zuletzt **gesendeten** Prompt vor den Werkzeug-Aufrufen aus
  und markiert, ob er vom Auslieferungsstand abweicht. Dafür hält das Plugin ihn im Speicher
  fest; der Treiber liest heute `chatLog`, und dort steht der System-Prompt nicht.

Der Unterschied wird in der Oberfläche **beschriftet**, nicht vorausgesetzt: das Modal zeigt,
was beim nächsten Gespräch gesendet wird, der Treiber, was zuletzt gesendet wurde.

Verworfen: den Prompt in die Session-JSONL schreiben. Er wird pro Frage neu gebaut, ist mit
Skills leicht über 6000 Zeichen groß und trägt die Memory-Zeilen — persönliche Fakten
verteilten sich dutzendfach über die Sitzungsdateien.

## E7 — Ablage: neues pures Prompt-Modul, eigene UI-Datei

`buildSystemPrompt` sitzt heute in `src/core/memory/memory.ts` und ist dort nur zu Gast; mit
Vorlage, Einsetzung und Prüfung wächst das zu einer eigenen Sache.

| neu | Inhalt | rein? |
|---|---|---|
| `src/core/prompt/rules.ts` | `DEFAULT_RULES`, `renderRules()`, `checkRules()` | ja (`check:pure`) |
| `src/core/prompt/build.ts` | `buildSystemPrompt()` (umgezogen, nimmt den Override entgegen) | ja |
| `src/obsidian/model-control.ts` | die zwei Hatch-Zeilen (Prompt, Werkzeugliste) | nein |
| `src/obsidian/prompt-modal.ts` | das Ansehen-Modal | nein |

`src/obsidian/settings.ts` hat 453 Zeilen und ist deklarativ. Beide neuen Zeilen brauchen eine
Hatch (ein Reset-Knopf und eine Schalterliste haben kein deklaratives Control) — sie in die
Datei zu legen, triebe sie Richtung 700 Zeilen. `renderSkills` bleibt bei `memory.ts`, bis es
einen Grund gibt, es zu bewegen.

## Datenmodell und Migration

```ts
systemPromptOverride: string;               // "" = Auslieferungsstand
toolsDisabled: string[];                    // Namen abgeschalteter Werkzeuge
toolDescriptions: Record<string, string>;   // Name → eigener Text
```

Defaults: `""`, `[]`, `{}`. Eine `data.json` ohne diese Felder bekommt sie beim Laden — kein
Bruch, keine Migration nötig.

**Liste und Record statt ein Feld je Werkzeug:** sonst kostet jedes künftige Werkzeug eine
Settings-Migration. Die Schema-Prüfer klemmen die Bauform (Array von Strings, Record von
Strings), nicht die Schlüsselmenge (E4).

## Oberfläche

Alles in der bestehenden Gruppe des Settings-Tabs; kein neuer Tab, kein Hub.

- **Prompt-Zeile:** Textarea (`rows = 8`) mit dem Auslieferungsstand als Platzhalter, daneben
  `addExtraButton("rotate-ccw")` als Zurücksetzen. Darunter die Warnzeile nach §8
  („Status-Indikator", `is-warning` + `alert-triangle`, Farbe über `--text-warning`).
- **Werkzeug-Liste:** §8-Grammatik „Listen-Zeile", vertikal. Je Zeile: Name, Beschreibung als
  Textarea (leer = Auslieferung), Schalter. `related_notes` ausgegraut mit Hinweis, wenn
  vault-rag fehlt.
- **„Aktiven Prompt ansehen":** Knopf unter der Prompt-Zeile, öffnet das Modal aus E6.
- **Texte** nach `UI-STANDARD.md` §10 in `src/i18n/strings.ts`, DE und EN. „System-Prompt" ist
  ein Fachbegriff und wird aufgelöst — die Beschreibung sagt, was das Ding tut, bevor sie es
  benennt.

## Prüfen

**Pure Tests (TDD, vor der Implementierung):**

- `renderRules` setzt beide Platzhalter ein; ein unbekannter Platzhalter bleibt stehen,
  statt zu verschwinden.
- `checkRules` meldet alle drei Befunde aus E5 einzeln und in Kombination; ein umformulierter,
  aber gültiger Prompt löst **keine** Warnung aus.
- `toolDefs` filtert Abgeschaltete heraus, ersetzt Beschreibungen, lässt `related_notes` weg,
  wenn kein Index da ist — und die Rückgabe bleibt eine Kopie.
- `validateKodaSettings`: unbekannter Werkzeugname im Record und in der Liste **überlebt**;
  falsche Bauformen (Zahl statt String) fallen auf den Default zurück.
- Tool-Policy lehnt den Aufruf eines abgeschalteten Werkzeugs ab.

**GUI-Smoke (`scripts/gui-smoke.ts`), drei neue Punkte 16–18:**

16. Reset stellt den Auslieferungsstand her (Feld leer, Platzhalter sichtbar).
17. Ein abgeschaltetes Werkzeug taucht in der gesendeten Werkzeugliste nicht auf.
18. Das Modal zeigt Memory- und Skills-Block.

Punkt 17 misst die **gesendete** Liste, nicht die Anzeige — ein grüner Prüfpunkt, der nur den
Schalter anfasst, hätte seinen Gegenstand nie berührt (Lesson 2026-08-30).

## Nicht im Umfang

Prompt-Presets · Import/Export von Prompts · ein eigener Prompt je Endpunkt ·
Skill-Bearbeitung im Modal · neue Werkzeuge (eine Einstellung kann keine erfinden — die
Implementierung lebt im Plugin).

## Offene Punkte

- **Ein Skill kann die Tool-Anweisung ebenso untergraben wie ein überschriebener Prompt.**
  `checkRules` sieht nur den Regelblock. Das Modal aus E6 macht es sichtbar, die Warnung deckt
  es nicht ab. Bewusst so: eine Warnung über Skill-Inhalte wäre eine Bewertung fremden Textes.
- **Die Heuristik aus E5 ist auf Deutsch und Englisch geeicht.** Ein Prompt in einer dritten
  Sprache warnt möglicherweise ohne Anlass. Vertretbar, solange die Oberfläche nur DE/EN kennt.
