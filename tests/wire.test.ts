import { toWireMessages } from "../src/core/agent/types";

describe("toWireMessages", () => {
  it("mappt assistant-toolCalls in das tool_calls-Wire-Format", () => {
    const wire = toWireMessages([
      { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "read_note", arguments: '{"path":"A.md"}' }] },
      { role: "tool", content: "Inhalt", toolCallId: "c1" },
    ]);
    expect(wire[0]).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [{ id: "c1", type: "function", function: { name: "read_note", arguments: '{"path":"A.md"}' } }],
    });
    expect(wire[1]).toEqual({ role: "tool", content: "Inhalt", tool_call_id: "c1" });
  });
  it("laesst Nachrichten ohne toolCalls unangetastet", () => {
    expect(toWireMessages([{ role: "user", content: "Hi" }])).toEqual([{ role: "user", content: "Hi" }]);
  });
  it("ersetzt leere oder kaputte tool_call-Argumente durch {} — sonst vergiftet ein einziger "
    + "abgeschnittener Tool-Call die ganze Session", () => {
    const wire = toWireMessages([
      { role: "assistant", content: "", toolCalls: [
        { id: "c1", name: "write_note", arguments: "" },
        { id: "c2", name: "write_note", arguments: "   " },
        { id: "c3", name: "write_note", arguments: '{"path":' },
      ] },
    ]) as { tool_calls: { function: { arguments: string } }[] }[];
    expect(wire[0].tool_calls.map((c) => c.function.arguments)).toEqual(["{}", "{}", "{}"]);
  });
});

describe("toWireMessages — Bilder am Tool-Ergebnis", () => {
  const tool = { role: "tool" as const, content: "Bild a.png angehängt", toolCallId: "c1", images: [{ path: "a.png" }] };
  it("baut Parts [text, image_url] aus den aufgeloesten URLs", () => {
    const wire = toWireMessages([tool], new Map([["a.png", "data:image/png;base64,AAA"]]));
    expect(wire[0]).toEqual({
      role: "tool",
      content: [{ type: "text", text: "Bild a.png angehängt" }, { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } }],
      tool_call_id: "c1",
    });
  });
  it("faellt ohne aufgeloeste URL auf reinen Text zurueck (keine kaputte Nachricht)", () => {
    expect(toWireMessages([tool])[0]).toEqual({ role: "tool", content: "Bild a.png angehängt", tool_call_id: "c1" });
    expect(toWireMessages([tool], new Map())[0]).toMatchObject({ content: "Bild a.png angehängt" });
  });
  it("laesst Pfade, die nicht aufgeloest wurden, aus den Parts heraus", () => {
    const two = { ...tool, images: [{ path: "a.png" }, { path: "fehlt.png" }] };
    const wire = toWireMessages([two], new Map([["a.png", "data:x"]])) as { content: unknown[] }[];
    expect(wire[0].content).toHaveLength(2);
  });
});
