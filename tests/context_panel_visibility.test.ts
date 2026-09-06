/* Befund 3 (Abschluss-Review Etappe 2b): der Hub reicht `notifyFileOpen` an ALLE Panels
 * durch, sichtbar oder nicht (Vendor-Hub, `src/vendor/kit-obsidian/hub.ts`). Ohne Bremse
 * baut ein unsichtbares Kontext-Panel bei jedem `file-open` trotzdem einen vollen
 * Volltext-Block samt Datei-Lesevorgaengen. Diese Tests pinnen die Bremse: `onFileOpen`
 * zeichnet nur neu, wenn `onShow` das Panel zuletzt als sichtbar markiert hat (und `onHide`
 * es wieder als unsichtbar markiert); ein sichtbares Panel aktualisiert weiterhin sofort. */
import { describe, it, expect, vi } from "vitest";
import { makeFakeEl } from "./vendor/kit/obsidian-mock";
import { ContextPanel, type ContextPanelHost } from "../src/obsidian/context-panel";
import type { PanelViewModel } from "../src/core/context/panel-vm";

/** Die Mock-DOM-Elemente aus dem Kit-Testdouble kennen `querySelectorAll`, aber (Stand
 *  `MOCK_REF` 0.31.0) kein singulares `querySelector` — `paint()`/`paintError()` rufen
 *  genau das auf ihrem Summary-Element auf. Statt den vendorten Mock anzufassen (Kopfzeile:
 *  „do not hand-edit"), patcht dieser Helfer jedes ueber `createDiv`/`createEl`/`createSpan`
 *  neu entstehende Kind lokal fuer diese Testdatei. */
/* `el` ist bewusst `any` typisiert, nicht generisch: das Kit-Testdouble deklariert seine
 * DOM-Knoten selbst durchgehend als `any` (obsidian-mock.ts, `makeFakeEl`), und ein Index
 * ueber einen generischen Typparameter liesse sich zwar LESEN, aber nicht BESCHREIBEN
 * (TS2862 — „generic and can only be indexed for reading"). Ein `any`-Parameter ist hier
 * also keine Abkuerzung um einen Fehler, sondern der ehrliche Typ des Mocks. */
function withQuerySelector(el: any): any {
  if (typeof el.querySelector !== "function") {
    el.querySelector = (sel: string) => el.querySelectorAll(sel)[0] ?? null;
  }
  for (const fn of ["createDiv", "createEl", "createSpan"] as const) {
    const orig = el[fn].bind(el);
    el[fn] = (...args: unknown[]) => withQuerySelector(orig(...args));
  }
  return el;
}

function leererVm(): PanelViewModel {
  return { sections: [], chars: 0, summary: "0 Zeichen", state: "is-ok", hasOff: false, depth: null, manualEnabled: true };
}

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function makeHost(vm: () => Promise<PanelViewModel>): ContextPanelHost {
  return {
    mode: () => "note",
    setMode: () => {},
    viewModel: vm,
    toggle: () => {},
    remove: () => {},
    addActive: () => {},
    addNote: () => {},
    addFolder: () => {},
    setDepth: () => {},
    reset: () => {},
    openNote: () => {},
    sectionStorage: () => ({ getCollapsed: () => undefined, setCollapsed: () => {} }),
    lang: () => "de",
  };
}

describe("ContextPanel — Sichtbarkeits-Bremse (Befund 3)", () => {
  it("zeichnet bei onFileOpen NICHT neu, solange das Panel nie gezeigt wurde", async () => {
    const viewModel = vi.fn(() => Promise.resolve(leererVm()));
    const panel = new ContextPanel(makeHost(viewModel));
    const container = withQuerySelector(makeFakeEl());

    panel.mount(container);
    await flush();
    expect(viewModel).toHaveBeenCalledTimes(1); // der einmalige Aufbau beim Mount

    panel.onFileOpen();
    await flush();
    expect(viewModel).toHaveBeenCalledTimes(1); // unsichtbar: kein zusaetzlicher Bau
  });

  it("zeichnet bei onFileOpen sofort neu, sobald onShow das Panel sichtbar gemacht hat", async () => {
    const viewModel = vi.fn(() => Promise.resolve(leererVm()));
    const panel = new ContextPanel(makeHost(viewModel));
    const container = withQuerySelector(makeFakeEl());

    panel.mount(container);
    await flush();

    panel.onShow();
    await flush();
    expect(viewModel).toHaveBeenCalledTimes(2); // mount + onShow

    panel.onFileOpen();
    await flush();
    expect(viewModel).toHaveBeenCalledTimes(3); // sichtbar: aktualisiert sofort
  });

  it("stellt die Bremse nach onHide wieder scharf", async () => {
    const viewModel = vi.fn(() => Promise.resolve(leererVm()));
    const panel = new ContextPanel(makeHost(viewModel));
    const container = withQuerySelector(makeFakeEl());

    panel.mount(container);
    await flush();
    panel.onShow();
    await flush();
    expect(viewModel).toHaveBeenCalledTimes(2);

    panel.onHide();
    panel.onFileOpen();
    await flush();
    expect(viewModel).toHaveBeenCalledTimes(2); // wieder unsichtbar: kein Bau
  });
});
