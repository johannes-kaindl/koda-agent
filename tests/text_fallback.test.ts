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
  it("JSON hinter Prosa mit eckigen Klammern wird gefunden (frueher: Klammerpaar ohne JSON verdeckte es)", () => {
    const c = 'Siehe [1] und {kein json}: {"tool":"read_note","arguments":{"path":"A.md"}}';
    expect(parseTextToolCall(c)).toEqual({ name: "read_note", arguments: '{"path":"A.md"}' });
  });
  it("ein offenes <think> verwirft den Rest (Entscheidung 2026-10-12): kein Tool-Aufruf dahinter", () => {
    expect(parseTextToolCall('<think>ich ueberlege {"tool":"read_note"} {"tool":"read_note","arguments":{"path":"A.md"}}')).toBeNull();
  });
  it("entartete Antworten: Laufzeit waechst linear (1 000 / 10 000 / 50 000)", () => {
    const formen: Array<(n: number) => string> = [
      (n) => '\\"['.repeat(n),
      (n) => "[".repeat(n) + "x" + "]".repeat(n),
      (n) => "{".repeat(n),
    ];
    for (const form of formen) {
      parseTextToolCall(form(1000));
      const t = (n: number): number => { const t0 = performance.now(); parseTextToolCall(form(n)); return performance.now() - t0; };
      const klein = Math.max(t(10_000), 1);
      const gross = t(50_000);
      expect(gross).toBeLessThan(1000);
      expect(gross / klein).toBeLessThan(15);
    }
  });
  it("bei zwei Fences gilt der erste (fence: first, wie bisher)", () => {
    const c = '```json\n{"tool":"read_note","arguments":{"path":"A.md"}}\n```\nund dann\n```json\n{"tool":"write_note","arguments":{}}\n```';
    expect(parseTextToolCall(c)?.name).toBe("read_note");
  });
});
