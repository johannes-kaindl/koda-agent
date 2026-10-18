/* Skill-Texte stehen nie zweimal im Kontext (Spec § 7): Steht ein Skill auf „ganz“, geht sein Text einmal im
 * System-Prompt mit; ein frueheres `load_skill`-Ergebnis wird in der Projektion zum Hinweis. Steht er auf „aus“,
 * sagt der Hinweis, dass er abgeschaltet ist. Verlauf und JSONL bleiben unveraendert. Pure. */
import type { ToolResultRule } from "../agent/compaction/project";
import type { SkillMode } from "./types";

/** Der Skill-Name aus den Argumenten eines `load_skill`-Aufrufs, so wie das Modell ihn schrieb. */
function skillNameOf(args: string): string | null {
  try {
    const parsed: unknown = JSON.parse(args);
    if (typeof parsed !== "object" || parsed === null) return null;
    const name = (parsed as Record<string, unknown>)["name"];
    return typeof name === "string" && name !== "" ? name : null;
  } catch {
    return null;
  }
}

export function skillTextRule(modeOf: (name: string) => SkillMode | null): ToolResultRule {
  return (call) => {
    if (call.name !== "load_skill") return null;
    const name = skillNameOf(call.args);
    if (name === null) return null;
    const mode = modeOf(name);
    if (mode === "ganz") return `[Skill ${name} — steht oben im System-Prompt unter ## Skills]`;
    if (mode === "aus") return `[Skill ${name} — war bis hier aktiv, jetzt abgeschaltet; nicht mehr anwenden]`;
    return null;
  };
}
