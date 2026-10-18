/* Wie beim Kontext-Tab (context_panel_visibility): ein unsichtbares Panel liest und zeichnet nichts. Der Sitzungszustand
 * ruft `syncAbilities` bei jedem Schalter — ohne Bremse baute der Tab Fähigkeiten dabei jedes Mal alle Skills neu ein,
 * auch wenn der Chat vorn steht. `viewModel` bleibt hier absichtlich offen (nie aufgeloest): gezaehlt wird nur der Aufruf. */
import { describe, it, expect, vi } from "vitest";
import { makeFakeEl } from "./vendor/kit/obsidian-mock";
import { AbilitiesPanel, type AbilitiesPanelHost } from "../src/obsidian/abilities-panel";

function makeHost(viewModel: AbilitiesPanelHost["viewModel"]): AbilitiesPanelHost {
  return {
    viewModel, chooseArbeit: () => {}, save: () => {}, saveAs: () => {}, resetOverlay: () => {},
    setSkillMode: () => {}, setToolOn: () => {}, setProviderOn: () => {},
    sectionStorage: () => ({ getCollapsed: () => undefined, setCollapsed: () => {} }),
  };
}

describe("AbilitiesPanel — Sichtbarkeits-Bremse", () => {
  it("liest nichts, solange das Panel nie gezeigt wurde, und baut bei onShow auf", () => {
    const viewModel = vi.fn(() => new Promise<never>(() => {}));
    const panel = new AbilitiesPanel(makeHost(viewModel));
    panel.mount(makeFakeEl());
    panel.render();
    expect(viewModel).toHaveBeenCalledTimes(0);
    panel.onShow();
    expect(viewModel).toHaveBeenCalledTimes(1);
    panel.render();
    expect(viewModel).toHaveBeenCalledTimes(2);
  });

  it("stellt die Bremse nach onHide wieder scharf", () => {
    const viewModel = vi.fn(() => new Promise<never>(() => {}));
    const panel = new AbilitiesPanel(makeHost(viewModel));
    panel.mount(makeFakeEl());
    panel.onShow();
    panel.onHide();
    panel.render();
    expect(viewModel).toHaveBeenCalledTimes(1);
  });
});
