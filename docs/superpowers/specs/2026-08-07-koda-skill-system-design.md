# Design: Markdown-Skill-System (Stufe 2, Baustein A)

Stand: 2026-08-07. Brainstorming-Ergebnis zu `docs/NEXT-SESSION.md` § „Baustein A".
Voraussetzung gelesen: MVP-Spec `2026-08-05-koda-agent-mvp-design.md`, dort ist Stufe 2
bewusst nicht ausdesignt.

## Warum

Koda soll lernen, ohne Fine-Tuning und ohne selbstmodifizierenden Code: er liest Markdown,
das sein Verhalten steuert. `Koda/Memory.md` ist die flache MVP-Stufe davon (Lernpunkte als
Bullet-Liste). Skills sind die strukturierte Form — benannte, ein-/ausschaltbare
Verhaltensanweisungen.

Der Ausgangsbefund, gegen den Code gemessen (2026-08-07): `src/` enthält **keinen** Treffer
auf `skill` (ohne `vendor/`). Die MVP-Spec sagt „Loader ist eine leere Andockstelle" — die
Andockstelle existiert nicht. Der Schnitt ist damit frei wählbar statt vorgegeben.

## Entschiedene Fragen

| Frage | Entscheidung | Grund |
|---|---|---|
| Wer schreibt Skills? | Nutzer zuerst, Selbst-Autorschaft als zweite Stufe **auf demselben Format** | Das Format ist die teure Entscheidung, die Autorschaft die billige |
| Wann wird geladen? | Alle Bodies beim Gesprächsstart, gegen ein Zeichen-Budget | Eine zusätzliche Tool-Runde kostet bei lokalen Modellen real >90 s Stille vor dem ersten Token (gemessen 2026-08-07) |
| Gilt „Koda-Ordner frei" für Skills? | **Nein** — Skills sind immer bestätigungspflichtig | Der räumliche Freibrief kodiert „das ist Kodas eigener Kram". Ein Skill ist kein eigener Kram: er ändert, was das Werkzeug künftig tut |
| Eigenes Tool oder `write_note`? | Eigenes Tool `write_skill` | Das Plugin baut Frontmatter und Pfad, nicht das Modell — eine ganze Fehlerklasse fällt weg, und das Modal bekommt garantiert eine Wirkungszeile |
| Sichtbarkeit / Abschalten | Chat-Zeile beim Gesprächsstart + `enabled:`-Flag im Frontmatter | Skills wirken sonst unsichtbar im System-Prompt; ein Fehlverhalten wäre nicht zurückverfolgbar |
| Widerspruch zwischen Skills | Kein Prioritätssystem — feste Reihenfolge + Prompt-Anweisung „sag es" | Bei 2–10 handgeschriebenen Skills ist alles andere Overengineering |

## 1. Format

Ein Skill ist eine Markdown-Notiz in `<Koda-Ordner>/Skills/`, **flach** — Unterordner werden
nicht gelesen.

```markdown
---
description: Wenn nach einem Projekt gefragt wird, zuerst die Hub-Notiz lesen
enabled: true
---

Projekte liegen unter `10_Pallas/25_Coding/<name>/`. Die Hub-Notiz heißt wie der
Ordner. Lies sie, bevor du in Einzelnotizen suchst.
```

- **Name = Dateiname ohne `.md`.** Kein Frontmatter-Feld — zwei Wahrheiten über den Namen
  wären eine Fehlerquelle ohne Gegenwert.
- `description` ist **Pflicht**. Sie erfüllt zwei Zwecke: Erklärungstext im Modal
  („was künftig anders läuft") und Platzhalter, wenn das Budget den Body auslässt.
- `enabled` ist optional, Default `true`. `false` lässt den Skill unwirksam, aber lesbar.
- Geparst mit `parseFrontmatter` aus `obsidian-kit/pure/frontmatter.ts` (dasselbe Modul
  liefert `serializeFrontmatter` für § 4). **Kit-first:** das Modul existiert im Kit, ist in
  koda-agent noch nicht vendored → eine Zeile in `tools/sync-kit.sh` (Modul-Liste), kein Neubau.

### Fehlerbehandlung

Kaputtes Frontmatter oder fehlende `description` → der Skill wird **übersprungen und im Chat
gemeldet**, nicht still verworfen. Stille Fehlfunktion ist im Repo eine bekannte Fehlerklasse
(Lesson „Eine Anzeige, die einen Laufzeit-Zustand behauptet, ist ein Schnappschuss").

## 2. Loader — `src/core/skills/` (pure)

Obsidian-frei wie der Rest von `src/core/` (`check:pure` erzwingt es).

```ts
export interface Skill { name: string; description: string; enabled: boolean; body: string }

export type ParseResult =
  | { ok: true; skill: Skill }
  | { ok: false; name: string; reason: "frontmatter" | "no-description" };

export function parseSkill(name: string, raw: string): ParseResult;

export interface Selection {
  loaded: Skill[];            // voller Body im Prompt
  descriptionOnly: Skill[];   // Budget erschöpft — nur die description
  disabled: string[];         // enabled: false
}
export function selectSkills(skills: Skill[], budgetChars: number): Selection;
```

**Budget-Mechanik: greedy, nach Dateiname sortiert.** Wer noch ins Budget passt, kommt voll
hinein; der Rest nur mit `description`. Kein Alles-oder-nichts — sonst degradiert ein einziger
fetter Skill alle anderen mit. Die Sortierung nach Dateiname ist willkürlich, aber
**vorhersagbar und stabil**, und das ist die Eigenschaft, die zählt: dieselben Dateien
ergeben immer dieselbe Auswahl.

Gezählt wird der **Body**; `description` und Überschrift zählen nicht mit — sie stehen ohnehin
für jeden Skill im Prompt, auch für die ausgelassenen. Deaktivierte Skills (`enabled: false`)
gehen gar nicht erst in die Auswahl ein und erscheinen **nirgends** im Prompt; sie stehen nur
in `Selection.disabled` und damit allenfalls in einer Meldung.

Gezählt werden Zeichen, nicht Token — im Plugin gibt es keinen Tokenizer, und eine Schätzung,
die so tut als wäre sie exakt, wäre schlechter als eine ehrliche Zeichenzahl.

### Budget als Einstellung

`KodaSettings` bekommt `skillBudgetChars`. Default 6000, Spanne 1000–20000, Step 500, geklemmt
über `clampInt` — dasselbe Muster wie `timeoutSec` (Konstanten `SKILL_BUDGET_MIN/MAX/STEP` in
`settings-types.ts` als einzige Quelle für Merge und Slider). Der Wert steht **bewusst** in den
Einstellungen statt als Code-Konstante: die Grenze wird dadurch sichtbar statt versteckt, und
die Beschreibungszeile im Settings-Tab ist der Ort, an dem die Mechanik erklärt wird.

## 3. Vertrauensgrenze — `writePolicy` bekommt eine zweite Achse

```
Koda/Entwürfe/x.md   → free
Koda/Memory.md       → free
Koda/Skills/x.md     → confirm   ← neu
Koda/Skillset.md     → free      ← segment-genau, wie schon heute
Projekte/y.md        → confirm
```

Die Grenze sitzt **in der Policy, nicht im Tool**. Das ist der tragende Punkt: läge sie im
`write_skill`-Tool, wäre sie über ein gewöhnliches `write_note` nach `Koda/Skills/…`
umgehbar. Der Vergleich bleibt case-insensitiv und segment-genau (bestehende Eigenschaft der
Funktion, die dadurch nicht verlorengehen darf).

## 4. `write_skill` und das Bestätigungs-Modal

```
write_skill(name, description, body, mode)   mode: "create" | "replace"
```

- **Kein `append`.** An Verhaltensanweisungen anzuhängen produziert Widerspruchsmengen statt
  Skills. Wer ändern will, ersetzt.
- Den Pfad baut das **Plugin**: `<kodaFolder>/Skills/<sanitized(name)>.md`. Das Modell wählt
  keinen Pfad → kein Traversal, keine `.md`-Vergesslichkeit, keine Ordner-Verirrung.
  Sanitizing entfernt `/ \ : * ? " < > |` und Steuerzeichen; ein danach leerer Name ist ein
  Tool-Fehler mit Klartext-Meldung.
- Das Frontmatter baut ebenfalls das Plugin (`serializeFrontmatter` aus dem Kit) — dadurch ist
  es strukturell nie kaputt, wenn Koda schreibt.
- Ergebnis läuft durch dieselbe `write`-Strecke wie `write_note` und damit durch dieselbe
  Policy (→ immer `confirm`).

### Modal

`WriteRequest` bekommt ein optionales Feld `effect?: string`. Ist es gesetzt, zeichnet
`confirm-write.ts` es als hervorgehobene Zeile **über** der Vorschau; darunter steht
unverändert der volle Dateiinhalt (`create`) bzw. der Zeilen-Diff (`replace`).

> **Die Invariante „Vorschau == geschriebener Inhalt" wird nicht angefasst.** Die
> Wirkungszeile ist additiv und ersetzt nichts. Sie ist außerdem Kodas eigene Behauptung
> über seinen Text — der vollständige Body darunter ist das, woran man sie prüft.

## 5. System-Prompt, Chat-Zeile, Widerspruch

`buildSystemPrompt` bekommt ein viertes Feld `skills: Selection`. Reihenfolge im Prompt:

```
Basis-Anweisungen
## Memory
## Skills
   [Name] description + Body        (loaded)
   [Name] description               (descriptionOnly)
```

Plus eine Zeile in den Basis-Anweisungen: *widersprechen sich zwei Anweisungen — zwei Skills,
oder ein Skill und das Memory — sag es, statt still eine zu wählen.* Kein Prioritätsfeld, keine
Auflösungsregel im Code.

**Chat-Zeile einmal pro Gespräch**, nicht pro Turn (das wäre Rauschen): `⚙ 2 Skills aktiv: …`.
„Einmal pro Gespräch" heißt: beim ersten `ask()` nach `newChat()` bzw. nach einem Plugin-Start
— technisch ein Flag, das `newChat()` zurücksetzt.
Zusätzlich und auch mitten im Gespräch erscheint eine Meldung, wenn das Budget gegriffen hat
(„N Skills nur als Beschreibung geladen — Budget erschöpft") oder ein Skill wegen kaputtem
Frontmatter übersprungen wurde. Umgesetzt über den bestehenden `lastNotice`-Mechanismus
(`main.ts`, `kind: "neutral"`), nicht über einen neuen UI-Kanal.

## Phasen

**Phase 1 — Lesen.** Format, Loader, Budget-Setting, System-Prompt-Abschnitt, Chat-Zeile,
Kit-`frontmatter` vendoren. Ergebnis ist **ohne Selbst-Autorschaft nutzbar**: Skills von Hand
in `Koda/Skills/` legen wirkt sofort.

**Phase 2 — Schreiben.** `write_skill` in `TOOL_DEFS` + `VaultTools`, Policy-Achse,
`effect`-Zeile im Modal.

Ein Abbruch nach Phase 1 hinterlässt etwas Funktionierendes — das ist der Grund für diesen
Schnitt.

## Tests (TDD, pure zuerst)

- `parseSkill`: gültig · kein Frontmatter · kaputtes YAML · fehlende `description` ·
  `enabled: false` · leerer Body
- `selectSkills`: alles unter Budget · Budget greift (greedy, Reihenfolge stabil) ·
  alle deaktiviert · leere Liste · ein einzelner Skill größer als das Budget
- `writePolicy`: `Koda/Skills/x.md` → confirm · Groß-/Kleinschreibung · `Koda/Skillset.md`
  → free (segment-genau) · Unterordner unter `Skills/` → confirm
- `skillPath`/`sanitizeName`: verbotene Zeichen · leerer Name · Name mit `.md`
- `buildSystemPrompt`: mit/ohne Skills, mit `descriptionOnly`
- `mergeKodaSettings`: `skillBudgetChars` wird geklemmt
- `VaultTools`: `write_skill` läuft durch `confirm`; Ablehnung geht als Tool-Fehler zurück;
  Frontmatter im geschriebenen Text ist wohlgeformt

## Ausdrücklich nicht in diesem Design

- **Compaction** und ihre Vorarbeiten: `isContextOverflow` (Lücke 2) und das Runden-Datenmodell
  (Lücke 3) — Baustein B.
- **Aufräum-Assistent** und Stapel-Bestätigung — Baustein C.
- Situatives Nachladen per Tool. Das Format trägt `description` von Anfang an, damit ein
  späterer Umstieg **ohne Datenmigration** geht — gebaut wird er jetzt nicht.
- Skill-Liste im Settings-Tab mit Toggles. Der Einstellungs-Tab ist der Ort, an dem am
  2026-08-06 der Renderer-Freeze saß (`ButtonComponent.setDisabled()`); dort ohne Not neuen
  Zustand aufzubauen wäre schlecht getauscht.
- Unterordner in `Koda/Skills/`.

## Leitplanken (unverändert)

- Nie Full System Access oder Terminal-Ausführung.
- `src/core/` bleibt obsidian-frei.
- `npm run gate` vor jedem Commit (aktuell 113/113).
- `textFallback: false` bleibt (Begründung `docs/LAB.md`).
