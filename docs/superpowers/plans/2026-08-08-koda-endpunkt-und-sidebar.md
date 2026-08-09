# Kit-Extraktion Schritt 3: koda-agent übernimmt die Endpunkt-Zeile + Sidebar-Angleichung → 0.3.0

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Koda erbt die vollständige Endpunkt-Zeile aus `obsidian-kit@0.26.0` (Modell-Dropdown je Zeile, automatische Prüfung beim Öffnen, Rollenzeile, Drittanbieter-Hinweis) und schließt die Sidebar-Lücken (Warteanzeige, Thinking-Default, Senden-Knopf). Ergebnis ist Release 0.3.0.

**Architecture:** Zwei unabhängige Teile in einem Release. Teil A ersetzt `renderEndpointList` durch die Kit-Komponente — Kodas MVP-Rückstand verschwindet dadurch, ohne dass ein einziges Verhalten neu erfunden wird. Teil B (Sidebar) ist davon unabhängig: die Sichtbarkeitsregel der Warteanzeige wird als pure Funktion in `src/core/` gebaut (von `check:pure` erzwungen), die View bleibt dünn.

**Tech Stack:** TypeScript, esbuild, vitest (aktuell 160/160), Obsidian 1.8.7+.

**Arbeitsverzeichnis für ALLE Tasks:** `/Users/Shared/code/obsidian-plugins/koda-agent`

**Voraussetzung:** Plan 1 (`obsidian-kit@0.26.0` getaggt) und Plan 2 (vault-rag umgestellt, Gegenprobe gefahren) sind durch. vault-rag steht vorher, weil sich ein Bruch dort an der Referenz zeigt statt am Neuling.

## Global Constraints

- **`src/core/` bleibt obsidian-frei** — `check:pure` erzwingt das und ist Teil von `npm run gate`.
- **Gate:** `npm run gate` (= `lint` + `typecheck` + `typecheck:scripts` + `test` + `check:pure` + `build`). Vor jedem Commit.
- **`src/vendor/kit*` wird nie von Hand editiert** — nur über `tools/sync-kit.sh`.
- **Ein `sync-kit.sh`-Lauf re-vendort die ganze Modul-Liste.** Nach dem Lauf `git status --short` prüfen und den gesamten entstandenen Stand committen; ein Kit-Versions-Sprung gehört in einen eigenen `chore(vendor):`-Commit (Lesson 2026-08-08).
- **i18n vollständig:** jeder neue Schlüssel existiert in `en` **und** `de`. `t()` fällt bei unbekanntem Schlüssel auf den **Schlüssel** zurück, nicht auf Englisch — eine Lücke sieht deshalb aus wie ein plausibler String, nicht wie ein Fehler (Lesson 2026-08-08, obsidian-transmute).
- **UI-STANDARD:** nur Theme-CSS-Variablen, Obsidian-nativ first.

---

## Teil A — Endpunkt-Zeile aus dem Kit

### Task 1: Kit 0.26.0 vendoren, `sync-kit.sh` erweitern

Die neuen Kit-Module sind die ersten mit Imports über die Schichtgrenze (`../pure/…` in einem `obsidian/`-Modul). Kodas Vendor-Layout kennt kein `vendor/pure/` — die Pfade müssen beim Kopieren umgeschrieben werden, sonst bricht der Typecheck.

**Files:**
- Modify: `tools/sync-kit.sh`
- Create (durch das Skript): `src/vendor/kit/model-choice.ts`, `src/vendor/kit/model-list-cache.ts`, `src/vendor/kit-obsidian/model-picker.ts`, `src/vendor/kit-obsidian/endpoint-list.ts`
- Modify (durch das Skript): `src/vendor/kit/VENDOR.json`, `src/vendor/kit-obsidian/VENDOR.json`, `tests/vendor/kit/obsidian-mock.ts`

**Interfaces:**
- Consumes: `obsidian-kit@0.26.0`.
- Produces: die vendorten Module unter `src/vendor/`.

- [ ] **Step 1: Modul-Listen im Skript erweitern**

In `tools/sync-kit.sh` die `pure`-Schleife um `model-choice model-list-cache` und die `obsidian`-Schleife um `model-picker endpoint-list` ergänzen. Beide `VENDOR.json`-Heredocs am Dateiende um dieselben Namen erweitern.

- [ ] **Step 2: Import-Rewrite einbauen**

Direkt nach dem `cp` der `obsidian`-Module, vor dem `stamp`, die Schichtgrenzen-Imports umbiegen. Ohne diesen Schritt zeigt `endpoint-list.ts` auf ein nicht existierendes `src/vendor/pure/`:

```sh
for m in clock confirm folder-suggest settings_walker model-picker endpoint-list; do
  cp "$KIT/src/obsidian/$m.ts" "src/vendor/kit-obsidian/$m.ts"
  # Kit-interne Schichtgrenze: im Kit liegt pure/ neben obsidian/, hier heisst es kit/.
  # Einziger erlaubter Eingriff am vendorten Code — deshalb hier im Skript, nicht von Hand.
  sed -i '' 's|from "\.\./pure/|from "../kit/|g' "src/vendor/kit-obsidian/$m.ts"
  stamp "src/vendor/kit-obsidian/$m.ts" "src/obsidian/$m.ts"
  echo "vendored obsidian-kit@$VER/obsidian/$m.ts"
done
```

`sed -i ''` ist die BSD-/macOS-Form; das Skript läuft auf darwin.

- [ ] **Step 3: Skript ausführen und Ergebnis prüfen**

```bash
sh tools/sync-kit.sh
git status --short
grep -rn 'from "\.\./pure/' src/vendor/          # erwartet: keine Treffer
npm run typecheck
```
Expected: Typecheck grün, kein `../pure/`-Import mehr unter `src/vendor/`.

- [ ] **Step 4: Commit**

```bash
git add tools/sync-kit.sh src/vendor tests/vendor
git commit -m "chore(vendor): obsidian-kit 0.26.0 (Endpunkt-Liste, Modell-Picker, Cache)"
```

**Zwei Dinge, die der Sync mitbringt** (Stand nach der Kit-Umsetzung, 2026-08-09):

1. **Der Test-Mock ändert seine Struktur.** `Setting.add*` hängt seine Komponenten ab 0.26.0 in `controlEl` statt direkt in `settingEl` — so wie der echte Obsidian. Das ist die einzige nicht-additive Änderung des Kit-Releases. Ein Test, der `settingEl.children` **flach** nach Komponenten durchsucht, findet danach nichts mehr. Der Kit-Review hat Kodas Tests dagegen geprüft: keiner inspiziert `settingEl` direkt, der Sync sollte also ohne Bruch durchgehen. Trotzdem nach dem Lauf das volle Gate fahren, nicht nur den Typecheck.
2. **Der Mock bekommt echte Tag-Namen und aufgezeichnete Tooltips** (`INPUT`/`SELECT`/`BUTTON`, `setTooltip`/`setIcon` speichern ihren Wert, `remove()` hängt wirklich aus). Rein additiv, aber es macht in Koda-Tests Dinge prüfbar, die vorher stumm waren — nützlich für den Sidebar-Teil weiter unten.

---

### Task 2: Aktiven Endpunkt synchron abfragbar machen

Die Kit-Komponente braucht `active(): string | null` **synchron**, um die Rollenzeile zu setzen. `EndpointResolver` merkt sich das Ergebnis bereits (`private cached`), gibt es aber nur über das Promise heraus.

**Files:**
- Modify: `src/core/llm/failover.ts`
- Modify: `src/main.ts`
- Test: `tests/failover.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  ```ts
  // EndpointResolver
  current(): EndpointConfig | null
  // KodaPlugin
  activeEndpointUrl(): string | null
  ```

- [ ] **Step 1: Failing test schreiben**

An `tests/failover.test.ts` anhängen:

```ts
it("gibt den gemerkten Endpunkt synchron heraus", async () => {
  const resolver = new EndpointResolver(
    () => [{ url: "http://a" }, { url: "http://b" }],
    (ep) => Promise.resolve(ep.url === "http://b"),
  );
  expect(resolver.current()).toBeNull();          // vor dem ersten resolve()
  await resolver.resolve();
  expect(resolver.current()?.url).toBe("http://b");
  resolver.invalidate();
  expect(resolver.current()).toBeNull();          // invalidate raeumt auch den Getter
});
```

Prüfe die Import-Zeile der Datei; `EndpointConfig`-Objekte werden dort bereits erzeugt, folge dem vorhandenen Stil.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/failover.test.ts`
Expected: FAIL — `resolver.current is not a function`.

- [ ] **Step 3: Getter ergänzen**

In `src/core/llm/failover.ts`, direkt nach `resolve()`:

```ts
/** Der gemerkte Endpunkt, ohne zu pingen. `null` heißt „noch nicht aufgelöst" — NICHT
 *  „keiner erreichbar". Die Einstellungen brauchen die Auskunft synchron, um eine Zeile als
 *  aktiv zu markieren; ein await an dieser Stelle würde die Liste bei jedem Zeichnen pingen. */
current(): EndpointConfig | null {
  return this.cached;
}
```

In `src/main.ts` daneben:

```ts
/** URL des gemerkten aktiven Endpunkts — für die Rollenzeile der Endpunkt-Liste. */
activeEndpointUrl(): string | null {
  return this.resolver.current()?.url ?? null;
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npx vitest run tests/failover.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/llm/failover.ts src/main.ts tests/failover.test.ts
git commit -m "feat(llm): aktiven Endpunkt synchron abfragbar"
```

---

### Task 3: i18n-Schlüssel für die Endpunkt-Zeile

**Files:**
- Modify: `src/i18n/strings.ts` (beide Sprachblöcke)
- Test: `tests/probe_i18n.test.ts` (Muster für Vollständigkeitsprüfung)

**Interfaces:**
- Produces: die Schlüssel, die Task 4 im `strings`-Objekt verwendet.

- [ ] **Step 1: Schlüssel ergänzen**

Neu in **beiden** Blöcken (`en` und `de`), Werte hier vollständig:

| Schlüssel | en | de |
|---|---|---|
| `settings.endpoints.modelHint.unreachable` | `Endpoint unreachable — the saved value stays. Use “Fetch models” once it is running.` | `Endpunkt nicht erreichbar — gespeicherter Wert bleibt erhalten. „Modelle abrufen“, sobald er läuft.` |
| `settings.endpoints.modelHint.noList` | `Endpoint does not publish a model list — type the name yourself.` | `Endpunkt gibt keine Modell-Liste heraus — Namen von Hand eintragen.` |
| `settings.endpoints.modelSaved` | `(saved)` | `(gespeichert)` |
| `settings.endpoints.refreshModels` | `Fetch models` | `Modelle abrufen` |
| `settings.endpoints.globalModel` | `global model ({0})` | `globales Modell ({0})` |
| `settings.endpoints.globalModelUnset` | `not set` | `nicht gesetzt` |
| `settings.endpoints.thirdParty` | `Endpoint with a key — anything sent to it goes to that provider.` | `Endpunkt mit Schlüssel — Inhalte, die an ihn gesendet werden, gehen an diesen Anbieter.` |
| `settings.endpoints.ariaUrl` | `{0}: URL` | `{0}: URL` |
| `settings.endpoints.ariaAdd` | `Add another endpoint to {0}` | `Weiteren Endpunkt zu {0} hinzufügen` |
| `settings.endpoints.ariaApiKey` | `API key for {0} (empty = local server)` | `API-Schlüssel für {0} (leer = lokaler Server)` |
| `settings.endpoints.ariaModel` | `Model for {0} (empty = global model)` | `Modell für {0} (leer = globales Modell)` |
| `settings.endpoints.role.active` | `active` | `aktiv` |
| `settings.endpoints.role.standby` | `reachable, but position {0}` | `erreichbar, aber Platz {0}` |
| `settings.endpoints.role.unreachable` | `not reachable` | `nicht erreichbar` |
| `settings.endpoints.role.skippedModel` | `skipped — model does not match` | `übersprungen — Modell passt nicht` |
| `settings.endpoints.checkConnection` | `Check connection` | `Verbindung prüfen` |
| `settings.endpoints.saveFailed` | `Could not save the endpoint list.` | `Endpunkt-Liste konnte nicht gespeichert werden.` |

Vorhandene Schlüssel weiterverwenden statt zu duplizieren: `settings.addEndpoint`, `settings.endpoints.apiKeyPlaceholder`, `settings.endpoints.modelPlaceholder`, `settings.endpoints.preset`, `settings.endpoints.moveToFront`, `settings.remove`, `settings.probe.testing` (als „prüfe…"), sowie die `settings.probe.<kind>`-Familie über `endpointStatusView`.

- [ ] **Step 2: Vollständigkeit an den Typechecker binden**

Ergänze in `tests/probe_i18n.test.ts` (oder einer neuen `tests/endpoint_i18n.test.ts`) einen Fall, der die Rollen-Abdeckung erzwingt — dieselbe Bauart, die den `unauthorized`-Fall in transmute gefangen hätte:

```ts
import type { EndpointRole } from "../src/vendor/kit/endpoint_config";

it("uebersetzt jede Rolle", () => {
  const covered: Record<EndpointRole["kind"], true> = {
    active: true, standby: true, unreachable: true, "skipped-model": true,
  };
  for (const kind of Object.keys(covered)) {
    expect(describeRole({ kind } as EndpointRole)).not.toContain("settings.");
  }
});
```

`describeRole` ist die Funktion aus Task 4, Step 1 — schreibe diesen Test dort fertig, sobald sie existiert; hier reicht es, die Schlüssel anzulegen.

- [ ] **Step 3: Gate + Commit**

```bash
npm run gate
git add src/i18n/strings.ts
git commit -m "i18n: Schluessel der Kit-Endpunktzeile (DE/EN)"
```

---

### Task 4: `renderEndpointList` durch die Kit-Komponente ersetzen

**Files:**
- Modify: `src/obsidian/settings.ts` (Z. 171-299 entfallen, Aufruf + strings neu)
- Modify: `styles.css`
- Test: `npm run gate`

**Interfaces:**
- Consumes: `buildEndpointList`, `EndpointListStrings` (`../vendor/kit-obsidian/endpoint-list`), `createModelListCache` (`../vendor/kit/model-list-cache`), `activeEndpointUrl()` (Task 2), die Schlüssel aus Task 3.
- Produces: nichts Neues nach außen.

- [ ] **Step 1: Rollen-Übersetzer anlegen**

In `src/core/llm/endpoint-status-view.ts` (dort steht die Schwester `endpointStatusView`, gleiche Zuständigkeit, pure):

```ts
import type { EndpointRole } from "../../vendor/kit/endpoint_config";

/** Rolle einer Endpunkt-Zeile als übersetzter Text. Das Kit gibt die Rolle sprachfrei
 *  heraus, damit zweisprachige Plugins sie durch ihr eigenes `t()` führen können. */
export function describeRole(role: EndpointRole): string {
  switch (role.kind) {
    case "active": return t("settings.endpoints.role.active");
    case "standby": return t("settings.endpoints.role.standby", String(role.position));
    case "unreachable": return t("settings.endpoints.role.unreachable");
    case "skipped-model": return t("settings.endpoints.role.skippedModel");
  }
}
```

Der `switch` ohne `default` ist Absicht: kommt im Kit eine fünfte Rolle dazu, bricht der Typecheck hier — nicht erst der Nutzer in der Oberfläche.

Jetzt den Test aus Task 3, Step 2 fertigstellen und laufen lassen.

- [ ] **Step 2: Cache-Feld und strings-Fabrik anlegen**

In `KodaSettingsTab`:

```ts
/** Modell-Listen je Endpunkt (Kit). Überlebt bewusst refreshUi(). */
private endpointModels = createModelListCache();

private endpointStrings(label: string): EndpointListStrings {
  return {
    addPlaceholder: t("settings.addEndpoint"),
    apiKeyPlaceholder: t("settings.endpoints.apiKeyPlaceholder"),
    modelPlaceholder: t("settings.endpoints.modelPlaceholder"),
    ariaUrl: t("settings.endpoints.ariaUrl", label),
    ariaAdd: t("settings.endpoints.ariaAdd", label),
    ariaApiKey: (url) => t("settings.endpoints.ariaApiKey", url),
    ariaModel: (url) => t("settings.endpoints.ariaModel", url),
    emptyModelLabel: (globalModel) =>
      t("settings.endpoints.globalModel", globalModel || t("settings.endpoints.globalModelUnset")),
    modelHint: (key) =>
      key === "unreachable" ? t("settings.endpoints.modelHint.unreachable")
      : key === "no-list" ? t("settings.endpoints.modelHint.noList")
      : "",
    savedSuffix: t("settings.endpoints.modelSaved"),
    refreshModels: t("settings.endpoints.refreshModels"),
    moveToFront: t("settings.endpoints.moveToFront"),
    remove: t("settings.remove"),
    thirdParty: t("settings.endpoints.thirdParty"),
    probing: t("settings.probe.testing"),
    statusTooltip: (status) => endpointStatusView(status).tooltip,
    role: (role) => describeRole(role),
    warnings: (warnings) => warnings.map((w) => w.message).join(" · "),
    presetLabel: (preset) => `+ ${preset.label}`,
    presetTooltip: (preset) => t("settings.endpoints.preset", preset.label),
    checkConnection: t("settings.endpoints.checkConnection"),
    saveFailed: t("settings.endpoints.saveFailed"),
  };
}
```

`statusTooltip` über `endpointStatusView` zu führen ist der Punkt, an dem Kodas i18n-Statusschlüssel erhalten bleiben — der rohe `status.klartext` aus dem Kit ist deutsch und würde die englische Oberfläche verunreinigen.

- [ ] **Step 3: Den Aufruf schreiben**

`renderEndpointList` behält nur noch den Rumpf:

```ts
private renderEndpointList(setting: Setting): void {
  const host = settingBodyHost(setting);
  const label = t("settings.endpoints");
  buildEndpointList({
    containerEl: host,
    label,
    desc: t("settings.endpoints.desc"),
    placeholder: "http://127.0.0.1:1234",
    strings: this.endpointStrings(label),
    cache: this.endpointModels,
    get: () => this.plugin.settings.endpoints,
    set: (eps) => {
      this.plugin.settings = mergeKodaSettings({ ...this.plugin.settings, endpoints: eps });
    },
    active: () => this.plugin.activeEndpointUrl(),
    clientFor: (cfg) => ({
      listModels: () => this.plugin.probeModels(cfg).then((r) => r.models),
      probe: () => this.plugin.probe(cfg),
    }),
    globalModel: () => this.plugin.settings.model,
    save: () => this.plugin.saveSettings(),
    // Koda hält keine offene Verbindung — „reconnect" heißt hier: den gemerkten aktiven
    // Endpunkt verwerfen, damit die nächste Frage die geänderte Liste neu auflöst.
    reconnect: () => { this.plugin.invalidateEndpoint(); return Promise.resolve(); },
    rerender: () => { this.refreshUi(); },
  });
}
```

Prüfe die beiden Namen gegen den echten Code, bevor du sie verwendest: das globale Modell heißt in `KodaSettings` möglicherweise nicht `model` (siehe `src/core/settings-types.ts`), und ein `invalidateEndpoint()` am Plugin existiert eventuell noch nicht — dann lege es als Einzeiler an, der `this.resolver.invalidate()` aufruft, mit einem Satz Kommentar dazu.

**Zum Timeout:** Die Komponente ruft nur `clientFor(cfg).probe()` / `.listModels()` und bringt selbst keines mit. Kodas Timeout sitzt bereits im Client (`probeEndpoint`/`probeModels` in `src/core/llm/probe.ts` nehmen ein `timeoutMs`). Beim Öffnen der Einstellungen laufen die Prüfungen **aller** Zeilen parallel — ist der dortige Default für diesen Fall zu lang, wird er am Aufruf in `main.ts` gekürzt, **nicht** in der Kit-Komponente (Spec § Entschiedene Fragen).

**Zum Netzverkehr:** Mit dieser Umstellung entsteht beim Öffnen der Einstellungen der erste **ungefragte** Netzverkehr — bei einem Endpunkt mit gesetztem Drittanbieter-Schlüssel geht damit ohne Klick eine Anfrage an diesen Anbieter. Das ist harmlos (`/v1/models` überträgt keine Vault-Inhalte) und in vault-rag seit Monaten so, gehört aber benannt statt still angenommen: nimm es als eigene Zeile in den `CHANGELOG.md`-Eintrag von Task 7 auf.

- [ ] **Step 4: Alten Code entfernen**

Ersatzlos löschen: der bisherige Rumpf von `renderEndpointList` (Zeilen ~174-299, inklusive Test-Knopf und `showStatus`), sowie — **nur wenn der globale Modell-Picker sie nicht ebenfalls nutzt** — die Felder `modelCache`/`modelGeneration`. Der globale Picker `renderModelPicker(setting)` (ab Z. 304) **bleibt unverändert**; er ist das Standardmodell für Zeilen ohne Override.

Damit verschwindet auch der Knopf, an dem am 2026-08-06 der Renderer-Freeze gemessen wurde. Notiere das im Commit — die geparkte Aufgabe „Freeze-Gegenprobe" wird dadurch gegenstandslos.

- [ ] **Step 5: CSS umstellen**

In `styles.css` die vier `.koda-endpoint-status`-Regeln durch den Inhalt von `ENDPOINT_LIST_CSS` (`src/vendor/kit-obsidian/endpoint-list.ts`, Konstante am Dateiende) ersetzen, mit Herkunftszeile:

```css
/* --- aus obsidian-kit 0.26.0, ENDPOINT_LIST_CSS — nicht hier aendern, sondern im Kit --- */
```

`.koda-model-hint` bleibt (gehört zum globalen Picker). Danach: `grep -rn "koda-endpoint-status" src styles.css` muss leer sein.

- [ ] **Step 6: Gate**

Run: `npm run gate`
Expected: PASS, Tests weiterhin grün. `check:pure` schlägt an, falls `describeRole` versehentlich einen Obsidian-Import mitgebracht hat.

- [ ] **Step 7: Commit**

```bash
git add src/obsidian/settings.ts src/core/llm/endpoint-status-view.ts styles.css tests
git commit -m "feat(settings): Endpunkt-Zeile aus dem Kit — Modell-Liste, Autopruefung, Rollen"
```

---

## Teil B — Sidebar

### Task 5: Warteanzeige (pure Regel + View)

**Files:**
- Create: `src/core/chat/pending.ts`
- Create: `tests/pending.test.ts`
- Modify: `src/obsidian/view.ts`
- Modify: `styles.css`
- Modify: `src/i18n/strings.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  ```ts
  export type PendingEvent = "ask" | "token" | "reasoning" | "tool" | "done";
  export function nextPending(visible: boolean, event: PendingEvent): boolean
  ```

- [ ] **Step 1: Failing test schreiben**

`tests/pending.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { nextPending, type PendingEvent } from "../src/core/chat/pending";

function run(events: PendingEvent[]): boolean {
  return events.reduce((visible, e) => nextPending(visible, e), false);
}

describe("nextPending", () => {
  it("zeigt die Anzeige ab dem Absenden", () => {
    expect(run(["ask"])).toBe(true);
  });

  it("nimmt sie beim ersten Token weg", () => {
    expect(run(["ask", "token"])).toBe(false);
  });

  it("nimmt sie auch beim ersten Reasoning-Token weg", () => {
    expect(run(["ask", "reasoning"])).toBe(false);
  });

  it("zeigt sie nach einer Tool-Runde erneut", () => {
    expect(run(["ask", "token", "tool"])).toBe(true);
  });

  it("verschwindet endgueltig beim Abschluss", () => {
    expect(run(["ask", "token", "tool", "done"])).toBe(false);
  });

  it("bleibt bei weiteren Token ausgeblendet", () => {
    expect(run(["ask", "token", "token", "token"])).toBe(false);
  });

  it("bleibt ueber mehrere Tool-Runden hinweg korrekt", () => {
    expect(run(["ask", "token", "tool", "token", "tool"])).toBe(true);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/pending.test.ts`
Expected: FAIL — Modul nicht auflösbar.

- [ ] **Step 3: Regel implementieren**

`src/core/chat/pending.ts`:

```ts
/* Sichtbarkeit der Warteanzeige — eine Regel, pure und damit prüfbar.
 *
 * „Sichtbar, solange gearbeitet wird und gerade kein Stream-Block läuft." Die zweite tote
 * Phase ist die nach einer Tool-Runde: dort steht `streamEl` wieder auf null und bis zum
 * nächsten Token passiert sichtbar nichts. Genau deshalb ist die Regel nicht „einmal an,
 * einmal aus", sondern ein kleiner Zustandsautomat. */

export type PendingEvent =
  /** ask() startet. */            | "ask"
  /** erstes Antwort-Token. */     | "token"
  /** erstes Reasoning-Token. */   | "reasoning"
  /** eine Tool-Runde beginnt. */  | "tool"
  /** abschließender renderLog(). */ | "done";

export function nextPending(_visible: boolean, event: PendingEvent): boolean {
  switch (event) {
    case "ask":
    case "tool":
      return true;
    case "token":
    case "reasoning":
    case "done":
      return false;
  }
}
```

Der aktuelle Zustand geht bewusst nicht ein (`_visible`): jedes Ereignis bestimmt die Sichtbarkeit vollständig. Der Parameter bleibt in der Signatur, damit die Aufrufstelle wie ein Reduce liest und eine spätere Regel mit Gedächtnis nichts umbaut.

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npx vitest run tests/pending.test.ts`
Expected: PASS, 7 Tests.

- [ ] **Step 5: View anbinden**

In `src/obsidian/view.ts`:

```ts
private pendingEl: HTMLElement | null = null;
private pendingVisible = false;

/** Einzige Stelle, die die Warteanzeige zeichnet oder entfernt. */
private applyPending(event: PendingEvent): void {
  this.pendingVisible = nextPending(this.pendingVisible, event);
  if (this.pendingVisible) {
    if (this.pendingEl === null) {
      this.pendingEl = this.logEl.createDiv({ cls: "koda-msg koda-pending", text: t("view.working") });
    }
    this.logEl.scrollTo({ top: this.logEl.scrollHeight });
  } else {
    this.pendingEl?.remove();
    this.pendingEl = null;
  }
}

/** Vom Plugin gerufen, wenn ask() startet. */
askStarted(): void { this.applyPending("ask"); }
```

Aufrufe: `streamToken()` → `this.applyPending("token")` als erste Zeile; `streamReasoning()` → `this.applyPending("reasoning")`; `toolStep()` → `this.applyPending("tool")` **nach** `this.streamEl = null`; `renderLog()` → `this.applyPending("done")` direkt nach `this.logEl.empty()` (das `empty()` hat den Knoten bereits entfernt, der Aufruf setzt den Zustand und `pendingEl` konsistent zurück).

In `src/main.ts` ruft `ask()` unmittelbar nach `this.busy = true` den neuen Haken `askStarted()` auf der View auf — dort, wo die View schon für `streamToken` erreicht wird.

- [ ] **Step 6: String + CSS**

`src/i18n/strings.ts`: `"view.working"` → en `Working…`, de `Arbeitet…`.

`styles.css`:

```css
/* Warteanzeige zwischen Absenden und erstem Token — und erneut nach jeder Tool-Runde.
   Gedaempft: sie ist ein Lebenszeichen, keine Nachricht. */
.koda-pending { color: var(--text-muted); font-style: italic; }
```

- [ ] **Step 7: Gate + Commit**

```bash
npm run gate
git add src/core/chat/pending.ts tests/pending.test.ts src/obsidian/view.ts src/main.ts src/i18n/strings.ts styles.css
git commit -m "feat(view): Warteanzeige nach Absenden und nach jeder Tool-Runde"
```

---

### Task 6: Thinking-Default und Senden-Knopf

**Files:**
- Modify: `src/core/settings-types.ts` (Z. 39)
- Modify: `src/obsidian/view.ts`
- Test: `tests/settings_types.test.ts`

- [ ] **Step 1: Erwartung im Test umstellen**

In `tests/settings_types.test.ts` den Fall, der `suppressThinking` im Default prüft, auf `false` umstellen. Existiert kein solcher Fall, einen anlegen:

```ts
it("laesst Reasoning per Vorgabe sichtbar", () => {
  expect(mergeKodaSettings({}).suppressThinking).toBe(false);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/settings_types.test.ts`
Expected: FAIL — erhält `true`.

- [ ] **Step 3: Default drehen**

`src/core/settings-types.ts`, Z. 39: `suppressThinking: false`. Der Toggle in den Einstellungen bleibt unverändert.

Begründung als Kommentar an die Zeile: bei einem MoE-Modell wartet man sonst minutenlang vor einer Oberfläche, die tot aussieht; der ausklappbare Reasoning-Block existiert bereits.

- [ ] **Step 4: Senden-Knopf auf `mod-cta`**

In `src/obsidian/view.ts`, `onOpen()`: der Senden-Knopf bekommt Obsidians Akzentklasse, statt eine eigene Farbe zu tragen:

```ts
const sendBtn = buttons.createEl("button", { text: t("view.send"), cls: "mod-cta" });
sendBtn.addEventListener("click", () => this.send());
```

- [ ] **Step 5: Gate + Commit**

```bash
npm run gate
git add src/core/settings-types.ts src/obsidian/view.ts tests/settings_types.test.ts
git commit -m "feat(view): Reasoning per Vorgabe sichtbar, Senden-Knopf als mod-cta"
```

---

### Task 7: Smoke, Doku, Release 0.3.0

**Files:**
- Modify: `docs/SMOKE.md`
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md` (Status-Absatz)
- Modify: `docs/NEXT-SESSION.md` (erledigte Punkte streichen)

- [ ] **Step 1: Smoke-Punkte ergänzen**

In `docs/SMOKE.md` vier neue Punkte aufnehmen — sie prüfen, was kein Unit-Test erreicht:

1. Einstellungen öffnen bei **nicht laufendem** LM Studio: N parallele Timeouts — sieht die Liste kaputt aus oder nur ehrlich rot?
2. API-Schlüssel eintragen und Feld verlassen: Drittanbieter-Dreieck erscheint sofort, ohne Tab-Neuaufbau; leeren → verschwindet sofort.
3. Warteanzeige über eine echte Tool-Runde hinweg: erscheint beim Absenden, geht beim ersten Token, kommt nach dem Tool-Schritt zurück, ist am Ende weg.
4. Modell-Dropdown je Zeile: füllt sich beim Öffnen von selbst; „Modelle abrufen" wirkt; ein Endpunkt mit falschem Schlüssel zeigt **ohne Klick** rot (der 401-Fall vom 2026-08-07 — das ist der Anlass des ganzen Vorhabens).

Prüfe außerdem den bislang nie verifizierten Punkt 13 (`user-select: text` auf `.koda-log`) mit.

- [ ] **Step 2: Smoke fahren**

Johannes startet Obsidian mit `--remote-debugging-port=9222`; danach:

Run: `npm run smoke:gui`
Expected: alle automatisierten Punkte grün. Die manuellen Punkte aus Step 1 von Hand durchgehen und das Ergebnis mit Datum in `docs/SMOKE.md` notieren.

- [ ] **Step 3: Doku nachziehen**

`CHANGELOG.md` unter `## Unreleased`: Endpunkt-Zeile aus dem Kit (Modell-Liste je Zeile, Prüfung beim Öffnen, Rollen, Drittanbieter-Hinweis; Test-Knopf entfällt ersatzlos), Warteanzeige, Reasoning per Vorgabe sichtbar, Senden-Knopf als `mod-cta`.

`CLAUDE.md`: den Status-Absatz auf 0.3.0 und den erreichten Stand heben. In `docs/NEXT-SESSION.md` die erledigten Abschnitte („Endpunkt-UI angleichen", „Sidebar-UI angleichen") streichen.

Im Dach-Repo (`/Users/Shared/code/obsidian-plugins`): `REGISTRY.md` — Eintrag „Endpunkt-Zeilen-Editor" auf „im Kit (0.26.0), Consumer: vault-rag, koda-agent" setzen. `KIT-MATRIX.md` **nicht** anfassen (generiert).

- [ ] **Step 4: Release**

```bash
npm run gate
npm run release
```

`release.mjs` fährt seit dem 2026-08-08 das volle Gate vor Commit und Tag. Danach: `git ls-remote --tags github` prüfen — zeigt der Tag auf denselben Commit, läuft die Action bereits, und die Meldung „Store-Release entsteht erst nach manuellem Push" wäre falsch (nativer Forgejo-Push-Mirror, siehe Dach-`AGENTS.md`).

- [ ] **Step 5: Store-Rescan**

Nur Johannes: im Developer Dashboard auf `community.obsidian.md` den **Rescan** anstoßen und das Ergebnis nachsehen. Ohne diesen Schritt passiert am Store nichts.

---

## Definition of Done

- `npm run gate` grün, Testzahl ≥ 160 plus die neuen Fälle.
- Kein Treffer für `grep -rn "koda-endpoint-status\|showStatus" src styles.css`.
- Endpunkt-Zeile zeigt beim Öffnen ohne Klick Status **und** Modell-Liste; der 401-Fall ist sofort sichtbar.
- Warteanzeige über eine echte Tool-Runde geprüft.
- 0.3.0 veröffentlicht, Rescan angestoßen, Ergebnis notiert.
