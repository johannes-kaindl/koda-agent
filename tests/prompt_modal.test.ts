import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "obsidian";
import { setLang } from "../src/vendor/kit/i18n";
import "../src/i18n/strings";
import { PromptPreviewModal } from "../src/obsidian/prompt-modal";

describe("PromptPreviewModal", () => {
  beforeEach(() => setLang("de"));

  it("zeigt den Prompt, den das Plugin liefert — keinen Nachbau", async () => {
    const plugin = { previewSystemPrompt: vi.fn(async () => "Regeln\n\n## Memory\n- x\n\n## Skills\n### s") };
    const m = new PromptPreviewModal(new App(), plugin);
    m.onOpen();
    // Drei statt zwei Ticks: `vi.fn(async () => ...)` haengt gegenueber einer nackten
    // async-Funktion einen zusaetzlichen Microtask-Tick ein (siehe model_control.test.ts).
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(plugin.previewSystemPrompt).toHaveBeenCalledTimes(1);
    // Der Mock kennt nur `querySelectorAll` (Tag- und Klassen-Selektoren).
    const pre = m.contentEl.querySelectorAll(".koda-prompt-preview")[0];
    expect(pre.textContent).toContain("## Memory");
    expect(pre.textContent).toContain("## Skills");
  });
  it("beschriftet, dass es um das NAECHSTE Gespraech geht", async () => {
    const m = new PromptPreviewModal(new App(), { previewSystemPrompt: async () => "x" });
    m.onOpen();
    await Promise.resolve();
    expect(m.contentEl.textContent).toContain("nächste");
  });
  it("raeumt beim Schliessen auf", async () => {
    const m = new PromptPreviewModal(new App(), { previewSystemPrompt: async () => "x" });
    m.onOpen();
    await Promise.resolve();
    m.onClose();
    // Der Mock kennt kein `childElementCount` — `children` ist das echte Array dahinter.
    expect(m.contentEl.children.length).toBe(0);
  });
});
