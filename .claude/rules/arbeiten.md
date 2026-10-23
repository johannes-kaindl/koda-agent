---
paths:
  - "src/core/abilities/**"
  - "src/obsidian/arbeiten.ts"
  - "src/obsidian/skill-defaults.ts"
  - "src/main.ts"
  - "tests/abilities_*.test.ts"
---

# Fähigkeiten, Arbeiten und Sitzungszustand — Gotchas

Gotchas zu Arbeiten (Notizen unter `<Koda-Ordner>/Arbeiten/`), Overlay und Sitzungszustand. Das Warum: `docs/internal/decisions.md` § Fähigkeiten und Arbeiten.

- **Der Sitzungszustand ist ein Objekt (`plugin.session`).** `contextMode`, `contextManual` und `contextBases` sind Zugriffsmethoden darauf, kein eigenes Feld; wer ein Feld daneben stellt, hat zwei Wahrheiten, und die Marke im JSONL kennt nur die eine. `contextOff` (Abwahl je Nachricht) liegt bewusst außerhalb.
- **Eine Marke aus der Zeit vor einem Feld bleibt gültig** (`isSessionState`: `bases` fehlt oder ist eine Liste). Ein kaputter Zustand kostet die Marke, nie das Gespräch. „Neues Gespräch“ räumt die Schnappschüsse ab und wendet eine gewählte Arbeit frisch an.
- **Das Overlay speichert nur Abweichungen:** ein Eintrag, der dem Wert ohne Overlay gleicht, verschwindet (die Setter in `resolve.ts`); die Zahl der Einträge ist die Zahl der Änderungen. Die Regler „Tiefe“ und „Nachbarn“ schreiben ins Overlay, nicht in die Einstellungen.
- **Eine fehlerhafte Arbeit gilt trotzdem:** unbekannte oder ungültige Einträge werden übersprungen und im Tab genannt (nie still verworfen); ein Schlüssel ohne Umlaut (`uebrige-skills`) wird mit der richtigen Schreibweise benannt. Der Text unter dem Frontmatter geht nie ans Modell.
- **Eine Arbeit mit `base:` schließt den Tab, den Koda beim letzten Mal selbst geöffnet hat, und öffnet frisch** (`openArbeitBase` in `main.ts`): ein schon offener Tab schickt kein `onDataUpdated`, die Übernahme bliebe aus. Ein Tab des Nutzers wird nie angefasst. Geprüft wird vor dem Öffnen: Verweis, Datei, Ansichtstyp `koda-context`; übernommen wird nur bei passendem Pfad UND Ansichtsnamen.
- **Das Schreiben in `Arbeiten/` fragt, wenn Koda schreibt, nicht wenn der Nutzer im Tab „Speichern“ drückt** (`writePolicy`).
