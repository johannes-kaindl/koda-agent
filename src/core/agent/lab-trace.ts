/* Pure Bausteine fuer die llm-lab-Anbindung (Task „llm-lab als Konsument anschliessen").
   Das Zusammensetzen des Log-Aufrufs selbst (Turn-Id, Fetch der API) bleibt in main.ts —
   es braucht Obsidian (app.plugins) und ist deshalb nicht Teil von core. */
import type { ChatMessage, ToolCall } from "./types";

/** llm-lab kennt nur system/user/assistant (kein "tool") — Tool-Ergebnisse gehoeren nicht
 *  zur bewerteten Konversation und wuerden das Rollen-Schema des Lab verletzen. */
export function toLabMessages(
  messages: ChatMessage[],
): { role: "system" | "user" | "assistant"; content: string }[] {
  return messages
    .filter((m): m is ChatMessage & { role: "system" | "user" | "assistant" } => m.role !== "tool")
    .map((m) => ({ role: m.role, content: m.content }));
}

/** Klartext fuer LabLogInput.error aus einem gescheiterten LlmResult — dieselbe Form, die
 *  main.ts auch dem Nutzer zeigt (kind + detail), damit das Lab denselben Fehler sieht.
 *  Duck-typed statt gegen `LlmResult` aus src/llm importiert: core haengt nicht von einer
 *  Obsidian-nahen Schicht ab, auch wenn diese selbst obsidian-frei ist (Schichtrichtung). */
export function describeLlmFailure(r: { kind: string; detail: string }): string {
  return `${r.kind}: ${r.detail}`;
}

/** Pfad eines `read_note`-Aufrufs, wenn der Tool-Call diesen Namen traegt und seine
 *  Argumente einen String-Pfad enthalten — sonst null. Grundlage von `contextPaths`
 *  (Task-Vorgabe: „die von Werkzeugen gelesenen Notizen"; andere Lesewerkzeuge wie
 *  `search_notes` liefern keinen einzelnen Pfad und bleiben deshalb aussen vor). */
export function readNotePathOf(call: ToolCall): string | null {
  if (call.name !== "read_note") return null;
  try {
    const args = JSON.parse(call.arguments) as unknown;
    const path = (args as { path?: unknown } | null)?.path;
    return typeof path === "string" && path !== "" ? path : null;
  } catch {
    return null;
  }
}
