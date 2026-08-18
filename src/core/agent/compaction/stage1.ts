import type { ChatMessage, CompactionRecord } from "../types";
import { stage1Targets } from "./project";

/** Stufe 1: Tool-Ergebnisse jenseits der K juengsten durch Stubs ersetzen. Deterministisch,
 *  kostenlos. Liefert nur dann einen Record, wenn er etwas kuerzt — sonst null (der Loop
 *  geht dann zu Stufe 2). Die Zaehlung kommt aus `stage1Targets` — derselben Regel, die
 *  `applyStage1` in der Projektion anwendet — damit die Marke im Chat sagt, was die
 *  Projektion tut. */
export function planStage1(projected: ChatMessage[], keep: number, at: string, forced = false): CompactionRecord | null {
  const targets = stage1Targets(projected, keep);
  if (targets.length === 0) return null;
  const bytes = targets.reduce((sum, i) => sum + projected[i].content.length, 0);
  const rec: CompactionRecord = { kind: "compaction", stage: 1, at, keepToolResults: keep, stats: { stubbed: targets.length, bytes } };
  if (forced) rec.forced = true;
  return rec;
}
