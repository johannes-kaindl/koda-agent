import { describe, it, expect, vi } from "vitest";
import { createTaskNotesProvider, isTaskNotesApi, type TaskInfo, type TaskNotesApi } from "../src/core/tools/tasknotes";
import { isToolProviderApi, mountProviderTools } from "../src/vendor/kit/tool-provider";
import { findProvider, readOffers, readTaskNotesApi } from "../src/obsidian/providers";

const task = (over: Partial<TaskInfo> = {}): TaskInfo => ({ path: "Tasks/a.md", title: "Müll rausbringen", status: "open", priority: "normal", due: "2026-11-20", ...over });

function fakeApi(over: Partial<TaskNotesApi> = {}): TaskNotesApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    listTasks: async () => [task(), task({ path: "Tasks/b.md", title: "Steuer", status: "done", completedDate: "2026-11-01" }), task({ path: "Tasks/c.md", title: "Müllsack kaufen", status: "open", priority: "high" })],
    createTask: async (d) => { calls.push(`create:${JSON.stringify(d)}`); return task({ path: "Tasks/neu.md", title: String(d.title) }); },
    updateTask: async (p, d) => { calls.push(`update:${p}:${JSON.stringify(d)}`); return task({ path: p, ...d }); },
    completeTask: async (p) => { calls.push(`complete:${p}`); return task({ path: p, status: "done", completedDate: "2026-11-18" }); },
    deleteTask: async (p) => { calls.push(`delete:${p}`); },
    getStatuses: () => [{ value: "open", isCompleted: false }, { value: "in-progress", isCompleted: false }, { value: "done", isCompleted: true }],
    getPriorities: () => [{ value: "low" }, { value: "normal" }, { value: "high" }],
    ...over,
  };
}
const yes = async () => true;

describe("isTaskNotesApi", () => {
  it("verlangt alle fünf Methoden, nicht nur Vorhandensein eines Objekts", () => {
    expect(isTaskNotesApi(fakeApi())).toBe(true);
    for (const m of ["listTasks", "createTask", "updateTask", "completeTask", "deleteTask"]) {
      const a = { ...fakeApi() } as Record<string, unknown>;
      delete a[m];
      expect(isTaskNotesApi(a), m).toBe(false);
    }
    expect(isTaskNotesApi(null)).toBe(false);
    expect(isTaskNotesApi("x")).toBe(false);
  });
});

describe("createTaskNotesProvider — Vertrag tool-provider", () => {
  it("erfüllt den Form-Guard des Kits, mit und ohne TaskNotes", () => {
    expect(isToolProviderApi(createTaskNotesProvider(() => fakeApi()))).toBe(true);
    expect(isToolProviderApi(createTaskNotesProvider(() => null))).toBe(true);
  });
  it("bietet ohne TaskNotes nichts an (leere Liste), mit TaskNotes fünf Werkzeuge in beiden Sprachen", () => {
    expect(createTaskNotesProvider(() => null).tools({ lang: "de" })).toEqual([]);
    const p = createTaskNotesProvider(() => fakeApi());
    expect(p.tools({ lang: "de" }).map((t) => t.name)).toEqual(["tasknotes_list", "tasknotes_create", "tasknotes_update", "tasknotes_complete", "tasknotes_delete"]);
    expect(p.tools({ lang: "de" })[0].description).not.toBe(p.tools({ lang: "en" })[0].description);
  });
  it("kennzeichnet genau die Schreibwerkzeuge", () => {
    const w = createTaskNotesProvider(() => fakeApi()).tools().filter((t) => t.writes).map((t) => t.name);
    expect(w).toEqual(["tasknotes_create", "tasknotes_update", "tasknotes_complete", "tasknotes_delete"]);
  });
  it("lässt sich mit den Wirts-Werkzeugen montieren, ohne Kollision", () => {
    const tools = createTaskNotesProvider(() => fakeApi()).tools();
    const m = mountProviderTools([{ name: "read_note", description: "", parameters: {} }], [{ id: "tasknotes", tools }]);
    expect(m.skipped).toEqual([]);
    expect(m.routes.get("tasknotes_delete")).toBe("tasknotes");
    expect(m.writes.has("tasknotes_delete")).toBe(true);
  });
});

describe("tasknotes_list", () => {
  const run = (args: Record<string, unknown>, api = fakeApi()) => createTaskNotesProvider(() => api).executeTool("tasknotes_list", args, { lang: "de" });
  it("zeigt offene Aufgaben mit Pfad, Titel, Status, Priorität und Fälligkeit; Erledigtes bleibt weg", async () => {
    const r = await run({});
    expect(r).toMatchObject({ ok: true });
    const text = (r as { content: string }).content;
    expect(text.split("\n")[0]).toBe("2 Aufgaben:");
    expect(text).toContain("Tasks/a.md | Müll rausbringen | open | normal | 2026-11-20");
    expect(text).not.toContain("Steuer");
  });
  it("include_done nimmt Erledigtes mit", async () => {
    expect(((await run({ include_done: true })) as { content: string }).content).toContain("Steuer");
  });
  it("filtert nach Status und Titeltext ohne Groß/Klein", async () => {
    expect(((await run({ text: "MÜLL" })) as { content: string }).content.split("\n")[0]).toBe("2 Aufgaben:");
    expect(((await run({ text: "müllsack" })) as { content: string }).content).toContain("Tasks/c.md");
    const only = ((await run({ status: "OPEN", text: "steuer" })) as { content: string }).content;
    expect(only.split("\n")[0]).toBe("0 Aufgaben:");
  });
  it("kappt bei 50 Zeilen und sagt es in Zeile 1", async () => {
    const many = Array.from({ length: 80 }, (_, i) => task({ path: `T/${i}.md`, title: `t${i}` }));
    const r = (await run({}, fakeApi({ listTasks: async () => many }))) as { content: string };
    const lines = r.content.split("\n");
    expect(lines[0]).toBe("80 Aufgaben, die ersten 50:");
    expect(lines).toHaveLength(51);
  });
});

describe("Schreibwerkzeuge — Bestätigung je Schreibvorgang", () => {
  const prov = (api = fakeApi()) => ({ api, p: createTaskNotesProvider(() => api) });
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ["tasknotes_create", { title: "Neu" }, "create:"],
    ["tasknotes_update", { path: "Tasks/a.md", priority: "high" }, "update:"],
    ["tasknotes_complete", { path: "Tasks/a.md" }, "complete:"],
    ["tasknotes_delete", { path: "Tasks/a.md" }, "delete:"],
  ];
  it.each(cases)("%s ruft TaskNotes ohne confirm nie auf (needs-confirm)", async (name, args) => {
    const { api, p } = prov();
    expect(await p.executeTool(name, args, { lang: "de" })).toMatchObject({ ok: false, reason: "needs-confirm" });
    expect(api.calls).toEqual([]);
  });
  it.each(cases)("%s ruft TaskNotes bei abgelehntem confirm nie auf", async (name, args) => {
    const { api, p } = prov();
    expect(await p.executeTool(name, args, { lang: "de", confirm: async () => false })).toMatchObject({ reason: "needs-confirm" });
    expect(api.calls).toEqual([]);
  });
  it.each(cases)("%s ruft TaskNotes nach Bestätigung genau einmal, und confirm kommt davor", async (name, args, prefix) => {
    const { api, p } = prov();
    const confirm = vi.fn(async () => { expect(api.calls).toEqual([]); return true; });
    const r = await p.executeTool(name, args, { lang: "de", confirm });
    expect(r).toMatchObject({ ok: true });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0].startsWith(prefix)).toBe(true);
  });
  it("nennt in der Vorschau den Pfad der berührten Aufgabe (Obergrenze) und den Zweck", async () => {
    const { p } = prov();
    const seen: Array<{ summary: string; paths: string[] }> = [];
    await p.executeTool("tasknotes_delete", { path: "Tasks/a.md" }, { lang: "en", confirm: async (v) => { seen.push(v); return true; } });
    expect(seen).toEqual([{ summary: "Delete task: Tasks/a.md", paths: ["Tasks/a.md"] }]);
  });
  it("create reicht Felder durch, entfernt # an Tags und ignoriert unbekannte Felder", async () => {
    const { api, p } = prov();
    await p.executeTool("tasknotes_create", { title: " Neu ", due: "2026-12-01", tags: ["#a", " b "], erfunden: 1 }, { confirm: yes });
    expect(api.calls).toEqual([`create:${JSON.stringify({ title: "Neu", due: "2026-12-01", tags: ["a", "b"] })}`]);
  });
  it("Argumentfehler sind bad-args mit Feldname und kosten keine Rückfrage", async () => {
    const { api, p } = prov();
    const confirm = vi.fn(yes);
    expect(await p.executeTool("tasknotes_create", {}, { confirm })).toMatchObject({ ok: false, reason: "bad-args", field: "title" });
    expect(await p.executeTool("tasknotes_create", { title: "x", due: 5 }, { confirm })).toMatchObject({ reason: "bad-args", field: "due" });
    expect(await p.executeTool("tasknotes_create", { title: "x", tags: "a" }, { confirm })).toMatchObject({ reason: "bad-args", field: "tags" });
    expect(await p.executeTool("tasknotes_update", { path: "a.md" }, { confirm })).toMatchObject({ reason: "bad-args" });
    expect(await p.executeTool("tasknotes_delete", {}, { confirm })).toMatchObject({ reason: "bad-args", field: "path" });
    expect(confirm).not.toHaveBeenCalled();
    expect(api.calls).toEqual([]);
  });
  it("eine Ausnahme von TaskNotes wird zu failed mit Code und Text, nie zu einem Wurf", async () => {
    const err = Object.assign(new Error("Task not found: Tasks/x.md"), { code: "task_not_found" });
    const { p } = prov(fakeApi({ updateTask: async () => { throw err; } }));
    expect(await p.executeTool("tasknotes_update", { path: "Tasks/x.md", status: "done" }, { confirm: yes })).toEqual({ ok: false, reason: "failed", message: "Task not found: Tasks/x.md (task_not_found)" });
  });
});

describe("Status und Priorität werden gegen die Kataloge von TaskNotes geprüft (gemessen 2026-11-18: updateTask schreibt einen unbekannten Status ungeprüft)", () => {
  const p = (api = fakeApi()) => ({ api, p: createTaskNotesProvider(() => api) });
  it("lehnt einen unbekannten Status bei update ab, nennt die erlaubten Werte und fragt nicht", async () => {
    const { api, p: prov } = p();
    const confirm = vi.fn(yes);
    const r = await prov.executeTool("tasknotes_update", { path: "Tasks/a.md", status: "gibt-es-nicht" }, { lang: "en", confirm });
    expect(r).toMatchObject({ ok: false, reason: "bad-args", field: "status" });
    expect((r as { message: string }).message).toContain("open, in-progress, done");
    expect(confirm).not.toHaveBeenCalled();
    expect(api.calls).toEqual([]);
  });
  it("gilt ebenso für create und für die Priorität", async () => {
    const { api, p: prov } = p();
    expect(await prov.executeTool("tasknotes_create", { title: "x", status: "erledigt" }, { confirm: yes })).toMatchObject({ reason: "bad-args", field: "status" });
    const r = await prov.executeTool("tasknotes_create", { title: "x", priority: "dringend" }, { lang: "de", confirm: yes });
    expect(r).toMatchObject({ reason: "bad-args", field: "priority" });
    expect((r as { message: string }).message).toContain("low, normal, high");
    expect(api.calls).toEqual([]);
  });
  it("nimmt bekannte Werte an, ohne auf Groß/Klein zu bestehen, und reicht den Wert des Katalogs durch", async () => {
    const { api, p: prov } = p();
    await prov.executeTool("tasknotes_update", { path: "Tasks/a.md", status: "IN-PROGRESS", priority: "High" }, { confirm: yes });
    expect(api.calls).toEqual([`update:Tasks/a.md:${JSON.stringify({ status: "in-progress", priority: "high" })}`]);
  });
  it("nennt die erlaubten Werte in der Beschreibung des Werkzeugs", () => {
    const d = createTaskNotesProvider(() => fakeApi()).tools({ lang: "en" }).find((t) => t.name === "tasknotes_update");
    const props = (d?.parameters as { properties: Record<string, { description: string }> }).properties;
    expect(props.status.description).toContain("open, in-progress, done");
    expect(props.priority.description).toContain("low, normal, high");
  });
  it("ohne Kataloge (ältere TaskNotes) wird nicht geraten: Werte gehen durch", async () => {
    const api = fakeApi({ getStatuses: undefined, getPriorities: undefined });
    await createTaskNotesProvider(() => api).executeTool("tasknotes_update", { path: "Tasks/a.md", status: "irgendwas" }, { confirm: yes });
    expect(api.calls).toHaveLength(1);
  });
  it("die Liste zählt als erledigt, was der Katalog als erledigt führt, auch ohne completedDate", async () => {
    const api = fakeApi({ listTasks: async () => [task({ path: "T/x.md", title: "fertig", status: "done" }), task({ path: "T/y.md", title: "offen", status: "open" })] });
    const r = (await createTaskNotesProvider(() => api).executeTool("tasknotes_list", {}, { lang: "en" })) as { content: string };
    expect(r.content).toContain("offen");
    expect(r.content).not.toContain("fertig");
  });
});

describe("Anbindung an das Plugin-Register (src/obsidian/providers.ts)", () => {
  const appWith = (plugins: Record<string, unknown>) => ({ plugins: { plugins } });
  it("liest die API frisch und nur bei vollständiger Form", () => {
    const reg: Record<string, unknown> = { tasknotes: { api: fakeApi() } };
    const app = appWith(reg);
    expect(readTaskNotesApi(app)).not.toBeNull();
    reg.tasknotes = { api: { listTasks: async () => [] } };
    expect(readTaskNotesApi(app)).toBeNull();
    delete reg.tasknotes;
    expect(readTaskNotesApi(app)).toBeNull();
    expect(readTaskNotesApi(null)).toBeNull();
  });
  it("montiert TaskNotes als Angebot `tasknotes`, ohne das Plugin kein Angebot", () => {
    expect(readOffers(appWith({ tasknotes: { api: fakeApi() } }), "de").map((o) => o.id)).toEqual(["tasknotes"]);
    expect(readOffers(appWith({}), "de")).toEqual([]);
  });
  it("findProvider liefert den Adapter für die Route tasknotes, sonst null", () => {
    const app = appWith({ tasknotes: { api: fakeApi() } });
    expect(findProvider(app, "tasknotes")).not.toBeNull();
    expect(findProvider(app, "anderes")).toBeNull();
    expect(findProvider(appWith({}), "tasknotes")).toBeNull();
  });
  it("ein Plugin `tasknotes`, das den Vertrag selbst erfüllt, wird nicht doppelt montiert", () => {
    const eigen = { version: 1, tools: () => [{ name: "x", description: "", parameters: {}, writes: false }], executeTool: async () => ({ ok: true as const, content: "" }), ...fakeApi() };
    const offers = readOffers(appWith({ tasknotes: { api: eigen } }), "en");
    expect(offers).toHaveLength(1);
    expect(offers[0].tools.map((t) => t.name)).toEqual(["x"]);
  });
});
