import { parseTextToolCall } from "../src/core/agent/text-fallback";

describe("parseTextToolCall", () => {
  it("erkennt ein JSON-Tool-Objekt im Fliesstext (auch in ```json-Fences)", () => {
    const c = 'Ich suche mal.\n```json\n{"tool":"search_notes","arguments":{"query":"Rezepte"}}\n```';
    expect(parseTextToolCall(c)).toEqual({ name: "search_notes", arguments: '{"query":"Rezepte"}' });
  });
  it("null bei normaler Prosa-Antwort", () => {
    expect(parseTextToolCall("Hier ist deine Antwort mit [[Link]].")).toBeNull();
  });
  it("null bei JSON ohne tool-Feld — kein falsch-positiver Zugriff", () => {
    expect(parseTextToolCall('{"regex":"a"}')).toBeNull();
  });
  it("ignoriert <think>-Blöcke vor dem JSON", () => {
    const c = '<think>{"tool":"x"}</think>{"tool":"read_note","arguments":{"path":"A.md"}}';
    expect(parseTextToolCall(c)).toEqual({ name: "read_note", arguments: '{"path":"A.md"}' });
  });
});
