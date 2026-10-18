/* `thinking` ist ein Anzeige-Feld (Entscheidung Johannes 2026-10-17): mit der Sitzung gespeichert, nie am Draht, in keiner
 * Schaetzung, von keiner Verdichtung angefasst. Diese Tests pinnen die drei Grenzen, an denen es sonst still ins Modell liefe. */
import { projectForModel } from "../src/core/agent/compaction/project";
import { estimateTokens } from "../src/core/agent/compaction/estimate";
import { toWireMessages, type ChatMessage, type LogEntry } from "../src/core/agent/types";
import { parseLines, serializeLine } from "../src/core/memory/session";

const DENKEN = "GEHEIMES-DENKEN ".repeat(200);
const mitDenken: ChatMessage[] = [
  { role: "user", content: "Frage" },
  { role: "assistant", content: "Antwort", thinking: DENKEN },
];
const ohneDenken: ChatMessage[] = [
  { role: "user", content: "Frage" },
  { role: "assistant", content: "Antwort" },
];

describe("thinking als Anzeige-Feld", () => {
  it("geht nie auf den Draht", () => {
    expect(JSON.stringify(toWireMessages(mitDenken))).not.toContain("GEHEIMES-DENKEN");
    expect(toWireMessages(mitDenken)).toEqual(toWireMessages(ohneDenken));
  });

  it("zaehlt in keiner Schaetzung und bleibt durch die Projektion unberuehrt", () => {
    expect(estimateTokens(mitDenken)).toBe(estimateTokens(ohneDenken));
    const projiziert = projectForModel(mitDenken as LogEntry[]);
    expect(estimateTokens(projiziert)).toBe(estimateTokens(ohneDenken));
    expect(projiziert[1]?.thinking).toBe(DENKEN);
  });

  it("uebersteht Schreiben und Lesen des JSONL; ein kaputtes Feld kostet das Feld, nicht die Antwort", () => {
    const text = mitDenken.map(serializeLine).join("") + JSON.stringify({ role: "assistant", content: "B", thinking: 42 }) + "\n";
    const back = parseLines(text);
    expect(back[1]).toEqual({ role: "assistant", content: "Antwort", thinking: DENKEN });
    expect(back[2]).toEqual({ role: "assistant", content: "B" });
  });
});
