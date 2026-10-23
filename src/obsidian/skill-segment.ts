/* Drei-Stellungen-Schalter „aus · Beschreibung · ganz“ (Tab Fähigkeiten und Settings-Tab). Der Schalter selbst ist der Kit-Baustein
 * `buildSegmentedControl` (obsidian-kit 0.65.0: Radiogruppe, Roving-Tabindex, Pfeiltasten, Home/Ende, gewählter Knopf halbfett mit
 * Unterstrich — nie allein über die Farbe); hier bleibt nur, was das Kit nicht weiss: die drei Skill-Stellungen und ihre Texte. */
import { t } from "../vendor/kit/i18n";
import { buildSegmentedControl, type SegmentedControl } from "../vendor/kit-obsidian/segmented-control";
import { SKILL_MODES, type SkillMode } from "../core/abilities/types";

export function skillModeLabel(mode: SkillMode): string {
  return t(`abilities.mode.${mode}`);
}

export function buildSkillSegment(parent: HTMLElement, opts: { name: string; mode: SkillMode; onChange(m: SkillMode): void }): SegmentedControl<SkillMode> {
  return buildSegmentedControl<SkillMode>(parent, {
    options: SKILL_MODES.map((mode) => ({ value: mode, label: skillModeLabel(mode) })),
    value: opts.mode,
    ariaLabel: t("abilities.mode.aria", opts.name),
    onChange: (m) => { opts.onChange(m); },
    // `koda-seg` setzt nur den Platz in der Zeile (rechts bündig), nicht das Aussehen.
    cls: "koda-seg",
  });
}
