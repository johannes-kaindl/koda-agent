import { VaultTools, type VaultPort, type WriteRequest, type WriteFileRequest } from "../src/obsidian/vault-tools";
import type { EditorPort, WorkspacePort } from "../src/core/context/ports";

/** `WriteRequest` ist eine Union aus write/move/delete; diese Datei bestaetigt ausschliesslich
 *  Schreibvorgaenge (`edit_active_note`). Ein Waechter statt eines Casts. */
function erwarteWrite(req: WriteRequest): WriteFileRequest {
  if (req.kind !== "write") throw new Error(`erwartete eine Schreibanfrage, bekam "${req.kind}"`);
  return req;
}

function fakeVault(files: Record<string, string>): VaultPort {
  return {
    listMarkdownPaths: () => Object.keys(files),
    read: async (p) => files[p],
    exists: async (p) => p in files,
    create: async (p, c) => void (files[p] = c),
    append: async (p, c) => void (files[p] = (files[p] ?? "") + c),
    overwrite: async (p, c) => void (files[p] = c),
    frontmatterOf: () => null,
    // Von diesen Tests nicht gerufen — ehrlich werfende Stubs statt stillem `undefined`.
    move: async () => { throw new Error("nicht erwartet: move"); },
    trash: async () => { throw new Error("nicht erwartet: trash"); },
    backlinkCount: () => { throw new Error("nicht erwartet: backlinkCount"); },
  };
}

function fakeEditor(state: { path: string | null; selection: string; doc: string }): EditorPort {
  return {
    path: () => state.path,
    selection: () => state.selection,
    replaceSelection: (text) => { state.doc = state.doc.replace(state.selection, text); state.selection = text; },
    insertAtCursor: (text) => { state.doc += text; },
  };
}

const workspace: WorkspacePort = {
  snapshot: () => ({
    active: { path: "Notes/Plan.md", frontmatter: { status: "active" }, selection: "Model control", cursorLine: 9, lineCount: 11 },
    tabs: [{ path: "Notes/Plan.md", viewType: "markdown" }],
  }),
  linesAround: (radius) => ({ from: Math.max(1, 9 - radius), lines: radius === 0 ? ["c"] : ["a", "b", "c"] }),
};

const base = { kodaFolder: () => "Koda", today: () => "2026-09-02", listMaxRows: () => 150, lang: () => "de" as const };
const yes = async (): Promise<boolean> => true;

describe("get_workspace", () => {
  it("liefert den Bericht aus derselben Quelle wie der Block, mit Cursor-Umgebung", async () => {
    const tools = new VaultTools(fakeVault({}), yes, { ...base, workspace });
    const r = await tools.run("get_workspace", { around_cursor: 2 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content).toContain("Aktive Notiz: Notes/Plan.md · Zeile 9 von 11");
      expect(r.content).toContain("Markierung (13 Zeichen):\nModel control");
      expect(r.content).toContain("Cursor-Umgebung (Zeilen 7–9):");
    }
  });
  it("frontmatterMax 0 ist eine Abwahl — der Bericht nennt die Kopfdaten dann nicht", async () => {
    const tools = new VaultTools(fakeVault({}), yes, { ...base, workspace, contextFrontmatterChars: () => 0 });
    const r = await tools.run("get_workspace", {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content).not.toContain("Kopfdaten");
      expect(r.content).toContain("Aktive Notiz: Notes/Plan.md");
    }
  });
  it("ein Wert ueber 0 kappt nur den Block — der Bericht liefert die Kopfdaten vollstaendig", async () => {
    const wide: WorkspacePort = {
      snapshot: () => ({ active: { path: "N.md", frontmatter: { a: "x".repeat(500) }, selection: "", cursorLine: null, lineCount: null }, tabs: [] }),
      linesAround: () => null,
    };
    const tools = new VaultTools(fakeVault({}), yes, { ...base, workspace: wide, contextFrontmatterChars: () => 50 });
    const r = await tools.run("get_workspace", {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toContain(`a: ${"x".repeat(500)}`);
  });
  it("ohne Port meldet es Klartext statt zu werfen", async () => {
    const tools = new VaultTools(fakeVault({}), yes, base);
    expect(await tools.run("get_workspace", {})).toEqual({ ok: false, error: "Arbeitsplatz nicht verfügbar: kein Zugriff auf den Workspace." });
  });
  it("around_cursor: 0 deckt genau die Cursor-Zeile ab (0 ist ein gueltiger Wert, kein Fehlen)", async () => {
    const tools = new VaultTools(fakeVault({}), yes, { ...base, workspace });
    const r = await tools.run("get_workspace", { around_cursor: 0 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toContain("Cursor-Umgebung (Zeilen 9–9):\n   9 | c");
  });
  it("around_cursor jenseits von 200 wird auf 200 gekappt", async () => {
    const seen: number[] = [];
    const spy: WorkspacePort = {
      snapshot: workspace.snapshot,
      linesAround: (radius) => { seen.push(radius); return workspace.linesAround(radius); },
    };
    const tools = new VaultTools(fakeVault({}), yes, { ...base, workspace: spy });
    await tools.run("get_workspace", { around_cursor: 500 });
    expect(seen).toEqual([200]);
  });
});

describe("edit_active_note", () => {
  it("replace_selection: fragt ausserhalb des Koda-Ordners, zeigt Markierung gegen Ersatz, schreibt exakt das Bestaetigte", async () => {
    const state = { path: "Notes/Plan.md", selection: "Model control", doc: "Model control makes" };
    const calls: WriteRequest[] = [];
    const tools = new VaultTools(fakeVault({}), async (req) => { calls.push(req); return true; }, { ...base, editor: fakeEditor(state) });
    const r = await tools.run("edit_active_note", { path: "Notes/Plan.md", mode: "replace_selection", text: "Model steering" });
    expect(r.ok).toBe(true);
    expect(calls).toEqual([{ kind: "write", path: "Notes/Plan.md", mode: "replace", oldText: "Model control", newText: "Model steering" }]);
    expect(state.doc).toBe("Model steering makes");
  });
  it("insert_at_cursor ausserhalb des Koda-Ordners: die Bestaetigung nennt den Cursor-Effekt zusaetzlich zur Vorschau", async () => {
    const state = { path: "Notes/Plan.md", selection: "Model control", doc: "Model control makes" };
    const calls: WriteRequest[] = [];
    const tools = new VaultTools(fakeVault({}), async (req) => { calls.push(req); return true; }, { ...base, editor: fakeEditor(state) });
    const r = await tools.run("edit_active_note", { path: "Notes/Plan.md", mode: "insert_at_cursor", text: " Welt" });
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(erwarteWrite(calls[0]).effect).toContain("Cursor");
  });
  it("ein ungueltiger mode-Wert ist ein Fehler-Result ans Modell (Punkt 5: kein enum mehr im Schema)", async () => {
    const state = { path: "Notes/Plan.md", selection: "Model control", doc: "Model control makes" };
    const tools = new VaultTools(fakeVault({}), yes, { ...base, editor: fakeEditor(state) });
    const r = await tools.run("edit_active_note", { path: "Notes/Plan.md", mode: "delete_selection", text: "X" });
    expect(r).toEqual({ ok: false, error: "unbekannter Modus: delete_selection — erlaubt sind replace_selection und insert_at_cursor" });
    expect(state.doc).toBe("Model control makes");
  });
  it("Invariante: aendert sich die Markierung zwischen Aufruf und Bestaetigung, wird NICHT geschrieben", async () => {
    const state = { path: "Notes/Plan.md", selection: "Model control", doc: "Model control makes" };
    const confirm = async (): Promise<boolean> => { state.selection = "Model"; return true; };
    const tools = new VaultTools(fakeVault({}), confirm, { ...base, editor: fakeEditor(state) });
    const r = await tools.run("edit_active_note", { path: "Notes/Plan.md", mode: "replace_selection", text: "X" });
    expect(r).toEqual({ ok: false, error: "Die Markierung hat sich seit dem Aufruf geändert — nichts geschrieben. Erneut aufrufen." });
    expect(state.doc).toBe("Model control makes");
  });
  it("Invariante: wechselt die aktive Notiz zwischen Aufruf und Bestaetigung, wird NICHT geschrieben", async () => {
    const state = { path: "Notes/Plan.md", selection: "Model control", doc: "Model control makes" };
    const confirm = async (): Promise<boolean> => { state.path = "Notes/Other.md"; return true; };
    const tools = new VaultTools(fakeVault({}), confirm, { ...base, editor: fakeEditor(state) });
    const r = await tools.run("edit_active_note", { path: "Notes/Plan.md", mode: "replace_selection", text: "X" });
    expect(r).toEqual({ ok: false, error: "Aktiv ist inzwischen Notes/Other.md, nicht Notes/Plan.md — nichts geschrieben." });
    expect(state.doc).toBe("Model control makes");
  });
  it("falscher Pfad: eine andere Notiz ist aktiv", async () => {
    const state = { path: "Notes/Other.md", selection: "x", doc: "x" };
    const tools = new VaultTools(fakeVault({}), yes, { ...base, editor: fakeEditor(state) });
    const r = await tools.run("edit_active_note", { path: "Notes/Plan.md", mode: "insert_at_cursor", text: "!" });
    expect(r).toEqual({ ok: false, error: "Aktiv ist inzwischen Notes/Other.md, nicht Notes/Plan.md — nichts geschrieben." });
  });
  it("Pfadvergleich ohne Gross-/Kleinschreibung: 'notes/plan.md' trifft die aktive 'Notes/Plan.md'", async () => {
    const state = { path: "Notes/Plan.md", selection: "Model control", doc: "Model control makes" };
    const tools = new VaultTools(fakeVault({}), yes, { ...base, editor: fakeEditor(state) });
    const r = await tools.run("edit_active_note", { path: "notes/plan.md", mode: "replace_selection", text: "Model steering" });
    expect(r.ok).toBe(true);
    expect(state.doc).toBe("Model steering makes");
  });
  it("replace_selection ohne Markierung ist ein Fehler; insert_at_cursor im Koda-Ordner schreibt ohne Rueckfrage", async () => {
    const state = { path: "Koda/Entwurf.md", selection: "", doc: "Hallo" };
    let asked = 0;
    const tools = new VaultTools(fakeVault({}), async () => { asked++; return true; }, { ...base, editor: fakeEditor(state) });
    expect(await tools.run("edit_active_note", { path: "Koda/Entwurf.md", mode: "replace_selection", text: "x" })).toEqual({ ok: false, error: "Keine Markierung im Editor — für replace_selection muss Text markiert sein." });
    const r = await tools.run("edit_active_note", { path: "Koda/Entwurf.md", mode: "insert_at_cursor", text: " Welt" });
    expect(r.ok).toBe(true);
    expect(asked).toBe(0);
    expect(state.doc).toBe("Hallo Welt");
  });
  it("Ablehnung im Modal ist ein Fehler-Result, nichts geschrieben", async () => {
    const state = { path: "Notes/Plan.md", selection: "a", doc: "a" };
    const tools = new VaultTools(fakeVault({}), async () => false, { ...base, editor: fakeEditor(state) });
    expect(await tools.run("edit_active_note", { path: "Notes/Plan.md", mode: "replace_selection", text: "b" })).toEqual({ ok: false, error: "vom Nutzer abgelehnt" });
    expect(state.doc).toBe("a");
  });
});
