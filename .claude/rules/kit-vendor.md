---
paths:
  - "src/vendor/**"
  - "tools/kit-sync.json"
  - "tools/sync-kit.sh"
  - "tests/vendor/**"
  - "tests/__mocks__/**"
---

# Vendorter Kit — Gotchas

`src/vendor/kit/` (reine Module, code-kit und obsidian-kit), `src/vendor/kit-obsidian/` (Obsidian-Module) und `tests/vendor/kit/` (Obsidian-Mock) sind verbatim vendort. Werkzeug und Optionen: `tools/kit-sync/README.md` im Dach.

- **Nie von Hand editieren.** Pins stehen in `tools/kit-sync.json` (eine feste Ref je Quelle, nie der Arbeitsstand eines Nachbar-Repos), vendort wird mit `sh tools/sync-kit.sh`; maßgeblich ist `VENDOR.json` im Ordner. Ein zweiter Lauf mit denselben Refs ändert keine Datei.
- **Ein neues Kit-Modul braucht einen Eintrag in `modules`.** Fehlt eine transitive Abhängigkeit, bricht das Werkzeug vor dem Schreiben mit „Hülle“ ab und nennt die Datei; Importe zwischen den Quellen (obsidian-kit → code-kit) brauchen ein `rewrite` am Ziel.
- **Bei jeder Pin-Hebung die CHANGELOG-Einträge jedes übersprungenen Kit-Releases lesen** und je nutzersichtbare Folge eine Zeile in `[Unreleased]` schreiben; Kit-CSS-Konstanten (`*_CSS`) in `styles.css` neu kopieren (`tests/kit_css.test.ts` meldet die fehlenden).
- **Der Kit-Mock kennt `BasesView` und `NullValue` nicht;** `tests/__mocks__/obsidian.ts` trägt dafür leere Hüllen, weil `src/main.ts` die Bases-Ansicht importiert.
