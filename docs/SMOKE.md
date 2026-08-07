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

Geprüft werden: Plugin aktiv · Sidebar mit Eingabefeld und Knöpfen · Klick auf „Testen“
friert den Renderer nicht ein · toter Endpunkt wird als nicht erreichbar angezeigt · zwei
tote Endpunkte ergeben Klartext statt Stacktrace · Wikilink in der Antwort öffnet die Notiz.

**Was der Treiber bewusst nicht prüft:** alles, was eine echte Modell-Antwort braucht (die
Punkte 2, 3, 5, 6, 7, 10 oben). Gemessen am 2026-08-07 ist `qwen/qwen3.6-27b` über einem
großen Vault **>90 s stumm**, bevor das erste Token kommt — Prüfpunkte darauf wären langsam
und nicht deterministisch. Ebenfalls Handarbeit bleibt das Bestätigungs-Modal (Punkt 5):
`VaultTools` wird in `ask()` lokal erzeugt und ist am Plugin nicht exponiert.

### Durchläufe

- **2026-08-07** — Obsidian 1.13.5, Vault `10_Pallas`, Plugin 0.1.0 (HEAD `b2a5682`):
  **6/6 grün**.
  Gegenprobe: Wikilink-Handler (`openLinkText`) ausgebaut → **5/6**, genau Punkt 6 rot.
  Zweite Gegenprobe am Freeze-Punkt schlug fehl: mit wieder eingebautem `setDisabled()`
  blieben alle sechs Punkte grün — der Freeze vom 2026-08-06 ließ sich nicht reproduzieren
  (frisch gestartete App, Plugin per `disablePlugin/enablePlugin` geladen; echter *und*
  synthetischer Mausklick probiert). **Prüfpunkt 3 ist damit unbewiesen** — er war noch nie
  rot. Details im Kopfkommentar von `scripts/gui-smoke.ts`.
