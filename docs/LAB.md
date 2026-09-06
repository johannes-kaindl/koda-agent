# koda-lab Befunde

## 2026-08-05 · http://127.0.0.1:1234 (LM Studio)

| Modell | Suche | Lesen | Kein Tool | Konsequenz |
|---|---|---|---|---|
| qwen/qwen3.6-27b | OK nativ (args valide) · 24.9s · finish=tool_calls | OK nativ (args valide) · 13.4s · finish=tool_calls | OK (direkt geantwortet) · 3.5s · finish=stop | Natives Tool-Calling zuverlässig über alle drei Fälle — kein Fallback nötig. |
| google/gemma-4-26b-a4b-qat | OK nativ (args valide) · 73.6s · finish=tool_calls | OK nativ (args valide) · 4.1s · finish=tool_calls | OK (direkt geantwortet) · 1.6s · finish=stop | Natives Tool-Calling ebenfalls zuverlässig; JIT-Ladezeit macht den ersten Suche-Call langsam (73.6s), aber der Verdict selbst ist sauber. |

Gemessen mit `npm run lab:tools -- --model <id>` (jeweils Einzel-Lauf, um LM-Studio-JIT-Loads pro Modell kontrolliert zu halten). Ollama (`:11434`) hatte zum Messzeitpunkt nur ein Embedding-Modell (`nomic-embed-text-v1.5`) geladen — nicht tool-fähig, daher nicht gemessen.

### Scope

Gemessen wurden 2 von 7 unter `http://127.0.0.1:1234/v1/models` verfügbaren Nicht-Embedding-Modellen (`qwen/qwen3.6-27b`, `google/gemma-4-26b-a4b-qat`) — eine bewusste Reduktion gegenüber dem im Plan vorgesehenen vollen `npm run lab:tools`-Sweep über alle Modelle. Grund: LM Studio lädt jedes Modell JIT beim ersten Request nach, was bei 27–31B-Modellen mehrere Minuten pro Modell kostet; ein voller Sweep über alle 7 wäre unverhältnismäßig teuer für den Befund gewesen. Der `textFallback`-Default (siehe Entscheidung unten) stützt sich ausschließlich auf diese zwei Modelle. Nicht gemessen: `google/gemma-4-31b`, `google/gemma-4-31b-qat`, `qwen/qwen3.6-35b-a3b`, `google/gemma-4-e4b`, `google/gemma-4-e2b` — können bei Bedarf (z. B. wenn ein schwächeres Modell in der Praxis auffällig wird) einzeln mit `npm run lab:tools -- --model <id>` nachgemessen werden.

### Entscheidung

Beide gemessenen Modelle liefern natives Tool-Calling **zuverlässig** über alle drei Testfälle (Suche, Lesen, Kein-Tool-Fall ohne falsch-positiven Aufruf). Nach der Entscheidungsregel aus dem Plan (native zuverlässig → `textFallback` bleibt `false`) bleibt der Default in Task 9 also:

**`textFallback: false`** (Default). Der Text-Fallback-Parser (`parseTextToolCall`, Task 4) bleibt als Loop-Option erhalten, wird aber für die getesteten Zielmodelle nicht gebraucht — nützlich bleibt er für schwächere/andere lokale Modelle, die kein natives Tool-Calling unterstützen.

## 2026-08-18 · Alternierung (zwei user hintereinander)

`renderMerged` in `src/core/agent/compaction/project.ts` fasst frühere Nutzer-Nachrichten
zu einer einzigen `user`-Nachricht zusammen — bisher aus der HF-Template-Annahme heraus,
Gemma-Chat-Templates lehnten zwei aufeinanderfolgende `user`-Rollen ab („roles must
alternate"). Gemessen wurde das jetzt gegen das laufende LM Studio (`127.0.0.1:1234`) mit
`npm run lab:tools -- --alternation`: je Modell eine toolfreie Anfrage
`[user("Merke dir: A"), user("Was habe ich dir gesagt?")]` über `client.complete`.

| Modell | Ergebnis |
|---|---|
| qwen/qwen3.8-27b | OK — zwei user hintereinander akzeptiert |
| qwen2.5-coder-7b | OK — zwei user hintereinander akzeptiert |
| google/gemma-4-31b | OK — zwei user hintereinander akzeptiert |
| google/gemma-4-26b-a4b-qat | OK — zwei user hintereinander akzeptiert |
| qwen/qwen3.6-35b-a3b | OK — zwei user hintereinander akzeptiert |
| qwen/qwen3.6-27b | OK — zwei user hintereinander akzeptiert |
| google/gemma-4-e4b | OK — zwei user hintereinander akzeptiert |
| google/gemma-4-e2b | OK — zwei user hintereinander akzeptiert |

Alle 8 unter `http://127.0.0.1:1234/v1/models` gelisteten Nicht-Embedding-Modelle
gemessen (4× Gemma, 4× Qwen) — kein einziges 4xx, kein „roles must alternate" oder
Ähnliches. Die HF-Template-Annahme bestätigt sich gegen LM Studio also **nicht**: entweder
normalisiert LM Studios Serving-Schicht die Rollenfolge vor dem Template, oder die hier
geladenen Gemma-Varianten sind toleranter als die zitierte HF-Quelle. Für `renderMerged`
folgt daraus: die Begründung bleibt **vorsorglich**, nicht gemessen bestätigt — das
Zusammenfassen schadet aber nicht (ein `user`-Block ist für jedes Template gültig) und
bleibt deshalb unverändert bestehen.

Gemessen mit `npm run lab:tools -- --alternation` (ein Lauf über alle Modelle; JIT-Ladezeit
pro Modell führte zu keinem Timeout).

## 2026-09-06 · Bases-View-API (Spike vor Etappe 3)

Die Spec `2026-09-02-koda-arbeitskontext-design.md` § E7 hält ausdrücklich fest, die
Bases-API sei „gelesen, nicht gemessen", und verlangt vor dem Bau einen Spike. Gemessen
wurde gegen **Obsidian 1.14.0** in einer **Zweitinstanz** (eigenes `--user-data-dir`,
Port 9333, reguläre Instanz unberührt) mit einem Wegwerf-Plugin, das nichts tut außer
`registerBasesView` aufzurufen und jeden Aufruf mit Zeitstempel zu protokollieren.
Kulisse: vier Notizen mit absichtlich ungleichem Frontmatter (vollständig, teilweise,
ohne Fälligkeit, ganz ohne Frontmatter) und drei `.base`-Dateien.

### Was trägt

| Frage | Messung |
|---|---|
| `registerBasesView(...)` | liefert `true` (Bases im Vault aktiv) |
| Laufzeit-Exporte | `BasesView`, `BasesEntry`, `BasesQueryResult`, `QueryController`, `Value`, `StringValue`, `NullValue`, `parsePropertyId` sind alle **echte Laufzeit-Werte**, nicht nur Typen |
| Wann entsteht die View? | **nicht** bei der Registrierung — erst wenn eine Base geöffnet wird, deren Ansicht diesen Typ hat. Reihenfolge: `factory` → Konstruktor → `onload` → knapp 1 s später `onDataUpdated` |
| Base **ohne** registrierte Ansicht | 0 Factory-Aufrufe, 0 Instanzen, 0 Daten — bestätigt E7: Bases liefern nur an eine registrierte Ansicht, ein Filter-Nachbau von außen bekommt nichts |
| `data.data` | trägt die Zeilen fertig **sortiert und gefiltert**, wie in der Base konfiguriert |
| `data.properties` | die sichtbaren Spalten dieser Ansicht; `allProperties` zusätzlich alle verfügbaren inkl. 14 `file.*` |
| `config.getDisplayName(...)` | liefert die in `properties:` gesetzten Klarnamen |
| `groupedData` | ohne `groupBy` eine Gruppe mit `hasKey() === false`; mit `groupBy` je Wert eine Gruppe, fehlende Werte in einer eigenen `NullValue`-Gruppe |
| `onunload` | kommt zuverlässig beim Schließen des Base-Tabs, je Instanz einmal |
| View-Option persistiert | `config.set("uebergabeform", "notizen")` landet als Feld **in der `.base`-Datei** und überlebt Schließen + Neuöffnen |

### Vier Fallen, die den Entwurf betreffen

**1. Ein fehlender Wert ist nicht `null`, sondern ein Objekt, dessen `toString()` „null" ergibt.**
`getValue("note.status")` auf eine Notiz ohne dieses Feld liefert ein `NullValue` — nicht
JS-`null`. Wer `entry.getValue(p)?.toString() ?? ""` schreibt, bekommt die **Zeichenkette
„null"** in den Kontextblock, für jede Notiz und jede fehlende Eigenschaft. Der Test auf
Abwesenheit ist `value instanceof NullValue`. `isTruthy()` taugt dafür **nicht**: es ist
auch bei `erledigt: false` und bei `0` falsch, also nicht von „fehlt" zu unterscheiden.

Eine **zweite** Abwesenheitsform daneben: eine *unbekannte Formel* (`formula.gibtesnicht`)
liefert echtes JS-`null`, eine unbekannte Notiz-Eigenschaft dagegen `NullValue`. Beide
Fälle müssen behandelt werden, und sie sehen im Code nicht gleich aus.

**2. `constructor.name` ist minifiziert — Werttypen nur über `instanceof`.**
Jeder Wert meldet `constructor.name === "t"`. Die Unterscheidung läuft ausschließlich über
`instanceof` gegen die exportierten Klassen. Gemessene Zuordnung samt `toString()`:

| Frontmatter | Klasse | `toString()` |
|---|---|---|
| `status: aktiv` | `StringValue` | `aktiv` |
| `faellig: 2026-09-10` | `DateValue` | `2026-09-10` |
| `tags: [projekt, koda]` | `ListValue` | `#projekt, #koda` |
| `verwandt: "[[Beta]]"` | `LinkValue` | `[[Beta]]` |
| `erledigt: false` | `BooleanValue` | `false` |
| `aufwand: 2.5` | `NumberValue` | `2.5` |
| `teilnehmer: [Johannes, Claude]` | `ListValue` | `Johannes, Claude` |
| `file.mtime` | `DateValue` | `2026-09-06T12:42:36` |
| `file.links` | `ListValue` | `[[Beta\|Beta]], [[Beta\|Beta]]` |
| Formel `(faellig - today()) / 86400000` | `DurationValue` | `ein paar Sekunden` |

Die letzte Zeile ist die lehrreiche: die Division ergibt keine Zahl, sondern eine Dauer,
und deren `toString()` ist eine **lokalisierte Prosa-Darstellung**. Was eine Ansicht
bekommt, ist durchweg die **Darstellung**, nicht der Rohwert — für die Übergabeform
„Tabelle" (§ E7) ist das genau richtig, für jede Rechnung darauf wäre es falsch.
Wikilinks kommen dabei als Wikilink-Text an, gehen also unbeschädigt ins Modell.

**3. Eine Base im Hintergrund liefert keine Daten nach.** Ändert sich der Vault, während
der Base-Tab nicht der aktive ist, kommt **kein** `onDataUpdated` — die View lebt weiter
(kein `onunload`), sie schweigt nur. Erst beim Zurückwechseln kommt genau ein Update, und
es trägt den neuen Wert. *(Gegengeprobt: ohne den Wechsel in den Vordergrund bleibt die
Ereignisliste leer; mit ihm erscheint genau ein Update mit dem geänderten Wert — die
Änderung selbst war also angekommen.)*

**4. `data` und jede `BasesEntry` werden bei jedem Update ersetzt — die alten bleiben
lesbar und liefern veraltete Werte.** Gemessen: nach einer Frontmatter-Änderung ist weder
das `data`-Objekt noch der erste Entry identisch mit dem vorherigen; der festgehaltene
alte Entry wirft nicht, sondern antwortet weiter mit dem **alten** Wert. Ein stiller
Fehler ohne Ausnahme. Für die geplanten Chips („gepinnt bis zur Abwahl, auch wenn die Base
wieder geschlossen wird") heißt das: beim Übernehmen werden **Pfade und Zeichenketten
kopiert**, niemals Objekte referenziert.

### Zwei Punkte, an denen die Spec nachgeschärft werden muss

**`options` wird nie von selbst gerufen, und `config.get` kennt den Default nicht.**
Über alle Läufe hinweg wurde das `options`-Callback **null Mal** aufgerufen, obwohl vier
View-Instanzen entstanden. `config.get("uebergabeform")` liefert `undefined`, solange der
Nutzer nichts gewählt hat — der in der Options-Deklaration angegebene `default` wird dabei
**nicht** eingesetzt. E7 beschreibt die Übergabeform als „Default: Tabelle"; getragen wird
dieser Default nicht von der Deklaration, sondern muss im Lesecode stehen
(`config.get(...) ?? "tabelle"`).

**Eine eingebettete Base (`![[x.base]]`) instanziiert die Ansicht, versorgt sie aber
nicht.** Die Ansicht entsteht (`factory` → Konstruktor → `onload`), ihr Container hängt im
Dokument (Elternknoten `internal-embed bases-embed interactive-child is-loaded`) — aber
über 20 s kam **kein** `onDataUpdated`, und `data` blieb leer. Ein Übernahme-Knopf im
Embed hätte also nichts zu übernehmen. *Grenze der Messung:* gemessen ist der Zustand bei
geöffneter Notiz in der Standardansicht, ohne Interaktion mit dem Embed; ob eine
Interaktion oder ein Scroll-Ereignis die Versorgung anstößt, wurde nicht geprüft. Für die
Etappe genügt der Befund in der schwachen Form: **die Übernahme wird an der echten
Base-Ansicht gebaut, nicht am Embed.**

### Nebenbefund (betrifft nicht dieses Repo)

Sobald eine Ansicht `config.set(...)` aufruft, schreibt Obsidian die ganze `.base`-Datei
neu und **normalisiert dabei die Property-Namen**: in `views[].order` und `views[].sort`
verschwindet das `note.`-Präfix (`- note.status` → `- status`), in `properties:` bleibt es
stehen. Wer eine `.base` von Hand pflegt und mit einer Plugin-Ansicht öffnet, findet sie
danach umgeschrieben vor.

### Konsequenz für Etappe 3

Der Bau kann beginnen — E7 trägt in seiner Grundannahme („eine registrierte Ansicht, kein
Filter-Nachbau") und in der Übergabeform-Option. Drei Stellen des Entwurfs sind vor dem
Plan nachzuziehen: der Default der Übergabeform gehört in den Lesecode, die Übernahme
kopiert Werte statt Referenzen, und der Übernahme-Weg wird für die Base-Ansicht
spezifiziert, nicht für eingebettete Bases.
