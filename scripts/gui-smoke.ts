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
 * ⚠️ **Zuerst pruefen, wer sonst an Obsidian haengt.** Obsidian ist Single-Instance — ein
 * `quit` trifft die Instanz, an der moeglicherweise eine andere Session arbeitet, und zerstoert
 * deren Zustand. Der eigene Lauf ist danach sauber gruen; der Schaden entsteht woanders und
 * faellt nicht auf.
 *
 * ```bash
 * lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "laeuft bereits — NICHT beenden"
 * ```
 *
 * Hoert der Port schon, dann **mitnutzen statt neu starten**: ein eigenes Fenster per
 * `vault-open` ueber IPC oeffnen, dann `attachTo("workspace", port, vault)` — der Vault-Name
 * waehlt, nicht die Reihenfolge. ⚠️ Die Port-Pruefung ersetzt die Frage nicht: sie zeigt aktive
 * CDP-Treiber, aber nicht, wer ein Fenster offen haelt oder auf den Port wartet.
 *
 * Erst wenn nichts laeuft — oder nach Absprache mit dem, der es benutzt — gilt das Rezept unten.
 *
 * ## Der Vault, gegen den geprueft wird
 *
 * Nicht der Arbeits-Vault, sondern ein eigener Staging-Vault aus dem getrackten Fixture:
 *
 * ```bash
 * npm run build                                  # der Vault soll den Stand zeigen, den du aenderst
 * npm run smoke:gui -- --setup                   # $STAGING_VAULTS_DIR/koda-agent aus docs/images/fixture/
 * ```
 *
 * Zwei Gruende, und beide sind gemessen. **Erstens schreiben die Pruefpunkte 16 und 17
 * Einstellungen** (`systemPromptOverride`, `toolsDisabled`); sie sichern ihren Vorwert und
 * schreiben ihn im `finally` zurueck, aber ein hart abgebrochener Lauf hinterlaesst trotzdem
 * einen fremden Zustand — im Arbeits-Vault waeren das Johannes' echte Einstellungen.
 * **Zweitens liegt im Arbeits-Vault der Store-Build, nicht der Repo-Stand**: vier gruene
 * Laeufe im Workspace waren am 2026-08-30 aus genau diesem Grund unbelegt, und
 * `manifest.version` verraet es nicht, weil beide Staende dieselbe Nummer tragen
 * (Dach-`AGENTS.md` § Staging-Vaults).
 *
 * ⚠️ **Ein frisch gebauter Vault ist Obsidian unbekannt** — `obsidian://open?vault=koda-agent`
 * tut dann schlicht nichts, was leicht als „ich muss Obsidian neu starten" gelesen wird. Der
 * Weg ohne Neustart geht ueber den Pfad statt den Namen; `--setup` gibt die Zeile fertig aus.
 *
 * ⚠️ Der Lauf leert das laufende Koda-Gespraech im Zielvault (Punkt 5 braucht ein frisches).
 * Der bisherige Verlauf wandert nach `.obsidian/plugins/koda-agent/sessions/archive.jsonl` und ist nicht verloren, aber
 * aus der Sidebar weg. Wer gerade an einem Verlauf misst, faehrt den Smoke davor oder danach.
 *
 * ```bash
 * osascript -e 'quit app "Obsidian"'
 * open -a Obsidian --args --remote-debugging-port=9222
 * ```
 *
 * Dann mit deployter Plugin-Version:
 *
 * ```bash
 * npm run smoke:gui -- --vault koda-agent
 * ```
 *
 * ## Pruefpunkte 20-23 (Arbeitskontext, seit 2026-09-02)
 *
 * Vier neue Punkte messen ueber `plugin.currentContext()`, `plugin.setContextMode()`,
 * `plugin.currentToolNames()` und `plugin.buildTools()` — dieselben Methoden, die `ask()`
 * selbst ruft, kein eigener Messpfad daneben. 20 belegt, dass Notiz und Markierung den
 * Fokuswechsel in die Sidebar ueberleben; 21, dass Modus „Aus" keinen Kontext sendet und
 * Befehl und Dropdown denselben Zustand schalten; 22, dass `get_workspace` und
 * `edit_active_note` in der gesendeten Werkzeugliste stehen und einzeln abschaltbar sind;
 * 23 die Invariante von `edit_active_note` — eine seit dem Aufruf veraltete Markierung
 * schreibt nicht, eine gueltige schreibt, und erst die Gegenprobe ohne Aenderung belegt,
 * dass der Punkt seinen Gegenstand ueberhaupt beruehrt.
 */

import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { cwd } from "node:process";
import { Cdp, attachTo, clickReal, pollUntil, requireVisible } from "../../tools/obsidian-cdp/cdp.js";
import { buildVault, stagingVaultDir } from "../../tools/obsidian-cdp/vault.js";

const PLUGIN_ID = "koda-agent";
/** Repo- und Vault-Name sind hier dasselbe Wort — der Staging-Vault heisst wie das Repo. */
const REPO_NAME = "koda-agent";
const REPO_ROOT = cwd();
const FIXTURE_DIR = join(REPO_ROOT, "docs/images/fixture");
const VIEW_TYPE = "koda-agent-view";
/** Garantiert tote Ports fuer die Fehlerfaelle — nichts hoert dort, und ein Tippfehler
 *  im Test darf nie versehentlich einen echten Endpunkt treffen. */
const DEAD_A = "http://127.0.0.1:9999";
const DEAD_B = "http://127.0.0.1:9998";
/** Wie lange Pruefpunkt 3 NACH dem erfolgreichen Status weiter zusieht, bevor er gruen
 *  meldet. Begruendung an der Stelle selbst — kurz: ein verzoegert eintretender Freeze
 *  war vorher unsichtbar. */
const NACHBEOBACHTUNG_MS = 9000;

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
  /** Pruefpunkt 13 setzt das Modell voruebergehend auf einen Always-on-Namen. */
  model: string;
  suppressThinking: boolean;
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
async function startFakeEndpoint(wunschPort = 0): Promise<{ url: string; port: number; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      req.url?.includes("/v1/models") === true
        ? JSON.stringify({ data: [{ id: "smoke-model", object: "model" }] })
        : JSON.stringify({ ok: true }),
    );
  });
  await new Promise<void>((resolve) => server.listen(wunschPort, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  // `close()` gibt ein Promise: Punkt 19 startet denselben Port wieder und braucht die
  // Zusage, dass er wirklich frei ist — ein `server.close()` ohne Warten laesst das
  // erneute `listen` mit EADDRINUSE scheitern, und der Punkt waere rot am Falschen.
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    close: () => new Promise<void>((resolve) => { server.close(() => { resolve(); }); }),
  };
}

/**
 * Wie `pollUntil`, nur auf ZWEI Fenstern zugleich — fuer Punkt 18: die Settings-Bruecke hat
 * kein `window.app` (s. Kopfkommentar von `attachTo`), also ist von hier aus nicht sicher
 * entschieden, ob das Vorschau-Modal im Haupt- oder im Einstellungsfenster entsteht. Statt
 * das zu raten, wird auf beiden gepollt; welches zuerst liefert, gewinnt — `from` haelt fest,
 * welches das war, fuer den Detailtext und zum gezielten Schliessen danach.
 */
async function pollEither<T>(
  a: Cdp,
  b: Cdp,
  expression: string,
  timeoutMs = 8000,
  stepMs = 500,
): Promise<{ value: T; from: "a" | "b" } | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const va = await a.evaluate<T | null>(expression);
    if (va) return { value: va, from: "a" };
    const vb = await b.evaluate<T | null>(expression);
    if (vb) return { value: vb, from: "b" };
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  return null;
}

/**
 * Staging-Vault aus dem getrackten Fixture herstellen (`--setup`).
 *
 * Der Vault ist Wegwerfware: sein Inhalt kommt vollstaendig aus `docs/images/fixture/`.
 * Geht er verloren, ist der naechste Lauf trotzdem reproduzierbar — das ist der Unterschied
 * zu dem von Hand angelegten Vault, den dieser Treiber bis zum 2026-09-01 vorausgesetzt hat.
 *
 * Plugin-Einstellungen schreibt `--setup` bewusst KEINE: `buildVault` entfernt `data.json`,
 * und die Auslieferungs-Defaults bringen den Endpunkt `http://127.0.0.1:1234` bereits mit
 * (`DEFAULT_SETTINGS` in src/core/settings-types.ts). Der Lauf misst damit den Zustand einer
 * frischen Installation und nicht den einer nachgepflegten Konfiguration.
 */
function setup(): void {
  const vaultDir = stagingVaultDir(REPO_NAME);
  const log = buildVault({
    repoRoot: REPO_ROOT,
    vaultDir,
    fixtureDir: FIXTURE_DIR,
    pluginId: PLUGIN_ID,
  });
  console.log(`Staging-Vault: ${vaultDir}`);
  for (const zeile of log) console.log(`  ${zeile}`);
  console.log(
    "\nJetzt den Vault oeffnen — NICHT Obsidian beenden, falls es laeuft (Single-Instance,\n" +
      "siehe Dateikopf). Ein frisch gebauter Vault ist Obsidian unbekannt, `?vault=` tut dann\n" +
      "nichts; der URI mit dem PFAD einer Datei registriert ihn und oeffnet ein zweites Fenster\n" +
      "derselben Instanz:\n" +
      `  open "obsidian://open?path=${encodeURIComponent(join(vaultDir, "Notes", "Project plan.md"))}"\n` +
      "Ein frisch geoeffnetes Fenster fragt einmalig nach Vertrauen und beantwortet bis zum\n" +
      "Wegklicken KEINEN Aufruf — das sieht wie ein haengender Renderer aus.\n" +
      `Danach: npm run smoke:gui -- --vault ${REPO_NAME}`,
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--setup")) {
    setup();
    return;
  }
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
  let fake: { url: string; port: number; close: () => Promise<void> } | null = null;

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
      return { endpoints: JSON.parse(JSON.stringify(s.endpoints)), timeoutSec: s.timeoutSec, model: s.model, suppressThinking: s.suppressThinking };
    `);

    // --- 2. Die Sidebar oeffnet und ist bedienbar ---------------------------
    // Mutation (Command feuern) und Wartephase (auf gerenderte View pollen) sind
    // getrennt: `Cdp.send` bricht nach 30 s ab, `pollUntil` fragt stattdessen
    // wiederholt in eigenen, kurzen `Runtime.evaluate`-Aufrufen von der Node-Seite nach.
    await cdp.evaluate(`
      await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:open`)});
      return true;
    `);
    const view = await pollUntil<{
      leaves: number; input: boolean; buttons: string[]; cta: boolean;
      actions: { label: string; sichtbar: boolean; hoehe: number }[];
      inSidebar: boolean; hasThink: boolean; hasNewChat: boolean; status: boolean;
    }>(
      cdp,
      `
        const leaves = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)});
        const el = leaves[0]?.view?.containerEl;
        if (!el) return null;
        const buttons = [...el.querySelectorAll(".koda-buttons button")].map((b) => b.textContent.trim());
        if (buttons.length === 0) return null;
        const view0 = leaves[0].view;
        // ⚠️ Gemessen wird die GROESSE, nicht die Existenz — und das ist der ganze Punkt.
        // Bis 0.10.0 hingen beide Aktionen an addAction(), also im echten View-Kopf. Den
        // blendet Obsidian in JEDER Seitenleiste per app.css aus
        // (.workspace-split.mod-right-split .view-header { display: none }), weshalb sie
        // im DOM standen und niemand sie sehen konnte. Dieser Pruefpunkt war die ganze Zeit
        // gruen, weil er querySelectorAll zaehlte. Ein Nutzer hat den Defekt gefunden,
        // nicht der Automat (2026-09-01). Seither: getBoundingClientRect.
        //
        // Die zweite Haelfte ist inSidebar: im Hauptbereich IST der Kopf sichtbar, dort
        // waere auch die alte Fassung gruen gewesen. Der Punkt muss also belegen, dass er
        // unter der Bedingung misst, unter der der Defekt auftrat — sonst prueft er den
        // Nachbarfall (Lesson 2026-09-01, „Beleg-Test mit erfundenem Namen").
        const wurzel = leaves[0].getRoot();
        const inSidebar = wurzel === app.workspace.leftSplit || wurzel === app.workspace.rightSplit;
        const actions = [...el.querySelectorAll(".koda-header-action")].map((a) => {
          const r = a.getBoundingClientRect();
          return { label: a.getAttribute("aria-label") ?? "", sichtbar: r.width > 0 && r.height > 0, hoehe: Math.round(r.height) };
        });
        const think = view0.thinkActionEl;
        const hasThink = !!think && el.contains(think) && think.getBoundingClientRect().height > 0;
        const neu = actions.find((a) => /Neues Gespräch|New chat/.test(a.label));
        const hasNewChat = !!neu && neu.sichtbar;
        return {
          leaves: leaves.length,
          input: !!el.querySelector("textarea.koda-input"),
          buttons,
          cta: !!el.querySelector(".koda-buttons button.mod-cta"),
          actions,
          inSidebar,
          hasThink,
          hasNewChat,
          status: !!el.querySelector(".koda-status"),
        };
      `,
      8000,
    );
    record(
      "2. Sidebar oeffnet mit Eingabefeld, zwei Knoepfen und zwei SICHTBAREN Kopfzeilen-Aktionen",
      view !== null && view.input && view.buttons.length === 2 && view.cta &&
        view.inSidebar && view.hasThink && view.hasNewChat && view.status,
      view
        ? `${view.leaves} Leaf · in Seitenleiste: ${String(view.inSidebar)} · Knoepfe: ${view.buttons.join(", ")} · Kopfzeile: ${view.actions.map((a) => `${a.label}[${a.hoehe}px]`).join(" | ")} · Thinking sichtbar: ${view.hasThink} · Statuszeile: ${view.status}`
        : "keine View entstanden",
    );

    // --- 3. Der Freeze-Waechter ---------------------------------------------
    // Der teuerste Fund des Projekts (2026-08-06): der Klick auf „Testen“ schickte den
    // Renderer in eine Endlosschleife. Deshalb wird hier NICHT geprueft, ob ein Handler
    // lief, sondern ob der Renderer den Klick **ueberlebt**: kommt keine Antwort mehr,
    // laeuft der CDP-Aufruf in seine Zeitueberschreitung und der Punkt wird rot.
    //
    // Erst die Existenz des Knopfes belegen, dann klicken: ein Klick ins Leere waere
    // sonst gruen — ausgerechnet im Defektfall (Falle „Pruefpunkt ohne Gegenstand“).
    //
    // ⚠️ WAS DIESER PUNKT BELEGT UND WAS NICHT. Belegt ist: der Renderer ueberlebt den
    // Klick, und ein erreichbarer Endpunkt wird als `is-ok` erkannt. NICHT belegt ist,
    // dass er den historischen Freeze fangen wuerde — die Gegenprobe am 2026-08-07 (mit
    // wieder eingebautem `setDisabled()`) blieb gruen, der Defekt ist seither nicht
    // reproduzierbar. Der Punkt ist gegen seinen eigenen Bug also **unbewiesen**; nur die
    // beiden Aussagen darueber sind gemessen. Nachgebaut wird der Freeze bewusst nicht:
    // das belegte, dass der Punkt einen NACHGEBAUTEN Freeze sieht, was eine andere
    // Aussage ist. Offen gefuehrt als geparkte Task „Freeze-Gegenprobe klaeren“ im
    // Cockpit; taucht der Freeze im Alltag wieder auf, wird sie hochgeholt.
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
            const rows = [...document.querySelectorAll(".setting-item")].filter((r) => r.querySelector(".okit-ep-status"));
            return rows.length >= 2 ? rows.length : 0;
          `,
          8000,
        );
        const hatZeile = zeilen !== null && zeilen >= 2;

        if (!hatZeile) {
          record("3. Klick auf „Verbindung prüfen“ friert den Renderer nicht ein", false, "Endpunkt-Zeile im Einstellungsfenster nicht gefunden");
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
            // Seit dem Kit-Umstieg (2026-08-28) gibt es KEINEN Testen-Knopf je Zeile mehr:
            // der Kit-Baustein setzt Preset- und „Verbindung pruefen"-Knoepfe in eine eigene
            // `actions`-Zeile am Listenende, und deren letzter Knopf ist der Pruef-Knopf.
            // Sprachfrei ueber die Position gegriffen, nicht ueber den Text — der Treiber
            // laeuft sonst nur auf einer Oberflaechensprache.
            //
            // Der Punkt misst dadurch etwas Staerkeres als vorher: dieser Klick loest einen
            // vollstaendigen Neuaufbau der Liste aus (`rerender()`), nicht nur eine Probe.
            const geklickt = await clickReal(
              settings,
              `(() => {
                 const items = [...document.querySelectorAll(".setting-item")];
                 const letzteZeile = items.map((r, i) => r.querySelector(".okit-ep-status") ? i : -1)
                                          .filter((i) => i >= 0).pop();
                 if (letzteZeile === undefined) return null;
                 const aktionen = items.slice(letzteZeile + 1).find((r) => r.querySelectorAll("button").length > 0);
                 const knoepfe = aktionen ? [...aktionen.querySelectorAll("button")] : [];
                 return knoepfe[knoepfe.length - 1] ?? null;
               })()`,
            );
            if (!geklickt) throw new Error("„Verbindung pruefen\"-Knopf nicht klickbar (unsichtbar oder nicht vorhanden)");
            status = await pollUntil<string>(
              settings,
              `
                const rows2 = [...document.querySelectorAll(".setting-item")].filter((r) => r.querySelector(".okit-ep-status"));
                const el = rows2[0]?.querySelector(".okit-ep-status");
                if (!el) return null;
                if (el.classList.contains("is-ok")) return "is-ok";
                if (el.classList.contains("is-error")) return "is-error";
                return null;
              `,
              12_000,
            );
            // Der Freeze von 2026-08-06 nahm BEIDE Fenster mit. Das Hauptfenster wird
            // deshalb mitgeprueft: antwortet es nicht mehr, ist der Punkt rot, auch wenn
            // das Einstellungsfenster noch gezuckt hat.
            //
            // Das `return true` ist KEINE tote Assertion, auch wenn es so aussieht: die
            // Aussage steckt nicht im Wert, sondern darin, DASS eine Antwort kommt. Haengt
            // der Renderer des Hauptfensters, laeuft dieser Aufruf in seine
            // Zeitueberschreitung, das `catch` unten greift und der Punkt wird rot. Ein
            // Ping, kein Vergleich — vermerkt, weil die Zeile beim Lesen wie der Fehler
            // aussieht, den sie gerade nicht macht.
            // ⚠️ NACHBEOBACHTUNG, seit 2026-09-02 — der Punkt mass vorher zu frueh.
            // Bis dahin endete er, sobald `is-ok` erschien (im Lauf vom 01.09. nach 1031 ms).
            // Ein Freeze, der ERST beim Zurueckkommen des Netzabrufs eintritt, waere damit
            // unsichtbar gewesen: der Punkt haette laengst gruen gemeldet. Der Hinweis kam
            // aus der Session `anysource-sideloader` (2026-09-01), die einen gleich
            // aussehenden Freeze jagte — bei ihr trat er verzoegert ein, ihr eigener
            // Pruefpunkt blieb deshalb im Defektzustand gruen, und erst das Zurueckschreiben
            // der Einstellungen am Laufende scheiterte an einem toten Renderer. Es ist eine
            // WEITERGABE, keine eigene Messung, und ihr Fall ist ausdruecklich kein zweiter
            // Beleg fuer die `setDisabled`-Hypothese (sie hat zwei Verdaechtige zugleich
            // entfernt) — er erklaert aber, warum unsere Gegenprobe vom 2026-08-07 scheitern
            // konnte, ohne dass der Defekt weg war.
            //
            // Gewartet wird auf der NODE-Seite: im Renderer kommt bei genau diesem Defekt
            // kein `setTimeout` mehr zurueck, eine Wartezeit dort waere also selbst Teil
            // des Haengers. Die 9 s sind der Wert, bei dem der fremde Fall sichtbar wurde —
            // ein Anhaltspunkt, keine gemessene Schwelle fuer Koda.
            await new Promise((resolve) => setTimeout(resolve, NACHBEOBACHTUNG_MS));
            const hauptfensterLebt = await cdp.evaluate<boolean>(`return true;`);
            const settingsLebt = await settings.evaluate<boolean>(`return true;`);
            survived = status === "is-ok" && hauptfensterLebt && settingsLebt;
            detail =
              status === "is-ok"
                ? `Status is-ok nach ${Date.now() - t0 - NACHBEOBACHTUNG_MS} ms · beide Fenster antworten auch ${NACHBEOBACHTUNG_MS} ms spaeter`
                : `Status ${status ?? "(keiner)"} statt is-ok — erreichbarer Endpunkt nicht als solcher erkannt`;
          } catch (error) {
            survived = false;
            detail = `Renderer antwortet nicht mehr (${error instanceof Error ? error.message : String(error)}) — Freeze-Verdacht`;
          }
          record("3. Klick auf „Verbindung prüfen“ friert den Renderer nicht ein", survived, detail);

          // --- 4. Der Status ist der echte Status -----------------------------
          // Gegen einen toten Port MUSS „nicht erreichbar“ stehen. Ein Statuspunkt, der
          // immer gruen ist, waere schlimmer als keiner — deshalb wird die zweite Zeile
          // (toter Port) separat geklickt statt die erste nur anders interpretiert.
          //
          // Seit dem Kit-Umstieg braucht dieser Punkt KEINEN Klick mehr: der Baustein laedt
          // Status und Modell-Liste jeder Zeile beim Zeichnen. Er misst damit naeher am
          // Erlebten — ob der Nutzer den toten Endpunkt sieht, ohne etwas zu tun. Der Klick
          // auf Punkt 3 (globales „Verbindung pruefen") hat die Liste gerade neu aufgebaut,
          // die Proben laufen also frisch.
          let tot: string | null = null;
          try {
            tot = await pollUntil<string>(
              settings,
              `
                const rows2 = [...document.querySelectorAll(".setting-item")].filter((r) => r.querySelector(".okit-ep-status"));
                const el = rows2[1]?.querySelector(".okit-ep-status");
                if (!el) return null;
                if (el.classList.contains("is-error")) return "is-error";
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
            tot === "is-error",
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
    const szene = await cdp.evaluate<{ ziel: string | null; vorher: string | null; verworfen?: string[] }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      // Bewusst NICHT die gerade aktive Notiz: waere sie das Ziel, blieben vorher und
      // nachher gleich und der Punkt waere rot, obwohl der Klick funktioniert hat
      // (im Lauf vom 2026-08-07 genau so passiert).
      const aktiv = app.workspace.getActiveFile()?.path ?? null;
      const view = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0].view;
      // ⚠️ Das Ziel wird PROBIERT, nicht gewaehlt. Gemessen 2026-08-30: der Punkt fiel auf
      // TaskNotes/Tasks/test.md, und das TaskNotes-Plugin ersetzt den Wikilink beim Rendern
      // durch ein eigenes Inline-Widget (span.tasknotes-inline-widget) — kein a.internal-link,
      // Punkt rot, obwohl an Koda nichts kaputt war. Vorher war er gruen, weil die Auswahl
      // ("erste Datei != die aktive") vom Zustand des VORIGEN Laufs abhing: Lauf 1 machte
      // _Cockpit.md aktiv, also traf Lauf 2 die naechste Datei.
      // Lehre, die ueber diesen Fall hinausgeht: wer seine Testdaten aus dem Nutzer-Vault
      // nimmt, misst irgendwann ein fremdes Plugin. Deshalb bis zu fuenf Kandidaten
      // durchprobieren und den ersten nehmen, bei dem Kodas eigener Link wirklich entsteht.
      const kandidaten = app.vault.getMarkdownFiles().filter((f) => f.path !== aktiv).slice(0, 5);
      let ziel = null;
      const verworfen = [];
      for (const k of kandidaten) {
        p.chatLog = [{ role: "assistant", content: "Siehe [[" + k.path.replace(/\\.md$/, "") + "]]." }];
        view.renderLog();
        await new Promise((r) => setTimeout(r, 400));
        if (document.querySelector(".koda-log a.internal-link")) { ziel = k.path; break; }
        verworfen.push(k.path);
      }
      if (!ziel) return { ziel: null, vorher: aktiv, verworfen };
      return { ziel, vorher: aktiv, verworfen };
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
        ? `kein Kandidat rendert einen eigenen Wikilink — verworfen: ${(szene.verworfen ?? []).join(", ") || "(keiner)"}`
        : gerendert
          ? `${szene.ziel} · aktiv vorher ${szene.vorher ?? "(keine)"} → nachher ${nachher ?? "(keine — Navigation blieb aus)"}${(szene.verworfen ?? []).length > 0 ? ` · uebersprungen (Fremd-Widget): ${(szene.verworfen ?? []).join(", ")}` : ""}`
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

    // --- 9. Statuszeile ueber eine ganze Werkzeug-Runde ----------------------
    // Kein Modell noetig: gespeist wird der Zustandsautomat direkt mit derselben
    // Ereignisfolge, die main.ts aus dem Agent-Loop durchreicht. Geprueft wird die
    // ZUSAMMENSETZUNG (Klasse + Icon + Text), nicht nur das Vorhandensein — eine Zeile,
    // die immer „arbeitet" sagt, waere gruen und trotzdem kaputt.
    const status = await cdp.evaluate<{ steps: { cls: string; icon: string; text: string }[] }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const v = p.views()[0];
      const el = v.containerEl.querySelector(".koda-status");
      const snap = () => ({
        cls: el.className,
        icon: el.querySelector(".koda-status-icon svg")?.getAttribute("class") ?? "",
        text: el.querySelector(".koda-status-label")?.textContent ?? "",
      });
      const steps = [];
      v.activity({ kind: "ask" });                                                    steps.push(snap());
      v.activity({ kind: "tool-start", name: "search_notes", args: '{"query":"Stress"}' }); steps.push(snap());
      v.activity({ kind: "tool-end" });                                                steps.push(snap());
      v.activity({ kind: "token" });                                                   steps.push(snap());
      v.activity({ kind: "done" });                                                    steps.push(snap());
      return { steps };
    `);
    const [ask, tool, back, writing, done] = status.steps;
    record(
      "9. Statuszeile nennt die Taetigkeit und dreht sich dabei",
      ask?.cls.includes("is-checking") === true &&
        tool?.text.includes("Stress") === true &&
        back?.text === ask?.text &&
        writing?.text !== ask?.text &&
        done?.cls.includes("is-checking") === false,
      status.steps.map((x) => `${x.text}[${x.cls.replace("koda-status", "").trim()}]`).join(" → "),
    );

    // --- 10. Kontextfenster-Auslastung im Ruhezustand ------------------------
    // Schliesst die Messluecke „Kontextfenster-Uebernahme ist ungemessen" von der anderen
    // Seite: hier wird nicht das Settings-Feld geprueft, sondern dass die Zahl daraus in
    // der Sidebar ankommt. Gegenprobe mit einem winzigen Fenster — die Zahl muss steigen.
    const usage = await cdp.evaluate<{ normal: string; tiny: string; warnCls: string }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const v = p.views()[0];
      const el = v.containerEl.querySelector(".koda-status");
      const before = p.settings.contextWindowTokens;
      p.chatLog.push({ role: "user", content: "x".repeat(4000) });
      v.activity({ kind: "done" });
      const normal = el.querySelector(".koda-status-label").textContent;
      p.settings.contextWindowTokens = 1024;
      v.activity({ kind: "done" });
      const tiny = el.querySelector(".koda-status-label").textContent;
      const warnCls = el.className;
      p.settings.contextWindowTokens = before;
      p.chatLog.pop();
      v.activity({ kind: "done" });
      return { normal, tiny, warnCls };
    `);
    const pct = (s: string): number => Number(/(\d+)/.exec(s)?.[1] ?? "-1");
    record(
      "10. Statuszeile zeigt die Belegung des Kontextfensters",
      pct(usage.normal) >= 0 && pct(usage.tiny) > pct(usage.normal) && usage.warnCls.includes("is-warning"),
      `${usage.normal} → bei 1024 Token: ${usage.tiny} (${usage.warnCls.includes("is-warning") ? "gewarnt" : "keine Warnung"})`,
    );

    // --- 11. Thinking-Schalter im Kopf --------------------------------------
    // Beide Richtungen, und das Ueberleben eines Neuaufbaus: der Zustand kommt aus den
    // Einstellungen, nicht aus dem DOM — sonst faellt er beim naechsten Redraw zurueck.
    const think = await cdp.evaluate<{ start: boolean; after: boolean; label: string; survives: boolean }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const v = p.views()[0];
      const start = p.settings.suppressThinking;
      await v.toggleThinking();
      const after = p.settings.suppressThinking;
      // NICHT querySelector(".view-action") — das ist Obsidians erste Aktion (Lesezeichen).
      // Genau so war dieser Punkt am 2026-08-30 gruen, ohne den Schalter je anzusehen.
      const label = v.thinkActionEl?.getAttribute("aria-label") ?? "";
      v.syncThinkAction();
      const survives = v.thinkActionEl?.getAttribute("aria-label") === label;
      p.settings.suppressThinking = start;
      await p.saveSettings();
      return { start, after, label, survives };
    `);
    record(
      "11. Thinking-Schalter im Kopf schaltet und ueberlebt den Neuaufbau",
      think.start !== think.after && /Thinking/.test(think.label) && think.survives,
      `${String(think.start)} → ${String(think.after)} · Beschriftung „${think.label}"`,
    );

    // --- 12. Verwerfen fragt nach ------------------------------------------
    // Der Quicktask sagt: „man klickt leicht aus Versehen auf Neues Gespraech und verliert
    // alles ohne Rueckkehrmoeglichkeit". Geprueft wird deshalb der Abbruch-Weg — dass die
    // Bestaetigung erscheint UND dass ein Nein den Verlauf stehen laesst.
    const discard = await cdp.evaluate<{ modal: boolean; kept: number; before: number; titel: string; fremd: number }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const v = p.views()[0];
      p.chatLog.push({ role: "user", content: "SMOKE-BEHALTEN" });
      v.renderLog();
      const before = p.chatLog.length;
      // .modal-container ist ein GETEILTER Ort — jedes Plugin kann dort ein Modal haben.
      // Deshalb erst sicherstellen, dass keines offen ist, und danach pruefen, dass das
      // gefundene wirklich Kodas ist. Ohne das klickt der Punkt im Zweifel den Abbrechen-
      // Knopf eines fremden Dialogs und meldet trotzdem gruen. (Gleiches Muster wie der
      // .view-action-Fehler in Punkt 11 und die geteilte .notice-Leiste, 2026-08-30.)
      const fremd = document.querySelectorAll(".modal-container").length;
      v.askNewChat();
      await new Promise((r) => setTimeout(r, 300));
      const container = [...document.querySelectorAll(".modal-container")].pop();
      const titel = container?.querySelector(".modal-title")?.textContent ?? "";
      const meins = /Gespräch verwerfen|Discard this conversation/.test(titel);
      const modal = meins ? container.querySelector(".modal-button-container") : null;
      const found = !!modal && fremd === 0;
      // Abbrechen ist der erste Knopf (Cancel links, UI-STANDARD §2).
      modal?.querySelector("button")?.click();
      await new Promise((r) => setTimeout(r, 300));
      const kept = p.chatLog.length;
      p.chatLog.pop();
      v.renderLog();
      return { modal: found, kept, before, titel, fremd };
    `);
    record(
      "12. „Neues Gespraech“ fragt nach, Abbruch laesst den Verlauf stehen",
      discard.modal && discard.kept === discard.before,
      discard.fremd > 0
        ? `${discard.fremd} fremde(s) Modal offen — Punkt nicht entscheidbar`
        : `Modal „${discard.titel}" · Verlauf ${discard.before} → ${discard.kept} Eintraege`,
    );

    // --- 13. Der dritte Zustand des Thinking-Schalters -----------------------
    // Punkt 11 prueft das Umschalten; die inhaltlich interessante Zusicherung ist aber die
    // SPERRE: Modelle wie gpt-oss/harmony lehnen `reasoning_effort:"none"` ab, deshalb darf
    // der Schalter dort kein Abschalten versprechen. Das ist ueber den Modell-NAMEN pruefbar,
    // weil `isAlwaysOnThinker` eine Namensheuristik ist — es braucht also kein solches Modell,
    // und genau deshalb gehoert der Punkt in den Automaten statt in die Handliste.
    //
    // ⚠️ Was er belegt: die Anzeige-Seite und dass ein Klick folgenlos bleibt (der Handler
    // prueft die Sperre erneut — ein veralteter DOM-Klick darf nie durchschlagen). NICHT
    // belegt ist die Request-Seite (dass gpt-oss die Parameter wirklich ablehnt); die ist per
    // Unit-Test fixiert und braucht ein echtes Modell.
    const dritte = await cdp.evaluate<{
      normalAus: { label: string; disabled: string; klassen: string[] };
      normalAn: { label: string; disabled: string; klassen: string[] };
      gesperrt: { label: string; disabled: string; klassen: string[] };
      vorKlick: boolean;
      nachKlick: boolean;
    }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const v = p.views()[0];
      const lies = () => {
        const el = v.thinkActionEl;
        return {
          label: el?.getAttribute("aria-label") ?? "",
          disabled: el?.getAttribute("aria-disabled") ?? "",
          klassen: el ? [...el.classList].filter((c) => c.startsWith("is-")) : [],
        };
      };
      p.settings.model = "qwen3:8b";
      p.settings.suppressThinking = true;  v.syncThinkAction(); const normalAus = lies();
      p.settings.suppressThinking = false; v.syncThinkAction(); const normalAn = lies();
      // Ein Name, den isAlwaysOnThinker erkennt — das Modell muss nicht existieren.
      p.settings.model = "gpt-oss:20b";    v.syncThinkAction(); const gesperrt = lies();
      const vorKlick = p.settings.suppressThinking;
      await v.toggleThinking();
      const nachKlick = p.settings.suppressThinking;
      return { normalAus, normalAn, gesperrt, vorKlick, nachKlick };
    `);
    record(
      "13. Thinking-Schalter sperrt bei einem Modell, das sich nicht abschalten laesst",
      dritte.normalAus.disabled === "false" &&
        dritte.normalAn.disabled === "false" &&
        dritte.normalAus.klassen.includes("is-off") &&
        dritte.gesperrt.disabled === "true" &&
        dritte.gesperrt.klassen.includes("is-disabled") &&
        dritte.vorKlick === dritte.nachKlick,
      `normal: „${dritte.normalAn.label}" / „${dritte.normalAus.label}" · gesperrt: „${dritte.gesperrt.label}" · Klick folgenlos: ${String(dritte.vorKlick === dritte.nachKlick)}`,
    );

    // --- 16. Reset stellt den Auslieferungsstand her -------------------------
    // Anweisung setzen (dieselbe Kette wie Punkt 3/4: Wert setzen, dann erst das Fenster
    // oeffnen), den rotate-ccw-Knopf mit clickReal druecken, danach pruefen: Override UND
    // Textarea leer, Platzhalter (die ausgelieferte Fassung) weiterhin da. Vorwert gesichert
    // und zurueckgeschrieben wie beim Thinking-Schalter (Punkt 13) — ein Abbruch darf keinen
    // fremden Prompt stehen lassen.
    const vorherPrompt = await cdp.evaluate<string>(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.systemPromptOverride;
    `);
    try {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.systemPromptOverride = "SMOKE-EIGENE-ANWEISUNG";
        await p.saveSettings();
        app.setting.open();
        app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
        return true;
      `);
      // Das Fenster entsteht erst durch `open()` — vorher gibt es kein Target (wie Punkt 3).
      await new Promise((resolve) => setTimeout(resolve, 1200));

      let settings16: Cdp | null = null;
      try {
        settings16 = await attachTo("settings", port, vault);
        if (!settings16) {
          record("16. Zuruecksetzen stellt den Auslieferungsstand her", false, "Einstellungsfenster nicht gefunden");
        } else {
          await settings16.send("Page.bringToFront");
          const vorKlick = await pollUntil<{ value: string }>(
            settings16,
            `
              const ta = document.querySelector("textarea.koda-prompt-textarea");
              return ta ? { value: ta.value } : null;
            `,
            8000,
          );
          if (vorKlick === null) {
            record("16. Zuruecksetzen stellt den Auslieferungsstand her", false, "Anweisungs-Textarea nicht gefunden");
          } else {
            const geklickt = await clickReal(
              settings16,
              `(() => {
                 const item = document.querySelector("textarea.koda-prompt-textarea")?.closest(".setting-item");
                 const kandidaten = item ? [...item.querySelectorAll("[aria-label]")] : [];
                 return kandidaten.find((el) => /Ausgelieferte Fassung wiederherstellen|Restore the shipped version/.test(el.getAttribute("aria-label") ?? "")) ?? null;
               })()`,
            );
            const leer = geklickt
              ? await pollUntil<boolean>(
                  cdp,
                  `return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.systemPromptOverride === "";`,
                  4000,
                )
              : null;
            const nachher = await pollUntil<{ value: string; placeholder: string }>(
              settings16,
              `
                const ta = document.querySelector("textarea.koda-prompt-textarea");
                return ta ? { value: ta.value, placeholder: ta.placeholder } : null;
              `,
              4000,
            );
            record(
              "16. Zuruecksetzen stellt den Auslieferungsstand her",
              geklickt === true && leer === true && nachher !== null && nachher.value === "" && nachher.placeholder !== "",
              `vorher: „${vorKlick.value}" · geklickt: ${String(geklickt)} · Override leer: ${String(leer)} · danach: ${JSON.stringify(nachher)}`,
            );
          }
        }
      } finally {
        settings16?.close();
      }
    } finally {
      // Vorwert zurueck — auch wenn der Punkt oben abgebrochen ist. Sonst bleibt dem Nutzer
      // eine fremde SMOKE-Anweisung oder ein zu frueh geleerter eigener Prompt stehen.
      await cdp
        .evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.settings.systemPromptOverride = ${JSON.stringify(vorherPrompt)};
          await p.saveSettings();
          app.setting.close();
          return true;
        `)
        .catch(() => undefined);
    }

    // --- 17. Ein abgeschaltetes Werkzeug wird nicht gesendet -----------------
    // Gemessen wird `plugin.currentToolNames()` — DIESELBE Methode, die `ask()` ruft, um die
    // Liste zu bauen; es gibt keinen zweiten Weg. Der Punkt misst damit die GESENDETE Liste,
    // nicht den Schalter, und braucht dafuer kein Modell. Die dritte Bedingung
    // (`wieder.includes`) ist kein Beiwerk: sie belegt, dass der Punkt seinen Gegenstand
    // wirklich bewegt hat — ohne sie waere eine Liste, die `write_note` nie enthielt, ebenso
    // gruen. Vorwert gesichert und zurueckgeschrieben wie bei Punkt 16/13.
    const vorherDisabled = await cdp.evaluate<string[]>(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.toolsDisabled;
    `);
    try {
      const mitAus = await cdp.evaluate<string[]>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.toolsDisabled = ["write_note"];
        await p.saveSettings();
        return p.currentToolNames();
      `);
      const wieder = await cdp.evaluate<string[]>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.toolsDisabled = ${JSON.stringify(vorherDisabled ?? [])};
        await p.saveSettings();
        return p.currentToolNames();
      `);
      record(
        "17. Abgeschaltetes Werkzeug wird nicht gesendet",
        !mitAus.includes("write_note") && mitAus.includes("read_note") && wieder.includes("write_note"),
        `aus: ${mitAus.join(", ")} · wieder: ${wieder.join(", ")}`,
      );
    } finally {
      await cdp
        .evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.settings.toolsDisabled = ${JSON.stringify(vorherDisabled ?? [])};
          return p.saveSettings();
        `)
        .catch(() => undefined);
    }

    // --- 18. „Aktive Anweisung ansehen" zeigt Memory und Skills ---------------
    // `previewSystemPrompt()` ruft DIESELBE `buildSystemPrompt` wie `ask()` — kein Nachbau
    // (Spec E6, s. Kopfkommentar von prompt-modal.ts). Geprueft wird deshalb nicht die
    // Zusammensetzung selbst (das ist Sache der Unit-Tests fuer build.ts), sondern die
    // Modal-Naht: kommt der fertige Text im `<pre class="koda-prompt-preview">` an, und
    // traegt er beide Abschnitte, die der Staging-Vault ueber sein Fixture immer hat?
    await cdp.evaluate(`
      app.setting.open();
      app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
      return true;
    `);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    let settings18: Cdp | null = null;
    try {
      settings18 = await attachTo("settings", port, vault);
      if (!settings18) {
        record("18. „Aktive Anweisung ansehen“ zeigt Memory und Skills", false, "Einstellungsfenster nicht gefunden");
      } else {
        await settings18.send("Page.bringToFront");
        const knopfDa = await pollUntil<boolean>(
          settings18,
          `
            const btn = [...document.querySelectorAll("button")].find((b) => /Aktive Anweisung ansehen|Show active instructions/.test(b.textContent ?? ""));
            return !!btn;
          `,
          8000,
        );
        if (!knopfDa) {
          record("18. „Aktive Anweisung ansehen“ zeigt Memory und Skills", false, "Knopf nicht gefunden");
        } else {
          const geklickt = await clickReal(
            settings18,
            `[...document.querySelectorAll("button")].find((b) => /Aktive Anweisung ansehen|Show active instructions/.test(b.textContent ?? "")) ?? null`,
          );
          const gefunden = geklickt
            ? await pollEither<string>(
                cdp,
                settings18,
                `
                  const pre = document.querySelector(".koda-prompt-preview");
                  return pre && pre.textContent.trim() !== "" ? pre.textContent : null;
                `,
                8000,
              )
            : null;
          const text = gefunden?.value ?? "";
          record(
            "18. „Aktive Anweisung ansehen“ zeigt Memory und Skills",
            geklickt === true && text.includes("## Memory") && text.includes("## Skills"),
            gefunden
              ? `Modal im ${gefunden.from === "a" ? "Hauptfenster" : "Einstellungsfenster"} · ${text.length} Zeichen · Memory: ${String(text.includes("## Memory"))} · Skills: ${String(text.includes("## Skills"))}`
              : "kein .koda-prompt-preview mit Text in einem der beiden Fenster",
          );
          // In welchem Fenster auch immer es entstand — auf beiden schliessen ist billiger
          // als vorher zu klaeren, in welchem es sicher steht.
          await cdp.evaluate(`document.querySelector(".modal-container .modal-close-button")?.click(); return true;`).catch(() => undefined);
          await settings18.evaluate(`document.querySelector(".modal-container .modal-close-button")?.click(); return true;`).catch(() => undefined);
        }
      }
    } finally {
      settings18?.close();
      await cdp.evaluate(`app.setting.close(); return true;`).catch(() => undefined);
    }

    // --- 19. `hide()` verwirft den Modell-Cache ------------------------------
    // Der Kit-Vertrag verlangt `cache.clear()` beim SCHLIESSEN des Settings-Tabs
    // (`ModelListCache.clear`, src/vendor/kit/model-list-cache.ts). Der Aufruf steht seit
    // 2026-08-28 in `KodaSettingsTab.hide()` — gemessen hatte ihn nie jemand, und sein
    // Fehlen ist unsichtbar: der Cache haelt Promises je Endpunkt-URL und ueberlebt jeden
    // Tab-NEUAUFBAU bewusst. Ohne `clear()` bleibt ein einmal als „nicht erreichbar"
    // gemessener Endpunkt die RESTLICHE SITZUNG so stehen — wer seinen LLM-Server danach
    // startet und die Einstellungen neu oeffnet, saehe dauerhaft den alten Zustand.
    //
    // Dass das ueberhaupt cachebar ist, haengt an einer Eigenschaft von `probeModels`:
    // es wirft NICHT, sondern liefert `{ status, models: [] }`. Der Cache sieht also kein
    // abgelehntes Promise (das seinen Eintrag selbst verwirft), sondern ein erfolgreiches
    // mit `reachable: false` — und behaelt es.
    //
    // Gemessen wird in DREI Werten, nicht in zwei. Die mittlere Messung ist der Grund,
    // warum der Punkt etwas belegt: sie zeigt, dass der Cache ueberhaupt gegriffen hat.
    // Ohne sie waere „am Ende gruen" auch dann erreicht, wenn nie etwas gecacht wurde —
    // ein Punkt, der seinen Gegenstand nie beruehrt (dieselbe Falle wie beim Beleg-Test
    // mit erfundenem Namen, Lesson 2026-09-01).
    //
    //   A  Server tot, Tab frisch geoeffnet          -> gesperrt   (wird gecacht)
    //   B  Server LEBT wieder, nur Tab-Neuaufbau     -> gesperrt   (Cache haelt)
    //   C  Server lebt, Fenster zu und wieder auf    -> liste:2    (hide() hat geraeumt)
    let hidePunkt = "nicht gelaufen";
    let hideOk = false;
    let settings19: Cdp | null = null;
    try {
      const port19 = fake?.port;
      if (port19 === undefined) throw new Error("kein Fake-Endpunkt aus Punkt 3 vorhanden");
      const url19 = `http://127.0.0.1:${port19}`;
      await fake?.close();
      fake = null;

      const oeffneTab = async (): Promise<void> => {
        await cdp.evaluate(`
          app.setting.open();
          app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
          return true;
        `);
        await new Promise((resolve) => setTimeout(resolve, 1200));
      };
      // Gemessen wird der MODELL-PICKER der Zeile, nicht das Status-Icon — der erste
      // Anlauf dieses Punktes (2026-09-02) hat genau daran gemerkt, dass er am Falschen
      // mass: `.okit-ep-status` haengt an einer eigenen Probe, die der Baustein bei jedem
      // Zeilen-Render frisch faehrt und die deshalb NICHT ueber `ModelListCache` laeuft.
      // Der Cache speist `cache.load(listKey, …)` → `resolveModelChoice` → den Picker:
      // `reachable: false` ergibt `mode: "freetext"` (ein `<input>`), eine erreichbare
      // Liste ein `<select>`. Das ist die Anzeige, fuer die der `clear()`-Vertrag gilt.
      // Die erste Fassung war gruen-faehig ueber etwas anderes; gerettet hat sie die
      // Kontrollmessung B, die „Cache hat nicht gegriffen" meldete statt still zu bestehen.
      // ⚠️ Der Diskriminator ist `select.disabled`, NICHT select-gegen-input. Am 2026-09-02
      // an der laufenden App gemessen: ein toter Endpunkt rendert kein Freitextfeld, sondern
      // ein **gesperrtes** Dropdown mit einer einzigen Option („globales Modell (keins
      // gesetzt)") — `resolveModelChoice` liefert bei `reachable: false` mit erlaubter
      // Leer-Option `mode: "locked"`, und `renderModelPicker` setzt darauf `setDisabled(true)`.
      // Die Fassung davor prueft select-gegen-input und war deshalb dreimal „select": sie
      // konnte die Zustaende gar nicht unterscheiden.
      const pickerZeile0 = async (verbindung: Cdp): Promise<string | null> =>
        pollUntil<string>(
          verbindung,
          `
            const slot = document.querySelector(".okit-ep-row .okit-model-slot");
            if (!slot) return null;
            const sel = slot.querySelector("select");
            if (sel) return sel.disabled ? "gesperrt" : "liste:" + sel.options.length;
            if (slot.querySelector("input")) return "freitext";
            return null;
          `,
          12_000,
        );

      // Genau EINE Zeile, damit `rows[0]` eindeutig der geprobte Endpunkt ist.
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.endpoints = [{ url: ${JSON.stringify(url19)} }];
        await p.saveSettings();
        return true;
      `);
      await oeffneTab();
      settings19 = await attachTo("settings", port, vault);
      if (!settings19) throw new Error("Einstellungsfenster nicht gefunden");
      await settings19.send("Page.bringToFront");
      const a = await pickerZeile0(settings19);

      // Server auf DEMSELBEN Port zurueckholen — die URL im Endpunkt bleibt unveraendert,
      // sonst waere der Cache-Schluessel ein anderer und der Punkt maesse nichts.
      fake = await startFakeEndpoint(port19);

      // B: Neuaufbau OHNE Schliessen. `display()` direkt auf dem aktiven Tab, weil ein
      // `openTabById` auf denselben Tab je nach Obsidian-Fassung `hide()` mitnehmen kann —
      // dann waere die Kontrolle stillschweigend derselbe Fall wie C.
      await cdp.evaluate(`app.setting.activeTab.display(); return true;`);
      await new Promise((resolve) => setTimeout(resolve, 800));
      const b = await pickerZeile0(settings19);

      // C: Fenster zu (das ist der `hide()`-Aufruf) und wieder auf.
      settings19.close();
      settings19 = null;
      await cdp.evaluate(`app.setting.close(); return true;`);
      await new Promise((resolve) => setTimeout(resolve, 600));
      await oeffneTab();
      settings19 = await attachTo("settings", port, vault);
      if (!settings19) throw new Error("Einstellungsfenster nach dem Wiederoeffnen nicht gefunden");
      await settings19.send("Page.bringToFront");
      const c = await pickerZeile0(settings19);

      // C muss eine echte Liste zeigen: der Fake-Endpunkt meldet `smoke-model`, das Dropdown
      // traegt danach Leer-Option + Modell = 2 Optionen. „gesperrt" waere zu schwach —
      // ein entsperrtes, aber leeres Dropdown gaebe es bei erreichbarem Endpunkt ohne Liste.
      hideOk = a === "gesperrt" && b === "gesperrt" && c === "liste:2";
      hidePunkt =
        `Picker bei totem Server: ${a ?? "(keiner)"} · Server zurueck, nur Neuaufbau: ${b ?? "(keiner)"} · nach Schliessen+Oeffnen: ${c ?? "(keiner)"}` +
        (a === "gesperrt" && b !== "gesperrt" ? " — ⚠️ Cache hat nicht gegriffen, der Punkt belegt hide() dann NICHT" : "") +
        (a !== "gesperrt" ? " — ⚠️ toter Server wurde nicht als unerreichbar gelesen, Ausgangslage nicht hergestellt" : "");
    } catch (error) {
      hidePunkt = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      settings19?.close();
      await cdp.evaluate(`app.setting.close(); return true;`).catch(() => undefined);
    }
    record("19. `hide()` verwirft den Modell-Cache (toter Endpunkt bleibt nicht tot)", hideOk, hidePunkt);

    // --- 20. Arbeitsplatz-Block: aktive Notiz und Markierung aus der Sidebar heraus --------
    // Die offene Frage der Spec (E3): bleibt `editor.getSelection()` erhalten, wenn der Fokus ins
    // Eingabefeld wechselt? Gemessen, nicht angenommen. Drei Bedingungen: der aktive Leaf ist
    // Koda (sonst misst der Punkt nicht die Sidebar-Situation), der Block nennt die Notiz mit
    // Kopfdaten, und die Markierung steht drin.
    const vorherMode = await cdp.evaluate<string>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].contextMode;`);
    const punkt20 = await cdp.evaluate<{ aktivIstKoda: boolean; text: string; items: { source: string; path: string; chars: number }[] } | null>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.setContextMode("workspace");
      const file = app.vault.getFileByPath("Notes/Project plan.md");
      if (!file) return null;
      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(file);
      await new Promise((r) => setTimeout(r, 500));
      // Zeile 9 (0-basiert 8) beginnt mit "Model control" — 13 Zeichen.
      leaf.view.editor.setSelection({ line: 8, ch: 0 }, { line: 8, ch: 13 });
      document.querySelector(".koda-input")?.focus();
      await new Promise((r) => setTimeout(r, 300));
      const ctx = p.currentContext();
      return {
        aktivIstKoda: app.workspace.activeLeaf?.view?.getViewType() === ${JSON.stringify(VIEW_TYPE)},
        text: ctx?.text ?? "",
        items: ctx?.items ?? [],
      };
    `);
    const sel20 = punkt20?.items.find((i) => i.source === "selection");
    record(
      "20. Arbeitsplatz-Block nennt aktive Notiz, Kopfdaten und Markierung — aus der Sidebar heraus",
      punkt20 !== null && punkt20.aktivIstKoda && punkt20.text.includes("Notes/Project plan.md") && punkt20.text.includes("status: active") && punkt20.text.includes("Model control") && sel20?.chars === 13,
      punkt20 === null
        ? "Fixture-Notiz Notes/Project plan.md fehlt"
        : `aktiv ist Koda: ${String(punkt20.aktivIstKoda)} · Markierung: ${sel20 ? `${sel20.chars} Zeichen` : "fehlt"} · ${punkt20.text.split("\n")[1] ?? ""}`,
    );

    // --- 21. Modus Aus sendet nichts; Befehl und Dropdown sind EIN Zustand ---------------
    const punkt21 = await cdp.evaluate<{ ausNull: boolean; dropdownNachBefehl: string; modeNachDropdown: string; anObjekt: boolean }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:context-mode-off`)});
      await new Promise((r) => setTimeout(r, 200));
      const ausNull = p.currentContext() === null;
      const sel = document.querySelector(".koda-mode");
      const dropdownNachBefehl = sel ? sel.value : "(kein Dropdown)";
      if (sel) { sel.value = "workspace"; sel.dispatchEvent(new Event("change")); }
      await new Promise((r) => setTimeout(r, 200));
      return { ausNull, dropdownNachBefehl, modeNachDropdown: p.contextMode, anObjekt: p.currentContext() !== null };
    `);
    record(
      "21. Modus Aus sendet keinen Kontext; Befehl und Dropdown schalten denselben Zustand",
      punkt21.ausNull && punkt21.dropdownNachBefehl === "off" && punkt21.modeNachDropdown === "workspace" && punkt21.anObjekt,
      `aus → null: ${String(punkt21.ausNull)} · Dropdown nach Befehl: ${punkt21.dropdownNachBefehl} · Modus nach Dropdown: ${punkt21.modeNachDropdown}`,
    );

    // --- 22. get_workspace und edit_active_note werden gesendet und sind abschaltbar --------
    const vorher22 = await cdp.evaluate<string[]>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.toolsDisabled;`);
    try {
      const an = await cdp.evaluate<string[]>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].currentToolNames();`);
      const aus = await cdp.evaluate<string[]>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.toolsDisabled = ["get_workspace", "edit_active_note"];
        await p.saveSettings();
        return p.currentToolNames();
      `);
      record(
        "22. get_workspace und edit_active_note stehen in der gesendeten Liste und sind abschaltbar",
        an.includes("get_workspace") && an.includes("edit_active_note") && !aus.includes("get_workspace") && !aus.includes("edit_active_note"),
        `an: ${an.join(", ")} · aus: ${aus.join(", ")}`,
      );
    } finally {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.toolsDisabled = ${JSON.stringify(vorher22 ?? [])};
        return p.saveSettings();
      `).catch(() => undefined);
    }

    // --- 23. edit_active_note: veraltete Markierung schreibt nicht; gueltige schreibt -------
    // Der Aufruf laeuft im Renderer als Promise (das Modal blockiert ihn), das Ergebnis landet in
    // window.__koda23. Erst die Gegenprobe (ohne Aenderung) belegt, dass der Punkt seinen
    // Gegenstand beruehrt — sonst waere „nichts geschrieben" auch bei kaputtem Werkzeug gruen.
    const original23 = await cdp.evaluate<string | null>(`
      const f = app.vault.getFileByPath("Notes/Project plan.md");
      return f ? await app.vault.read(f) : null;
    `);
    let detail23 = "nicht gelaufen";
    let ok23 = false;
    try {
      const starte = async (ersatz: string): Promise<void> => {
        await cdp.evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          const file = app.vault.getFileByPath("Notes/Project plan.md");
          const leaf = app.workspace.getLeaf(false);
          await leaf.openFile(file);
          await new Promise((r) => setTimeout(r, 400));
          leaf.view.editor.setSelection({ line: 8, ch: 0 }, { line: 8, ch: 13 });
          window.__koda23 = null;
          p.buildTools().run("edit_active_note", { path: "Notes/Project plan.md", mode: "replace_selection", text: ${JSON.stringify(ersatz)} }).then((r) => { window.__koda23 = r; });
          return true;
        `);
        const modal = await pollUntil<boolean>(cdp, `return !!document.querySelector(".modal-container .koda-preview");`, 8000);
        if (!modal) throw new Error("Bestaetigungs-Modal erschien nicht");
      };
      const bestaetige = async (): Promise<unknown> => {
        await clickReal(cdp, `document.querySelector(".modal-container .modal-button-container button:last-child") ?? null`);
        return pollUntil<unknown>(cdp, `return window.__koda23;`, 8000);
      };
      // A: Markierung nach dem Aufruf verkleinern, dann bestaetigen → Fehler, Datei unveraendert.
      await starte("Model steering");
      await cdp.evaluate(`app.workspace.getMostRecentLeaf().view.editor.setSelection({ line: 8, ch: 0 }, { line: 8, ch: 5 }); return true;`);
      const a = (await bestaetige()) as { ok: boolean; error?: string } | null;
      const inhaltA = await cdp.evaluate<string>(`return app.workspace.getMostRecentLeaf().view.editor.getValue();`);
      // B: Gegenprobe ohne Aenderung → geschrieben.
      await starte("Model steering");
      const b = (await bestaetige()) as { ok: boolean } | null;
      const inhaltB = await cdp.evaluate<string>(`return app.workspace.getMostRecentLeaf().view.editor.getValue();`);
      ok23 = a?.ok === false && /geändert|changed/.test(a?.error ?? "") && inhaltA.includes("Model control makes") && b?.ok === true && inhaltB.includes("Model steering makes");
      detail23 = `veraltet: ${a?.ok === false ? "verweigert" : "GESCHRIEBEN"} (${a?.error ?? ""}) · gueltig: ${b?.ok === true ? "geschrieben" : "verweigert"}`;
    } catch (error) {
      detail23 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      // Fixture-Notiz zuruecksetzen — der Staging-Vault ist Wegwerfware, aber der naechste
      // Punkt im selben Lauf soll die Kulisse vorfinden, die die README verspricht.
      if (original23 !== null) {
        await cdp.evaluate(`
          const f = app.vault.getFileByPath("Notes/Project plan.md");
          if (f) await app.vault.modify(f, ${JSON.stringify(original23)});
          return true;
        `).catch(() => undefined);
      }
      await cdp.evaluate(`
        app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].setContextMode(${JSON.stringify(vorherMode)});
        document.querySelector(".modal-container .modal-close-button")?.click();
        return true;
      `).catch(() => undefined);
    }
    record("23. edit_active_note: veraltete Markierung schreibt nicht, gueltige schreibt (Invariante Vorschau == Inhalt)", ok23, detail23);
  } finally {
    // Aufräumen darf nie am Ergebnis hängen: auch ein abgebrochener Lauf gibt die
    // EINSTELLUNGEN so zurück, wie er sie vorgefunden hat — sonst bleiben tote Endpunkte
    // beim Maintainer stehen.
    //
    // Was hier NICHT wiederhergestellt wird, und das ist Absicht: das laufende Gespräch.
    // Punkt 5 braucht ein frisches (`newChat()` vor dem Failover-Versuch), und der Aufruf
    // hier räumt dessen Fehlermeldung wieder weg. Der vorherige Verlauf ist damit aus der
    // Sidebar verschwunden — nicht verloren: `SessionStore.startNew()` hängt ihn an
    // `sessions/archive.jsonl`, bevor es `current.jsonl` leert. Wer also mitten in einem Gespräch
    // den Smoke fährt, findet danach ein leeres. Gemessen am 2026-08-24: ein Smoke zwischen
    // zwei Messungen kostete den Verlauf, an dem gerade gemessen wurde.
    // Ein echtes Zurückschreiben wäre mehr Mechanik, als der Fall wert ist — die Warnung
    // im Kopfkommentar ist der billigere Weg.
    if (previous !== null) {
      await cdp
        .evaluate(
          `
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.settings.endpoints = ${JSON.stringify(previous.endpoints)};
          p.settings.timeoutSec = ${JSON.stringify(previous.timeoutSec)};
          p.settings.model = ${JSON.stringify(previous.model)};
          p.settings.suppressThinking = ${JSON.stringify(previous.suppressThinking)};
          await p.saveSettings();
          await p.newChat();
          app.setting.close();
          return true;
        `,
        )
        .catch(() => undefined);
    }
    await fake?.close();
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
