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
});
