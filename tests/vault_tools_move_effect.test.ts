import { VaultTools, type VaultPort, type WriteRequest } from "../src/obsidian/vault-tools";
import { setLang } from "../src/vendor/kit/i18n";
import "../src/i18n/strings";

// Der Move-Dialog nennt für die Memory-Datei die Folge: `<Koda>/Memory.md` ist die eine Datei, die der Prompt unter genau diesem Namen
// liest, verschoben oder umbenannt verschwindet das Gedächtnis daraus. Das Modal zeigt den Satz zusätzlich zu den Pfaden (`MoveRequest.effect`).

function fakeVault(files: Record<string, string>): VaultPort {
  return {
    listMarkdownPaths: () => Object.keys(files),
    listFolderPaths: () => [],
    read: async (p) => { if (!(p in files)) throw new Error("not found"); return files[p]; },
    exists: async (p) => p in files,
    create: async (p, c) => void (files[p] = c),
    append: async (p, c) => void (files[p] = (files[p] ?? "") + c),
    overwrite: async (p, c) => void (files[p] = c),
    frontmatterOf: () => null,
    move: async (from, to) => { files[to] = files[from]; delete files[from]; },
    trash: async (p) => void delete files[p],
    backlinkCount: () => 0,
  } as VaultPort;
}

const opts = { kodaFolder: () => "Koda", today: () => "2026-10-26", listMaxRows: () => 150 };

/** Führt `move_note` aus und liefert die Anfragen, die an den `confirm`-Port gingen. */
async function moveUndFragen(quelle: string, ziel: string): Promise<WriteRequest[]> {
  const calls: WriteRequest[] = [];
  const tools = new VaultTools(fakeVault({ [quelle]: "Inhalt" }), async (r) => { calls.push(r); return true; }, opts);
  const r = await tools.run("move_note", { source_path: quelle, destination_path: ziel });
  expect(r.ok).toBe(true);
  return calls;
}

function effectVon(calls: WriteRequest[]): string | undefined {
  expect(calls).toHaveLength(1);
  const c = calls[0]!;
  expect(c.kind).toBe("move");
  return c.kind === "move" ? c.effect : undefined;
}

describe("move_note — die Folge für Memory.md steht im Dialog", () => {
  beforeEach(() => setLang("en"));

  it("Koda/Memory.md: die Anfrage trägt einen Satz zur Folge, in der Sprache der Oberfläche", async () => {
    expect(effectVon(await moveUndFragen("Koda/Memory.md", "Koda/Archiv/Memory.md"))).toBe("The memory will no longer be read into the prompt.");
    setLang("de");
    expect(effectVon(await moveUndFragen("Koda/Memory.md", "Koda/Archiv/Memory.md"))).toBe("Das Gedächtnis wird danach nicht mehr in den Prompt gelesen.");
  });

  it("auch beim Umbenennen und beim Herausziehen aus dem Koda-Ordner", async () => {
    expect(effectVon(await moveUndFragen("Koda/Memory.md", "Koda/weg.md"))).toBeTruthy();
    expect(effectVon(await moveUndFragen("Koda/Memory.md", "Projekte/Memory.md"))).toBeTruthy();
  });

  it.each(["Koda/memory.md", "Koda/MEMORY.MD"])("%s (Dateisystem-Lesart: dieselbe Datei) trägt den Satz ebenfalls", async (quelle) => {
    expect(effectVon(await moveUndFragen(quelle, "Koda/Archiv/x.md"))).toBeTruthy();
  });

  it("eine andere Datei im Koda-Ordner trägt keinen Satz", async () => {
    expect(effectVon(await moveUndFragen("Koda/a.md", "Projekte/a.md"))).toBeUndefined();
  });

  it("Koda/Unter/Memory.md ist eine andere Datei (der Prompt liest nur die im Koda-Ordner): kein Satz", async () => {
    expect(effectVon(await moveUndFragen("Koda/Unter/Memory.md", "Projekte/x.md"))).toBeUndefined();
  });

  it("eine Memory.md außerhalb des Koda-Ordners trägt keinen Satz", async () => {
    expect(effectVon(await moveUndFragen("Projekte/Memory.md", "Archiv/Memory.md"))).toBeUndefined();
  });

  it("ein Move NACH Koda/Memory.md (die Datei gibt es noch nicht) trägt keinen Satz: aus einer Datei wird ein Gedächtnis, keines geht verloren", async () => {
    expect(effectVon(await moveUndFragen("Projekte/m.md", "Koda/Memory.md"))).toBeUndefined();
  });

  it("innerhalb des Koda-Ordners nach Koda/Memory.md bleibt frei: keine Frage", async () => {
    expect(await moveUndFragen("Koda/x.md", "Koda/Memory.md")).toHaveLength(0);
  });
});
