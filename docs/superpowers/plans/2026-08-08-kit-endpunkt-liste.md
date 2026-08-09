# Kit-Extraktion: Endpunkt-Zeilen-Editor (Schritt 1 von 3 — obsidian-kit)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den Endpunkt-Zeilen-Editor aus `vault-rag/src/settings.ts` als sprachneutrale, erstmals unit-getestete Komponente nach `obsidian-kit` umziehen und als `obsidian-kit@0.26.0` veröffentlichen.

**Architecture:** Vier Module statt eines. Der 274-Zeilen-Block `buildEndpointList` ist eine private Methode des vault-rag-Settings-Tabs und hängt an vier Tab-internen Mechanismen: dem Modell-Listen-Cache (`modelLists` + `loadModelList` + `invalidateModelList` + `modelListGeneration`), dem Zeichner `renderModelPicker`, dem Tab-Neuaufbau `refreshUi()` und `plugin.saveSettings()`. Cache und Zeichner werden von vault-rag an **drei weiteren** Stellen genutzt (Embedding-Modell, Chat-Modell, Smart-Apply-Modell) und müssen deshalb eigenständig exportiert werden; Neuaufbau und Speichern werden zu Callbacks in `opts`. Dazu kommt `resolveModelChoice`, das heute in zwei divergenten Fassungen existiert — die Kit-Fassung wird die i18n-fähige aus koda-agent.

**Tech Stack:** TypeScript (ESM, kein Bundle), vitest, Kit-eigener Obsidian-Mock (`src/testing/obsidian-mock.ts`), eslint 9 / typescript-eslint.

**Arbeitsverzeichnis für ALLE Tasks dieses Plans:** `/Users/Shared/code/obsidian-plugins/obsidian-kit`
Die Spec liegt aus historischen Gründen im koda-agent-Repo: `/Users/Shared/code/obsidian-plugins/koda-agent/docs/superpowers/specs/2026-08-08-endpunkt-ui-kit-extraktion-design.md`.

## Global Constraints

- **Das Kit formuliert selbst nichts.** Keine benutzersichtbaren Klartext-Strings in neuem Kit-Code — jeder Text kommt über ein `strings`-Objekt aus `opts`. Grund: vault-rag ist einsprachig deutsch, koda-agent spricht DE/EN. (Spec § Architektur, Punkt 1.)
- **Kein Verhaltensumbau.** Der Umzug ändert die Logik nicht. Jede Verhaltensänderung an einem Consumer entsteht dadurch, dass er die Komponente *benutzt* — nicht dadurch, dass die Komponente umgebaut wird. (Spec § Architektur, Punkt 3.)
- **CSS-Präfix ist `okit-`**, wie bei `COLLAPSIBLE_CSS`. Alle `vault-rag-…`-Klassennamen verlieren den Plugin-Namen. Nur Theme-CSS-Variablen (`var(--text-muted)` etc.), nie feste Farben — `UI-STANDARD.md`.
- **Gate:** `npm run typecheck && npm test`. `npm test` fährt `check-no-abs-paths` + `check-no-nul-bytes` + `check:index-strict` + `lint` + `vitest run`. Beides muss vor jedem Commit grün sein.
- **Keine absoluten Maintainer-Pfade** in Code, Tests oder Doku — `check-no-abs-paths` bricht sonst, und genau dieser Fehler hat am 2026-08-08 ein Release getötet.
- **Zielversion:** `0.26.0` (minor, rein additiv). `KIT_VERSION` in `src/pure/index.ts` und `package.json` müssen übereinstimmen — `tests/kit-version.test.ts` prüft das.
- **Kit-Tests laufen gegen den Kit-eigenen Mock**, Import `from "../src/testing/obsidian-mock"`. Der Mock kennt `Setting`, `TextComponent`, `DropdownComponent`, `ButtonComponent`, `ExtraButtonComponent`, `Notice`, `setIcon`, `createSpan`/`createDiv`, `addClass`/`removeClass`/`toggleClass`, `setAttribute`. `setTooltip` existiert **als Methode auf den Komponenten** (No-Op), aber es gibt **keine freie `setTooltip`-Funktion** — Task 3 legt sie an.

---

### Task 1: `resolveModelChoice` ins Kit (pure)

Die pure Auswahl-Logik existiert zweimal: `vault-rag/src/model_choice.ts` (liefert fertige deutsche Hinweissätze) und `koda-agent/src/core/llm/model-choice.ts` (liefert `hintKey` + `suffix: "saved"`). Ins Kit wandert die **koda-agent-Fassung**, weil das Kit nicht formulieren darf. vault-rag übersetzt die Keys in Schritt 2 in seine bestehenden Sätze.

**Files:**
- Create: `src/pure/model-choice.ts`
- Create: `tests/model-choice.test.ts`
- Modify: `src/pure/index.ts` (Export-Block anhängen)
- Modify: `package.json` (Datei in `check:index-strict` aufnehmen)

**Interfaces:**
- Consumes: nichts.
- Produces:
  ```ts
  export type ModelChoiceMode = "dropdown" | "locked" | "freetext";
  export type ModelHintKey = "" | "unreachable" | "no-list";
  export interface ModelOption { value: string; label: string; suffix?: "saved" }
  export interface ModelChoice { mode: ModelChoiceMode; options: ModelOption[]; value: string; hintKey: ModelHintKey }
  export interface ModelChoiceInput { reachable: boolean; models: string[]; current: string }
  export function resolveModelChoice(input: ModelChoiceInput): ModelChoice
  ```

- [ ] **Step 1: Testdatei anlegen (kopieren statt neu erfinden)**

Kopiere `../koda-agent/tests/model_choice.test.ts` nach `tests/model-choice.test.ts` und ändere nur die Import-Zeile auf `from "../src/pure/model-choice"`. Die Datei enthält sechs Fälle:
`bietet die gemeldeten Modelle als Auswahl an` · `hält einen gespeicherten, aber nicht gelisteten Namen sichtbar` · `sichert die Invariante auch bei leerem Wert` · `sperrt die Auswahl bei nicht erreichbarem Endpunkt, behaelt aber den Wert` · `faellt auf Freitext zurueck, wenn der Endpunkt keine Liste herausgibt` · `gibt einen i18n-Schluessel statt eines fertigen Satzes zurueck`.

```bash
cp ../koda-agent/tests/model_choice.test.ts tests/model-choice.test.ts
```

Danach die Import-Zeile am Dateikopf von Hand auf `../src/pure/model-choice` setzen.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/model-choice.test.ts`
Expected: FAIL — `Failed to resolve import "../src/pure/model-choice"`.

- [ ] **Step 3: Modul anlegen**

Kopiere `../koda-agent/src/core/llm/model-choice.ts` nach `src/pure/model-choice.ts` — der Inhalt bleibt **byte-gleich ab der ersten `export`-Zeile**. Ersetze nur den Kopfkommentar durch:

```ts
/* Was das Modell-Feld zeigen soll — pure, entscheidet nur WAS, nie WIE.
 *
 * Herkunft: koda-agent/src/core/llm/model-choice.ts (2026-08-08), das seinerseits aus
 * vault-rag/src/model_choice.ts stammt. Von den beiden Fassungen wandert diese ins Kit:
 * sie gibt einen `hintKey` statt eines fertigen deutschen Satzes zurück und trägt
 * `suffix: "saved"` statt eines angehängten „(gespeichert)". Das Kit formuliert nicht —
 * jeder Consumer übersetzt die Schlüssel selbst. */
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npx vitest run tests/model-choice.test.ts`
Expected: PASS, 6 Tests.

- [ ] **Step 5: Exportieren und in den Strict-Check aufnehmen**

An `src/pure/index.ts` anhängen (vor der `KIT_VERSION`-Zeile):

```ts
export {
  type ModelChoiceMode, type ModelHintKey, type ModelOption,
  type ModelChoice, type ModelChoiceInput,
  resolveModelChoice,
} from "./model-choice";
```

In `package.json` das Skript `check:index-strict` um die neue Datei erweitern — die Liste endet heute auf `src/pure/settings.ts`, dahinter kommt ` src/pure/model-choice.ts`.

- [ ] **Step 6: Gate + Commit**

```bash
npm run typecheck && npm test
git add src/pure/model-choice.ts tests/model-choice.test.ts src/pure/index.ts package.json
git commit -m "feat(pure): resolveModelChoice mit i18n-Schluesseln ins Kit"
```

---

### Task 2: Modell-Listen-Cache (pure)

Der Cache ist heute Zustand des vault-rag-Tabs: eine `Map<string, Promise<…>>`, die `refreshUi()` bewusst überlebt, plus ein Generationszähler, mit dem verspätete Antworten verworfen werden. Er ist obsidian-frei und gehört deshalb nach `pure/`. Er wird als Instanz erzeugt (nicht als Modul-Singleton), weil jeder Settings-Tab seinen eigenen Cache-Lebenszyklus hat.

**Files:**
- Create: `src/pure/model-list-cache.ts`
- Create: `tests/model-list-cache.test.ts`
- Modify: `src/pure/index.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  ```ts
  export interface ModelListResult { models: string[]; reachable: boolean }
  export interface ModelListClient {
    listModels(): Promise<string[]>;
    probe(): Promise<{ reachable: boolean }>;
  }
  export interface ModelListCache {
    load(key: string, client: ModelListClient | undefined): Promise<ModelListResult>;
    invalidate(key: string): void;
    clear(): void;
    /** Erhöht die Generation und gibt den neuen Wert zurück. */
    bump(): number;
    /** Aktuelle Generation — Aufrufer vergleichen sie nach dem await. */
    generation(): number;
  }
  export function createModelListCache(): ModelListCache
  ```

- [ ] **Step 1: Failing test schreiben**

`tests/model-list-cache.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { createModelListCache } from "../src/pure/model-list-cache";

function client(models: string[], reachable = false) {
  return {
    listModels: vi.fn(() => Promise.resolve(models)),
    probe: vi.fn(() => Promise.resolve({ reachable })),
  };
}

describe("createModelListCache", () => {
  it("fragt denselben Schluessel nur einmal ab", async () => {
    const cache = createModelListCache();
    const c = client(["a"]);
    const [r1, r2] = await Promise.all([cache.load("k", c), cache.load("k", c)]);
    expect(r1).toEqual({ models: ["a"], reachable: true });
    expect(r2).toEqual({ models: ["a"], reachable: true });
    expect(c.listModels).toHaveBeenCalledTimes(1);
  });

  it("probt nur, wenn die Liste leer bleibt", async () => {
    const withList = client(["a"]);
    await createModelListCache().load("k", withList);
    expect(withList.probe).not.toHaveBeenCalled();

    const empty = client([], true);
    const r = await createModelListCache().load("k", empty);
    expect(empty.probe).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ models: [], reachable: true });
  });

  it("liefert offline, wenn kein Client da ist", async () => {
    expect(await createModelListCache().load("k", undefined))
      .toEqual({ models: [], reachable: false });
  });

  it("verwirft nach invalidate und fragt erneut", async () => {
    const cache = createModelListCache();
    const c = client(["a"]);
    await cache.load("k", c);
    cache.invalidate("k");
    await cache.load("k", c);
    expect(c.listModels).toHaveBeenCalledTimes(2);
  });

  it("reisst bei einem Fehlschlag nur den eigenen Eintrag mit", async () => {
    const cache = createModelListCache();
    const failing = {
      listModels: () => Promise.reject(new Error("boom")),
      probe: () => Promise.resolve({ reachable: false }),
    };
    const first = cache.load("k", failing);
    cache.invalidate("k");
    const good = client(["a"]);
    const second = cache.load("k", good);
    expect(await first).toEqual({ models: [], reachable: false });
    expect(await second).toEqual({ models: ["a"], reachable: true });
    // Der Fehlschlag darf den neueren Eintrag nicht aus dem Cache raeumen.
    await cache.load("k", good);
    expect(good.listModels).toHaveBeenCalledTimes(1);
  });

  it("zaehlt Generationen hoch", () => {
    const cache = createModelListCache();
    expect(cache.generation()).toBe(0);
    expect(cache.bump()).toBe(1);
    expect(cache.generation()).toBe(1);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/model-list-cache.test.ts`
Expected: FAIL — `Failed to resolve import "../src/pure/model-list-cache"`.

- [ ] **Step 3: Modul anlegen**

`src/pure/model-list-cache.ts` — die Logik ist die von `loadModelList`/`invalidateModelList` aus `vault-rag/src/settings.ts:236-278`, nur ohne `this`:

```ts
/* Modell-Listen je Endpunkt, mit Cache und Generationszähler.
 *
 * Herkunft: vault-rag/src/settings.ts (loadModelList/invalidateModelList/modelListGeneration,
 * 0.19.x). Obsidian-frei, deshalb pure/. Instanz statt Modul-Singleton: der Cache gehört zur
 * Lebensdauer eines Settings-Tabs, nicht zum Prozess. */

export interface ModelListResult {
  /** Vom Endpunkt gemeldete Modelle; leer = keine Liste erhalten. */
  models: string[];
  reachable: boolean;
}

/** Genau so viel, wie der Cache von einem Client braucht — bewusst nicht der volle
 *  Chat-/Embedding-Client-Typ eines Consumers. */
export interface ModelListClient {
  listModels(): Promise<string[]>;
  probe(): Promise<{ reachable: boolean }>;
}

export interface ModelListCache {
  load(key: string, client: ModelListClient | undefined): Promise<ModelListResult>;
  invalidate(key: string): void;
  clear(): void;
  bump(): number;
  generation(): number;
}

export function createModelListCache(): ModelListCache {
  /** Hält das PROMISE, nicht das Ergebnis: gleichzeitige Aufrufer warten damit auf dieselbe
   *  Anfrage, statt je einen HTTP-Request zu starten. Überlebt bewusst den Tab-Neuaufbau. */
  const lists = new Map<string, Promise<ModelListResult>>();
  let generation = 0;

  const load = (key: string, client: ModelListClient | undefined): Promise<ModelListResult> => {
    const cached = lists.get(key);
    if (cached) return cached;

    let promise: Promise<ModelListResult>;
    if (!client) {
      // Absicherung, kein Produktivpfad: ein Consumer ohne Client liefert einen
      // Offline-Zustand, statt zu werfen.
      promise = Promise.resolve({ models: [], reachable: false });
    } else {
      // Sparsam: eine nicht leere Liste beweist die Erreichbarkeit bereits — nur bei leerer
      // Liste wird zusätzlich geprobt, um „offline" von „gibt keine Liste heraus" zu trennen.
      promise = (async () => {
        const models = await client.listModels();
        const reachable = models.length > 0 ? true : (await client.probe()).reachable;
        return { models, reachable };
      })().catch(() => {
        // Nur den EIGENEN Eintrag verwerfen: lief zwischen Start und Fehlschlag bereits ein
        // invalidate + neues load, steht unter `key` schon ein neueres Promise — das darf
        // dieser Zweig nicht mitreißen.
        if (lists.get(key) === promise) lists.delete(key);
        return { models: [], reachable: false };
      });
    }

    lists.set(key, promise);
    return promise;
  };

  return {
    load,
    invalidate: (key: string): void => { lists.delete(key); },
    clear: (): void => { lists.clear(); },
    bump: (): number => ++generation,
    generation: (): number => generation,
  };
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `npx vitest run tests/model-list-cache.test.ts`
Expected: PASS, 6 Tests.

- [ ] **Step 5: Exportieren**

An `src/pure/index.ts` anhängen:

```ts
export {
  type ModelListResult, type ModelListClient, type ModelListCache,
  createModelListCache,
} from "./model-list-cache";
```

- [ ] **Step 6: Gate + Commit**

```bash
npm run typecheck && npm test
git add src/pure/model-list-cache.ts tests/model-list-cache.test.ts src/pure/index.ts
git commit -m "feat(pure): Modell-Listen-Cache mit Generationszaehler ins Kit"
```

---

### Task 3: Modell-Picker (obsidian) + `setTooltip` im Mock

`renderModelPicker` zeichnet eine `ModelChoice` in eine bestehende `Setting`-Zeile. Die Vorlage (`vault-rag/src/settings.ts:281-317`) baut ihre Texte selbst; die Kit-Fassung bekommt sie als Felder. Dieser Task legt außerdem die freie `setTooltip`-Funktion im Mock an, ohne die Task 4 nicht testbar ist.

**Files:**
- Create: `src/obsidian/model-picker.ts`
- Create: `tests/model-picker.test.ts`
- Modify: `src/obsidian/index.ts`
- Modify: `src/testing/obsidian-mock.ts` (freie `setTooltip`-Funktion ergänzen)

**Interfaces:**
- Consumes: `ModelChoice`, `ModelOption` aus Task 1.
- Produces:
  ```ts
  export interface ModelPickerOptions {
    setting: Setting;
    choice: ModelChoice;
    ariaLabel: string;
    placeholder: string;
    /** Fertig übersetzter Hinweis zum `hintKey`; "" = keiner. */
    hint: string;
    /** "desc" (Vorgabe) schreibt ihn unter die Zeile, "tooltip" hängt ihn an den Refresh-Knopf. */
    hintAs?: "desc" | "tooltip";
    /** Zusatz für Optionen mit `suffix: "saved"`, z.B. "(gespeichert)". */
    savedSuffix: string;
    /** Tooltip des Refresh-Knopfs, z.B. "Modelle abrufen". */
    refreshTooltip: string;
    onPick(value: string): void;
    onRefresh(): void;
    /** Zielelement statt `setting.controlEl` — nötig, wenn der Picker asynchron nach bereits
     *  gezeichneten Geschwistern in dieselbe Zeile soll. */
    target?: HTMLElement;
  }
  export function renderModelPicker(opts: ModelPickerOptions): void
  ```

- [ ] **Step 1: Freie `setTooltip`-Funktion im Mock ergänzen**

In `src/testing/obsidian-mock.ts` neben der bestehenden `setIcon`-Funktion (dort um Zeile 546) anlegen — gleiche Bauart, damit Tests den Text auslesen können:

```ts
export function setTooltip(el: any, tooltip: string): void {
  el.setAttribute?.("data-tooltip", tooltip);
}
```

Falls `createObsidianMock()` eine Export-Liste führt, `setTooltip` dort mit aufnehmen (analog zu `setIcon`).

- [ ] **Step 2: Failing test schreiben**

`tests/model-picker.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { Setting, DropdownComponent, TextComponent } from "../src/testing/obsidian-mock";
import { renderModelPicker } from "../src/obsidian/model-picker";
import type { ModelChoice } from "../src/pure/model-choice";

interface FakeNode { children?: FakeNode[]; __component?: unknown }

function nodes(root: unknown): FakeNode[] {
  const out: FakeNode[] = [];
  const walk = (n: FakeNode): void => { out.push(n); (n.children ?? []).forEach(walk); };
  walk(root as FakeNode);
  return out;
}

function componentsOf(setting: unknown): unknown[] {
  return nodes((setting as { controlEl: unknown }).controlEl)
    .map(n => n.__component).filter(c => c !== undefined);
}

function base(): { setting: Setting; onPick: ReturnType<typeof vi.fn>; onRefresh: ReturnType<typeof vi.fn> } {
  const containerEl = new Setting(undefined as never).settingEl;
  return { setting: new Setting(containerEl as never), onPick: vi.fn(), onRefresh: vi.fn() };
}

const dropdown: ModelChoice = {
  mode: "dropdown",
  options: [{ value: "a", label: "a" }, { value: "b", label: "b", suffix: "saved" }],
  value: "a",
  hintKey: "",
};

describe("renderModelPicker", () => {
  it("zeichnet ein Dropdown mit allen Optionen und haengt den Zusatz an", () => {
    const { setting, onPick, onRefresh } = base();
    renderModelPicker({
      setting, choice: dropdown, ariaLabel: "Modell", placeholder: "Modell",
      hint: "", savedSuffix: "(gespeichert)", refreshTooltip: "Modelle abrufen",
      onPick, onRefresh,
    });
    const dd = componentsOf(setting).find(c => c instanceof DropdownComponent) as DropdownComponent;
    expect(dd).toBeDefined();
    expect(dd.getValue()).toBe("a");
  });

  it("zeichnet Freitext im Modus freetext", () => {
    const { setting, onPick, onRefresh } = base();
    renderModelPicker({
      setting, choice: { mode: "freetext", options: [], value: "x", hintKey: "no-list" },
      ariaLabel: "Modell", placeholder: "Modell", hint: "Keine Liste",
      savedSuffix: "(gespeichert)", refreshTooltip: "Modelle abrufen", onPick, onRefresh,
    });
    expect(componentsOf(setting).some(c => c instanceof TextComponent)).toBe(true);
  });

  it("zeichnet den Refresh-Knopf in JEDEM Modus", () => {
    for (const choice of [dropdown, { ...dropdown, mode: "locked" as const }]) {
      const { setting, onPick, onRefresh } = base();
      renderModelPicker({
        setting, choice, ariaLabel: "Modell", placeholder: "Modell", hint: "",
        savedSuffix: "(gespeichert)", refreshTooltip: "Modelle abrufen", onPick, onRefresh,
      });
      expect(componentsOf(setting).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("meldet die Auswahl nur im Modus dropdown zurueck", () => {
    const { setting, onPick, onRefresh } = base();
    renderModelPicker({
      setting, choice: dropdown, ariaLabel: "Modell", placeholder: "Modell", hint: "",
      savedSuffix: "(gespeichert)", refreshTooltip: "Modelle abrufen", onPick, onRefresh,
    });
    const dd = componentsOf(setting).find(c => c instanceof DropdownComponent) as DropdownComponent;
    dd.setValue("b");
    expect(onPick).toHaveBeenCalledWith("b");
  });
});
```

Hinweis zum Mock: prüfe beim Schreiben, wie `DropdownComponent.setValue` im Kit-Mock den `onChange`-Rückruf auslöst (`src/testing/obsidian-mock.ts:191ff`) und wie `settings_walker.test.ts` Komponenten aus einer Zeile fischt — dort steht das etablierte Muster. Passe `componentsOf`/`base()` an das an, was der Mock tatsächlich anbietet, statt den Mock zu ändern.

- [ ] **Step 3: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/model-picker.test.ts`
Expected: FAIL — `Failed to resolve import "../src/obsidian/model-picker"`.

- [ ] **Step 4: Modul anlegen**

`src/obsidian/model-picker.ts` — Vorlage ist `vault-rag/src/settings.ts:281-317`, mit drei Änderungen: Texte aus `opts`, `choice.hint` wird zu `opts.hint`, `suffix: "saved"` wird beim Zeichnen zu `opts.savedSuffix` aufgelöst.

```ts
/* Zeichnet eine Modell-Auswahl in eine bestehende Setting-Zeile. Kennt die Regeln nicht —
 * die stehen in resolveModelChoice (pure/model-choice.ts).
 *
 * Herkunft: vault-rag/src/settings.ts (renderModelPicker, 0.19.x). Abweichung zur Vorlage:
 * alle Texte kommen aus `opts`, das Kit formuliert nicht. */
import { Setting } from "obsidian";
import type { ModelChoice } from "../pure/model-choice";

export interface ModelPickerOptions {
  setting: Setting;
  choice: ModelChoice;
  ariaLabel: string;
  placeholder: string;
  hint: string;
  hintAs?: "desc" | "tooltip";
  savedSuffix: string;
  refreshTooltip: string;
  onPick(value: string): void;
  onRefresh(): void;
  target?: HTMLElement;
}

export function renderModelPicker(opts: ModelPickerOptions): void {
  const { setting: s, choice, target } = opts;
  const hintAs = opts.hintAs ?? "desc";
  if (opts.hint && hintAs === "desc") s.setDesc(opts.hint);

  if (choice.mode === "freetext") {
    s.addText(t => {
      t.setPlaceholder(opts.placeholder).setValue(choice.value);
      t.inputEl.setAttribute("aria-label", opts.ariaLabel);
      t.inputEl.addEventListener("blur", () => { opts.onPick(t.getValue().trim()); });
      target?.appendChild(t.inputEl);
    });
  } else {
    s.addDropdown(d => {
      for (const o of choice.options) {
        d.addOption(o.value, o.suffix === "saved" ? `${o.label} ${opts.savedSuffix}` : o.label);
      }
      d.setValue(choice.value);
      d.selectEl.setAttribute("aria-label", opts.ariaLabel);
      if (choice.mode === "locked") d.setDisabled(true);
      else d.onChange((v: string) => { opts.onPick(v); });
      target?.appendChild(d.selectEl);
    });
  }

  // Der Refresh-Knopf zeichnet IMMER, in allen drei Modi — sonst lässt sich eine frisch
  // installierte Modell-Liste nicht auffrischen, ohne die Einstellungen neu zu öffnen. Er ist
  // außerdem der Träger des Hinweistexts bei hintAs "tooltip": als einziges Element ist er nie
  // disabled (anders als das <select> im Modus "locked"), ein Tooltip landet dort also
  // zuverlässig — deaktivierte Controls bekommen in Chromium keine Pointer-Events.
  s.addExtraButton(b => {
    const tooltip = opts.hint && hintAs === "tooltip"
      ? `${opts.hint} · ${opts.refreshTooltip}`
      : opts.refreshTooltip;
    b.setIcon("refresh-cw").setTooltip(tooltip).onClick(() => { opts.onRefresh(); });
    target?.appendChild(b.extraSettingsEl);
  });
}
```

- [ ] **Step 5: Test laufen lassen, Erfolg bestätigen**

Run: `npx vitest run tests/model-picker.test.ts`
Expected: PASS, 4 Tests.

- [ ] **Step 6: Exportieren**

An `src/obsidian/index.ts` anhängen:

```ts
export { renderModelPicker } from "./model-picker";
export type { ModelPickerOptions } from "./model-picker";
```

- [ ] **Step 7: Gate + Commit**

```bash
npm run typecheck && npm test
git add src/obsidian/model-picker.ts tests/model-picker.test.ts src/obsidian/index.ts src/testing/obsidian-mock.ts
git commit -m "feat(obsidian): Modell-Picker ins Kit, setTooltip im Mock"
```

---

### Task 4: Endpunkt-Zeilen-Editor (obsidian)

Das Kernstück. Vorlage ist `vault-rag/src/settings.ts:833-1106` (274 Zeilen, `buildEndpointList`). Der Block ist heute **ungetestet** — in `vault-rag/tests/` gibt es keinen Test, der ihn berührt. Dieser Task ist deshalb nicht nur ein Umzug, sondern die erste Absicherung, und genau die braucht Schritt 2 als Netz.

**Files:**
- Create: `src/obsidian/endpoint-list.ts`
- Create: `tests/endpoint-list.test.ts`
- Modify: `src/obsidian/index.ts`

**Interfaces:**
- Consumes: `resolveModelChoice`, `ModelHintKey` (Task 1); `ModelListCache`, `ModelListClient` (Task 2); `renderModelPicker` (Task 3); aus `../pure/endpoint_config`: `EndpointConfig`, `applyEndpointEdit`, `moveEndpointToFront`, `carriesApiKey`, `endpointRole`, `EndpointRole`; aus `../pure/endpoint_diagnostics`: `EndpointStatus`, `EndpointPreset`, `ENDPOINT_PRESETS`, `validateEndpointInput`, `EndpointWarning`; aus `../pure/endpoint`: `normalizeEndpoint`.
- Produces:
  ```ts
  export interface EndpointListStrings {
    addPlaceholder: string;
    apiKeyPlaceholder: string;
    modelPlaceholder: string;
    ariaUrl: string;
    ariaAdd: string;
    ariaApiKey(url: string): string;
    ariaModel(url: string): string;
    emptyModelLabel(globalModel: string): string;
    modelHint(key: ModelHintKey): string;
    savedSuffix: string;
    refreshModels: string;
    moveToFront: string;
    remove: string;
    thirdParty: string;
    probing: string;
    statusTooltip(status: EndpointStatus): string;
    role(role: EndpointRole): string;
    warnings(warnings: EndpointWarning[]): string;
    presetTooltip(preset: EndpointPreset): string;
    presetLabel(preset: EndpointPreset): string;
    checkConnection: string;
    saveFailed: string;
  }
  export interface EndpointListOptions {
    containerEl: HTMLElement;
    label: string;
    desc: string;
    placeholder: string;
    strings: EndpointListStrings;
    cache: ModelListCache;
    get(): EndpointConfig[];
    set(eps: EndpointConfig[]): void;
    active(): string | null;
    clientFor(cfg: EndpointConfig): ModelListClient & { probe(): Promise<EndpointStatus> };
    globalModel(): string;
    modelFits?(cfg: EndpointConfig): boolean;
    save(): Promise<void>;
    reconnect(): Promise<void>;
    rerender(): void;
    presets?: readonly EndpointPreset[];
  }
  export function buildEndpointList(opts: EndpointListOptions): void
  export const ENDPOINT_LIST_CSS: string
  ```

- [ ] **Step 1: Failing test schreiben**

`tests/endpoint-list.test.ts` — vier Fälle, die genau die Invarianten festhalten, die der Umzug nicht verlieren darf:

```ts
import { describe, it, expect, vi } from "vitest";
import { Setting, TextComponent, setIcon } from "../src/testing/obsidian-mock";
import { buildEndpointList } from "../src/obsidian/endpoint-list";
import { createModelListCache } from "../src/pure/model-list-cache";
import type { EndpointConfig } from "../src/pure/endpoint_config";
import type { EndpointStatus } from "../src/pure/endpoint_diagnostics";

const OK: EndpointStatus = { reachable: true, kind: "ok", klartext: "ok" };

function strings() {
  return {
    addPlaceholder: "add", apiKeyPlaceholder: "key", modelPlaceholder: "model",
    ariaUrl: "url", ariaAdd: "aria-add",
    ariaApiKey: (u: string) => `key ${u}`, ariaModel: (u: string) => `model ${u}`,
    emptyModelLabel: (g: string) => `global (${g})`,
    modelHint: () => "", savedSuffix: "(saved)", refreshModels: "refresh",
    moveToFront: "top", remove: "remove", thirdParty: "third-party", probing: "probing",
    statusTooltip: (s: EndpointStatus) => s.klartext,
    role: () => "aktiv", warnings: () => "warn",
    presetTooltip: () => "preset", presetLabel: () => "preset",
    checkConnection: "check", saveFailed: "save failed",
  };
}

function harness(eps: EndpointConfig[]) {
  let stored = eps;
  const containerEl = new Setting(undefined as never).settingEl;
  const save = vi.fn(() => Promise.resolve());
  const reconnect = vi.fn(() => Promise.resolve());
  const rerender = vi.fn();
  const opts = {
    containerEl: containerEl as never,
    label: "Endpunkte", desc: "desc", placeholder: "http://…",
    strings: strings(), cache: createModelListCache(),
    get: () => stored,
    set: (next: EndpointConfig[]) => { stored = next; },
    active: () => stored[0]?.url ?? null,
    clientFor: () => ({
      listModels: () => Promise.resolve(["m1"]),
      probe: () => Promise.resolve(OK),
    }),
    globalModel: () => "g",
    save, reconnect, rerender,
  };
  return { opts, containerEl, save, reconnect, rerender, current: () => stored };
}

function textInputs(root: unknown): TextComponent[] {
  const out: TextComponent[] = [];
  const walk = (n: { children?: unknown[]; __component?: unknown }): void => {
    if (n.__component instanceof TextComponent) out.push(n.__component);
    (n.children ?? []).forEach(c => walk(c as never));
  };
  walk(root as never);
  return out;
}

describe("buildEndpointList", () => {
  it("zeichnet eine Adder-Zeile hinter den bestehenden Eintraegen", () => {
    const h = harness([{ url: "http://a" }]);
    buildEndpointList(h.opts as never);
    // 1 Label-Zeile + 1 Eintrag + 1 Adder + 1 Aktionszeile
    expect((h.containerEl as { children: unknown[] }).children.length).toBe(4);
  });

  it("committet erst bei blur, nicht pro Tastendruck", () => {
    const h = harness([{ url: "http://a" }]);
    buildEndpointList(h.opts as never);
    const url = textInputs(h.containerEl)[1];      // [0] ist das URL-Feld der Label-Zeile? -> beim
    expect(url).toBeDefined();                      // Schreiben gegen den echten Mock verifizieren
    expect(h.save).not.toHaveBeenCalled();
  });

  it("sperrt die Zeilen bei einer Listen-Mutation und setzt aria-busy", async () => {
    const h = harness([{ url: "http://a" }, { url: "http://b" }]);
    buildEndpointList(h.opts as never);
    // „zuerst verwenden" an Zeile 2 ausloesen (ExtraButton mit Icon arrow-up-to-line)
    // -> danach: aria-busy="true", save + reconnect + rerender in dieser Reihenfolge.
    // Den Knopf ueber das Mock-Setting finden (siehe settings_walker.test.ts fuer das Muster).
    expect(typeof h.rerender).toBe("function");
  });

  it("laesst die UI nach einem gescheiterten Speichern nicht verriegelt zurueck", async () => {
    const h = harness([{ url: "http://a" }, { url: "http://b" }]);
    h.opts.save = vi.fn(() => Promise.reject(new Error("nope"))) as never;
    buildEndpointList(h.opts as never);
    // Nach dem Fehlschlag: aria-busy zurueck auf "false", rerender() gerufen (failSafe).
    expect(h.opts.containerEl).toBeDefined();
  });
});
```

**Wichtig für den Implementierer:** Die letzten drei Fälle sind bewusst als Gerüst mit klarer Absicht notiert — wie man im Kit-Mock an einen `ExtraButton` und an `blur` herankommt, steht in `tests/settings_walker.test.ts` und `tests/confirm.test.ts`. Führe die Fälle zu Ende, bevor du das Modul schreibst; ein Test, der nur `toBeDefined()` prüft, zählt nicht als erfüllt. Die vier Invarianten, die am Ende belegt sein müssen:
1. Adder-Zeile existiert zusätzlich zu den Einträgen.
2. Kein `save()` ohne `blur` (Tastendruck allein committet nicht).
3. Listen-Mutation → `aria-busy="true"` + `save` → `reconnect` → `rerender` in dieser Reihenfolge.
4. Gescheiterte Kette → `aria-busy="false"`, `Notice` mit `strings.saveFailed`, `rerender()`.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/endpoint-list.test.ts`
Expected: FAIL — `Failed to resolve import "../src/obsidian/endpoint-list"`.

- [ ] **Step 3: Modul anlegen — Umzug, kein Neuschrieb**

Kopiere `vault-rag/src/settings.ts:833-1106` als Rumpf von `buildEndpointList` nach `src/obsidian/endpoint-list.ts` und wende **genau diese Ersetzungen** an. Nichts darüber hinaus ändern — kein Umbenennen von Variablen, keine „Verbesserungen".

| In der Vorlage | Im Kit |
|---|---|
| `this.modelListGeneration++` | `opts.cache.bump()` |
| `this.modelListGeneration` (Vergleich) | `opts.cache.generation()` |
| `this.loadModelList(key, client)` | `opts.cache.load(key, client)` |
| `this.invalidateModelList(key)` | `opts.cache.invalidate(key)` |
| `this.renderModelPicker({…})` | `renderModelPicker({…})` (Import aus `./model-picker`) |
| `this.refreshUi()` | `opts.rerender()` |
| `this.plugin.saveSettings()` | `opts.save()` |
| `ENDPOINT_PRESETS` (fest) | `opts.presets ?? ENDPOINT_PRESETS` |
| `t("settings.endpointSaveFailed")` | `opts.strings.saveFailed` |
| `"Weiteren Endpunkt hinzufügen…"` | `opts.strings.addPlaceholder` |
| `t("settings.endpointRow.ariaAdd", opts.label)` | `opts.strings.ariaAdd` |
| `` `${opts.label}: URL` `` | `opts.strings.ariaUrl` |
| `"API-Schlüssel (leer = lokaler Server)"` | `opts.strings.apiKeyPlaceholder` |
| `` `API-Schlüssel für ${cfg.url} …` `` | `opts.strings.ariaApiKey(cfg.url)` |
| `` `Modell für ${cfg.url} …` `` | `opts.strings.ariaModel(cfg.url)` |
| `"Modell (leer = globales)"` | `opts.strings.modelPlaceholder` |
| `` `globales Modell (${opts.globalModel() \|\| "nicht gesetzt"})` `` | `opts.strings.emptyModelLabel(opts.globalModel())` |
| `"Endpunkt mit Schlüssel — …"` (Tooltip) | `opts.strings.thirdParty` |
| `"prüfe…"` (Icon-Tooltip **und** `stateEl`-Text) | `opts.strings.probing` |
| `status.klartext` | `opts.strings.statusTooltip(status)` |
| `describeEndpointRole(role)` | `opts.strings.role(role)` |
| `warnings.map(w => w.message).join(" · ")` | `opts.strings.warnings(warnings)` |
| `"Zuerst verwenden — …"` | `opts.strings.moveToFront` |
| `"Endpunkt entfernen"` | `opts.strings.remove` |
| `` `+ ${preset.label}` `` | `opts.strings.presetLabel(preset)` |
| `` `${preset.url} hinzufügen` `` | `opts.strings.presetTooltip(preset)` |
| `"Verbindung prüfen"` | `opts.strings.checkConnection` |
| `vault-rag-ep-busy` | `okit-ep-busy` |
| `vault-rag-ep-row` | `okit-ep-row` |
| `vault-rag-ep-status` | `okit-ep-status` |
| `vault-rag-ep-state` | `okit-ep-state` |
| `vault-rag-ep-warn` | `okit-ep-warn` |
| `vault-rag-ep-thirdparty` | `okit-ep-thirdparty` |
| `vault-rag-model-slot` | `okit-model-slot` |

Zwei Stellen brauchen mehr als eine Ersetzung:

1. **Der Aufruf von `resolveModelChoice`** verliert `allowEmpty`/`emptyLabel` (die Kit-Fassung aus Task 1 kennt beide nicht). Die Leer-Option entsteht dort automatisch, wenn `current === ""`; ihr Label `"—"` wird beim Zeichnen durch `opts.strings.emptyModelLabel(opts.globalModel())` ersetzt. Der Aufruf lautet danach:
   ```ts
   const choice = resolveModelChoice({ reachable, models, current: cfg.model ?? "" });
   const labelled = {
     ...choice,
     options: choice.options.map(o =>
       o.value === "" ? { ...o, label: opts.strings.emptyModelLabel(opts.globalModel()) } : o),
   };
   ```
   und `labelled` geht an `renderModelPicker`.

2. **Der Hinweistext** kommt jetzt aus dem Consumer: `hint: opts.strings.modelHint(choice.hintKey)`, dazu unverändert `hintAs: "tooltip"`, `savedSuffix: opts.strings.savedSuffix`, `refreshTooltip: opts.strings.refreshModels`.

Der Kopfkommentar der Datei:

```ts
/* Geordneter Endpunkt-Fallback-Listen-Editor: eine Setting-Zeile je Endpunkt (URL ·
 * Schlüssel · Modell-Override · „zuerst verwenden" · entfernen) plus Adder-Zeile,
 * Status-Icon, Rollenzeile, Drittanbieter-Hinweis und Preset-Knöpfe.
 *
 * Herkunft: vault-rag/src/settings.ts (buildEndpointList, 0.19.x, 274 Zeilen, zwei
 * Aufrufstellen: Chat + Embedding). Umzug ohne Verhaltensänderung. Abweichungen zur
 * Vorlage: alle Texte kommen über `strings` aus `opts` (das Kit formuliert nicht),
 * Modell-Cache und Tab-Neuaufbau sind Callbacks statt Tab-Zustand, CSS-Präfix `okit-`. */
```

Am Ende der Datei die CSS-Konstante — Regeln aus `vault-rag/styles.css:35-67` und `:298-326`, Präfixe ersetzt, Kommentare mitgenommen:

```ts
/** Regeln der Endpunkt-Zeile. Consumer hängen sie in ihre styles.css (kein CSS-Import im
 *  Plugin-Bundle) — dasselbe Muster wie COLLAPSIBLE_CSS. */
export const ENDPOINT_LIST_CSS = `
.okit-ep-status { display: inline-flex; align-items: center; margin-right: 8px; vertical-align: middle; color: var(--text-muted); }
.okit-ep-status svg { width: 14px; height: 14px; }
.okit-ep-status.is-ok { color: var(--text-success); }
.okit-ep-status.is-error { color: var(--text-error); }
.okit-ep-warn { display: inline-flex; align-items: center; margin-right: 8px; vertical-align: middle; color: var(--text-warning); }
.okit-ep-warn svg { width: 14px; height: 14px; }
/* Drittanbieter-Hinweis (Schlüssel gesetzt): sachlicher Hinweis, keine Fehler-Warnung —
   bewusst gedämpfter als .okit-ep-warn, Bedeutung trägt das Dreieck + der Tooltip. */
.okit-ep-thirdparty { display: inline-flex; align-items: center; margin-right: 8px; vertical-align: middle; color: var(--text-muted); }
.okit-ep-thirdparty svg { width: 14px; height: 14px; }
/* Rolle der Zeile als Text unter den Feldern. Erreichbarkeit trägt das Icon (Form), die Rolle
   dieser Text — keins von beiden über Farbe allein (WCAG 1.4.1). flex-basis 100% erzwingt den
   Umbruch im ohnehin umbrechenden .setting-item-control; order:1 hält die Rolle visuell zuletzt. */
.okit-ep-row .setting-item-control .okit-ep-state { flex: 0 0 100%; order: 1; font-size: var(--font-ui-smaller); color: var(--text-muted); }
.okit-ep-row .setting-item-control .okit-ep-state.is-active { color: var(--text-normal); font-weight: var(--font-bold); }
/* Speicher-/Lösch-Fenster: die gerenderten Zeilen-Indizes sind stale, bis der Re-Render kommt. */
.okit-ep-busy { pointer-events: none; opacity: 0.6; }
.okit-ep-row .setting-item-info { display: none; }
.okit-ep-row .setting-item-control { flex-wrap: wrap; justify-content: flex-start; gap: var(--size-4-2); width: 100%; }
.okit-ep-row .setting-item-control input[type="text"],
.okit-ep-row .setting-item-control input[type="password"] { flex: 1 1 12em; min-width: 8em; }
/* Reservierter Platz für das Modell-Dropdown (füllt sich erst nach dem geladenen Promise). */
.okit-ep-row .setting-item-control .okit-model-slot { display: flex; align-items: center; gap: var(--size-4-1); flex: 1 1 12em; min-width: 10em; }
.okit-ep-row .setting-item-control .okit-model-slot select,
.okit-ep-row .setting-item-control .okit-model-slot input[type="text"] { flex: 1 1 auto; min-width: 0; }
`;
```

Prüfe beim Kopieren die exakten Zeilen 56-64 von `vault-rag/styles.css` (`font-size`/`color` der `-state`-Regel) und übernimm sie wörtlich, falls sie von der Fassung oben abweichen.

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `npx vitest run tests/endpoint-list.test.ts`
Expected: PASS, 4 Tests — alle vier Invarianten aus Step 1 belegt, keine `toBeDefined()`-Platzhalter mehr.

- [ ] **Step 5: Exportieren**

An `src/obsidian/index.ts` anhängen:

```ts
export { buildEndpointList, ENDPOINT_LIST_CSS } from "./endpoint-list";
export type { EndpointListOptions, EndpointListStrings } from "./endpoint-list";
```

**Notiz für die Consumer-Schritte (2 und 3), hier nur zur Kenntnis:** `endpoint-list.ts` und `model-picker.ts` sind die **ersten** Kit-Module unter `obsidian/`, die über die Schichtgrenze nach `../pure/…` importieren. Alle bisherigen (`clock`, `confirm`, `folder-suggest`, `settings_walker`) kommen ohne aus — deshalb konnten Consumer bisher byte-verbatim vendoren. Ab 0.26.0 muss beim Vendoring `from "../pure/` auf den jeweiligen Vendor-Pfad umgeschrieben werden. Das ist im Kit **kein** Problem und soll hier nicht umgangen werden (etwa durch Verschieben der puren Module nach `obsidian/`): die Schichtentrennung ist wertvoller als ein Vendor-Skript ohne `sed`.

- [ ] **Step 6: Gate + Commit**

```bash
npm run typecheck && npm test
git add src/obsidian/endpoint-list.ts tests/endpoint-list.test.ts src/obsidian/index.ts
git commit -m "feat(obsidian): Endpunkt-Zeilen-Editor ins Kit (Umzug aus vault-rag)"
```

---

### Task 5: Version 0.26.0, Doku, Tag

**Files:**
- Modify: `package.json` (`version`)
- Modify: `src/pure/index.ts` (`KIT_VERSION`)
- Modify: `README.md` (Modul-Liste)
- Modify: `MIGRATION.md` (Abschnitt 0.26.0)

**Interfaces:**
- Consumes: alles aus Tasks 1–4.
- Produces: git-Tag `v0.26.0`, auf den die Schritte 2 und 3 (vault-rag, koda-agent) vendoren.

- [ ] **Step 1: Version anheben**

`package.json`: `"version": "0.26.0"`. `src/pure/index.ts`: `export const KIT_VERSION = "0.26.0";`.

- [ ] **Step 2: Versions-Test laufen lassen**

Run: `npx vitest run tests/kit-version.test.ts`
Expected: PASS — der Test vergleicht `KIT_VERSION` mit `package.json`.

- [ ] **Step 3: README + MIGRATION nachziehen**

In `README.md` die vier neuen Module in die bestehende Modul-Liste eintragen, im Stil der vorhandenen Einträge:

- `pure/model-choice` — was ein Modell-Feld zeigen soll (Dropdown / Freitext / gesperrt), i18n-Schlüssel statt Sätzen
- `pure/model-list-cache` — Modell-Listen je Endpunkt, ein Request pro Schlüssel, Generationszähler gegen verspätete Antworten
- `obsidian/model-picker` — zeichnet eine `ModelChoice` in eine `Setting`-Zeile, inkl. „Modelle abrufen"
- `obsidian/endpoint-list` — kompletter Endpunkt-Zeilen-Editor mit Status, Rollen, Presets (`ENDPOINT_LIST_CSS` nicht vergessen)

In `MIGRATION.md` einen Abschnitt `## 0.26.0` anlegen mit: additiv, keine Breaking Changes; Consumer, die den Endpunkt-Block bisher selbst hielten (vault-rag, koda-agent), ersetzen ihn durch `buildEndpointList`; das `strings`-Objekt ist Pflicht, weil das Kit nicht formuliert; `ENDPOINT_LIST_CSS` muss in die `styles.css` des Consumers.

- [ ] **Step 4: Volles Gate**

Run: `npm run typecheck && npm test`
Expected: alles grün. Falls `check-no-abs-paths` anschlägt: die Fundstelle ist ein absoluter Maintainer-Pfad in einer der neuen Dateien — relativ machen, nicht das Skript aufweichen.

- [ ] **Step 5: Commit + Tag**

```bash
git add package.json src/pure/index.ts README.md MIGRATION.md
git commit -m "chore(release): 0.26.0 — Endpunkt-Zeilen-Editor, Modell-Picker, Modell-Cache"
git tag v0.26.0
git push && git push --tags
```

Prüfe vor dem Push mit `git remote -v`, welche Remotes gesetzt sind, und pushe an alle konfigurierten (Forgejo = `origin`, ggf. `github`).

---

## Danach

Schritt 2 ist `docs/superpowers/plans/2026-08-08-vault-rag-endpunkt-umstellung.md` (im koda-agent-Repo). vault-rag steht vor koda-agent, weil dort die zwei erprobten Aufrufstellen liegen: bricht der Umzug etwas, zeigt es sich an der Referenz statt am Neuling.

Zwei Nachträge gehören ins Dach-Repo, sobald dieser Plan durch ist:
- `REGISTRY.md`: Eintrag „Endpunkt-Zeilen-Editor" von `Kit-Kandidat` auf „im Kit (0.26.0)" umstellen.
- `KIT-MATRIX.md` **nicht** von Hand anfassen — die Datei wird generiert.
