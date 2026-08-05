import { parseAgentSSE, ToolCallAssembler } from "../src/core/agent/stream";

const line = (obj: unknown): string => `data: ${JSON.stringify(obj)}\n`;

describe("parseAgentSSE", () => {
  it("liefert content- und reasoning-Deltas", () => {
    const r = parseAgentSSE(
      line({ choices: [{ delta: { content: "Hal" } }] }) +
      line({ choices: [{ delta: { reasoning_content: "denk" } }] }),
    );
    expect(r.content).toEqual(["Hal"]);
    expect(r.reasoning).toEqual(["denk"]);
    expect(r.done).toBe(false);
  });
  it("sammelt tool_calls-Deltas mit index/id/name/argsDelta", () => {
    const r = parseAgentSSE(
      line({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "read_note", arguments: "" } }] } }] }) +
      line({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"path":' } }] } }] }) +
      line({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"A.md"}' } }] } }] }),
    );
    expect(r.toolCalls).toEqual([
      { index: 0, id: "c1", name: "read_note", argsDelta: "" },
      { index: 0, argsDelta: '{"path":' },
      { index: 0, argsDelta: '"A.md"}' },
    ]);
  });
  it("faengt finish_reason und [DONE]", () => {
    const r = parseAgentSSE(line({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }) + "data: [DONE]\n");
    expect(r.finishReason).toBe("tool_calls");
    expect(r.done).toBe(true);
  });
  it("unvollstaendige letzte Zeile bleibt in rest", () => {
    const r = parseAgentSSE(line({ choices: [{ delta: { content: "x" } }] }) + 'data: {"cho');
    expect(r.content).toEqual(["x"]);
    expect(r.rest).toBe('data: {"cho');
  });
  it("vertraegt \\r\\n-Zeilenenden und kaputtes JSON (Zeile wird uebersprungen)", () => {
    const r = parseAgentSSE('data: {kaputt}\r\n' + line({ choices: [{ delta: { content: "ok" } }] }));
    expect(r.content).toEqual(["ok"]);
  });
});

describe("ToolCallAssembler", () => {
  it("baut aus Deltas vollstaendige ToolCalls, nach index sortiert", () => {
    const a = new ToolCallAssembler();
    a.push({ index: 1, id: "c2", name: "search_notes", argsDelta: '{"query":"x"}' });
    a.push({ index: 0, id: "c1", name: "read_note", argsDelta: '{"path":' });
    a.push({ index: 0, argsDelta: '"A.md"}' });
    expect(a.finish()).toEqual([
      { id: "c1", name: "read_note", arguments: '{"path":"A.md"}' },
      { id: "c2", name: "search_notes", arguments: '{"query":"x"}' },
    ]);
  });
  it("laesst Eintraege ohne name weg (kaputter Stream)", () => {
    const a = new ToolCallAssembler();
    a.push({ index: 0, argsDelta: "{}" });
    expect(a.finish()).toEqual([]);
  });
  it("vergibt eine Fallback-id, wenn der Server keine schickt", () => {
    const a = new ToolCallAssembler();
    a.push({ index: 0, name: "read_note", argsDelta: "{}" });
    expect(a.finish()[0].id).toBe("call_0");
  });
});
