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
15. Frage mit einem Begriff, der **klar wörtlich** trifft (≥3 Treffer) → **kein**
    semantischer Block, und im Chat ist kein zusätzlicher Werkzeug-Schritt zu sehen. Das
    ist der Beleg, dass die Schwelle greift und nicht jede Suche einen Embedding-Aufruf kostet.
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

## Automatisierter Teil: `npm run smoke:gui`

Sechs dieser Punkte fahren seit 2026-08-07 selbst (`scripts/gui-smoke.ts`, CDP gegen ein
laufendes Obsidian — CORE-TEST-02 b). Voraussetzung ist der eine Handgriff, der Handarbeit
bleibt:

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
erreichbar angezeigt · zwei tote Endpunkte ergeben Klartext statt Stacktrace · Wikilink in
der Antwort öffnet die Notiz.

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

**Was der Treiber bewusst nicht prüft:** alles, was eine echte Modell-Antwort braucht (die
Punkte 2, 3, 5, 6, 7, 10, 14–19 oben). Gemessen am 2026-08-07 ist `qwen/qwen3.6-27b` über einem
großen Vault **>90 s stumm**, bevor das erste Token kommt — Prüfpunkte darauf wären langsam
und nicht deterministisch. Ebenfalls Handarbeit bleibt das Bestätigungs-Modal (Punkt 5):
`VaultTools` wird in `ask()` lokal erzeugt und ist am Plugin nicht exponiert.

### Durchläufe

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
  gebaut ist. Die Handpunkte 14–19 sind in diesem Durchlauf **nicht** gelaufen und bleiben offen.

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
