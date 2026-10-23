import { describe, it, expect, vi } from "vitest";
import { VaultTools, type VaultPort } from "../src/obsidian/vault-tools";
import type { ProviderResult, ToolProviderApi } from "../src/vendor/kit/tool-provider";

function vault(): VaultPort {
  return {
    listMarkdownPaths: () => [],
    listFolderPaths: () => [],
    read: async () => { throw new Error("nicht erwartet: read"); },
    exists: async () => false,
    create: async () => {},
    append: async () => {},
    overwrite: async () => {},
    frontmatterOf: () => null,
    move: async () => { throw new Error("nicht erwartet: move"); },
    trash: async () => { throw new Error("nicht erwartet: trash"); },
    backlinkCount: () => 0,
  };
}

function providerApi(result: ProviderResult, spy?: (name: string, args: unknown, opts: unknown) => void): ToolProviderApi {
  return {
    version: 1,
    tools: () => [],
    executeTool: async (name, args, opts) => { spy?.(name, args, opts); return result; },
  };
}

function tools(opts: {
  provider?: (name: string) => ToolProviderApi | null;
  allowed?: () => Set<string>;
  confirmProvider?: (p: { summary: string; paths: string[] }) => Promise<boolean>;
  lang?: () => "de" | "en";
}) {
  return new VaultTools(vault(), async () => true, {
    kodaFolder: () => "Koda",
    today: () => "2026-09-25",
    listMaxRows: () => 50,
    ...opts,
  });
}

describe("VaultTools.run — Route zu einem Anbieter-Werkzeug", () => {
  it("reicht Name, Argumente und Sprache an den Anbieter durch und gibt dessen content zurueck", async () => {
    const spy = vi.fn();
    const t = tools({ provider: (n) => (n === "semantic_search" ? providerApi({ ok: true, content: "2 Treffer" }, spy) : null), lang: () => "en" });
    expect(await t.run("semantic_search", { query: "x", k: 2 })).toEqual({ ok: true, content: "2 Treffer" });
    expect(spy).toHaveBeenCalledWith("semantic_search", { query: "x", k: 2 }, expect.objectContaining({ lang: "en" }));
  });

  it("gibt die modellgerichtete message des Anbieters als Fehler zurueck", async () => {
    const t = tools({ provider: () => providerApi({ ok: false, reason: "unavailable", detail: "offline", message: "Endpunkt nicht erreichbar." }) });
    expect(await t.run("semantic_search", { query: "x" })).toEqual({ ok: false, error: "Endpunkt nicht erreichbar." });
  });

  it("reicht die Bestaetigung des Wirts als confirm durch — der Anbieter ruft sie vor dem Schreiben", async () => {
    const confirm = vi.fn(async () => true);
    let gesehen: unknown;
    const api: ToolProviderApi = {
      version: 1,
      tools: () => [],
      executeTool: async (_n, _a, opts) => {
        gesehen = opts?.confirm;
        const ok = await opts?.confirm?.({ summary: "Termin anlegen", paths: ["Kalender/x.md"] });
        return ok ? { ok: true, content: "angelegt" } : { ok: false, reason: "needs-confirm", message: "abgebrochen" };
      },
    };
    const t = tools({ provider: () => api, confirmProvider: confirm });
    expect(await t.run("create_event", { title: "x" })).toEqual({ ok: true, content: "angelegt" });
    expect(typeof gesehen).toBe("function");
    expect(confirm).toHaveBeenCalledWith({ summary: "Termin anlegen", paths: ["Kalender/x.md"] });
  });

  it("ein vom Nutzer abgeschaltetes Anbieter-Werkzeug wird als abgeschaltet abgelehnt, nicht als unbekannt", async () => {
    const spy = vi.fn();
    const t = tools({ provider: () => providerApi({ ok: true, content: "" }, spy), allowed: () => new Set(["search_notes"]) });
    const r = await t.run("semantic_search", { query: "x" });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/abgeschaltet/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("ist der Anbieter zwischen Prompt-Bau und Aufruf verschwunden, kommt Klartext statt einer Ausnahme", async () => {
    const t = tools({ provider: () => null, allowed: () => new Set(["semantic_search"]) });
    const r = await t.run("semantic_search", { query: "x" });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/nicht mehr verfuegbar|nicht mehr verfügbar/);
  });

  it("ein montiertes related_notes geht an den Anbieter, nicht in Kodas eigenen Pfad (Praxistest-Befund 2026-09-25)", async () => {
    const spy = vi.fn();
    const t = tools({ provider: (n) => (n === "related_notes" ? providerApi({ ok: true, content: "vom Anbieter" }, spy) : null) });
    expect(await t.run("related_notes", { path: "a.md" })).toEqual({ ok: true, content: "vom Anbieter" });
    expect(spy).toHaveBeenCalledWith("related_notes", { path: "a.md" }, expect.anything());
  });

  it("ohne Route gibt es related_notes nicht (Koda traegt es seit Welle 25 nicht mehr selbst)", async () => {
    const t = tools({ provider: () => null });
    const r = await t.run("related_notes", { path: "a.md" });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/nicht mehr verf/);
  });

  it("faengt eine werfende executeTool() und meldet sie als Fehler", async () => {
    const api: ToolProviderApi = { version: 1, tools: () => [], executeTool: async () => { throw new Error("kaputt"); } };
    const t = tools({ provider: () => api });
    expect(await t.run("semantic_search", { query: "x" })).toEqual({ ok: false, error: "kaputt" });
  });
});

describe("VaultTools.run — Argumente eines Anbieter-Werkzeugs werden gegen sein Schema geprueft", () => {
  const schema = {
    type: "object",
    properties: { title: { type: "string", minLength: 1 }, day: { type: "string", format: "date" }, count: { type: "integer", minimum: 1 } },
    required: ["title"],
  };
  const api = (spy: (a: unknown) => void, parameters: object = schema): ToolProviderApi => ({
    version: 1,
    tools: () => [{ name: "create_event", description: "d", parameters, writes: true }],
    executeTool: async (_n, a) => { spy(a); return { ok: true, content: "angelegt" }; },
  });

  it("ein ungueltiges Argument erreicht den Anbieter nicht und kommt als Klartext-Fehler zurueck", async () => {
    const spy = vi.fn();
    const r = await tools({ provider: () => api(spy) }).run("create_event", { title: "x", day: "2026-02-31" });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toContain("create_event"); expect(r.error).toContain("day"); }
    expect(spy).not.toHaveBeenCalled();
  });

  it("ein fehlendes Pflichtfeld und ein Typfehler werden zusammen genannt", async () => {
    const spy = vi.fn();
    const r = await tools({ provider: () => api(spy) }).run("create_event", { count: "3" });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toContain("title"); expect(r.error).toContain("count"); }
    expect(spy).not.toHaveBeenCalled();
  });

  it("gueltige Argumente gehen durch; ein vom Modell erfundenes Zusatzfeld wird nicht weitergereicht", async () => {
    const spy = vi.fn();
    const r = await tools({ provider: () => api(spy) }).run("create_event", { title: "x", erfunden: 1 });
    expect(r).toEqual({ ok: true, content: "angelegt" });
    expect(spy).toHaveBeenCalledWith({ title: "x" });
  });

  it("ein Schema ausserhalb dessen, was die Pruefung versteht, wird nicht halb geprueft, sondern durchgereicht", async () => {
    const spy = vi.fn();
    const frei = { type: "object", properties: { x: { type: "string", pattern: "^a" } }, required: ["x"] };
    const r = await tools({ provider: () => api(spy, frei) }).run("create_event", { x: "b" });
    expect(r).toEqual({ ok: true, content: "angelegt" });
    expect(spy).toHaveBeenCalledWith({ x: "b" });
  });
});
