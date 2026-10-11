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
  it("ein loses </think> schneidet das davor ab, ein JSON dahinter bleibt lesbar", () => {
    const c = 'Gedanke ohne Anfang</think>{"tool":"read_note","arguments":{"path":"A.md"}}';
    expect(parseTextToolCall(c)).toEqual({ name: "read_note", arguments: '{"path":"A.md"}' });
  });
  it("viele <think> ohne Schluss: Laufzeit waechst linear, nicht quadratisch", () => {
    const zeit = (n: number): number => {
      const t0 = performance.now();
      parseTextToolCall("<think>".repeat(n));
      return performance.now() - t0;
    };
    zeit(1000); // Aufwaermen
    const klein = Math.max(zeit(10_000), 1);
    const gross = zeit(50_000);
    // Linear: Faktor 5 in der Eingabe, hoechstens ein grosszuegiges Vielfaches davon in der Zeit.
    // Quadratisch waeren 25 (gemessen: 50 000 Opens brauchten 2,6 s).
    expect(gross).toBeLessThan(500);
    expect(gross / klein).toBeLessThan(15);
  });
});
