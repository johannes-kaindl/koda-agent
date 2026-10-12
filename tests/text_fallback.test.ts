import { parseTextToolCall } from "../src/core/agent/text-fallback";
import { pruefeLinear } from "./vendor/kit/linear-probe";

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
    // Quadratisch waeren 25 bei Faktor 5 in der Eingabe (gemessen: 50 000 Opens brauchten 2,6 s).
    const r = pruefeLinear(parseTextToolCall, "<think>");
    expect(r.linear, r.message).toBe(true);
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
      const r = pruefeLinear(parseTextToolCall, form);
      expect(r.linear, r.message).toBe(true);
    }
  });
  it("bei zwei Fences gilt der erste (fence: first, wie bisher)", () => {
    const c = '```json\n{"tool":"read_note","arguments":{"path":"A.md"}}\n```\nund dann\n```json\n{"tool":"write_note","arguments":{}}\n```';
    expect(parseTextToolCall(c)?.name).toBe("read_note");
  });
});
