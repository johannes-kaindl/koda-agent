import { describe, it, expect, vi } from "vitest";
import { Setting, makeFakeEl, ExtraButtonComponent, TextAreaComponent } from "obsidian";
import { renderPromptRow, renderToolList, type ModelControlCtx } from "../src/obsidian/model-control";
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
  it("nimmt eine Aenderung erst beim blur an, nicht bei jedem Tastendruck", () => {
    // Dieselbe Grammatik wie die Werkzeug-Zeilen: zwei Bedienformen fuer dasselbe Element
    // in derselben Gruppe waeren ein Bedien-Bruch (Review-Befund Minor 6).
    const c = ctx();
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, c);
    textarea(s).setValue("Sei knapp.");
    expect(c.settings.systemPromptOverride).toBe("");
    expect(c.save).not.toHaveBeenCalled();
    textarea(s).inputEl.dispatchEvent({ type: "blur" });
    expect(c.settings.systemPromptOverride).toBe("Sei knapp.");
    expect(c.save).toHaveBeenCalled();
  });
  it("aktualisiert die Warnzeile beim blur, statt sie bis zum naechsten Oeffnen zu verstecken", () => {
    // Der Kern des Befunds: die Warnung ist die einzige Absicherung dieses Entwurfs
    // („warnen statt verbieten") — sie muss sichtbar werden, wenn die Abweichung entsteht.
    const c = ctx();
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, c);
    expect(s.settingEl.querySelectorAll(".koda-warn")).toHaveLength(0);
    textarea(s).setValue("Sei knapp."); // weder Werkzeuge noch Platzhalter
    textarea(s).inputEl.dispatchEvent({ type: "blur" });
    expect(s.settingEl.querySelectorAll(".koda-warn")).toHaveLength(2);
  });
  it("nimmt eine ueberfluessige Warnzeile beim blur wieder weg, statt sie zu stapeln", () => {
    const c = ctx({ systemPromptOverride: "Sei knapp." });
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, c);
    expect(s.settingEl.querySelectorAll(".koda-warn")).toHaveLength(2);
    textarea(s).setValue(DEFAULT_RULES);
    textarea(s).inputEl.dispatchEvent({ type: "blur" });
    expect(s.settingEl.querySelectorAll(".koda-warn")).toHaveLength(0);
  });
  it("zeichnet beim blur NUR die Warnzeilen, nicht den ganzen Tab", () => {
    // Ein voller `refresh()` liefe zwischen mousedown (das den blur ausloest) und click —
    // der Zuruecksetzen-Knopf waere im Moment seines eigenen Klicks schon ersetzt.
    const c = ctx();
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, c);
    textarea(s).setValue("Sei knapp.");
    textarea(s).inputEl.dispatchEvent({ type: "blur" });
    expect(c.refresh).not.toHaveBeenCalled();
  });
  it("laesst einen unveraenderten Text beim blur unangetastet", () => {
    const c = ctx({ systemPromptOverride: "Eigenes" });
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, c);
    textarea(s).inputEl.dispatchEvent({ type: "blur" });
    expect(c.save).not.toHaveBeenCalled();
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

/** Eine Werkzeug-Zeile im Fake-DOM. Der Zugriff laeuft ueber die Klasse und das
 *  data-Attribut, weil der Mock nur Tag- und Klassen-Selektoren kennt
 *  (obsidian-mock.ts:48). */
const zeilen = (s: Setting): any[] => s.settingEl.querySelectorAll(".koda-tool-row");
const zeile = (s: Setting, name: string): any =>
  zeilen(s).find((r) => r.getAttribute("data-tool") === name);

describe("renderToolList", () => {
  it("fuehrt jedes Werkzeug mit einer eigenen Zeile", () => {
    const s = new Setting(makeFakeEl());
    renderToolList(s, ctx());
    expect(zeilen(s)).toHaveLength(7); // sechs feste plus related_notes
  });
  it("zeigt related_notes ausgegraut statt es zu verschweigen, wenn vault-rag fehlt", () => {
    const s = new Setting(makeFakeEl());
    renderToolList(s, ctx());
    const r = zeile(s, "related_notes");
    expect(r.hasClass("is-unavailable")).toBe(true);
    expect(r.textContent).toContain("vault-rag");
  });
  it("graut nichts aus, wenn ein Index da ist", () => {
    const c = { ...ctx(), relatedAvailable: true };
    const s = new Setting(makeFakeEl());
    renderToolList(s, c);
    expect(zeile(s, "related_notes").hasClass("is-unavailable")).toBe(false);
  });
  it("schaltet ein Werkzeug ab und schreibt das in die Einstellungen", () => {
    const c = ctx();
    const s = new Setting(makeFakeEl());
    const handles = renderToolList(s, c);
    // Ueber den Namen adressiert, nicht ueber einen Index — ein neues Werkzeug
    // verschoebe sonst still jeden nachfolgenden Index (Fix-Runde 1).
    const h = handles.find((x) => x.name === "write_note")!;
    h.toggle.onChangeCB?.(false);
    expect(c.settings.toolsDisabled).toContain("write_note");
    expect(c.save).toHaveBeenCalled();
  });
  it("schaltet wieder ein, ohne einen Rest in der Liste zu lassen", () => {
    const c = ctx({ toolsDisabled: ["write_note"] });
    const s = new Setting(makeFakeEl());
    const handles = renderToolList(s, c);
    const h = handles.find((x) => x.name === "write_note")!;
    h.toggle.onChangeCB?.(true);
    expect(c.settings.toolsDisabled).toEqual([]);
  });
  it("nimmt eine eigene Beschreibung erst beim blur an, nicht bei jedem Tastendruck", () => {
    const c = ctx();
    const s = new Setting(makeFakeEl());
    const handles = renderToolList(s, c);
    const h = handles.find((x) => x.name === "read_note")!;
    h.textarea.setValue("Liest.");
    expect(c.settings.toolDescriptions.read_note).toBeUndefined();
    h.textarea.inputEl.dispatchEvent({ type: "blur" });
    expect(c.settings.toolDescriptions.read_note).toBe("Liest.");
  });
  it("loescht den Eintrag wieder, wenn das Feld geleert wird — leer heisst ausgeliefert", () => {
    const c = ctx({ toolDescriptions: { read_note: "Liest." } });
    const s = new Setting(makeFakeEl());
    const handles = renderToolList(s, c);
    const h = handles.find((x) => x.name === "read_note")!;
    h.textarea.setValue("   ");
    h.textarea.inputEl.dispatchEvent({ type: "blur" });
    expect(c.settings.toolDescriptions.read_note).toBeUndefined();
  });
});
