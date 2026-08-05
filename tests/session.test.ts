import { SessionStore, parseLines, serializeLine, type SessionSink } from "../src/core/memory/session";
import type { ChatMessage } from "../src/core/agent/types";

function memSink(): SessionSink & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    read: async (p) => files.get(p) ?? null,
    write: async (p, d) => void files.set(p, d),
    append: async (p, d) => void files.set(p, (files.get(p) ?? "") + d),
  };
}

const msg: ChatMessage = { role: "user", content: "Hallo" };

describe("serialize/parse", () => {
  it("Roundtrip inkl. toolCalls und toolCallId", () => {
    const m: ChatMessage = { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "read_note", arguments: "{}" }] };
    expect(parseLines(serializeLine(m) + serializeLine({ role: "tool", content: "x", toolCallId: "c1" }))).toEqual([
      m, { role: "tool", content: "x", toolCallId: "c1" },
    ]);
  });
  it("kaputte Zeilen werden uebersprungen statt alles zu verlieren", () => {
    expect(parseLines('{kaputt}\n' + serializeLine(msg))).toEqual([msg]);
  });
});

describe("SessionStore", () => {
  it("load auf leerem Store liefert []", async () => {
    const store = new SessionStore(memSink(), "sessions");
    expect(await store.load()).toEqual([]);
  });
  it("appendMessages + load ist der Roundtrip", async () => {
    const sink = memSink();
    const store = new SessionStore(sink, "sessions");
    await store.appendMessages([msg, { role: "assistant", content: "Hi" }]);
    expect(await store.load()).toHaveLength(2);
  });
  it("startNew archiviert current und leert es", async () => {
    const sink = memSink();
    const store = new SessionStore(sink, "sessions");
    await store.appendMessages([msg]);
    await store.startNew();
    expect(await store.load()).toEqual([]);
    expect(sink.files.get("sessions/archive.jsonl")).toContain("Hallo");
  });
});
