// Werkzeug-Anbieter für TaskNotes (fremdes Plugin) — Koda besitzt keine Aufgabenverwaltung (Dach-AGENTS, Zuständigkeiten: Aufgaben gehören
// TaskNotes). Dieser Adapter macht aus der In-App-Schnittstelle von TaskNotes (`app.plugins.plugins.tasknotes.api`, gemessen an 4.18.4,
// `isDesktopOnly: false`) einen Werkzeug-Anbieter nach dem Kit-Vertrag `tool-provider`; er legt NICHTS selbst an, sondern reicht durch.
// Rein: kein obsidian-Import (`check:pure`). Fehlt TaskNotes oder die Schnittstelle, ist `tools()` leer und Koda verhält sich wie ohne.
// Die Schreibregeln liegen bei TaskNotes (Feld-Mapping, Standardwerte, Ordner, Dateiname); Koda fragt vor jedem Schreibvorgang nach
// (`confirm`, Vertrag (d)) und löscht nur über `api.deleteTask` (TaskNotes beachtet die Papierkorb-Einstellung des Vaults).
import type { ProviderCallOptions, ProviderResult, ProviderToolDef, ToolLang, ToolProviderApi } from "../../vendor/kit/tool-provider";

/** Plugin-Id von TaskNotes und Id dieses Anbieters in der Werkzeugliste. */
export const TASKNOTES_ID = "tasknotes";

/** Die Teilmenge der TaskNotes-API, die der Adapter braucht. Bewusst locker getippt: es ist ein fremder Vertrag, der Adapter prüft die Form selbst. */
export interface TaskNotesApi {
  listTasks(query?: unknown): Promise<TaskInfo[]>;
  createTask(data: Record<string, unknown>): Promise<TaskInfo>;
  updateTask(path: string, patch: Record<string, unknown>): Promise<TaskInfo>;
  completeTask(path: string): Promise<TaskInfo>;
  deleteTask(path: string): Promise<void>;
  getTask?(path: string): Promise<TaskInfo | null>;
}

export interface TaskInfo {
  path: string;
  title: string;
  status?: string;
  priority?: string;
  due?: string;
  scheduled?: string;
  tags?: string[];
  projects?: string[];
  contexts?: string[];
  archived?: boolean;
  completedDate?: string;
}

/** `true`, wenn `x` die Methoden hat, die der Adapter ruft. Form prüfen, nicht Vorhandensein (LESSONS 2026-09-25). */
export function isTaskNotesApi(x: unknown): x is TaskNotesApi {
  if (x === null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return ["listTasks", "createTask", "updateTask", "completeTask", "deleteTask"].every((m) => typeof o[m] === "function");
}

const LIST_CAP = 50;

type Text = Record<ToolLang, string>;
const T = (de: string, en: string): Text => ({ de, en });
const pick = (t: Text, lang: ToolLang): string => t[lang];

const SCHEMA_FIELDS = {
  title: { type: "string", description: "Task title." },
  status: { type: "string", description: "Status value as TaskNotes defines it (e.g. the one shown in its status list). Optional." },
  priority: { type: "string", description: "Priority value as TaskNotes defines it. Optional." },
  due: { type: "string", description: "Due date as YYYY-MM-DD (optionally with time, YYYY-MM-DDTHH:mm). Optional." },
  scheduled: { type: "string", description: "Scheduled date, same format as due. Optional." },
  tags: { type: "array", items: { type: "string" }, description: "Tags without the leading #. Optional." },
  details: { type: "string", description: "Free text for the task body. Optional." },
} as const;

function defs(lang: ToolLang): ProviderToolDef[] {
  const d = (de: string, en: string): string => pick(T(de, en), lang);
  return [
    {
      name: "tasknotes_list",
      description: d(
        `Listet Aufgaben aus TaskNotes (Pfad, Titel, Status, Priorität, Fälligkeit). Höchstens ${LIST_CAP} Zeilen; die Kopfzeile nennt die Gesamtzahl. Den Inhalt einer Aufgabe liest du danach mit read_note.`,
        `Lists tasks from TaskNotes (path, title, status, priority, due). At most ${LIST_CAP} lines; the first line gives the total. Read a task's content afterwards with read_note.`,
      ),
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: d("Nur Aufgaben mit diesem Status. Optional.", "Only tasks with this status. Optional.") },
          text: { type: "string", description: d("Nur Aufgaben, deren Titel diesen Text enthält (ohne Groß/Klein). Optional.", "Only tasks whose title contains this text (case-insensitive). Optional.") },
          include_done: { type: "boolean", description: d("Auch erledigte und archivierte Aufgaben. Standard: nein.", "Include completed and archived tasks. Default: no.") },
        },
        required: [],
      },
      writes: false,
    },
    {
      name: "tasknotes_create",
      description: d(
        "Legt eine Aufgabe über TaskNotes an (Ordner, Dateiname und Feld-Mapping bestimmt TaskNotes). Der Nutzer wird vorher gefragt.",
        "Creates a task through TaskNotes (folder, file name and field mapping are TaskNotes' own). The user is asked first.",
      ),
      parameters: { type: "object", properties: { ...SCHEMA_FIELDS }, required: ["title"] },
      writes: true,
    },
    {
      name: "tasknotes_update",
      description: d(
        "Ändert Felder einer bestehenden Aufgabe (Pfad aus tasknotes_list). Nur die genannten Felder ändern sich. Der Nutzer wird vorher gefragt.",
        "Changes fields of an existing task (path from tasknotes_list). Only the named fields change. The user is asked first.",
      ),
      parameters: { type: "object", properties: { path: { type: "string", description: d("Pfad der Aufgabe.", "Path of the task.") }, ...SCHEMA_FIELDS }, required: ["path"] },
      writes: true,
    },
    {
      name: "tasknotes_complete",
      description: d(
        "Hakt eine Aufgabe ab (setzt den ersten Erledigt-Status von TaskNotes). Der Nutzer wird vorher gefragt.",
        "Marks a task as done (sets TaskNotes' first completed status). The user is asked first.",
      ),
      parameters: { type: "object", properties: { path: { type: "string", description: d("Pfad der Aufgabe.", "Path of the task.") } }, required: ["path"] },
      writes: true,
    },
    {
      name: "tasknotes_delete",
      description: d(
        "Löscht eine Aufgabe über TaskNotes (je nach Einstellung des Vaults in den Papierkorb). Der Nutzer wird immer vorher gefragt.",
        "Deletes a task through TaskNotes (to the trash, depending on the vault setting). The user is always asked first.",
      ),
      parameters: { type: "object", properties: { path: { type: "string", description: d("Pfad der Aufgabe.", "Path of the task.") } }, required: ["path"] },
      writes: true,
    },
  ];
}

const FIELDS = ["title", "status", "priority", "due", "scheduled", "details"] as const;

function str(x: unknown): string | undefined {
  return typeof x === "string" && x.trim() !== "" ? x.trim() : undefined;
}

/** Die vom Modell genannten Felder, geprüft: unbekannte Felder fallen weg (der Vertrag erlaubt dem Wirt, sie zu ignorieren), Typfehler sind `bad-args`. */
function pickFields(args: Record<string, unknown>): { ok: true; fields: Record<string, unknown> } | { ok: false; field: string } {
  const fields: Record<string, unknown> = {};
  for (const k of FIELDS) {
    if (args[k] === undefined || args[k] === null) continue;
    const v = str(args[k]);
    if (v === undefined) return { ok: false, field: k };
    fields[k] = v;
  }
  if (args.tags !== undefined && args.tags !== null) {
    if (!Array.isArray(args.tags) || args.tags.some((t) => typeof t !== "string")) return { ok: false, field: "tags" };
    const tags = (args.tags as string[]).map((t) => t.replace(/^#/, "").trim()).filter((t) => t !== "");
    if (tags.length > 0) fields.tags = tags;
  }
  return { ok: true, fields };
}

function errorText(e: unknown): { code?: string; message: string } {
  const o = (e !== null && typeof e === "object" ? e : {}) as { code?: unknown; message?: unknown };
  return { ...(typeof o.code === "string" ? { code: o.code } : {}), message: typeof o.message === "string" && o.message !== "" ? o.message : String(e) };
}

const line = (t: TaskInfo): string =>
  [t.path, t.title, t.status ?? "-", t.priority ?? "-", t.due ?? "-"].map((s) => String(s).replace(/\s+/g, " ")).join(" | ");

const isDone = (t: TaskInfo): boolean => t.completedDate !== undefined && t.completedDate !== "" || t.archived === true;

/** Der Anbieter. `getApi` liest bei JEDEM Aufruf frisch (das Plugin kann zur Laufzeit an- oder abgeschaltet werden); `isCompleted(status)`
 *  fragt, ob ein Status als erledigt gilt (TaskNotes kennt sie in `statusManager`, der Adapter nicht). */
export function createTaskNotesProvider(getApi: () => TaskNotesApi | null): ToolProviderApi {
  return {
    version: 1,
    tools(opts) {
      return getApi() === null ? [] : defs(opts?.lang ?? "en");
    },
    async executeTool(name: string, args: Record<string, unknown>, opts?: ProviderCallOptions): Promise<ProviderResult> {
      const lang: ToolLang = opts?.lang ?? "en";
      const api = getApi();
      if (api === null) return { ok: false, reason: "unavailable", detail: "tasknotes-missing", message: pick(T("TaskNotes ist nicht geladen.", "TaskNotes is not loaded."), lang) };
      const known = defs(lang).find((d) => d.name === name);
      if (known === undefined) return { ok: false, reason: "unknown-tool", message: `${name}` };
      const confirm = async (summary: string, paths: string[]): Promise<ProviderResult | null> => {
        const yes = opts?.confirm ? await opts.confirm({ summary, paths }).catch(() => false) : false;
        return yes ? null : { ok: false, reason: "needs-confirm", message: pick(T("Der Nutzer hat nicht bestätigt.", "The user did not confirm."), lang) };
      };
      const fail = (e: unknown): ProviderResult => {
        const { code, message } = errorText(e);
        return { ok: false, reason: "failed", message: code ? `${message} (${code})` : message };
      };
      try {
        switch (name) {
          case "tasknotes_list": {
            const all = await api.listTasks();
            const status = str(args.status)?.toLowerCase();
            const text = str(args.text)?.toLowerCase();
            const rows = all.filter((t) => (args.include_done === true || !isDone(t))
              && (status === undefined || (t.status ?? "").toLowerCase() === status)
              && (text === undefined || t.title.toLowerCase().includes(text)));
            const shown = rows.slice(0, LIST_CAP);
            const head = rows.length > shown.length
              ? pick(T(`${rows.length} Aufgaben, die ersten ${shown.length}:`, `${rows.length} tasks, the first ${shown.length}:`), lang)
              : pick(T(`${rows.length} Aufgaben:`, `${rows.length} tasks:`), lang);
            return { ok: true, content: [head, ...shown.map(line)].join("\n"), data: shown };
          }
          case "tasknotes_create": {
            const title = str(args.title);
            if (title === undefined) return { ok: false, reason: "bad-args", field: "title", message: pick(T("title fehlt.", "title is missing."), lang) };
            const f = pickFields(args);
            if (!f.ok) return { ok: false, reason: "bad-args", field: f.field, message: `${f.field}` };
            const no = await confirm(pick(T(`Aufgabe anlegen: ${title}`, `Create task: ${title}`), lang), []);
            if (no) return no;
            const t = await api.createTask({ ...f.fields, title });
            return { ok: true, content: pick(T(`Aufgabe angelegt: ${line(t)}`, `Task created: ${line(t)}`), lang), data: t };
          }
          case "tasknotes_update": {
            const path = str(args.path);
            if (path === undefined) return { ok: false, reason: "bad-args", field: "path", message: pick(T("path fehlt.", "path is missing."), lang) };
            const f = pickFields(args);
            if (!f.ok) return { ok: false, reason: "bad-args", field: f.field, message: `${f.field}` };
            if (Object.keys(f.fields).length === 0) return { ok: false, reason: "bad-args", field: "title", message: pick(T("Kein Feld zum Ändern genannt.", "No field to change was named."), lang) };
            const no = await confirm(pick(T(`Aufgabe ändern (${Object.keys(f.fields).join(", ")}): ${path}`, `Change task (${Object.keys(f.fields).join(", ")}): ${path}`), lang), [path]);
            if (no) return no;
            const t = await api.updateTask(path, f.fields);
            return { ok: true, content: pick(T(`Aufgabe geändert: ${line(t)}`, `Task changed: ${line(t)}`), lang), data: t };
          }
          case "tasknotes_complete": {
            const path = str(args.path);
            if (path === undefined) return { ok: false, reason: "bad-args", field: "path", message: pick(T("path fehlt.", "path is missing."), lang) };
            const no = await confirm(pick(T(`Aufgabe abhaken: ${path}`, `Mark task as done: ${path}`), lang), [path]);
            if (no) return no;
            const t = await api.completeTask(path);
            return { ok: true, content: pick(T(`Aufgabe erledigt: ${line(t)}`, `Task done: ${line(t)}`), lang), data: t };
          }
          case "tasknotes_delete": {
            const path = str(args.path);
            if (path === undefined) return { ok: false, reason: "bad-args", field: "path", message: pick(T("path fehlt.", "path is missing."), lang) };
            const no = await confirm(pick(T(`Aufgabe löschen: ${path}`, `Delete task: ${path}`), lang), [path]);
            if (no) return no;
            await api.deleteTask(path);
            return { ok: true, content: pick(T(`Aufgabe gelöscht: ${path}`, `Task deleted: ${path}`), lang) };
          }
          default:
            return { ok: false, reason: "unknown-tool", message: name };
        }
      } catch (e) {
        return fail(e);
      }
    },
  };
}
