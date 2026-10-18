import { VaultTools, type VaultPort } from "../src/obsidian/vault-tools";
import type { SkillMode } from "../src/core/abilities/types";

const skill = (desc: string, extra = ""): string => `---\ndescription: ${desc}\n${extra}---\nText von ${desc}`;

function fakeVault(files: Record<string, string>): VaultPort {
  return {
    listMarkdownPaths: () => Object.keys(files),
    listFolderPaths: () => [],
    read: async (p) => { if (!(p in files)) throw new Error("not found"); return files[p]; },
    exists: async (p) => p in files,
    create: async () => {}, append: async () => {}, overwrite: async () => {},
    frontmatterOf: () => null, move: async () => {}, trash: async () => {}, backlinkCount: () => 0,
  } as VaultPort;
}

const base = { kodaFolder: () => "Koda", today: () => "2026-10-18", listMaxRows: () => 150 };
const yes = async (): Promise<boolean> => true;
const files = { "Koda/Skills/triage.md": skill("Inbox sortieren"), "Koda/Skills/rueckblick.md": skill("Woche zurueck") };
const run = (skillMode: ((n: string) => SkillMode | null) | undefined, name: string) =>
  new VaultTools(fakeVault({ ...files }), yes, { ...base, ...(skillMode ? { skillMode } : {}) }).run("load_skill", { name });

describe("load_skill und der effektive Skill-Zustand", () => {
  it("ohne skillMode liefert er den Body wie bisher", async () => {
    const r = await run(undefined, "triage");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content).toContain("Text von Inbox sortieren");
  });

  it("ein im Gespraech abgeschalteter Skill wird abgelehnt", async () => {
    const r = await run(() => "aus", "triage");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("abgeschaltet");
  });

  it("Verfuegbar nennt nur Skills, die effektiv nicht aus sind", async () => {
    const r = await run((n) => (n === "triage" ? "aus" : "beschreibung"), "triage");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Verfuegbar: rueckblick");
      expect(r.error).not.toContain("Verfuegbar: rueckblick, triage");
    }
  });

  it("Gross/klein im Namen aendert nichts an der Ablehnung", async () => {
    const r = await run((n) => (n.toLowerCase() === "triage" ? "aus" : "beschreibung"), "TRIAGE");
    expect(r.ok).toBe(false);
  });

  it("ein im Tab eingeschalteter Skill mit enabled: false ist erreichbar", async () => {
    const v = fakeVault({ "Koda/Skills/alt.md": skill("Alt", "enabled: false\n") });
    const r = await new VaultTools(v, yes, { ...base, skillMode: () => "beschreibung" }).run("load_skill", { name: "alt" });
    expect(r.ok).toBe(true);
  });
});
