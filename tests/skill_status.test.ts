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
  const plugin = new KodaPlugin(app, {
    id: "koda", name: "Koda", version: "0.0.0",
    author: "Jay", minAppVersion: "1.0.0", description: "Test-Manifest",
  });
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
    const plugin = makePlugin({ "Koda/Skills/A.md": "---\ndescription: x\npinned: true\n---\nbody" });
    const { selection, failed } = await (plugin as any).readSkills();
    expect(failed).toEqual([]);
    expect(selection.loaded.map((s: { name: string }) => s.name)).toEqual(["A"]);
  });

  it("meldet ungepinnte Skills als auf Abruf und Gepinnte ueber Budget mit dem Ueberhang", async () => {
    const plugin = makePlugin({
      "Koda/Skills/A.md": "---\ndescription: x\npinned: true\n---\n" + "a".repeat(50),
      "Koda/Skills/B.md": "---\ndescription: y\n---\nbody",
    });
    plugin.settings = { ...plugin.settings, skillBudgetChars: 20 };
    const { selection, failed } = await (plugin as any).readSkills();
    expect(selection.loaded.map((s: { name: string }) => s.name)).toEqual(["A"]);
    expect(selection.descriptionOnly.map((s: { name: string }) => s.name)).toEqual(["B"]);
    const text = (plugin as any).skillStatusText(selection, failed) as string;
    expect(text).toContain("1 skill(s) on demand");
    expect(text).toContain("over budget: 30 characters");
  });
});
