/* Drei-Stellungen-Schalter „aus · Beschreibung · ganz“ (Tab Fähigkeiten und Settings-Tab). Eine Radio-Gruppe
 * (CORE-META-20): `role="radiogroup"`, je Knopf `role="radio"` und `aria-checked`, Pfeiltasten wechseln innerhalb der
 * Gruppe. Der gewaehlte Knopf traegt zusaetzlich `is-active` (zweiter Kanal neben der Farbe: das Label bleibt Text). */
import { t } from "../vendor/kit/i18n";
import { SKILL_MODES, type SkillMode } from "../core/abilities/types";

export function skillModeLabel(mode: SkillMode): string {
  return t(`abilities.mode.${mode}`);
}

export function buildSkillSegment(parent: HTMLElement, opts: { name: string; mode: SkillMode; onChange(m: SkillMode): void }): HTMLElement {
  const group = parent.createDiv({ cls: "koda-seg", attr: { role: "radiogroup", "aria-label": t("abilities.mode.aria", opts.name) } });
  const buttons: HTMLButtonElement[] = [];
  SKILL_MODES.forEach((mode, index) => {
    const active = mode === opts.mode;
    const b = group.createEl("button", {
      cls: `koda-seg-btn${active ? " is-active" : ""}`,
      text: skillModeLabel(mode),
      attr: { role: "radio", "aria-checked": String(active), tabindex: active ? "0" : "-1", "data-mode": mode },
    });
    b.addEventListener("click", () => { if (mode !== opts.mode) opts.onChange(mode); });
    b.addEventListener("keydown", (e: KeyboardEvent) => {
      const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (step === 0) return;
      e.preventDefault();
      const next = SKILL_MODES[(index + step + SKILL_MODES.length) % SKILL_MODES.length];
      if (next !== undefined) opts.onChange(next);
    });
    buttons.push(b);
  });
  return group;
}
