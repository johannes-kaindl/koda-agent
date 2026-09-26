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
 * ## Pruefpunkte 43-46 (Etappe 3a, seit 2026-09-25)
 *
 * Alle vier fahren gegen einen Stub der vault-rag-API unter `app.plugins.plugins["vault-retrieval"]`
 * (Muster Punkt 41): 43 Modus Vault sucht mit der GESENDETEN Frage und meldet einen Fehlschlag
 * im Block, 44 Vault ist ohne vault-rag gesperrt (Dropdown und Befehl), 45 Modus Notiz holt
 * Nachbarn per related() und K = 0 schaltet ab, 46 die Vorschau im Kontext-Tab folgt dem
 * Entwurf im Eingabefeld (entprellt). Steht dort schon ein Eintrag, werden sie uebersprungen.
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
 *
 * Mechanik von 20 und 23 (Review-Runde 2026-09-02, `SCENE_JS`): die Notiz wird nie ueber
 * `app.workspace.getLeaf(false)` geoeffnet — das liefert nach Punkt 20s Fokus auf
 * `.koda-input` den Sidebar-Leaf statt den Hauptbereich, mit einem ZWEITEN Editor auf
 * derselben Datei. Aufgeloest wird stattdessen wie in der CDP-Bruecke selbst (`openNote`):
 * `getMostRecentLeaf(rootSplit) ?? getLeaf(true)`, nachdem alle anderen Leaves mit derselben
 * Datei geschlossen wurden. Die Kulisse kommt IMMER per `editor.setValue()` aus dem
 * getrackten Fixture, nie aus dem, was gerade im Vault liegt. Punkt 23 schreibt beim
 * Aufraeumen genauso zurueck, ueber denselben Editor: `app.vault.modify()` neben einem
 * offenen, ungespeicherten Editor-Puffer divergiert, und Obsidian fuehrt beide Staende
 * spaeter zu Artefakten zusammen — gemessen 2026-09-02 als `Model steeringl makes` mit einer
 * verschobenen Leerzeile, nicht als Abbruch.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { cwd } from "node:process";
import { Cdp, attachTo, clickReal, pollUntil, requireVisible } from "../../tools/obsidian-cdp/cdp.js";
import { boxOf, capture } from "../../tools/obsidian-cdp/shot.js";
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

/** Die Fixture-Notiz, wie sie im Repo getrackt ist. Pruefpunkte 20 und 23 STELLEN SIE HER
 *  (per `editor.setValue()`, s. `SCENE_JS`), statt anzunehmen, dass der Vault noch den
 *  Auslieferungsstand zeigt — gemessen 2026-09-02: nach einem vorherigen Lauf tat er das
 *  nicht mehr, und ein hartcodierter Zeilenindex traf die falsche Zeile. */
const FIXTURE_NOTE = readFileSync(join(FIXTURE_DIR, "notes", "Notes", "Project plan.md"), "utf8");

/**
 * Kulissenbau fuer Pruefpunkt 20 und 23 — EIN String fuer beide (Review-Runde 2026-09-02,
 * Punkt 5), sonst laufen sie auseinander, wie es hier schon einmal geschehen ist.
 *
 * Nie `app.workspace.getLeaf(false)`: das liefert den zuletzt AKTIVEN Leaf, und nach Punkt
 * 20s Fokus auf `.koda-input` ist das Koda selbst — die Notiz waere dann in der SIDEBAR
 * offen, mit einem zweiten, unabhaengigen Editor fuer dieselbe Datei (gemessen 2026-09-02:
 * der Hauptbereichs-Editor, den `getMostRecentLeaf(rootSplit)` andernorts liest, sah davon
 * nichts). Der Weg hier ist derselbe wie in `openNote` der CDP-Bruecke:
 * `getMostRecentLeaf(rootSplit) ?? getLeaf(true)` als Fallback. Duplikate werden vorher
 * eingesammelt (nie waehrend der Iteration) — aber NIE der letzte Root-Leaf: zeigt schon ein
 * Root-Leaf die Notiz, bleibt GENAU der stehen (`getRoot() === root`), alle anderen werden
 * geschlossen. Grund, zweite Fix-Runde 2026-09-02: laeuft Punkt 23 direkt nach Punkt 20 und
 * der einzige Root-Leaf ist ausgerechnet der, der die Notiz schon zeigt, detachte die alte
 * Fassung genau ihn — der Root-Split stand leer, und `getLeaf(true)` schlug mit „No tab group
 * found" fehl, weil keine Tab-Gruppe mehr da war, in die er haette oeffnen koennen.
 *
 * Der Text kommt IMMER aus `FIXTURE_NOTE`, nie aus dem, was im Editor oder auf der Platte
 * gerade steht — `editor.setValue()`, nicht `vault.modify()` (dazu mehr bei Punkt 23s
 * `finally`). Die Zielzeile wird ueber ihren INHALT gesucht (`startsWith("Model control
 * makes")`), nie ueber eine angenommene Zeilennummer.
 *
 * Endet mit `leaf`, `ed`, `idx`, `path` UND der 13-Zeichen-Markierung „Model control" in
 * Scope — ausser die Funktion hat schon per `return` verlassen: `-2` wenn die Datei fehlt,
 * `-1` wenn die Zeile nicht gefunden wurde. Der Aufrufer sieht das nur am GESAMT-
 * Rueckgabewert seines eigenen `evaluate()`-Aufrufs, nicht an einer eigenen Zwischenpruefung.
 * Die Markierung setzt die Szene SELBST (dritte Fix-Runde 2026-09-02) — vorher stand das
 * jedem Aufrufer offen, und Pruefpunkt 23 erbte in Fall B die Rest-Markierung aus Fall A statt
 * einer frischen: `edit_active_note` ersetzte „Model" (5 Zeichen, uebrig vom Verkleinern in
 * Fall A) statt „Model control" (13), das Werkzeug arbeitete dabei VOELLIG korrekt und schrieb
 * „Model steering control makes" — der Test hatte schlicht seine eigene Ausgangslage nicht neu
 * hergestellt. Gemessen per Nachstellung, nicht vermutet.
 */
const SCENE_JS = `
      const path = ${JSON.stringify("Notes/Project plan.md")};
      const file = app.vault.getFileByPath(path);
      if (!file) return -2;
      const root = app.workspace.rootSplit;
      const showing = [];
      app.workspace.iterateAllLeaves((l) => { if (l.view?.file?.path === path) showing.push(l); });
      // Einen Root-Leaf mit der Datei behalten (wenn es einen gibt), alle anderen Duplikate schliessen —
      // nie den letzten Root-Leaf detachen, sonst gibt es keine Tab-Gruppe mehr ("No tab group found").
      let leaf = showing.find((l) => l.getRoot() === root) ?? null;
      for (const l of showing) if (l !== leaf) l.detach();
      if (leaf === null) leaf = app.workspace.getMostRecentLeaf(root) ?? app.workspace.getLeaf(true);
      await leaf.openFile(file);
      app.workspace.setActiveLeaf(leaf, { focus: true });
      await new Promise((r) => setTimeout(r, 500));
      const ed = leaf.view.editor;
      ed.setValue(${JSON.stringify(FIXTURE_NOTE)});
      await new Promise((r) => setTimeout(r, 300));
      const idx = ed.getValue().split("\\n").findIndex((l) => l.startsWith("Model control makes"));
      if (idx < 0) return -1;
      ed.setSelection({ line: idx, ch: 0 }, { line: idx, ch: 13 });
    `;

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
async function startFakeEndpoint(
  wunschPort = 0,
  // Nur fuer Pruefpunkt 40: eine kanonische OpenAI-SSE-Antwort auf POST /v1/chat/completions,
  // mit finish_reason "length" — der Rest bleibt unveraendert (Verbindungsprobe, /v1/models).
  chatStub?: { content: string; finishReason: string },
): Promise<{ url: string; port: number; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    // CORS-Preflight nur relevant, seit Pruefpunkt 40 echte POSTs aus dem Renderer schickt
    // (Verbindungsprobe/-`/v1/models` sind GETs, die kein Preflight ausloesen). Ohne Antwort
    // hier bricht die Chat-Anfrage mit genau der CORS-Meldung ab, die Koda selbst kennt
    // (`error.chatBlocked` — „Probe gruen, Chat rot"), lange bevor `chatStub` greift.
    if (chatStub !== undefined && req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      });
      res.end();
      return;
    }
    if (chatStub !== undefined && req.method === "POST" && req.url?.includes("/v1/chat/completions") === true) {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Access-Control-Allow-Origin": "*" });
      res.end(
        `data: ${JSON.stringify({ choices: [{ delta: { content: chatStub.content }, finish_reason: null }] })}\n\n`
        + `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: chatStub.finishReason }] })}\n\n`
        + `data: [DONE]\n\n`,
      );
      return;
    }
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
  // Plugin neu laden, BEVOR irgendetwas gemessen wird. Obsidian haelt `main.js` im
  // Speicher: ein frisch deploytes Bundle wirkt erst nach einem Neuladen, und ein
  // Datei-Vergleich Repo↔Vault ist dabei GRUEN — die Dateien stimmen ja ueberein, nur
  // laeuft der Code von vorhin. Gemessen am 2026-09-04: der ensureParents-Fix zu Punkt 24
  // war deployt und der Punkt blieb mit identischer Fehlermeldung rot; ohne diese Zeile
  // sieht ein wirkungsloser Fix aus wie ein falscher Fix, und man sucht am falschen Ende.
  // (LESSONS 2026-09-03/calendar-notes; koda-agent stand dort namentlich als eines von
  // fuenf Repos ohne Reload.)
  await cdp.evaluate(`
    await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)});
    await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)});
    return true;
  `);

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

          // --- 8. Settings-Gruppe „Verlauf kürzen“ -----------------------
          // Nur geprueft, waehrend das Einstellungsfenster ohnehin offen ist (Punkte 3/4) —
          // ein eigenes Oeffnen/Schliessen nur fuer diesen Punkt waere unnoetiger Aufwand.
          // Die Ueberschrift kommt aus dem deklarativen Settings-Walker (`setHeading()`,
          // src/vendor/kit-obsidian/settings_walker.ts), das Zahlenfeld ist ein Text-Input
          // (`type: "number"` rendert `addText`, kein natives `<input type=number>`).
          const group = await settings.evaluate<{ heading: boolean; field: string | null }>(`
            const heads = [...document.querySelectorAll(".setting-item-heading .setting-item-name")].map((e) => e.textContent);
            const heading = heads.some((h) => /Verlauf kürzen|Shorten history/.test(h));
            const item = [...document.querySelectorAll(".setting-item")].find((e) => /Kontextfenster|Context window/.test(e.querySelector(".setting-item-name")?.textContent ?? ""));
            return { heading, field: item?.querySelector("input")?.value ?? null };
          `);
          record(
            "8. Settings-Gruppe „Verlauf kürzen“ mit Fenster-Feld",
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
    // Kopfdaten, und die Markierung steht drin. Kulisse und Leaf-Aufloesung: `SCENE_JS` oben.
    // Eigener try/catch/finally seit der Review-Runde vom 2026-09-02 (Punkt 4) — sonst haette
    // eine Ausnahme hier den Rest des Laufs mitgerissen, ohne dass dieser Punkt rot gemeldet
    // haette, UND den Modus mutiert zurueckgelassen.
    const vorherMode = await cdp.evaluate<string>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].contextMode;`);
    try {
      const punkt20 = await cdp.evaluate<{ aktivIstKoda: boolean; text: string; items: { source: string; path: string; chars: number }[] } | -1 | -2>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.setContextMode("workspace");
        ${SCENE_JS}
        document.querySelector(".koda-input")?.focus();
        await new Promise((r) => setTimeout(r, 300));
        const ctx = await p.currentContext();
        return {
          aktivIstKoda: app.workspace.activeLeaf?.view?.getViewType() === ${JSON.stringify(VIEW_TYPE)},
          text: ctx?.text ?? "",
          items: ctx?.items ?? [],
        };
      `);
      const sel20 = typeof punkt20 === "object" ? punkt20.items.find((i) => i.source === "selection") : undefined;
      record(
        "20. Arbeitsplatz-Block nennt aktive Notiz, Kopfdaten und Markierung — aus der Sidebar heraus",
        typeof punkt20 === "object" && punkt20.aktivIstKoda && punkt20.text.includes("Notes/Project plan.md") && punkt20.text.includes("status: active") && punkt20.text.includes("Model control") && sel20?.chars === 13,
        punkt20 === -2
          ? "Fixture-Notiz Notes/Project plan.md fehlt"
          : punkt20 === -1
            ? "Kulisse nicht hergestellt"
            : `aktiv ist Koda: ${String(punkt20.aktivIstKoda)} · Markierung: ${sel20 ? `${sel20.chars} Zeichen` : "fehlt"} · ${punkt20.text.split("\n")[1] ?? ""}`,
      );
    } catch (error) {
      record(
        "20. Arbeitsplatz-Block nennt aktive Notiz, Kopfdaten und Markierung — aus der Sidebar heraus",
        false,
        `Abbruch: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await cdp.evaluate(`
        app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].setContextMode(${JSON.stringify(vorherMode)});
        return true;
      `).catch(() => undefined);
    }

    // --- 21. Modus Aus sendet nichts; Befehl und Dropdown sind EIN Zustand ---------------
    // Eigener try/catch/finally aus demselben Grund wie Punkt 20 (Review-Runde 2026-09-02,
    // Punkt 4): `vorherMode` von oben, nicht neu gelesen.
    try {
      const punkt21 = await cdp.evaluate<{ ausNull: boolean; dropdownNachBefehl: string; modeNachDropdown: string; anObjekt: boolean }>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:context-mode-off`)});
        await new Promise((r) => setTimeout(r, 200));
        const ausNull = (await p.currentContext()) === null;
        const sel = document.querySelector(".koda-mode");
        const dropdownNachBefehl = sel ? sel.value : "(kein Dropdown)";
        if (sel) { sel.value = "workspace"; sel.dispatchEvent(new Event("change")); }
        await new Promise((r) => setTimeout(r, 200));
        return { ausNull, dropdownNachBefehl, modeNachDropdown: p.contextMode, anObjekt: (await p.currentContext()) !== null };
      `);
      record(
        "21. Modus Aus sendet keinen Kontext; Befehl und Dropdown schalten denselben Zustand",
        punkt21.ausNull && punkt21.dropdownNachBefehl === "off" && punkt21.modeNachDropdown === "workspace" && punkt21.anObjekt,
        `aus → null: ${String(punkt21.ausNull)} · Dropdown nach Befehl: ${punkt21.dropdownNachBefehl} · Modus nach Dropdown: ${punkt21.modeNachDropdown}`,
      );
    } catch (error) {
      record(
        "21. Modus Aus sendet keinen Kontext; Befehl und Dropdown schalten denselben Zustand",
        false,
        `Abbruch: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await cdp.evaluate(`
        app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].setContextMode(${JSON.stringify(vorherMode)});
        return true;
      `).catch(() => undefined);
    }

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
    } catch (error) {
      record(
        "22. get_workspace und edit_active_note stehen in der gesendeten Liste und sind abschaltbar",
        false,
        `Abbruch: ${error instanceof Error ? error.message : String(error)}`,
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
    // Rueckschreibung im `finally` laeuft ueber den EDITOR, nicht `vault.modify()`: Letzteres
    // divergiert von einem offenen, ungespeicherten Editor-Puffer, und Obsidian fuehrt beide
    // Staende spaeter zu Artefakten zusammen — gemessen 2026-09-02 als `Model steeringl makes`
    // mit einer verschobenen Leerzeile. `original23` faellt deshalb weg: `FIXTURE_NOTE` oben
    // ist der bekannt gute Zustand, nichts, das dieser Lauf erst lesen muesste.
    let detail23 = "nicht gelaufen";
    let ok23 = false;
    try {
      const starte = async (ersatz: string): Promise<number> => {
        const idx = await cdp.evaluate<number>(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          ${SCENE_JS}
          window.__koda23 = null;
          p.buildTools().run("edit_active_note", { path, mode: "replace_selection", text: ${JSON.stringify(ersatz)} }).then((r) => { window.__koda23 = r; });
          return idx;
        `);
        if (idx < 0) throw new Error(idx === -2 ? "Fixture-Notiz Notes/Project plan.md fehlt" : "Kulisse nicht hergestellt");
        const modal = await pollUntil<boolean>(cdp, `return !!document.querySelector(".modal-container .koda-preview");`, 8000);
        if (!modal) throw new Error("Bestaetigungs-Modal erschien nicht");
        return idx;
      };
      const bestaetige = async (): Promise<unknown> => {
        await clickReal(cdp, `document.querySelector(".modal-container .modal-button-container button:last-child") ?? null`);
        return pollUntil<unknown>(cdp, `return window.__koda23;`, 8000);
      };
      // A: Markierung nach dem Aufruf verkleinern, dann bestaetigen → Fehler, Datei unveraendert.
      const idxA = await starte("Model steering");
      await cdp.evaluate(`app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.setSelection({ line: ${idxA}, ch: 0 }, { line: ${idxA}, ch: 5 }); return true;`);
      const a = (await bestaetige()) as { ok: boolean; error?: string } | null;
      const inhaltA = await cdp.evaluate<string>(`return app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue();`);
      // B: Gegenprobe ohne Aenderung → geschrieben.
      await starte("Model steering");
      const b = (await bestaetige()) as { ok: boolean; content?: string } | null;
      const inhaltB = await cdp.evaluate<string>(`return app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue();`);
      ok23 = a?.ok === false && /geändert|changed/.test(a?.error ?? "") && inhaltA.includes("Model control makes") && b?.ok === true && inhaltB.includes("Model steering makes");
      // Die Zeile nennt, WAS gemessen wurde (Model-Zeile in A und B), nicht nur das ok/verweigert-
      // Fazit — ein rotes Ergebnis ohne diese Zeile kostete die dritte Runde eine volle
      // Nachstellung, weil "GESCHRIEBEN, ok true" wie ein bestandener Punkt aussah.
      const zeile = (t: string): string => t.split("\n").find((l) => l.startsWith("Model ")) ?? "(keine Model-Zeile)";
      detail23 = `veraltet: ${a?.ok === false ? "verweigert" : "GESCHRIEBEN"} (${a?.error ?? ""}) · gueltig: ${b?.ok === true ? "geschrieben" : "verweigert"} · A: „${zeile(inhaltA).slice(0, 40)}“ · B: „${zeile(inhaltB).slice(0, 40)}“${b?.content ? ` · ${b.content}` : ""}`;
    } catch (error) {
      detail23 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      // Rueckschreibung ueber den EDITOR (nicht `vault.modify()`, s. Kommentar oben): der
      // root-split Leaf, der die Notiz noch offen haelt, bekommt den Fixture-Text direkt in
      // den Puffer. Nur wenn keiner die Notiz mehr offen haelt, greift der Vault-Fallback.
      await cdp.evaluate(`
        const path = ${JSON.stringify("Notes/Project plan.md")};
        const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
        if (leaf && leaf.view?.file?.path === path) {
          leaf.view.editor.setValue(${JSON.stringify(FIXTURE_NOTE)});
        } else {
          const f = app.vault.getFileByPath(path);
          if (f) await app.vault.modify(f, ${JSON.stringify(FIXTURE_NOTE)});
        }
        return true;
      `).catch(() => undefined);
      await cdp.evaluate(`
        app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].setContextMode(${JSON.stringify(vorherMode)});
        document.querySelector(".modal-container .modal-close-button")?.click();
        return true;
      `).catch(() => undefined);
    }
    record("23. edit_active_note: veraltete Markierung schreibt nicht, gueltige schreibt (Invariante Vorschau == Inhalt)", ok23, detail23);

    // --- 24. move_note zieht die Wikilinks nach ------------------------------------------
    // DIE Frage, die dieser Punkt existiert um zu beantworten: `fileManager.renameFile` zieht
    // laut Doku die Links verweisender Notizen nach — ob das auch gilt, wenn Obsidians
    // Einstellung „Automatically update internal links" AUS steht, ist aus der Doku nicht zu
    // beantworten. Deshalb wird die Einstellung GEMESSEN und mitprotokolliert, statt sie zu
    // setzen: ein Punkt, der sich seine Vorbedingung selbst herstellt, misst nicht mehr, was
    // der Nutzer erlebt.
    //
    // ⚠️ Gemessen am 2026-09-04, und die erste Fassung dieses Punktes war daran falsch:
    // Obsidian schreibt einen Link nur um, wenn er sonst NICHT MEHR AUFLOEST — und waehlt
    // dabei die kuerzeste eindeutige Form. Ein kurzer `[[Tools]]` bleibt beim Verschieben
    // deshalb voellig unveraendert (er zeigt weiter aufs richtige File, der Dateiname hat
    // sich ja nicht geaendert), waehrend `[[Notes/Tools]]` zu `[[Tools]]` wird — NICHT zu
    // `[[Archiv/Tools]]`. Wer „steht der neue Pfad im Text?" prueft, misst also bei kurzen
    // Links einen Fehlschlag, wo alles richtig ist. Der Punkt prueft deshalb BEIDE Haelften
    // an einer eigens angelegten Probe-Notiz: die Verlinkung bleibt intakt (der kurze Link
    // loest auf den NEUEN Pfad auf) und Obsidian fasst den Text an, wo er es muss.
    let detail24 = "nicht gelaufen";
    let ok24 = false;
    const QUELLE24 = "Notes/Tools.md";
    const ZIEL24 = "Archiv/Tools.md";
    const PROBE24 = "Probe-smoke24.md";
    try {
      const linkOption = await cdp.evaluate<unknown>(
        `return app.vault.getConfig ? app.vault.getConfig("alwaysUpdateLinks") : "unbekannt";`,
      );
      await cdp.evaluate(`
        const alt = app.vault.getFileByPath(${JSON.stringify(PROBE24)});
        if (alt) await app.fileManager.trashFile(alt);
        await app.vault.create(${JSON.stringify(PROBE24)}, "kurz: [[Tools]]\\nmit Pfad: [[Notes/Tools]]\\n");
        return true;
      `);
      // Der Cache muss die frische Notiz kennen, sonst zieht der Rename ihre Links nicht nach.
      const bekannt = await pollUntil<boolean>(cdp, `
        const d = app.metadataCache.getFirstLinkpathDest("Tools", ${JSON.stringify(PROBE24)});
        return d ? d.path === ${JSON.stringify(QUELLE24)} : false;
      `, 8000);
      if (!bekannt) throw new Error("Probe-Notiz kam nicht in den metadataCache");

      await cdp.evaluate(`
        window.__koda24 = null;
        app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].buildTools()
          .run("move_note", { source_path: ${JSON.stringify(QUELLE24)}, destination_path: ${JSON.stringify(ZIEL24)} })
          .then((r) => { window.__koda24 = r; });
        return true;
      `);
      const modal24 = await pollUntil<boolean>(cdp, `return !!document.querySelector(".modal-container .koda-move-paths");`, 8000);
      if (!modal24) throw new Error("Move-Modal erschien nicht");
      await clickReal(cdp, `document.querySelector(".modal-container .modal-button-container button:last-child") ?? null`);
      const r24 = (await pollUntil<{ ok: boolean; content?: string; error?: string }>(cdp, `return window.__koda24;`, 8000)) ?? null;

      // (a) Verlinkung intakt: der kurze Link zeigt jetzt auf den NEUEN Pfad.
      const loestAuf = await pollUntil<string>(cdp, `
        const d = app.metadataCache.getFirstLinkpathDest("Tools", ${JSON.stringify(PROBE24)});
        return d ? d.path : null;
      `, 8000);
      // (b) Text angefasst, wo noetig: der Pfad-Link nennt "Notes/Tools" nicht mehr.
      const text = await cdp.evaluate<string>(`
        const f = app.vault.getFileByPath(${JSON.stringify(PROBE24)});
        return f ? await app.vault.read(f) : "(fehlt)";
      `);
      const pfadWeg = !text.includes("[[Notes/Tools]]");
      ok24 = r24?.ok === true && loestAuf === ZIEL24 && pfadWeg;
      detail24 = `Werkzeug: ${r24?.ok === true ? "verschoben" : `FEHLER (${r24?.error ?? "?"})`} · kurzer Link loest auf: ${loestAuf ?? "GAR NICHT"} · Pfad-Link im Text: ${pfadWeg ? "angepasst" : "UNVERAENDERT"} („${text.split("\n").filter((l) => l.includes("[[")).join(" | ")}") · alwaysUpdateLinks: ${String(linkOption)}`;
    } catch (error) {
      detail24 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await cdp.evaluate(`
        const f = app.vault.getFileByPath(${JSON.stringify(ZIEL24)});
        if (f) await app.fileManager.renameFile(f, ${JSON.stringify(QUELLE24)});
        const probe = app.vault.getFileByPath(${JSON.stringify(PROBE24)});
        if (probe) await app.fileManager.trashFile(probe);
        document.querySelector(".modal-container .modal-close-button")?.click();
        return true;
      `).catch(() => undefined);
    }
    record("24. move_note verschiebt, die Verlinkung bleibt intakt und Obsidian passt den Text an, wo noetig", ok24, detail24);

    // --- 25. Das Move-Modal nennt die Reichweite -----------------------------------------
    // Der Punkt misst den TEXT im Modal, nicht dass ein Modal kommt: die Backlink-Zahl ist
    // die Information, auf der die Freigabe beruht, und sie wandert durch drei Schichten
    // (metadataCache → Port → Modal). Eine davon still auf 0 zu setzen faellt sonst nicht auf.
    let detail25 = "nicht gelaufen";
    let ok25 = false;
    try {
      await cdp.evaluate(`
        window.__koda25 = null;
        app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].buildTools()
          .run("move_note", { source_path: ${JSON.stringify(QUELLE24)}, destination_path: "Archiv/Tools-x.md" })
          .then((r) => { window.__koda25 = r; });
        return true;
      `);
      const da = await pollUntil<boolean>(cdp, `return !!document.querySelector(".modal-container .koda-move-paths");`, 8000);
      if (!da) throw new Error("Move-Modal erschien nicht");
      const gelesen = await cdp.evaluate<{ pfade: string; hinweis: string; knopf: string }>(`
        const m = document.querySelector(".modal-container");
        return {
          pfade: m.querySelector(".koda-move-paths")?.innerText ?? "",
          hinweis: m.querySelector(".koda-move-note")?.innerText ?? "",
          knopf: m.querySelector(".modal-button-container button:last-child")?.innerText ?? "",
        };
      `);
      // Abbrechen: dieser Punkt misst die Anzeige, er soll nichts verschieben.
      await clickReal(cdp, `document.querySelector(".modal-container .modal-button-container button:first-child") ?? null`);
      const nenntBeide = gelesen.pfade.includes(QUELLE24) && gelesen.pfade.includes("Archiv/Tools-x.md");
      const nenntZahl = /\b2\b/.test(gelesen.hinweis);
      const nochDa = await cdp.evaluate<boolean>(`return app.vault.getFileByPath(${JSON.stringify(QUELLE24)}) !== null;`);
      ok25 = nenntBeide && nenntZahl && nochDa;
      detail25 = `Pfade: ${nenntBeide ? "beide genannt" : `UNVOLLSTAENDIG („${gelesen.pfade.replace(/\n/g, " / ")}")`} · Reichweite: „${gelesen.hinweis}" ${nenntZahl ? "(2 erwartet, genannt)" : "(2 ERWARTET, FEHLT)"} · Knopf: „${gelesen.knopf}" · nach Abbruch am alten Ort: ${nochDa ? "ja" : "NEIN"}`;
    } catch (error) {
      detail25 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await cdp.evaluate(`document.querySelector(".modal-container .modal-close-button")?.click(); return true;`).catch(() => undefined);
    }
    record("25. Das Move-Modal nennt beide Pfade und die Zahl der verweisenden Notizen", ok25, detail25);

    // --- 26. delete_note fragt AUCH im Koda-Ordner ---------------------------------------
    // Die Regel „Wirkung schlaegt Ort" ist im Adapter getestet; hier wird sie am laufenden
    // Plugin gemessen, weil sie die einzige ist, die eine Datei verschwinden laesst. Der
    // Pruefling ist eine eigens angelegte Wegwerf-Notiz IM Koda-Ordner — dort waere ein
    // write_note frei, ein delete_note darf es nicht sein.
    let detail26 = "nicht gelaufen";
    let ok26 = false;
    const OPFER = "Koda/wegwerf-smoke26.md";
    try {
      await cdp.evaluate(`
        const alt = app.vault.getFileByPath(${JSON.stringify(OPFER)});
        if (alt) await app.fileManager.trashFile(alt);
        await app.vault.create(${JSON.stringify(OPFER)}, "wegwerf");
        window.__koda26 = null;
        app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].buildTools()
          .run("delete_note", { path: ${JSON.stringify(OPFER)} })
          .then((r) => { window.__koda26 = r; });
        return true;
      `);
      const gefragt = await pollUntil<boolean>(cdp, `return !!document.querySelector(".modal-container .koda-delete-warn, .modal-container .koda-move-note");`, 8000);
      if (!gefragt) throw new Error("Loesch-Modal erschien nicht — im Koda-Ordner NICHT gefragt");
      const knopf = await cdp.evaluate<string>(`return document.querySelector(".modal-container .modal-button-container button:last-child")?.innerText ?? "";`);
      await clickReal(cdp, `document.querySelector(".modal-container .modal-button-container button:last-child") ?? null`);
      const r26 = (await pollUntil<{ ok: boolean }>(cdp, `return window.__koda26;`, 8000)) ?? null;
      const weg = await cdp.evaluate<boolean>(`return app.vault.getFileByPath(${JSON.stringify(OPFER)}) === null;`);
      ok26 = gefragt && r26?.ok === true && weg;
      detail26 = `im Koda-Ordner gefragt: ja · Knopf: „${knopf}" · Werkzeug: ${r26?.ok === true ? "ok" : "FEHLER"} · Datei danach: ${weg ? "weg" : "NOCH DA"}`;
    } catch (error) {
      detail26 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await cdp.evaluate(`
        const rest = app.vault.getFileByPath(${JSON.stringify(OPFER)});
        if (rest) await app.fileManager.trashFile(rest);
        document.querySelector(".modal-container .modal-close-button")?.click();
        return true;
      `).catch(() => undefined);
    }
    record("26. delete_note fragt auch im Koda-Ordner nach und legt die Notiz in den Papierkorb", ok26, detail26);

    // ---- 27 + 28: restaurierte Tabs und doppelte Pfade ------------------------
    //
    // Beide messen dieselbe Naht zum Host und teilen deshalb einen Aufbau: drei Tabs, davon
    // ZWEI auf derselben Notiz. Danach `changeLayout(getLayout())` — das stellt die
    // nicht-aktiven Tabs so wieder her, wie ein Neustart es taete, naemlich als
    // DeferredViews (gemessen 2026-09-05: 3 von 4 Leaves). Das ist der Grund, warum es
    // diesen Punkt jetzt gibt: Handpunkt 25 verlangte bisher Fenster-Schliessen und
    // Neuoeffnen und war deshalb nur von Hand belegt — eine Regel, die nur die
    // Unit-Tests decken, ist auf der Obsidian-Seite unbelegt.
    //
    // Der Punkt belegt seinen eigenen Gegenstand mit: ohne mindestens einen DeferredView
    // waere er gruen, ohne die Sache je beruehrt zu haben (dieselbe Vorsicht wie bei
    // Punkt 19s mittlerer Messung). Deshalb wartet er auf den Zustand, statt ihn
    // anzunehmen, und faellt durch, wenn er ausbleibt.
    const TAB_A = "Notes/Project plan.md";
    const TAB_B = "Notes/Compaction.md";
    let ok27 = false;
    let detail27 = "";
    let ok28 = false;
    let detail28 = "";
    try {
      await cdp.evaluate(`
        window.__kodaLayoutVorher = app.workspace.getLayout();
        for (const pfad of [${JSON.stringify(TAB_A)}, ${JSON.stringify(TAB_A)}, ${JSON.stringify(TAB_B)}]) {
          const datei = app.vault.getFileByPath(pfad);
          if (!datei) continue;
          await app.workspace.getLeaf("tab").openFile(datei);
          await new Promise((r) => setTimeout(r, 200));
        }
        await app.workspace.changeLayout(app.workspace.getLayout());
        return true;
      `);
      // Die Messung liest den Block, OHNE einen Tab anzufassen — ein Klick wuerde den
      // DeferredView laden und damit genau den Zustand zerstoeren, um den es geht.
      const mess = await pollUntil<{
        items: string[];
        allePfade: string[];
        deferredPfade: string[];
      }>(
        cdp,
        `
        const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        const ctx = plugin ? await plugin.currentContext() : null;
        if (!ctx) return null;
        const items = (ctx.items ?? []).filter((i) => i.source === "tab").map((i) => i.path);
        const allePfade = []; const deferredPfade = [];
        app.workspace.iterateAllLeaves((l) => {
          const root = l.getRoot();
          if (root === app.workspace.leftSplit || root === app.workspace.rightSplit) return;
          const st = l.getViewState();
          if (st && st.type === ${JSON.stringify(VIEW_TYPE)}) return;
          const ausView = l.view && l.view.file ? l.view.file.path : null;
          const ausState = st && st.state && typeof st.state.file === "string" && st.state.file !== "" ? st.state.file : null;
          const pfad = ausView ?? ausState;
          if (!pfad) return;
          allePfade.push(pfad);
          if (l.isDeferred) deferredPfade.push(pfad);
        });
        // Kein DeferredView heisst NICHT „bestanden", sondern „noch nicht so weit" —
        // deshalb null statt eines Ergebnisses (pollUntil-Vertrag).
        if (deferredPfade.length === 0) return null;
        return { items, allePfade, deferredPfade };
      `,
        15_000,
      );
      if (mess === null) throw new Error("kein DeferredView entstanden — der Punkt haette seinen Gegenstand nicht beruehrt");
      const fehlend = mess.deferredPfade.filter((pfad) => !mess.items.includes(pfad));
      ok27 = mess.deferredPfade.length > 0 && fehlend.length === 0;
      detail27 = `DeferredViews: ${mess.deferredPfade.length} · davon im Block: ${mess.deferredPfade.length - fehlend.length}${fehlend.length > 0 ? ` · FEHLT: ${fehlend.join(", ")}` : ""}`;

      const leavesMitA = mess.allePfade.filter((pfad) => pfad === TAB_A).length;
      const imBlockA = mess.items.filter((pfad) => pfad === TAB_A).length;
      const eindeutig = new Set(mess.allePfade).size;
      ok28 = leavesMitA >= 2 && imBlockA === 1 && mess.items.length === eindeutig;
      detail28 = `Leaves auf „${TAB_A}": ${leavesMitA} · im Block: ${imBlockA} · Block-Eintraege ${mess.items.length} vs. eindeutige Pfade ${eindeutig}`;
    } catch (error) {
      const grund = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      detail27 = grund;
      detail28 = grund;
    } finally {
      // Das Layout so zuruecksetzen, wie es vorgefunden wurde — der Vault ist Wegwerfware,
      // aber ein Lauf, der Tabs stehen laesst, veraendert die Ausgangslage des naechsten.
      await cdp
        .evaluate(`
          if (window.__kodaLayoutVorher) await app.workspace.changeLayout(window.__kodaLayoutVorher);
          delete window.__kodaLayoutVorher;
          return true;
        `)
        .catch(() => undefined);
    }
    record("27. Restaurierte, nicht besuchte Tabs (DeferredViews) stehen im Arbeitskontext", ok27, detail27);
    record("28. Dieselbe Notiz in zwei Tabs steht einmal im Block, nicht zweimal", ok28, detail28);

    let ok29 = false;
    let detail29 = "";
    try {
      // Fix-Runde 1, Finding 1 + Fix-Runde 2: Punkt 27 kurz zuvor ruft
      // changeLayout(getLayout()), um DeferredViews zu erzeugen — das laesst die Koda-View
      // im echten Lauf haeufig in einem DOM-Zwischenstand zurueck (Tab-Leiste fehlt),
      // obwohl das Produkt in Ordnung ist. Der blosse Oeffnen-Befehl reicht dabei NICHT:
      // `activateView()` findet die bestehende (kaputte) Leaf ueber
      // `getLeavesOfType` und ruft nur `setViewState`/`revealLeaf` auf ihr — das baut die
      // View nicht neu auf (verifiziert am laufenden Obsidian, Fix-Runde 2: 1 Tab bleibt 1
      // Tab, bis die Leaf explizit detacht wird). Der Punkt detacht deshalb zuerst jede
      // Leaf dieses View-Typs, bevor er den Oeffnen-Befehl feuert — erst das erzwingt einen
      // frischen `onOpen()`-Aufbau. Mutation (Detach + Oeffnen-Befehl) und Wartephase
      // (pollUntil) bleiben getrennt, wie bei Punkt 2. Die Reihenfolge zu Punkt 27 bleibt
      // unveraendert.
      await cdp.evaluate(`
        for (const l of app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})) l.detach();
        await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:open`)});
        return true;
      `);
      const mass = await pollUntil<{ tabs: number; hoehe: number; labels: string[] }>(
        cdp,
        `
          const btns = Array.from(document.querySelectorAll(".koda-root .okit-hub-tabs [role='tab'], .koda-root .okit-hub-tabs button"));
          // Weniger als zwei Tabs heisst „noch nicht fertig gerendert" — null statt eines
          // wahrheitsfaehigen Leerstands, sonst wuerde pollUntil den Zwischenstand als
          // Ergebnis nehmen.
          if (btns.length < 2) return null;
          return {
            tabs: btns.length,
            hoehe: Math.min(...btns.map((b) => b.getBoundingClientRect().height)),
            labels: btns.map((b) => b.innerText.trim()),
          };
        `,
        15_000,
      );
      if (mass === null) throw new Error("Hub-Tabs nach dem Oeffnen-Befehl nicht vollstaendig gerendert");
      // Größe, nicht Existenz: in einer Seitenleiste kann ein Element im DOM stehen und null
      // Pixel hoch sein — genau der Defekt von 0.10.1.
      ok29 = mass.tabs === 2 && mass.hoehe > 0;
      detail29 = `Tabs: ${mass.tabs} · kleinste Hoehe: ${mass.hoehe}px · Labels: ${mass.labels.join(" | ")}`;
    } catch (error) {
      detail29 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    }
    // Gegenprobe: in `src/obsidian/view.ts` in `buildHubInto(..., [chatPanel, this.ctxPanel], ...)`
    // das `this.ctxPanel` aus dem Panel-Array streichen, neu bauen/deployen. Erwartung: die
    // Hub-Leiste hat nur noch einen Tab, `pollUntil` findet nie zwei Buttons und laeuft in
    // den 15s-Timeout, der Punkt wird rot mit „Hub-Tabs nach dem Oeffnen-Befehl nicht
    // vollstaendig gerendert".
    record("29. Hub-Tabs Chat und Kontext sind sichtbar (Hoehe > 0, nicht nur im DOM)", ok29, detail29);

    // Nachgezogen (Etappe 2b, Task 11): `currentContext()` ist seit Task 6 async
    // (Volltext-Modi lesen Notizen). Ohne `await` liefert jeder Aufruf ein Promise-Objekt
    // statt eines ContextAttachment — `?.text` griffe daneben, `vorher`/`nachher`/`zurueck`
    // waeren alle `""`, und `r.vorher !== r.nachher` scheiterte: der Punkt wuerde selbst
    // GRUEN sein Ziel verfehlen (er misst dann nichts), oder — mit einem echten Tab in der
    // Kulisse — ROT mit „KEIN TAB" melden, obwohl ein Tab da ist. `typecheck:scripts` sieht
    // das nicht, weil der Aufruf in einer CDP-Zeichenkette liegt, kein TS-Ausdruck ist.
    // Haertung (Baseline-Lauf 2026-09-05/06, Nachtrag): „KEIN TAB" durfte den Punkt vorher
    // BESTEHEN lassen — `vorher="" !== nachher="KEIN TAB"` und `vorher="" === zurueck=""`
    // erfuellten die Bedingung, ohne dass ueberhaupt ein Kontext gelesen wurde. Derselbe
    // Vertrag wie bei `pollUntil` an anderer Stelle im Treiber: „kein Tab gefunden" ist ein
    // Abbruch, kein bestandener Zustand. Der `KEIN TAB`-Zweig wirft deshalb jetzt, statt
    // einen Wert zurueckzugeben, der die Bedingung zufaellig erfuellt.
    let ok30 = false;
    let detail30 = "";
    try {
      const r = await cdp.evaluate<{ vorher: string; nachher: string; zurueck: string; pfad: string }>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        const vorher = (await p.currentContext())?.text ?? "";
        const tab = ((await p.currentContext())?.items ?? []).find((i) => i.source === "tab");
        if (!tab) throw new Error("kein Tab im Arbeitsplatz-Kontext gefunden — Gegenstand nicht beruehrt");
        p.toggleContextItem("tab", tab.path);
        const nachher = (await p.currentContext())?.text ?? "";
        p.resetContextSelection();
        const zurueck = (await p.currentContext())?.text ?? "";
        return { vorher, nachher, zurueck, pfad: tab.path };
      `);
      ok30 = r.vorher !== r.nachher && r.vorher === r.zurueck;
      detail30 = `Tab: ${r.pfad} · Block vorher ${r.vorher.length} Z. → abgewaehlt ${r.nachher.length} Z. → zurueckgesetzt ${r.zurueck.length} Z.`;
    } catch (error) {
      detail30 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    }
    record("30. Ein abgewaehlter Chip verschwindet aus dem gesendeten Block, Zuruecksetzen holt ihn wieder", ok30, detail30);

    let ok31 = false;
    let detail31 = "";
    try {
      // Fix-Runde 1, Finding 3: `sectionStorage().setCollapsed` speichert selbst,
      // fire-and-forget (`void this.saveSettings()`, src/main.ts) — das ist der echte Weg,
      // ueber den ein Klick in der Hub-UI persistiert. Der Punkt ruft deshalb bewusst KEIN
      // eigenes saveSettings() mehr: ein expliziter Aufruf haette den zu pruefenden Effekt
      // selbst herbeigefuehrt, und die im Brief vorgesehene Gegenprobe (den internen Save-
      // Aufruf entfernen) waere daran blind vorbeigelaufen — der Punkt waere gruen
      // geblieben, egal ob setCollapsed selbst speichert oder nicht. Der Preis: der interne
      // Save ist async und ungewartet, also wird auf das Ergebnis gepollt statt es sofort
      // zu lesen.
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.sectionStorage().setCollapsed("workspace", true);
        return true;
      `);
      const nachReload = await pollUntil<boolean>(
        cdp,
        `
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          const daten = await p.loadData();
          // Noch nicht geschrieben heisst „noch nicht so weit" — null statt false, sonst
          // wuerde pollUntil einen fruehen Zwischenstand als Endergebnis nehmen.
          if ((daten?.contextSections?.workspace ?? false) !== true) return null;
          return true;
        `,
        5_000,
      );
      const gespeichert = await cdp.evaluate<unknown>(`
        return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.contextSections.workspace;
      `);
      ok31 = gespeichert === true && nachReload === true;
      detail31 = `im Speicher: ${String(gespeichert)} · in data.json: ${String(nachReload)}`;
    } catch (error) {
      detail31 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      // Fix-Runde 1, Finding 2: im finally, nicht am Ende des try — sonst verfaelscht ein
      // Abbruch NACH dem setCollapsed(true) (z. B. ein Timeout im pollUntil) die
      // Einstellungen des naechsten Laufs, weil der Reset dann nie erreicht wird.
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.sectionStorage().setCollapsed("workspace", false);
        await p.saveSettings();
        return true;
      `).catch(() => undefined);
    }
    // Gegenprobe: in `sectionStorage().setCollapsed` (src/main.ts) das
    // `void this.saveSettings();` entfernen, neu bauen/deployen. Erwartung: pollUntil
    // laeuft in den 5s-Timeout, „nachReload" bleibt null, detail zeigt
    // "in data.json: null" statt "true" — der Punkt wird rot.
    record("31. Auf/Zu-Zustand der Abschnitte landet in data.json", ok31, detail31);

    let ok32 = false;
    let detail32 = "";
    try {
      // Befund 1 (Review 2026-09-05): der Chat-Tab hatte seinen Spalten-Flex-Container
      // verloren, weil er unter `.okit-hub-panel` (ein BLOCK-Container) haengt. `.koda-log`
      // war dann Inhaltshoehe statt Restflaeche, und `.koda-input-bar` klebte am Ende des
      // Verlaufs statt am unteren Rand des Panels. Punkt 2 (Kopfzeilen-Groesse) und Punkt 29
      // (Tab-Hoehe > 0) haetten das nicht gesehen — beide messen Existenz/Groesse, keine
      // Position. Dieser Punkt misst POSITION: `display: flex` am Panel UND die Unterkante
      // der Eingabezeile nahe der Unterkante des Panels, nicht irgendwo in der Mitte.
      await cdp.evaluate(`
        await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:tab-chat`)});
        return true;
      `);
      const geo = await pollUntil<{ display: string; panelBottom: number; barBottom: number; diff: number }>(
        cdp,
        `
          const panel = document.querySelector(".koda-hub .okit-hub-panel[data-tab='chat']");
          const bar = document.querySelector(".koda-hub .okit-hub-panel[data-tab='chat'] .koda-input-bar");
          // Panel noch nicht sichtbar/gemountet oder Tab-Wechsel noch nicht angekommen:
          // „noch nicht so weit" ist null, nie ein Objekt mit Nullwerten (pollUntil-Vertrag).
          if (!panel || !bar || panel.classList.contains("is-hidden")) return null;
          const pr = panel.getBoundingClientRect();
          const br = bar.getBoundingClientRect();
          if (pr.height === 0) return null;
          return {
            display: getComputedStyle(panel).display,
            panelBottom: pr.bottom,
            barBottom: br.bottom,
            diff: Math.abs(pr.bottom - br.bottom),
          };
        `,
        8_000,
      );
      if (geo === null) throw new Error("Chat-Panel/Eingabezeile nicht innerhalb 8s gerendert");
      // Ein paar Pixel Toleranz fuer Border/Padding des Panels — die Eingabezeile muss am
      // unteren Rand sitzen, nicht irgendwo im Verlauf.
      ok32 = geo.display === "flex" && geo.diff <= 4;
      detail32 = `display: ${geo.display} · Panel-Unterkante ${geo.panelBottom.toFixed(1)}px · Eingabe-Unterkante ${geo.barBottom.toFixed(1)}px · Differenz ${geo.diff.toFixed(1)}px`;
    } catch (error) {
      detail32 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    }
    // Gegenprobe: in `styles.css` die Regel
    // `.koda-hub .okit-hub-panel[data-tab="chat"] { display: flex; flex-direction: column; overflow: hidden; }`
    // entfernen (oder auf einen Bau VOR Befund-1-Fix zurueckgehen). Erwartung: `display`
    // meldet `block` statt `flex`, der Punkt wird rot allein daran — unabhaengig davon, ob
    // bei kurzem Verlauf die Differenz zufaellig noch klein ausfaellt.
    record("32. Chat-Panel ist Spalten-Flex, Eingabezeile sitzt am unteren Rand (nicht im Verlauf)", ok32, detail32);

    // ---- 33: Modus Notiz nimmt die aktive Notiz und ihre Nachbarn im Volltext mit
    // Kulisse: dieselbe `SCENE_JS` wie 20/23 (es gibt keinen eigenen Helfer `oeffneNotiz` —
    // eine erste Fassung dieser Task nahm das an; der Treiber hat nur SCENE_JS).
    // Gegenprobe: in `src/core/context/candidates.ts` die Breitensuche (die beiden
    // `for`-Schleifen ueber `input.links.outgoing`/`.backlinks`) auskommentieren, neu
    // bauen/deployen. Erwartung: `nachbarn` ist 0 und der Punkt wird rot — der Volltext der
    // aktiven Notiz allein reicht nicht.
    let ok33 = false;
    let detail33 = "";
    const vorherMode33 = await cdp.evaluate<string>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].contextMode;`);
    try {
      const idx33 = await cdp.evaluate<number>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        ${SCENE_JS}
        await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:context-mode-note`)});
        return idx;
      `);
      if (idx33 < 0) throw new Error(idx33 === -2 ? "Fixture-Notiz Notes/Project plan.md fehlt" : "Kulisse nicht hergestellt");
      const r = await pollUntil<{
        items: { path: string; source: string; kind: string }[];
        hatVolltext: boolean;
        hatNachbarText: boolean;
      }>(
        cdp,
        `
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          const ctx = await p.currentContext();
          if (!ctx || ctx.mode !== "note") return null;
          return {
            items: ctx.items.map((i) => ({ path: i.path, source: i.source, kind: i.kind })),
            hatVolltext: ctx.text.includes("Model control makes"),
            hatNachbarText: ctx.text.includes("Koda knows seven tools"),
          };
        `,
        10_000,
      );
      if (r === null) throw new Error("kein Notiz-Kontext innerhalb 10s");
      const nachbarn = r.items.filter((i) => i.source === "link" || i.source === "backlink").length;
      ok33 = r.hatVolltext && r.hatNachbarText && nachbarn > 0 && r.items.every((i) => i.kind === "full");
      detail33 = `Eintraege ${r.items.length} · Nachbarn ${nachbarn} · Volltext aktive Notiz ${r.hatVolltext} · Volltext Nachbar ${r.hatNachbarText}`;
    } catch (error) {
      detail33 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    }
    // Kein finally hier — Punkt 34 braucht den Modus Notiz absichtlich weiter aktiv (er
    // misst dieselbe Situation mit engerem Budget). Zurueckgesetzt wird erst am Ende von 35.
    record("33. Modus Notiz schickt die aktive Notiz UND einen verlinkten Nachbarn im Volltext", ok33, detail33);

    // ---- 34: Die Budget-Kappung meldet sich im Block
    // ⚠️ Korrektur zur Planvorlage: die dort vorgesehenen `contextBudgetChars = 2000` kuerzen
    // hier NICHTS — die drei Fixture-Notizen aus Punkt 33 (aktive Notiz + zwei Nachbarn)
    // sind zusammen rund 820 Zeichen gross (`wc -c` auf die drei Dateien, gemessen, nicht
    // angenommen). Bei 2000 haette der Punkt seinen Gegenstand nie beruehrt und waere still
    // an der ersten Ausnahme unten gescheitert. 300 kuerzt zuverlaessig alle drei Eintraege.
    // Gegenprobe: in `src/core/context/render.ts` die `meldung`-Zeile auf `""` setzen, neu
    // bauen/deployen. Erwartung: `hatMeldung` ist false, der Punkt wird rot, obwohl der
    // Block weiterhin gekuerzt ist — genau der stille Verlust, gegen den er steht.
    // ⚠️ Ist auch 33 rot, zuerst 33 beheben — ohne Nachbarn im Modus Notiz gibt es nichts zu
    // kuerzen, und dieser Punkt bricht dann mit "Gegenstand nicht beruehrt" ab statt gruen
    // durchzulaufen (33 ist die Ursache, 34s Rot hier ist nur die Folge).
    let ok34 = false;
    let detail34 = "";
    const BUDGET34 = 300;
    const vorherBudget = await cdp.evaluate<number>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.contextBudgetChars;`);
    try {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.contextBudgetChars = ${JSON.stringify(BUDGET34)};
        await p.saveSettings();
        return true;
      `);
      const r = await pollUntil<{ gekuerzt: number; hatMeldung: boolean; laenge: number }>(
        cdp,
        `
          const ctx = await app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].currentContext();
          if (!ctx) return null;
          const gekuerzt = ctx.items.filter((i) => typeof i.fullChars === "number");
          // Ohne gekuerzten Eintrag hat der Punkt seinen Gegenstand nicht beruehrt.
          if (gekuerzt.length === 0) return null;
          return { gekuerzt: gekuerzt.length, hatMeldung: /gek(ü|ue)rzt: \\d+ von \\d+ Zeichen|cut: \\d+ of \\d+ chars/.test(ctx.text), laenge: ctx.text.length };
        `,
        10_000,
      );
      if (r === null) throw new Error(`kein gekuerzter Eintrag bei Budget ${BUDGET34} — Gegenstand nicht beruehrt`);
      ok34 = r.hatMeldung && r.laenge <= 4000;
      detail34 = `Budget ${BUDGET34} · gekuerzte Eintraege ${r.gekuerzt} · Meldung im Block ${r.hatMeldung} · Blocklaenge ${r.laenge} Z.`;
    } catch (error) {
      detail34 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.contextBudgetChars = ${JSON.stringify(vorherBudget)};
        await p.saveSettings();
        return true;
      `).catch(() => undefined);
    }
    record("34. Die Budget-Kappung meldet sich im Block, statt still zu kuerzen", ok34, detail34);

    // ---- 35: Manuell hinzugefuegte Notiz geht mit und laesst sich wieder entfernen
    // Gegenprobe: in `src/core/context/candidates.ts` die `manual`-Schleife
    // (`for (const p of input.manual) nimm(...)`) entfernen, neu bauen/deployen. Erwartung:
    // `mitManuell` enthaelt den Pfad nie, der Punkt wird rot.
    let ok35 = false;
    let detail35 = "";
    try {
      const r = await cdp.evaluate<{ ohne: string[]; mitManuell: string[]; danach: string[]; ziel: string }>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        const ZIEL = "Notes/Compaction.md";
        const ohne = ((await p.currentContext())?.items ?? []).map((i) => i.path);
        p.addContextPaths([ZIEL]);
        const mitManuell = ((await p.currentContext())?.items ?? []).filter((i) => i.source === "manual").map((i) => i.path);
        p.removeContextPath(ZIEL);
        const danach = ((await p.currentContext())?.items ?? []).filter((i) => i.source === "manual").map((i) => i.path);
        return { ohne, mitManuell, danach, ziel: ZIEL };
      `);
      ok35 = r.mitManuell.includes(r.ziel) && !r.danach.includes(r.ziel);
      detail35 = `manuell nach dem Hinzufuegen: [${r.mitManuell.join(", ")}] · nach dem Entfernen: [${r.danach.join(", ")}]`;
    } catch (error) {
      detail35 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      // Modus und Auswahl zurueck auf den Stand vor Punkt 33 — 34/35 liefen absichtlich
      // beide im Modus Notiz weiter.
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.resetContextSelection();
        await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:context-mode-`)} + ${JSON.stringify(vorherMode33)});
        return true;
      `).catch(() => undefined);
    }
    record("35. Eine von Hand hinzugefuegte Notiz geht mit und laesst sich wieder entfernen", ok35, detail35);

    // ---- 36: read_note liest eine .base
    // Gegenprobe: in `src/obsidian/vault-tools.ts` das zweite Argument von
    // `resolveNotePath(path, READ_EXTENSIONS)` in `read` entfernen, neu bauen/deployen.
    // Erwartung: `ok` ist false, die Fehlermeldung nennt `.md`, der Punkt wird rot.
    let ok36 = false;
    let detail36 = "";
    try {
      const r = await cdp.evaluate<{ ok: boolean; inhalt: string; mdOk: boolean }>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        const tools = p.buildTools();
        const aus = await tools.run("read_note", { path: "Notes/Overview.base" });
        const md = await tools.run("read_note", { path: "Notes/Tools.md" });
        return { ok: aus.ok === true, inhalt: (aus.content ?? aus.error ?? "").slice(0, 120), mdOk: md.ok === true };
      `);
      // Die .md-Probe daneben belegt, dass das Werkzeug ueberhaupt laeuft — sonst waere ein
      // rotes 36 auch mit einem kaputten read_note erklaerbar.
      ok36 = r.ok && r.inhalt.includes("views:") && r.mdOk;
      detail36 = `.base gelesen: ${r.ok} · .md gelesen: ${r.mdOk} · Anfang: ${JSON.stringify(r.inhalt.slice(0, 60))}`;
    } catch (error) {
      detail36 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    }
    record("36. read_note liest eine .base aus dem Fixture (und weiterhin .md)", ok36, detail36);

    // ---- 37: Quellen-Chips unter der Antwort
    // Der Punkt setzt einen kuenstlichen Verlauf, weil der Smoke bewusst ohne Modell laeuft.
    // Gemessen wird der RENDERER, und der ist die einzige Stelle, an der aus dem
    // persistierten `context.items` sichtbare Chips werden.
    // Gegenprobe: in `src/core/context/labels.ts` in `sourceChips` den `kind`-Filter
    // entfernen. Erwartung: der Zeiger-Eintrag erscheint als dritter Chip, `chips` ist 3
    // statt 2, der Punkt wird rot.
    let ok37 = false;
    let detail37 = "";
    try {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        window.__kodaLogVorher = p.chatLog;
        p.chatLog = [
          { role: "user", content: "Frage", context: { mode: "note", text: "Block", items: [
            { source: "active", path: "Notes/Project plan.md", kind: "full", chars: 500 },
            { source: "link", path: "Notes/Tools.md", kind: "full", chars: 200 },
            { source: "tab", path: "Notes/Compaction.md", kind: "pointer", chars: 11 },
          ] } },
          { role: "assistant", content: "Antwort" },
        ];
        for (const l of app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})) l.view.renderLog();
        return true;
      `);
      const r = await pollUntil<{ anzahl: number; titel: string[]; hoehe: number }>(
        cdp,
        `
          const leiste = document.querySelector(".koda-sources");
          if (!leiste) return null;
          const chips = Array.from(leiste.querySelectorAll(".koda-source-chip"));
          if (chips.length === 0) return null;
          return {
            anzahl: chips.length,
            titel: chips.map((c) => c.getAttribute("title")),
            hoehe: Math.min(...chips.map((c) => c.getBoundingClientRect().height)),
          };
        `,
        8_000,
      );
      if (r === null) throw new Error("keine Quellen-Leiste innerhalb 8s gerendert");
      ok37 = r.anzahl === 2 && r.hoehe > 0 && !r.titel.includes("Notes/Compaction.md");
      detail37 = `Chips ${r.anzahl} · kleinste Hoehe ${r.hoehe}px · Titel: ${r.titel.join(" | ")}`;
    } catch (error) {
      detail37 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        if (window.__kodaLogVorher) { p.chatLog = window.__kodaLogVorher; delete window.__kodaLogVorher; }
        for (const l of app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})) l.view.renderLog();
        return true;
      `).catch(() => undefined);
    }
    record("37. Quellen-Chips stehen unter der Antwort — nur Volltext-Quellen, Hoehe > 0", ok37, detail37);

    // ---- 38: Kontext-Tab zeigt einen sichtbaren Fehlerzustand, wenn das ViewModel ablehnt
    // Zusatzpunkt (nicht im Plan) — Befund aus Task 8, Review 2026-09-05: `ContextPanel.render()`
    // faengt eine Ablehnung von `host.viewModel()` ab und malt einen Fehlerzustand
    // (§8-Vokabular: `is-error`, `alert-triangle`, sichtbarer Fliesstext). Kein Unit-Test
    // erreicht das, weil es an der Kante zum Host haengt (Promise-Rejection ueber den
    // View-Kanal). Gemessen wird der Zustand, nicht der Code: `contextViewModel` wird
    // durch eine ablehnende Fassung ersetzt, dann neu gerendert.
    // Gegenprobe: in `src/obsidian/context-panel.ts` das `.catch(...)` an `render()`
    // entfernen. Erwartung: die Ablehnung landet unbehandelt (Konsole), `.koda-ctx-summary`
    // bekommt nie `is-error`, `pollUntil` laeuft in den Timeout, der Punkt wird rot.
    let ok38 = false;
    let detail38 = "";
    try {
      await cdp.evaluate(`
        await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:tab-context`)});
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        window.__koda38Original = p.contextViewModel.bind(p);
        p.contextViewModel = () => Promise.reject(new Error("smoke-38"));
        for (const l of app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})) l.view.syncContextPanel();
        return true;
      `);
      const r = await pollUntil<{ istFehler: boolean; bodyHoehe: number; bodyText: string }>(
        cdp,
        `
          const summary = document.querySelector(".koda-ctx-summary");
          if (!summary || !summary.classList.contains("is-error")) return null;
          const body = document.querySelector(".koda-ctx-body");
          const rect = body ? body.getBoundingClientRect() : null;
          const text = body ? body.textContent.trim() : "";
          if (!rect || text === "") return null;
          return { istFehler: true, bodyHoehe: rect.height, bodyText: text };
        `,
        8_000,
      );
      if (r === null) throw new Error("keine Fehlerdarstellung innerhalb 8s");
      ok38 = r.istFehler && r.bodyHoehe > 0 && r.bodyText.length > 0;
      detail38 = `is-error: ${r.istFehler} · Body-Hoehe ${r.bodyHoehe}px · Text: "${r.bodyText}"`;
    } catch (error) {
      detail38 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        if (window.__koda38Original) { p.contextViewModel = window.__koda38Original; delete window.__koda38Original; }
        for (const l of app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})) l.view.syncContextPanel();
        return true;
      `).catch(() => undefined);
    }
    record("38. Kontext-Tab zeigt einen sichtbaren Fehlerzustand, wenn das ViewModel ablehnt", ok38, detail38);

    // ---- 39: Knopf und Befehl "+ Aktive Notiz" landen auf demselben Zustand
    // Zusatzpunkt (nicht im Plan) — Befund aus Task 8, Review 2026-09-05 (Befund 6): der
    // Knopf im Kontext-Tab rief vorher seine eigene Kopie der Orchestrierung, statt
    // `addContextActive()` zu teilen. Gemessen wird auf dem ZUSTAND (`contextManual`), nicht
    // am Code: Befehl ausloesen, Zustand lesen, zuruecksetzen, Knopf klicken, Zustand
    // erneut lesen — beide muessen denselben Pfad eintragen.
    // ⚠️ Ehrlicher Grenzfall: der Punkt bleibt nur so lange gruen, wie Knopf und Befehl
    // ZUFAELLIG dasselbe Ergebnis liefern. Eine Gegenprobe, die den Knopf auf einen von
    // Hand nachgebauten Duplikat-Pfad umstellt (statt `this.host.addActive()` zu rufen),
    // waere semantisch derselbe Fehler wie der behobene Befund — trifft aber nur dann auf
    // einen roten Punkt, wenn der Duplikat-Nachbau tatsaechlich abweicht. `-notiz`/`-ordner`
    // oeffnen je ein Modal und sind fuer einen automatisierten Klick nicht geeignet; nur die
    // aktive-Notiz-Variante ist ohne Modal pruefbar.
    // Gegenprobe: in `src/obsidian/context-panel.ts` den "+ Aktive Notiz"-Knopf auf
    // `this.host.addActive()` durch einen eigenen Aufbau ersetzen, der einen ANDEREN Pfad
    // eintraegt (z. B. fest "Notes/Tools.md" statt der aktiven Notiz). Erwartung:
    // `nachKlick` enthaelt "Notes/Tools.md" statt des Pfads der aktiven Notiz, `ok39` wird
    // false, der Punkt rot.
    let ok39 = false;
    let detail39 = "";
    try {
      const start = await cdp.evaluate<{ idx: number; aktivPfad: string | null; nachBefehl: string[] }>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        ${SCENE_JS}
        p.resetContextSelection();
        await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:context-add-active`)});
        return { idx, aktivPfad: app.workspace.activeLeaf?.view?.file?.path ?? null, nachBefehl: [...p.contextManual] };
      `);
      if (start.idx < 0) throw new Error(start.idx === -2 ? "Fixture-Notiz Notes/Project plan.md fehlt" : "Kulisse nicht hergestellt");
      if (start.aktivPfad === null) throw new Error("keine aktive Notiz nach der Kulisse");
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.resetContextSelection();
        await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:tab-context`)});
        return true;
      `);
      const sichtbar = await pollUntil<boolean>(cdp, `return !!document.querySelector(".koda-ctx-add button") || null;`, 8_000);
      if (sichtbar !== true) throw new Error("Kontext-Tab-Knoepfe nicht innerhalb 8s sichtbar");
      const geklickt = await clickReal(cdp, `document.querySelector(".koda-ctx-add button:first-of-type")`);
      if (!geklickt) throw new Error("Knopf '+ Aktive Notiz' nicht klickbar");
      const nachKlick = await pollUntil<string[]>(
        cdp,
        `
          const m = [...app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].contextManual];
          return m.length > 0 ? m : null;
        `,
        8_000,
      );
      if (nachKlick === null) throw new Error("kein manueller Eintrag nach dem Klick innerhalb 8s");
      ok39 = start.nachBefehl.includes(start.aktivPfad) && nachKlick.includes(start.aktivPfad);
      detail39 = `aktive Notiz: ${start.aktivPfad} · nach Befehl: [${start.nachBefehl.join(", ")}] · nach Klick: [${nachKlick.join(", ")}]`;
    } catch (error) {
      detail39 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.resetContextSelection();
        await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:tab-chat`)});
        return true;
      `).catch(() => undefined);
    }
    record("39. Knopf '+ Aktive Notiz' und Befehl context-add-active landen auf demselben Zustand", ok39, detail39);

    // --- 40. Abgeschnittene Antwort (finish_reason "length", MIT Text) wird als Hinweis
    // gemeldet, nicht verschluckt ---------------------------------------------
    // Die pure Auswertung ist laengst durch Unit-Tests belegt (chat_client.test.ts,
    // loop.test.ts). Was die dort NICHT sehen koennen, ist die Obsidian-Kante: main.ts
    // setzt lastNotice, view.ts rendert ihn. Ein echter finish_reason:"length"-Chunk aus
    // einem eigenen SSE-Server (wie Pruefpunkt 3-5, kein Modell noetig) ist dafuer das
    // richtige Mittel — direktes chatLog-Pushen (Muster Pruefpunkt 6/7) wuerde main.ts'
    // Event-Handler gar nicht durchlaufen und den Punkt seines Gegenstands berauben.
    await fake?.close();
    const truncStub = { content: "Halber Satz", finishReason: "length" };
    fake = await startFakeEndpoint(0, truncStub);
    let detail40 = "";
    let ok40 = false;
    try {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.endpoints = [{ url: ${JSON.stringify(fake.url)} }];
        await p.saveSettings();
        await p.newChat();
        void p.ask("Smoke-Test: bitte antworten.");
        return true;
      `);
      const getroffen = await pollUntil<{ noticeText: string; noticeKlasse: string; assistantText: string; busy: boolean }>(
        cdp,
        `
          const p2 = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          if (p2.busy) return null;
          const el = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0]?.view?.containerEl;
          // Nicht die erste Notiz nehmen: das Fixture hat einen aktiven Skill, und dessen
          // ".koda-notice.koda-skills" steht laut renderLog() VOR dem Verlauf, waehrend
          // lastNotice zuletzt gerendert wird — ein blosses ".koda-notice" hier waere ein
          // Falsch-Gruen auf den Skill-Hinweis, nicht auf den Trunkierungs-Hinweis.
          const notice = el?.querySelector(".koda-notice:not(.koda-skills):not(.koda-sources)");
          const assistant = el?.querySelector(".koda-assistant:not(.koda-placeholder)");
          if (!notice || !assistant) return null;
          return {
            noticeText: notice.textContent.trim(),
            noticeKlasse: notice.className,
            assistantText: assistant.textContent.trim(),
            busy: p2.busy,
          };
        `,
        15_000,
      );
      ok40 =
        getroffen !== null
        && getroffen.busy === false
        && !getroffen.noticeKlasse.includes("koda-error")
        && getroffen.assistantText.includes(truncStub.content)
        && getroffen.noticeText.length > 0;
      detail40 = getroffen
        ? `Notiz „${getroffen.noticeText.slice(0, 90)}“ (${getroffen.noticeKlasse}) · Antworttext „${getroffen.assistantText}“`
        : "kein Hinweis und keine Antwortblase innerhalb 15s";
      if (ok40) {
        mkdirSync("/tmp/w6-shots", { recursive: true });
        const box = await boxOf(cdp, ".koda-log");
        const png = await capture(cdp, box ?? undefined);
        writeFileSync("/tmp/w6-shots/koda-truncated.png", png);
      }
    } catch (error) {
      detail40 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await fake?.close();
      fake = null;
    }
    record("40. Abgeschnittene Antwort (finish_reason length, mit Text) meldet einen Hinweis statt zu schweigen", ok40, detail40);

    // --- 41. llm-lab-Meldestrecke (Konsumenten-Seite) -----------------------
    // Spiegelbild zu Punkt 40: kein Modell noetig, echter p.ask()-Roundtrip gegen den
    // gleichen SSE-Stub-Server (Muster oben), diesmal mit finish_reason "stop". Geprueft
    // wird NICHT, ob ein echtes llm-lab die Zeile speichert (das ist dessen Smoke) — nur,
    // dass Koda ueberhaupt meldet und mit welchen Feldern (Task „llm-lab als Konsument
    // anschliessen", apiVersion 4: turnId, promptTemplate, contextPaths).
    //
    // Ein Stub statt eines echten Lab, aus demselben Grund wie in vault-rags Treiber: die
    // Zusage ist "wir rufen readLabApi(app)?.log(...) mit diesen Feldern", nicht "das Lab
    // verhaelt sich richtig" — und ein echtes Lab im Fixture wuerde dessen Aufzeichnung mit
    // Testzeilen verunreinigen. Das Fixture fuehrt llm-lab nicht (community-plugins.json),
    // der Zweig laeuft hier also immer; ein spaeter installiertes echtes Lab wird trotzdem
    // erkannt und der Punkt uebersprungen statt es zu verunreinigen.
    const labVorher = await cdp.evaluate<boolean>(`return !!app.plugins.plugins["llm-lab"];`);
    let detail41 = "";
    let ok41 = false;
    if (labVorher) {
      detail41 = "uebersprungen — ein llm-lab-Eintrag existiert bereits (echtes Plugin oder Rest eines abgebrochenen Laufs); Stub wuerde ihn ueberschreiben";
      record("41. llm-lab-Meldestrecke (Konsumenten-Seite)", true, detail41);
    } else {
      fake = await startFakeEndpoint(0, { content: "Ok.", finishReason: "stop" });
      try {
        await cdp.evaluate(`
          window.__kodaLabSeen = [];
          app.plugins.plugins["llm-lab"] = {
            __kodaSmokeStub: true,
            api: {
              apiVersion: 4,
              status: () => ({ apiVersion: 4, recording: true }),
              log: (input) => { window.__kodaLabSeen.push(input); return "smoke-" + window.__kodaLabSeen.length; },
            },
          };
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.settings.endpoints = [{ url: ${JSON.stringify(fake.url)} }];
          await p.saveSettings();
          await p.newChat();
          void p.ask("Smoke-Test: bitte antworten.");
          return true;
        `);
        const gemeldet = await pollUntil<{
          feature: string; model: string; endpointUrl: string; content: string;
          latencyMs: number; turnId: string; promptTemplate: string;
          messages: { role: string; content: string }[];
        }>(
          cdp,
          `
            const p2 = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
            if (p2.busy) return null;
            const seen = window.__kodaLabSeen || [];
            return seen.length > 0 ? seen[0] : null;
          `,
          15_000,
        );
        ok41 =
          gemeldet !== null
          && gemeldet.feature !== ""
          && gemeldet.endpointUrl === fake.url
          && gemeldet.content === "Ok."
          && gemeldet.latencyMs >= 0
          && typeof gemeldet.turnId === "string" && gemeldet.turnId !== ""
          && gemeldet.promptTemplate !== ""
          && Array.isArray(gemeldet.messages)
          && gemeldet.messages.some((m) => m.role === "user" && m.content.includes("Smoke-Test"))
          && !gemeldet.messages.some((m) => (m as { role: string }).role === "tool");
        detail41 = gemeldet
          ? `feature „${gemeldet.feature}“ · model „${gemeldet.model}“ · turnId ${gemeldet.turnId.slice(0, 12)}… · `
            + `promptTemplate ${gemeldet.promptTemplate.length} Z. · Nachrichten ${gemeldet.messages.length} (nur system/user/assistant) · content „${gemeldet.content}“`
          : "kein log()-Aufruf innerhalb 15s";
      } catch (error) {
        detail41 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        await fake?.close();
        fake = null;
        await cdp.evaluate(`
          delete app.plugins.plugins["llm-lab"];
          delete window.__kodaLabSeen;
          return true;
        `).catch(() => undefined);
      }
      record("41. llm-lab-Meldestrecke (Konsumenten-Seite): turnId/promptTemplate/Nachrichten korrekt gemeldet", ok41, detail41);
    }

    // --- 42. list_notes nennt Unterordner — auch einen ohne Notiz -----------------
    // Anlass 2026-09-25: `list_notes("_Koda")` meldete „4 von 4 Notizen", verschwieg drei
    // bewohnte Unterordner, und Koda berichtete sie als nicht existent. Die pure Schicht ist
    // unit-getestet; offen ist hier nur die NAHT: liefert `vault.getAllFolders()` einen Ordner
    // ohne Notiz wirklich, und taucht die Wurzel ("/") nirgends als Unterordner auf?
    // Der Punkt baut seinen Zustand selbst und prueft vorher, dass es ihn noch nicht gibt
    // (CORE-TEST-21) — sonst misst ein Rest aus einem abgebrochenen Lauf statt des Prueflings.
    const W42 = "Koda/smoke42";
    let detail42 = "nicht gelaufen";
    let ok42 = false;
    let eigen42 = true; // aufgeraeumt wird nur, was dieser Lauf angelegt hat
    try {
      const r42 = await cdp.evaluate<{
        vorher: boolean;
        flat?: { ok: boolean; content?: string; error?: string };
        root?: { ok: boolean; content?: string; error?: string };
        fehlt?: { ok: boolean; content?: string; error?: string };
      }>(`
        const W = ${JSON.stringify(W42)};
        if (app.vault.getAbstractFileByPath(W) !== null) return { vorher: true };
        await app.vault.createFolder(W + "/Voll");
        await app.vault.createFolder(W + "/Ohne");
        await app.vault.create(W + "/Voll/a.md", "x");
        await app.vault.create(W + "/oben.md", "x");
        const t = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].buildTools();
        return {
          vorher: false,
          flat: await t.run("list_notes", { folder: W }),
          root: await t.run("list_notes", { folder: "" }),
          fehlt: await t.run("list_notes", { folder: W + "/Gibtsnicht" }),
        };
      `);
      eigen42 = !r42.vorher;
      if (r42.vorher) {
        detail42 = `${W42} existiert schon (Rest eines abgebrochenen Laufs?) — nicht gemessen, bitte von Hand entfernen`;
      } else {
        const flat = r42.flat?.content ?? r42.flat?.error ?? "";
        const root = r42.root?.content ?? r42.root?.error ?? "";
        const ohne = flat.includes(`${W42}/Ohne (keine Notiz)`);
        const voll = flat.includes(`${W42}/Voll (1 Notiz)`);
        const kopf = /2 Unterordner/.test(flat.split("\n")[0] ?? "");
        // Die Wurzel-Liste muss Unterordner nennen (das Fixture hat welche), und keiner davon
        // darf die Wurzel selbst sein — Obsidian fuehrt sie als "/", ein Filterfehler zeigte
        // sie als "/ (…)" oder als leeren Namen " (…)".
        const wurzelZeile = root.split("\n")[1] ?? "";
        const wurzelSauber = wurzelZeile.startsWith("Unterordner: ")
          && wurzelZeile.slice("Unterordner: ".length).split(" · ").every((e) => !e.startsWith("/") && !e.startsWith("("));
        const fehlt = r42.fehlt?.ok === false && /gibt es nicht/.test(r42.fehlt.error ?? "");
        ok42 = r42.flat?.ok === true && ohne && voll && kopf && wurzelSauber && fehlt;
        const zweite = flat.split("\n")[1] ?? "";
        detail42 = `Kopf ${kopf ? "nennt 2 Unterordner" : "OHNE Unterordnerzahl"} · „${zweite.slice(0, 90)}“ · `
          + `Ohne ${ohne ? "gesehen" : "FEHLT"} · Voll ${voll ? "gesehen" : "FEHLT"} · Wurzel ${wurzelSauber ? "sauber" : "MIT „/“"} · `
          + `fehlender Ordner ${fehlt ? "als nicht existent gemeldet" : `NICHT: ${(r42.fehlt?.error ?? r42.fehlt?.content ?? "").slice(0, 60)}`}`;
      }
    } catch (error) {
      detail42 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      if (eigen42) await cdp.evaluate(`
        const f = app.vault.getAbstractFileByPath(${JSON.stringify(W42)});
        if (f) await app.vault.delete(f, true);
        return true;
      `).catch(() => undefined);
    }
    record("42. list_notes nennt Unterordner, auch einen ohne Notiz; fehlender Ordner als nicht existent", ok42, detail42);

    // ── 43–46: Etappe 3a — vault-rag als Quelle (Stub, Muster Punkt 41) ─────────────────
    // Der Stub erfuellt `readRetrievalApi` (apiVersion 1, status/search/related als Funktionen)
    // und protokolliert jede Anfrage in window.__kodaRagSeen. `window.__kodaRagFail` schaltet
    // search() auf { ok:false, reason:"offline" } — die Gegenprobe fuer den Hinweis im Block.
    const ragVorher = await cdp.evaluate<boolean>(`return !!app.plugins.plugins["vault-retrieval"];`);
    const installRagStub = (): Promise<unknown> => cdp.evaluate(`
      window.__kodaRagSeen = [];
      window.__kodaRagFail = false;
      app.plugins.plugins["vault-retrieval"] = {
        __kodaSmokeStub: true,
        api: {
          apiVersion: 1,
          status: () => ({ apiVersion: 1, indexed: true, noteCount: 4, reindexing: false }),
          search: async (q, o) => {
            window.__kodaRagSeen.push({ op: "search", q, k: o && o.k });
            return window.__kodaRagFail
              ? { ok: false, reason: "offline" }
              : { ok: true, hits: [{ path: "Notes/Compaction.md", score: 0.9 }] };
          },
          related: async (p, o) => {
            window.__kodaRagSeen.push({ op: "related", p, k: o && o.k });
            return { ok: true, hits: [{ path: "Koda/Memory.md", score: 0.8 }] };
          },
        },
      };
      return true;
    `);
    const removeRagStub = (): Promise<unknown> => cdp.evaluate(`
      if (app.plugins.plugins["vault-retrieval"]?.__kodaSmokeStub) delete app.plugins.plugins["vault-retrieval"];
      delete window.__kodaRagSeen; delete window.__kodaRagFail;
      return true;
    `).catch(() => undefined);

    if (ragVorher) {
      const grund = "uebersprungen — ein vault-retrieval-Eintrag existiert bereits (echtes Plugin oder Rest eines abgebrochenen Laufs); Stub wuerde ihn ueberschreiben";
      record("43. Modus Vault: Treffer zur gesendeten Frage im Volltext, Fehlschlag meldet sich", true, grund);
      record("44. Modus Vault ist ohne vault-rag gesperrt (Dropdown und Befehl)", true, grund);
      record("45. Modus Notiz: semantische Nachbarn aus related(), K = 0 schaltet ab", true, grund);
      record("46. Kontext-Tab: Vault-Vorschau folgt dem Entwurf im Eingabefeld (entprellt)", true, grund);
    } else {
      // ── 43 ──
      let ok43 = false; let detail43 = "";
      try {
        await installRagStub();
        const r = await cdp.evaluate<{ mode: string; items: string[]; seen: { op: string; q: string; k: number }[]; k: number; failText: string; failItems: string[] }>(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.setContextMode("vault");
          const frage = "Wie funktioniert die Verdichtung?";
          const ctx = await p.currentContext(frage);
          window.__kodaRagFail = true;
          const fail = await p.currentContext(frage);
          return {
            mode: ctx?.mode ?? "",
            items: (ctx?.items ?? []).map((i) => i.source + ":" + i.path + ":" + i.kind),
            seen: window.__kodaRagSeen,
            k: p.settings.contextAutoK,
            failText: fail?.text ?? "",
            failItems: (fail?.items ?? []).map((i) => i.source + ":" + i.path),
          };
        `);
        const suche = r.seen.find((s) => s.op === "search");
        ok43 = r.mode === "vault"
          && r.items.includes("vault:Notes/Compaction.md:full")
          && suche?.q === "Wie funktioniert die Verdichtung?" && suche.k === r.k
          && /Vault-Suche nicht verfügbar|Vault search unavailable/.test(r.failText)
          && !r.failItems.some((i) => i.startsWith("vault:"));
        detail43 = `Modus ${r.mode} · Eintraege ${r.items.join(", ")} · Suche „${suche?.q ?? "—"}" k=${String(suche?.k)} · Gegenprobe offline: ${/nicht verfügbar|unavailable/.test(r.failText) ? "Hinweis im Block" : "KEIN Hinweis"}`;
      } catch (error) {
        detail43 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      }
      record("43. Modus Vault: Treffer zur gesendeten Frage im Volltext, Fehlschlag meldet sich", ok43, detail43);

      // ── 44 ── (Stub steht noch: erst MIT, dann OHNE vault-rag messen)
      let ok44 = false; let detail44 = "";
      try {
        const mit = await cdp.evaluate<boolean>(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          for (const v of app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})) v.view.syncContextMode();
          const opt = document.querySelector('.koda-input-bar select.koda-mode option[value="vault"]');
          return opt !== null && opt.disabled === false;
        `);
        await removeRagStub();
        const ohne = await cdp.evaluate<{ disabled: boolean; label: string; modeNachBefehl: string }>(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.setContextMode("workspace");
          p.setContextMode("vault");
          const opt = document.querySelector('.koda-input-bar select.koda-mode option[value="vault"]');
          return { disabled: opt?.disabled === true, label: opt?.textContent ?? "", modeNachBefehl: p.contextMode };
        `);
        ok44 = mit && ohne.disabled && ohne.modeNachBefehl === "workspace" && /vault-rag/.test(ohne.label);
        detail44 = `mit Stub waehlbar: ${String(mit)} · ohne: gesperrt ${String(ohne.disabled)} („${ohne.label}"), Befehl laesst Modus auf „${ohne.modeNachBefehl}"`;
      } catch (error) {
        detail44 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      }
      record("44. Modus Vault ist ohne vault-rag gesperrt (Dropdown und Befehl)", ok44, detail44);

      // ── 45 ──
      let ok45 = false; let detail45 = "";
      try {
        await installRagStub();
        const r = await cdp.evaluate<{ mit: string[]; ohne: string[]; seenRelated: boolean }>(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          const file = app.vault.getFileByPath("Notes/Project plan.md");
          await app.workspace.getLeaf(false).openFile(file);
          p.setContextMode("note");
          const kVorher = p.settings.contextAutoK;
          const mit = await p.currentContext();
          p.settings.contextAutoK = 0;
          const ohne = await p.currentContext();
          p.settings.contextAutoK = kVorher;
          return {
            mit: (mit?.items ?? []).map((i) => i.source + ":" + i.path),
            ohne: (ohne?.items ?? []).map((i) => i.source + ":" + i.path),
            seenRelated: window.__kodaRagSeen.some((s) => s.op === "related" && s.p === "Notes/Project plan.md"),
          };
        `);
        ok45 = r.seenRelated && r.mit.includes("related:Koda/Memory.md") && !r.ohne.some((i) => i.startsWith("related:"));
        detail45 = `related() fuer die aktive Notiz: ${String(r.seenRelated)} · mit K: ${r.mit.join(", ")} · K=0: ${r.ohne.join(", ")}`;
      } catch (error) {
        detail45 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      }
      record("45. Modus Notiz: semantische Nachbarn aus related(), K = 0 schaltet ab", ok45, detail45);

      // ── 46 ──
      let ok46 = false; let detail46 = "";
      try {
        await cdp.evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.setContextMode("vault");
          window.__kodaRagSeen = [];
          const view = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0].view;
          view.setTab("context");
          const input = view.containerEl.querySelector("textarea.koda-input");
          input.value = "Welche Werkzeuge hat Koda?";
          input.dispatchEvent(new Event("input"));
          return true;
        `);
        const r = await pollUntil<{ chips: string[]; queries: string[] }>(cdp, `
          const view = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0].view;
          const chips = [...view.containerEl.querySelectorAll(".koda-ctx-chip")].map((c) => c.getAttribute("title"));
          const queries = (window.__kodaRagSeen || []).filter((s) => s.op === "search").map((s) => s.q);
          return chips.includes("Notes/Compaction.md") ? { chips, queries } : null;
        `, 5_000);
        // Der Chat muss im Kontext-Tab WEG sein (display none) — sonst steht das Kontext-Panel
        // zwar im DOM, aber 800 px unterhalb des Sichtbaren (Spezifitaets-Fehler in styles.css,
        // gemessen 2026-09-25; DOM-Existenz der Chips allein hatte ihn nie gefangen).
        const chatWeg = await cdp.evaluate<boolean>(`
          const view = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0].view;
          const chat = view.containerEl.querySelector('.okit-hub-panel[data-tab="chat"]');
          const kontext = view.containerEl.querySelector(".koda-ctx-body");
          return chat !== null && getComputedStyle(chat).display === "none" && kontext !== null && kontext.getBoundingClientRect().top < window.innerHeight;
        `);
        ok46 = r !== null && r.queries.includes("Welche Werkzeuge hat Koda?") && chatWeg;
        detail46 = r === null
          ? "kein Vault-Chip binnen 5 s nach dem Tippen"
          : `Chips ${r.chips.join(", ")} · Suchen ${r.queries.map((q) => `„${q}"`).join(", ")} · Chat im Kontext-Tab ausgeblendet und Panel im Bild: ${String(chatWeg)}`;
      } catch (error) {
        detail46 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        await cdp.evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          const view = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0].view;
          const input = view.containerEl.querySelector("textarea.koda-input");
          if (input) input.value = "";
          p.setContextQuery("");
          p.setContextMode("workspace");
          view.setTab("chat");
          return true;
        `).catch(() => undefined);
        await removeRagStub();
      }
      record("46. Kontext-Tab: Vault-Vorschau folgt dem Entwurf im Eingabefeld (entprellt)", ok46, detail46);
    }

    // --- 47. Werkzeug-Anbieter: ein fremdes Plugin wird montiert, geroutet, abgeschaltet, entfernt ---
    // Spike 2026-09-25 (Cockpit-Task „Werkzeug-Anbieter-Vertrag"). Die pure Schicht ist
    // unit-getestet; hier zaehlt die NAHT: liest `currentToolNames()` wirklich aus
    // `app.plugins.plugins[*].api`, geht `buildTools().run()` an `execute()` des Anbieters,
    // greift der Nutzer-Schalter aus `toolsDisabled` auch fuer ein montiertes Werkzeug, und
    // verschwindet das Werkzeug samt Route, sobald der Anbieter weg ist? Ein Stub unter einer
    // eigenen Plugin-Id — kein echtes Plugin traegt sie, also kann der Punkt nichts
    // ueberschreiben (CORE-TEST-21). Stub-Form = Vertragsstand vault-rag 92c6c4d.
    const PROV = "koda-smoke-provider";
    let detail47 = "nicht gelaufen";
    let ok47 = false;
    const provVorher = await cdp.evaluate<boolean>(`return !!app.plugins.plugins[${JSON.stringify(PROV)}];`);
    if (provVorher) {
      detail47 = `uebersprungen — ${PROV} existiert bereits (Rest eines abgebrochenen Laufs)`;
      record("47. Werkzeug-Anbieter: montiert, geroutet, abschaltbar, entfernt", true, detail47);
    } else {
      try {
        const vorher = await cdp.evaluate<string[]>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].currentToolNames();`);
        await cdp.evaluate(`
          window.__kodaProvCalls = [];
          app.plugins.plugins[${JSON.stringify(PROV)}] = {
            api: {
              tools: (opts) => [
                { name: "smoke_echo", description: "Smoke: " + String(opts && opts.lang), parameters: { type: "object", properties: { text: { type: "string", description: "x" } }, required: ["text"] }, writes: false },
                { name: "read_note", description: "Kollision mit dem Wirt — darf NICHT montiert werden", parameters: { type: "object", properties: {}, required: [] }, writes: false },
                { name: "related_notes", description: "Anbieter-Fassung — ersetzt Kodas eigene", parameters: { type: "object", properties: { path: { type: "string", description: "p" } }, required: ["path"] }, writes: false },
              ],
              execute: async (name, args, opts) => {
                window.__kodaProvCalls.push({ name, args, lang: opts && opts.lang, hatConfirm: typeof (opts && opts.confirm) === "function" });
                return { ok: true, content: name === "related_notes" ? "related:" + String(args.path) : "echo:" + String(args.text) };
              },
            },
          };
          return true;
        `);
        const p = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
        const mit = await cdp.evaluate<string[]>(`return ${p}.currentToolNames();`);
        const defs = await cdp.evaluate<{ name: string; description: string }[]>(`return ${p}.currentToolDefs().filter(d => d.name === "smoke_echo" || d.name === "read_note");`);
        const lauf = await cdp.evaluate<{ ok: boolean; content?: string; error?: string }>(`return await ${p}.buildTools().run("smoke_echo", { text: "hallo" });`);
        // Wirts-Name aus dem Anbieter: `related_notes` muss an den Anbieter gehen, nicht in
        // Kodas eigenen Pfad (Praxistest-Befund 2026-09-25: die erste Fassung routete nach Name).
        const related = await cdp.evaluate<{ ok: boolean; content?: string; error?: string }>(`return await ${p}.buildTools().run("related_notes", { path: "Notes/Tools.md" });`);
        const calls = await cdp.evaluate<{ name: string; args: unknown; lang: string; hatConfirm: boolean }[]>(`return window.__kodaProvCalls;`);
        // Nutzer-Schalter: abgeschaltet heisst nicht gesendet UND nicht ausfuehrbar.
        const aus = await cdp.evaluate<{ names: string[]; lauf: { ok: boolean; error?: string } }>(`
          const p = ${p};
          const alt = p.settings.toolsDisabled;
          p.settings.toolsDisabled = [...alt, "smoke_echo"];
          const names = p.currentToolNames();
          const lauf = await p.buildTools().run("smoke_echo", { text: "x" });
          p.settings.toolsDisabled = alt;
          return { names, lauf };
        `);
        // Anbieter weg: Werkzeug weg, Aufruf meldet Klartext statt zu werfen.
        const weg = await cdp.evaluate<{ names: string[]; lauf: { ok: boolean; error?: string } }>(`
          delete app.plugins.plugins[${JSON.stringify(PROV)}];
          const p = ${p};
          return { names: p.currentToolNames(), lauf: await p.buildTools().run("smoke_echo", { text: "x" }) };
        `);
        const readNoteDef = defs.find((d) => d.name === "read_note");
        ok47 = !vorher.includes("smoke_echo")
          && mit.includes("smoke_echo")
          && mit.filter((n) => n === "read_note").length === 1
          && readNoteDef !== undefined && !readNoteDef.description.startsWith("Kollision")
          && lauf.ok === true && lauf.content === "echo:hallo"
          && related.ok === true && related.content === "related:Notes/Tools.md"
          && calls.length === 2 && calls[0].name === "smoke_echo" && (calls[0].lang === "de" || calls[0].lang === "en") && calls[0].hatConfirm
          && calls[1].name === "related_notes"
          && !aus.names.includes("smoke_echo") && aus.lauf.ok === false && /abgeschaltet/.test(aus.lauf.error ?? "")
          && !weg.names.includes("smoke_echo") && weg.lauf.ok === false && /nicht mehr verf/.test(weg.lauf.error ?? "");
        detail47 = `vorher ${vorher.length} Werkzeuge · mit Anbieter ${mit.length} (smoke_echo ${mit.includes("smoke_echo") ? "montiert" : "FEHLT"}, read_note ${mit.filter((n) => n === "read_note").length}× — ${readNoteDef?.description.startsWith("Kollision") ? "ANBIETER GEWANN" : "Wirt gewann"}) · `
          + `run → ${lauf.ok ? `„${lauf.content}“` : `Fehler „${lauf.error}“`} · related_notes → ${related.ok ? `„${related.content}“` : `Fehler „${related.error}“`} · execute sah lang=${calls[0]?.lang}, confirm=${calls[0]?.hatConfirm} · `
          + `abgeschaltet: gesendet ${aus.names.includes("smoke_echo")}, run „${aus.lauf.error ?? "ok?!"}“ · `
          + `entfernt: gesendet ${weg.names.includes("smoke_echo")}, run „${weg.lauf.error ?? "ok?!"}“`;
      } catch (error) {
        detail47 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        await cdp.evaluate(`
          delete app.plugins.plugins[${JSON.stringify(PROV)}];
          delete window.__kodaProvCalls;
          return true;
        `).catch(() => undefined);
      }
      record("47. Werkzeug-Anbieter: montiert, geroutet, abschaltbar, entfernt", ok47, detail47);
    }

    // --- 48. list_notes mit depth zeigt den Ordnerbaum — auch einen leeren Ordner auf Ebene 2 ---
    // Anlass 2026-09-26: Koda fragte nach einer Landkarte des Vaults. Die pure Schicht ist
    // unit-getestet (Kappung nach Ebenen, Reihenfolge, Warnung); offen ist hier die NAHT:
    // liefert `vault.getAllFolders()` einen Ordner ohne Notiz auch in der ZWEITEN Ebene, und
    // kommt `depth` als String aus dem Modell ueber `run()` im Baum an? Gebaut wird zwei Projekte
    // — eines mit `_Tasks` UND leerem `_Meilensteine`, eines nur mit `_Tasks` —, also genau die
    // Frage „fehlt irgendwo ein Struktur-Ordner?". Eigenen Zustand vorher pruefen (CORE-TEST-21).
    const W48 = "Koda/smoke48";
    let detail48 = "nicht gelaufen";
    let ok48 = false;
    let eigen48 = true;
    try {
      const r48 = await cdp.evaluate<{
        vorher: boolean;
        tief?: { ok: boolean; content?: string; error?: string };
        flach?: { ok: boolean; content?: string; error?: string };
      }>(`
        const W = ${JSON.stringify(W48)};
        if (app.vault.getAbstractFileByPath(W) !== null) return { vorher: true };
        await app.vault.createFolder(W + "/A/_Tasks");
        await app.vault.createFolder(W + "/A/_Meilensteine");
        await app.vault.createFolder(W + "/B/_Tasks");
        await app.vault.create(W + "/A/_Tasks/t.md", "x");
        await app.vault.create(W + "/B/_Tasks/u.md", "x");
        const t = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].buildTools();
        return {
          vorher: false,
          tief: await t.run("list_notes", { folder: W, depth: "2" }),
          flach: await t.run("list_notes", { folder: W }),
        };
      `);
      eigen48 = !r48.vorher;
      if (r48.vorher) {
        detail48 = `${W48} existiert schon (Rest eines abgebrochenen Laufs?) — nicht gemessen, bitte von Hand entfernen`;
      } else {
        const tief = r48.tief?.content ?? r48.tief?.error ?? "";
        const flach = r48.flach?.content ?? r48.flach?.error ?? "";
        const kopf = /Ordnerbaum bis Tiefe 2 \(5 Ordner/.test(tief);
        const leer = tief.includes(`  ${W48}/A/_Meilensteine/ (keine Notiz)`);
        const tasksB = tief.includes(`  ${W48}/B/_Tasks/ (1 Notiz)`);
        // Die flache Liste bleibt, wie sie war — depth darf das Verhalten ohne Parameter nicht aendern.
        const flachWieVorher = flach.includes("Unterordner: ") && !flach.includes("Ordnerbaum");
        ok48 = r48.tief?.ok === true && kopf && leer && tasksB && flachWieVorher;
        detail48 = `Kopf ${kopf ? "„Tiefe 2, 5 Ordner“" : `FALSCH: ${tief.split("\n").slice(0, 2).join(" ⏎ ").slice(0, 90)}`} · `
          + `leeres _Meilensteine ${leer ? "gesehen" : "FEHLT"} · B/_Tasks ${tasksB ? "gesehen" : "FEHLT"} · `
          + `ohne depth ${flachWieVorher ? "unverändert flach" : "VERÄNDERT"}`;
      }
    } catch (error) {
      detail48 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      if (eigen48) await cdp.evaluate(`
        const f = app.vault.getAbstractFileByPath(${JSON.stringify(W48)});
        if (f) await app.vault.delete(f, true);
        return true;
      `).catch(() => undefined);
    }
    record("48. list_notes mit depth zeigt den Ordnerbaum, leere Ordner der zweiten Ebene inklusive", ok48, detail48);
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
