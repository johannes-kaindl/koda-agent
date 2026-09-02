import type { ChatMessage, CompactionRecord } from "../types";
import { stage1Targets, stubbableChars } from "./project";

/** Stufe 1: Tool-Ergebnisse und Kontextbloecke jenseits der K juengsten durch Stubs ersetzen.
 *  Deterministisch, kostenlos. Liefert nur dann einen Record, wenn er etwas kuerzt — sonst
 *  null (der Loop geht dann zu Stufe 2). Die Zaehlung kommt aus `stage1Targets` — derselben
 *  Regel, die `applyStage1` in der Projektion anwendet — damit die Marke im Chat sagt, was
 *  die Projektion tut. */
export function planStage1(projected: ChatMessage[], keep: number, at: string, forced = false): CompactionRecord | null {
  const targets = stage1Targets(projected, keep);
  if (targets.length === 0) return null;
  const bytes = targets.reduce((sum, i) => sum + stubbableChars(projected[i]), 0);
  const contexts = targets.filter((i) => projected[i].role === "user").length;
  const rec: CompactionRecord = {
    kind: "compaction", stage: 1, at, keepToolResults: keep,
    stats: { stubbed: targets.length - contexts, bytes },
  };
  if (contexts > 0) rec.stats.contexts = contexts;
  if (forced) rec.forced = true;
  return rec;
}
