/**
 * GUI-Smoke-Treiber — prueft die Naht zum Host gegen ein **laufendes** Obsidian statt
 * von Hand (CORE-TEST-02 b).
 *
 * CDP-Bruecke (Klasse `Cdp`, `waitFor`, `record`) uebernommen aus
 * `3d-codeblocks/scripts/gui-smoke.ts`, 2026-08-07 — dort erkauft mit den Details, die
 * unten in den Kommentaren stehen (Fokus-Drosselung, Vault-Wahl, Renderer-Ausnahmen).
 *
 * ## Warum es diesen Treiber gibt
 *
 * Am 2026-08-06 fror ein Klick auf „Testen“ in der Endpunkt-Zeile Obsidian 1.13.5 ein
 * (100 % CPU, beide Fenster tot). Als Ursache wurde `ButtonComponent.setDisabled()`
 * bestimmt, aufgerufen aus dem eigenen Settings-Fenster. Das Gate war zu diesem Zeitpunkt
 * **113/113 gruen** — kein Unit-Test kann diese Schicht sehen, weil es die Schicht des
 * Hosts ist. Pruefpunkt 3 ist genau dieser Klick: er misst nicht „wurde die Funktion
 * gerufen“, sondern ob der Renderer danach **noch antwortet**.
 *
 * ⚠️ **Beweisstand von Pruefpunkt 3, ehrlich:** Er ist NICHT durch eine Gegenprobe
 * validiert. Am 2026-08-07 wurde der Fix testweise ausgebaut (`setDisabled()` zurueck),
 * deployt und das Plugin neu geladen — der Freeze trat **nicht** wieder auf, weder mit
 * synthetischem noch mit echtem Mausklick, weder gegen einen erreichbaren noch gegen einen
 * toten Endpunkt. Obsidian-Version, Vault und Endpunkt waren dieselben; anders waren nur
 * die frisch gestartete App und das per `disablePlugin/enablePlugin` neu geladene Plugin.
 * Der Pruefpunkt bleibt drin, weil er billig ist und einen haengenden Renderer als
 * Zeitueberschreitung sehen wuerde — aber er hat noch nie rot geleuchtet, und was nie rot
 * war, ist unbewiesen. Wer den Freeze erneut sieht: die Bedingungen hier nachtragen.
 * Die Klaerung ist am 2026-08-07 bewusst **geparkt** worden (Entscheidung Johannes,
 * TaskNote `Freeze-Gegenprobe klaeren` im Cockpit): nicht aktiv weiterjagen, sondern beim
 * naechsten Smoke mitbeobachten — erst ein erneutes Auftreten holt sie zurueck.
 * Gegenprobe-validiert ist dagegen Pruefpunkt 6 (Handler ausgebaut → genau dieser Punkt rot).
 *
 * ## Was er bewusst NICHT prueft
 *
 * Nichts, was eine echte Modell-Antwort braucht. Gemessen am 2026-08-07 ist
 * `qwen/qwen3.6-27b` ueber einem grossen Vault **>90 s stumm**, bevor das erste Token
 * kommt — ein Pruefpunkt darauf waere langsam und nicht deterministisch. Die Faelle unten
 * kommen alle ohne Modell aus; der Failover-Fall (5) ist deshalb so wertvoll: er scheitert
 * am Resolver, lange bevor ein Modell gefragt wuerde.
 *
 * Ebenfalls nicht geprueft: das Bestaetigungs-Modal beim Schreiben ausserhalb des
 * Koda-Ordners. `VaultTools` wird in `ask()` lokal erzeugt und ist am Plugin nicht
 * exponiert — der Pruefpunkt braeuchte eine Produktionscode-Aenderung allein zur
 * Testbarkeit. Bleibt Handarbeit (`docs/SMOKE.md` Punkt 5).
 *
 * ## Voraussetzung
 *
 * ```bash
 * osascript -e 'quit app "Obsidian"'
 * open -a Obsidian --args --remote-debugging-port=9222
 * ```
 *
 * Dann mit deployter Plugin-Version:
 *
 * ```bash
 * npm run smoke:gui -- --vault <vault-name>
 * ```
 */

import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const PLUGIN_ID = "koda-agent";
const VIEW_TYPE = "koda-agent-view";
/** Garantiert tote Ports fuer die Fehlerfaelle — nichts hoert dort, und ein Tippfehler
 *  im Test darf nie versehentlich einen echten Endpunkt treffen. */
const DEAD_A = "http://127.0.0.1:9999";
const DEAD_B = "http://127.0.0.1:9998";

// --- CDP-Minimalbrücke ------------------------------------------------------
// Node ≥21 bringt `WebSocket` global mit — keine Dependency nötig.

interface CdpTarget {
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

interface CdpResponse {
  id?: number;
  result?: { result?: { value?: unknown }; exceptionDetails?: { text?: string } };
  error?: { message?: string };
}

class Cdp {
  private nextId = 1;
  private readonly pending = new Map<number, { ok: (v: CdpResponse) => void; fail: (e: Error) => void }>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as CdpResponse;
      if (message.id === undefined) return; // Event, kein Antwort-Frame
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.fail(new Error(message.error.message ?? "CDP-Fehler"));
      else waiter.ok(message);
    });
  }

  static async attach(port: number, vault?: string): Promise<Cdp> {
    return Cdp.attachTo(port, vault, "main");
  }

  /** Das Einstellungsfenster ist seit Obsidian 1.13 ein **eigenes** Fenster (`about:blank`),
   *  kein Modal im Haupt-DOM. Wer dort einen Knopf sucht, findet im Hauptfenster nichts und
   *  liest das als „Feature fehlt“ statt als „falscher Renderer“ (gemessen 2026-08-07).
   *  Vorher muss im Hauptfenster `app.setting.open()` gelaufen sein — vorher existiert das
   *  Target nicht. */
  static async attachSettings(port: number, vault?: string): Promise<Cdp> {
    return Cdp.attachTo(port, vault, "settings");
  }

  private static async attachTo(port: number, vault: string | undefined, which: "main" | "settings"): Promise<Cdp> {
    let targets: CdpTarget[];
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      targets = (await response.json()) as CdpTarget[];
    } catch {
      throw new Error(
        `Kein Debug-Port auf ${port}. Obsidian mit --remote-debugging-port=${port} neu starten ` +
          `(siehe Kopfkommentar).`,
      );
    }

    // Das Hauptfenster ist die Seite mit Obsidians app-Schema; Popouts und DevTools
    // tragen andere URLs. Ohne diese Auswahl landet man im falschen Renderer.
    // Das Einstellungsfenster traegt `about:blank` — es wird ueber den Titel erkannt,
    // der wie beim Hauptfenster den Vault-Namen fuehrt.
    const pages = targets.filter(
      (t) =>
        t.type === "page" &&
        t.webSocketDebuggerUrl !== undefined &&
        (which === "main" ? t.url.startsWith("app://obsidian.md") : t.url === "about:blank"),
    );
    if (pages.length === 0) {
      const seen = targets.map((t) => `${t.type} ${t.url}`).join("\n  ") || "(keine)";
      throw new Error(
        which === "settings"
          ? `Kein Einstellungsfenster unter den Targets — im Hauptfenster erst \`app.setting.open()\`:\n  ${seen}`
          : `Kein Obsidian-Fenster unter den Targets gefunden:\n  ${seen}\n` +
            `Laeuft Obsidian ohne offenes Fenster, ist der Renderer tot — App beenden und neu starten.`,
      );
    }

    // Mehrere offene Vaults sind der Normalfall, nicht die Ausnahme. Blind das erste
    // Fenster zu nehmen hiesse, den Smoke im falschen Vault zu fahren — und der
    // Fehlschlag saehe aus wie ein Plugin-Defekt ("Plugin nicht aktiv"). Der Titel
    // traegt den Vault-Namen ("<Notiz> - <Vault> - Obsidian x.y.z").
    const matching = vault
      ? pages.filter((t) => t.title.toLowerCase().includes(vault.toLowerCase()))
      : pages;
    if (matching.length === 0) {
      throw new Error(
        `Kein Fenster passt zu --vault ${vault}. Offen:\n  ${pages.map((t) => t.title).join("\n  ")}`,
      );
    }
    if (matching.length > 1) {
      throw new Error(
        `Mehrere Obsidian-Fenster offen — mit --vault <name> eines waehlen:\n  ` +
          matching.map((t) => t.title).join("\n  "),
      );
    }
    const page = matching[0];
    // Der Filter oben garantiert die URL, der Typ nicht — der Guard haelt beides zusammen.
    if (!page.webSocketDebuggerUrl) throw new Error(`Fenster ohne Debugger-URL: ${page.title}`);
    console.log(`Fenster: ${page.title}`);

    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("WebSocket-Verbindung fehlgeschlagen")), {
        once: true,
      });
    });
    return new Cdp(socket);
  }

  send(method: string, params: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<CdpResponse> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, fail) => {
      this.pending.set(id, { ok, fail });
      setTimeout(() => {
        if (!this.pending.delete(id)) return;
        fail(new Error(`Zeitüberschreitung: ${method}`));
      }, timeoutMs);
    });
  }

  /** Ausdruck im Renderer auswerten. Wirft die Renderer-Ausnahme weiter, statt sie
   *  als `undefined` zu verschlucken — sonst liest sich ein kaputter Ausdruck wie ein
   *  fehlgeschlagener Prüfpunkt. */
  async evaluate<T>(expression: string, timeoutMs = 30_000): Promise<T> {
    const message = await this.send(
      "Runtime.evaluate",
      { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true },
      timeoutMs,
    );
    const details = message.result?.exceptionDetails;
    if (details) throw new Error(`Renderer: ${details.text ?? "Ausnahme"}`);
    return message.result?.result?.value as T;
  }

  /**
   * Echter Mausklick auf die Mitte eines Elements (`Input.dispatchMouseEvent`) statt
   * `element.click()`.
   *
   * Der Unterschied ist nicht kosmetisch: ein synthetischer Klick traegt `isTrusted:false`
   * und laeuft an Host-Pfaden vorbei, die an echten Zeigereingaben haengen (Fokus, Blur,
   * Tooltip-Handling). Ein Defekt, der genau dort sitzt, bleibt dabei unsichtbar — der
   * Smoke waere gruen und der Nutzer trotzdem eingefroren.
   */
  async clickReal(selector: string): Promise<boolean> {
    const box = await this.evaluate<{ x: number; y: number } | null>(`
      const el = ${selector};
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    `);
    if (!box) return false;
    const common = { x: box.x, y: box.y, button: "left", clickCount: 1, buttons: 1 };
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...common, buttons: 0 });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", ...common });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...common, buttons: 0 });
    return true;
  }

  close(): void {
    this.socket.close();
  }
}

// --- Prüfpunkte -------------------------------------------------------------

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

const results: Check[] = [];

function record(name: string, passed: boolean, detail: string): void {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Im Renderer: warten, bis `check()` wahr wird (Rendering ist asynchron). */
const waitFor = (body: string, timeoutMs = 8000): string => `
  const deadline = Date.now() + ${timeoutMs};
  while (Date.now() < deadline) {
    const value = (() => { ${body} })();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
`;

/** Fuer Pruefpunkt 3: derselbe Ausdruck, aber `await` im Rumpf erlaubt. */
const waitForAsync = (body: string, timeoutMs = 8000): string => `
  const deadline = Date.now() + ${timeoutMs};
  while (Date.now() < deadline) {
    const value = await (async () => { ${body} })();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
`;

interface Settings {
  endpoints: { url: string; model?: string; apiKey?: string }[];
  timeoutSec: number;
}

/**
 * Ein erreichbarer Endpunkt, den der Treiber selbst mitbringt.
 *
 * Warum nicht einfach den konfigurierten nehmen: der Freeze vom 2026-08-06 trat beim
 * **funktionierenden** Endpunkt auf — gegen einen toten schlaegt die Probe zu frueh fehl
 * und der Defekt bleibt unsichtbar. Die erste Fassung dieses Treibers klickte gegen einen
 * toten Port und meldete deshalb 6/6 gruen, obwohl die Freeze-Version eingebaut war
 * (gemessen 2026-08-07 in der Gegenprobe). Ein eigener Server macht den Pruefpunkt
 * unabhaengig davon, ob gerade ein LLM-Server laeuft.
 *
 * `requestUrl` umgeht CORS, deshalb genuegen hier nackte JSON-Antworten.
 */
async function startFakeEndpoint(): Promise<{ url: string; close: () => void }> {
  const server: Server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      req.url?.includes("/v1/models") === true
        ? JSON.stringify({ data: [{ id: "smoke-model", object: "model" }] })
        : JSON.stringify({ ok: true }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? undefined : argv[index + 1];
  };
  const port = Number(flag("port") ?? 9222);
  const vault = flag("vault");

  console.log(`GUI-Smoke — Obsidian auf Port ${port}`);
  const cdp = await Cdp.attach(port, vault);
  // Ausserhalb des try, damit das `finally` sie auch nach einem Abbruch mitten im Lauf
  // zurueckschreiben kann — sonst bliebe der Vault mit toten Endpunkten stehen.
  let previous: Settings | null = null;
  let fake: { url: string; close: () => void } | null = null;

  try {
    // Ohne Fokus drosselt Chromium den Renderer. `Page.bringToFront` allein genuegt auf
    // macOS NICHT: es holt das Fenster innerhalb der App nach vorn, nicht die App nach
    // vorn. Im Hintergrund bleibt das DOM leer, obwohl die App-API den Zustand korrekt
    // meldet — man debuggt dann ein Phantom.
    await cdp.send("Page.bringToFront");
    if (process.platform === "darwin") {
      try {
        execFileSync("osascript", ["-e", 'tell application "Obsidian" to activate']);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } catch {
        console.log("  (Hinweis: `osascript activate` schlug fehl — Fenster ggf. von Hand nach vorn holen)");
      }
    }

    const vaultName = await cdp.evaluate<string>(`return window.app?.appId ? app.vault.getName() : "";`);
    if (!vaultName) throw new Error("Obsidians `app` ist im Renderer nicht erreichbar.");
    console.log(`Vault: ${vaultName}\n`);

    // --- 1. Plugin ist aktiv ------------------------------------------------
    const plugin = await cdp.evaluate<{ ok: boolean; version?: string }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      return p ? { ok: true, version: p.manifest.version } : { ok: false };
    `);
    if (!plugin.ok) throw new Error(`Plugin ${PLUGIN_ID} ist nicht aktiv. Erst deployen.`);
    record("1. Plugin ist aktiv", true, `Version ${plugin.version}`);

    // Vorwerte sichern, bevor irgendetwas veraendert wird.
    previous = await cdp.evaluate<Settings>(`
      const s = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings;
      return { endpoints: JSON.parse(JSON.stringify(s.endpoints)), timeoutSec: s.timeoutSec };
    `);

    // --- 2. Die Sidebar oeffnet und ist bedienbar ---------------------------
    const view = await cdp.evaluate<{ leaves: number; input: boolean; buttons: string[] } | null>(
      waitForAsync(`
        await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:open`)});
        const leaves = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)});
        const el = leaves[0]?.view?.containerEl;
        if (!el) return null;
        const buttons = [...el.querySelectorAll(".koda-buttons button")].map((b) => b.textContent.trim());
        if (buttons.length === 0) return null;
        return { leaves: leaves.length, input: !!el.querySelector("textarea.koda-input"), buttons };
      `),
    );
    record(
      "2. Sidebar oeffnet mit Eingabefeld und Knoepfen",
      view !== null && view.input && view.buttons.length === 3,
      view ? `${view.leaves} Leaf · Knoepfe: ${view.buttons.join(", ")}` : "keine View entstanden",
    );

    // --- 3. Der Freeze-Waechter ---------------------------------------------
    // Der teuerste Fund des Projekts (2026-08-06): der Klick auf „Testen“ schickte den
    // Renderer in eine Endlosschleife. Deshalb wird hier NICHT geprueft, ob ein Handler
    // lief, sondern ob der Renderer den Klick **ueberlebt**: kommt keine Antwort mehr,
    // laeuft der CDP-Aufruf in seine Zeitueberschreitung und der Punkt wird rot.
    //
    // Erst die Existenz des Knopfes belegen, dann klicken: ein Klick ins Leere waere
    // sonst gruen — ausgerechnet im Defektfall (Falle „Pruefpunkt ohne Gegenstand“).
    fake = await startFakeEndpoint();
    // Zeile 1 erreichbar (trifft den historischen Freeze-Fall), Zeile 2 tot (Pruefpunkt 4).
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.endpoints = [{ url: ${JSON.stringify(fake.url)} }, { url: ${JSON.stringify(DEAD_A)} }];
      await p.saveSettings();
      app.setting.open();
      app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
      return true;
    `);
    // Das Fenster entsteht erst durch `open()` — vorher gibt es kein Target.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    let settings: Cdp | null = null;
    try {
      settings = await Cdp.attachSettings(port, vault);
      // Auch dieses Fenster wird im Hintergrund gedrosselt.
      await settings.send("Page.bringToFront");

      const zeilen = await settings.evaluate<number | null>(
        waitFor(`
          const rows = [...document.querySelectorAll(".setting-item")].filter((r) => r.querySelector(".koda-endpoint-status"));
          return rows.length >= 2 ? rows.length : 0;
        `),
      );
      const hatZeile = zeilen !== null && zeilen >= 2;

      if (!hatZeile) {
        record("3. Klick auf „Testen“ friert den Renderer nicht ein", false, "Endpunkt-Zeile im Einstellungsfenster nicht gefunden");
        record("4. Toter Endpunkt wird als nicht erreichbar angezeigt", false, "ohne Endpunkt-Zeile nicht entscheidbar");
      } else {
        const t0 = Date.now();
        let survived = true;
        let detail = "";
        let status: string | null = null;
        try {
          // Klick + Warten auf das Status-Icon in EINEM Renderer-Aufruf: friert der
          // Renderer ein, antwortet dieser Aufruf nie und laeuft in den Timeout.
          const geklickt = await settings.clickReal(
            `[...document.querySelectorAll(".setting-item")]
               .filter((r) => r.querySelector(".koda-endpoint-status"))[0]
               ?.querySelectorAll("button")[0]`,
          );
          if (!geklickt) throw new Error("Testen-Knopf nicht klickbar (unsichtbar oder nicht vorhanden)");
          status = await settings.evaluate<string | null>(
            `
            ${waitFor(`
              const rows2 = [...document.querySelectorAll(".setting-item")].filter((r) => r.querySelector(".koda-endpoint-status"));
              const el = rows2[0].querySelector(".koda-endpoint-status");
              if (!el) return null;
              if (el.classList.contains("is-ok")) return "is-ok";
              if (el.classList.contains("is-bad")) return "is-bad";
              return null;
            `)}
          `,
            12_000,
          );
          // Der Freeze von 2026-08-06 nahm BEIDE Fenster mit. Das Hauptfenster wird
          // deshalb mitgeprueft: antwortet es nicht mehr, ist der Punkt rot, auch wenn
          // das Einstellungsfenster noch gezuckt hat.
          const hauptfensterLebt = await cdp.evaluate<boolean>(`return true;`, 8000);
          survived = status === "is-ok" && hauptfensterLebt;
          detail =
            status === "is-ok"
              ? `beide Fenster antworten nach ${Date.now() - t0} ms · Status is-ok`
              : `Status ${status ?? "(keiner)"} statt is-ok — erreichbarer Endpunkt nicht als solcher erkannt`;
        } catch (error) {
          survived = false;
          detail = `Renderer antwortet nicht mehr (${error instanceof Error ? error.message : String(error)}) — Freeze-Verdacht`;
        }
        record("3. Klick auf „Testen“ friert den Renderer nicht ein", survived, detail);

        // --- 4. Der Status ist der echte Status -----------------------------
        // Gegen einen toten Port MUSS „nicht erreichbar“ stehen. Ein Statuspunkt, der
        // immer gruen ist, waere schlimmer als keiner — deshalb wird die zweite Zeile
        // (toter Port) separat geklickt statt die erste nur anders interpretiert.
        let tot: string | null = null;
        try {
          const geklickt2 = await settings.clickReal(
            `[...document.querySelectorAll(".setting-item")]
               .filter((r) => r.querySelector(".koda-endpoint-status"))[1]
               ?.querySelectorAll("button")[0]`,
          );
          if (!geklickt2) throw new Error("Testen-Knopf der zweiten Zeile nicht klickbar");
          tot = await settings.evaluate<string | null>(
            `
            ${waitFor(`
              const rows2 = [...document.querySelectorAll(".setting-item")].filter((r) => r.querySelector(".koda-endpoint-status"));
              const el = rows2[1].querySelector(".koda-endpoint-status");
              if (!el) return null;
              if (el.classList.contains("is-bad")) return "is-bad";
              if (el.classList.contains("is-ok")) return "is-ok";
              return null;
            `)}
          `,
            12_000,
          );
        } catch (error) {
          tot = `FEHLER: ${error instanceof Error ? error.message : String(error)}`;
        }
        record(
          "4. Toter Endpunkt wird als nicht erreichbar angezeigt",
          tot === "is-bad",
          `Status ${tot ?? "(keiner)"} bei ${DEAD_A}`,
        );
      }
    } finally {
      settings?.close();
      await cdp.evaluate(`app.setting.close(); return true;`).catch(() => undefined);
    }

    // --- 5. Failover-Klartext statt Stacktrace ------------------------------
    // Kommt ohne Modell aus: beide Endpunkte sind tot, der Resolver scheitert, lange
    // bevor irgendetwas gefragt wuerde. Deterministisch und in Sekunden entschieden.
    const failover = await cdp.evaluate<{ text: string; busy: boolean; klasse: string } | null>(
      `
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.endpoints = [{ url: ${JSON.stringify(DEAD_A)} }, { url: ${JSON.stringify(DEAD_B)} }];
      await p.saveSettings();
      await p.newChat();
      void p.ask("Smoke-Test: bitte antworten.");
      ${waitForAsync(
        `
        const p2 = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        if (p2.busy) return null;
        const el = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0]?.view?.containerEl;
        const msg = el?.querySelector(".koda-error");
        if (!msg) return null;
        return { text: msg.textContent.trim(), busy: p2.busy, klasse: msg.className };
      `,
        20_000,
      )}
    `,
      40_000,
    );
    const looksLikeStacktrace = /\bat \w+.*:\d+|TypeError|undefined is not/.test(failover?.text ?? "");
    record(
      "5. Zwei tote Endpunkte ergeben Klartext, keinen Stacktrace",
      failover !== null && failover.text.length > 0 && !looksLikeStacktrace && !failover.busy,
      failover ? `„${failover.text.slice(0, 90)}“` : "keine Fehlermeldung im Log",
    );

    // --- 6. Wikilinks in Antworten sind klickbar ----------------------------
    // Ueber `chatLog` + `renderLog()` statt ueber eine echte Antwort: geprueft wird die
    // Render- und Klick-Naht, und die haengt nicht am Modell. Gemessen wird der Effekt
    // (welche Datei ist danach aktiv), nicht die Ursache.
    const link = await cdp.evaluate<{ gerendert: boolean; vorher: string | null; nachher: string | null } | null>(
      `
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      // Bewusst NICHT die gerade aktive Notiz: waere sie das Ziel, blieben vorher und
      // nachher gleich und der Punkt waere rot, obwohl der Klick funktioniert hat
      // (im Lauf vom 2026-08-07 genau so passiert).
      const aktiv = app.workspace.getActiveFile()?.path ?? null;
      const ziel = app.vault.getMarkdownFiles().find((f) => f.path !== aktiv);
      if (!ziel) return null;
      const view = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0].view;
      p.chatLog = [{ role: "assistant", content: "Siehe [[" + ziel.path.replace(/\\.md$/, "") + "]]." }];
      view.renderLog();
      const a = await (async () => { ${waitFor(`return document.querySelector(".koda-log a.internal-link");`)} })();
      if (!a) return { gerendert: false, vorher: null, nachher: null };
      const vorher = app.workspace.getActiveFile()?.path ?? null;
      a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      await new Promise((r) => setTimeout(r, 1200));
      return { gerendert: true, vorher, nachher: app.workspace.getActiveFile()?.path ?? null };
    `,
      30_000,
    );
    record(
      "6. Wikilink in der Antwort ist klickbar und oeffnet die Notiz",
      link !== null && link.gerendert && link.nachher !== null && link.nachher !== link.vorher,
      link
        ? link.gerendert
          ? `aktiv vorher ${link.vorher ?? "(keine)"} → nachher ${link.nachher ?? "(keine)"}`
          : "kein a.internal-link im Log gerendert"
        : "keine Markdown-Datei im Vault",
    );
  } finally {
    // Aufräumen darf nie am Ergebnis hängen: auch ein abgebrochener Lauf gibt den Vault
    // so zurück, wie er ihn vorgefunden hat — sonst bleiben tote Endpunkte in den
    // Einstellungen des Maintainers stehen.
    if (previous !== null) {
      await cdp
        .evaluate(
          `
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.settings.endpoints = ${JSON.stringify(previous.endpoints)};
          p.settings.timeoutSec = ${JSON.stringify(previous.timeoutSec)};
          await p.saveSettings();
          await p.newChat();
          app.setting.close();
          return true;
        `,
        )
        .catch(() => undefined);
    }
    fake?.close();
    cdp.close();
  }

  const failed = results.filter((check) => !check.passed);
  console.log(`\n${results.length - failed.length}/${results.length} grün`);
  if (failed.length > 0) {
    console.log("Rot:");
    for (const check of failed) console.log(`  - ${check.name}: ${check.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`\nAbbruch: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
