/**
 * GUI-Smoke-Treiber — prueft die Naht zum Host gegen ein **laufendes** Obsidian statt
 * von Hand (CORE-TEST-02 b).
 *
 * Die CDP-Bruecke liegt seit 2026-08-16 zentral im Dach (`tools/obsidian-cdp/`) und
 * wird importiert, nicht vendored: sie ist plugin-neutral und lief hier bis 2026-08-18
 * als eigene, aeltere Linie (`scripts/lib/cdp.ts`). Fehlt das Dach (fremder Checkout),
 * bricht esbuild beim Aufloesen ab — das ist die gewollte Meldung, kein Fehler dieses
 * Treibers. Was der Bruecke fehlt, wird DORT ergaenzt, nie hier nachgebaut — `clickReal`
 * kam bei dieser Migration neu hinzu (Pruefpunkt 3 unten braucht einen echten Klick).
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
import { Cdp, attachTo, clickReal, pollUntil, requireVisible } from "../../tools/obsidian-cdp/cdp.js";

const PLUGIN_ID = "koda-agent";
const VIEW_TYPE = "koda-agent-view";
/** Garantiert tote Ports fuer die Fehlerfaelle — nichts hoert dort, und ein Tippfehler
 *  im Test darf nie versehentlich einen echten Endpunkt treffen. */
const DEAD_A = "http://127.0.0.1:9999";
const DEAD_B = "http://127.0.0.1:9998";

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
  // `attachTo` unterscheidet Haupt- und Einstellungen-Fenster an der Sache (nur das
  // Hauptfenster traegt einen Workspace), nicht am lokalisierten Fenstertitel.
  const cdp = await attachTo("workspace", port, vault);
  if (!cdp) {
    throw new Error(
      `Kein Obsidian-Hauptfenster auf Port ${port}` +
        (vault ? ` fuer Vault „${vault}"` : "") +
        ". Laeuft Obsidian mit --remote-debugging-port? (siehe Kopfkommentar)",
    );
  }
  // Ausserhalb des try, damit das `finally` sie auch nach einem Abbruch mitten im Lauf
  // zurueckschreiben kann — sonst bliebe der Vault mit toten Endpunkten stehen.
  let previous: Settings | null = null;
  let fake: { url: string; close: () => void } | null = null;

  try {
    // Ohne Fokus drosselt Chromium den Renderer. `Page.bringToFront` allein genuegt auf
    // macOS NICHT: es holt das Fenster innerhalb der App nach vorn, nicht die App nach
    // vorn. Im Hintergrund bleibt das DOM leer, obwohl die App-API den Zustand korrekt
    // meldet — man debuggt dann ein Phantom. `requireVisible` holt das Fenster selbst
    // nach vorn und bricht mit Handlungsanweisung ab, wenn das nicht reicht.
    if (process.platform === "darwin") {
      try {
        execFileSync("osascript", ["-e", 'tell application "Obsidian" to activate']);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } catch {
        console.log("  (Hinweis: `osascript activate` schlug fehl — Fenster ggf. von Hand nach vorn holen)");
      }
    }
    await requireVisible(cdp);

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

    // --- 1b. Retrieval-Andockung an vault-rag -------------------------------
    // Geprueft wird die NAHT, nicht die Suche: liegt vault-rags Vertrag in der Form vor,
    // gegen die Koda gebaut ist? Das entscheidet, ob `related_notes` ueberhaupt in die
    // Werkzeugliste kommt (`status().indexed`) — und es ist der Teil, der ohne eine echte
    // Modell-Antwort pruefbar ist. Der Aufruf laeuft ueber CDP im Renderer, also exakt auf
    // dem Weg, den Kodas `readRetrievalApi` nimmt.
    //
    // Was dieser Punkt NICHT zeigt: dass Koda die API im Gespraech tatsaechlich benutzt.
    // Dafuer braeuchte es eine Modell-Antwort (>90 s stumm, nicht deterministisch) — das
    // bleiben die Handpunkte 14–18 in docs/SMOKE.md. Fehlt vault-rag ganz, ist dieser
    // Punkt kein Defekt: dann meldet er „nicht installiert" und bleibt gruen, weil die
    // weiche Kopplung genau das vorsieht.
    const retrieval = await cdp.evaluate<{
      installed: boolean; version?: unknown; keys?: string[];
      indexed?: boolean; noteCount?: number; usable?: boolean;
    }>(`
      const rag = app.plugins.plugins["vault-retrieval"];
      if (!rag || !rag.api) return { installed: false };
      const api = rag.api;
      const st = api.status();
      return {
        installed: true,
        version: api.apiVersion,
        keys: Object.keys(api).sort(),
        indexed: st.indexed,
        noteCount: st.noteCount,
        // Genau die Pruefung aus src/obsidian/retrieval.ts — Version UND Form.
        usable: api.apiVersion === 1
          && typeof api.status === "function"
          && typeof api.search === "function"
          && typeof api.related === "function",
      };
    `);
    if (!retrieval.installed) {
      record("1b. Retrieval-Andockung", true, "vault-retrieval nicht installiert — Koda laeuft ohne (weiche Kopplung)");
    } else {
      record(
        "1b. Retrieval-Andockung",
        retrieval.usable === true && retrieval.indexed === true,
        `apiVersion ${String(retrieval.version)} · ${retrieval.keys?.join(", ") ?? "?"} · indexed=${String(retrieval.indexed)} · ${String(retrieval.noteCount)} Notizen`,
      );
    }

    // --- 1c. Frontmatter-Naht (Grundlage von list_notes) --------------------
    // Geprueft wird NICHT list_notes selbst (VaultTools haengt nicht am Plugin-Objekt),
    // sondern die Fremd-API darunter: liefert metadataCache ein Objekt in der Form, gegen
    // die `pickFields` gebaut ist? Faellt Obsidian hier je auf eine andere Form, faellt
    // dieser Punkt — und nicht erst der Nutzer im Gespraech.
    //
    // Bewusst NICHT geprueft wird, ob jeder Feldwert flach ist (kein verschachteltes
    // Objekt): am 2026-08-14 gegen 10_Pallas gemessen enthaelt der reale Vault legitime
    // verschachtelte Frontmatter-Werte (`limits: {...}` in vault-crews-Teams,
    // `fields: {...}` in `80_Archiv/60_Blueprints/shadowvault-types/*.md`) — und
    // `formatFieldValue` (list.ts) behandelt das explizit als Erwartungsfall, nicht als
    // Fehler: jeder Nicht-Array-Objektwert wird zu `{…}` gerendert. Eine Flachheits-Pflicht
    // wuerde also etwas Strengeres pruefen, als `pickFields` tatsaechlich braucht, und
    // waere auf diesem Vault dauerhaft rot, ohne dass etwas kaputt ist. Die echte Naht ist:
    // kommt `frontmatter` ueberhaupt als ueber `fm[feld]` indizierbares Objekt zurueck
    // (Record<string, unknown>, kein Array, kein Skalar)?
    const fmSeam = await cdp.evaluate<{ notes: number; withFm: number; sample?: string[]; recordShaped?: boolean }>(`
      const files = app.vault.getMarkdownFiles();
      let withFm = 0, sample = null, recordShaped = true;
      for (const f of files) {
        const fm = app.metadataCache.getFileCache(f)?.frontmatter;
        if (!fm) continue;
        withFm++;
        if (sample === null) sample = Object.keys(fm).slice(0, 5);
        if (typeof fm !== "object" || fm === null || Array.isArray(fm)) recordShaped = false;
      }
      return { notes: files.length, withFm, sample: sample ?? [], recordShaped };
    `);
    record(
      "1c. Frontmatter-Naht",
      fmSeam.withFm > 0 && fmSeam.recordShaped === true,
      `${fmSeam.withFm} von ${fmSeam.notes} Notizen mit Frontmatter · Beispielfelder: ${fmSeam.sample?.join(", ") ?? "—"}`,
    );

    // Vorwerte sichern, bevor irgendetwas veraendert wird.
    previous = await cdp.evaluate<Settings>(`
      const s = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings;
      return { endpoints: JSON.parse(JSON.stringify(s.endpoints)), timeoutSec: s.timeoutSec };
    `);

    // --- 2. Die Sidebar oeffnet und ist bedienbar ---------------------------
    // Mutation (Command feuern) und Wartephase (auf gerenderte View pollen) sind
    // getrennt: `Cdp.send` bricht nach 30 s ab, `pollUntil` fragt stattdessen
    // wiederholt in eigenen, kurzen `Runtime.evaluate`-Aufrufen von der Node-Seite nach.
    await cdp.evaluate(`
      await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:open`)});
      return true;
    `);
    const view = await pollUntil<{ leaves: number; input: boolean; buttons: string[] }>(
      cdp,
      `
        const leaves = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)});
        const el = leaves[0]?.view?.containerEl;
        if (!el) return null;
        const buttons = [...el.querySelectorAll(".koda-buttons button")].map((b) => b.textContent.trim());
        if (buttons.length === 0) return null;
        return { leaves: leaves.length, input: !!el.querySelector("textarea.koda-input"), buttons };
      `,
      8000,
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
      settings = await attachTo("settings", port, vault);
      if (!settings) {
        record("3. Klick auf „Testen“ friert den Renderer nicht ein", false, "Einstellungsfenster nicht gefunden");
        record("4. Toter Endpunkt wird als nicht erreichbar angezeigt", false, "ohne Einstellungsfenster nicht entscheidbar");
      } else {
        // Auch dieses Fenster wird im Hintergrund gedrosselt.
        await settings.send("Page.bringToFront");

        const zeilen = await pollUntil<number>(
          settings,
          `
            const rows = [...document.querySelectorAll(".setting-item")].filter((r) => r.querySelector(".koda-endpoint-status"));
            return rows.length >= 2 ? rows.length : 0;
          `,
          8000,
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
            // Klick (Mutation) und Warten auf das Status-Icon (Wartephase) sind getrennt:
            // friert der Renderer ein, laeuft `pollUntil` in seine eigene Zeitueberschreitung,
            // statt den ganzen 30-s-`Cdp.send`-Aufruf mitzureissen.
            const geklickt = await clickReal(
              settings,
              `[...document.querySelectorAll(".setting-item")]
                 .filter((r) => r.querySelector(".koda-endpoint-status"))[0]
                 ?.querySelectorAll("button")[0]`,
            );
            if (!geklickt) throw new Error("Testen-Knopf nicht klickbar (unsichtbar oder nicht vorhanden)");
            status = await pollUntil<string>(
              settings,
              `
                const rows2 = [...document.querySelectorAll(".setting-item")].filter((r) => r.querySelector(".koda-endpoint-status"));
                const el = rows2[0]?.querySelector(".koda-endpoint-status");
                if (!el) return null;
                if (el.classList.contains("is-ok")) return "is-ok";
                if (el.classList.contains("is-bad")) return "is-bad";
                return null;
              `,
              12_000,
            );
            // Der Freeze von 2026-08-06 nahm BEIDE Fenster mit. Das Hauptfenster wird
            // deshalb mitgeprueft: antwortet es nicht mehr, ist der Punkt rot, auch wenn
            // das Einstellungsfenster noch gezuckt hat.
            const hauptfensterLebt = await cdp.evaluate<boolean>(`return true;`);
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
            const geklickt2 = await clickReal(
              settings,
              `[...document.querySelectorAll(".setting-item")]
                 .filter((r) => r.querySelector(".koda-endpoint-status"))[1]
                 ?.querySelectorAll("button")[0]`,
            );
            if (!geklickt2) throw new Error("Testen-Knopf der zweiten Zeile nicht klickbar");
            tot = await pollUntil<string>(
              settings,
              `
                const rows2 = [...document.querySelectorAll(".setting-item")].filter((r) => r.querySelector(".koda-endpoint-status"));
                const el = rows2[1]?.querySelector(".koda-endpoint-status");
                if (!el) return null;
                if (el.classList.contains("is-bad")) return "is-bad";
                if (el.classList.contains("is-ok")) return "is-ok";
                return null;
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

          // --- 8. Settings-Gruppe „Kontext & Verdichtung“ -----------------------
          // Nur geprueft, waehrend das Einstellungsfenster ohnehin offen ist (Punkte 3/4) —
          // ein eigenes Oeffnen/Schliessen nur fuer diesen Punkt waere unnoetiger Aufwand.
          // Die Ueberschrift kommt aus dem deklarativen Settings-Walker (`setHeading()`,
          // src/vendor/kit-obsidian/settings_walker.ts), das Zahlenfeld ist ein Text-Input
          // (`type: "number"` rendert `addText`, kein natives `<input type=number>`).
          const group = await settings.evaluate<{ heading: boolean; field: string | null }>(`
            const heads = [...document.querySelectorAll(".setting-item-heading .setting-item-name")].map((e) => e.textContent);
            const heading = heads.some((h) => /Kontext & Verdichtung|Context & compaction/.test(h));
            const item = [...document.querySelectorAll(".setting-item")].find((e) => /Kontextfenster|Context window/.test(e.querySelector(".setting-item-name")?.textContent ?? ""));
            return { heading, field: item?.querySelector("input")?.value ?? null };
          `);
          record(
            "8. Settings-Gruppe „Kontext & Verdichtung“ mit Fenster-Feld",
            group.heading && group.field !== null,
            JSON.stringify(group),
          );
        }
      }
    } finally {
      settings?.close();
      await cdp.evaluate(`app.setting.close(); return true;`).catch(() => undefined);
    }

    // --- 5. Failover-Klartext statt Stacktrace ------------------------------
    // Kommt ohne Modell aus: beide Endpunkte sind tot, der Resolver scheitert, lange
    // bevor irgendetwas gefragt wuerde. Deterministisch und in Sekunden entschieden.
    // Mutation (Endpunkte setzen, `ask()` anstossen) und Wartephase (auf die
    // Fehlermeldung pollen) sind getrennt — dieselbe Begruendung wie bei Pruefpunkt 2.
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.endpoints = [{ url: ${JSON.stringify(DEAD_A)} }, { url: ${JSON.stringify(DEAD_B)} }];
      await p.saveSettings();
      await p.newChat();
      void p.ask("Smoke-Test: bitte antworten.");
      return true;
    `);
    const failover = await pollUntil<{ text: string; busy: boolean; klasse: string }>(
      cdp,
      `
        const p2 = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        if (p2.busy) return null;
        const el = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0]?.view?.containerEl;
        const msg = el?.querySelector(".koda-error");
        if (!msg) return null;
        return { text: msg.textContent.trim(), busy: p2.busy, klasse: msg.className };
      `,
      20_000,
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
    // (welche Datei ist danach aktiv), nicht die Ursache. Drei getrennte Schritte:
    // Szene herstellen (Mutation), auf den gerenderten Link pollen (Wartephase),
    // klicken (Mutation) und auf die Navigation pollen (Wartephase).
    const szene = await cdp.evaluate<{ ziel: string | null; vorher: string | null }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      // Bewusst NICHT die gerade aktive Notiz: waere sie das Ziel, blieben vorher und
      // nachher gleich und der Punkt waere rot, obwohl der Klick funktioniert hat
      // (im Lauf vom 2026-08-07 genau so passiert).
      const aktiv = app.workspace.getActiveFile()?.path ?? null;
      const ziel = app.vault.getMarkdownFiles().find((f) => f.path !== aktiv);
      if (!ziel) return { ziel: null, vorher: aktiv };
      const view = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0].view;
      p.chatLog = [{ role: "assistant", content: "Siehe [[" + ziel.path.replace(/\\.md$/, "") + "]]." }];
      view.renderLog();
      return { ziel: ziel.path, vorher: aktiv };
    `);
    const gerendert =
      szene.ziel !== null
        ? await pollUntil<boolean>(cdp, `return !!document.querySelector(".koda-log a.internal-link");`, 8000)
        : null;
    let nachher: string | null = null;
    if (gerendert) {
      await cdp.evaluate(`
        const a = document.querySelector(".koda-log a.internal-link");
        a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        return true;
      `);
      nachher = await pollUntil<string>(
        cdp,
        `
          const cur = app.workspace.getActiveFile()?.path ?? null;
          return cur && cur !== ${JSON.stringify(szene.vorher)} ? cur : null;
        `,
        8000,
      );
    }
    record(
      "6. Wikilink in der Antwort ist klickbar und oeffnet die Notiz",
      szene.ziel !== null && gerendert === true && nachher !== null,
      szene.ziel === null
        ? "keine Markdown-Datei im Vault"
        : gerendert
          ? `aktiv vorher ${szene.vorher ?? "(keine)"} → nachher ${nachher ?? "(keine — Navigation blieb aus)"}`
          : "kein a.internal-link im Log gerendert",
    );

    // --- 7. Verdichtungs-Marken werden gerendert ----------------------------
    // Records nur im Speicher anhaengen, rendern, pruefen, wieder entfernen — current.jsonl
    // bleibt unberuehrt. Kein Modell noetig: geprueft wird der dritte Render-Zweig
    // (renderCompaction in src/obsidian/view.ts), nicht die Verdichtungslogik selbst.
    const marks = await cdp.evaluate<{ stage1: number; stage2: number; forced: number; summaryText: string }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const n = p.chatLog.length;
      p.chatLog.push({ kind: "compaction", stage: 1, at: new Date().toISOString(), keepToolResults: 3, stats: { stubbed: 6, bytes: 38912 } });
      p.chatLog.push({ kind: "compaction", stage: 2, at: new Date().toISOString(), keepToolResults: 3, summary: "SMOKE-ZUSAMMENFASSUNG", turns: 3, forced: true, stats: { stubbed: 0, bytes: 900 } });
      p.views().forEach((v) => v.renderLog());
      const root = document.querySelector(".koda-log");
      const out = {
        stage1: root.querySelectorAll(".koda-compaction:not(details)").length,
        stage2: root.querySelectorAll("details.koda-compaction-summary").length,
        forced: [...root.querySelectorAll(".koda-compaction")].filter((e) => /Überlauf|overflow/.test(e.textContent)).length,
        summaryText: root.querySelector("details.koda-compaction-summary pre")?.textContent ?? "",
      };
      p.chatLog.splice(n);
      p.views().forEach((v) => v.renderLog());
      return out;
    `);
    record(
      "7. Verdichtungs-Marken (Stufe 1 + Stufe 2, erzwungen) werden gerendert",
      marks.stage1 === 1 && marks.stage2 === 1 && marks.forced === 1 && marks.summaryText === "SMOKE-ZUSAMMENFASSUNG",
      JSON.stringify(marks),
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
