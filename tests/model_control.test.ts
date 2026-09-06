import { describe, it, expect, vi } from "vitest";
// `Setting` bleibt vom REALEN "obsidian" importiert: `renderPromptRow`/`renderToolList` in
// src/obsidian/model-control.ts sind gegen den echten Typ signiert (src/ typprueft immer
// gegen die echte Obsidian-API, nie gegen den Mock). Zur Laufzeit ist es via vitest-Alias
// trotzdem dieselbe Mock-Klasse — nur die anderen Komponenten braucht es typisiert ueber
// den Mock direkt, weil der Mock zusaetzliche, testrelevante Felder traegt
// (`onChangeCB`, `iconName`, `tooltip`, `clickCB`), die die echten Typen nicht kennen.
import { Setting } from "obsidian";
import {
  makeFakeEl, ExtraButtonComponent, TextAreaComponent,
  ToggleComponent as MockToggleComponent,
} from "./vendor/kit/obsidian-mock";
import { renderPromptRow, renderToolList, type ModelControlCtx } from "../src/obsidian/model-control";
import { DEFAULT_SETTINGS, type KodaSettings } from "../src/core/settings-types";
import { DEFAULT_RULES } from "../src/core/prompt/rules";
import "../src/i18n/strings";

function ctx(over: Partial<KodaSettings> = {}): ModelControlCtx & { save: ReturnType<typeof vi.fn<[], Promise<void>>> } {
  return {
    // Tief geklont, nicht flach gespreadet: `toolDescriptions` waere sonst DASSELBE Objekt
    // wie `DEFAULT_SETTINGS.toolDescriptions`, und der blur-Test mutierte damit die
    // Modul-Vorlage fuer den Rest der Datei — gruen nur wegen der Reihenfolge. Die
    // Produktion ist davon unbetroffen, der Kit klont beim Validieren.
    settings: { ...structuredClone(DEFAULT_SETTINGS), ...structuredClone(over) },
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
  s.components.find((c) => c instanceof ExtraButtonComponent && c.iconName === "rotate-ccw") as unknown as ExtraButtonComponent;

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
  it("speichert schon beim Tippen — ein Escape darf getippten Text nicht verschlucken", () => {
    // Schliesst das Einstellungsfenster per Escape, waehrend die Textarea den Fokus haelt,
    // feuert im echten Chromium KEIN blur. Haengt das Speichern daran, ist der Text weg
    // (Review-Befund Fix-Runde 4).
    const c = ctx();
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, c);
    textarea(s).onChangeCB?.("Sei knapp.");
    expect(c.settings.systemPromptOverride).toBe("Sei knapp.");
    expect(c.save).toHaveBeenCalled();
  });
  it("zeichnet die Warnzeile aber ERST beim blur — Speichern und Zeichnen sind getrennt", () => {
    // Die beiden Ereignisse duerfen nicht wieder zusammengelegt werden: Speichern bei
    // onChange verhindert Datenverlust, Zeichnen bei blur schont den Cursor.
    const c = ctx();
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, c);
    textarea(s).onChangeCB?.("Sei knapp."); // weder Werkzeuge noch Platzhalter
    expect(c.save).toHaveBeenCalled();
    expect(s.settingEl.querySelectorAll(".koda-warn")).toHaveLength(0);
    textarea(s).inputEl.dispatchEvent({ type: "blur" });
    expect(s.settingEl.querySelectorAll(".koda-warn")).toHaveLength(2);
  });
  it("nimmt eine ueberfluessige Warnzeile beim blur wieder weg, statt sie zu stapeln", () => {
    const c = ctx({ systemPromptOverride: "Sei knapp." });
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, c);
    expect(s.settingEl.querySelectorAll(".koda-warn")).toHaveLength(2);
    textarea(s).onChangeCB?.(DEFAULT_RULES);
    textarea(s).inputEl.dispatchEvent({ type: "blur" });
    expect(s.settingEl.querySelectorAll(".koda-warn")).toHaveLength(0);
  });
  it("zeichnet beim blur NUR die Warnzeilen, nicht den ganzen Tab", () => {
    // Ein voller `refresh()` liefe zwischen mousedown (das den blur ausloest) und click —
    // der Zuruecksetzen-Knopf waere im Moment seines eigenen Klicks schon ersetzt.
    const c = ctx();
    const s = new Setting(makeFakeEl());
    renderPromptRow(s, c);
    textarea(s).onChangeCB?.("Sei knapp.");
    textarea(s).inputEl.dispatchEvent({ type: "blur" });
    expect(c.refresh).not.toHaveBeenCalled();
  });
  it("speichert beim blur nicht noch einmal — der blur zeichnet nur", () => {
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
    renderPromptRow(s, ctx({ systemPromptOverride: "nichts", toolsDisabled: ["search_notes", "read_note", "list_notes", "get_workspace"] }));
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
const zeilen = (s: Setting): any[] => Array.from(s.settingEl.querySelectorAll(".koda-tool-row"));
const zeile = (s: Setting, name: string): any =>
  zeilen(s).find((r) => r.getAttribute("data-tool") === name);

describe("renderToolList", () => {
  it("fuehrt jedes Werkzeug mit einer eigenen Zeile", () => {
    const s = new Setting(makeFakeEl());
    renderToolList(s, ctx());
    expect(zeilen(s)).toHaveLength(11); // zehn feste plus related_notes
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
    (h.toggle as unknown as MockToggleComponent).onChangeCB?.(false);
    expect(c.settings.toolsDisabled).toContain("write_note");
    expect(c.save).toHaveBeenCalled();
  });
  it("schaltet wieder ein, ohne einen Rest in der Liste zu lassen", () => {
    const c = ctx({ toolsDisabled: ["write_note"] });
    const s = new Setting(makeFakeEl());
    const handles = renderToolList(s, c);
    const h = handles.find((x) => x.name === "write_note")!;
    (h.toggle as unknown as MockToggleComponent).onChangeCB?.(true);
    expect(c.settings.toolsDisabled).toEqual([]);
  });
  it("nimmt eine eigene Beschreibung erst beim blur an, nicht bei jedem Tastendruck", () => {
    const c = ctx();
    const s = new Setting(makeFakeEl());
    const handles = renderToolList(s, c);
    const h = handles.find((x) => x.name === "read_note")!;
    h.textarea.setValue("Liest.");
    expect(c.settings.toolDescriptions.read_note).toBeUndefined();
    h.textarea.inputEl.dispatchEvent(new Event("blur"));
    expect(c.settings.toolDescriptions.read_note).toBe("Liest.");
  });
  it("loescht den Eintrag wieder, wenn das Feld geleert wird — leer heisst ausgeliefert", () => {
    const c = ctx({ toolDescriptions: { read_note: "Liest." } });
    const s = new Setting(makeFakeEl());
    const handles = renderToolList(s, c);
    const h = handles.find((x) => x.name === "read_note")!;
    h.textarea.setValue("   ");
    h.textarea.inputEl.dispatchEvent(new Event("blur"));
    expect(c.settings.toolDescriptions.read_note).toBeUndefined();
  });
  // Steht bewusst am Ende der Datei: er misst, was die Tests DAVOR hinterlassen haben.
  it("hat die Modul-Vorlage nicht angefasst — kein geteilter Container", () => {
    expect(DEFAULT_SETTINGS.toolDescriptions).toEqual({});
    expect(DEFAULT_SETTINGS.toolsDisabled).toEqual([]);
    expect(DEFAULT_SETTINGS.systemPromptOverride).toBe("");
  });
});
