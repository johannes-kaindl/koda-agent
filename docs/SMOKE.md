# Koda GUI-Smoke (manuell, pro Release)

Vorbereitung: `npm run build`, Plugin in Test-Vault deployen, LM Studio mit Tool-faehigem Modell starten.

1. Sidebar öffnen (Ribbon-Hund) → Chat erscheint, Sprache folgt der UI-Sprache.
2. Frage "Welche Notizen habe ich zu X?" → ⚙ search_notes-Schritt sichtbar, Antwort mit [[Links]].
3. "Lies [[bekannte Notiz]] und fasse zusammen" → ⚙ read_note, Zusammenfassung korrekt.
4. "Leg unter Koda/Entwürfe/test.md eine Notiz an" → KEIN Modal, Datei existiert.
5. "Ergänze in <Notiz außerhalb> eine Zeile" → Modal mit Vorschau; Ablehnen → Koda meldet Ablehnung im Chat, Datei unverändert; Wiederholen + Bestätigen → Zeile da.
6. "Merk dir: <Fakt>" (bzw. save_memory-Anlass) → Koda/Memory.md enthält die Zeile mit Datum.
7. Stopp-Button mitten im Stream → Stream endet, UI bedienbar, Teiltext bleibt stehen.
8. Obsidian neu starten → Verlauf ist wieder da; "Neues Gespräch" leert ihn.
9. Falschen Endpoint eintragen → Klartext-Fehler (kein roher Stacktrace).
10. Reasoning-Modell ohne Suppress → "Denkt nach…"-Block einklappbar, Antwort sauber getrennt.
11. Skill von Hand anlegen → `⚙ Skills aktiv` erscheint beim nächsten Gesprächsstart, Antwort folgt der Anweisung.
12. Koda einen Skill schreiben lassen → Modal zeigt `Künftig:` plus vollständigen Inhalt; Ablehnung schreibt nichts.
13. Eine Antwort in der Sidebar mit der Maus markieren → Text lässt sich auswählen und mit Cmd+C kopieren.

### Semantisches Retrieval (nur mit aktivem „Vault Retrieval")

14. Frage mit einem Begriff, der **nicht wörtlich** im Vault steht, aber inhaltlich passt
    (dünner Volltext) → Antwort enthält zwei beschriftete Blöcke: „Volltext (wörtlich
    gefunden)" und „Inhaltlich ähnlich (semantisch/Index, 0–1)". Kein gemischtes Ranking.
15. Frage mit einem Begriff, der **klar wörtlich** trifft (≥3 Treffer) → **trotzdem** ein
    semantischer Block. Dieser Punkt hat sich am 2026-08-14 **umgedreht**: Bis dahin verlangte
    er das Gegenteil (kein Block ab drei Treffern) und belegte damit eine Schwelle, die es
    nicht mehr gibt — sie schnitt genau die thematischen Fragen ab, für die es den semantischen
    Weg gibt. Der Punkt belegt jetzt, dass beide Wege immer laufen. Wer hier den alten Wortlaut
    im Kopf hat, misst gegen einen Stand von vor 0.6.0.
16. „Was hängt mit [[bekannte Notiz]] zusammen?" → ⚙ `related_notes`, Liste mit Score.
    Gegenprobe: dieselbe Frage zu einer **frisch angelegten** Notiz → Klartext „(noch)
    nicht im Index", kein Fehler.
17. Embedding-Endpunkt stoppen (Ollama beenden), dann Punkt 14 wiederholen → Volltext-Treffer
    plus die Zeile „(semantisch: Embedding-Endpunkt nicht erreichbar …)". **Nicht** stilles
    Schweigen — das ist der Kern von Spec E6.
18. **Gegenprobe ohne vault-rag:** „Vault Retrieval" in den Community-Plugins deaktivieren,
    Koda neu fragen → Suche verhält sich wie vor 0.3.0 (eine Liste, keine Beschriftung, keine
    Meldung), und `related_notes` taucht in keinem Werkzeug-Schritt mehr auf. Belegt, dass die
    Kopplung weich ist — der Fall, den jeder Store-Nutzer ohne vault-rag hat.
19. Koda nach allen Aufgaben eines Ordners fragen → die Antwort muss auf einem `list_notes`-Aufruf
    beruhen (⚙ list_notes sichtbar), und bei gekappter Liste muss Koda die Unvollständigkeit benennen
    (`⚠ UNVOLLSTÄNDIG …`), statt sie zu verschweigen.

### Verdichtung (Compaction, braucht echten Modell-Lauf)

20. Fenster auf 4096 setzen, Auftrag „lies die fünf längsten Notizen in `<Ordner>` und fasse
    jede zusammen" → Marke „Verlauf verdichtet" erscheint während des Laufs; Antwort konsistent
    (Praxistest `gui:ask --full`).

## Automatisierter Teil: `npm run smoke:gui`

Zehn dieser Punkte fahren automatisiert selbst (`scripts/gui-smoke.ts`, CDP gegen ein
laufendes Obsidian — CORE-TEST-02 b; Basis seit 2026-08-07, seither um 1b, 1c und —
2026-08-18 — 7 (Verdichtungs-Marken) und 8 (Settings-Gruppe „Kontext & Verdichtung")
erweitert). Voraussetzung ist der eine Handgriff, der Handarbeit bleibt:

```bash
osascript -e 'quit app "Obsidian"'
open -a Obsidian --args --remote-debugging-port=9222
npm run build && cp main.js <vault>/.obsidian/plugins/koda-agent/
npm run smoke:gui -- --vault <vault-name>
```

Geprüft werden: Plugin aktiv · **Retrieval-Andockung** (vault-rags Vertrag liegt in der
Form vor, gegen die Koda gebaut ist) · **Frontmatter-Naht** (`metadataCache` liefert
Frontmatter in der Form, gegen die `pickFields` gebaut ist) · Sidebar mit Eingabefeld und
Knöpfen · Klick auf „Testen“ friert den Renderer nicht ein · toter Endpunkt wird als nicht
erreichbar angezeigt · **Settings-Gruppe „Kontext & Verdichtung“** (Überschrift + Zahlenfeld
„Kontextfenster (Token)“ vorhanden) · zwei tote Endpunkte ergeben Klartext statt Stacktrace ·
Wikilink in der Antwort öffnet die Notiz · **Verdichtungs-Marken** (Stufe 1, Stufe 2
aufklappbar mit Text, erzwungener Zusatz „Überlauf“/„overflow“) werden gerendert.

Prüfpunkt **7** und **8** kommen ohne Modell und ohne Persistenz aus: Punkt 7 haengt zwei
`CompactionRecord`s nur im Speicher an `p.chatLog`, ruft `renderLog()`, prueft die drei
CSS-Zweige aus `renderCompaction` (`src/obsidian/view.ts`) und entfernt die Records wieder
(`splice` + Re-Render) — `current.jsonl` bleibt unberuehrt. Punkt 8 nutzt das Einstellungs-
fenster, das die Punkte 3/4 ohnehin schon offen haben, und prueft nur die Naht zum
deklarativen Settings-Walker (Ueberschrift + Eingabefeld), nicht die Verdichtungslogik
selbst — die zeigt erst Handpunkt 20 mit einem echten Modell-Lauf.

Prüfpunkt **1b** verdient eine Einordnung, weil er weniger zeigt, als sein Name nahelegt: Er
prüft die **Naht**, nicht die Suche — `apiVersion`, die Fläche (`Object.keys`), und
`status().indexed`. Das ist die Vorbedingung dafür, dass `related_notes` überhaupt in die
Werkzeugliste kommt, und der Teil, der **ohne** eine echte Modell-Antwort entscheidbar ist.
Dass Koda die API im Gespräch tatsächlich benutzt, zeigt er nicht — das bleiben die
Handpunkte 14–18. Ist vault-rag gar nicht installiert, meldet er das und bleibt **grün**:
die weiche Kopplung sieht genau diesen Fall vor.

Prüfpunkt **1c** gilt dieselbe Einordnung, mit derselben Begründung wie bei 1b: `VaultTools`
wird in `main.ts` lokal erzeugt und hängt nicht am Plugin-Objekt, `list_notes` selbst ist dem
Treiber also nicht erreichbar. Geprüft wird die **Naht darunter**: liefert
`app.metadataCache.getFileCache(f)?.frontmatter` ein über `fm[feld]` indizierbares Objekt
(`Record<string, unknown>`), wie `pickFields` (`src/core/tools/list.ts`) es erwartet? Bewusst
NICHT verlangt wird, dass jeder Feldwert flach ist — verschachtelte Objektwerte kommen in
echten Vaults vor (z. B. `limits`/`fields` in vault-crews-Teams bzw. Schema-Notizen) und
`formatFieldValue` rendert sie explizit als `{…}` statt sie als Fehler zu werten. Dass Koda
`list_notes` im Gespräch tatsächlich benutzt und Kappung benennt, zeigt dieser Punkt nicht —
das bleibt Handpunkt 19.

**Für die Handpunkte gibt es seit 2026-08-14 einen zweiten Treiber:** `npm run gui:ask --
--vault <name> --ask "<Frage>"` (`scripts/gui-ask.ts`) stellt Koda im laufenden Obsidian eine
echte Frage und berichtet, **welche Werkzeuge er wählt** — inklusive der ungekürzten
Tool-Ergebnisse mit `--full`. Er ersetzt die Handpunkte 14–19 nicht (er urteilt nicht, und
zwei Läufe derselben Frage können verschieden ausfallen), macht sie aber prüfbar, statt sie
nur zu behaupten: die Messgröße ist der Tool-Aufruf aus `chatLog`, nicht der Antworttext.
Bei einer Gegenprobe immer `--full` — ohne das belegt ein Treffer nur, *dass* ein Werkzeug
lief, nicht dass ein genannter Pfad daher stammt.

**Was der Treiber bewusst nicht prüft:** alles, was eine echte Modell-Antwort braucht (die
Punkte 2, 3, 5, 6, 7, 10, 14–19 oben). Gemessen am 2026-08-07 ist `qwen/qwen3.6-27b` über einem
großen Vault **>90 s stumm**, bevor das erste Token kommt — Prüfpunkte darauf wären langsam
und nicht deterministisch. Ebenfalls Handarbeit bleibt das Bestätigungs-Modal (Punkt 5):
`VaultTools` wird in `ask()` lokal erzeugt und ist am Plugin nicht exponiert.

### Durchläufe

- **2026-08-19 (00:00–00:25), Handpunkt 20 (Praxistest Verdichtung) — grün, plus GUI-Smoke
  10/10 mit dem Release-Build.** Vault `10_Pallas`, Obsidian 1.13.7, LM Studio
  `qwen/qwen3.6-35b-a3b`, Fenster auf 4096 (`compactAt` 75 %, `keepToolResults` 3, Stufe 2
  an), Build `main` `3232660`+View-Fix. Frage: „Lies die fünf längsten Notizen im Ordner
  `25_Coding/koda-agent/_Log` und fasse jede in zwei Sätzen zusammen." (`gui:ask --full`).
  - **Stufe 1:** das Modell las alle 8 Notizen in **einer** Runde parallel (7 `read_note`
    nach `list_notes`); vor dem nächsten Modell-Aufruf ein Record `stage 1, stubbed 5,
    bytes 18042` — exakt die fünf ältesten Tool-Ergebnisse (397+5393+4990+4358+2904),
    die drei jüngsten blieben verbatim. Antwort nennt fünf Notizen mit je zwei Sätzen,
    **kein `overflow`**, `lastNotice: null`. Marke im View: „Verlauf verdichtet — 5
    Tool-Ergebnisse (17.6 KB) gekürzt" (View wurde für die Sichtprüfung nachträglich
    geöffnet — `gui:ask` ruft `ask()` ohne View; `renderLog` zeichnete die Marke aus dem
    Log). Session-JSONL trägt den Record.
  - **Stufe 2** springt mit nur einer Nutzerfrage **nie** an — `splitTurns` zählt Runden ab
    Nutzer-Nachricht, alles war die laufende Runde (spec-konform, kein Defekt). Deshalb
    Folgefrage in derselben Session (`--keep-session`, „Welche dieser Notizen erwähnen ein
    Release? Nenne die Versionsnummern …"), DOM-Watcher alle 2 s: Lebenszeichen „Fasse
    frühere Runden zusammen…" nach **4 s**, Marke „Verlauf zusammengefasst (1 Runden)" mit
    1800 Zeichen Zusammenfassung nach **56 s** (Stufe-2-Aufruf ≈ 52 s), danach rollende
    Stufe-1-Records je Runde (`stubbed 1` × 4). **Nebenbefund Anzeige, behoben:** das
    Lebenszeichen blieb bis zum finalen `renderLog` stehen (≈ 100 s länger als der Aufruf) —
    der View entfernt es jetzt bei der nächsten Marke, dem nächsten Werkzeugschritt oder
    Token. **Nebenbefund Modellverhalten, nicht behoben (kein Defekt):** nach der
    Zusammenfassung holte sich das Modell die Notizen **einzeln** neu (8 Runden `read_note`/
    `search_notes`/`list_notes`) und lief in `maxRounds: 8` — „Nach 8 Tool-Runden gestoppt".
    Mit einem künstlich kleinen 4 K-Fenster ist das erwartbar (die Spec sagt dem Modell,
    Rohinhalte seien wieder abrufbar); im Normalbetrieb (8 K+, reale Fenster 32 K–256 K)
    stellt sich die Frage nicht in dieser Schärfe. Beobachtung für den Aufräum-Assistenten:
    ein Auftrag über viele Notizen braucht `maxRounds` mit Luft.
  - **CORS-Ursache geklärt (das war der Blocker):** LM Studio lief seit dem 15.08. **ohne
    CORS** — im Server-Log wurden alle OPTIONS-Preflights als POST-Route beantwortet (400
    „'messages' field is required" bzw. „No models loaded"), am 14.08. (letzter grüner
    Praxistest) noch mit `Access-Control-Allow-Origin: *`. Auslöser: `lms server start`
    ohne `--cors` in Nachbar-Sessions (readme-shots yijing/local-image-generator schalteten
    CORS für Aufnahmen an und „danach zurück"). Kein Plugin-Defekt. Koda benennt den Fall
    jetzt (`error.chatBlocked`, `withFailover.onRefusedDespiteProbe`), README nennt die
    Voraussetzung.
  - **GUI-Smoke danach mit dem finalen Build: 10/10 grün** (Punkt 7
    `{"stage1":1,"stage2":1,"forced":1,"summaryText":"SMOKE-ZUSAMMENFASSUNG"}`, Punkt 8
    `{"heading":true,"field":"8192"}`). Fenster wurde vorher auf 8192 zurückgesetzt.
    Betriebsnotiz: mit mehreren Vault-Fenstern **eines** Obsidian-Prozesses auf
    verschiedenen Spaces ist nur das vorderste `visible`; `Page.bringToFront` reicht nicht,
    `require("electron").remote.getCurrentWindow().show()/focus()` holt das Fenster samt
    Space-Wechsel, und wenn eine andere App vorne bleiben soll, tut es
    `setVisibleOnAllWorkspaces(true)` + `setAlwaysOnTop(true)` für die Dauer des Smokes.

- **2026-08-18, Verdichtungs-Marken + Settings-Gruppe (neue Prüfpunkte 7/8)** — direkt im
  Anschluss an die Baseline-Zeile unten, derselbe Obsidian-Lauf, derselbe Plugin-Build
  (`feat/compaction`, HEAD `58b86e0`). Treiber um Punkt 7 (Verdichtungs-Marken, nach Punkt 6)
  und Punkt 8 (Settings-Gruppe „Kontext & Verdichtung“, innerhalb des ohnehin offenen
  Einstellungsfensters aus Punkt 3/4) ergänzt: **10/10 grün**
  (`{"heading":true,"field":"8192"}` bei Punkt 8;
  `{"stage1":1,"stage2":1,"forced":1,"summaryText":"SMOKE-ZUSAMMENFASSUNG"}` bei Punkt 7).
  **Gegenprobe gefahren und bestanden:** `summaryText` in Punkt 7 auf `"GEGENPROBE-FALSCH"`
  verfälscht → **9/10, genau Punkt 7 rot** (`{"stage1":1,"stage2":1,"forced":1,"summaryText":"GEGENPROBE-FALSCH"}`,
  alle anderen neun weiterhin grün). Zurückgeändert → wieder **10/10 grün**. Nach jedem Lauf
  geprüft: `sessions/current.jsonl` im Test-Vault unverändert (0 Byte, wie vor der Task) —
  die neuen Punkte fassen `chatLog` nur im Speicher an und schreiben nie über den
  `SessionStore`.

- **2026-08-18, Baseline vor Compaction-Prüfpunkten (Treiber unverändert, Plugin-Build
  `feat/compaction`)** — Obsidian 1.13.7, Vault `10_Pallas`, Plugin 0.6.0-Build von
  `feat/compaction` (HEAD `58b86e0`, `npm run build` + `cp main.js styles.css` ins
  Plugin-Verzeichnis, Reload über `disablePlugin`/`enablePlugin`). Treiber **unverändert**
  (vor den neuen Verdichtungs-/Settings-Prüfpunkten dieser Task): **8/8 grün**, identisch
  zum Stand vom 2026-08-18 CDP-Migration. Diese Zeile ist die Vergleichsbasis für den
  Umbau direkt danach (Lesson 2026-08-18/apple-health: der Smoke ist hier selbst der
  Prüfling, ein grüner Lauf danach ist ohne diese Baseline nicht von „anders grün" zu
  unterscheiden).

- **2026-08-18, CDP-Bruecken-Migration** — Obsidian 1.13.7, Vault `10_Pallas`, Plugin
  0.6.0 (HEAD `21babbe`). `scripts/gui-smoke.ts` und `scripts/gui-ask.ts` importieren die
  CDP-Bruecke jetzt aus dem Dach (`tools/obsidian-cdp/`) statt aus einer eigenen, aelteren
  Linie (`scripts/lib/cdp.ts`, entfernt). Baseline vor der Migration: **8/8 gruen**. Nach
  der Migration (Cdp.attach → attachTo, Cdp.attachSettings → attachTo("settings", …),
  waitFor/waitForAsync → pollUntil mit getrennter Mutation/Wartephase, neu:
  `clickReal` in der Bruecke fuer Pruefpunkt 3): **8/8 gruen**, identisch bis auf
  natuerliche Varianz (Klickzeit, welche Notiz als Wikilink-Ziel dient).
  **Nebenbefund beim `gui:ask`-Praxistest (nicht migrationsbedingt):** eine echte Frage
  gegen den lokalen LM-Studio-Endpunkt (`http://127.0.0.1:1234`, Modell
  `qwen/qwen3.6-27b`) blieb ohne Modell-Antwort — `chatLog` bekam nur die Nutzerfrage,
  `lastNotice` meldete „Chat-LLM nicht erreichbar", obwohl `curl` gegen denselben
  Endpunkt sofort antwortete und `p.probe()` (Obsidians `requestUrl`, umgeht CORS)
  `reachable: true` meldete. Gegenprobe mit dem **alten** Treiber (vor der Migration,
  aus `git show HEAD:scripts/gui-ask.ts` gebaut) reproduzierte denselben Ausgang — keine
  Regression dieser Migration. Verdacht: `XhrSseTransport` (`src/llm/XhrSseTransport.ts`)
  nutzt fuer den Streaming-Chat-Call rohes `XMLHttpRequest` statt `requestUrl` und
  unterliegt damit — anders als die Testen-Probe — der Browser-CORS-Durchsetzung; ein
  lokaler Server ohne passende CORS-Header waere fuer die Probe erreichbar und fuer den
  eigentlichen Chat-Call trotzdem blockiert, ununterscheidbar von "Server aus". Nicht
  weiter verfolgt (ausserhalb des Migrationsauftrags) — offen fuer eine eigene Session.
  **Aufgelöst 2026-08-19 (Durchlauf oben):** Verdacht bestätigt, Ursache LM Studio ohne
  CORS seit dem 15.08.; nach Server-Neustart mit `cors: true` antwortet Koda. Seither
  benennt Koda den Fall selbst („Probe grün, Chat rot") statt „Server aus" zu raten.

- **2026-08-14** — Obsidian 1.13.7, Vault `10_Pallas`, Plugin **0.3.0-Build von
  `feat/list-notes`**: **8/8 grün**, inklusive des neuen Prüfpunkts **1c** (`6210 von 6485
  Notizen mit Frontmatter · Beispielfelder: title, summary, type, tags, thema`).
  **Gegenprobe gefahren und bestanden:** `frontmatter` im Prüfpunkt auf `frontmatterXX`
  verfälscht → **7/8, genau 1c rot** (`0 von 6485 Notizen mit Frontmatter`). Zurückgeändert
  → wieder 8/8. Nebenbefund: die erste Fassung des Prüfpunkts (wörtlich aus dem Task-Brief
  übernommen) verlangte zusätzlich, dass jeder Frontmatter-*Wert* flach ist — das war auf
  diesem Vault dauerhaft rot, weil `10_Pallas` legitime verschachtelte Frontmatter-Werte
  enthält (`limits`/`fields` in vault-crews-Teams bzw. Schema-Notizen unter
  `80_Archiv/60_Blueprints/shadowvault-types/`), die `formatFieldValue` (`src/core/tools/list.ts`)
  bewusst als `{…}` rendert statt als Fehler zu werten. Die Flachheits-Pflicht wurde deshalb
  aus dem Prüfpunkt entfernt; geprüft wird jetzt nur noch, ob `frontmatter` selbst ein über
  `fm[feld]` indizierbares Objekt ist — das ist die tatsächliche Form, gegen die `pickFields`
  gebaut ist. Die Handpunkte 14–18 sind in diesem Durchlauf **nicht** gelaufen und bleiben offen.

- **2026-08-14 (abends), Handpunkte 14, 15, 16 + zwei Gegenproben** — Vault `80_Arbeit`,
  Obsidian 1.13.7, Plugin-Build von `main` nach dem Merge `99b79e5`, Endpunkt
  `verdigado-think`, vault-rag mit 1.230 indexierten Notizen. Gefahren mit dem neuen Treiber
  `npm run gui:ask` (durchgehend `--full`, sonst wäre der Beleg abgeschnitten gewesen).
  - **Handpunkt 14** („Sprachmodelle auf eigener Hardware", dünner Volltext) — **grün**:
    zwei beschriftete Blöcke, kein gemischtes Ranking. Nebenbefund: Koda suchte dreimal mit
    verfeinerten Anfragen; die ersten beiden Aufrufe fanden **null** Volltext-Treffer und
    lieferten nur den semantischen Block — genau der Fall, für den die Anbindung existiert.
  - **Handpunkt 15** (klar wörtlicher Treffer) — **grün in der ab heute gültigen Fassung**:
    Der Punkt hat sich umgedreht, weil die Trefferzahl-Schwelle entfallen ist. Beleg aus
    derselben Messung wie die Gegenprobe unten: vier Volltext-Treffer **und** ein semantischer
    Block. Nach der alten Fassung wäre das rot gewesen — und genau das war der Fehler.
  - **Handpunkt 16** (`related_notes`) — **grün**: 20 Treffer mit Score, absteigend, aus
    demselben Bereichsordner (0.94 bis 0.81). Die Gegenprobe mit einer frisch angelegten
    Notiz ist **nicht** gelaufen: sie verlangt einen Schreibvorgang, und das
    Bestätigungs-Modal wartet dabei auf einen Menschen — der Treiber liefe in seine
    Zeitüberschreitung. Bleibt Handarbeit.
  - **Gegenprobe zur Schwellenlogik** — dieselbe Frage wie am 13.08. („Welche Notizen
    behandeln den Einsatz lokaler KI-Modelle im Vault?"). Der Volltext lieferte **vier**
    Treffer, die alte Schwelle hätte den semantischen Weg also erneut abgeschaltet. Der
    semantische Block enthielt genau die am 13.08. vermissten Notizen (`Lokale KI.md` 0.71,
    `Spec Ollama-Testumgebung.md` 0.71, `Betriebseinstellungen ThinkPad.md` 0.69,
    `Modell gemma4 26b.md` 0.68). Gemessen am **ungekürzten Tool-Ergebnis**, nicht am
    Antworttext — sonst wäre nicht unterscheidbar, ob die Pfade aus dem Werkzeug kamen.
  - **Gegenprobe zur Ordnernotiz-Markierung** — derselbe `_Tasks`-Ordner wie in Handpunkt 19.
    Werkzeug: `13 von 13 Notizen … (davon 1 Ordnernotiz)` und `_Tasks.md (Ordnernotiz)` in
    der Zeile. Koda antwortete „insgesamt **12 Aufgaben** (die 13. Datei ist die Ordnernotiz
    `_Tasks.md`)" — die Falschzählung aus Handpunkt 19 ist damit behoben, und zwar ohne
    jede Skill-Anweisung.
  - **Nicht gelaufen: 17 und 18.** Beide verlangen einen Eingriff in laufende Dienste
    (Embedding-Endpunkt stoppen bzw. vault-rag deaktivieren) und bleiben offen.

- **2026-08-14, Handpunkt 19** (`list_notes` im Gespräch) — Vault `80_Arbeit`, Branch-Build,
  Endpunkt `verdigado-think`, `maxRounds: 25`, `listNotesMaxRows: 150`. Gefahren als
  Praxistest über die Debug-Schnittstelle, nicht von Hand: dieselbe Frage wie am 13.08. an
  den Skill `project-session-start`, der **unverändert** `search_notes` + `read_note`
  vorschreibt. Koda wählte von selbst
  `list_notes {"folder":"…/26-001-03 Koda Einrichtung/_Tasks/","fields":["status","priority","frist"]}`
  und bildete die Aufgabenlage erstmals aus den Dateien statt aus dem Projektlog: 13 gemeldet,
  13 Dateien ohne Erledigt-Status, die genannten Top-3 in Titel, Priorität und Status korrekt,
  10 von 25 Runden (13.08.: 3). Das vorgeschriebene sechszeilige Ausgabeformat wurde
  eingehalten — an ihm waren zuvor zwei Schärfungsrunden des Skill-Textes gescheitert.
  **Einschränkung:** eine der 13 Dateien ist die Ordner-Notiz `_Tasks.md`; es sind 12 echte
  Aufgaben. Koda hat `tags` nicht mit abgefragt und konnte deshalb nicht prüfen, ob
  `tags: aufgabe` gesetzt ist. Der Fall mit **gekappter** Liste (Warnung in Zeile 1 im
  Gespräch) ist damit **nicht** abgedeckt und bleibt für Handpunkt 19 offen.

- **2026-08-13** — Obsidian 1.13.7, Vault `10_Pallas`, Plugin **0.2.1-Build der
  Retrieval-Andockung** (HEAD `7e1fc7e`): **7/7 grün**, inklusive des neuen Prüfpunkts 1b
  (`apiVersion 1` · Fläche `apiVersion, related, search, status` · `indexed=true` ·
  5935 Notizen) gegen **vault-rag 0.23.0**.
  **Gegenprobe gefahren und bestanden:** erwartete API-Version im Treiber auf `2` gesetzt →
  **6/7, genau 1b rot**. Der Punkt kann also rot werden — anders als Prüfpunkt 3, der seit
  2026-08-07 unbewiesen ist. Die Handpunkte 14–18 (semantisches Retrieval mit echten
  Modell-Antworten) sind in diesem Durchlauf **nicht** gelaufen und bleiben offen.

- **2026-08-08** — Obsidian 1.13.6, Vault `10_Pallas`, Plugin **0.2.1** (HEAD `2e37683`):
  **6/6 grün**. Prüfpunkt 1 meldet die Version aus dem laufenden Plugin und belegt damit
  zugleich, dass der 0.2.1-Build wirklich geladen war. Keine Gegenprobe gefahren.
  Weiterhin unbewiesen ist Prüfpunkt 3: er lief auch hier grün, aber im Code steht nach wie
  vor `buttonEl.disabled` — geprüft wurde die Umgehung, nicht die Ursache. Der Punkt erledigt
  sich mit der Kit-Extraktion, in der der Testen-Knopf pro Zeile entfällt.

- **2026-08-07** — Obsidian 1.13.5, Vault `10_Pallas`, Plugin 0.1.0 (HEAD `b2a5682`):
  **6/6 grün**.
  Gegenprobe: Wikilink-Handler (`openLinkText`) ausgebaut → **5/6**, genau Punkt 6 rot.
  Zweite Gegenprobe am Freeze-Punkt schlug fehl: mit wieder eingebautem `setDisabled()`
  blieben alle sechs Punkte grün — der Freeze vom 2026-08-06 ließ sich nicht reproduzieren
  (frisch gestartete App, Plugin per `disablePlugin/enablePlugin` geladen; echter *und*
  synthetischer Mausklick probiert). **Prüfpunkt 3 ist damit unbewiesen** — er war noch nie
  rot. Details im Kopfkommentar von `scripts/gui-smoke.ts`.
