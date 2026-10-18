import { abilitiesViewModel, type AbilitiesInput } from "../src/core/abilities/panel-vm";
import { emptyOverlay, type Arbeit } from "../src/core/abilities/types";
import type { Skill } from "../src/core/skills/skill";

const sk = (name: string, o: { enabled?: boolean; pinned?: boolean; len?: number } = {}): Skill => ({
  name, description: `d-${name}`, enabled: o.enabled ?? true, pinned: o.pinned ?? false, body: "x".repeat(o.len ?? 10),
});
const arbeit = (o: Partial<Arbeit> = {}): Arbeit => ({
  name: "A", skills: {}, uebrigeSkills: "grundeinstellung", werkzeuge: {}, anbieter: {}, kontext: {}, base: null, ...o,
});
const input = (o: Partial<AbilitiesInput> = {}): AbilitiesInput => ({
  skills: [], failed: [], arbeiten: [], selected: null, arbeit: null, hints: [], overlay: emptyOverlay(),
  settingsDisabled: [], ownTools: [], providers: [], budgetChars: 6000, ...o,
});

describe("abilitiesViewModel", () => {
  it("Skill-Zeile: Stellung, Herkunft aus dem Overlay, Summe der gepinnten Texte", () => {
    const vm = abilitiesViewModel(input({
      skills: [sk("b", { len: 30 }), sk("a", { len: 20 })],
      overlay: { ...emptyOverlay(), skills: { a: "ganz" } },
    }));
    expect(vm.skills[0]).toEqual({ name: "a", chars: 20, mode: "ganz", fromOverlay: true });
    expect(vm.skills[1]).toEqual({ name: "b", chars: 30, mode: "beschreibung", fromOverlay: false });
    expect(vm.changes).toBe(1);
    expect(vm.pinnedChars).toBe(20);
    expect(vm.budgetChars).toBe(6000);
  });

  it("ein Overlay-Eintrag mit anderer Schreibweise zaehlt als Herkunft Overlay", () => {
    const vm = abilitiesViewModel(input({ skills: [sk("triage")], overlay: { ...emptyOverlay(), skills: { Triage: "aus" } } }));
    expect(vm.skills[0]).toMatchObject({ mode: "aus", fromOverlay: true });
  });

  it("Anbieter: teilweise abgeschaltet bleibt an, ganz aus durch die Arbeit", () => {
    const providers = [{ id: "vault-retrieval", tools: ["a_tool", "b_tool", "c_tool"] }];
    const teil = abilitiesViewModel(input({ providers, settingsDisabled: ["b_tool"] }));
    expect(teil.providers[0]).toEqual({ id: "vault-retrieval", total: 3, enabled: 2, on: true, fromOverlay: false });
    const aus = abilitiesViewModel(input({ providers, arbeit: arbeit({ anbieter: { "vault-retrieval": "aus" } }) }));
    expect(aus.providers[0]).toEqual({ id: "vault-retrieval", total: 3, enabled: 0, on: false, fromOverlay: false });
    const overlay = abilitiesViewModel(input({
      providers, arbeit: arbeit({ anbieter: { "vault-retrieval": "aus" } }),
      overlay: { ...emptyOverlay(), anbieter: { "vault-retrieval": "an" } },
    }));
    expect(overlay.providers[0]).toMatchObject({ on: true, enabled: 3, fromOverlay: true });
  });

  it("eigene Werkzeuge: Einstellung, Arbeit und Overlay wirken wie in effectiveDisabledTools", () => {
    const vm = abilitiesViewModel(input({
      ownTools: ["write_skill", "move_note"], settingsDisabled: ["move_note"],
      arbeit: arbeit({ werkzeuge: { write_skill: "aus" } }),
      overlay: { ...emptyOverlay(), werkzeuge: { move_note: "an" } },
    }));
    expect(vm.tools).toEqual([
      { name: "move_note", on: true, fromOverlay: true },
      { name: "write_skill", on: false, fromOverlay: false },
    ]);
  });

  it("Hinweise, Auswahl und Fehlschlaege werden durchgereicht, alles nach Namen sortiert", () => {
    const vm = abilitiesViewModel(input({
      selected: "Inbox", hints: ["x"], arbeiten: ["Inbox", "Alpha"],
      failed: [{ name: "z", reason: "no-description" }, { name: "m", reason: "read-error" }],
    }));
    expect(vm.selected).toBe("Inbox");
    expect(vm.hints).toEqual(["x"]);
    expect(vm.arbeiten).toEqual(["Alpha", "Inbox"]);
    expect(vm.failed.map((f) => f.name)).toEqual(["m", "z"]);
  });
});
