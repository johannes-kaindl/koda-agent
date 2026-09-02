# Koda — Arbeitskontext: Modi, Kontext-Panel, Werkzeuge (Design)

**Datum:** 2026-09-02 · **Status:** ausdesignt, zur Freigabe vorgelegt
**Anlass:** Johannes' Session-Start-Auftrag vom 2026-09-02 („welche Notizen sind offen, welche ist
aktiv — damit man Fragen zum eigenen Kontext stellen kann") plus die Erweiterung derselben
Session: Kontext **je Situation** wählbar, **vor dem Senden sichtbar**, granular abwählbar.
**Umsetzung:** eine Spec, **drei Etappen** — jede für sich releasefähig (§ Etappen).
**Vorentscheidungen (Johannes, 2026-09-02):** Injektion **plus** Werkzeug (nicht nur eines
von beiden) · Standard ist Pfad/Markierung/Cursor/Tab-Liste, **kein** Notizinhalt ·
Voreinstellungen in den Einstellungen, Steuerung **im Chat** je Nachricht · Sidebar wird ein
Hub mit Tabs · die sieben „low hanging fruits" aus § E9 sind alle drin.

## Anlass

Koda beantwortet heute Fragen über den Vault, aber nicht über **das, woran der Nutzer gerade
sitzt**. Die aktive Notiz, die Markierung im Editor, die offenen Tabs — nichts davon erreicht
das Modell, es sei denn, der Nutzer tippt den Pfad ab. Für ein Werkzeug, das *neben* der Arbeit
laufen soll, ist das die größte Lücke.

Die zweite Hälfte des Anlasses ist das Kontextfenster. Koda läuft an lokalen Modellen; dort ist
das Fenster die knappe Ressource, und eine Werkzeug-Runde kostet über 90 Sekunden. Der
Praxistest im Arbeits-Vault (Projekt 26-001-03, 2026-08-13/14) hat gezeigt, **woran Koda
scheitert: nicht an dem, was es nicht kann, sondern an dem, was es überspringt.** Eine Anweisung
erzeugt die teure Handlung nicht; erst ein Werkzeug, das sie billig macht, ändert das Verhalten.
Für den Kontext heißt das: was das Modell fast immer braucht, darf keinen Werkzeug-Aufruf
kosten — und was der Mensch besser auswählt als das Modell, wählt der Mensch, **vor** dem Senden.

## Ausgangslage (gemessen 2026-09-02)

| Befund | Ort | Konsequenz |
|---|---|---|
| Kein Werkzeug kennt den Workspace; `src/` liest `app.workspace` nirgends für den Prompt | `src/core/tools/defs.ts` (7 Werkzeuge) | Arbeitsplatz-Port ist neu |
| `ChatMessage` hat Projektions-Felder (`stubbed`, `merged`), aber kein persistiertes Zusatzfeld | `src/core/agent/types.ts` | `context`-Feld ist das erste persistierte Zusatzfeld einer Nachricht |
| Die Projektion ist ein Fold über Marken; Stufe 1 stubbt nur `tool`-Nachrichten | `src/core/agent/compaction/project.ts` (`stage1Targets`, `shouldStub`) | Kontextblöcke müssen in dieselbe Regel |
| `contextUsage()` misst den **rohen** Verlauf, nicht die Projektion | `src/main.ts:175` | wird auf die Projektion umgestellt (§ E4) |
| Der Pfad-Guard erlaubt nur `.md` — auch fürs Lesen | `src/core/tools/path-guard.ts:12` | Lese-Hälfte öffnen (§ E9) |
| `activeEditor` ist aus einer Seitenleiste heraus **leer** („null if the active view has no editor") | `obsidian.d.ts` 1.13.1, Zeile 7814 | Auflösung über `getMostRecentLeaf` (REGISTRY-Gotcha) |
| Bases liefern Ergebnisse **nur an eine registrierte Ansicht**; `QueryController` ist von außen leer | `obsidian.d.ts` 1.13.1, `registerBasesView`, `BasesQueryResult`, `QueryController` | Bases-Quelle ist eine Ansicht, kein Filter-Nachbau (§ E7) |
| Die Sidebar ist ein einzelner Chat ohne Tab-Leiste | `src/obsidian/view.ts` | Hub-Umbau in Etappe 2 |

## Kit-first-Befund (gemessen 2026-09-02, **vor** dem Entwurf)

| Punkt | Bestand | Konsequenz |
|---|---|---|
| Kontext-Panel: gepinnte + automatische Kandidaten als Chips, Kreuz zum Abwählen, „+ Aktive Notiz", „+ Notiz", Trefferzahl ±, Live-Kandidaten beim Tippen (Debounce in der View, Panel timer-frei), Generationszähler gegen verspätete Embeds | `vault-rag/src/context_panel.ts` (97 Zeilen) · `context_source.ts` (`buildContext`: anteilige Kürzung aufs Budget) · `styles.css` (`.vault-rag-ctx-*`) | **Übernahme mit Herkunftsstempel** — Koda ist das 2. Exemplar (n=2, kein Kit-Extrakt). Erweitert, nicht nachgebaut |
| Hub-Tab-Leiste | `obsidian-kit@0.27.0` `src/obsidian/hub.ts` (`buildHubInto`, `HubPanel`, `HUB_CSS`) — §8 **verbindlich**, in Koda **nicht vendored** | `tools/sync-kit.sh` um `hub.ts` (+ Test) ergänzen; keine Tab-Leiste selbst bauen |
| Aufklappbare Abschnitte | `obsidian-kit@0.27.0` `src/obsidian/collapsible.ts` (`collapsibleSection`, `COLLAPSIBLE_CSS`) | nachvendoren; zweite Ebene der Offenlegung im Kontext-Tab |
| Ordner-Picker | `src/vendor/kit-obsidian/folder-suggest.ts` (vendored) | „+ Ordner" |
| Notiz-Picker | `FuzzySuggestModal` (Obsidian nativ) — vault-rag `pickNote` | „+ Notiz" |
| Aktive Notiz aus einer Sidebar heraus | REGISTRY (UI, n=2): `yijing-oracle/src/obsidian/reading-writer.ts:145` — **nicht** `getActiveViewOfType`, sondern `getMostRecentLeaf(rootSplit)` | Muster übernehmen; ohne `root`-Argument deckt es auch Pop-out-Fenster |
| Einfügen an der Cursor-Position | dieselbe Stelle (`editor.replaceRange` an `getCursor("to")`), 2. Exemplar `epub-exporter` | Muster für `edit_active_note` |
| Belegung des Fensters ohne zweite Wahrheit | `src/core/chat/context-usage.ts` + `compaction/estimate.ts` | Vorschau im Panel rechnet mit **derselben** Schätzung |
| Fremde Plugin-API konsumieren (Versions- und Formprüfung, je Aufruf frisch) | `src/obsidian/retrieval.ts` (`readRetrievalApi`) | Vault-Modus nutzt `search`/`related` dieser API |
| Ausgehende Links, Backlinks | `metadataCache.resolvedLinks` (public) — Backlinks durch Iteration über alle Quellen | Link-Port, kein Dateizugriff |
| Bausteine §8 | Empty-State (verbindlich), Listen-Zeile (zwei Grammatiken), Status-Indikator (`is-warning` + `alert-triangle` für „Budget fast voll") | anwenden |
| Externes Vorbild | LocalGPT (Obsidian-Plugin): aktuelle Notiz + verlinkte + Backlinks + RAG als Kontext | bestätigt den Modus „Notiz"; nichts zu übernehmen (Fremdcode) |

Das Panel ist damit **keine Neuentwicklung**, und der Hub auch nicht. Neu sind: die Modi als
Kandidatenquellen, die Ports, das persistierte Kontextfeld, die Verdichtungsregel für
Kontextblöcke und die Bases-Ansicht.

## E1 — Das Modell: der Modus liefert Kandidaten, das Panel wählt, die Auswahl geht mit der Nachricht

Ein **Modus** wird je Nachricht gewählt (Dropdown am Eingabefeld, Befehle) und bleibt, bis er
geändert wird; beim Laden des Plugins gilt der Default aus den Einstellungen. Er bestimmt, welche
**Kandidaten** das Panel anbietet. Jeder Kandidat ist ein Chip mit Größe und lässt sich abwählen;
manuell hinzugefügte Notizen sind in jedem Modus möglich. Was beim Senden ausgewählt ist, wird
zu einem **Kontextblock** gerendert und hängt an der Nutzer-Nachricht.

| Modus | Kandidaten | Form | Etappe |
|---|---|---|---|
| **Aus** | keine | — | 1 |
| **Arbeitsplatz** (Default) | aktive Notiz (Pfad, Kopfdaten, Cursor-Zeile), Markierung, offene Tabs | nur **Zeiger**, keine Inhalte; Markierung gekürzt | 1 |
| **Notiz** | aktive Notiz **vollständig**; ausgehende Links und Backlinks bis Tiefe *n*; ab Etappe 3 auch semantische Nachbarn (`related`) | Volltext, budgetiert | 2 (Nachbarn: 3) |
| **Alle Tabs** | alle offenen Dateien | Volltext, budgetiert | 2 |
| **Vault** | semantische Treffer zur getippten Frage (vault-rag `search`), live mit Verzögerung | Volltext, budgetiert | 3 |
| *(quer)* **Manuell** | „+ Aktive Notiz", „+ Notiz", „+ Ordner" | Volltext, budgetiert | 2 |
| *(quer)* **Base** | Zeilen einer Bases-Ansicht „Koda-Kontext" | Tabelle / Notizen / beides (§ E7) | 3 |

Zwei Regeln, die den Zuschnitt tragen:

- **Arbeitsplatz kostet nie Fenster.** Der Block ist wenige Zeilen; Inhalte holt das Modell mit
  `read_note` oder `get_workspace`. Johannes hat den Inhalt der aktiven Notiz bewusst **nicht** in
  den Standard genommen; ein Inhalts-Budget als Einstellung ist nachrüstbar, wenn der Praxistest
  zeigt, dass Koda das Lesewerkzeug zu selten ruft — gemessen, nicht vorsorglich.
- **Relevanz beurteilt das Modell, nicht Koda.** Im Vault-Modus liefert vault-rag Kandidaten, der
  Nutzer wählt ab, das Modell liest oder liest nicht. Ein Reranker wäre Retrieval und gehört nach
  Dach-AGENTS § Zuständigkeits-Zuschnitt zu vault-rag. Ohne vault-rag ist der Modus nicht
  wählbar (Dropdown-Eintrag gesperrt, Hinweis „braucht das Plugin vault-rag" — derselbe
  Wortlaut wie bei `related_notes`).

## E2 — Datenmodell: das Kontextfeld an der Nutzer-Nachricht

```ts
// src/core/context/types.ts (pure)
export type ContextMode = "off" | "workspace" | "note" | "tabs" | "vault";
export type ContextSource = "active" | "selection" | "tab" | "link" | "backlink" | "related" | "vault" | "manual" | "folder" | "base";
export type ContextKind = "pointer" | "full" | "table";

export interface ContextItem {
  source: ContextSource;
  path: string;
  kind: ContextKind;
  /** Zeichen im gerenderten Block — nach Kürzung. */
  chars: number;
  /** Zeichen vor der Kürzung; nur gesetzt, wenn gekürzt wurde. */
  fullChars?: number;
  /** Link-Ebene (1 = direkt), nur bei link/backlink. */
  depth?: number;
  /** Bases: Pfad der Base + Name der Ansicht, aus der die Zeile stammt. */
  via?: string;
}

export interface ContextAttachment {
  mode: Exclude<ContextMode, "off">;
  items: ContextItem[];
  /** Der Block, wie er gesendet wurde. Persistiert. */
  text: string;
}
```

`ChatMessage` bekommt `context?: ContextAttachment` — **nur an `user`-Nachrichten, nur wenn
der Modus nicht „Aus" ist.** Das Feld wird im JSONL persistiert, inklusive `text`.

**Warum der gerenderte Text mitgespeichert wird:** Notizen ändern sich. Ohne den Text wäre die
Frage „welche Fassung hat Koda gesehen?" später unbeantwortbar, und genau diese Frage ist der
Sinn der Transparenz. Der Preis ist Speicher im append-only-Archiv, gedeckelt durch das Budget
je Nachricht. `parseLines` prüft das Feld minimal (Objekt mit `mode`, `items`-Array, `text`-
String) und lässt eine kaputte Nachricht **ohne** Kontext durch — ein kaputtes Feld kostet das
Feld, nicht die Nachricht (Idiom aus `session.ts`).

`toWireMessages` bleibt dumm (`role` + `content`). Das Einweben passiert **in der Projektion**
(§ E4) — es gibt keinen zweiten Weg, auf dem der Block ans Modell gelangt.

## E3 — Ports und pure Kern-Module

Alles Entscheiden, Budgetieren und Rendern ist pure und getestet; Obsidian liefert nur Daten.

```ts
// src/core/context/ports.ts (pure)
export interface WorkspaceSnapshot {
  active: {
    path: string;
    /** aus dem Metadaten-Cache, ohne Dateizugriff — null ohne Frontmatter */
    frontmatter: Record<string, unknown> | null;
    selection: string;          // "" ohne Markierung
    cursorLine: number | null;  // 1-basiert; null ohne Editor (Canvas, PDF …)
    lineCount: number | null;
  } | null;
  tabs: { path: string; viewType: string }[];  // alle Fenster, Reihenfolge des Workspace
}
export interface WorkspacePort {
  snapshot(): WorkspaceSnapshot;
  /** Zeilen um den Cursor der aktiven Notiz, für get_workspace. */
  linesAround(radius: number): string[];
}
export interface LinkPort {
  outgoing(path: string): string[];
  backlinks(path: string): string[];
}
```

**Auflösung der aktiven Notiz (Obsidian-Adapter):** `getMostRecentLeaf()` **ohne** Argument —
das durchsucht laut API `rootSplit` und Pop-outs und ignoriert Seitenleisten. Ist der Leaf eine
`MarkdownView`, kommen Markierung und Cursor aus `view.editor`; ist er eine andere `FileView`
(Canvas, Base, PDF, Bild), gibt es Pfad und Typ, aber keinen Editor. Ist er Koda selbst (Koda im
Hauptbereich), ist `active` null. **Offene Frage, die der Smoke misst statt annimmt:** bleibt
`editor.getSelection()` erhalten, wenn der Fokus ins Eingabefeld wechselt? Erwartung ja
(CodeMirror hält den Selektionszustand ohne Fokus); Prüfpunkt 20 belegt es.

**Tabs:** `iterateAllLeaves` über alle Fenster; nur Leaves mit `view.file`. Der Koda-Leaf wird
ausgelassen.

**Links:** `resolvedLinks[path]` für ausgehende; Backlinks durch Iteration über alle Quellen
(bei ~1.200 Notizen im Arbeits-Vault trivial). Tiefe *n* per Breitensuche, jede Notiz nur
einmal, die aktive Notiz nie als eigener Nachbar. Unaufgelöste Links werden ignoriert.

**Module (pure, `src/core/context/`):**

| Modul | Aufgabe |
|---|---|
| `candidates.ts` | Modus + Snapshot + Links (+ Treffer) → Kandidatenliste mit Quelle und Ebene; deterministische Reihenfolge (Quelle, dann Ebene, dann Pfad) |
| `select.ts` | Auswahl = Kandidaten minus Abgewählte plus Manuelle; Budget **anteilig** wie `buildContext` in vault-rag, aber mit sichtbarer Kürzung je Eintrag (`fullChars`) — nichts verschwindet heimlich, die Kappung meldet sich im Block (Regel aus `list_notes`) |
| `render.ts` | Auswahl → Block-Text und `ContextItem[]`; Sprache aus `lang` wie in `stage2.ts` |
| `workspace-line.ts` | der Arbeitsplatz-Block: Pfad, Kopfdaten (gekappt), Markierung (gekappt mit Hinweis „vollständig über get_workspace"), Cursor „Zeile 42 von 120", Tabs (bis 12 Pfade, dann „… und 9 weitere, vollständig über get_workspace") |

Kappungen sind **Einstellungen mit Meldung** (§ E8): Markierung (`contextSelectionChars`,
Default 600), Tab-Pfade (`contextTabsMax`, Default 12), Kopfdaten (`contextFrontmatterChars`,
Default 300; 0 = keine Kopfdaten). Ein erster Entwurf führte sie als Konstanten, weil eine
Grenze, die sich selbst benennt, nichts still weglässt. Johannes hat das am 2026-09-02
umgedreht: **jeder Wert, der Kodas Arbeit beeinflusst, ist einstellbar, sofern nichts dagegen
spricht** — Transparenz, und die Möglichkeit, Koda auf ein bestimmtes lokales Modell
einzustellen. Die Meldung im Block bleibt unabhängig vom eingestellten Wert.

**Gerenderter Block (Arbeitsplatz, Deutsch):**

```
[Arbeitskontext · Arbeitsplatz]
Aktive Notiz: 20_Projekte/26-009 Plugin Readiness/26-009-01 Koda Training.md · Zeile 12 von 41
Kopfdaten: type: 🗂️ Projekt · status: 1_aktiv_🚀 · tags: projekt, koda-training
Markierung (312 Zeichen): „Koda soll in der Lage sein, komplexere administrative …"
Offene Tabs (7): 00_Inbox/_Stream.md · _Koda/Skills/inbox-ingest.md · …
Inhalte auf Anfrage: read_note(<pfad>) · get_workspace() für Cursor-Umgebung und alle Tabs.
```

Volltext-Blöcke (Notiz, Tabs, Vault, Manuell, Base) folgen der vault-rag-Form `## <pfad>` +
Inhalt, mit einer Kopfzeile je Eintrag, die Quelle und Kürzung nennt.

## E4 — Projektion und Verdichtung

Die Projektion (`projectForModel`) hält je Slot weiter die **Originalnachricht**; der Block wird
**erst beim Rendern** der Projektion vor den Nutzertext gesetzt:

```
<Kontextblock>

<Nutzertext>
```

Damit sieht Stufe 2 (`applyStage2`) unverändert nur den Nutzertext — Kontextblöcke fallen beim
Zusammenfassen weg, das ist ihre natürliche Verdichtung. **Nutzertext bleibt unantastbar.**

**Stufe 1** behandelt Kontextblöcke wie Tool-Ergebnisse: `stage1Targets` zählt `tool`-
Nachrichten **und** `user`-Nachrichten mit `context` in einer Reihe; die K jüngsten bleiben
wörtlich, ältere Blöcke über `STUB_MIN_CHARS` werden zum Stub

```
[Arbeitskontext · Notiz — 3 Einträge, 12,4 KB, verdichtet; bei Bedarf über read_note erneut lesen]
```

Der Slot trägt dafür ein Flag `contextStubbed`; `formatStub` bekommt eine Kontext-Variante.
Marke (`planStage1`) und Projektion (`applyStage1`) nutzen wie bisher **dieselbe** Zählung, die
Marke im Chat sagt „n Tool-Ergebnisse und m Kontextblöcke gekürzt". Arbeitsplatz-Blöcke liegen
fast immer unter `STUB_MIN_CHARS` und bleiben — richtig so, sie sind Zeiger.

**Belegung:** `contextUsage()` in `main.ts` misst künftig `projectForModel(chatLog)` statt des
rohen Verlaufs. Das ist eine Korrektur am Bestand (die Statuszeile zählte bisher gestubbte
Tool-Ergebnisse in voller Länge) und zugleich nötig, weil `toWireMessages` den Block nicht kennt.
Die **Vorschau** im Panel rechnet: Belegung des Verlaufs + Tool-Definitionen + geplanter Block,
mit `estimateTokens` — dieselbe Schätzung, dieselbe Schwelle, gleiche Färbung (`is-warning` ab
`compactAtPercent`).

## E5 — Werkzeuge

Zwei neue Werkzeuge und eine Erweiterung, alle in `TOOL_DEFS`, damit einzeln abschaltbar und
umbeschreibbar (Spec Modell-Steuerung E3/E4):

| Werkzeug | Parameter | Liefert / tut |
|---|---|---|
| `get_workspace` | `around_cursor?: integer` (Default 20) | aktive Notiz mit Kopfdaten, Markierung **vollständig**, Cursor-Umgebung ±n Zeilen, **alle** Tabs mit Typ. Dieselbe Quelle wie der Block (`WorkspacePort`) — kein zweiter Weg |
| `edit_active_note` | `path`, `mode: "replace_selection" \| "insert_at_cursor"`, `text` | schreibt in die aktive Notiz — **nach Bestätigung** über das vorhandene Diff-Modal (`oldText` = Markierung, `newText` = Ersatz). `path` ist Pflicht und muss zur aktiven Notiz passen, sonst Fehler „aktive Notiz ist inzwischen …" |
| *(Etappe 2)* `read_note` | unverändert | liest zusätzlich `.base` und `.canvas` (§ E9) |

**Invariante für `edit_active_note` — „Vorschau gleich geschriebener Inhalt":** beim Ausführen
muss `editor.getSelection()` noch exakt `oldText` sein; sonst Fehler statt Schreiben („die
Markierung hat sich seit dem Aufruf geändert"). Bei `insert_at_cursor` gilt die Prüfung für die
Datei (Pfad gleich, Editor vorhanden); die Position ist der aktuelle Cursor. Die Schreib-Policy
gilt unverändert (`writePolicy`: außerhalb des Koda-Ordners Bestätigung, Skills immer) — die
Regel sitzt in der Policy, nicht im Werkzeug.

`get_workspace` und `edit_active_note` fehlen in der gesendeten Liste, wenn kein Editor im
Hauptbereich offen ist? **Nein** — sie bleiben angeboten und melden Klartext („keine aktive
Notiz"). Grund: die Liste wird je Gespräch gebaut, nicht je Runde; ein Werkzeug, das mitten im
Gespräch verschwindet, erzeugt genau die halluzinierten Aufrufe, gegen die der Runner-Guard
existiert.

## E6 — Oberfläche

**Etappe 1 (ohne Hub):**

- **Modus-Dropdown** in der Knopfzeile unter dem Eingabefeld (`koda-buttons`), links von
  „Senden": Aus · Arbeitsplatz · Notiz · Alle Tabs · Vault. Nicht verfügbare Einträge stehen
  gesperrt mit Hinweis (Vault ohne vault-rag; Notiz/Tabs in Etappe 1 noch nicht gebaut →
  **nicht angezeigt**, nicht gesperrt: ein Eintrag, der nie geht, ist kein Versprechen).
- **Kontextzeile unter jeder Nutzer-Blase** (`koda-msg koda-notice koda-context`): „Kontext:
  Arbeitsplatz · 26-009-01 Koda Training.md · Markierung 312 Z. · 7 Tabs". Aufklappbar
  (`<details>`) mit dem vollen Block, wie die Stufe-2-Marke. Ohne `context` keine Zeile.
- **Befehle:** je Modus einer (`context-mode-off` … `context-mode-vault`) für Hotkeys, dazu
  `ask-with-selection` (Sidebar öffnen, Modus mindestens Arbeitsplatz, Eingabefeld
  fokussieren). **Editor-Kontextmenü:** Eintrag „Koda fragen" (`workspace.on("editor-menu")`),
  nur bei Markierung. Lehre aus 0.10.1: jede Aktion braucht einen Weg, der nicht an der
  Darstellung hängt.

**Etappe 2 (Hub):** `buildHubInto(root, [chat, context], defaultTab)` unter der bestehenden
Kopfzeile (`.koda-header` bleibt: Thinking, Neues Gespräch). Der Chat-Tab ist der heutige
Inhalt. Der **Kontext-Tab**:

- Kopf: derselbe Modus (ein Zustand, zwei Bedienstellen), Summenzeile „12,4 KB von 20 KB ·
  Fenster 38 %" als Status-Indikator (§8: `is-ok`/`is-warning`, Icon `gauge`/`alert-triangle`).
- Aufklappbare Abschnitte je Quelle (`collapsibleSection`, Zustand in `data.json` über
  `CollapsibleStorage`): **Arbeitsplatz** (was die Zeile enthält, je Teil abschaltbar) ·
  **Notiz** (Tiefe-Stepper 1–3, Liste nach Ebene gruppiert, Chips) · **Tabs** (Chips) ·
  **Vault** (Trefferzahl ±, Chips, ab Etappe 3) · **Manuell** („+ Aktive Notiz", „+ Notiz",
  „+ Ordner", Chips mit Pin) · **Bases** (ab Etappe 3).
- Chips: Form und CSS aus vault-rag (`is-pinned`/`is-auto` → hier `is-manual`/`is-auto`),
  Größe als Zusatz („Plan.md · 4,1 KB"), Klick auf den Namen öffnet die Notiz, Kreuz wählt ab.
  Ein leerer Abschnitt zeigt den §8-Empty-State („keine aktive Notiz").
- **Quellen-Chips unter der Antwort:** dieselben Chips, aus `context.items` der zugehörigen
  Nutzer-Nachricht gerendert, klickbar (vault-rag-Muster).
- Ob Abwahl und Hinzufügen **bleiben** oder nur für die nächste Nachricht gelten, ist eine
  Einstellung (`contextKeepChoices`, § E8). Default **bleiben**: was abgewählt ist, bleibt
  abgewählt, bis der Nutzer im Panel-Kopf „Auswahl zurücksetzen" drückt oder ein neues
  Gespräch beginnt — der weniger überraschende Zustand, und im Modus Notiz/Tabs sind die
  Kandidaten ohnehin stabil. vault-rag lebt das Gegenteil (`reset()` nach jedem Senden), weil
  dort alle Kandidaten je Frage neu kommen; das ist der andere Wert der Einstellung.

**Ohne Hub-Umbau kein Modell-Tab:** der Modell-Tab ist eine eigene Spec; Etappe 2 legt nur
das Gerüst, in das er später als drittes Panel kommt.

## E7 — Bases als Quelle: eine registrierte Ansicht, kein Filter-Nachbau

Obsidian 1.10+ gibt Bases-Ergebnisse nur an eine mit `registerBasesView` angemeldete Ansicht.
Koda registriert `koda-context` („Koda-Kontext", Icon `dog`). Die Ansicht rendert die Zeilen
schlicht (Pfad + sichtbare Eigenschaften, Gruppen als Überschriften) und trägt einen Knopf
**„Als Kontext übernehmen"**; `onDataUpdated` hält die Liste aktuell. Übernommene Zeilen
erscheinen im Kontext-Tab als Chips mit `via: "<base>.base · <ansicht>"`, gepinnt bis zur
Abwahl — auch wenn die Base wieder geschlossen wird.

**Übergabeform als Option der Ansicht** (`BasesViewRegistration.options`, Dropdown, von
Obsidian in der Base-Datei gespeichert): **Tabelle** (Default: je Zeile Pfad + sichtbare
Werte, Formeln ausgewertet, Gruppen als Überschriften — die Form, die Bases besonders macht,
und billig) · **Notizen** (Volltext je Zeile, budgetiert) · **beides**. Filter, Sortierung,
Limit und Formeln bleiben vollständig bei Obsidian.

**Vorbehalt:** die API ist gelesen, nicht gemessen. Etappe 3 beginnt mit einem Spike
(Registrierung, `data.data` lesen, `getValue(...).toString()`), bevor die Ansicht gebaut wird.
Die alte Task „Strukturierte Property-Abfrage" im Arbeits-Vault ist damit für den Kontext-Fall
beantwortet; als **Werkzeug** für das Modell bleibt sie offen (eine Base lässt sich nicht
headless abfragen).

## E8 — Einstellungen

| Feld | Typ / Spanne | Default | Zweck |
|---|---|---|---|
| `contextModeDefault` | `ContextMode` | `"workspace"` | Modus beim Laden des Plugins |
| `contextBudgetChars` | 2 000 – 200 000, Schritt 1 000 | 20 000 | Zeichen für Volltext-Einträge je Nachricht (Arbeitsplatz-Zeiger zählen nicht) |
| `contextLinkDepth` | 1 – 3 | 1 | Ebenen für Links und Backlinks |
| `contextAutoK` | 0 – 20 | 5 | Trefferzahl für Vault-Kandidaten und semantische Nachbarn |
| `contextSelectionChars` | 100 – 5 000, Schritt 100 | 600 | Kappung der Markierung in der Arbeitsplatz-Zeile |
| `contextTabsMax` | 1 – 100 | 12 | Tab-Pfade in der Arbeitsplatz-Zeile |
| `contextFrontmatterChars` | 0 – 2 000, Schritt 50 | 300 | Kopfdaten in der Zeile; 0 = keine |
| `contextKeepChoices` | boolean | `true` | Abwahl und Manuelles bleiben bis „Auswahl zurücksetzen"/neues Gespräch (`true`) oder gelten nur für die nächste Nachricht (`false`) |
| `contextSections` | `Record<string, boolean>` | `{}` | Auf/Zu-Zustand der Abschnitte (Etappe 2; kein Bedienelement, nur Persistenz) |

**Grundsatz (Johannes, 2026-09-02):** jeder Wert, der Kodas Arbeit beeinflusst, ist in den
Einstellungen änderbar, sofern kein Grund dagegen spricht. Gründe, die dagegen sprechen, sind
benannt, nicht gefühlt: Sicherheitsgrenzen (Pfad-Guard, Schreib-Policy), Werte, die aus dem
Endpunkt gemessen werden (Kontextfenster-Vorbefüllung), und Formkonstanten ohne Wirkung auf
das Modell (`STUB_MIN_CHARS`). Eine Kappung, die im Block gemeldet wird, ist trotzdem eine
Einstellung — Meldung und Einstellbarkeit schließen sich nicht aus, sie ergänzen sich.

Alle in `KodaSettings` mit `clampIntField`/`oneOf` im Schema (geschlossene Welt);
`contextSections` braucht einen eigenen `FieldCheck` (Record von Booleans). Gruppe
„Arbeitskontext" im Settings-Tab, deklarativ wie die übrigen. Der Chat überstimmt Modus und
Auswahl je Nachricht, nie die Einstellungen.

## E9 — Die sieben Mitnahmen (Johannes, 2026-09-02: „gerne alle sieben")

1. **`edit_active_note`** — Markierung ersetzen / am Cursor einfügen, Bestätigung über das
   Diff-Modal, Invariante aus § E5. *Etappe 1.*
2. **Kopfdaten der aktiven Notiz** in der Arbeitsplatz-Zeile, aus dem Cache, gekappt. *Etappe 1.*
3. **Befehle und Editor-Kontextmenü** (§ E6). *Etappe 1.*
4. **Quellen-Chips unter der Antwort.** *Etappe 2.*
5. **Lesen von `.base` und `.canvas`:** `resolveNotePath(rel, { allow: READ_EXTENSIONS })` —
   Lesen erlaubt `.md/.base/.canvas`, Schreiben bleibt `.md`. `read_note`-Beschreibung nennt es.
   *Etappe 2.*
6. **Semantische Nachbarn im Modus Notiz** über `related(path)`. *Etappe 3.*
7. **`gui:ask` weist den Kontext aus:** je Nutzer-Nachricht Modus, Einträge, Größe; mit
   `--full` der Block. Ohne das wäre der Praxistest blind. *Etappe 1.*

## Etappen

| Etappe | Inhalt | Releasefähig weil |
|---|---|---|
| **1** | Modi Aus + Arbeitsplatz · Dropdown + Befehle + Kontextmenü · `context`-Feld + Projektion + Stufe-1-Regel · Kontextzeile im Verlauf · `get_workspace`, `edit_active_note` · Kopfdaten · `contextUsage` auf Projektion · `gui:ask` · Smoke 20–23 | vollständiger Nutzen für „Frage zu dem, woran ich sitze"; keine halben Oberflächen |
| **2** | Hub (Kit nachvendoren) · Kontext-Tab mit Abschnitten und Chips · Modi Notiz (Links/Backlinks, Tiefe) + Alle Tabs · Manuell (Picker) · Budget + Vorschau · Quellen-Chips · Nicht-Markdown lesen · Smoke 24–27 | Panel steht, alle lokalen Quellen |
| **3** | Vault-Modus (Live-Kandidaten, Generationszähler) · semantische Nachbarn · Bases-Ansicht mit Übergabeform (nach Spike) · Smoke 28–30 | die zwei Quellen mit Fremd-Abhängigkeit |

Zwischen 1 und 2 wird `move_note` eingeschoben (Arbeits-Vault-Task, seit 2026-08-13 offen).

## Prüfen

**Unit (pure, TDD):** `candidates` (Reihenfolge, Tiefe, Dubletten, aktive Notiz nie Nachbar) ·
`select` (Budget anteilig, Kürzung meldet `fullChars`, Manuelles vor Automatischem) · `render`
(beide Sprachen, Kappungen mit Hinweis) · `workspace-line` (leere Markierung, kein Editor, > 12
Tabs) · `project` (Block wird eingewoben, Stufe 1 stubbt Blöcke nach K, Stufe 2 sieht nur
Nutzertext, Referenz-Identität unveränderter Nachrichten bleibt) · `session` (Feld überlebt
Roundtrip, kaputtes Feld kostet nur das Feld) · `tool_defs` (drei Werkzeuge, abschaltbar) ·
`settings_types` (Spannen, `oneOf` für den Modus) · `vault_tools` (`edit_active_note`:
Invariante, Pfad-Mismatch, Policy).

**GUI-Smoke (Staging-Vault, CDP), Etappe 1** — automatisierte Prüfpunkte im Treiber, Zählung
schließt an 19 an (die Handpunkte in `docs/SMOKE.md` sind ein eigener Nummernraum):

- **20** — Markierung im Fixture-Editor setzen, Fokus ins Eingabefeld, `plugin.currentContext()`
  lesen: enthält Pfad **und** die gesetzte Markierung. Belegt die offene Frage aus § E3.
- **21** — Modus Aus: gesendete Nutzer-Nachricht ohne `context`; Modus Arbeitsplatz: mit.
  Dropdown und Befehl `context-mode-off` schalten **denselben** Zustand (Gegenprobe: Befehl
  setzt, Dropdown zeigt).
- **22** — `get_workspace` und `edit_active_note` stehen in `currentToolNames()`; abgeschaltet
  fehlen sie (Muster Prüfpunkt 17).
- **23** — `edit_active_note` mit veralteter Markierung: Fehler-Outcome, Datei unverändert
  (Invariante). Gegenprobe mit gültiger Markierung und Bestätigung: Text ersetzt.

Etappe 2: Hub-Tabs sichtbar und umschaltbar (Größe messen, nicht Existenz — Lehre 0.10.1) ·
Chip abwählen ändert den Block · Budget-Kappung meldet sich im Block · `read_note` liest eine
`.base` aus dem Fixture. Etappe 3: Vault-Kandidaten erscheinen mit Fake-Retrieval-API ·
Bases-Ansicht liefert Zeilen (nach Spike).

**Praxistest (`gui:ask --full`):** „Worum geht es in der Notiz, die ich gerade offen habe?" →
Koda ruft `read_note` auf den Pfad aus dem Block, nicht `search_notes`. „Verbessere den
markierten Satz" → `edit_active_note` mit Modal. Beides gegen ein echtes Modell, nicht
deterministisch, aber die einzige Messung des Verhaltens.

**Baseline:** vor Etappe 1 ein Lauf des heutigen Smokes (19/19) festhalten — der Smoke ist
selbst Gegenstand des Umbaus (Lesson 2026-08-18).

## Nicht im Umfang

Modell-Tab (eigene Spec, nutzt das Hub-Gerüst) · Graph-Ansicht der Link-Nachbarschaft (Obsidian
stellt den Graphen nicht als Baustein bereit; Liste gibt dieselbe Steuerung) · Ablegen per Maus
aus dem Datei-Explorer (kein öffentlicher Drag-Vertrag in der API — Spike, wenn gewünscht) ·
MCP/Websuche (Stufe 3 der MVP-Spec, eigenes Teilprojekt; Warnung dort: Abfluss von
Notizinhalten in Argumente, Bestätigung muss die gesendeten Daten zeigen) · Kontext-Profile
zum Speichern (erst bei gemessener Wiederholung) · Schreiben von Nicht-Markdown-Dateien ·
Inhalts-Budget für die aktive Notiz im Arbeitsplatz-Modus (nachrüstbar, s. E1).

## Offene Punkte

- **Bases-Spike** zu Beginn von Etappe 3 (§ E7). Ergebnis in `docs/LAB.md`.
- **Prompt-Cache:** der Block ändert den letzten Nutzer-Turn je Nachricht; der Präfix davor
  bleibt stabil. Ob LM Studio den Präfix-Cache dabei hält, ist eine Messung, kein Designpunkt.
- **Selektion nach Fokuswechsel** — Prüfpunkt 20 (§ Prüfen). Fällt er rot, wird die Markierung
  beim `focus` des Eingabefelds gesichert (Snapshot beim Fokuswechsel statt beim Senden).
- **Zeiger im Arbeits-Vault:** die Tasks „Auto-Compaction", „Kontextfenster-Auslastung" und
  „vault-rag-Anbindung" in 26-001-03 stehen noch offen, sind aber seit 0.7.0/0.9.0 released;
  „Strukturierte Property-Abfrage" wird durch E7 teilweise beantwortet. Aufräumen ist eine
  Vault-Aufgabe außerhalb dieses Repos — auf Johannes' Zuruf.
