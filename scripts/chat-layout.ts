/**
 * Layout-Messung des Chats (Welle 29, Chat-Zeile mit obsidian-kit 0.74.0): Mobil-Emulation 390 × 844 mit und ohne die Höhe einer iOS-Tastatur (336 pt) und der Desktop
 * (1280 × 800), Standardtheme hell und dunkel, Bild und Maße je Zustand. Misst, was ein DOM-Smoke nicht sieht: Höhe des Antwortbereichs in Zeilen, Abstand der
 * Knopfreihe zum unteren Rand, Tippflächen (Neu, Verlauf, Neu laden, Senden), Überdeckung der Teile des Composers, Reihenfolge von oben nach unten.
 * Der Treiber startet und beendet seine Zweitinstanz selbst (nur die eigene PID). Vorlage: `settings-assistant/scripts/chat-layout.ts`.
 *
 * ```bash
 * npm run build && npm run smoke:gui -- --setup            # baut den Staging-Vault (und kopiert den Build hinein)
 * lsof -nP -iTCP:<PORT> -sTCP:LISTEN
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label koda-agent --intent "chat-layout <tag>" --exclusive focus --port <PORT> --ttl 600
 * npm run chat-layout -- --port <PORT> --tag nachher [--out /tmp/koda-w29] [--plugin-dir <ordner mit main.js, styles.css, manifest.json>] [--keep 5]
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py release --port <PORT>
 * ```
 *
 * `--plugin-dir` legt einen anderen Build (etwa den alten für „vorher“) in den Staging-Vault; ohne die Angabe bleibt, was `--setup` hineingelegt hat.
 * `--keep` setzt die Aufbewahrung des Verlaufs (Vorgabe 5, damit der Verlauf-Knopf im Bild steht; 0 zeigt die Vorgabe der Auslieferung).
 *
 * Grenze: die Emulation verkleinert den Viewport um die Tastaturhöhe; sie ersetzt weder das Verhalten von WKWebView noch die Schublade von Obsidian Mobile am Gerät.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { argv, exit } from "node:process";

import { Cdp, attachTo, bereiteInstanzVor, requireVisible } from "../../tools/obsidian-cdp/cdp.js";
import { startLlmStub } from "../../tools/obsidian-cdp/llm-stub.js";
import { capture } from "../../tools/obsidian-cdp/shot.js";
import { stagingVaultDir } from "../../tools/obsidian-cdp/vault.js";

const REPO_NAME = "koda-agent";
const PLUGIN_ID = "koda-agent";
const PROFILE = "/tmp/obs-test-koda-agent";
const OBSIDIAN_BIN = "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
const FAKE_MODEL = "qwen3-8b";
const BREITE = 390;
const HOEHE = 844;
/** iOS-Tastatur mit Vorschlagsleiste, iPhone 6,1 Zoll, hochkant. */
const TASTATUR = 336;

const q = (s: string): string => JSON.stringify(s);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const flag = (name: string): string | undefined => { const i = argv.indexOf(name); return i === -1 ? undefined : argv[i + 1]; };

const ANTWORT = [
  "Eine Liste der offenen Aufgaben, kurz zusammengefasst:",
  "",
  "1. Die Rechnung an das Amt prüfen und freigeben.",
  "2. Den Termin beim Zahnarzt verschieben.",
  "3. Die Notizen zum Projekt in einen Absatz bringen.",
  "",
  "Soll ich daraus eine Notiz anlegen?",
].join("\n");

function pgrepProfile(ud: string): string {
  try { return execFileSync("pgrep", ["-f", `user-data-dir=${ud}`], { encoding: "utf8" }).trim(); } catch { return ""; }
}
function portHalten(port: number): boolean {
  try { return execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() !== ""; } catch { return false; }
}
function neuesteAsar(): string | null {
  const dir = join(homedir(), "Library/Application Support/obsidian");
  const dateien = readdirSync(dir).filter((f) => /^obsidian-\d+\.\d+\.\d+\.asar$/.test(f));
  dateien.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const letzte = dateien[dateien.length - 1];
  return letzte ? join(dir, letzte) : null;
}

interface Instanz { child: ChildProcess; ud: string }
function startInstanz(vaultDir: string, port: number): Instanz {
  if (portHalten(port)) throw new Error(`Port ${port} ist belegt — anderen waehlen (nichts beendet).`);
  const ud = PROFILE;
  if (pgrepProfile(ud) !== "") throw new Error(`Das Profil ${ud} wird von einer fremden Instanz gehalten — Abbruch (nichts beendet).`);
  rmSync(ud, { recursive: true, force: true });   // je Messlauf ein frischer Prozess und ein frisches Profil
  mkdirSync(ud, { recursive: true });
  writeFileSync(join(ud, "obsidian.json"), JSON.stringify({ vaults: { [REPO_NAME]: { path: vaultDir, ts: Date.now(), open: true } }, language: "en" }));
  const asar = neuesteAsar();
  if (asar) copyFileSync(asar, join(ud, asar.split("/").pop() ?? "obsidian.asar"));
  const child = spawn(OBSIDIAN_BIN, [`--user-data-dir=${ud}`, `--remote-debugging-port=${port}`, "--lang=en-US"], { stdio: "ignore" });
  console.log(`Zweitinstanz gestartet: PID ${child.pid ?? "?"}, Profil ${ud}, Port ${port}`);
  return { child, ud };
}
async function stopInstanz(inst: Instanz): Promise<void> {
  const exited = new Promise<void>((resolve) => { inst.child.once("exit", () => { resolve(); }); });
  if (inst.child.exitCode === null) inst.child.kill("SIGTERM");
  await Promise.race([exited, sleep(8000)]);
  if (inst.child.exitCode === null && inst.child.signalCode === null) { inst.child.kill("SIGKILL"); await Promise.race([exited, sleep(4000)]); }
  await sleep(500);
  const rest = pgrepProfile(inst.ud);
  console.log(`Zweitinstanz beendet; verbleibende Prozesse im Profil: ${rest === "" ? "keine" : rest.replace(/\n/g, ",")}`);
}
async function warteAufFenster(port: number, timeoutMs: number): Promise<Cdp> {
  const bis = Date.now() + timeoutMs;
  let letzter = "";
  while (Date.now() < bis) {
    try { const cdp = await attachTo("workspace", port, REPO_NAME); if (cdp) return cdp; } catch (e) { letzter = (e as Error).message; }
    await sleep(1000);
  }
  throw new Error(`Kein Obsidian-Fenster fuer Vault "${REPO_NAME}" auf Port ${port}. ${letzter}`);
}

async function bereiteVor(cdp: Cdp): Promise<void> {
  const vor = await bereiteInstanzVor(cdp, { pluginIds: [PLUGIN_ID], nurVault: REPO_NAME, sprache: "en" });
  const lang = await cdp.evaluate<string>(`return String(window.moment ? window.moment.locale() : "?");`);
  console.log(`Plugin: ${vor.hinweis}; Sprache ${lang}`);
  if (!vor.hinweis.includes(`${PLUGIN_ID}:geladen`) || vor.hinweis.includes("FEHLT")) throw new Error(`Plugin nicht geladen — ${vor.hinweis}`);
}

async function setzeEinstellungen(cdp: Cdp, url: string, keep: number): Promise<void> {
  await cdp.evaluate(`
    const p = app.plugins.plugins[${q(PLUGIN_ID)}];
    p.settings.endpoints = [{ url: ${q(url)}, model: ${q(FAKE_MODEL)} }];
    p.settings.chatKeep = ${keep};
    await p.saveSettings();
    return true;`);
}

// --- Messung -------------------------------------------------------------------------------------

interface Box { x: number; y: number; w: number; h: number; bottom: number }
interface Messung {
  zustand: string; viewport: [number, number]; isMobile: boolean;
  log: Box | null; zeilenhoehe: number; logZeilen: number;
  teile: Record<string, Box | null>;
  tiefster: number; abstandUnten: number;
  tippflaechen: Record<string, [number, number] | null>;
  ueberdeckung: string[];
  reihenfolge: string[];
  navbar: string;
  hauptbereich: boolean; hostMarkiert: boolean; leereFlaeche: number; hostPadding: string;
}

/** Selektoren des neuen Aufbaus; der alte (vor Welle 29) hat `.koda-header`, `.koda-buttons` und die Modellzeile über dem Verlauf. Fehlt ein Teil, steht `null`. */
const MESS_JS = `
  const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); if (b.width === 0 && b.height === 0) return null; return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), bottom: +b.bottom.toFixed(1) }; };
  const root = ".koda-root ";
  const teile = {
    kopfzeile: r(root + ".koda-header"),
    modellzeile: r(root + ".okit-model-bar"),
    modellDropdown: r(root + ".okit-model-bar-select"),
    denkStufe: r(root + ".okit-thinking-control"),
    neuLaden: r(root + ".okit-model-bar-refresh"),
    verlauf: r(root + ".koda-log"),
    status: r(root + ".koda-status"),
    composer: r(root + ".koda-input-bar"),
    eingabe: r(root + ".koda-input"),
    knopfreihe: r(root + ".koda-buttons-start") || r(root + ".koda-buttons"),
    neu: r(root + ".koda-new"),
    verlaufKnopf: r(root + ".koda-archive"),
    modus: r(root + ".koda-mode"),
    senden: r(root + ".koda-send") || r(root + ".koda-buttons button.mod-cta"),
    stopp: r(root + ".koda-stop"),
  };
  const log = document.querySelector(root + ".koda-log");
  const body = log && (log.querySelector(".koda-msg") || log);
  const cs = body ? getComputedStyle(body) : null;
  let lh = cs ? parseFloat(cs.lineHeight) : NaN; if (!Number.isFinite(lh)) lh = cs ? parseFloat(cs.fontSize) * 1.5 : 20;
  const lb = log ? log.getBoundingClientRect() : null;
  const unterGruppe = ["eingabe", "knopfreihe", "modus", "senden", "modellzeile", "status"];
  const unten = unterGruppe.map((k) => teile[k]).filter(Boolean).map((b) => b.bottom);
  const tiefster = unten.length ? Math.max(...unten) : 0;
  const ueberdeckung = [];
  const gruppe = ["modellzeile", "eingabe", "knopfreihe", "modus", "senden", "status"];
  for (let i = 0; i < gruppe.length; i++) for (let j = i + 1; j < gruppe.length; j++) {
    const a = teile[gruppe[i]], b = teile[gruppe[j]]; if (!a || !b) continue;
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
    if (w > 0.5 && h > 0.5) ueberdeckung.push(gruppe[i] + " x " + gruppe[j] + " (" + w.toFixed(1) + "×" + h.toFixed(1) + ")");
  }
  const namen = Object.entries(teile).filter(([n, b]) => b && !["modellDropdown", "denkStufe", "neuLaden", "neu", "verlaufKnopf"].includes(n));
  const reihe = namen.sort((a, b) => a[1].y - b[1].y || a[1].x - b[1].x).map(([n, b]) => n + "@" + Math.round(b.y) + "," + Math.round(b.x));
  const flaeche = (b) => b ? [Math.round(b.w), Math.round(b.h)] : null;
  const navb = document.querySelector(".mobile-navbar"); const nb = navb ? navb.getBoundingClientRect() : null;
  return {
    viewport: [innerWidth, innerHeight], isMobile: document.body.classList.contains("is-mobile"),
    log: teile.verlauf, zeilenhoehe: +lh.toFixed(2), logZeilen: lb ? +(lb.height / lh).toFixed(1) : 0,
    teile, tiefster, abstandUnten: +(innerHeight - tiefster).toFixed(1),
    tippflaechen: { neu: flaeche(teile.neu), verlauf: flaeche(teile.verlaufKnopf), neuLaden: flaeche(teile.neuLaden), senden: flaeche(teile.senden) },
    ueberdeckung, reihenfolge: reihe,
    navbar: nb ? ("y " + Math.round(nb.y) + " h " + Math.round(nb.height)) : "keine",
    hauptbereich: !!document.querySelector(root)?.closest(".mod-root"),
    hostMarkiert: !!document.querySelector(root)?.closest(".view-content")?.classList.contains("okit-chat-host"),
    hostPadding: document.querySelector(root) ? getComputedStyle(document.querySelector(root).closest(".view-content")).paddingBottom : "?",
    leereFlaeche: +((document.querySelector(".app-container")?.getBoundingClientRect().bottom ?? innerHeight) - tiefster).toFixed(1),
  };
`;

/** Setzt den Zustand der Tastatur wie Obsidian am iPhone (gemessen 2026-11-03): offen = App-Container um die Tastatur kleiner, `--keyboard-height` und `--safe-area-inset-bottom` auf der Tastaturhoehe, auf :root UND body;
 *  zu = voll, 0 px und die echte Safe-Area (34 px). Muster: obsidian-kit/pilot/chat-tastatur.ts. */
const geraetJs = (offen: boolean): string => `
  const r = document.documentElement; const app = document.querySelector(".app-container");
  for (const el of [r, document.body]) {
    el.style.setProperty("--keyboard-height", "${offen ? TASTATUR : 0}px"); el.style.setProperty("--safe-area-inset-bottom", "${offen ? TASTATUR : 34}px");
  }
  if (app) app.style.height = "${offen ? HOEHE - TASTATUR + "px" : ""}";
  return true;`;

async function messe(cdp: Cdp, zustand: string): Promise<Messung> {
  const m = await cdp.evaluate<Omit<Messung, "zustand">>(MESS_JS);
  return { zustand, ...m };
}

function kurz(m: Messung): string {
  const b = (x: Box | null): string => (x ? `${x.y}–${x.bottom} (${x.w}×${x.h})` : "—");
  const t = m.teile;
  return [
    `${m.zustand}: Viewport ${m.viewport.join("×")} mobil ${String(m.isMobile)}`,
    `  Antwortbereich ${m.log?.h ?? "—"} px = ${m.logZeilen} Zeilen à ${m.zeilenhoehe} px · tiefstes Element ${m.tiefster}, Abstand zum unteren Rand ${m.abstandUnten} px`,
    `  Kopfzeile ${b(t.kopfzeile ?? null)} · Modellzeile ${b(t.modellzeile ?? null)} · Eingabe ${b(t.eingabe ?? null)} · Knopfreihe ${b(t.knopfreihe ?? null)} · Modus ${b(t.modus ?? null)} · Senden ${b(t.senden ?? null)} · Status ${b(t.status ?? null)}`,
    `  Tippflächen (B×H): Neu ${m.tippflaechen.neu?.join("×") ?? "—"} · Verlauf ${m.tippflaechen.verlauf?.join("×") ?? "—"} · Neu laden ${m.tippflaechen.neuLaden?.join("×") ?? "—"} · Senden ${m.tippflaechen.senden?.join("×") ?? "—"}`,
    `  Überdeckung: ${m.ueberdeckung.length === 0 ? "keine" : m.ueberdeckung.join("; ")}`,
    `  Reihenfolge: ${m.reihenfolge.join(" > ")} · Navigationsleiste ${m.navbar}`,
    `  Hauptbereich ${String(m.hauptbereich)} · Host markiert ${String(m.hostMarkiert)} · Host-Abstand unten ${m.hostPadding} · leere Fläche unter dem tiefsten Element ${m.leereFlaeche} px`,
  ].join("\n");
}

async function main(): Promise<void> {
  const port = Number(flag("--port"));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("--port <1024-65535> ist Pflicht (9222 gehoert der regulaeren Instanz).");
  const tag = flag("--tag") ?? "lauf";
  const out = flag("--out") ?? "/tmp/koda-w30";
  const keep = Number(flag("--keep") ?? "5");
  const pluginDir = flag("--plugin-dir");
  mkdirSync(out, { recursive: true });

  const vaultDir = stagingVaultDir(REPO_NAME);
  if (pluginDir) {
    for (const f of ["main.js", "styles.css", "manifest.json"]) copyFileSync(join(pluginDir, f), join(vaultDir, ".obsidian/plugins", PLUGIN_ID, f));
    console.log(`Build aus ${pluginDir} in den Staging-Vault gelegt`);
  }
  const stub = await startLlmStub({ models: [FAKE_MODEL, "qwen3-14b"], standard: { text: ANTWORT, teile: 2, model: FAKE_MODEL }, port: 0 });
  const inst = startInstanz(vaultDir, port);
  let cdp: Cdp | null = null;
  const messungen: Messung[] = [];
  try {
    cdp = await warteAufFenster(port, 60_000);
    await sleep(2500);
    await bereiteVor(cdp);
    await setzeEinstellungen(cdp, stub.url, keep);
    // Eine Runde im Desktop-Zustand fuehren, damit der Verlauf nicht leer ist (Neu ist sonst gesperrt).
    await cdp.evaluate(`const p = app.plugins.plugins[${q(PLUGIN_ID)}]; if (p.views().length === 0) await p.activateView(); await p.newChat(); return true;`);
    await sleep(800);
    await cdp.evaluate(`const p = app.plugins.plugins[${q(PLUGIN_ID)}]; await p.ask("Welche Aufgaben sind offen?"); return true;`);
    await sleep(1200);

    for (const [mobil, breite, hoehe] of [[false, 1280, 800], [true, BREITE, HOEHE]] as const) {
      if (mobil) {
        // Mobil-Emulation laedt Obsidian neu (der Aufruf endet mit „Execution context was destroyed“), danach neu anhaengen.
        await cdp.evaluate(`app.emulateMobile(true); return true;`).catch(() => undefined);
        try { cdp.close(); } catch { /* Kontext schon weg */ }
        await sleep(4000);
        const neu = await attachTo("workspace", port, REPO_NAME);
        if (!neu) throw new Error("nach dem Neuladen kein Fenster");
        cdp = neu;
        await requireVisible(cdp);
        await bereiteInstanzVor(cdp, { pluginIds: [PLUGIN_ID], nurVault: REPO_NAME, sprache: "en" });
        await setzeEinstellungen(cdp, stub.url, keep);
        await cdp.send("Emulation.setDeviceMetricsOverride", { width: breite, height: hoehe, deviceScaleFactor: 2, mobile: true });
        await sleep(1200);
        if (!(await cdp.evaluate<boolean>(`return document.body.classList.contains("is-mobile");`))) throw new Error("is-mobile nach emulateMobile(true) nicht gesetzt");
      } else {
        await cdp.send("Emulation.setDeviceMetricsOverride", { width: breite, height: hoehe, deviceScaleFactor: 1, mobile: false });
      }
      // Auf dem Handy oeffnet Koda als Tab im Hauptbereich (Welle 30): die Ansicht aus der Seitenleiste des Desktop-Laufs schliessen und neu oeffnen, wie ein Nutzer am Geraet.
      if (mobil) await cdp.evaluate(`app.workspace.detachLeavesOfType("koda-agent-view"); await new Promise((r) => setTimeout(r, 400)); return true;`);
      await cdp.evaluate(`const p = app.plugins.plugins[${q(PLUGIN_ID)}]; if (p.views().length === 0) await p.activateView(); app.commands.executeCommandById(${q(`${PLUGIN_ID}:tab-chat`)}); return true;`);
      if (mobil) {
        // Eine Antwort in den Verlauf (die Mobil-Instanz hat ein neues Fenster; das Gespraech liegt in current.jsonl).
        await sleep(800);
        const leer = await cdp.evaluate<boolean>(`return app.plugins.plugins[${q(PLUGIN_ID)}].chatLog.length === 0;`);
        if (leer) await cdp.evaluate(`const p = app.plugins.plugins[${q(PLUGIN_ID)}]; await p.ask("Welche Aufgaben sind offen?"); return true;`);
        await sleep(1500);
      }
      for (const [schema, name] of [["moonstone", "hell"], ["obsidian", "dunkel"]] as const) {
        await cdp.evaluate(`app.vault.setConfig("theme", ${q(schema)}); app.updateTheme(); app.workspace.trigger("css-change"); await new Promise((r) => setTimeout(r, 600)); return true;`);
        // "ohne" = Tastatur zu (390 x 844); "tastatur" = die alte Emulation (Viewport 390 x 508, die Falte greift); "geraet" = wie am iPhone gemessen (Viewport bleibt 844, nur der App-Container wird 508 hoch,
        // --keyboard-height und --safe-area-inset-bottom stehen auf der Tastaturhoehe; die Falte per max-height greift dort nicht).
        for (const modus of mobil ? ["ohne", "tastatur", "geraet"] as const : ["ohne"] as const) {
          const mitTastatur = modus !== "ohne";
          const h = modus === "tastatur" ? HOEHE - TASTATUR : hoehe;
          await cdp.send("Emulation.setDeviceMetricsOverride", { width: breite, height: h, deviceScaleFactor: mobil ? 2 : 1, mobile: mobil });
          if (mobil) await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom: 34, left: 0, right: 0 } });
          await cdp.evaluate(geraetJs(modus === "geraet"));
          await cdp.evaluate(mitTastatur ? `document.querySelector(".koda-input")?.focus(); return true;` : `document.activeElement?.blur?.(); return true;`);
          await sleep(900);
          const zustand = `${tag}-${mobil ? "mobil" : "desktop"}-${name}-${modus}`;
          const m = await messe(cdp, zustand);
          messungen.push(m);
          console.log(kurz(m));
          const pfad = join(out, `${zustand}.png`);
          writeFileSync(pfad, await capture(cdp, undefined, 1));
          console.log(`  Bild ${pfad}`);
        }
      }
    }
    writeFileSync(join(out, `${tag}-messung.json`), JSON.stringify(messungen, null, 2));
  } finally {
    if (cdp) {
      await cdp.send("Emulation.clearDeviceMetricsOverride").catch(() => undefined);
      await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom: 0, left: 0, right: 0 } }).catch(() => undefined);
      await cdp.evaluate(geraetJs(false)).catch(() => undefined);
      // Das Profil behaelt die Emulation (localStorage): zurueckstellen, sonst startet der naechste Lauf mobil.
      await cdp.evaluate(`app.vault.setConfig("theme", "moonstone"); app.emulateMobile(false); return true;`).catch(() => undefined);
      await sleep(1500);
      cdp.close();
    }
    await stopInstanz(inst);
    await stub.stop();
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  exit(1);
});
