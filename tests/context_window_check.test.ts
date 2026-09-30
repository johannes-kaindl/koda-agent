import KodaPlugin from "../src/main";
import { Notice, makeFakeApp } from "./vendor/kit/obsidian-mock";

/** Die Pruefung liegt in main.ts (Obsidian-Seite); der Test greift wie skill_status.test.ts
 *  direkt auf die Methode zu. `probeContext` wird ersetzt — das Netz gehoert nicht hierher. */
function makePlugin(contextWindowTokens: number, probed: number | null = null): { plugin: KodaPlugin; saved: number[] } {
  const plugin = new KodaPlugin(makeFakeApp(), {
    id: "koda", name: "Koda", version: "0.0.0", author: "Jay", minAppVersion: "1.0.0", description: "Test-Manifest",
  });
  plugin.settings = { ...plugin.settings, contextWindowTokens };
  plugin.probeContext = async () => probed;
  const saved: number[] = [];
  (plugin as any).saveSettings = async () => { saved.push(plugin.settings.contextWindowTokens); };
  return { plugin, saved };
}

const ep = { url: "http://localhost:1234", apiKey: "" } as never;

type Frag = { texts: string[]; buttons: { text: string; click: () => void }[] };
beforeEach(() => {
  Notice.instances.length = 0;
  (globalThis as any).createFragment = (cb: (f: unknown) => void): Frag => {
    const frag: Frag = { texts: [], buttons: [] };
    cb({
      createSpan: (o: { text: string }) => void frag.texts.push(o.text),
      createEl: (_tag: string, o: { text: string }) => {
        const b = { text: o.text, click: () => {} };
        frag.buttons.push(b);
        return { addEventListener: (_e: string, fn: () => void) => { b.click = fn; } };
      },
    });
    return frag;
  };
});

describe("checkContextWindow", () => {
  it("warnt, wenn der Modellname ein kleineres Fenster nennt, und ueberschreibt nichts", async () => {
    const { plugin, saved } = makePlugin(260000);
    await plugin.checkContextWindow(ep, "verdigado-pro", "gpt-oss:120b-ctx128k");
    expect(Notice.instances).toHaveLength(1);
    const frag = Notice.instances[0].message as Frag;
    expect(frag.texts[0]).toContain("131072");
    expect(frag.texts[0]).toContain("260000");
    expect(plugin.settings.contextWindowTokens).toBe(260000);
    expect(saved).toEqual([]);
  });

  it("Klick auf Uebernehmen schreibt die Einstellung und bestaetigt", async () => {
    const { plugin, saved } = makePlugin(260000);
    await plugin.checkContextWindow(ep, "m", "gpt-oss:120b-ctx128k");
    (Notice.instances[0].message as Frag).buttons[0].click();
    expect(plugin.settings.contextWindowTokens).toBe(131072);
    expect(saved).toEqual([131072]);
    expect(Notice.instances.at(-1)?.message).toContain("131072");
  });

  it("einmal je Modell und Laufzeit — die naechste Runde schweigt", async () => {
    const { plugin } = makePlugin(260000);
    await plugin.checkContextWindow(ep, "m", "gpt-oss:120b-ctx128k");
    await plugin.checkContextWindow(ep, "m", "gpt-oss:120b-ctx128k");
    expect(Notice.instances).toHaveLength(1);
    await plugin.checkContextWindow(ep, "m", "gemma4:31b-ctx128k");
    expect(Notice.instances).toHaveLength(2);
  });

  it("nutzt die Probe, wenn der Name nichts sagt", async () => {
    const { plugin } = makePlugin(260000, 65536);
    await plugin.checkContextWindow(ep, "qwen/qwen3.8-27b");
    expect((Notice.instances[0].message as Frag).texts[0]).toContain("65536");
  });

  it("schweigt, wenn die Einstellung nicht ueber dem Hinweis liegt", async () => {
    for (const setting of [128000, 131072, 8192]) {
      const { plugin } = makePlugin(setting);
      await plugin.checkContextWindow(ep, "m", "gpt-oss:120b-ctx128k");
    }
    expect(Notice.instances).toHaveLength(0);
  });

  it("schweigt ohne Hinweis, und eine scheiternde Probe reisst nichts mit", async () => {
    const { plugin } = makePlugin(260000);
    plugin.probeContext = async () => { throw new Error("boom"); };
    await expect(plugin.checkContextWindow(ep, "qwen/qwen3.8-27b")).resolves.toBeUndefined();
    expect(Notice.instances).toHaveLength(0);
  });
});
