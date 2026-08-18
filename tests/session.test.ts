import { SessionStore, parseLines, serializeLine, type SessionSink } from "../src/core/memory/session";
import type { ChatMessage, CompactionRecord } from "../src/core/agent/types";

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

describe("CompactionRecord im JSONL", () => {
  const rec: CompactionRecord = { kind: "compaction", stage: 1, at: "2026-08-18T20:00:00.000Z", keepToolResults: 3, stats: { stubbed: 2, bytes: 4096 } };
  const rec2: CompactionRecord = { kind: "compaction", stage: 2, at: "2026-08-18T20:01:00.000Z", keepToolResults: 3, summary: "Bisher: A gelesen.", turns: 2, stats: { stubbed: 0, bytes: 900 } };

  it("Roundtrip Record neben Nachrichten, Reihenfolge bleibt", () => {
    const text = serializeLine(msg) + serializeLine(rec) + serializeLine({ role: "assistant", content: "Hi" }) + serializeLine(rec2);
    expect(parseLines(text)).toEqual([msg, rec, { role: "assistant", content: "Hi" }, rec2]);
  });
  it("Record ohne gueltige stage wird uebersprungen, kostet nur die Zeile", () => {
    const text = '{"kind":"compaction","stage":9}\n' + serializeLine(msg);
    expect(parseLines(text)).toEqual([msg]);
  });
  it("Store persistiert Records ueber appendMessages + load", async () => {
    const store = new SessionStore(memSink(), "sessions");
    await store.appendMessages([msg, rec]);
    expect(await store.load()).toEqual([msg, rec]);
  });
});

describe("SessionStore Fehlerpfade (swallow vs. propagate)", () => {
  it("appendMessages schluckt einen Append-Fehler (Telemetrie darf den Run nicht kippen)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const sink: SessionSink = {
        read: async () => null,
        write: async () => {},
        append: async () => { throw new Error("disk full"); },
      };
      const store = new SessionStore(sink, "sessions");
      await expect(store.appendMessages([msg])).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("startNew wirft weiter, wenn das Archivieren fehlschlaegt (Datenverlust-Gefahr)", async () => {
    const sink: SessionSink = {
      read: async () => serializeLine(msg),
      write: async () => {},
      append: async () => { throw new Error("archive append failed"); },
    };
    const store = new SessionStore(sink, "sessions");
    await expect(store.startNew()).rejects.toThrow("archive append failed");
  });

  it("startNew wirft weiter, wenn das Leeren von current fehlschlaegt", async () => {
    const sink: SessionSink = {
      read: async () => serializeLine(msg),
      write: async () => { throw new Error("write failed"); },
      append: async () => {},
    };
    const store = new SessionStore(sink, "sessions");
    await expect(store.startNew()).rejects.toThrow("write failed");
  });
});
