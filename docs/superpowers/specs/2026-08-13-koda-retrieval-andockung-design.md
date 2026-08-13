# Koda ↔ vault-rag: Retrieval-Andockung (Design)

Stand: 2026-08-13. Betrifft **zwei Repos**: `vault-rag` (stellt bereit) und
`koda-agent` (konsumiert). Die Spec liegt hier, weil Koda der Treiber ist —
so wie schon bei der Endpunkt-Umstellung (`docs/superpowers/plans/2026-08-08-vault-rag-endpunkt-umstellung.md`).

## Anlass

Im Arbeitsvault fiel auf, dass Kodas `search_notes` reine Volltextsuche ist: eine
andere Formulierung als im Text liefert keinen Treffer, ohne dass ein Fehler
sichtbar wird. Gleichzeitig pflegen beide genutzten Vaults (Pallas, Arbeit) bereits
einen semantischen Index über das `vault-retrieval`-Plugin — dieselbe Fähigkeit
existiert also schon, nur nicht dort, wo Koda sie erreichen kann.

Erfasst als TaskNote „Kodas Suche an den vault-rag-Index anbinden" im Projekt
*26-001-03 Koda Einrichtung* (Arbeitsvault).

## Vorgelagert: der Zuschnitt

Diese Arbeit setzt auf `AGENTS.md` § „Zuständigkeits-Zuschnitt" (Dach, 2026-08-13)
auf: **Fähigkeiten wandern zur Quelle, nicht zum Konsumenten.** vault-rag besitzt
Retrieval; Koda baut keins nach, sondern fragt. Daraus folgt unmittelbar, dass
Koda den Index **nicht selbst liest**, obwohl es technisch ginge (siehe
„Verworfene Wege").

## Gemessener Ausgangsbefund

Erhoben am 2026-08-13, nicht angenommen:

- Der Index ist **eine Datei im Vault**: `_vaultrag/index.bin` (Container-Format,
  int8-quantisiert). Pallas 1,9 MB, Arbeitsvault 391 KB.
- `RetrievalFacade` (`vault-rag/src/retrieval_facade.ts`) ist bereits die fertige
  Retrieval-Schnittstelle — `search`, `related`, `readNote`, `embedQuery`,
  `searchVector` — mit Ergebnistypen als Werte statt Exceptions
  (`{kind:"hits"|"no-index"|"offline"|"not-indexed"}`). Sie ist nur `private`.
- vault-rag betreibt bereits einen MCP-Server mit genau drei Tools
  (`search`/`related`/`read_note`), in beiden Vaults aktiv. Der Schnitt wurde also
  schon einmal getroffen und hat sich im Betrieb gehalten.
- vault-rag exportiert **keine** Plugin-API; nur `mcpServerRunning()` und
  `mcpServerAddress()` sind öffentlich.
- **Kodas Volltextsuche ist teurer als vermutet:** `VaultTools.search` iteriert über
  alle Markdown-Pfade und liest jede Datei einzeln. Der Abbruch greift erst bei
  gefülltem Trefferkontingent — bei wenigen oder null Treffern wird der ganze Vault
  gelesen. „Semantisch = teuer, Volltext = billig" trifft in großen Vaults nicht zu.

## Entscheidungen

### E1 — Andockung über eine kleine, versionierte Plugin-API

vault-rag exportiert `getRetrievalApi(version)`. Kein MCP-Loopback und kein
Selbstlesen des Index.

**Warum nicht MCP-Loopback:** Koda ist `isDesktopOnly: false`; ein HTTP-Server steht
auf Mobile nicht zur Verfügung. Dazu käme Token- und Portverwaltung sowie ein
zusätzlicher Fehlerfall („Server nicht gestartet") für zwei Komponenten, die im
selben Prozess laufen.

**Warum nicht selbst lesen:** Der Decoder ist obsidian-frei und wäre vendorbar, aber
der Index läge zweimal im Speicher und Kodas Kopie veraltete gegenüber vault-rags
Live-Indexer. Ein Index, eine Wahrheit.

### E2 — API-Oberfläche v1

**Diese Form ist nicht mehr Entwurf, sondern gemessener Stand.** Die vault-rag-Seite
wurde am 2026-08-13 gebaut (`vault-rag/src/plugin_api.ts` + 18 Tests, Gate 877/877
grün, dazu ein GUI-Smoke-Prüfpunkt, der die API per CDP am echten Plugin-Objekt
abfragt). Der Abschnitt beschreibt sie, statt ihr etwas vorzuschreiben — wer hier
etwas ändern will, ändert erst den Code drüben.

```ts
// Zugriff: app.plugins.plugins["vault-retrieval"]?.api — ein FELD, keine Fabrikfunktion
interface VaultRetrievalApi {
  readonly apiVersion: number;
  status(): { apiVersion: number; indexed: boolean; noteCount: number };
  search(query: string, opts?: { k?: number; minSim?: number }): Promise<ApiResult>;
  related(path: string, opts?: { k?: number; minSim?: number }): Promise<ApiResult>;
}

type ApiHit = { path: string; score: number };
type ApiResult =
  | { ok: true;  hits: ApiHit[] }
  | { ok: false; reason: "no-index" }
  | { ok: false; reason: "offline" }
  | { ok: false; reason: "not-indexed"; path: string };
```

Drei Abweichungen vom ursprünglichen Entwurf, alle zugunsten der gebauten Form
(Lesson „Bewährtem Fremdcode folgen": Abweichung ist begründungspflichtig, nicht
Übernahme):

1. **Feld `api` statt `getRetrievalApi(version)`.** Der Entwurf wollte die Version als
   Parameter, um später mehrere Fassungen parallel bedienen zu können — YAGNI. Ein
   Feld mit `apiVersion` zum Auslesen genügt, und der Konsument prüft statt zu fordern.
2. **`{ok, reason}` statt `{kind}`.** Begründung im Code: ein Fremdplugin kann die
   internen Unions nicht importieren, also muss der Diskriminator zur *Laufzeit*
   lesbar sein. `ok` ist anfassbar, `kind` wäre nur eine Zeichenkette unter anderen.
3. **`status()` kam hinzu** — synchron und netzfrei. Der Entwurf hatte dafür nichts;
   die Funktion beantwortet aber genau die Frage aus E3 („kann ich Retrieval
   überhaupt anbieten?"), ohne einen Endpunkt anzufassen.

Unverändert gültig: `readNote` bleibt draußen (Koda hat sein eigenes mit eigener
Policy), `related` ist nach außen `async` (hält einen späteren Lazy-Load offen), und
die Rückgabetypen sind eigene statt re-exportierter Facade-Typen.

Ein Detail, das Koda **nicht** umgehen kann und soll: Die API filtert `opts` auf
`k`/`minSim`. Ein durchgereichtes `exclude` erreicht den Retriever nicht — die
Ausschlussliste ist eine Nutzergrenze aus vault-rags Einstellungen, kein Tuning-
Parameter des Aufrufers. Das ist drüben getestet und bestätigt E4b.

### E3 — Koda erkennt zur Laufzeit, nicht beim Laden

Die API wird bei **jedem** Toolaufruf frisch geholt (`app.plugins.plugins["vault-retrieval"]`),
nicht beim Plugin-Start zwischengespeichert: vault-rag kann zur Laufzeit aktiviert
oder deaktiviert werden. Der Aufruf ist ein Objektzugriff, die Kosten sind
vernachlässigbar.

`TOOL_DEFS` wird von einer Konstante zu einer Funktion. `related` erscheint nur im
System-Prompt, wenn `api.status().indexed === true` — also nicht schon dann, wenn
vault-rag installiert ist, sondern erst, wenn tatsächlich ein Index existiert. Genau
dafür ist `status()` synchron und netzfrei: die Prüfung fällt beim Prompt-Bau an, wo
kein Netzaufruf vertretbar wäre. Nutzer ohne vault-rag oder ohne Index sehen kein
totes Werkzeug.

**`indexed: true` ist keine Zusage, dass `search` funktioniert.** `status()` macht
bewusst keinen Netzaufruf und kann deshalb nichts über die Erreichbarkeit des
Embedding-Endpunkts sagen (bestätigt von der vault-rag-Seite, 2026-08-13). Die beiden
Prüfungen beantworten verschiedene Fragen: `indexed` entscheidet **einmal** beim
Prompt-Bau, ob `related_notes` überhaupt angeboten wird; `{ok:false, reason:"offline"}`
kann danach **bei jedem einzelnen Aufruf** auftreten, auch mitten in einer Sitzung.
Deshalb ist E6 kein Randfall, sondern der Normalbetrieb bei schlafendem Endpunkt.
`related` ist davon nicht betroffen — es rechnet offline aus dem Index. Das ist die Umsetzung von „keine harte Kopplung" aus dem Zuschnitt: Koda
ist Store-Software und muss allein lauffähig bleiben.

**Die Prüfung passiert an zwei Stellen, und das ist Absicht.** Die Werkzeugliste steht
beim Bau des System-Prompts fest (Gesprächsstart), die API wird beim Aufruf erneut
geholt. Dazwischen kann sich der Zustand ändern: vault-rag wird mitten im Gespräch
deaktiviert, und `related` steht noch im Prompt. Der Adapter prüft deshalb **nochmals**
und antwortet dann mit einer Klartext-Meldung statt mit einem Laufzeitfehler. Dasselbe
Zwei-Stellen-Muster wie `canActivatePack` in kuro-gamification (REGISTRY, „Thinking-
Toggle-UI-Zustandslogik"): das Prädikat entscheidet die Anzeige *und* wird im Handler
noch einmal geprüft, damit ein veralteter Zustand nie durchschlägt.

### E4 — Semantik nur, wenn Volltext dünn bleibt

`search_notes` fragt zuerst Volltext. Liefert der **weniger als 3 Treffer**, wird die
semantische Suche ergänzt.

Begründung: Das ist genau der Fall, in dem Volltext versagt (andere Formulierung) —
und zugleich der Fall, in dem die Volltextsuche ohnehin schon den ganzen Vault
gelesen hat, der Roundtrip also relativ am wenigsten ins Gewicht fällt. Bei klaren
Wort-Treffern entstehen keine Zusatzkosten. Auf dem Arbeitsrechner (Ollama,
`qwen3-embedding:8b`) ist das Embedding spürbar langsam; diese Regel begrenzt, wie
oft das anfällt.

Die Schwelle 3 ist ein Startwert, kein Messergebnis. Sie steht als Konstante an
einer Stelle, damit ein späterer Praxisbefund sie ohne Suche korrigieren kann.

### E4b — Trefferzahl und Sichtbarkeit

**`k` setzt Koda selbst**, gebunden an das vorhandene `max_results` (Default 10, Cap
`SEARCH_CAP`). vault-rags eigene Voreinstellung ist deutlich höher (Pallas 18,
Arbeitsvault 20) — die ist für eine Trefferliste im Sidebar-Panel gedacht, nicht für
einen System-Prompt. `minSim` bleibt dagegen vault-rags Voreinstellung (0.3): das ist
eine Aussage über den Index, keine über die Anzeige.

**Die beiden Listen sehen nicht dasselbe.** vault-rags Facade wendet die
`exclude`-Präfixe aus den vault-rag-Einstellungen an; Kodas Volltextsuche kennt keine
Ausschlüsse. Eine Notiz in einem ausgeschlossenen Ordner kann also im Volltext-Block
auftauchen und im semantischen fehlen — ohne dass das ein Fehler wäre. Das wird nicht
angeglichen (Kodas Suche gehört Koda, vault-rags Ausschlüsse gehören vault-rag), aber
es gehört in die Beschriftung: der semantische Block nennt sich „semantisch (Index)",
damit der Unterschied benennbar ist, wenn er einmal auffällt.

### E5 — Hybrid heißt beschriften, nicht mischen

Volltext liefert Pfad + Snippet ohne Score; semantisch liefert Pfad + Score ohne
Snippet. **Die Werte sind nicht vergleichbar** — eine gemeinsame Rangfolge wäre
erfunden. Das Ergebnis hat deshalb zwei beschriftete Blöcke:

```
Volltext (wörtlich gefunden):
  Projekte/Plan.md: …Umzug der Ausleihliste…
Inhaltlich ähnlich (semantisch/Index, 0–1):
  Bereiche/IT-Asset-Management.md (0.71)
```

Das ist nicht nur ehrlicher, sondern nützlicher: ein Volltext-Treffer **belegt** ein
wörtliches Vorkommen, ein semantischer nicht. Koda kann die beiden in seiner Antwort
unterscheiden, statt beide gleich stark zu behaupten.

Ein Pfad, der in beiden Listen steht, erscheint **einmal** — im Volltext-Block, mit
angehängtem Score.

### E6 — Ausfälle werden gemeldet, nicht verschwiegen

Vier Zustände, jeder mit eigener Zeile im Werkzeug-Ergebnis:

| Zustand | Verhalten |
|---|---|
| vault-rag nicht installiert/aktiv | Volltext wie bisher, **kommentarlos** (kein Mangel für diesen Nutzer) |
| API da, kein Index | Volltext + „semantisch: kein Index vorhanden" |
| API da, Embedding-Endpunkt offline | Volltext + „semantisch: Endpunkt nicht erreichbar" |
| `related` auf nicht indexierte Notiz | „Diese Notiz ist (noch) nicht im Index" |

Grundlage ist der Betriebsbefund vom 2026-08-08: ein Ausfall, der sich nicht meldet,
kostet mehr als einer, der es tut — dort hatte ein 401 wie „nicht erreichbar"
ausgesehen. Koda soll dem Nutzer sagen können, *warum* eine Antwort dünner ausfällt.

### E7 — Schnitt

- **Pure** (`src/core/`, von `check:pure` erzwungen): Zusammenführung zweier
  Trefferlisten, Dedup, Beschriftung, Schwellenlogik aus E4, Formulierung der
  Zustandszeilen aus E6.
- **Obsidian-gebunden** (`src/obsidian/`): allein das Auffinden der API über
  `app.plugins`.
- Kodas Kopie der API-Typen ist **dupliziert, nicht importiert** — zwischen zwei
  eigenständigen Repos (PROF-OBS-09) darf kein Build-Coupling entstehen. Die Kopie
  trägt einen Herkunftsstempel nach Kit-first-Regel §1.

## Reihenfolge

1. **vault-rag**: API + Tests + Release. Ohne sie hat Koda nichts, wogegen es baut.
2. **koda-agent**: Tools, Zusammenführung, Degradation.

Kodas Seite muss ohnehin mit fehlender API umgehen — bei fremden Nutzern *und* bei
einem älteren vault-rag —, also blockiert Schritt 1 die Entwicklung nicht, wohl aber
die Abnahme.

## Nicht-Ziele

- **Kein `search_semantic` als eigenes Tool.** Die Tool-Zahl ist bei lokalen Modellen
  ein Zuverlässigkeitsfaktor (Messgrundlage: `docs/LAB.md`, `tool-calling-parcour`);
  netto kommt genau ein Werkzeug hinzu.
- **Keine Personas, keine Tool-Profile, kein Auto-Tool-Vorlauf.** Personas sind
  vault-crews (`crew-kind: agent`); ein Vorlauf-Durchgang verlegt die unzuverlässige
  Tool-Wahl nur nach vorn, wo weniger Kontext vorliegt, und kostet einen vollen
  zusätzlichen Roundtrip.
- **Kein Schreiben in den Index.** Koda liest Retrieval, es pflegt es nicht.
- **Keine TaskNotes-/Kalender-Anbindung.** Eigenes Vorhaben, andere Andockart
  (HTTP, desktop-only), eigene Spec.

## Tests

- Pure Zusammenführung: beide Listen gefüllt, je eine leer, Überschneidung (Dedup),
  Score-Formatierung, alle vier Zustände aus E6.
- Schwellenlogik E4: 0/2/3/10 Volltext-Treffer → semantisch ja/nein.
- Adapter gegen eine Fake-API: fehlende API, falsche Version, `no-index`, `offline`.
- **Gegenprobe am laufenden Obsidian** in beiden Vaults (Store-Software,
  CORE-TEST-02 b): `docs/SMOKE.md` bekommt Punkte für hybride Suche und `related`,
  darunter einen Lauf mit abgeschaltetem vault-rag.
