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
