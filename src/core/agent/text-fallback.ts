import { firstJsonObject } from "../../vendor/kit/llm-json";

/** Fallback fuer Modelle ohne natives Tool-Calling (Dicke laut koda-lab-Messung):
 *  findet ein {"tool": …, "arguments": …}-Objekt im Antworttext. Das JSON-Lesen (Think-Bloecke,
 *  erster Fence, balancierte Klammern) liegt im Kit (`llm-json`); hier bleibt nur die Fachfrage. */
export function parseTextToolCall(content: string): { name: string; arguments: string } | null {
  const obj = firstJsonObject(content, { fence: "first" });
  if (obj === null) return null;
  if (typeof obj.tool !== "string" || obj.tool.length === 0) return null;
  const args = obj.arguments !== undefined ? JSON.stringify(obj.arguments) : "{}";
  return { name: obj.tool, arguments: args };
}
