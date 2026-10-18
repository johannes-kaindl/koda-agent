/* Skills als Grundeinstellung im Settings-Tab (Spec Faehigkeiten § 6): je Skill derselbe Drei-Stellungen-Schalter
 * wie im Tab „Fähigkeiten“, geschrieben ins Frontmatter der Skill-Datei. Eine Quelle fuer Settings und Tab — der
 * Schalter hier aendert, was gilt, wenn keine Arbeit und kein Overlay etwas anderes sagt. */
import type { Setting } from "obsidian";
import { frontmatterMode } from "../core/abilities/resolve";
import type { SkillMode } from "../core/abilities/types";
import type { Skill } from "../core/skills/skill";
import { t } from "../vendor/kit/i18n";
import { buildSkillSegment } from "./skill-segment";

export interface SkillDefaultsCtx {
  readSkills(): Promise<{ skills: Skill[]; failed: { name: string; reason: "read-error" | "no-description" }[] }>;
  setDefault(name: string, mode: SkillMode): Promise<void>;
}

export function renderSkillDefaults(setting: Setting, ctx: SkillDefaultsCtx): void {
  setting.setName(t("settings.skills")).setDesc(t("settings.skills.desc"));
  setting.setClass("koda-skills-setting");
  // Idempotent wie `renderToolList`: der native Pfad ruft `render` bei jedem Update erneut auf dieselbe Zeile.
  for (const alt of Array.from(setting.settingEl.querySelectorAll(".koda-skill-list"))) alt.remove();
  const host = setting.settingEl.createDiv({ cls: "koda-skill-list" });

  const paint = async (): Promise<void> => {
    const { skills, failed } = await ctx.readSkills();
    host.empty();
    if (skills.length === 0 && failed.length === 0) {
      host.createDiv({ cls: "koda-empty", text: t("abilities.empty.skills") });
      return;
    }
    for (const s of [...skills].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const row = host.createDiv({ cls: "koda-ab-row", attr: { "data-skill": s.name } });
      row.createSpan({ cls: "koda-ab-name", text: s.name, attr: { title: s.name } });
      buildSkillSegment(row, {
        name: s.name,
        mode: frontmatterMode(s),
        onChange: (m) => { void ctx.setDefault(s.name, m).then(() => paint()); },
      });
    }
    for (const f of failed) {
      host.createDiv({ cls: "koda-ab-row is-failed" }).createSpan({
        cls: "koda-ab-name",
        text: t(f.reason === "no-description" ? "abilities.failed.noDescription" : "abilities.failed.readError", f.name),
      });
    }
  };
  void paint();
}
