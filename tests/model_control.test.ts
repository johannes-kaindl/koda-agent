import { describe, it, expect, vi } from "vitest";
import { Setting, makeFakeEl, ExtraButtonComponent, TextAreaComponent } from "obsidian";
import { renderPromptRow, type ModelControlCtx } from "../src/obsidian/model-control";
import { DEFAULT_SETTINGS, type KodaSettings } from "../src/core/settings-types";
import { DEFAULT_RULES } from "../src/core/prompt/rules";
import "../src/i18n/strings";

function ctx(over: Partial<KodaSettings> = {}): ModelControlCtx & { save: ReturnType<typeof vi.fn> } {
  return {
    settings: { ...DEFAULT_SETTINGS, ...over },
    save: vi.fn(async () => {}),
    refresh: vi.fn(),
    relatedAvailable: false,
    openPreview: vi.fn(),
  };
}

/** Der Mock verwirft `setPlaceholder` (obsidian-mock.ts:227) — geprueft wird deshalb hier
 *  nur, was er traegt: Komponenten, Werte, Callbacks, Klassen. Die Bedeutung des
 *  Platzhalters haengt am puren `promptRow` und ist dort geprueft. */
const textarea = (s: Setting): TextAreaComponent =>
  s.components.find((c) => c instanceof TextAreaComponent) as TextAreaComponent;
const resetKnopf = (s: Setting): ExtraButtonComponent =>
  s.components.find((c) => c instanceof ExtraButtonComponent && c.iconName === "rotate-ccw") as ExtraButtonComponent;

describe("renderPromptRow", () => {
  it("stellt das Feld leer dar, solange nichts ueberschrieben ist", () => {
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, ctx());
    expect(textarea(s).getValue()).toBe("");
  });
  it("zeigt einen vorhandenen Override als Wert", () => {
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, ctx({ systemPromptOverride: "Sei knapp." }));
    expect(textarea(s).getValue()).toBe("Sei knapp.");
  });
  it("schreibt eine Aenderung in die Einstellungen und speichert", () => {
    const c = ctx();
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, c);
    textarea(s).onChangeCB?.("Sei knapp.");
    expect(c.settings.systemPromptOverride).toBe("Sei knapp.");
    expect(c.save).toHaveBeenCalled();
  });
  it("traegt den Zuruecksetzen-Knopf mit dem erwarteten Icon und Tooltip", () => {
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, ctx());
    expect(resetKnopf(s)).toBeDefined();
    expect(resetKnopf(s).tooltip).not.toBe("");
  });
  it("setzt beim Zuruecksetzen auf LEER — nicht auf eine Kopie des Auslieferungsstands", async () => {
    // Der Kern von Spec E2: eine Kopie friere den Prompt beim ersten Oeffnen ein.
    const c = ctx({ systemPromptOverride: "Eigenes" });
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, c);
    resetKnopf(s).clickCB?.();
    expect(c.settings.systemPromptOverride).toBe("");
    expect(c.settings.systemPromptOverride).not.toBe(DEFAULT_RULES);
    // Drei statt zwei Ticks: `vi.fn(async () => {})` haengt gegenueber einer nackten
    // async-Funktion einen zusaetzlichen Microtask-Tick ein (gemessen per Debug-Zaehlschleife
    // — der Vorlagen-Brief nannte zwei und war damit knapp zu wenig).
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(c.refresh).toHaveBeenCalled();
  });
  it("warnt nicht beim Auslieferungsstand", () => {
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, ctx());
    expect(s.settingEl.querySelectorAll(".koda-warn")).toHaveLength(0);
  });
  it("zeigt eine Warnzeile mit Zustandsklasse und aria-label (UI-STANDARD §8)", () => {
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, ctx({ systemPromptOverride: "Sei knapp. {{sprache}} {{ordner}}" }));
    const warn = s.settingEl.querySelectorAll(".koda-warn");
    expect(warn).toHaveLength(1);
    expect(warn[0].hasClass("is-warning")).toBe(true);
    expect(warn[0].getAttribute("aria-label")).toBeTruthy();
    expect(warn[0].textContent).not.toBe("");
  });
  it("zeigt drei Warnzeilen, wenn drei Befunde vorliegen", () => {
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, ctx({ systemPromptOverride: "nichts", toolsDisabled: ["search_notes", "read_note", "list_notes"] }));
    expect(s.settingEl.querySelectorAll(".koda-warn").length).toBe(3);
  });
  it("reicht den Ansehen-Knopf an den Kontext durch", () => {
    const c = ctx();
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, c);
    const btn = s.components.find((x) => typeof (x as { clickCB?: unknown }).clickCB !== "undefined"
      && !(x instanceof ExtraButtonComponent)) as { clickCB?: () => void };
    btn.clickCB?.();
    expect(c.openPreview).toHaveBeenCalled();
  });
});
