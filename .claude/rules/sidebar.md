---
paths:
  - "src/obsidian/view.ts"
  - "src/obsidian/abilities-panel.ts"
  - "src/obsidian/mode-select.ts"
  - "src/obsidian/skill-segment.ts"
  - "styles.css"
---

# Sidebar und Styles — Gotchas

Gotchas zur Sidebar-View (Hub-Tabs Chat · Kontext · Fähigkeiten) und zu `styles.css`. UI-Regeln allgemein: `UI-STANDARD.md` im Dach.

- **Aktionen per `addAction()` sind in einer Seitenleiste unsichtbar:** Obsidian blendet den View-Kopf dort aus (`app.css`), die Knöpfe stehen im DOM und sind null Pixel hoch. Aktionen brauchen eine Kopfzeile im View-Inhalt (`.koda-header`) **und** einen Befehl; ein Prüfpunkt, der Existenz zählt statt `getBoundingClientRect()` zu messen, bleibt dabei grün. Beleg: 0.10.1, 2026-09-01.
- **`.koda-log { flex: 1 }` hält die Eingabezeile nur unten, solange der Elternknoten ein Flex-Container ist.** Wer den Teilbaum umhängt (unter ein Hub-Panel, in einen Block-Container), verschiebt die Eingabezeile; der GUI-Smoke misst deshalb Geometrie (Prüfpunkt 32: `display` plus den Abstand zweier `getBoundingClientRect().bottom`). Beleg: 2026-09-05, 459,6 px zu hoch nach einem reinen Umhängen, das kein Task-Review sah.
- **Die Modellzeile (Kit `buildModelBar`) steht über dem Verlauf im Chat-Panel** (`mountChat`), ohne Denk-Steuerung (die bleibt der Kopf-Knopf, `docs/internal/decisions.md`). Ihre Verbindung ist der Adapter `core/llm/model-bar-llm.ts`; ein Wechsel schreibt in die Zeile des gesendeten Endpunkts (mit Manager `choice.model`), `saveSettings()` verwirft danach den Zwischenstand des Resolvers, darum löst `setModel` neu auf. Die Zeile folgt den Einstellungen über `syncModelBar` (Resolver-Rückruf, `saveSettings`), die Liste lädt nur bei einem anderen Endpunkt neu; `activity()` aktualisiert die Sperre. Vor jedem neuen Aufbau `bar.destroy()`.
- **Der Verlauf-Neurender (`renderLog`) braucht den Linkschutz selbst:** `renderMarkdownInto` ruft `renderMarkdownGuarded`, nur der Writer des Kits (Strom) bewacht sich selbst (`guarded: false`). Gemessen 2026-10-25: ohne das blieben `file:`-, `obsidian:`- und `app:`-Links nach dem Ende der Antwort klickbar. `onLogClick` öffnet nur Ziele, die `isSafeHref(…, { internal: true })` zulässt (`[[javascript:…]]`).
- **Kit-CSS steht verbatim in `styles.css`** (Blöcke mit Herkunftsstempel; `tests/kit_css.test.ts`). Den Block ersetzen, nicht ändern; eigene Regeln gehören daneben.
- **Der Denkblock einer fertigen Antwort ist `buildReasoningBlock` des Kits** (Klasse `koda-thinking` für Tests und Treiber), der Strom `buildStreamArea`. Der Denktext ist ein Anzeige-Feld und geht nie an den Draht.
- **Texte stehen in `src/i18n/strings.ts`, und jede geänderte Meldung zieht `docs/how-to/troubleshooting.md` mit** — dort steht jeder Text wörtlich, damit Nutzer ihn per Suche finden.
