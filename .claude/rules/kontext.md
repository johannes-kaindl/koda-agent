---
paths:
  - "src/core/context/**"
  - "src/obsidian/context-panel.ts"
  - "src/obsidian/bases-view.ts"
  - "src/obsidian/links.ts"
  - "src/obsidian/workspace.ts"
  - "tests/context_*.test.ts"
---

# Arbeitskontext und Bases — Gotchas

Gotchas zum Arbeitskontext (Modi, Chips, Budget) und zur Bases-Ansicht. Das Warum: `docs/internal/decisions.md` § Arbeitskontext und § Bases.

- **„Gesehen“ und „expandiert“ in `collectCandidates` nie vermischen.** „Gesehen“ entscheidet, ob ein Knoten eingesammelt wird; „expandiert“, ob er je Startpunkt der nächsten Ebene war. Füllt man „gesehen“ mit den manuellen Pfaden vor der Breitensuche, verschwindet bei `A→B→C` und Tiefe 2 die Notiz `C`, sobald `B` von Hand hinzukommt. Bei Tiefe 1 (Default) ist die Wirkung null, deshalb fing es kein Test: einen Test mit Tiefe 2 mitfahren. Beleg: 2026-09-06, Abschluss-Review der Etappe 2b.
- **Der Schlüssel eines Chips ist der Schlüssel seines Kandidaten, nicht seiner Platzierung.** Ein Pfad erscheint genau einmal; Abwahl-Zustand und Größe werden mit dem Schlüssel gelesen, der tatsächlich entstand (`active`/`link`/`backlink`/`tab`/`manual`/`base`). Schlüsselt man nach Platzierung, reißt die Verbindung zwischen Schalter und Wirkung. Das × eines manuellen Eintrags und das einer Base **entfernt** ihn, statt ihn abzuwählen.
- **Abgewählt wird der Snapshot vor dem Rendern.** Es gibt genau eine Filterung (in `buildFullContext`); die Chip-Liste leitet keine zweite ab, sonst reißt der Riss, den die Etappe 2a gefunden hat.
- **Das Budget wird per Wasserfüllung verteilt** (`allocateBudget`), nicht gleichverteilt; Tabellen aus Bases zieht `buildFullContext` zuerst vom Budget ab. Der Overhead je Eintrag (Überschrift, Trenner, Kürzungs-Meldung) gehört in die Rechnung, sonst überschreitet der Block die Einstellung um ein Vielfaches.
- **Die aktive Notiz kommt über `getMostRecentLeaf()`**, nicht über `activeEditor` (aus der Seitenleiste heraus leer). Restaurierte, nicht besuchte Tabs sind `DeferredView`s ohne `view.file`; der Pfad steht in `getViewState().state.file`. Seitenleisten-Ansichten (Backlinks, Gliederung) tragen das `view.file` der aktiven Notiz und sind keine Tabs. Beleg: Etappe 1, Handpunkt 25.
- **Im Kontext-Tab ist der Chat `display:none`.** Ohne das schob er das Panel aus dem Bild (vor 0.16.0); der GUI-Smoke misst es.
- **Bases-Ansicht: Daten nur an eine registrierte Ansicht, und nur Schnappschüsse behalten.** `data` und jede `BasesEntry` werden bei jedem Update ersetzt, Pfade und Zeichenketten also beim Übernehmen kopieren. Ein fehlender Wert ist ein `NullValue` (`instanceof` prüfen; sein `toString()` ist „null“, eine unbekannte Formel liefert echtes `null`). Der Default der Übergabeform steht im Lesecode (`normalizeForm`), nicht in der Deklaration. Eine eingebettete Base bekommt keine Daten.
- **Die Bases-Ansicht ist die Schicht des Hosts:** kein Unit-Test sieht sie (der Kit-Mock hat nur leere Hüllen für `BasesView` und `NullValue`), die Prüfpunkte 86–88 des GUI-Smokes belegen sie. `src/obsidian/bases-view.ts` bleibt außerhalb von `src/core/`.
- **Koda schreibt nie in eine `.base` des Nutzers.** Eine Arbeit, deren Ansicht fehlt oder nicht vom Typ `koda-context` ist, bekommt einen Hinweis im Tab statt eines geöffneten Tabs.
