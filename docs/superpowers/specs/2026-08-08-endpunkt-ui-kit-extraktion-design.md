# Design: Endpunkt-Zeile ins Kit, Sidebar ans Ökosystem

Stand: 2026-08-08. Brainstorming-Ergebnis zu `docs/NEXT-SESSION.md` § „Neu: Endpunkt-UI an den
Ökosystem-Standard angleichen" und § „Sidebar-UI ans Ökosystem angleichen".

**Dieses Vorhaben berührt drei Repos:** `obsidian-kit` (neue Komponente), `vault-rag`
(Quelle der Extraktion, wird umgestellt), `koda-agent` (Treiber und zweiter Consumer).
Die Spec liegt in koda-agent, weil dort der Bedarf entstanden ist.

## Warum

Am 2026-08-07 „funktionierte ein Endpunkt nicht", ohne dass Koda etwas meldete. Ursache war
ein URL-Fragment im API-Schlüssel-Feld; der Server antwortete sauber mit 401. Kodas
Klassifikation war korrekt (`classifyEndpointStatus` → `unauthorized`, rotes Icon). Der Mangel
liegt davor: **Kodas Endpunkt-Zeile ist passiv.** Sie zeigt nichts, bis jemand auf „Testen"
klickt. `vault-rag` lädt beim Öffnen der Einstellungen die Modell-Liste je Zeile — dort wäre
derselbe Fehler ohne einen einzigen Klick sichtbar gewesen.

Herkunft der Abweichung ist ein dokumentierter MVP-Schnitt in `src/obsidian/settings.ts`
(„bewusst abgespeckt: kein Erreichbarkeits-Ping, keine Modell-Liste, kein Test-Button"). Der
QoL-Ausbau hat Status-Icon und Test-Knopf nachgezogen, die Modell-Liste nicht. Es ist ein halb
eingeholter Rückstand, keine Entscheidung gegen den Standard.

Der Befund, der das Vorhaben umgedreht hat: `vault-rag/src/settings.ts` enthält den Block
bereits als **parametrisierte Funktion** `buildEndpointList(opts)` (Zeilen 833–1106, 274
Zeilen) mit **zwei** Aufrufstellen (456 Chat-Endpunkte, 669 Embedding-Endpunkte). Die
Abstraktion ist damit nicht theoretisch, sondern an zwei verschiedenen realen Verwendungen
erprobt. Was zuvor für Divergenz zwischen den Plugins gehalten wurde, ist Kodas Rückstand —
kein anderer Bedarf. Die Extraktion ist deshalb ein **Umzug**, keine Neuabstraktion.

## Entschiedene Fragen

| Frage | Entscheidung | Grund |
|---|---|---|
| Was wird beim Öffnen geprüft? | **Alle** Zeilen, parallel | Genau das macht den 401-Fall ohne Klick sichtbar. Nur die erste Zeile zu prüfen ließe denselben Fehler eine Zeile tiefer unsichtbar |
| Wo sitzt das Timeout dieser Prüfung? | Im Client des Consumers, **nicht** in der Komponente | Die Komponente ruft nur `clientFor(cfg).probe()` / `.listModels()`. Koda bringt sein eigenes Timeout mit — deshalb ist „kurzer Timeout" kein Umbau der Kit-Komponente |
| Eigene Angleichung oder Kit-Extraktion? | **Extraktion**, und zwar jetzt | n=3 ist erreicht; die Quelle ist bereits parametrisiert und zweifach erprobt. Eine dritte Kopie zu bauen, um später zu extrahieren, erzeugt genau die Doppelpflege, die die Regel verhindern soll |
| Wird `vault-rag` mit umgestellt? | **Ja**, im selben Vorhaben | „Später migrieren" passiert nicht — im Dach tragen bis heute zehn Repos lokale `release.mjs`-Kopien, während fünf delegieren. Divergiert die Quelle von der Extraktion, weiß niemand mehr, welche Fassung die Wahrheit ist |
| Testen-Knopf pro Zeile? | **Entfällt ersatzlos** | Die Kit-Fassung hat Refresh je Zeile plus ein globales „Verbindung prüfen". Der Knopf, an dem der Freeze gemessen wurde, existiert danach nicht mehr |
| Thinking-Default | `suppressThinking` auf `false` | Bei einem MoE-Modell wartet man minutenlang vor einem UI, das tot aussieht. Der ausklappbare Block existiert bereits; nur die Voreinstellung dreht sich. Der Toggle bleibt |
| Warteanzeige | Eigene Anzeige ab Absenden, **unabhängig** vom Thinking | Nicht jedes Modell liefert Reasoning, und die Lücke beginnt beim Absenden, nicht beim ersten Reasoning-Token |
| Globaler Modell-Picker | **Bleibt** | Er ist das Standardmodell für Zeilen ohne Override. Zwei Felder, aber eine Wahrheit — beide bedienen sich aus derselben geladenen Liste |

## Architektur

### Die Kit-Komponente

`buildEndpointList` zieht nach `obsidian-kit/src/obsidian/endpoint-list.ts`. Das bestehende
`opts`-Interface bleibt unverändert — es trägt bereits zwei Verwendungen:

```
containerEl, label, desc, placeholder
get() / set(eps)                     // Settings-Zugriff des Consumers
active()                             // aktiver Endpunkt
clientFor(cfg) → { listModels(), probe() }
globalModel()
modelFits?(cfg)                      // nur Embedding-Listen
reconnect()
```

Drei Dinge ändern sich beim Umzug:

1. **Strings kommen von außen.** Der Block ruft heute `t()` mit vault-rags Keys; betroffen sind
   sechs Strings. Sie wandern in `opts` (ein `strings`-Objekt), weil vault-rag einsprachig ist
   und Koda DE/EN spricht. Das Kit formuliert selbst nichts.
2. **CSS-Präfix wird neutral.** `vault-rag-ep-{row,status,thirdparty,busy}` verlieren den
   Plugin-Namen; die zugehörigen Regeln wandern aus `vault-rag/styles.css` mit und werden von
   beiden Consumern übernommen.
3. **Kein Verhaltensumbau.** Der Umzug ändert die Logik nicht. Jede gewünschte Verhaltens-
   änderung an Koda entsteht dadurch, dass Koda die Komponente *benutzt* — nicht dadurch, dass
   die Komponente umgebaut wird.

### Was Koda erbt, was entfällt

Erbt: Modell-Dropdown je Zeile (mit „globales Modell" als Leerwert), Refresh je Zeile,
automatisches Laden beim Öffnen, globales „Verbindung prüfen", Statustext („aktiv" /
„erreichbar, aber Platz 2"), Drittanbieter-Warnung bei gesetztem Schlüssel, `aria-label`s an
URL-, Schlüssel- und Modellfeld, Zeilensperre während des Speicherns.

Entfällt in `koda-agent/src/obsidian/settings.ts`: `renderEndpointList`, der separate
`modelCache`/`modelGeneration`-Mechanismus des Endpunkt-Teils, der Testen-Knopf pro Zeile.

Bleibt: der globale Modell-Picker (`renderModelPicker`) samt `resolveModelChoice`, das
weiterhin pure und getestet ist.

### Sidebar (Teil D)

Unabhängig von der Extraktion, gleiches Vorhaben.

**Warteanzeige.** Die View hat die nötigen Haken bereits (`streamToken`, `streamReasoning`,
`toolStep`, `renderLog`). Eine Pending-Blase folgt einer Regel: *sichtbar, solange gearbeitet
wird und gerade kein Stream-Block läuft.*

- erscheint, wenn `ask()` startet
- verschwindet beim ersten `streamToken` / `streamReasoning`
- **erscheint erneut nach einer Tool-Runde** — dort sitzt die zweite tote Phase, weil
  `streamEl` nach Tool-Ende auf `null` geht und bis zum nächsten Token nichts passiert
- endgültig weg beim abschließenden `renderLog()`

Die Sichtbarkeitsregel ist ein kleiner Zustandsautomat und gehört als pure Funktion nach
`src/core/` (von `check:pure` erzwungen), nicht in die View.

**Thinking.** `suppressThinking`-Default auf `false` in `src/core/settings-types.ts`.

**Senden-Knopf.** Bekommt `mod-cta` — Obsidians eigene Akzentklasse statt einer eigenen Farbe,
damit er jedem Theme folgt (UI-STANDARD: nur Theme-Variablen).

## Reihenfolge

1. **obsidian-kit** — Komponente anlegen, Strings parametrisieren, CSS mitnehmen, Release.
2. **vault-rag** — beide Aufrufstellen (456, 669) auf die Kit-Komponente umstellen, eigenen
   Block entfernen, am laufenden Obsidian gegenprüfen.
3. **koda-agent** — Kit vendoren (`tools/sync-kit.sh`), `renderEndpointList` ersetzen, Strings
   DE/EN ergänzen. Danach Sidebar-Teil (D), dann Release 0.3.0.

vault-rag steht vor Koda, weil dort die zwei erprobten Aufrufstellen liegen: bricht der Umzug
etwas, zeigt es sich an der Referenz statt am Neuling.

## Tests

Pure und damit unit-testbar:

- **Sichtbarkeitsregel der Warteanzeige** — Zustandsautomat in `src/core/`.
- **`resolveModelChoice`** ist bereits pure und getestet; es bekommt nur einen zweiten Aufrufer.
- Was im Kit an purer Logik mitwandert, behält seine Tests bzw. bekommt sie dort.

Was kein Unit-Test erreicht und deshalb in `docs/SMOKE.md` gehört:

- Einstellungen öffnen bei **nicht laufendem** LM Studio — N parallele Timeouts: sieht es
  kaputt aus oder nur ehrlich rot?
- Drittanbieter-Warnung beim Schlüssel-Commit ein- und ausblenden (sie darf nicht erst beim
  nächsten Render erscheinen).
- Warteanzeige über eine echte Tool-Runde hinweg.
- vault-rag nach dem Umbau: beide Listen (Chat **und** Embedding), inklusive des
  `modelFits`-Sonderwegs.

## Risiken

1. **vault-rag ist Produktivsoftware im Store.** Dort werden 274 Zeilen durch einen Import
   ersetzt. Ein grünes Gate genügt als Nachweis nicht — es braucht die Gegenprobe am laufenden
   Obsidian. Der Embedding-Sonderweg (`modelFits`) ist die Stelle, an der ein Umzug am ehesten
   still etwas ändert.
2. **Die Auto-Prüfung ist der erste ungefragte Netzverkehr** beim Öffnen der Einstellungen. Bei
   gesetzten Drittanbieter-Schlüsseln geht damit ohne Klick eine Anfrage an den Anbieter.
   Harmlos (`/v1/models` überträgt keine Vault-Inhalte) und bei vault-rag seit Monaten so —
   gehört trotzdem benannt statt still angenommen.
3. **`sync-kit.sh` re-vendort die ganze Modul-Liste.** Nach jedem Lauf `git status --short`
   prüfen und den gesamten entstandenen Stand committen; ein Versions-Sprung gehört in einen
   eigenen `chore(vendor):`-Commit (Lesson 2026-08-08).

## Nicht in diesem Vorhaben

- System-Prompt in den Einstellungen editierbar und Tool-Steuerung (Anzeigen, Abschalten,
  `description` editieren) — eigener Zuschnitt, eigene Spec.
- `list_notes(folder)`.
- `save_memory` bestätigungspflichtig machen.

## Nachträge in Doku und Registry

- **`obsidian-api-gotchas.md` einkürzen.** Der Eintrag „`ButtonComponent.setDisabled()` aus dem
  Settings-Fenster friert den Renderer ein" ist als allgemeine Regel widerlegt: `vault-rag`
  (`settings.ts:548`) und `koda-agent` selbst (`settings.ts:359`) rufen `setDisabled` in
  Settings-Klick-Handlern folgenlos auf. Der gemessene Freeze bleibt echt, aber sein enger
  belegtes Muster ist die Kombination im selben Handler mit `setIcon`/`setTooltip` auf einem
  Span derselben Setting-Zeile. Nach diesem Vorhaben ist die Stelle ohnehin verschwunden.
- **`REGISTRY.md`**: Endpunkt-Zeilen-Editor von `Kit-Kandidat` auf „im Kit" umstellen, sobald
  Schritt 1 steht.
- **`KIT-MATRIX.md`** wird generiert und nicht von Hand editiert.
