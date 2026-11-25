/**
 * tasknotes-lab — misst die In-App-Schnittstelle von TaskNotes (`app.plugins.plugins.tasknotes.api`) an einem laufenden TaskNotes
 * in einer Zweitinstanz: Form, Anlegen mit Standardwerten und mit abweichendem Feld-Mapping, Ändern, Abhaken, Löschen, Fehlerformen.
 * Grundlage für den Zuschnitt des TaskNotes-Werkzeugs (Task „TaskNotes über die In-App-Schnittstelle …“). Kein Modell, kein Netz.
 *
 *   npm run lab:tasknotes -- --setup                 # Staging-Vault `koda-agent-tasknotes` mit TaskNotes herstellen
 *   npm run lab:tasknotes -- --port <p>              # messen (Zweitinstanz mit eigenem Profil, Lock; Rezept: ../tools/obsidian-cdp/messlauf.sh,
 *                                                    #   VAULT=koda-agent-tasknotes RUNNER=lab:tasknotes OHNE_SETUP=1)
 *
 * TaskNotes wird aus dem Plugin-Ordner des Arbeits-Vaults kopiert (`$CODING_COCKPIT_VAULT`, Standard `~/Documents/Pallas`), ohne `data.json`:
 * es läuft mit seinen Standard-Einstellungen, die Einstellungen des Nutzers bleiben unberührt.
 */
import { cpSync, existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Cdp, bereiteInstanzVor, requireVisible } from "../../tools/obsidian-cdp/cdp.js";
import { errorMessage } from "../src/vendor/kit/error-message";

const VAULT = "koda-agent-tasknotes";
const staging = (): string => join(process.env.STAGING_VAULTS_DIR ?? "", VAULT);

function flag(name: string): string | null {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? null : (process.argv[at + 1] ?? "");
}

function setup(): void {
  if (!process.env.STAGING_VAULTS_DIR) throw new Error("STAGING_VAULTS_DIR fehlt");
  const quelle = join(process.env.CODING_COCKPIT_VAULT ?? join(homedir(), "Documents", "Pallas"), ".obsidian", "plugins", "tasknotes");
  if (!existsSync(join(quelle, "main.js"))) throw new Error(`TaskNotes nicht gefunden: ${quelle}`);
  const v = staging();
  rmSync(v, { recursive: true, force: true });
  const ziel = join(v, ".obsidian", "plugins", "tasknotes");
  mkdirSync(ziel, { recursive: true });
  for (const f of ["main.js", "manifest.json", "styles.css"]) cpSync(join(quelle, f), join(ziel, f));
  // Koda selbst (der Build dieses Repos), damit M9 die Anbindung an das echte Register misst.
  const koda = join(v, ".obsidian", "plugins", "koda-agent");
  mkdirSync(koda, { recursive: true });
  for (const f of ["main.js", "manifest.json", "styles.css"]) {
    if (!existsSync(f)) throw new Error(`${f} fehlt: erst npm run build`);
    cpSync(f, join(koda, f));
  }
  writeFileSync(join(v, ".obsidian", "community-plugins.json"), JSON.stringify(["tasknotes", "koda-agent"]));
  mkdirSync(join(v, "Notes"), { recursive: true });
  writeFileSync(join(v, "Notes", "Start.md"), "# Start\n");
  console.log(`Staging-Vault: ${v}`);
}

type Step = { name: string; value: unknown };

async function main(): Promise<void> {
  if (process.argv.includes("--setup")) { setup(); return; }
  const port = Number(flag("port"));
  if (!Number.isInteger(port) || port <= 0) throw new Error("--port <port> fehlt");
  const cdp = await Cdp.attach(port, VAULT);
  const out: Step[] = [];
  const step = async (name: string, expr: string): Promise<unknown> => {
    let value: unknown;
    try { value = await cdp.evaluate<unknown>(expr); } catch (e) { value = { RENDERER_FEHLER: errorMessage(e) }; }
    out.push({ name, value });
    console.log(`\n## ${name}\n${JSON.stringify(value, null, 1)}`);
    return value;
  };
  try {
    await requireVisible(cdp);
    const vor = await bereiteInstanzVor(cdp, { pluginIds: ["tasknotes", "koda-agent"], nurVault: VAULT, sprache: "en" });
    console.log(`Instanz vorbereitet: ${vor.hinweis}`);
    const TN = `const p = app.plugins.plugins.tasknotes; const api = p && p.api;`;
    // Eine Ausnahme der API als Wert: Klasse, Name, Code (TaskNotesApiError), Meldung.
    const FANG = `const fang = async (f) => { try { return { ok: true, value: await f() }; } catch (e) { return { ok: false, name: e && e.name, ctor: e && e.constructor && e.constructor.name, code: e && e.code, status: e && e.status, message: e && e.message, keys: e ? Object.keys(e) : [] }; } };`;
    const warte = `const warte = (ms) => new Promise((r) => setTimeout(r, ms));`;

    await step("M1 Form der API", `${TN}
      return { plugin: !!p, version: p && p.manifest.version, isDesktopOnly: p && p.manifest.isDesktopOnly, apiType: typeof api, apiVersion: api && api.apiVersion,
        topLevel: api ? Object.getOwnPropertyNames(Object.getPrototypeOf(api)).filter((k) => k !== 'constructor').sort() : [],
        namespaces: api ? Object.keys(api).filter((k) => typeof api[k] === 'object' && api[k] !== null).sort() : [],
        hasCapability: typeof (api && api.hasCapability) };`);
    await step("M2 Kataloge (Status, Priorität, Benutzerfelder, Standardwerte, Feld-Mapping)", `${TN}
      return { statuses: api.getStatuses(), priorities: api.getPriorities(), userFields: api.getUserFields(),
        defaults: { status: p.settings.defaultTaskStatus, priority: p.settings.defaultTaskPriority, folder: p.settings.tasksFolder, identification: p.settings.taskIdentificationMethod, tag: p.settings.taskTag, titleInFilename: p.settings.storeTitleInFilename },
        fieldMapping: p.settings.fieldMapping };`);
    await step("M3 createTask mit Standard-Mapping", `${TN} ${FANG} ${warte}
      const r = await fang(() => api.createTask({ title: 'Lab Müll rausbringen', due: '2026-11-20', priority: 'high', tags: ['lab'], details: 'Notiz zur Aufgabe' }));
      if (!r.ok) return r;
      const t = r.value; await warte(1200);
      const f = app.vault.getAbstractFileByPath(t.path);
      const fm = f ? (app.metadataCache.getFileCache(f) || {}).frontmatter : null;
      const text = f ? await app.vault.read(f) : null;
      return { returnedKeys: Object.keys(t).sort(), path: t.path, title: t.title, status: t.status, priority: t.priority, due: t.due, fileExists: !!f, frontmatter: fm, text };`);
    await step("M4 createTask mit abweichendem Feld-Mapping (due → faellig, status → zustand)", `${TN} ${FANG} ${warte}
      const alt = JSON.parse(JSON.stringify(p.settings.fieldMapping));
      p.settings.fieldMapping = { ...p.settings.fieldMapping, due: 'faellig', status: 'zustand' };
      p.fieldMapper.updateMapping(p.settings.fieldMapping);
      const r = await fang(() => api.createTask({ title: 'Lab Mapping', due: '2026-11-21' }));
      await warte(1200);
      let res = r;
      if (r.ok) { const f = app.vault.getAbstractFileByPath(r.value.path); res = { path: r.value.path, due: r.value.due, status: r.value.status, frontmatter: f ? (app.metadataCache.getFileCache(f) || {}).frontmatter : null }; }
      p.settings.fieldMapping = alt; p.fieldMapper.updateMapping(alt);
      return res;`);
    await step("M5 getTask, listTasks, updateTask", `${TN} ${FANG} ${warte}
      const alle = await api.listTasks();
      const lab = alle.filter((t) => String(t.title).startsWith('Lab'));
      const erste = lab.find((t) => t.title === 'Lab Müll rausbringen');
      const g = await api.getTask(erste.path);
      const fehlt = await api.getTask('Gibt/es/nicht.md');
      const u = await fang(() => api.updateTask(erste.path, { status: 'in-progress', priority: 'low', due: '2026-11-25' }));
      await warte(1200);
      const f = app.vault.getAbstractFileByPath(erste.path);
      return { listCount: alle.length, labTitles: lab.map((t) => t.title), getTitle: g && g.title, getMissing: fehlt, update: u.ok ? { status: u.value.status, priority: u.value.priority, due: u.value.due } : u, frontmatter: f ? (app.metadataCache.getFileCache(f) || {}).frontmatter : null };`);
    await step("M6 completeTask, queryTasks", `${TN} ${FANG} ${warte}
      const lab = (await api.listTasks()).find((t) => t.title === 'Lab Müll rausbringen');
      const c = await fang(() => api.completeTask(lab.path));
      await warte(800);
      const q = await fang(() => api.queryTasks({ where: { status: { eq: 'done' } } }));
      const q2 = await fang(() => api.queryTasks({ text: 'Lab' }));
      return { complete: c.ok ? { status: c.value.status, completedDate: c.value.completedDate } : c, queryShape: q.ok ? Object.keys(q.value) : q, queryCount: q.ok ? q.value.returned : null, query2: q2.ok ? { returned: q2.value.returned } : q2 };`);
    await step("M7 Fehlerformen", `${TN} ${FANG}
      return {
        ohneTitel: await fang(() => api.createTask({})),
        leererTitel: await fang(() => api.createTask({ title: '   ' })),
        updateFehlt: await fang(() => api.updateTask('Gibt/es/nicht.md', { priority: 'low' })),
        deleteFehlt: await fang(() => api.deleteTask('Gibt/es/nicht.md')),
        leererPfad: await fang(() => api.getTask('')),
        statusUnbekannt: await fang(async () => { const t = (await api.listTasks()).find((x) => String(x.title).startsWith('Lab')); return api.updateTask(t.path, { status: 'gibt-es-nicht' }); }),
        validateTask: api.validateTask ? api.validateTask({ title: 'x', status: 'gibt-es-nicht' }) : 'fehlt',
        validatePatch: api.validateTaskPatch ? api.validateTaskPatch({ priority: 5 }) : 'fehlt' };`);
    await step("M9 Koda: Werkzeugliste, Route und tasknotes_list über das echte Register (ohne Modell, ohne Bestätigungsdialog)", `${FANG} ${warte}
      const k = app.plugins.plugins['koda-agent'];
      if (!k) return { koda: false };
      const set = k.currentToolSet();
      const namen = set.defs.map((d) => d.name).filter((n) => n.startsWith('tasknotes_'));
      const tools = k.buildTools();
      const api = app.plugins.plugins.tasknotes.api;
      await api.createTask({ title: 'Lab Koda', due: '2026-12-01' }); await warte(1200);
      const liste = await tools.run('tasknotes_list', {});
      const unbekannterStatus = await tools.run('tasknotes_update', { path: 'TaskNotes/Tasks/Lab Koda.md', status: 'gibt-es-nicht' });
      const ohneArgument = await tools.run('tasknotes_delete', {});
      const gleich = (await api.getTask('TaskNotes/Tasks/Lab Koda.md')).status;
      await api.deleteTask('TaskNotes/Tasks/Lab Koda.md');
      return { koda: true, version: k.manifest.version, namen, route: set.routes.get('tasknotes_list'), schreibend: [...set.writes].filter((n) => n.startsWith('tasknotes_')), liste, unbekannterStatus, ohneArgument, statusDanachUnveraendert: gleich };`);
    await step("M8 deleteTask (Papierkorb-Einstellung des Vaults beachtet?)", `${TN} ${FANG} ${warte}
      const lab = (await api.listTasks()).filter((t) => String(t.title).startsWith('Lab'));
      const ergebnisse = [];
      for (const t of lab) {
        const d = await fang(() => api.deleteTask(t.path)); await warte(500);
        ergebnisse.push({ title: t.title, delete: d.ok ? 'ok' : d, dateiNochDa: !!app.vault.getAbstractFileByPath(t.path), imCache: !!(await api.getTask(t.path)) });
      }
      return { trashOption: app.vault.getConfig('trashOption'), ergebnisse, verbleibend: (await api.listTasks()).length };`);
  } finally {
    cdp.close();
  }
  console.log(`\nFertig: ${out.length} Messungen.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
