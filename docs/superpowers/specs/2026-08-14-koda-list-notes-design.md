# Koda: deterministisches Listen-Werkzeug `list_notes` (Design)

Stand: 2026-08-14. Betrifft nur `koda-agent`.

## Anlass

Zwei Praxistests gegen ein laufendes Obsidian (13.08.2026, Koda 0.4.0, Arbeitsvault,
`maxRounds: 25`) haben denselben Fehler an zwei verschiedenen Skills gezeigt — und die
Gegenprobe hat gezeigt, dass er sich mit Skill-Text nicht beheben lässt:

- **`project-session-start`:** Koda nannte acht offene Projektaufgaben mit Titel und
  Wikilink, ohne **eine einzige** TaskNote geöffnet zu haben. Die acht stammten aus dem
  Fließtext des Projektlogs. Eine war längst erledigt, drei offene fehlten. Der
  Skill-Schritt „Treffer mit `read_note` öffnen und `status` prüfen" wurde übersprungen,
  das Ergebnis trotzdem im Ton einer vollständigen Liste geliefert.
- **`create-tasknote`:** formal einwandfrei angelegt, ein einziges Feld falsch — der
  `projekt`-Link zeigte auf den Ordner statt auf die Projektnotiz. Im Metadaten-Cache
  nachgemessen: null aufgelöste Links, einer tot. Da der Board-Filter
  `file.hasLink(this.file)` lautet, wäre die Aufgabe **in keinem Board erschienen**.
  Koda meldete „erfolgreich angelegt". Der Skill benennt genau diesen Fallstrick in einem
  eigenen Gegenprobe-Abschnitt.

**Die Gegenprobe ist der eigentliche Befund.** Nach dem Nachschärfen des Skills gegen alle
Punkte verschwanden die Falschangaben — aber der teure Schritt wurde nicht etwa korrekt
ausgeführt, sondern **ganz weggelassen**: statt elf TaskNotes zu lesen, nannte Koda gar
keine Aufgabenlage mehr. Drei von 25 Runden genutzt. Eine Skill-Regel kann einen Fehler
zuverlässig *unterdrücken*, ohne die gewünschte Handlung zu *erzeugen*; das Modell wählt
den billigen Ausweg. Solange „vollständige Aufgabenlage" elf Werkzeug-Aufrufe kostet,
bleibt Raten oder Weglassen attraktiver als Nachsehen.

Erfasst als TaskNotes „Deterministisches Listen-Tool für Koda ergänzen" und
„Skill-Befolgung: Verifikationsschritte und Ausgabeformat werden übersprungen"
(Arbeitsvault, Projekt *26-001-03 Koda Einrichtung*). Die Entscheidung dort lautete
Option A — Werkzeug statt Ermahnung.

## Gemessener Ausgangsbefund

Erhoben am 2026-08-14 im Code, nicht angenommen:

- Kodas Werkzeugkasten kennt **kein Listen-Werkzeug**: `search_notes` sucht wörtlich,
  `read_note` öffnet genau eine Notiz. Ein Ordnerinhalt ist nur über N Einzelaufrufe
  erreichbar.
- **Koda liest Frontmatter bisher nirgends.** `parseFrontmatter` aus dem Kit ist zwar
  vendored und in `hasIndexableText` im Einsatz, aber nur, um zu prüfen, ob ein Body
  existiert. Dieses Werkzeug ist der erste Konsument von Frontmatter-*Werten*.
- `VaultPort` bietet `listMarkdownPaths()` — die vollständige Pfadliste liegt also bereits
  billig vor (`app.vault.getMarkdownFiles()`, `src/main.ts:201`). Der Ordner-Filter ist
  reine String-Arbeit und gehört damit nach `core/`.
- `resolveNotePath` erzwingt `.md`; für einen Ordnerpfad ist sie unbrauchbar. Die
  Traversal-Regel selbst (`..` verboten, kein führendes `/`) ist wiederverwendbar.
- Der Vergleichsfall im Repo ist `skillBudgetChars`: eine Grenze, die still Verhalten
  weglässt, liegt dort bewusst als **sichtbare Einstellung** statt als Konstante
  (`src/core/settings-types.ts`).

## Entscheidungen

### E1 — Ordner + Feldauswahl, kein Filter im Werkzeug

Signatur: `list_notes(folder, recursive?, fields?)`. Das Werkzeug filtert **nicht** nach
Frontmatter-Werten; es liefert die Zeilen samt der angeforderten Felder, das Filtern
passiert im Kopf des Modells.

**Warum kein `where`-Parameter:** Das Problem ist nicht fehlende Ausdruckskraft, sondern
der Preis der Vollständigkeit — elf Aufrufe statt einem. Den senkt schon die reine Liste
auf eins. Ein Filter-Parameter kostet dagegen genau das, was bei lokalen Modellen knapp
ist: jedes zusätzliche Parameterfeld ist ein Feld, das falsch gefüllt werden kann, und ein
falsch gefüllter Filter liefert **stillschweigend zu wenig** statt eines Fehlers — dieselbe
Fehlerklasse, gegen die dieses Werkzeug antritt (Messgrundlage zur Werkzeug- und
Parameterzahl: `docs/LAB.md`). Ein `where` bleibt später nachrüstbar, ohne die Signatur zu
brechen; umgekehrt ginge es nicht.

### E2 — Frontmatter kommt aus Obsidians `metadataCache`, nicht aus N Dateilesevorgängen

Neuer Port `frontmatterOf(path): Record<string, unknown> | null`, im Adapter auf
`app.metadataCache.getFileCache(file)?.frontmatter` abgebildet.

**Warum nicht lesen + `parseFrontmatter`:** Der Weg wäre pure und ohne neue
Obsidian-Abhängigkeit, kostet aber je Aufruf einen Dateizugriff pro Notiz — bei
`20_Projekte/` rekursiv über 500. Ein Werkzeug, das den Anreiz „billig raten statt teuer
nachsehen" beseitigen soll, darf nicht selbst der teuerste Aufruf im Werkzeugkasten sein.
Dazu kommt: `parseFrontmatter` ist yaml_lite (flache Skalare, einfache Listen), der Cache
kennt das echte YAML — und Obsidians Cache ist ohnehin die Wahrheit, an der sich Bases und
Board-Filter im Vault orientieren. Wer hier anders parst, beantwortet eine andere Frage
als die, die der Nutzer im Vault sieht.

Der Cache wird **nur für die gezeigten Zeilen** befragt: gezählt wird über die Pfadliste,
geholt erst nach der Kappung (E3).

### E3 — Kappung mit Warnung in Zeile 1, Grenze als sichtbare Einstellung

Neue Einstellung `listNotesMaxRows` (Default 150, Spanne 20–1000). Wird sie überschritten,
steht die Unvollständigkeit als **erste** Zeile der Tool-Antwort — nicht als Fußnote.

**Warum oben:** Der Fehlertyp dieses Projekts ist „unvollständig, sieht vollständig aus".
Eine Kappung, die am Ende einer langen Liste vermerkt wird, reproduziert ihn. **Warum
Kappung statt Fehler:** Ein Fehler über der Grenze liefert gar nichts — und die Gegenprobe
hat gezeigt, dass Koda in dieser Lage das Weglassen wählt, nicht das Nachfassen. Eine
gekappte Liste mit lauter Warnung ist die Variante, die immer etwas Brauchbares liefert.
**Warum Einstellung statt Konstante:** dieselbe Begründung wie bei `skillBudgetChars` —
eine Grenze, die stillschweigend Verhalten weglässt, gehört sichtbar. Der Default 150
ergibt bei 40–120 Zeichen je Zeile grob 1.500–4.500 Token.

### E4 — Null Treffer ist ein Fehler, kein leeres Ergebnis — mit Vorschlägen

Liefert der Ordner keine Notiz, ist das `ok: false` mit den real existierenden Ordnern, die
gemeint sein könnten (max. 5).

**Warum:** „Ordner leer" und „Ordner falsch geschrieben" sehen für das Modell sonst
identisch aus. Genau das ist die Fehlerklasse aus dem Anlass — ein false negative ohne
sichtbaren Fehler, das anschließend als Tatsachenbehauptung weitergereicht wird. Die
Vorschläge kosten wenige Zeilen pure Logik und machen aus einer Sackgasse eine Korrektur.

Vorschlagsregel, in dieser Reihenfolge:
1. Ordner, deren letztes Segment das gesuchte letzte Segment case-insensitiv enthält (oder
   umgekehrt).
2. Ist (1) leer: die direkten Unterordner des längsten *existierenden* Präfixes des
   angefragten Pfads.
3. Ist auch (2) leer (der Vault hat gar keine passende Ebene): nur die Feststellung, ohne
   Vorschläge — geraten wird nicht.

Die Meldung behauptet dabei **nicht**, der Ordner existiere nicht: aus einer Liste von
Markdown-Pfaden ist ein leerer Ordner von einem falsch geschriebenen nicht unterscheidbar.
Sie stellt fest, dass dort keine Notiz liegt, und nennt die Alternativen.

### E5 — `recursive` Default `false`, Sortierung alphabetisch nach Pfad

Vorhersagbarkeit ist die Daseinsberechtigung dieses Werkzeugs; „deterministisch" schließt
die Reihenfolge ein. Der Anlassfall (`_Tasks/`) ist flach, und ein versehentlich rekursiver
Aufruf auf einer hohen Ebene ist der teuerste Fehlgriff, den die Signatur zulässt.

### E6 — Ohne `fields` nur Pfade

Kein erratener Default-Feldsatz. Welche Felder zählen, weiß der Vault, nicht das Plugin:
im Arbeitsvault sind es `status`/`priority`/`projekt`, in anderen Vaults andere. Ein fixer
Satz wäre in jedem zweiten Vault falsch und in keinem sichtbar falsch.

### E7 — Sechstes festes Werkzeug, mit Abgrenzung in der Beschreibung

`list_notes` kommt zu `TOOL_DEFS` hinzu (dann sechs feste plus `related_notes`, wenn
vault-rag läuft). `search_notes` bekommt einen Satz zur Abgrenzung, damit die Wahl zwischen
den beiden nicht vom Zufall abhängt.

## Schnittstelle

```
list_notes(folder: string, recursive?: boolean, fields?: string[])
```

- **`folder`** — vault-relativ; `""` bedeutet Vault-Wurzel. Führende und anhängende
  Slashes werden abgeschnitten (Modelle schreiben gern `/20_Projekte/`), `..` bleibt
  verboten, kein `.md`-Zwang.
- **`recursive`** — Default `false`.
- **`fields`** — Frontmatter-Feldnamen. Fehlt der Parameter, kommt die reine Pfadliste.

**Ausgabe.** Eine Kopfzeile mit der Zählung, dann eine Zeile je Notiz. Kein Spalten-Padding
(kostet Token ohne Nutzen), Trenner ` · `:

```
3 von 3 Notizen in "…/_Tasks"

…/_Tasks/Foo.md · status=1_backlog_📥 · priority=2_mittel_🟡
…/_Tasks/Bar.md · status=9_erledigt_✅ · priority=3_hoch_🔴
…/_Tasks/Baz.md · status=2_klaerung_❓ · priority=—
```

Gekappt:

```
⚠ UNVOLLSTÄNDIG: 512 Notizen gefunden, 150 gezeigt. Grenze den Ordner ein oder
setze recursive:false, bevor du über Vollständigkeit sprichst.

150 von 512 Notizen in "20_Projekte" (rekursiv)

…
```

**Werte-Aufbereitung** (pure, damit prüfbar): fehlend oder leer → `—`; Listen
kommagetrennt; verschachtelte Objekte → `{…}`; Zeilenumbrüche im Wert → Leerzeichen;
Werte über 120 Zeichen gekürzt mit `…`. Wikilink-Werte (`[[…|…]]`) bleiben unangetastet —
sie sind der Fall, den eine Gegenprobe im Vault prüfen können muss.

**Fehlerfälle** (alle `ok: false`): `..` im Pfad; Ordner ohne Notizen (mit Vorschlägen
nach E4). Die Texte sind deutsch — das schreibt den Bestand fort (`retrieval.ts`,
`vault-tools.ts`): Kodas Oberfläche ist DE/EN, die Tool-Rückgaben an das Modell sind es
nicht, weil sie Teil des Gesprächs mit dem Modell sind und nicht der Oberfläche.

## Aufbau

| Datei | Rolle |
|---|---|
| `src/core/tools/list.ts` *(neu, pure)* | Ordner-Filter über die Pfadliste, Zählung, Kappung, Vorschläge, Formatierung |
| `src/core/tools/path-guard.ts` | neue `resolveFolderPath` neben `resolveNotePath` (gleiche Traversal-Regel, ohne `.md`) |
| `src/obsidian/vault-tools.ts` | `case "list_notes"`, `frontmatterOf` im `VaultPort` |
| `src/main.ts` | `frontmatterOf` → `app.metadataCache` |
| `src/core/tools/defs.ts` | sechster Eintrag, Abgrenzungssatz bei `search_notes` |
| `src/core/settings-types.ts` | `listNotesMaxRows` + Spanne + Klemmung |
| `src/obsidian/settings.ts`, `src/i18n/strings.ts` | Slider und DE/EN-Texte |

Die Kappung liegt **vor** dem Frontmatter-Holen: `list.ts` liefert die gezeigten Pfade,
der Adapter holt nur für diese den Cache-Eintrag.

## Verworfene Wege

- **Filter-Operatoren im Werkzeug** (E1) — nachrüstbar, jetzt Ballast.
- **Fehler statt gekappter Liste** (E3) — lädt zum Weglassen ein, dem gemessenen
  Ausweichverhalten.
- **Frontmatter durch Lesen aller Dateien** (E2) — macht das Werkzeug am teuersten, wo es
  am nötigsten ist.
- **Weiter am Skill-Text schärfen** — die Gegenprobe hat gezeigt, dass Verbote wirken und
  Anordnungen nicht. Der Text stand bereits da, als der Prüfschritt ausblieb.

## Prüfen

- **Pure Tests** (`src/core/tools/list.ts`): Ordner-Filter flach/rekursiv, Wurzel,
  tolerantes Trimmen der Slashes, Traversal-Abwehr, Kappung samt Warnung **in Zeile 1**,
  Zählzeile, Wert-Aufbereitung (fehlend/Liste/Objekt/Umbruch/Überlänge/Wikilink),
  Vorschlagsregel in allen drei Stufen aus E4, Sortierstabilität.
- **Adapter-Test** (`vault-tools`): `list_notes` mit Fake-`VaultPort`; Invariante
  „`frontmatterOf` wird nur für gezeigte Zeilen gerufen" wird gezählt, nicht behauptet.
- **Gate** `npm run gate` grün, `check:pure` hält `core/` obsidian-frei.
- **GUI-Smoke** (`scripts/gui-smoke.ts`): ein Prüfpunkt mit Gegenprobe.
- **Praxistest-Gegenprobe per CDP** im Arbeitsvault (Definition of Done): dieselbe Frage an
  `project-session-start` wie am 13.08. Messgröße ist nicht „keine Falschangabe", sondern
  **ob die echte Aufgabenlage genannt wird** — genau der Punkt, an dem die Skill-Schärfung
  scheiterte.

## Nicht in dieser Arbeit

- Umstellung der Arbeitsvault-Skills auf `list_notes` (eigene Aufgabe; Schritt 2 der
  TaskNote).
- Die Schwellenlogik der semantischen Suche (`needsSemantic`) — eigener Befund, eigene
  TaskNote.
- Sortier-Parameter, Datumsspalten, Glob-Muster.
