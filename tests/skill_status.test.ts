import KodaPlugin from "../src/main";
import { TFile, makeFakeApp } from "./vendor/kit/obsidian-mock";

/** readSkills/skillStatusText sind Obsidian-seitig (main.ts) und daher nicht Teil von
 *  src/core/ — der Test greift ueber `as any` auf die privaten Methoden, wie es die
 *  Alternative (den ganzen Agent-Lauf durch `ask()` zu treiben) unnoetig aufwaendig
 *  machen wuerde. */
function makePlugin(files: Record<string, string | Error>): KodaPlugin {
  const app = makeFakeApp();
  app.vault.getMarkdownFiles = () => Object.keys(files).map((p) => new TFile(p));
  app.vault.cachedRead = async (f: TFile) => {
    const v = files[f.path];
    if (v instanceof Error) throw v;
    return v;
  };
  const plugin = new KodaPlugin(app, { id: "koda", name: "Koda", version: "0.0.0" });
  plugin.settings = { ...plugin.settings, kodaFolder: "Koda" };
  return plugin;
}

describe("readSkills / skillStatusText — Lesefehler vs. fehlende description", () => {
  it("trennt einen Lesefehler von einem fehlenden description-Feld", async () => {
    const plugin = makePlugin({
      "Koda/Skills/Kaputt.md": new Error("boom"),
      "Koda/Skills/OhneBeschreibung.md": "kein Frontmatter hier",
    });
    const { selection, failed } = await (plugin as any).readSkills();
    expect(selection.loaded).toEqual([]);
    expect(failed).toEqual(
      expect.arrayContaining([
        { name: "Kaputt", reason: "read-error" },
        { name: "OhneBeschreibung", reason: "no-description" },
      ]),
    );

    const text = (plugin as any).skillStatusText(selection, failed) as string;
    expect(text).toContain("Could not be read: Kaputt");
    expect(text).toContain("no description in frontmatter: OhneBeschreibung");
  });

  it("nutzt weiterhin SKILLS_SUBFOLDER als Quelle des Ordnernamens", async () => {
    const plugin = makePlugin({ "Koda/Skills/A.md": "---\ndescription: x\n---\nbody" });
    const { selection, failed } = await (plugin as any).readSkills();
    expect(failed).toEqual([]);
    expect(selection.loaded.map((s: { name: string }) => s.name)).toEqual(["A"]);
  });
});
