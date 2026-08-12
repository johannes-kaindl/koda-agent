# Kit-Extraktion: vault-rag auf die Kit-Komponente umstellen (Schritt 2 von 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** vault-rag rendert seine beiden Endpunkt-Listen (Chat und Embedding) über `obsidian-kit@0.26.0` statt über den eigenen 274-Zeilen-Block — ohne sichtbare Verhaltensänderung.

**Architecture:** Die Quelle der Extraktion wird zum Consumer. Vier Kit-Module werden vendored, der eigene Block ersatzlos gelöscht, und die drei verbliebenen Modell-Picker-Stellen (Embedding-Modell, Chat-Modell, Smart-Apply-Modell) laufen auf denselben Kit-Cache — sonst hätte der Tab zwei Modell-Listen-Wahrheiten. Alle deutschen Texte, die bisher im Block standen, ziehen in ein `strings`-Objekt am Aufrufort.

**Tech Stack:** TypeScript, esbuild, vitest, Obsidian 1.8+.

**Arbeitsverzeichnis für ALLE Tasks:** `../vault-rag`

**Voraussetzung:** `obsidian-kit@0.26.0` ist getaggt (Plan `2026-08-08-kit-endpunkt-liste.md` vollständig durch).

## Global Constraints

- **vault-rag ist Produktivsoftware im Community-Store.** Ein grünes Gate ist hier **kein** ausreichender Nachweis — Task 6 (Gegenprobe am laufenden Obsidian) ist Teil der Definition of Done, nicht optional. (Spec § Risiken, Punkt 1.)
- **Kein Verhaltensumbau.** Ziel ist, dass ein Nutzer den Unterschied nicht bemerkt. Jede Abweichung, die dir auffällt, ist ein Befund und gehört gemeldet — nicht stillschweigend „verbessert".
- **Gate:** `npm run gate` (= `typecheck` + `test` + `lint --max-warnings 0` + `build`).
- **Vendoring von Hand.** vault-rag hat kein `tools/sync-kit.sh`; die Dateien unter `src/vendor/kit/` und `src/vendor/kit-obsidian/` tragen einen Herkunfts-Header in Zeile 1. Neue Module bekommen denselben Header.
- **`src/endpoint_config.ts` bleibt, wo es ist.** vault-rags lokale Fassung ist die Quelle der Kit-Fassung und trägt zwei Extras (`chatRequestModel`, `describeEndpointRole`), die bewusst nicht mitgewandert sind. Sie durch das Kit-Modul zu ersetzen ist ein eigener Zuschnitt — hier nicht.
- **Der Embedding-Sonderweg (`modelFits`) ist die Stelle, an der ein Umzug am ehesten still etwas ändert.** Bei jedem Zweifel dort: erst prüfen, dann ändern.
- **`hide()` nicht vergessen.** `src/settings.ts:822` ruft heute `this.modelLists.clear()`, wenn der Settings-Tab schließt. Der Kit-Cache ist eine Instanz, kein Tab-Feld — löscht Task 3 das alte Feld, muss `this.modelCache.clear()` an dieselbe Stelle. Ohne das sieht jemand, der seinen LLM-Server startet und die Einstellungen erneut öffnet, dauerhaft „nicht erreichbar": der Cache hält Promises und überlebt jeden Tab-Neuaufbau. Der finale Kit-Review nennt das die wahrscheinlichste Regression des ganzen Umzugs, und kein Test schlägt dabei an.
- **Zwei Listen, zwei `strings`-Objekte.** `ariaUrl` und `ariaAdd` sind im Kit feste Strings (in der Vorlage waren sie aus `label` abgeleitet). vault-rag hat Chat- und Embedding-Liste auf **demselben** Tab. Ein gemeinsames `strings`-Objekt gäbe allen URL-Feldern beider Listen dasselbe `aria-label` — genau die Regression, gegen die diese Labels eingebaut wurden. Die Fabrik in Task 2 nimmt `label` deshalb als Parameter; ruf sie je Liste einmal.

---

### Task 1: Kit-Module vendoren

**Files:**
- Create: `src/vendor/kit/model-choice.ts`
- Create: `src/vendor/kit/model-list-cache.ts`
- Create: `src/vendor/kit-obsidian/model-picker.ts`
- Create: `src/vendor/kit-obsidian/endpoint-list.ts`
- Modify: `src/vendor/kit-obsidian/VENDOR.json`

**Interfaces:**
- Consumes: `obsidian-kit@0.26.0`.
- Produces: die vier Module unter ihren Vendor-Pfaden, mit auf vault-rag umgebogenen Import-Zeilen.

- [ ] **Step 1: Dateien kopieren und stempeln**

```bash
KIT=../obsidian-kit
cp "$KIT/src/pure/model-choice.ts"          src/vendor/kit/model-choice.ts
cp "$KIT/src/pure/model-list-cache.ts"      src/vendor/kit/model-list-cache.ts
cp "$KIT/src/obsidian/model-picker.ts"      src/vendor/kit-obsidian/model-picker.ts
cp "$KIT/src/obsidian/endpoint-list.ts"     src/vendor/kit-obsidian/endpoint-list.ts
```

In jede der vier Dateien als **Zeile 1** den Herkunfts-Header setzen, im Stil der bestehenden Vendor-Dateien:

```
// vendored from obsidian-kit#0.26.0, src/<pure|obsidian>/<datei>.ts
```

- [ ] **Step 2: Import-Pfade umbiegen**

Die beiden `kit-obsidian`-Module sind die ersten Kit-Module mit Imports über die Schichtgrenze. Im Kit lauten sie `../pure/…`; unter `src/vendor/kit-obsidian/` zeigt das ins Leere. Genau diese Zeilen ändern, nichts sonst:

| in `src/vendor/kit-obsidian/model-picker.ts` | wird zu |
|---|---|
| `from "../pure/model-choice"` | `from "../kit/model-choice"` |

| in `src/vendor/kit-obsidian/endpoint-list.ts` | wird zu |
|---|---|
| `from "../pure/model-choice"` | `from "../kit/model-choice"` |
| `from "../pure/model-list-cache"` | `from "../kit/model-list-cache"` |
| `from "../pure/endpoint"` | `from "../kit/endpoint"` |
| `from "../pure/endpoint_diagnostics"` | `from "../kit/endpoint_diagnostics"` |
| `from "../pure/endpoint_config"` | `from "../../endpoint_config"` |
| `from "./model-picker"` | bleibt |

Die letzte Zeile ist die einzige, die nicht auf ein Vendor-Modul zeigt: vault-rag hält `endpoint_config` lokal (siehe Global Constraints). Vermerke das direkt darunter als Kommentar:

```ts
// Pfad bewusst auf vault-rags lokale Fassung gebogen: sie ist die QUELLE der Kit-Fassung und
// trägt zwei Extras (chatRequestModel, describeEndpointRole). Zwei Kopien nebeneinander wären
// die Divergenz, die das Vendoring gerade verhindern soll.
```

- [ ] **Step 3: VENDOR.json nachziehen**

In `src/vendor/kit-obsidian/VENDOR.json` die Versions- und Datei-Felder auf `0.26.0` bzw. die erweiterte Liste setzen (`collapsible.ts, confirm.ts, folder-suggest.ts, settings_walker.ts, model-picker.ts, endpoint-list.ts`). Gibt es unter `src/vendor/kit/` keine `VENDOR.json`, keine anlegen — die Header in Zeile 1 sind dort die Deklaration.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS. Ein Fehler hier bedeutet fast immer ein übersehener Import-Pfad aus Step 2.

- [ ] **Step 5: Commit**

```bash
git add src/vendor
git commit -m "chore(vendor): obsidian-kit 0.26.0 — Endpunkt-Liste, Modell-Picker, Modell-Cache"
```

---

### Task 2: Beide Endpunkt-Listen auf die Kit-Komponente umstellen

**Files:**
- Modify: `src/settings.ts` — `renderEmbeddingEndpoints` (ab Z. 452), `renderChatEndpoints` (ab Z. 666), Löschung von `buildEndpointList` (Z. 833-1106)
- Test: `npm run gate`

**Interfaces:**
- Consumes: `buildEndpointList`, `EndpointListStrings` aus `./vendor/kit-obsidian/endpoint-list`; `createModelListCache` aus `./vendor/kit/model-list-cache`.
- Produces: eine private Methode `endpointStrings(label: string): EndpointListStrings` und das Feld `private modelCache = createModelListCache();`, die Task 3 weiterverwendet.

- [ ] **Step 1: Cache-Feld und strings-Fabrik anlegen**

In der Tab-Klasse das Feld `private modelLists = new Map<…>()` (Z. 150) und `private modelListGeneration = 0` (Z. 155) **noch nicht löschen** — Task 3 räumt sie ab. Daneben anlegen:

```ts
/** Modell-Listen je Endpunkt — jetzt aus dem Kit. Überlebt bewusst refreshUi(). */
private modelCache = createModelListCache();
```

Und die Texte, die bisher im Block standen, als eine Wahrheit für beide Listen:

```ts
/** Alle Texte der Endpunkt-Zeile. Das Kit formuliert nicht — vault-rag ist einsprachig,
 *  deshalb stehen die deutschen Sätze hier, wörtlich wie im bisherigen Block. */
private endpointStrings(label: string): EndpointListStrings {
  return {
    addPlaceholder: "Weiteren Endpunkt hinzufügen…",
    apiKeyPlaceholder: "API-Schlüssel (leer = lokaler Server)",
    modelPlaceholder: "Modell (leer = globales)",
    ariaUrl: `${label}: URL`,
    ariaAdd: t("settings.endpointRow.ariaAdd", label),
    ariaApiKey: (url: string) => `API-Schlüssel für ${url} (leer = lokaler Server)`,
    ariaModel: (url: string) => `Modell für ${url} (leer = globales Modell)`,
    emptyModelLabel: (globalModel: string) => `globales Modell (${globalModel || "nicht gesetzt"})`,
    modelHint: (key) =>
      key === "unreachable"
        ? "Endpunkt nicht erreichbar — gespeicherter Wert bleibt erhalten. „Modelle abrufen“, sobald er läuft."
        : key === "no-list"
          ? "Endpunkt gibt keine Modell-Liste heraus — Namen von Hand eintragen."
          : "",
    savedSuffix: "(gespeichert)",
    refreshModels: "Modelle abrufen",
    moveToFront: "Zuerst verwenden — an den Anfang der Liste setzen",
    remove: "Endpunkt entfernen",
    thirdParty: "Endpunkt mit Schlüssel — Inhalte, die an ihn gesendet werden, gehen an diesen Anbieter.",
    probing: "prüfe…",
    statusTooltip: (status) => status.klartext,
    role: (role) => describeEndpointRole(role),
    warnings: (warnings) => warnings.map(w => w.message).join(" · "),
    presetLabel: (preset) => `+ ${preset.label}`,
    presetTooltip: (preset) => `${preset.url} hinzufügen`,
    checkConnection: "Verbindung prüfen",
    saveFailed: t("settings.endpointSaveFailed"),
  };
}
```

Die beiden Hinweissätze in `modelHint` sind wörtlich `HINT_UNREACHABLE` und `HINT_NO_LIST` aus `src/model_choice.ts` — kopiere sie von dort, statt sie abzutippen (typografische Anführungszeichen!).

- [ ] **Step 2: Aufrufstelle Embedding umstellen**

`renderEmbeddingEndpoints` (Z. 452ff): `this.buildEndpointList({…})` wird zu `buildEndpointList({…})` mit vier zusätzlichen Feldern; alles andere bleibt Zeile für Zeile gleich:

```ts
buildEndpointList({
  containerEl: host,
  label: t("settings.embeddingEndpoints.label"),
  desc: t("settings.embeddingEndpoints.desc"),
  placeholder: "http://localhost:11434",
  strings: this.endpointStrings(t("settings.embeddingEndpoints.label")),
  cache: this.modelCache,
  get: () => this.plugin.settings.embeddingEndpoints,
  set: (eps) => { this.plugin.settings.embeddingEndpoints = eps; },
  active: () => this.plugin.activeEmbeddingEndpoint,
  clientFor: (cfg) => new EmbeddingClient(cfg.url, effectiveModel(cfg, this.plugin.settings.embeddingModel), cfg.apiKey),
  globalModel: () => this.plugin.settings.embeddingModel,
  modelFits: (cfg) => embeddingModelMatchesIndex(
    effectiveModel(cfg, this.plugin.settings.embeddingModel),
    this.plugin.indexEmbeddingModel,
  ),
  save: () => this.plugin.saveSettings(),
  reconnect: () => this.plugin.resolveAndReconnectEmbedder(),
  rerender: () => { this.refreshUi(); },
});
```

- [ ] **Step 3: Aufrufstelle Chat umstellen**

`renderChatEndpoints` (Z. 666ff), analog:

```ts
buildEndpointList({
  containerEl: host,
  label: t("settings.chatEndpoints.label"),
  desc: t("settings.chatEndpoints.desc"),
  placeholder: "http://localhost:1234",
  strings: this.endpointStrings(t("settings.chatEndpoints.label")),
  cache: this.modelCache,
  get: () => this.plugin.settings.chatEndpoints,
  set: (eps) => { this.plugin.settings.chatEndpoints = eps; },
  active: () => this.plugin.activeChatEndpoint,
  clientFor: (cfg) => new ChatClient(cfg.url, effectiveModel(cfg, this.plugin.settings.chatModel), cfg.apiKey),
  globalModel: () => this.plugin.settings.chatModel,
  save: () => this.plugin.saveSettings(),
  reconnect: () => this.plugin.resolveAndReconnectChat(),
  rerender: () => { this.refreshUi(); },
});
```

- [ ] **Step 4: Den eigenen Block löschen**

`private buildEndpointList(opts: {…}): void {…}` (Z. 833-1106) ersatzlos entfernen, inklusive des Doc-Kommentars darüber. Die Imports, die dadurch verwaisen (`applyEndpointEdit`, `moveEndpointToFront`, `carriesApiKey`, `endpointRole`, `validateEndpointInput`, `ENDPOINT_PRESETS`, `normalizeEndpoint`, `setIcon`, `setTooltip`, `Notice`), **nicht pauschal** streichen — mehrere werden anderswo im Tab weiter gebraucht. `npm run lint` mit `--max-warnings 0` zeigt dir genau die, die wirklich unbenutzt sind.

- [ ] **Step 5: Gate**

Run: `npm run gate`
Expected: PASS. Erwartete Stolperstellen: `describeEndpointRole` muss importiert bleiben (die strings-Fabrik nutzt es), `EndpointListStrings` und `buildEndpointList` müssen importiert sein, `this.` vor `buildEndpointList` muss weg.

- [ ] **Step 6: Commit**

```bash
git add src/settings.ts
git commit -m "refactor(settings): Endpunkt-Listen aus dem Kit statt aus dem eigenen Block"
```

---

### Task 3: Die drei übrigen Modell-Picker auf den Kit-Cache umstellen

Ohne diesen Task hat der Tab zwei Modell-Listen-Wahrheiten: die Kit-Komponente cached je Zeile, `renderEmbeddingModel`/`renderChatModel`/Smart-Apply cachen weiter im alten `modelLists`. Ein „Modelle abrufen" in der Zeile würde die globale Auswahl dann nicht mitziehen.

**Files:**
- Modify: `src/settings.ts` — Z. ~150-155 (Felder), 236-278 (`loadModelList`/`invalidateModelList`), 281-317 (`renderModelPicker`), die drei Aufrufstellen (~479, ~690, ~770), 819-823 (`hide()`)
- Modify: `src/model_choice.ts` (wird zum Adapter oder entfällt)

**Interfaces:**
- Consumes: `this.modelCache` (Task 2), `renderModelPicker` aus `./vendor/kit-obsidian/model-picker`, `resolveModelChoice` aus `./vendor/kit/model-choice`.
- Produces: keine neue öffentliche Fläche.

- [ ] **Step 1: Die drei Aufrufstellen umschreiben**

Muster für alle drei (hier `renderChatModel`, Z. ~690):

```ts
const key = this.plugin.activeChatEndpoint ?? "";
const gen = this.modelCache.generation();
void this.modelCache.load(key, this.plugin.chatClient).then(({ models, reachable }) => {
  this.showInfo(this.plugin.settings.chatModel);
  this.showCaps(this.plugin.settings.chatModel);
  if (gen !== this.modelCache.generation()) return;
  renderModelPicker({
    setting: s,
    choice: resolveModelChoice({ reachable, models, current: this.plugin.settings.chatModel }),
    ariaLabel: t("settings.chatModel.name"),
    placeholder: "qwen3",
    hint: this.modelHint(resolveModelChoice({ reachable, models, current: this.plugin.settings.chatModel }).hintKey),
    savedSuffix: "(gespeichert)",
    refreshTooltip: "Modelle abrufen",
    onPick: (v: string) => { /* unverändert */ },
    onRefresh: () => { this.modelCache.invalidate(key); this.refreshUi(); },
  });
});
```

Berechne `choice` **einmal** in einer Konstante und reiche sie an beide Stellen (`choice` und `hint`) — der doppelte Aufruf oben ist nur zur Verdeutlichung so geschrieben. Ziehe die `modelHint`-Abbildung aus der strings-Fabrik in Task 2 als eigene private Methode `private modelHint(key: ModelHintKey): string` heraus, damit beide Nutzer dieselbe Wahrheit verwenden.

**Zu `allowEmpty` (Stand nach der Kit-Umsetzung, 2026-08-09):** Die Kit-Fassung von `resolveModelChoice` **kennt** `allowEmpty` — es ist optional mit Default `false`. Die drei globalen Picker lassen es deshalb einfach weg; das entspricht ihrem bisherigen `allowEmpty: false`. Nur die Endpunkt-Zeile ruft mit `true`, und das tut die Kit-Komponente bereits selbst.

Eine kleine Verhaltensdifferenz bleibt und ist **kein Bug, sondern ein erwartetes Delta**: bei `reachable === false` **und** leerem gespeichertem Wert erzeugte die alte Fassung `[{value: "", label: "—"}]`, die Kit-Fassung `[{value: "", label: ""}]` — im gesperrten Dropdown steht dann eine leere Zeile statt „—". Rein kosmetisch: das `<select>` ist im Modus `locked` ohnehin `setDisabled(true)`. Nicht am Aufrufort reparieren; wenn es stören sollte, ist der richtige Ort `allowEmpty` im `locked`-Zweig der Kit-Funktion.

- [ ] **Step 2: Alten Cache und alten Picker entfernen**

Löschen: `private modelLists`, `private modelListGeneration`, `private loadModelList(…)`, `private invalidateModelList(…)`, `private renderModelPicker(…)`, `interface ModelPickerOpts` (Z. 92-113). In `hide()` (Z. 819-823) wird `this.modelLists.clear()` zu `this.modelCache.clear()`.

- [ ] **Step 3: `src/model_choice.ts` auflösen**

Die Datei enthält jetzt nur noch eine zweite Wahrheit. Ersetze ihren Inhalt durch einen Re-Export des Kit-Moduls plus die beiden Hinweissätze, die vault-rag weiterhin als Text braucht:

```ts
/* Modell-Auswahl: die Regeln stehen jetzt im Kit (vendor/kit/model-choice). Hier bleiben nur
 * die deutschen Hinweissätze — das Kit gibt Schlüssel zurück, keine Sätze. Diese Datei war die
 * Quelle der Kit-Fassung; sie wird als Adapter behalten, damit Aufrufer und Tests sich nicht
 * über zwei Import-Pfade streiten. */
export {
  resolveModelChoice,
  type ModelChoice, type ModelChoiceMode, type ModelChoiceInput,
  type ModelOption, type ModelHintKey,
} from "./vendor/kit/model-choice";

export const HINT_NO_LIST = "…";        // wörtlich aus der bisherigen Fassung übernehmen
export const HINT_UNREACHABLE = "…";    // wörtlich aus der bisherigen Fassung übernehmen
```

`tests/model_choice.test.ts` prüft danach die Kit-Fassung. Die Testfälle, die auf `hint` (Klartext) statt `hintKey` prüfen, müssen mitgezogen werden — das sind erwartete, gewollte Änderungen: passe die Erwartung auf `hintKey` an, statt das Verhalten zurückzubiegen.

- [ ] **Step 4: Gate**

Run: `npm run gate`
Expected: PASS. Falls `tests/model_choice.test.ts` rot ist, prüfe zuerst, ob die Erwartung (`hint` vs. `hintKey`) oder die Logik das Problem ist — nur Ersteres darf angepasst werden.

- [ ] **Step 5: Commit**

```bash
git add src/settings.ts src/model_choice.ts tests/model_choice.test.ts
git commit -m "refactor(settings): eine Modell-Listen-Wahrheit — Kit-Cache fuer alle vier Picker"
```

---

### Task 4: CSS umstellen

**Files:**
- Modify: `styles.css` (Z. 35-67 und 298-326)

- [ ] **Step 1: Regeln ersetzen**

Ersetze die Blöcke mit `vault-rag-ep-*` und `vault-rag-model-slot` durch den Inhalt von `ENDPOINT_LIST_CSS` aus dem Kit (`../obsidian-kit/src/obsidian/endpoint-list.ts`, Konstante am Dateiende). Kommentiere die eingefügte Stelle:

```css
/* --- aus obsidian-kit 0.26.0, ENDPOINT_LIST_CSS — nicht von Hand ändern, sondern im Kit --- */
```

`.vault-rag-sa-conn-refresh` (Z. 68-69) gehört **nicht** dazu und bleibt.

- [ ] **Step 2: Nach verwaisten Klassen suchen**

Run: `grep -rn "vault-rag-ep\|vault-rag-model-slot" src styles.css`
Expected: keine Treffer mehr. Jeder Treffer ist eine übersehene Stelle.

- [ ] **Step 3: Gate + Commit**

```bash
npm run gate
git add styles.css
git commit -m "style: Endpunkt-Zeilen-CSS aus dem Kit (okit-Praefix)"
```

---

### Task 5: Gegenprobe am laufenden Obsidian

Kein Unit-Test erreicht diese Schicht. Ohne diesen Task ist der Umbau nicht abgenommen.

**Files:**
- Modify: `docs/SMOKE.md` (falls vorhanden — sonst die Punkte in die bestehende Release-Checkliste eintragen)

- [ ] **Step 1: Build ins Test-Vault bringen**

Run: `npm run build`, dann die gebaute `main.js` + `styles.css` + `manifest.json` in den Plugin-Ordner des Test-Vaults kopieren (wie im Repo etabliert) und Obsidian neu laden.

- [ ] **Step 2: Die sechs Prüfpunkte fahren**

1. **Chat-Liste öffnen, LM Studio läuft:** Modell-Dropdowns füllen sich je Zeile, Status-Icons werden grün, Rollenzeile („aktiv" / „erreichbar, aber Platz 2") stimmt.
2. **Embedding-Liste, inklusive `modelFits`:** ein Endpunkt mit einem Modell, das **nicht** zum geladenen Index passt, zeigt weiterhin die Sonderrolle (`skipped-model`) — das ist die Stelle mit dem höchsten Risiko.
3. **Einstellungen bei nicht laufendem LM Studio öffnen:** N parallele Timeouts. Sieht die Liste kaputt aus oder nur ehrlich rot? Beobachtung notieren.
4. **API-Schlüssel eintragen und Feld verlassen:** Drittanbieter-Dreieck erscheint **sofort**, ohne Tab-Neuaufbau; Schlüssel wieder leeren → es verschwindet sofort.
5. **„Zuerst verwenden" und Mülleimer:** Zeilen sind während des Speicherns gesperrt (gedimmt, keine Klicks), danach wieder frei, Reihenfolge stimmt.
6. **„Modelle abrufen" in einer Zeile:** die globale Modell-Auswahl zieht mit (gemeinsamer Cache) — das ist der Punkt, den Task 3 überhaupt erst herstellt.

- [ ] **Step 3: Ergebnis festhalten**

Die sechs Punkte in `docs/SMOKE.md` als dauerhafte Prüfpunkte eintragen (sie gelten ab jetzt für jedes Release) und das Durchlauf-Ergebnis mit Datum notieren. Bei einem Fehlschlag: **nicht** weiter zu Schritt 3 (koda-agent) — erst hier reparieren.

- [ ] **Step 4: Commit**

```bash
git add docs/SMOKE.md
git commit -m "docs(smoke): Pruefpunkte der Kit-Endpunktliste"
```

---

## Definition of Done

- `npm run gate` grün.
- Kein Treffer mehr für `grep -rn "buildEndpointList" src/settings.ts` außer im Import.
- Alle sechs Prüfpunkte aus Task 5 am laufenden Obsidian gefahren und notiert.
- Kein Release nötig: die Umstellung fährt mit dem nächsten regulären vault-rag-Release mit.

Danach folgt Schritt 3: `2026-08-08-koda-endpunkt-und-sidebar.md`.
