---
paths:
  - "scripts/gui-smoke.ts"
  - "scripts/gui-ask.ts"
  - "scripts/shots.ts"
  - "docs/SMOKE.md"
  - "docs/images/**"
  - "tests/workspace_adapter.test.ts"
---

# GUI-Smoke, Praxistest und Bilder — Gotchas

Die Bauform der Treiber, die Zweitinstanz und der CDP-Lock stehen in den Dach-Regeln (`.claude/rules/gui-smoke-treiber.md`, `obsidian-instanz.md`, `cdp-lock.md`, `staging-vaults.md`); hier nur, was für koda-agent gilt.

- **Gefahren wird gegen den Staging-Vault, nie gegen den Arbeits-Vault.** `npm run smoke:gui -- --setup` stellt `$STAGING_VAULTS_DIR/koda-agent` aus `docs/images/fixture/` her und kopiert den Build hinein (vorher `npm run build`); die Punkte 16 und 17 schreiben Einstellungen, und im Arbeits-Vault liegt der Store-Build statt des Repo-Stands. Was die Kulisse mitbringen muss, steht in `docs/images/fixture/README.md` (Fixture ändern heißt diese Liste und die Punkte zusammen ändern).
- **Der Smoke prüft die Naht zum Host, bewusst ohne echte Modell-Antwort.** Modellantworten kommen aus dem Stub der Brücke (`startLlmStub`), die Werkzeugaufrufe laufen echt; `gui:ask` kennt außerdem `--expect <text>`; die einzige Messung von Kodas Verhalten ist `npm run gui:ask -- --vault <name> --ask "<Frage>" --full` (langsam, nicht deterministisch, bei Gegenproben immer mit `--full`).
- **Gegenproben laufen an einem eigenen Build** (Mutation am Code, `npm run build`, `--setup`, frischer Obsidian-Prozess, Punkt wird rot); der Smoke deployt nicht selbst, `--setup` kopiert den Stand von `main.js`. Ergebnis in `docs/SMOKE.md` „Belegter Lauf“. Die Liste `PUNKTE` ist der Nenner: ein nie aufgezeichneter Punkt zählt als „nichts gemessen“.
- **Der Adapter-Test (`tests/workspace_adapter.test.ts`) steht auf dem Kit-Mock** (`FileView`, Leaf-Baum, `makeFakeEditor`); weil Tests nach dem Code entstanden, hängt ihr Wert an der Gegenprobe (Mutation an der Quelle, genau die zuständigen Tests werden rot).
- **Ein Punkt, der einen Zustand anlegt, setzt ihn vor dem Lauf zurück** (Arbeits-Notizen, Skills, Sitzungszustand, offene Base-Tabs) und räumt danach ab; ein abgebrochener Vorlauf misst sonst seinen eigenen Rest.
- **Prüfpunkt 3 beobachtet 9 Sekunden nach dem Klick,** weil ein verzögert eintretender Freeze sonst unsichtbar bliebe; er hat nie rot geleuchtet und ist durch keine Gegenprobe belegt (geparkt, `docs/internal/decisions.md`); die Punkte 98 und 99 messen die Handpunkte 17 und 18 an der Naht gegen einen Stub der vault-rag-API (übersprungen, wenn dort schon ein Eintrag steht).
- **README-Bilder:** `npm run shots -- --port <p> --vault koda-agent` nur in einer Zweitinstanz, Oberfläche Englisch, Vertrag `docs/images/README.md`; `npm run shots:check` prüft Vertrag, Dateien und Einbettung.
- **Der Katalog der Prüfpunkte bis 48** steht als Anhang in `docs/SMOKE.md`, die Punkte seit 49 in den belegten Läufen dort und in `PUNKTE`.
