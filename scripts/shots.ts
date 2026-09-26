/**
 * Aufnahme-Treiber fuer die README-Bilder — faehrt den Vertrag aus `docs/images/README.md`
 * gegen ein laufendes Obsidian (CDP), statt die Bilder von Hand zu klicken.
 *
 * Bruecke, Aufnahme-Primitive und Fixture→Vault liegen zentral im Dach
 * (`obsidian-plugins/tools/obsidian-cdp/`); hier steht nur das Rezept. Form nach
 * `3d-codeblocks/scripts/shots.ts`.
 *
 * ## Die Modellantworten sind gescriptet, die Werkzeugaufrufe echt
 *
 * Ein Bild vom Chat braucht eine Antwort, und eine echte Modellantwort ist nicht
 * reproduzierbar. Der Treiber startet deshalb einen Stub-Endpunkt (OpenAI-kompatibel, SSE),
 * der je Szene eine feste Folge liefert: erst Werkzeugaufrufe, dann den Antworttext. Koda
 * fuehrt die Aufrufe WIRKLICH gegen den Staging-Vault aus, zeigt sie mit seinen eigenen
 * Schritten an und oeffnet fuer Schreibvorgaenge seinen echten Bestaetigungsdialog — nur der
 * Wortlaut des Modells ist vorgegeben. Das steht so auch im Aufnahme-Vertrag.
 *
 * ## Ablauf
 *
 * Aufgenommen wird in einer ZWEITINSTANZ auf eigenem Port (Freigabe Welle 9, 2026-09-26),
 * nicht in der regulaeren Instanz auf 9222. Profil, `.asar`, Restricted Mode und Vault-Eintrag
 * wie in `AGENTS.md` des Dachs (§ Staging-Vaults). Die Oberflaeche muss Englisch sein
 * (`obsidian.json` `language` UND `localStorage.language`, danach Neustart); der Treiber
 * prueft das und bricht sonst ab.
 *
 * ```bash
 * npm run build && npm run shots -- --setup          # Vault aus dem Fixture bauen (deployt main.js)
 * npm run shots -- --port 9329 --vault koda-agent    # alles aufnehmen
 * npm run shots -- --port 9329 --vault koda-agent --only hero.png
 * npm run shots -- --list
 * ```
 *
 * Vor jedem Lauf den CDP-Lock fuer den Port nehmen (Dach-`AGENTS.md`).
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";

import { attachTo, Cdp, closeExtraLeaves, openExisting, pollUntil, setAppConfig } from "../../tools/obsidian-cdp/cdp.js";
import { boxOf, capture, setWindowSize, writeShot, type Rect } from "../../tools/obsidian-cdp/shot.js";
import { buildVault, stagingVaultDir } from "../../tools/obsidian-cdp/vault.js";

const PLUGIN_ID = "koda-agent";
const REPO_NAME = "koda-agent";
const REPO_ROOT = cwd();
const FIXTURE_DIR = join(REPO_ROOT, "docs", "images", "fixture");
const OUT_DIR = join(REPO_ROOT, "docs", "images");
const CAPTURE_WIDTH = 1200;
const THUMB_WIDTH = 380;
const FENSTER_BREITE = 1440;
const FENSTER_HOEHE = 900;
const SIDEBAR_BREITE = 470;
/** Fester Port, damit die Endpunkt-Zeile im Einstellungsbild eine ruhige Adresse zeigt. */
const STUB_PORT = 11500;
const STUB_MODEL = "local-model";

// --- Stub-Endpunkt -----------------------------------------------------------------

interface WireMessage { role: string; content?: string | null }
type Schritt = { tool: string; args: Record<string, unknown> } | { text: string };

/** Szenen: erkannt am Wortlaut der letzten Nutzer-Nachricht (der Arbeitskontext steht davor
 *  im selben Text, deshalb `includes`, nicht Gleichheit). Je Szene zaehlt die Zahl der
 *  Werkzeug-Ergebnisse seit dieser Nachricht, welcher Schritt dran ist. */
const SZENEN: { erkennung: string; schritte: Schritt[] }[] = [
  {
    erkennung: "needs the most attention",
    schritte: [
      { tool: "search_notes", args: { query: "Bed A" } },
      { tool: "read_note", args: { path: "Garden/Watering schedule.md" } },
      { tool: "read_note", args: { path: "Garden/Tomatoes.md" } },
      {
        text:
          "**Bed A** needs the most attention this week:\n\n"
          + "- **Water deeply** every second morning, and daily while it stays above 28 °C ([[Watering schedule]]).\n"
          + "- **Remove the lower leaves** with yellow spots and keep the leaves dry when watering ([[Tomatoes]]).\n"
          + "- **Mulch** once the soil is warm; it halves the watering.\n\n"
          + "Beds B and C just follow the routine: beans and squash twice a week, lettuce every evening while the seedlings are small.",
      },
    ],
  },
  {
    erkennung: "Watering this week",
    schritte: [
      {
        tool: "write_note",
        args: {
          path: "Tasks/Watering this week.md",
          mode: "create",
          content:
            "# Watering this week\n\n"
            + "- [ ] Bed A: deep watering every second morning (daily above 28 °C)\n"
            + "- [ ] Bed A: remove yellow-spotted lower leaves\n"
            + "- [ ] Bed A: mulch once the soil is warm\n"
            + "- [ ] Bed B: water twice a week, soil first\n"
            + "- [ ] Bed C: light watering every evening\n\n"
            + "From [[Watering schedule]] and [[Tomatoes]]\n",
        },
      },
      { text: "Understood, I did not create the note." },
    ],
  },
];

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function antwort(messages: WireMessage[]): string {
  let letzteNutzer = -1;
  messages.forEach((m, i) => { if (m.role === "user") letzteNutzer = i; });
  const frage = letzteNutzer >= 0 ? String(messages[letzteNutzer]?.content ?? "") : "";
  const szene = SZENEN.find((s) => frage.includes(s.erkennung));
  const schritt = messages.slice(letzteNutzer + 1).filter((m) => m.role === "tool").length;
  const s: Schritt = szene?.schritte[Math.min(schritt, szene.schritte.length - 1)] ?? { text: "(no scripted answer)" };
  if ("text" in s) {
    // In Stuecken, damit Koda wie bei einem echten Modell streamt.
    const teile = s.text.match(/[^\n]+\n*|\n+/g) ?? [s.text];
    return teile.map((t) => sse({ choices: [{ delta: { content: t }, finish_reason: null }] })).join("")
      + sse({ choices: [{ delta: {}, finish_reason: "stop" }] }) + "data: [DONE]\n\n";
  }
  const id = `call_${schritt}`;
  return sse({ choices: [{ delta: { tool_calls: [{ index: 0, id, type: "function", function: { name: s.tool, arguments: "" } }] }, finish_reason: null }] })
    + sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(s.args) } }] }, finish_reason: null }] })
    + sse({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }) + "data: [DONE]\n\n";
}

async function startStub(): Promise<{ url: string; close: () => Promise<void> }> {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "*" };
  const server: Server = createServer((req, res) => {
    if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
    if (req.method === "POST" && req.url?.includes("/chat/completions") === true) {
      let body = "";
      req.on("data", (c: Buffer) => { body += c.toString("utf8"); });
      req.on("end", () => {
        const parsed = JSON.parse(body) as { messages?: WireMessage[] };
        res.writeHead(200, { ...cors, "Content-Type": "text/event-stream" });
        res.end(antwort(parsed.messages ?? []));
      });
      return;
    }
    res.writeHead(200, { ...cors, "Content-Type": "application/json" });
    res.end(req.url?.includes("/models") === true
      ? JSON.stringify({ data: [{ id: STUB_MODEL, object: "model" }] })
      : JSON.stringify({ ok: true }));
  });
  // Fester Port fuer eine ruhige Adresse im Einstellungsbild; ist er belegt (andere Sessions
  // starten eigene Stubs), ein freier — das Bild zeigt dann eine andere Zahl, sonst nichts.
  const lauschen = (port: number): Promise<void> => new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  await lauschen(STUB_PORT).catch(() => lauschen(0));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((r) => { server.close(() => { r(); }); }) };
}

// --- Bausteine ---------------------------------------------------------------------

const P = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;

/** Ausgangszustand jeder Szene: Endpunkt auf den Stub, neues Gespraech, eine Notiz offen,
 *  Seitenleiste offen und breit genug zum Lesen. Jede Szene stellt ihn SELBST her — ein Bild
 *  darf nicht davon abhaengen, dass das vorige sauber zu Ende lief. */
async function grundzustand(cdp: Cdp, stubUrl: string, modus: string, notiz: string): Promise<boolean> {
  // Reste des vorigen Motivs zuerst: ein offener Bestaetigungsdialog haelt den Lauf fest, und
  // solange Koda arbeitet, tut `newChat()` NICHTS (Guard auf `busy`) — das naechste Bild
  // zeigte dann das alte Gespraech samt Dialog. Gemessen im ersten Lauf 2026-09-26.
  await dialogeSchliessen(cdp);
  await cdp.evaluate(`${P}.stopRun(); return true;`);
  await idle(cdp, 10_000);
  await cdp.evaluate(`
    const p = ${P};
    p.settings.endpoints = [{ url: ${JSON.stringify(stubUrl)} }];
    p.settings.model = ${JSON.stringify(STUB_MODEL)};
    p.settings.language = "en";
    await p.saveSettings();
    await p.newChat();
    p.setContextMode(${JSON.stringify(modus)});
    return true;
  `);
  await setAppConfig(cdp, "livePreview", true);
  if (!(await openExisting(cdp, notiz, "source"))) {
    console.log(`      · ${notiz} liess sich nicht oeffnen`);
    return false;
  }
  await closeExtraLeaves(cdp);
  await cdp.evaluate(`
    await ${P}.activateView();
    app.workspace.leftSplit.collapse();
    const rs = app.workspace.rightSplit;
    rs.expand();
    if (typeof rs.setSize === "function") rs.setSize(${SIDEBAR_BREITE});
    rs.containerEl.style.width = "${SIDEBAR_BREITE}px";
    // Nur die Koda-Ansicht im rechten Dock sichtbar lassen: Backlinks & Co. malen sonst mit.
    const leaf = app.workspace.getLeavesOfType("koda-agent-view")[0];
    if (leaf) app.workspace.revealLeaf(leaf);
    return true;
  `);
  // Die Breite greift erst nach dem naechsten Layout-Durchlauf; ohne dieses Warten nahm das
  // erste Motiv die alte, schmale Seitenleiste auf.
  await pollUntil<boolean>(cdp, `return app.workspace.rightSplit.containerEl.getBoundingClientRect().width >= ${SIDEBAR_BREITE - 5};`, 5000, 200);
  return (await pollUntil<boolean>(cdp, `return !!document.querySelector(".koda-input");`, 8000, 200)) === true;
}

/** Offene Dialoge ueber ihren Abbrechen-Knopf schliessen. Das X (`.modal-close-button`) per
 *  `click()` liess Kodas Bestaetigungsdialog stehen; der Knopf mit dem Text traegt. */
async function dialogeSchliessen(cdp: Cdp): Promise<void> {
  await cdp.evaluate(`
    for (const b of document.querySelectorAll(".modal-container button")) {
      if (b.textContent.trim() === "Cancel") b.click();
    }
    return true;
  `);
  await pollUntil<boolean>(cdp, `return document.querySelectorAll(".modal-container").length === 0;`, 5000, 200);
}

/** Frage ueber die echte Eingabe senden (Enter), nicht ueber `p.ask()` — so entsteht die
 *  Nutzer-Blase genau wie beim Tippen. */
async function fragen(cdp: Cdp, frage: string): Promise<void> {
  await cdp.evaluate(`
    const el = [...document.querySelectorAll(".koda-input")].find((e) => e.getBoundingClientRect().width > 1);
    el.focus();
    el.value = ${JSON.stringify(frage)};
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    return true;
  `);
}

async function idle(cdp: Cdp, timeoutMs = 20_000): Promise<boolean> {
  return (await pollUntil<boolean>(cdp, `return ${P}.busy === false;`, timeoutMs, 250)) === true;
}

async function sidebarBox(cdp: Cdp): Promise<Rect | null> {
  return boxOf(cdp, ".workspace-split.mod-right-split");
}

// --- Rezept ------------------------------------------------------------------------

interface Shot {
  name: string;
  klasse: "hero" | "feature" | "detail";
  muss: string;
  run(cdp: Cdp, ctx: { stubUrl: string; port: number; vault: string | undefined }): Promise<{ rect: Rect | null; aus?: Cdp }>;
}

const SHOTS: Shot[] = [
  {
    name: "hero.png",
    klasse: "hero",
    muss: "Note open on the left, Koda's sidebar on the right with a question, three tool steps and a streamed answer with wikilinks",
    async run(cdp, ctx) {
      if (!(await grundzustand(cdp, ctx.stubUrl, "workspace", "Garden/Garden plan.md"))) return { rect: null };
      await fragen(cdp, "Which bed needs the most attention this week?");
      if (!(await idle(cdp))) return { rect: null };
      await new Promise((r) => setTimeout(r, 600));
      return { rect: { x: 0, y: 0, width: FENSTER_BREITE, height: FENSTER_HOEHE } };
    },
  },
  {
    name: "confirm-write.png",
    klasse: "feature",
    muss: "The confirmation dialog for a write outside the Koda folder, showing path and full text, with Write / Cancel",
    async run(cdp, ctx) {
      if (!(await grundzustand(cdp, ctx.stubUrl, "workspace", "Garden/Watering schedule.md"))) return { rect: null };
      await fragen(cdp, "Put a checklist into Tasks/Watering this week.md.");
      const da = await pollUntil<boolean>(cdp, `return !!document.querySelector(".modal-container .modal");`, 15_000, 250);
      if (!da) return { rect: null };
      await new Promise((r) => setTimeout(r, 500));
      const rect = await boxOf(cdp, ".modal-container .modal", 24);
      return { rect };
    },
  },
  {
    name: "context-tab.png",
    klasse: "feature",
    muss: "The Context tab in mode Note: the active note plus its links and backlinks as chips, with the usage summary line",
    async run(cdp, ctx) {
      if (!(await grundzustand(cdp, ctx.stubUrl, "note", "Garden/Garden plan.md"))) return { rect: null };
      await cdp.evaluate(`
        for (const leaf of app.workspace.getLeavesOfType("koda-agent-view")) leaf.view.setTab("context");
        return true;
      `);
      const da = await pollUntil<boolean>(cdp, `
        return [...document.querySelectorAll(".koda-ctx-chip-label")].filter((e) => e.getBoundingClientRect().width > 1).length >= 3;
      `, 10_000, 250);
      if (!da) return { rect: null };
      await new Promise((r) => setTimeout(r, 500));
      // Nur bis zum letzten Inhalt, nicht bis zum Fensterrand: darunter liegt eine leere Flaeche
      // und die Statusleiste der Notiz.
      const box = await sidebarBox(cdp);
      const unten = await cdp.evaluate<number>(`
        const els = [...document.querySelectorAll(".koda-ctx-body *")].filter((e) => e.getBoundingClientRect().width > 1);
        return Math.max(...els.map((e) => e.getBoundingClientRect().bottom));
      `);
      return { rect: box ? { ...box, height: Math.min(box.height, unten - box.y + 20) } : null };
    },
  },
  {
    name: "settings.png",
    klasse: "detail",
    muss: "Settings → Koda: endpoint row tested as Connected, model picked, the first general settings",
    async run(cdp, ctx) {
      if (!(await grundzustand(cdp, ctx.stubUrl, "workspace", "Garden/Garden plan.md"))) return { rect: null };
      await cdp.evaluate(`app.setting.open(); app.setting.openTabById(${JSON.stringify(PLUGIN_ID)}); return true;`);
      await new Promise((r) => setTimeout(r, 1500));
      const win = await attachTo("settings", ctx.port, ctx.vault);
      if (!win) return { rect: null };
      await win.send("Page.bringToFront");
      const knopf = `[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Test" && b.getBoundingClientRect().width > 1)`;
      if (!(await pollUntil<boolean>(win, `return !!(${knopf});`, 8000, 250))) return { rect: null, aus: win };
      await win.evaluate(`(${knopf}).click(); return true;`);
      await pollUntil<boolean>(win, `return document.body.textContent.includes("Connected");`, 8000, 250);
      await new Promise((r) => setTimeout(r, 600));
      const rect = await win.evaluate<string | null>(`
        const c = [...document.querySelectorAll(".vertical-tab-content")].find((e) => e.getBoundingClientRect().width > 1);
        if (!c) return null;
        const r = c.getBoundingClientRect();
        return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: Math.min(r.height, r.width * 1.5) });
      `);
      return { rect: rect ? (JSON.parse(rect) as Rect) : null, aus: win };
    },
  },
];

// --- Ablauf ------------------------------------------------------------------------

function setup(): void {
  const log = buildVault({ repoRoot: REPO_ROOT, vaultDir: stagingVaultDir(REPO_NAME), fixtureDir: FIXTURE_DIR, pluginId: PLUGIN_ID });
  for (const zeile of log) console.log(`  ${zeile}`);
}

async function main(): Promise<void> {
  const args = argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? undefined : args[i + 1];
  };
  if (args.includes("--setup")) { setup(); return; }
  if (args.includes("--list")) {
    for (const s of SHOTS) console.log(`${s.name.padEnd(20)} ${s.klasse.padEnd(8)} ${s.muss}`);
    return;
  }
  const port = Number(flag("port") ?? 9222);
  const vault = flag("vault");
  const only = flag("only");

  const cdp = await attachTo("workspace", port, vault);
  if (!cdp) throw new Error(`Kein Obsidian-Hauptfenster auf Port ${port}${vault ? ` fuer Vault „${vault}"` : ""}.`);

  const sprache = await cdp.evaluate<string>(`return window.localStorage.getItem("language") ?? "en";`);
  if (sprache !== "en") {
    throw new Error(`Obsidian-Oberflaeche ist „${sprache}", nicht Englisch — obsidian.json language und localStorage.language auf "en", dann neu starten.`);
  }
  await cdp.evaluate(`
    await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)});
    await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)});
    return true;
  `);
  if (!(await setWindowSize(cdp, FENSTER_BREITE, FENSTER_HOEHE))) console.log("  (Fenstergroesse liess sich nicht setzen)");

  const stub = await startStub();
  let vorher: string | null = null;
  let fehlend = 0;
  try {
    vorher = await cdp.evaluate<string>(`return JSON.stringify(${P}.settings);`);
    for (const shot of SHOTS) {
      if (only && shot.name !== only) continue;
      console.log(`→ ${shot.name}`);
      const { rect, aus } = await shot.run(cdp, { stubUrl: stub.url, port, vault });
      if (!rect) {
        console.log(`  ✗ ${shot.name}: Zustand kam nicht zustande`);
        fehlend += 1;
      } else {
        const quelle = aus ?? cdp;
        const png = await capture(quelle, rect, 2);
        console.log(`  ✓ ${await writeShot(quelle, shot.name, png, { outDir: OUT_DIR, captureWidth: CAPTURE_WIDTH, thumbWidth: THUMB_WIDTH, thumb: shot.klasse === "detail" })}`);
      }
      if (aus) {
        await cdp.evaluate(`app.setting.close(); return true;`).catch(() => undefined);
        aus.close();
      }
      await dialogeSchliessen(cdp);
      await idle(cdp, 10_000);
    }
  } finally {
    if (vorher !== null) {
      await cdp.evaluate(`
        const p = ${P};
        Object.assign(p.settings, JSON.parse(${JSON.stringify(vorher)}));
        await p.saveSettings();
        return true;
      `).catch(() => undefined);
    }
    await stub.close();
    cdp.close();
  }
  if (fehlend > 0) exit(1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  exit(1);
});
