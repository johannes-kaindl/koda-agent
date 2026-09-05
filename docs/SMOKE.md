# Koda GUI-Smoke (manuell, pro Release)

Vorbereitung: `npm run build`, `npm run smoke:gui -- --setup` (baut den Staging-Vault aus
`docs/images/fixture/`), LM Studio mit Tool-faehigem Modell starten.

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
21. Eine Antwort mit Liste **und** Codeblock erzeugen → schon **während** des Streams stehen die
    fertigen Absätze gerendert da (Aufzählungspunkte statt Bindestriche); nur der laufende Absatz
    ist Rohtext, und ein angefangener ```-Block wird nicht mittendrin als Absatz gerendert.
22. ~~Thinking-Schalter bei einem always-on-Modell~~ → **automatisiert als Prüfpunkt 13**
    (2026-08-30). Er brauchte nie ein solches Modell: `isAlwaysOnThinker` ist eine
    **Namens**heuristik, der Modellname genügt. Was als „der einzige Punkt, den kein Automat
    erreicht" in dieser Liste stand, war eine Annahme über den Prüfling — nicht über den Prüfer.
    Offen bleibt allein die Request-Seite (dass gpt-oss `reasoning_effort:"none"` wirklich
    ablehnt); die ist per Unit-Test fixiert und braucht ein echtes Modell.

23. **Arbeitskontext, Praxistest (`gui:ask --full`):** eine Notiz mit Kopfdaten im Hauptbereich
    öffnen, Modus „Arbeitsplatz", Frage „Worum geht es in der Notiz, die ich gerade offen habe?"
    → der Bericht zeigt den `⊕ Arbeitskontext`-Block mit dem Pfad, und Koda ruft `read_note`
    **auf genau diesen Pfad**, nicht `search_notes`. Ein `read_note` auf einen anderen Pfad ist
    rot, auch wenn die Antwort inhaltlich stimmt.
    → die Naht dazu messen die automatisierten Prüfpunkte 20–22 (Block, Modus, Werkzeugliste); dieser Handpunkt misst das Modellverhalten.
24. **Markierung ersetzen:** einen Satz markieren, „Verbessere den markierten Satz" → ⚙
    `edit_active_note` mit Modal (Markierung gegen Ersatz), nach „Schreiben" steht der Ersatz im
    Editor. Modus „Aus" als Gegenprobe: Koda kennt die Markierung dann nicht und muss nachfragen.

    → die Invariante misst der automatisierte Prüfpunkt 23 mit einem Fake-Ersatz; dieser Handpunkt misst, ob das Modell das Werkzeug wählt.
25. **Restaurierte Tabs beim Neustart:** Obsidian mit mehreren Tabs neu starten (oder das
    Vault-Fenster schließen und per URI neu öffnen), keinen Tab anfassen, im Modus
    „Arbeitsplatz" `currentContext()` lesen → „Offene Tabs (N)" nennt alle N restaurierten
    Tabs, keine Seitenleisten-Ansichten (Backlinks, Gliederung). Gemessen 2026-09-02: vor dem
    Fix 1 von 4 Tabs plus drei Seitenleisten-Ansichten.

    → **seit 2026-09-05 automatisiert (Prüfpunkt 27).** Der Treiber braucht dafür weder
    Neustart noch Fenster-Schließen: `workspace.changeLayout(workspace.getLayout())` stellt
    die nicht-aktiven Tabs so wieder her wie ein Neustart, nämlich als DeferredViews
    (gemessen 2026-09-05: 3 von 4 Leaves). Der Handpunkt bleibt trotzdem stehen — er misst
    den **echten** Neustart, der Prüfpunkt nur dessen Nachbau. Wer nach einem
    Obsidian-Update misst, fährt ihn.

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
    ⚠️ **Zwei Fallen, beide 2026-08-30 von der vault-rag-Session gemeldet.** (a) Die Trefferliste
    auf **Plausibilität** ansehen, nicht nur darauf, dass sie kommt — ein defekter Index liefert
    zusammenhanglose Treffer mit *hohen* Scores (0.85–0.92 über `api.related()`, also
    Notiz-gegen-Notiz) — er sieht überzeugender aus, gerade wenn er falsch ist.
    ⚠️ **Einen Vergleichswert für „gesund“ gibt es nicht.** Hier stand bis 2026-09-04
    „Median ~0.4“; vault-rag hat die Zahl an dem Tag **ersatzlos gestrichen** (`b6017dc`),
    weil sie nie gemessen worden war — sie existierte an genau zwei Stellen im Workspace,
    beide aus derselben Feder. Plausibilität heißt deshalb: **inhaltlich** hinsehen, oder
    den **Rang** prüfen (findet sich eine Notiz über ihren eigenen Wortlaut auf Rang 0?) —
    dessen Erwartungswert steht ohne jede Skala fest. (b) **Keine Notiz nehmen, die während eines laufenden Reindex entstanden oder
    geändert wurde.** Ausgerechnet „frisch angelegt", das Mittel für die Gegenprobe, trifft
    diesen Fall — sonst misst man vault-rags Race und schreibt es Kodas Aufbereitung zu
    (`src/core/tools/retrieval.ts` ist an beidem unschuldig).
    **Die Begründung dafür ist am 2026-09-03 korrigiert worden, die Regel nicht.** Der
    frühere Satz „`reindexAll` sammelt in einer lokalen Map und ersetzt am Ende die ganze
    Vektor-Tabelle" beschreibt den Stand **vor** vault-rag 0.29.0; seither schreibt der Lauf
    alle 250 Notizen einen vollständigen Zwischenstand (`617eb4d`, selbst nachgesehen). Das
    ändert am Grund für die Vorsichtsregel nichts: `reindexVault` snapshottet die Pfadliste
    beim Start, und eine danach entstandene Notiz ist in keiner der Mengen, aus denen der
    Lauf seinen Endstand baut — **das gilt vor wie nach dem Checkpoint-Umbau**. Beides am
    Code nachgesehen von der Session `vault-rag-b1`, die zusätzlich ein zweites, mit
    `617eb4d` neu entstandenes Fenster meldet (ein Live-Update während des Checkpoint-Awaits
    kann verloren gehen). ⚠️ Beides ist **Code-Lektüre, kein beobachteter Fall** — vault-rag
    führt es als eigene Task. Für den Handpunkt hier ändert sich nichts: eine frisch
    angelegte Notiz ist als Gegenprobe nur brauchbar, wenn gerade kein Reindex läuft.
    ⚠️ **Die naheliegende Prüfung dafür taugt nur in eine Richtung.** Eine sich bewegende
    mtime von `_vaultrag/index.bin` **belegt** einen laufenden Lauf; eine stillstehende
    belegt **nicht** das Gegenteil (Korrektur von `vault-rag-b1`, 2026-09-03, am Code):
    `reindexAll` entscheidet **einmal vor der Schleife**, ob es Zwischenstände schreibt —
    passt das Embedding-Modell auf der Platte nicht zum aktuellen, schreibt der ganze Lauf
    keinen einzigen, und die Datei liegt stundenlang still, während indiziert wird.
    Ausgerechnet der Modellwechsel ist der häufigste Anlass für einen Voll-Reindex. Dazu
    kommt der erste Checkpoint frühestens nach 250 Notizen, bei ≤250 Notizen gar keiner.
    Für den negativen Fall ist die Statusleiste im laufenden Obsidian der ehrlichere Zeuge
    (`↻ embedding…` mit Fortschritt) — die braucht aber ein Fenster.
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

⚠️ **Zuerst prüfen, wer sonst an Obsidian hängt.** Obsidian ist Single-Instance — ein
`quit` trifft die Instanz, an der möglicherweise eine andere Session arbeitet, und zerstört
deren Zustand. Der eigene Lauf ist danach sauber grün; der Schaden entsteht woanders und
fällt nicht auf.

```bash
lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "läuft bereits — NICHT beenden"
```

Hört der Port schon, dann **mitnutzen statt neu starten**: ein eigenes Fenster per
`vault-open` über IPC öffnen, dann `attachTo("workspace", port, vault)` — der Vault-Name
wählt, nicht die Reihenfolge. ⚠️ Die Port-Prüfung ersetzt die Frage nicht: sie zeigt aktive
CDP-Treiber, aber nicht, wer ein Fenster offen hält oder auf den Port wartet.

Erst wenn nichts läuft — oder nach Absprache mit dem, der es benutzt — gilt das Rezept unten.

Achtundzwanzig dieser Punkte fahren automatisiert selbst (`scripts/gui-smoke.ts`, CDP gegen ein
laufendes Obsidian — CORE-TEST-02 b; Basis seit 2026-08-07, seither um 1b, 1c und —
2026-08-18 — 7 (Verdichtungs-Marken) und 8 (Settings-Gruppe „Kontext & Verdichtung")
erweitert, 2026-08-30 um 9–12 für die umgebaute Sidebar und um 13, den gesperrten Zustand des
Thinking-Schalters, 2026-08-31 um 16–18 für die Modell-Steuerung: Reset auf den
Auslieferungsstand, die GESENDETE Werkzeugliste bei einem abgeschalteten Werkzeug, das
Vorschau-Modal mit Memory und Skills; 2026-09-02 um 19, den Kit-Vertrag `hide()` → Cache
verwerfen; 2026-09-04 um 24–26 für `move_note`/`delete_note`; 2026-09-05 um 27 und 28 —
restaurierte Tabs (DeferredViews, vorher nur Handpunkt 25) und doppelte Tab-Pfade).
Voraussetzung ist der eine Handgriff, der Handarbeit bleibt:

```bash
osascript -e 'quit app "Obsidian"'
open -a Obsidian --args --remote-debugging-port=9222
npm run build
npm run smoke:gui -- --setup            # Staging-Vault aus docs/images/fixture/ herstellen
npm run smoke:gui -- --vault koda-agent
```

⚠️ **Gefahren wird gegen den Staging-Vault `koda-agent`, nicht gegen den Arbeits-Vault** —
`--setup` baut ihn seit dem 2026-09-01 aus dem getrackten Fixture (`docs/images/fixture/`,
README dort). Zwei Gründe, beide gemessen: **Punkt 16 und 17 schreiben Einstellungen**
(`systemPromptOverride`, `toolsDisabled`), und ein hart abgebrochener Lauf lässt sie stehen —
im Arbeits-Vault wären das die echten. Und im Arbeits-Vault liegt der **Store-Build** statt des
Repo-Stands, was `manifest.version` nicht verrät, weil beide dieselbe Nummer tragen (Dach-`AGENTS.md`
§ Staging-Vaults; vier grüne Läufe im Workspace waren am 2026-08-30 aus genau diesem Grund unbelegt).

⚠️ **Kopieren ist kein Deploy.** Ein laufendes Obsidian hält den alten Stand im Speicher; erst
`disablePlugin` → `loadManifests` → `enablePlugin` lädt den neuen. Am 2026-09-01 meldete eine
Gegenprobe deshalb 18/18 für einen Stand, der gar nicht geladen war.

Geprüft werden: Plugin aktiv · **Retrieval-Andockung** (vault-rags Vertrag liegt in der
Form vor, gegen die Koda gebaut ist) · **Frontmatter-Naht** (`metadataCache` liefert
Frontmatter in der Form, gegen die `pickFields` gebaut ist) · Sidebar mit Eingabefeld und
Knöpfen · Klick auf „Testen“ friert den Renderer nicht ein · toter Endpunkt wird als nicht
erreichbar angezeigt · **Settings-Gruppe „Kontext & Verdichtung“** (Überschrift + Zahlenfeld
„Kontextfenster (Token)“ vorhanden) · zwei tote Endpunkte ergeben Klartext statt Stacktrace ·
Wikilink in der Antwort öffnet die Notiz · **Verdichtungs-Marken** (Stufe 1, Stufe 2
aufklappbar mit Text, erzwungener Zusatz „Überlauf“/„overflow“) werden gerendert · **Statuszeile**
über eine ganze Werkzeug-Runde · **Kontextfenster-Belegung** inkl. Warnschwelle · **Thinking-Schalter**
in der Kopfzeile · **Rückfrage vor dem Verwerfen** eines Gesprächs · **Reset der Anweisung** stellt Override
und Textarea auf den Auslieferungsstand zurück · ein **abgeschaltetes Werkzeug** bleibt aus der
**gesendeten** Werkzeugliste (`currentToolNames()`) und kehrt nach dem Zurückschreiben zurück ·
das **Vorschau-Modal** führt Memory- und Skills-Abschnitt · **`hide()` verwirft den
Modell-Cache**, ein tot gemessener Endpunkt bleibt also nicht die ganze Sitzung tot.

⚠️ **Punkt 2 misst seit dem 2026-09-01 die Größe der Kopfzeilen-Aktionen, nicht ihre
Existenz — und das ist der teuerste Fund dieser Runde.** Von 0.9.0 bis 0.10.0 hingen
„Neues Gespräch" und der Thinking-Schalter an `addAction()`, also im echten View-Kopf. Den
blendet Obsidian in **jeder** Seitenleiste per `app.css` aus
(`.workspace-split.mod-right-split .view-header { display: none }`) — die beiden Knöpfe
standen im DOM und **kein Nutzer konnte sie sehen**. „Neues Gespräch" war damit über zwei
Releases hinweg für niemanden erreichbar, denn einen Befehl dafür gab es nicht. Der
Prüfpunkt war die ganze Zeit grün, weil er `querySelectorAll(".view-action")` zählte.
Gefunden hat es Johannes im Alltag, nicht der Automat.

Zwei Lehren stecken darin, und die zweite ist die unbequemere:

- **Existenz ist nicht Sichtbarkeit.** Gemessen wird jetzt `getBoundingClientRect()`; in der
  Sidebar war die Höhe 0, im Hauptbereich 38 px (Gegenprobe am selben Element).
- **Ein Sichtbarkeits-Test misst nur dann den Fall, wenn er unter dessen Bedingung läuft.**
  Im Hauptbereich ist der View-Kopf sichtbar — dort wäre auch die kaputte Fassung grün
  gewesen. Punkt 2 prüft deshalb zusätzlich `inSidebar` und ist sonst nicht entscheidbar.
  Das ist dieselbe Falle wie die Lesson vom 2026-09-01 („ein Beleg-Test mit erfundenem Namen
  belegt den Nachbarzweig"), nur mit dem *Ort* statt dem *Namen* als Achse.

**Gegenprobe gefahren (2026-09-01) — und der erste Versuch war ungültig.** Der Punkt wurde
gegen den Stand *vor* der Reparatur gehalten: erwartet rot, gemessen **18/18 grün**. Ursache
war nicht der Prüfpunkt, sondern die Messung — der Treiber lädt das Plugin **nicht** neu,
Obsidian hielt also weiter den reparierten Build im Speicher, während im Vault schon der alte
lag. Punkt 1 merkt davon nichts: beide Builds tragen `manifest.version` 0.10.0. Nach
`disablePlugin` → `loadManifests` → `enablePlugin` (Kopfzeile weg, nur noch ein Befehl
registriert) lief derselbe Prüfpunkt **17/18, Punkt 2 rot** — und mit dem reparierten Build
wieder 18/18. Erst damit ist belegt, dass er seinen Gegenstand bewegt.

⚠️ **Merksatz für jeden künftigen Lauf: Dateien kopieren ist kein Deploy.** Wer den Build im
Vault austauscht und sofort misst, misst den Stand im Speicher. Das ist dieselbe Gattung wie
der Befund oben — nur dass hier der *Prüfling* nicht angekommen war statt der Blick.

Die Reparatur ist eine Kopfzeile im View-**Inhalt** (`.koda-header`, wie UI-STANDARD §4 es
ohnehin verlangt) plus zwei Befehle (`new-chat`, `toggle-thinking`) — ein zweiter Zugang, der
von der Darstellung unabhängig ist.

Die Punkte **9–12** (2026-08-30) kommen wie 7 ohne Modell aus — sie speisen den
Aktivitäts-Zustandsautomaten mit derselben Ereignisfolge, die `main.ts` aus dem Agent-Loop
durchreicht, und räumen ihre Spuren im `chatLog` selbst wieder weg. Zwei von ihnen sind
**Gegenproben mit zwei Werten**, nicht bloße Vorhandenseins-Prüfungen: Punkt 9 vergleicht die
Beschriftung über fünf Zustände hinweg (eine Zeile, die immer „arbeitet" sagt, wäre grün und
trotzdem kaputt), Punkt 10 misst die Belegung einmal am echten und einmal an einem winzigen
Kontextfenster — die Zahl muss steigen **und** die Warnung anspringen.

Punkt **10 schließt zugleich eine der beiden Messlücken vom 2026-08-28** von der anderen Seite:
gemessen wird nicht mehr nur, dass das Settings-Feld existiert, sondern dass seine Zahl in der
Sidebar ankommt. Offen bleibt `hide()` (Cache-Verwurf beim Schließen des Tabs) — dafür braucht es
einen Endpunkt, der während des Laufs an- und ausgeht.

Die Punkte **16–18** (2026-08-31, Modell-Steuerung) kommen ebenfalls ohne Modell aus. Punkt 16
schreibt eine eigene Anweisung, drückt den `rotate-ccw`-Knopf mit `clickReal` und prüft **drei**
Dinge zugleich: `settings.systemPromptOverride` leer, die Textarea leer, ihr Platzhalter weiterhin
gesetzt — der Vorwert wird vor dem Punkt gesichert und danach zurückgeschrieben, wie beim
Thinking-Schalter (Punkt 13). Punkt 17 ist die Gegenprobe zum Trugschluss „ein Punkt, der nur den
Schalter anfasst, hätte seinen Gegenstand nie berührt": gemessen wird `plugin.currentToolNames()`
— dieselbe Methode, die `ask()` beim Zusammenbau der Werkzeugliste ruft —, mit einer dritten
Bedingung, die belegt, dass das Zurückschreiben wirklich griff (`write_note` steht danach wieder in
der Liste). Punkt 18 öffnet das Vorschau-Modal über den Knopf „Aktive Anweisung ansehen" und prüft,
dass `## Memory` **und** `## Skills` im Text stehen — beides trägt der Staging-Vault über sein
Fixture. **Ungeklärt von hier aus:** ob das Modal im Haupt- oder im Einstellungsfenster entsteht
(die Settings-Bruecke hat kein `window.app`, s. Kopfkommentar von `attachTo`) — der Punkt pollt
deshalb auf beiden und vermerkt im Detailtext, welches Fenster geliefert hat.

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

**Seit 2026-08-31 fuehrt der Bericht vor den Werkzeug-Aufrufen den zuletzt gesendeten
System-Prompt** (`plugin.lastSystemPrompt`) — Laenge in Zeichen plus, ob er vom
Auslieferungsstand abweicht (`settings.systemPromptOverride.trim() !== ""`, kein
Textvergleich). Ohne `--full` stehen nur die ersten 400 Zeichen da; `null` (noch keine
Frage in dieser Sitzung) zeigt „noch nichts gesendet" statt eines leeren Blocks.

**Seit 2026-08-21 weist der Bericht auch Verdichtungs-Marken aus** — `⇢ Verlauf verdichtet
(Stufe 1: n Tool-Ergebnisse gekürzt, x KB)` bzw. `(Stufe 2: n Runden zusammengefasst)`, die
Zusammenfassung selbst nur mit `--full` vollständig. Ohne sie las sich der Bericht ab einer
Verdichtung so, als hätte Koda den ganzen Verlauf vor Augen: ein erneutes `read_note` auf eine
schon gelesene Notiz sah nach Verschwendung aus statt nach Folge der Verdichtung.
**Beide Stufen sind gegen echte Records belegt** — Stufe 1 am 2026-08-22, Stufe 2 am
2026-08-24; Einzelheiten unter „Durchläufe".

**Punkte 24–26 (seit 2026-09-04): `move_note` und `delete_note`.** Der Kern ist Punkt 24,
und er beantwortet eine Frage, die aus der Doku nicht zu beantworten war: `fileManager.renameFile`
soll die Wikilinks verweisender Notizen nachziehen — gilt das auch, wenn Obsidians Einstellung
*„Automatically update internal links"* **aus** steht? Der Punkt **setzt die Einstellung nicht**,
er liest sie und schreibt sie ins Protokoll: ein Prüfpunkt, der sich seine Vorbedingung selbst
herstellt, misst nicht mehr, was der Nutzer erlebt. Gemessen wird der Link im **Dateiinhalt** der
verweisenden Notiz, nicht `resolvedLinks` — der Cache kann einen Link auflösen, während im Text
ein toter Wikilink steht. Kulisse ist `Notes/Tools.md`, das im Fixture von zwei Notizen verlinkt
wird; Punkt 25 prüft, dass genau diese **2** im Modal steht (die Zahl wandert durch drei
Schichten: `metadataCache` → Port → Modal, und eine davon still auf 0 zu setzen fiele sonst nicht
auf). Punkt 26 misst die Regel „Wirkung schlägt Ort" am laufenden Plugin: `delete_note` fragt
**auch im Koda-Ordner**, wo ein `write_note` frei wäre. Er legt sich dafür eine Wegwerf-Notiz an
und räumt sie im `finally` weg.

⚠️ **Was Punkt 24 beim ersten Lauf gefunden hat (2026-09-04), und warum er dafür gebaut war:**
`fileManager.renameFile` legt **fehlende Zielordner nicht an**. Der Entwurf hatte das Gegenteil
angenommen („Missing folders are created"), und ein Move nach `Archiv/Tools.md` scheiterte
deshalb mit `ENOENT … rename`, solange `Archiv/` fehlte. Für ein Modell ist das die schlechteste
Fehlerart: die Meldung nennt einen Systemfehler statt der Ursache, und ein Zielordner, den es
gerade erfinden will, ist beim Aufräumen der **Normalfall**, nicht die Ausnahme. Behoben durch
`ensureParents` vor dem Rename, wie `create` es schon tat. Die Unit-Tests konnten das
strukturell nicht finden — der Fake-Port im Test ist ein `Record<string, string>`, in dem jeder
Pfad ohne Ordner existiert. **Das ist die Arbeitsteilung, für die es den GUI-Smoke gibt:** die
pure Schicht misst die Regel, der Smoke die Naht zum Host.

⚠️ **Der zweite Befund desselben Laufs, und er betraf den PRÜFPUNKT, nicht das Produkt:**
Obsidian schreibt einen Wikilink nur um, wenn er sonst nicht mehr auflöst — und wählt dabei die
**kürzeste eindeutige Form**. Gemessen an einer Probe-Notiz mit beiden Formen nebeneinander,
beim Verschieben `Notes/Tools.md` → `Archiv/Tools.md`:

| Linkform | vorher | nachher |
|---|---|---|
| kurz | `[[Tools]]` | **unverändert** — löst auf `Archiv/Tools.md` auf |
| mit Pfad | `[[Notes/Tools]]` | `[[Tools]]` — **nicht** `[[Archiv/Tools]]` |

Die erste Fassung des Punktes prüfte „steht der neue Pfad im Text der verweisenden Notiz?" und
war deshalb **rot, obwohl alles richtig war**: das Fixture verlinkt kurz, und ein kurzer Link
muss beim Verschieben nicht angefasst werden. Der Punkt prüft jetzt beide Hälften an einer eigens
angelegten Probe-Notiz — die Verlinkung bleibt intakt (der kurze Link löst auf den **neuen** Pfad
auf) und der Text wird angepasst, wo er es muss. **Die Lehre ist allgemeiner als der Fall:** wer
das *Ergebnis* einer fremden Automatik prüft, muss deren Regel kennen, sonst misst er seine eigene
Erwartung. „Der Pfad steht im Text" war meine Erwartung; Obsidians Regel ist „so kurz wie
eindeutig".

**Was der Treiber bewusst nicht prüft:** alles, was eine echte Modell-Antwort braucht (die
Punkte 2, 3, 5, 6, 7, 10, 14–19 oben). Gemessen am 2026-08-07 ist `qwen/qwen3.6-27b` über einem
großen Vault **>90 s stumm**, bevor das erste Token kommt — Prüfpunkte darauf wären langsam
und nicht deterministisch. Ebenfalls Handarbeit bleibt das Bestätigungs-Modal (Punkt 5):
`VaultTools` wird in `ask()` lokal erzeugt und ist am Plugin nicht exponiert.

### Durchläufe

- **2026-09-03 (15:10–15:20), Handpunkt 16 auf Plausibilität — der Weg trägt, die Zahlen
  sind offen, und der Prüfling war schlecht gewählt.** Erster Lauf gegen den echten Index
  seit dem 2026-08-24, möglich geworden durch vault-rags Etappen-Reindex. `gui:ask --full`
  gegen `10_Pallas` (6.664 indexierte Notizen), Modell `qwen/qwen3.8-27b`, Frage „Was hängt
  mit der Notiz `25_Coding/koda-agent/koda-agent` zusammen?".
  **Was belegt ist:** `related_notes` läuft und liefert 20 Treffer mit Scores; die Liste ist
  inhaltlich stimmig (Schwester-Cockpits, eigene `_Log`-Einträge, Nachbar-Plugins, `_docs`,
  eine passende UI-Task). Die **zusammenhanglosen** Treffer mit hohen Scores, die den Befund
  vom 24.08. ausmachten, sind nicht wieder aufgetreten.
  **Die Score-Zahlen sind gemessen, aber UNBEWERTBAR — aus zwei unabhängigen Gründen.**
  Gemessen: Median **0.92**, max 0.93, min 0.91, Spannweite **0.02** über 20 Treffer.
  (1) *Der Prüfling war ungeeignet:* ein Coding-Cockpit gehört zu ~25 Notizen aus
  **demselben Template** (gleiche Überschriften, Callouts, `.base`-Einbettungen) — dass die
  sich stark ähneln, ist inhaltlich richtig, und eine Spannweite von 0.02 ist dort das
  erwartbare Ergebnis. „Strukturelle Zwillinge" und „kaputter Index" sind daran nicht zu
  trennen. (2) *Es gibt keine Vergleichsskala:* die naheliegende Deutung wäre „0.9+ ist
  verdächtig, gesund ist ~0.4" gewesen — diese Zahlen stammen aus vault-rags Cockpit vom
  2026-08-30, und die dortige Session hat auf Nachfrage selbst festgestellt, dass **nicht
  festgehalten ist, mit welchem Aufruf sie entstanden sind** (`search()` über eine Query
  oder `related()` über eine Notiz, mit welchem k, über welche Notizklasse). Query-gegen-Notiz
  und Notiz-gegen-Notiz sind verschiedene Größen; ein Vergleich über die Grenze trägt nicht.
  **Ein Score ohne dokumentierten Aufrufweg ist keine Skala** — wer ihn als eine benutzt,
  baut eine Deutung auf eine Zahl ohne Bezugssystem. Wer den Punkt wiederholt, nimmt eine
  **inhaltliche** Notiz ohne Template-Klasse; belastbarer als der Score ist ohnehin der
  **Rang** (findet sich eine Notiz über ihren eigenen Wortlaut auf Rang 0?), weil sein
  Erwartungswert ohne jede Skala feststeht — so misst vault-rags 40-Notizen-Probe.

  **Nachtrag 2026-09-04: Grund (2) war schwerwiegender als hier notiert — die 0.4 hatte
  nicht bloß keinen dokumentierten Aufrufweg, sie hatte überhaupt keine Quelle.** Auf
  unseren Hinweis hin hat vault-rag nachgemessen, woher die Zahl stammt: sie stand an genau
  zwei Stellen im Workspace, in ihrer `AGENTS.md` und in einer Task, in die dieselbe Session
  sie am selben Nachmittag selbst hineinkopiert hatte. Keine Messung, keine Stichprobe, kein
  Lauf. Ersatzlos gestrichen in `b6017dc` — bewusst **nicht** mit einem Aufrufweg versehen,
  denn das hätte ihr eine Herkunft angedichtet, die sie nie hatte. Die verbleibende Zahl
  (0.85–0.92) hat ihren Aufrufweg bekommen: `api.related()`, Notiz-gegen-Notiz.
  **Für diesen Punkt heißt das: der Score ist als Prüfgröße endgültig raus, der Rang ist
  die Messung.** Und die allgemeine Lehre wird schärfer als „ein Score ohne Aufrufweg ist
  keine Skala": eine übernommene Zahl trägt erst, wenn jemand ihre Herkunft *gemessen* hat —
  ein zweites Vorkommen kann die Kopie des ersten sein.
  **Nebenbefund, der Kodas Werkzeuggrenze belegt:** das Modell rief zuerst
  `related_notes({"path": "…/koda-agent"})` **ohne** `.md` auf, bekam
  `ERROR: Nur Markdown-Notizen (.md) erlaubt` und korrigierte sich im nächsten Aufruf
  selbstständig — eine sprechende Fehlermeldung an der Grenze ist mehr wert als ein stiller
  Fallback.
  **Vorgeschichte des Laufs, weil sie die Kosten erklärt:** Obsidian lief ohne Debug-Port,
  der Neustart brauchte Johannes' Freigabe. Wen ein Quit trifft, kann keine Session messen —
  `/json/list` braucht genau den Port, den man erst herstellt. Gebündelt mit `vault-rag-b1`
  gefahren: ein Neustart, eine Freigabe. Wiederhergestellt wurde ein Fenster (`10_Pallas`).
  ⚠️ **Der erste Lauf war verloren**, weil die Ausgabe durch `tail` lief und der
  `related_notes`-Block mit den Scores oberhalb des Fensters lag — bei `gui:ask` die Ausgabe
  **in eine Datei** schreiben und danach filtern, nicht in der Pipe kürzen. Ein Lauf kostet
  zwei bis drei Minuten und ist nicht wiederholbar identisch.

- **2026-08-30 (19:02–19:15), Handpunkte 21 und 22 gefahren — beide belegt, plus ein
  Nebenbefund, der schwerer wiegt als beide.** Vault `10_Pallas`, Obsidian 1.13.7,
  LM Studio `qwen/qwen3.6-27b` (CORS geprüft, nicht angenommen). CDP-Lock gehalten und
  freigegeben (neuer Mechanismus seit diesem Abend).
  - **21 (Markdown während des Streams) belegt, und zwar mitsamt der Codefence-Regel.**
    88 Abtastungen über 35 s. Bei t=23,0 s stand der erste Block **gerendert** (`p`, `strong`),
    während der Tail im selben Moment Rohtext trug (`1. **Lesbarkeit und Einfach`). Bei
    t=34,6 s zwei Blöcke mit `ol`/`li` — die Aufzählung formatiert, während der Tail einen
    **offenen** Codefence hielt (```` ```python\nprint(" ````). Dass der Codeblock während des
    Streams **nie** gerendert wurde, ist kein Fehlschlag, sondern der Beleg: ein offener Fence
    ist keine Absatzgrenze, sonst zerrisse er.
  - **22 (Thinking-Schalter, always-on) belegt — mit ausdrücklicher Einschränkung.** Kein
    gpt-oss/harmony-Modell ist lokal vorhanden (LM Studio hält qwen3.x, gemma-4,
    qwen2.5-coder — alle hybrid oder nicht-denkend). Gemessen wurde die **Anzeige**-Seite über
    den Modellnamen, weil `isAlwaysOnThinker` eine Namensheuristik ist: normales Modell →
    „Thinking: an/aus", `aria-disabled=false`; `gpt-oss:20b` → „Thinking: immer an",
    `aria-disabled=true`, `is-disabled`, und ein Klick ändert nichts (`false` → `false`).
    **Nicht** gemessen ist die Request-Seite (dass gpt-oss `reasoning_effort:"none"` ablehnt) —
    die ist per Unit-Test fixiert. Der Punkt heißt also ehrlich „der Schalter verspricht
    nichts, was er nicht hält", nicht „gpt-oss wurde ausprobiert".
  - ⚠️ **Nebenbefund: Koda spricht Englisch in einem deutschen Obsidian.** Aufgefallen, weil
    die Schalter-Beschriftung nach einem `saveSettings()` von „Thinking: aus" auf
    „Thinking: off" wechselte. Obsidian selbst ist deutsch (sechs Zeugen aus seiner eigenen
    UI), `localStorage.language` steht auf `en`, Kodas `settings.language` auf `auto`.
    **Warum es niemandem auffiel:** Platzhalter und Knöpfe sind DOM-Werte, die beim `onOpen()`
    einmal gesetzt wurden — sie tragen die Sprache von damals. Nur Stellen, die `t()` **jetzt**
    auswerten, zeigen den echten Zustand.
    ✅ **Am selben Abend aufgelöst — es war kein Koda-Fehler.** `getLanguage()` liefert korrekt
    `en` (und wirft nicht, gemessen): `localStorage.language = en` **ist** Obsidians aktuelle
    Einstellung, die deutsche Oberfläche ist der Stand von vor der Umstellung und zieht erst
    beim Neustart nach. Koda war das einzige Plugin, das an dem Tag oft genug neu geladen wurde,
    um das zu zeigen. Zwei Zwischendiagnosen wurden dabei von Messungen widerlegt (Details in
    der Task). Die Reparatur blieb trotzdem richtig, korrigiert aber etwas anderes: die
    Auto-Erkennung lief entgegen dem Kit-Vertrag bei **jedem** `saveSettings()` statt einmal
    beim onload, und ein verschluckter Fehler wurde stillschweigend zu „Englisch".

- **2026-08-30 (11:41–12:05), erster Lauf nach der Sidebar-Angleichung — 14/14 grün, aber erst
  im vierten Anlauf; die drei roten Läufe davor waren alle Prüfpunkt-Defekte, keine
  Produktfehler.** Vault `10_Pallas`, Obsidian 1.13.7, Koda 0.8.0 mit dem Sidebar-Stand
  (`4a0e4d8` + Smoke-Fix), vault-rag reindexierte parallel (abgesprochen: kein App-Reload).
  - **Lauf 1 brach ab** (`v.activity is not a function`) — der Deploy allein reicht nicht, das
    Plugin muss neu geladen werden. Der Treiber tut das **nicht** selbst; er setzt ein
    deploytes, aktives Plugin voraus. Nachgeholt per `disablePlugin`/`loadManifests`/
    `enablePlugin` auf der eigenen Plugin-ID — bewusst **kein** App-Reload, weil eine
    Nachbar-Session einen zweistündigen Reindex im Speicher hielt.
  - **Punkt 11 war grün und maß den falschen Knopf.** `querySelector(".view-action")` traf
    Obsidians Lesezeichen-Aktion, nicht Kodas Thinking-Schalter — Obsidian hängt seine eigenen
    Aktionen in denselben Kopf und **vor** die des Plugins. Verraten hat es allein die
    Detailzeile („Beschriftung `Lesezeichen`"). **Ein Prüfpunkt, dessen Detailtext niemand
    liest, kann grün sein, ohne seinen Gegenstand je berührt zu haben.** Aus demselben Grund
    war Punkt 2 rot (er zählte Aktionen statt zu suchen).
  - **Punkt 6 maß ein fremdes Plugin.** Sein Ziel ist „erste Markdown-Datei ≠ die aktive" — und
    fiel damit auf `TaskNotes/Tasks/test.md`, wo TaskNotes den Wikilink durch ein eigenes
    Inline-Widget ersetzt. Kein `a.internal-link`, Punkt rot, an Koda nichts kaputt. Vorher war
    er grün, weil die Auswahl vom Zustand des **vorigen** Laufs abhing (Lauf 1 machte
    `_Cockpit.md` aktiv). Der Punkt probiert jetzt bis zu fünf Kandidaten und berichtet den
    übersprungenen. Merksatz: **wer seine Testdaten aus dem Nutzer-Vault nimmt, misst
    irgendwann ein fremdes Plugin.**
  - **Die vier neuen Punkte 9–12 waren auf Anhieb grün** und haben gemessen, was sie sollen:
    Statuszeile über fünf Zustände (`Denkt nach… → Durchsucht den Vault nach „Stress"… → Denkt
    nach… → Schreibt… → Kontext 1 % belegt`), Kontext-Belegung mit Gegenprobe (2 % → 100 % bei
    1024 Token, Warnung springt an), Thinking-Schalter in beide Richtungen, Rückfrage vor dem
    Verwerfen (Verlauf 2 → 2 Einträge nach Abbruch).
  - **Nicht gemessen, weil sie ein Modell brauchen:** Handpunkte 21 (Markdown während des
    Streams) und 22 (Thinking-Schalter bei einem always-on-Modell). Ollama war bis ~14:10 vom
    Reindex belegt. *(Beide am selben Abend nachgeholt; 22 wurde dabei zu Prüfpunkt 13.)*
  - **Nebenertrag für vault-rag, den kein einzelner Lauf gezeigt hätte:** über **vier** Läufe
    des Tages meldete Prüfpunkt 1b dessen Vertrag durchgehend wohlgeformt (`apiVersion 1`, alle
    vier Methoden, `indexed=true`), während die Notizzahl sichtbar wanderte —
    6665 → 6666 → 6526 → 6787. Der Vertrag hat also einen laufenden Voll-Reindex **und** ein
    Release des Anbieters unbeschadet überstanden. Zugleich ist es die praktische Bestätigung
    des Befunds vom selben Tag: **`indexed: true` sagt nichts über die Aktualität** — vier
    verschiedene Notizzahlen, viermal dieselbe Bereitschaftsmeldung. vault-rag hat das
    inzwischen ausdrücklich in den Doc-Kommentar von `ApiStatus.indexed` geschrieben
    (`f082af3`).

- **2026-08-24 (04:25–04:50), Handpunkte 13, 14, 15, 16, 19 gefahren — alle grün; ein
  Fremdbefund für vault-rag.** Vault `10_Pallas`, Obsidian 1.13.7, Koda 0.7.1,
  LM Studio `qwen/qwen3.8-27b`, GUI-Smoke davor 10/10.
  - **13 (nie zuvor verifiziert): belegt.** `.koda-log` trägt `user-select: text`, und eine
    echte `Selection` über den Log-Inhalt liefert 34 von 35 Zeichen zurück (Differenz ist der
    Umbruch zwischen den Blöcken). Gemessen wurde die Selektion selbst, nicht nur die
    CSS-Regel — ein Elternteil hätte sie sonst still schlucken können.
  - **14 + 15 in einem Lauf belegt.** Fünf `search_notes`-Aufrufe, **jeder** mit beiden
    beschrifteten Blöcken. Punkt 15 trägt der Aufruf `Stress`: ≥6 wörtliche Treffer, und der
    semantische Block steht trotzdem da — die Schwelle von vor 0.6.0 ist nachweislich weg.
  - **16 belegt, seine Gegenprobe nicht auslösbar.** `related_notes` läuft und liefert eine
    Liste mit Scores. Die eigens angelegte frische Notiz war binnen Minuten indexiert, „(noch)
    nicht im Index" ließ sich damit nicht herstellen; der Fall bleibt offen.
  - **19 vollständig belegt.** `list_notes` gewählt, Kappung als `⚠ UNVOLLSTÄNDIG: 848
    Notizen gefunden, 150 gezeigt` — und Koda **benennt** sie in der Antwort („insgesamt 848
    … daher hier die ersten 150"), statt sie zu verschweigen.
  - **Fremdbefund (gehört vault-rag, nicht Koda):** `related_notes` zur Notiz
    `40_Zettelkasten/Stress und Kapazitätsreduktion.md` liefert als ähnlichste Notiz einen
    Marp-Bugreport (0.92). Kodas Aufbereitung ist unschuldig — `api.related()` liefert direkt
    dasselbe. Eingegrenzt mit einer Selbstfindungs-Probe (Suche mit den ersten 300 Zeichen
    einer Notiz, dann nach ihr selbst im Ergebnis suchen): die **heute** angelegte Notiz findet
    sich auf Rang 0 mit 0.953, drei ältere (`Stress und Kapazitätsreduktion`, `Smart Composer
    Konfiguration`, `25_Coding/koda-agent/koda-agent.md`) finden sich **gar nicht**, obwohl der
    Suchtext wörtlich aus ihnen stammt. Da `related()` für dieselbe Notiz funktioniert, liegt
    ihr Vektor sehr wohl im Index — er passt nur nicht mehr zu ihrem Inhalt. Naheliegende
    Hypothese (nicht gemessen): die Re-Indexierung geänderter Notizen greift nicht.
    Abgelegt als Task im vault-rag-Cockpit, Zeiger hier.

- **2026-08-24 (04:05–04:20), Stufe-2-Marke belegt — die Gegenprobe ist damit vollständig.**
  Vault `10_Pallas`, Obsidian 1.13.7, Koda 0.7.1, LM Studio `qwen/qwen3.8-27b` (mit CORS),
  Fenster 4096 (`compactAt` 75 %, `keepToolResults` 3, Stufe 2 an, `maxRounds` 8).
  - **Der Ablauf, der am 22.08. fehlte:** erst eine Frage, die *durchläuft* (eine Tagesnotiz
    lesen + ausführlich zusammenfassen) — damit ist eine Runde abgeschlossen —, dann die
    Folgefrage mit `--keep-session` über eine zweite Notiz. Kein Lesekreis, beide Läufe unter
    dem Timeout.
  - **Der Bericht zeigte `⇢ Verlauf verdichtet (Stufe 2: 1 Runden zusammengefasst)`**, und der
    `chatLog` bestätigt ihn: der Record steht an Position 5 — direkt nach der zweiten
    `user`-Nachricht, also am Anfang der neuen Runde, mit der abgeschlossenen Runde 1 davor.
    Die positionsbasierte Marke sitzt richtig.
  - **`stats.bytes` = 13384 belegt die Verlust-Regel an der Zahl.** Runde 1 bestand aus
    109 (user) + 11869 (Tool-Ergebnis) + 1515 (Antwort) Zeichen. 11869 + 1515 = **13384** —
    die Nutzer-Nachricht ist nicht mitgezählt, weil sie nicht angetastet wird. Das ist der
    erste Beleg für „Nutzer-Nachrichten sind unantastbar" aus einem echten Lauf statt aus
    einem Unit-Test.
  - **Die Zusammenfassung erfüllt, was `buildSummaryPrompt` verlangt:** sie nennt den
    gelesenen Pfad, das Ergebnis und „keine offenen Punkte" — und keinen Rohinhalt.
  - **Kein Stufe-1-Record davor, und das ist korrekt:** `keepToolResults` steht auf 3, im
    Verlauf gab es genau *ein* Tool-Ergebnis. `stage1Targets` verschont die K jüngsten,
    `planStage1` liefert `null`, und der Loop geht zu Stufe 2. Wer nur den Bericht liest,
    hält das leicht für eine übersprungene Stufe — es ist die Regel, nicht ihr Ausfall.

- **2026-08-22 (00:00–00:20), Gegenprobe der Verdichtungs-Marken im `gui:ask`-Bericht —
  Stufe 1 belegt, Stufe 2 offen.** Vault `10_Pallas`, Obsidian 1.13.7, Koda 0.7.1,
  LM Studio `qwen/qwen3.8-27b`, Fenster 4096 (`compactAt` 75 %, `keepToolResults` 3,
  Stufe 2 an), `maxRounds` testweise 15.
  - **Lauf mit fünf Notizen lief in die Zeitüberschreitung (600 s), erzeugte dabei aber fünf
    echte Stufe-1-Records** (`stubbed` 8/5/2/2/1, `bytes` 33456/16157/8454/15478/4990). Die
    Berichtslogik gegen genau diesen `chatLog` gefahren: Marken sitzen an der richtigen
    Position, Zahlen decken sich mit `stats` („Stufe 1: 8 Tool-Ergebnisse gekuerzt, 32.7 KB").
  - **Was der Bericht damit erstmals zeigt:** das Modell liest nach jeder Verdichtung dieselben
    Notizen erneut — `2026-08-06.md` viermal. Das ist die Ursache der Zeitüberschreitung und
    genau die Beobachtung aus dem Nachtrag vom 19.08., die vorher nur am DOM sichtbar war.
    Ohne die Marken läse sich derselbe Bericht als sinnlose Wiederholung.
  - **Stufe 2 nicht erreicht:** sie braucht eine *abgeschlossene* Runde, der Lauf kam wegen des
    Lesekreises nie so weit. Ein zweiter Lauf mit engem Auftrag lief zwar durch (eine Notiz,
    Antwort korrekt), da standen die Settings aber wieder auf 262144 — ohne Verdichtung.
  - **Nebenbefund, behoben (`466fcec`):** der Berichtskopf meldete „Modell (keins gesetzt)",
    obwohl `qwen/qwen3.8-27b` lief — er las nur den Endpunkt-Override statt des globalen
    `settings.model`.
  - **Ablauf-Befund:** `visibilityState: "hidden"` trat wiederholt auf, weil ein anderes Fenster
    Obsidian vollständig überdeckte; `activate` + `show`/`moveTop`/`focus` kippt es nur, bis das
    nächste Fenster davorkommt. Verlässlich war erst `setAlwaysOnTop(true, "floating")` für die
    Dauer des Laufs (danach zurücksetzen). **Seitdem in der zentralen Brücke** — `requireVisible`
    eskaliert über `show`/`moveTop`/`focus` bis `setAlwaysOnTop`, `releaseAlwaysOnTop` nimmt es
    zurück (`obsidian-plugins@63f3eab`, CONVENTIONS CORE-TEST-09 a). Stufe 3 ist gemessen,
    Stufe 2 noch nicht live gefahren.

- **2026-08-21 (13:39), GUI-Smoke 10/10 mit dem 0.7.1-Kandidaten.** Vault `10_Pallas`,
  Obsidian 1.13.7, Build des Kit-Rückflusses (`ac13201`, vor dem Release-Bump), Plugin per
  `disablePlugin`/`enablePlugin` neu geladen. Anlass war nicht Routine: der Tausch gegen
  `obsidian-kit@0.27.0` berührt genau zwei Prüfpunkte — **5** (Klartext statt Stacktrace)
  hängt jetzt an `error_body`, **8** (Settings-Gruppe) am `settings_schema`-Walker; beide
  grün, dazu 7 (Verdichtungs-Marken, `stage1/stage2/forced` je 1). Handpunkte nicht gefahren
  — die Änderungen sind Kern-Refactor ohne Modell-Naht.
  - **Vorlauf, der zum Ablauf gehört:** das Zielfenster war `visible: true`, aber
    `document.visibilityState: "hidden"` (zwei Vault-Fenster in einem Prozess, `10_Pallas`
    verdeckt). Weder `osascript activate` noch `w.show()/focus()` allein kippten es;
    gewirkt hat **`activate` + `show()` + `moveTop()` + `focus()` mit Wartepause danach**.
    Kandidat für `requireVisible` in der zentralen Brücke (Memory
    `obsidian-fenster-sichtbarkeit-cdp`).
  - **Nach dem Deploy zeigt Obsidian die alte Version, bis der Manifest-Cache neu liest.**
    `disablePlugin`/`enablePlugin` allein meldete weiter 0.7.0, obwohl der neue Code lief —
    erst `app.plugins.loadManifests()` davor stellte 0.7.1 richtig. Wer die Version als Beleg
    für „der neue Build läuft" nimmt, misst den Cache, nicht das Plugin. **Steht seit
    2026-08-21 zentral** in `tools/obsidian-cdp/CLAUDE.md` § Architektur-Grundannahmen
    (`2e29544`, von vault-rag übernommen) — dort neben dem verwandten Notice-Befund: beides
    sind Prüfpunkte, die etwas Falsches belegen, ohne rot zu werden.

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


## Belegter Lauf: 2026-09-05, 08:30 — Etappe-2-Restposten (28/28), mit Gegenproben

Vault `koda-agent` (Staging), Obsidian 1.14.0, Plugin-Build von `8d3cd44` + Treiber mit den
neuen Punkten 27/28. Vier Läufe, CDP-Lock `--exclusive focus`, kein Quit — das Fenster kam per
`obsidian://open?path=` neben zwei fremden Vaults dazu.

**Der Kern des Tages ist nicht die 28, sondern dass Handpunkt 25 automatisierbar wurde.** Er
verlangte bisher einen Neustart oder ein geschlossenes Fenster, und das ist auf einer geteilten
Instanz teuer. Gemessen: `app.workspace.changeLayout(app.workspace.getLayout())` stellt die
nicht-aktiven Tabs so wieder her wie ein Neustart, nämlich als `DeferredView`s (3 von 4 Leaves in
der Vorab-Diagnose, 6 im Lauf). Der Punkt liest den Block danach, **ohne einen Tab anzufassen** —
ein Klick würde den DeferredView laden und den Gegenstand zerstören.

| Lauf | Plugin-Stand | 27 | 28 | Aussage |
|---|---|---|---|---|
| 1 | `8d3cd44` (neu) | ✓ 6/6 im Block | ✓ 5 Leaves → 1 Eintrag | beide grün |
| 2 | `c48c6bc` (alt) | ✓ 6/6 | ✗ 5 im Block, 7 statt 3 Einträge | 28 fängt die Entdoppelung |
| 3 | `8d3cd44` + Mutation | ✗ 0/6, „FEHLT: 6 Pfade" | ✗ (Folgefehler) | 27 fängt den State-Zweig |
| 4 | `8d3cd44` (neu) | ✓ 6/6 | ✓ 5 → 1 | Quelle danach unverändert |

**Warum zwei getrennte Gegenproben und nicht eine:** Lauf 2 lässt den DeferredView-Zweig intakt
und trifft deshalb nur die Entdoppelung. Lauf 3 (State-Zweig aus `src/obsidian/workspace.ts`
entfernt) macht Punkt 28 als Folge mit rot — sein Beleg steht schon aus Lauf 2. Wer beide
Regeln in einem Lauf bricht, bekommt zwei rote Punkte und weiß von keinem, warum.

**Punkt 27 belegt seinen Gegenstand selbst:** entsteht binnen 15 s kein einziger DeferredView,
bricht er ab, statt grün zu melden. Ohne das wäre er grün, ohne die Sache je berührt zu haben —
dieselbe Vorsicht wie bei Punkt 19s mittlerer Messung.

⚠️ Der Handpunkt 25 bleibt stehen. `changeLayout` ist ein **Nachbau** des Neustarts; ob Obsidian
nach einem echten Kaltstart dasselbe tut, sagt nur der Kaltstart — nach einem Obsidian-Update ist
er die Probe. Hintergrund in `_docs/docs/obsidian-api-gotchas.md` (dort stand bis heute, der
Zustand sei nur per Fenster-Neuöffnen herstellbar).

## Belegter Lauf: 2026-09-04, 22:45 — move_note/delete_note (26/26)

Fünf Läufe gegen den Staging-Vault `koda-agent`, Lock `--exclusive focus`, Obsidian 1.14.0 mit
drei fremden Vault-Fenstern daneben (kein Quit — das Fenster kam per `obsidian://open?path=`
dazu). **26/26 im fünften.** Die vier davor waren je ein eigener Befund, und drei davon lagen
nicht am Produkt:

1. **Lauf 1 — echter Produktdefekt.** `renameFile` legt fehlende Zielordner **nicht** an; der
   Entwurf hatte das Gegenteil angenommen. Ein Move nach `Archiv/Tools.md` scheiterte mit
   `ENOENT … rename`. Behoben mit `ensureParents` vor dem Rename. **Die Unit-Tests konnten das
   strukturell nicht finden** — der Fake-Port ist ein `Record<string, string>`, in dem jeder
   Pfad ohne Ordner existiert.
2. **Lauf 2 — der Fix war deployt und wirkte nicht.** Identische Fehlermeldung: Obsidian hielt
   `main.js` im Speicher. Der Treiber lud das Plugin nicht neu (koda-agent stand in
   `_docs/LESSONS.md` 2026-09-03 namentlich als eines von fünf Repos ohne `disablePlugin`).
   ⚠️ **Der gefährliche Teil ist, wie das aussieht:** ein wirkungsloser Fix und ein falscher Fix
   sind an der Ausgabe nicht zu unterscheiden — man sucht am falschen Ende weiter. Behoben, der
   Reload läuft jetzt vor dem ersten Prüfpunkt.
3. **Lauf 3 — der Prüfpunkt maß die falsche Sache** (kurze vs. Pfad-Wikilinks, siehe oben).
4. **Lauf 4 — Escaping-Fehler im Treiber.** Ein `\n` in einem Renderer-Template-String wurde zum
   echten Zeilenumbruch und zerbrach den JS-String; die Meldung lautete nur „Renderer: Uncaught".

**Bilanz: von vier roten Läufen war einer ein Produktdefekt.** Das entspricht dem Muster der
früheren Runden (2026-09-02: vier rote, alle Treiber-Defekte) — mit dem Unterschied, dass diesmal
einer davon ein echter Fund war, den kein Unit-Test hätte finden können.

**Punkt 24 protokolliert `alwaysUpdateLinks: true`** — die Frage, ob `renameFile` auch bei
abgeschalteter Einstellung nachzieht, ist damit **weiterhin offen**; gemessen ist nur der
eingeschaltete Fall. Der Punkt behauptet das nicht, er schreibt den gemessenen Wert hin.

## Belegter Lauf: 2026-09-02, 17:00 — nach der Fix-Welle des Gesamt-Reviews (23/23) + Handpunkt 25

Treiber `d23661d`, Plugin-Build aus `feat/arbeitskontext` (`d23661d`), Obsidian 1.13.7, Staging-Vault
`koda-agent` frisch aus dem Fixture, Lock `--exclusive focus`. **23/23**, Fixture-Notiz danach
byte-identisch. Zusätzlich **Handpunkt 25 gemessen**, weil der Gesamt-Review die Tab-Liste als
vermutlich falsch flaggte und die Messung es bestätigte: vor dem Fix meldete `currentContext()` nach
dem Neuöffnen des Vault-Fensters mit vier restaurierten, nicht angefassten Tabs „Offene Tabs (4)"
mit **viermal derselben Datei** — der eine geladene Tab plus die Seitenleisten-Ansichten Backlinks,
Ausgehende Links und Gliederung, die `view.file` der aktiven Notiz tragen; die drei restaurierten
Tabs fehlten, weil sie `DeferredView`s ohne `view.file` sind (Obsidian ≥ 1.7.2). Nach dem Fix
(Pfad aus `view.file` **oder** `getViewState().state.file`, Seitenleisten ausgeschlossen) nennt die
Zeile genau die restaurierten Root-Tabs (9 von 9 im Messfenster, darunter Duplikate aus mehrfachem
Öffnen — Duplikate sind echte Tabs), keine Seitenleisten-Ansicht. Messrezept: vier Notizen in Tabs
öffnen, `requestSaveLayout()`, das Vault-Fenster schließen, per Pfad-URI neu öffnen, nichts anfassen,
`currentContext()` lesen — ohne Quit der Instanz, fremde Fenster unberührt.

## Belegter Lauf: 2026-09-02, Arbeitskontext Etappe 1 (23/23) + Praxistest

Treiber `cb4ea23`, Plugin-Build aus `feat/arbeitskontext` (Version noch 0.10.1, unveröffentlicht),
Obsidian 1.13.7, Staging-Vault `koda-agent` frisch aus dem Fixture, Fenster per Pfad-URI in der
laufenden Instanz, Lock `--exclusive focus`; fremde Fenster (`10_Pallas`, zeitweise
`anysource-sideloader`) unberührt. Vier Läufe bis grün — die drei roten davor waren alle
**Treiber**-Defekte, nie das Plugin:

- **Lauf 1 (21/23):** 20 und 23 rot. Ursache gemessen: `getLeaf(false)` öffnete die Notiz nach dem
  Fokus in die Sidebar in Kodas eigenem Leaf, und `app.vault.modify()` bei offenem Editor mit
  ungespeicherter Änderung erzeugt ein Merge-Artefakt (`Model steeringl`, verschobene Leerzeile);
  `editor.setValue()` kommt dagegen sauber an. Fix: Leaf im Hauptbereich, Kulisse aus dem Fixture
  per `setValue`, Rückschreibung über den Editor.
- **Lauf 2 (22/23):** 23 rot, `No tab group found` — die Kulisse hatte den letzten Root-Leaf
  detacht. Fix: einen Root-Leaf behalten.
- **Lauf 3 (22/23):** 23 rot mit „geschrieben", weil die Kulisse die Markierung nicht selbst setzte
  und 23-B mit der auf fünf Zeichen verkleinerten Rest-Markierung aus 23-A lief. Gefunden durch
  Nachstellen mit allen Zwischenwerten; die Meldung nannte ihre Messwerte nicht — sie tut es jetzt.
- **Lauf 4 (23/23):** 20 misst `Zeile 9 von 12 · Kopfdaten · Markierung 13 Zeichen`, aktiver Leaf
  ist Koda — **die Markierung überlebt den Fokuswechsel in die Sidebar** (offene Frage der Spec E3,
  damit belegt). 21: Aus → `null`, Befehl und Dropdown ein Zustand. 22: beide Werkzeuge in der
  gesendeten Liste, abschaltbar. 23: veraltete Markierung verweigert mit Klartext, gültige
  ersetzt `13 → 14 Zeichen`, Fixture-Notiz danach byte-identisch.

**Praxistest (Handpunkt 23), `gui:ask --full`, `qwen/qwen3.8-27b`:** Frage „Worum geht es in der
Notiz, die ich gerade offen habe?" bei geöffneter `Notes/Project plan.md` im Hauptbereich,
Modus Arbeitsplatz. Bericht: `⊕ Arbeitskontext (workspace · Notes/Project plan.md · 2 Einträge ·
275 Zeichen)`, genau **ein** Werkzeugaufruf `read_note({"path":"Notes/Project plan.md"})`, kein
`search_notes`; Antwort beschreibt korrekt die Modell-Steuerung aus der Notiz. Beide `--expect`
grün — und seit dem Fix an `gui-ask` zählt der Kontextblock selbst nicht mehr als Treffer.
**Handpunkt 24** (Markierung ersetzen mit Modal) bleibt Handarbeit: das Modal braucht einen Klick,
den `gui:ask` nicht bedient; die Invariante dahinter misst Prüfpunkt 23 automatisiert.

## Baseline vor Arbeitskontext Etappe 1: 2026-09-02, 12:15 (19/19)

Treiber `7c5291a` (unverändert), Plugin-Build aus `main` = `655b250` (kein Code-Commit seit
`7c5291a`, Version 0.10.1), Obsidian 1.13.7, Staging-Vault `koda-agent` frisch aus dem Fixture
(`--setup`), Fenster über den Pfad-URI in die laufende Instanz geöffnet — zwei fremde Fenster
(`10_Pallas`, `anysource-sideloader`) blieben unberührt, Lock `--exclusive focus`. Festgehalten,
weil der Smoke in Etappe 1 selbst umgebaut wird (Prüfpunkte 20–23) und ein grüner Lauf danach
sonst nicht von „anders grün" zu unterscheiden wäre. Auffällig nichts: Prüfpunkt 3 antwortete
nach 1035 ms und 9 s später weiter, Punkt 19 maß gesperrt · gesperrt · liste:2.

## Belegter Lauf: 2026-09-02, zwei Messlücken geschlossen (19/19)

**Prüfpunkt 3 mass zu früh.** Er endete, sobald `is-ok` erschien (1035 ms) — ein Freeze, der erst
beim Zurückkommen des Netzabrufs eintritt, wäre damit unsichtbar gewesen. Er beobachtet jetzt
9 Sekunden nach und pingt danach **beide** Fenster. Der Hinweis ist eine Weitergabe aus der Session
`anysource-sideloader` (2026-09-01), die einen gleich aussehenden Freeze jagte; ⚠️ ihr Fall ist
ausdrücklich **kein zweiter Beleg** für die `setDisabled`-Hypothese (sie hat zwei Verdächtige
zugleich entfernt), er erklärt nur, warum unsere Gegenprobe vom 2026-08-07 scheitern konnte.

**Prüfpunkt 19 ist neu und misst den Kit-Vertrag `hide()` → `cache.clear()`** — seit 2026-08-28 im
Code, nie gemessen. Drei Werte statt zwei, und die mittlere ist der Grund, warum der Punkt etwas
belegt:

| | Zustand | erwartet | gemessen |
|---|---|---|---|
| A | Server tot, Tab frisch geöffnet | Picker gesperrt | `gesperrt` |
| B | Server lebt wieder, **nur** Tab-Neuaufbau | Picker weiter gesperrt (Cache hält) | `gesperrt` |
| C | Server lebt, Fenster zu und wieder auf | Liste da (`hide()` hat geräumt) | `liste:2` |

⚠️ **Der Punkt war zweimal rot, bevor er etwas belegte — beide Male, weil er am Falschen mass.**
Erst gegen `.okit-ep-status`: das Status-Icon hängt an einer eigenen Probe je Zeilen-Render und
läuft gar nicht über den Cache (B meldete `is-ok`, also „Cache hat nicht gegriffen"). Dann gegen
select-gegen-input: ein toter Endpunkt rendert kein Freitextfeld, sondern ein **gesperrtes**
Dropdown mit einer Option — an der laufenden App gemessen, nicht abgeleitet. Gerettet hat den Punkt
beide Male die Kontrollmessung B: ohne sie wäre „am Ende grün" auch dann erreicht worden, wenn nie
etwas gecacht wurde. Dieselbe Falle wie beim Beleg-Test mit erfundenem Namen (Lesson 2026-09-01),
nur andersherum — hier hat die eingebaute Gegenprobe sie gefangen.

Nebenbei mitgemessen (Task „clickReal-Klick ohne Haltedauer"): **40 Klicks ohne Haltedauer, 40 mit
150 ms — kein einziger Ausfall**, an zwei Stellen mit Rerender (Thinking-Schalter im Hauptfenster,
rotate-ccw im Einstellungsfenster). Für koda-agent ist die Schwelle also nicht messbar; der
epub-exporter-Befund überträgt sich nicht. Was das **nicht** heißt: dass es kein Rennen gibt — es
heißt, dass es in 40 Versuchen je Stelle nicht auftrat.

## Belegter Lauf: 2026-09-01, Fixture-Gegenprobe (18/18)

Der Lauf, der das Fixture belegt — und er ist eine **Gegenprobe**, kein Wiederholungslauf: der
Staging-Vault wurde vorher **gelöscht** (`rm -rf`), aus `docs/images/fixture/` neu gebaut
(`npm run smoke:gui -- --setup`) und ohne einen einzigen Handgriff an seinem Inhalt geprüft.
Das ist der Unterschied zum Lauf vom 2026-08-31 weiter unten: der lief gegen eine von Hand
gebaute Kulisse, die bei Verlust die Arbeit erneut gekostet hätte.

Drei Punkte belegen dabei, dass die Kulisse trägt, was die Prüfpunkte brauchen:

- **1c** — „4 von 5 Notizen mit Frontmatter · Beispielfelder: status, area, tags".
- **6** — `Notes/Tools.md`, aktiv vorher `Notes/Project plan.md` → nachher `Notes/Tools.md`;
  kein Kandidat musste wegen eines fremden Widgets verworfen werden, weil im Fixture-Vault
  **kein fremdes Plugin** aktiv ist.
- **18** — „Memory: true · Skills: true", 1196 Zeichen. Beides kommt aus dem Fixture
  (`Koda/Memory.md`, `Koda/Skills/tidy-up.md` mit `enabled: true`).

⚠️ **Was der Lauf NICHT zeigt:** Punkt 1b meldete „vault-retrieval nicht installiert" und blieb
grün — korrekt, denn die Kopplung ist weich. Der Fixture-Vault hat vault-rag bewusst nicht, also
misst er die Andockung auch nicht. Wer die prüfen will, braucht einen Vault mit vault-rag; die
Handpunkte 14–18 sagen das ohnehin.

Ebenfalls belegt: `--setup` schreibt **keine** `data.json`, und der Lauf kam trotzdem durch —
die Auslieferungs-Defaults reichen für alle 18 Punkte (der Endpunkt `http://127.0.0.1:1234` steht
in `DEFAULT_SETTINGS`, die toten Ports und der erreichbare Fake-Endpunkt bringt der Treiber mit).

Nebenbefund zum Öffnen: der frisch gebaute Vault war Obsidian unbekannt, und
`obsidian://open?path=<Datei>` hat ihn **ohne Neustart** registriert und als zweites Fenster
derselben Instanz geöffnet — die Instanz hing zu dem Zeitpunkt an zwei fremden Vaults.

## Belegter Lauf: 2026-08-31, Modell-Steuerung (18/18)

Gefahren gegen den **Staging-Vault `koda-agent`**, der bis dahin nicht existierte — Koda war
nur in `10_Pallas` installiert. Der Vault wurde für diesen Lauf **von Hand** angelegt (Notizen,
`Koda/Memory.md`, ein Skill). *Nachtrag 2026-09-01: das getrackte Fixture existiert seit diesem
Tag (`docs/images/fixture/`, `--setup`) — der Lauf hier ist also gegen eine Kulisse gefahren, die
so nicht mehr hergestellt wird; die Kulisse des Fixtures trägt dieselben vier Eigenschaften, die
die Punkte brauchen (zwei Notizen, Frontmatter, Memory, aktiver Skill).* Der Grund, es nicht gegen
den Arbeits-Vault zu fahren, steht in den Prüfpunkten selbst: **16 und 17 schreiben Einstellungen**
(`systemPromptOverride`, `toolsDisabled`) — im Arbeits-Vault wären das die echten.

Die drei neuen Punkte klären die drei Zweifel, mit denen sie geschrieben wurden:

- **16** findet den `rotate-ccw`-Knopf über sein `aria-label` (`geklickt: true`) — der Verdacht,
  `setTooltip()` schreibe es nicht aufs Element, war unbegründet.
- **17** misst die gesendete Liste über `currentToolNames()`: `write_note` fehlt bei
  abgeschaltetem Schalter und ist nach dem Zurückschreiben wieder da. Beide Hälften nötig — ohne
  die zweite wäre eine Liste, die es nie enthielt, ebenso grün.
- **18** rendert im **Einstellungsfenster**, nicht im Hauptfenster (1165 Zeichen, Memory und
  Skills beide vorhanden).

### Praxistest (`gui:ask`, qwen/qwen3.8-27b)

Drei Läufe, jeder belegt eine Hälfte des Features:

1. **Ausgelieferter Stand:** `search_notes` → `read_note`, Antwort mit `[[wikilinks]]`. Der
   Bericht führt den gesendeten Prompt inklusive Memory- und Skills-Block.
2. **Überschriebene Anweisung** („Benutze KEINE Werkzeuge, sage nur: Ich sehe nicht nach."):
   **kein einziger Werkzeugaufruf**, Antwort wörtlich wie angewiesen. Der Override wirkt.
3. **`read_note` abgeschaltet**, Frage nach dem Inhalt einer Notiz: das Werkzeug fehlt in der
   gesendeten Liste, und das Modell **dreht Suchschleifen bis ins Runden-Limit** (`search_notes`
   mit „a", „e", „Ziel"), statt den Mangel zu benennen.

⚠️ **Punkt 3 ist kein Defekt, sondern der Preis einer bewussten Entscheidung** — abgeschaltet
heißt „das Modell erfährt nichts davon" (Spec E3). Die Folge ist trotzdem wissenswert: wer ein
**einzelnes** lesendes Werkzeug abschaltet, bekommt keine Fehlermeldung, sondern Rundenverschleiß.
Die Warnung in den Einstellungen deckt nur den Totalfall ab („kein lesendes Werkzeug aktiv"),
nicht das Abschalten eines von vieren. Wer hier nachbessern will, hat zwei Wege: die Warnung
verfeinern, oder dem Modell das Fehlen im Prompt mitteilen — Letzteres widerspricht E3 und wäre
eine Design-Änderung, keine Reparatur.
