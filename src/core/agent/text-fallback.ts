/** Fallback fuer Modelle ohne natives Tool-Calling (Dicke laut koda-lab-Messung):
 *  findet ein {"tool": …, "arguments": …}-Objekt im Antworttext.
 *  firstJsonObject-Scanner nach dem transmute-Muster (balancierte Klammern, Strings uebersprungen). */
function stripThink(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*?<\/think>/, "");
}

function stripFence(raw: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  return fenced ? fenced[1] : raw;
}

function firstJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

export function parseTextToolCall(content: string): { name: string; arguments: string } | null {
  const candidate = firstJsonObject(stripFence(stripThink(content)));
  if (candidate === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.tool !== "string" || obj.tool.length === 0) return null;
  const args = obj.arguments !== undefined ? JSON.stringify(obj.arguments) : "{}";
  return { name: obj.tool, arguments: args };
}
