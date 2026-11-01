import { describe, expect, it, vi } from "vitest";
import {
  ConvoArchive, KODA_LOG_PAYLOAD, archiveTitle, fromPayload, renderKodaNote, toPayload,
  type ArchivePort, type ArchiveSave,
} from "../src/core/memory/koda-archive";
import type { LogEntry } from "../src/core/agent/types";
import type { ChatRecord } from "../src/vendor/kit/chat-archive";

const frage: LogEntry = { role: "user", content: "Was steht in der Notiz?" };
const antwort: LogEntry = { role: "assistant", content: "Eine **Liste**.", thinking: "Ich lese erst." };
const werkzeug: LogEntry = { role: "tool", content: "geheimer Werkzeug-Inhalt", toolCallId: "c1" };
const marke: LogEntry = { kind: "compaction", stage: 1, at: "2026-11-01T10:00:00.000Z", keepToolResults: 3, stats: { stubbed: 1, bytes: 10 } };
const sitzung: LogEntry = { kind: "session", at: "2026-11-01T10:00:01.000Z", state: { arbeit: null, overlay: {}, notes: [], bases: [] } } as unknown as LogEntry;

function record(payload: unknown, payloadType = KODA_LOG_PAYLOAD): ChatRecord {
  return { okitChat: 1, plugin: "koda-agent", title: "t", created: "2026-11-01T10:00:00.000Z", updated: "2026-11-01T10:05:00.000Z", model: null, thinking: null, payloadType, payload } as ChatRecord;
}

describe("Payload koda-log/1", () => {
  it("Roundtrip behält Nachrichten, Marken und Reihenfolge", () => {
    const log: LogEntry[] = [frage, werkzeug, antwort, marke];
    expect(fromPayload(toPayload(log))).toEqual(log);
  });
  it("eine kaputte Zeile kostet die Zeile, nicht den Chat (derselbe Parser wie current.jsonl)", () => {
    expect(fromPayload([frage, { kaputt: true }, antwort])).toEqual([frage, antwort]);
  });
  it("kein Feld, keine Liste oder nichts Lesbares: null, nie ein leerer Chat", () => {
    expect(fromPayload(undefined)).toBeNull();
    expect(fromPayload({ entries: [] })).toBeNull();
    expect(fromPayload([])).toBeNull();
    expect(fromPayload([{ kaputt: 1 }])).toBeNull();
  });
  it("der Payload ist eine Kopie: eine spätere Änderung am Log ändert die abgelegte Fassung nicht", () => {
    const log: LogEntry[] = [{ role: "user", content: "a" }];
    const p = toPayload(log);
    log.push({ role: "assistant", content: "b" });
    expect(fromPayload(p)).toHaveLength(1);
  });
});

describe("Titel", () => {
  it("die erste Frage, nicht die erste Marke", () => {
    expect(archiveTitle([sitzung, marke, frage, antwort])).toBe("Was steht in der Notiz?");
  });
  it("ohne Frage leer (der Speicher macht daraus „Unbenanntes Gespräch“)", () => {
    expect(archiveTitle([marke])).toBe("");
  });
});

describe("Export als Notiz", () => {
  it("Frage und Antwort stehen drin, das Werkzeug-Ergebnis nicht, das Denken zugeklappt", () => {
    const md = renderKodaNote(record(toPayload([frage, werkzeug, antwort])), { question: "Question", answer: "Answer", thinking: "Thinking" });
    expect(md).toContain("## Question\n\nWas steht in der Notiz?");
    expect(md).toContain("## Answer");
    expect(md).toContain("> [!note]- Thinking");
    expect(md).not.toContain("geheimer Werkzeug-Inhalt");
  });
  it("Modelltext geht durch die Neutralisierung (kein Fernbild)", () => {
    const md = renderKodaNote(record(toPayload([frage, { role: "assistant", content: "![x](https://evil.example/a.png)" }])), { question: "Q", answer: "A", thinking: "T" });
    expect(md).not.toContain("![x](https://evil.example/a.png)");
  });
  it("ein fremder Payload-Typ oder ein unlesbarer Payload: null", () => {
    const s = { question: "Q", answer: "A", thinking: "T" };
    expect(renderKodaNote(record(toPayload([frage]), "okit-chat-history/1"), s)).toBeNull();
    expect(renderKodaNote(record("kaputt"), s)).toBeNull();
  });
});

function port(over: Partial<ArchivePort> = {}): ArchivePort & { saves: ArchiveSave[] } {
  const saves: ArchiveSave[] = [];
  return {
    saves,
    enabled: () => true,
    save: async (input) => { saves.push(input); return { name: `${saves.length}.json` }; },
    ...over,
  };
}
const meta = { model: "m", thinking: null };

describe("ConvoArchive: welche Datei gehört zu diesem Gespräch", () => {
  it("die erste Ablage legt eine Datei an, die zweite schreibt in dieselbe zurück", async () => {
    const p = port();
    const c = new ConvoArchive(p, () => new Date("2026-11-01T10:00:00Z"));
    expect(await c.persist([frage], meta)).toBe(true);
    expect(await c.persist([frage, antwort], meta)).toBe(true);
    expect(p.saves).toHaveLength(2);
    expect(p.saves[0]?.name).toBeUndefined();
    expect(p.saves[1]?.name).toBe("1.json");
    expect(p.saves[1]?.created).toBe(p.saves[0]?.created);
    expect(p.saves[0]?.payloadType).toBe(KODA_LOG_PAYLOAD);
  });
  it("ein unveränderter Stand wird nicht noch einmal geschrieben", async () => {
    const p = port();
    const c = new ConvoArchive(p);
    await c.persist([frage, antwort], meta);
    expect(await c.persist([frage, antwort], meta)).toBe(true);
    expect(p.saves).toHaveLength(1);
  });
  it("ohne Frage gibt es nichts zu schreiben, und das ist kein Fehler", async () => {
    const p = port();
    const c = new ConvoArchive(p);
    expect(await c.persist([marke, sitzung], meta)).toBe(true);
    expect(p.saves).toHaveLength(0);
  });
  it("Verlauf aus: false, geschrieben wird nichts", async () => {
    const p = port({ enabled: () => false });
    const c = new ConvoArchive(p);
    expect(await c.persist([frage], meta)).toBe(false);
    expect(p.saves).toHaveLength(0);
  });
  it("ein gescheitertes Speichern: false, und der nächste Versuch schreibt wieder", async () => {
    let n = 0;
    const p = port({ save: async (i) => { n += 1; return n === 1 ? null : { name: "ok.json" + i.title.length }; } });
    const c = new ConvoArchive(p);
    expect(await c.persist([frage], meta)).toBe(false);
    expect(await c.persist([frage], meta)).toBe(true);
    expect(n).toBe(2);
  });
  it("ein Wurf des Speichers wird zu false (der Lauf darf daran nie scheitern)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const c = new ConvoArchive(port({ save: async () => { throw new Error("Platte voll"); } }));
    expect(await c.persist([frage], meta)).toBe(false);
    warn.mockRestore();
  });
  it("reset: das nächste Gespräch bekommt eine neue Datei", async () => {
    const p = port();
    const c = new ConvoArchive(p);
    await c.persist([frage], meta);
    c.reset();
    await c.persist([{ role: "user", content: "neu" }], meta);
    expect(p.saves[1]?.name).toBeUndefined();
  });
  it("adopt: ein geöffneter alter Chat schreibt in seine eigene Datei zurück, mit seinem created", async () => {
    const p = port();
    const c = new ConvoArchive(p);
    c.adopt({ name: "alt.json", created: "2026-10-01T08:00:00.000Z" }, [frage]);
    expect(await c.persist([frage], meta)).toBe(true);   // unverändert: nichts zu schreiben
    expect(p.saves).toHaveLength(0);
    await c.persist([frage, antwort], meta);
    expect(p.saves[0]?.name).toBe("alt.json");
    expect(p.saves[0]?.created).toBe("2026-10-01T08:00:00.000Z");
  });
  it("zwei Ablagen dicht hintereinander sehen beide die Datei der ersten (eine Datei, nicht zwei)", async () => {
    const gesehen: ArchiveSave[] = [];
    const p = port({ save: async (i) => { gesehen.push(i); await new Promise((r) => setTimeout(r, 5)); return { name: i.name ?? "erste.json" }; } });
    const c = new ConvoArchive(p);
    const log: LogEntry[] = [frage];
    const a = c.persist(log, meta);
    const b = c.persist([frage, antwort], meta);
    await Promise.all([a, b]);
    expect(gesehen.map((s) => s.name)).toEqual([undefined, "erste.json"]);
  });
  it("Neu während des Schreibens: die Datei des alten Gesprächs wird nicht dem neuen zugeschlagen", async () => {
    const gesehen: ArchiveSave[] = [];
    const p = port({ save: async (i) => { gesehen.push(i); await new Promise((r) => setTimeout(r, 5)); return { name: "alt.json" }; } });
    const c = new ConvoArchive(p);
    const a = c.persist([frage], meta);
    c.reset();   // Neu, während die Datei noch geschrieben wird
    await a;
    await c.persist([{ role: "user", content: "ganz neu" }, { role: "assistant", content: "ok" }], meta);
    expect(gesehen).toHaveLength(2);            // sonst misst der Test nichts (gleiche Länge hieße „unverändert“)
    expect(gesehen[1]?.name).toBeUndefined();   // eine neue Datei, nicht „alt.json“
  });
  it("Öffnen eines alten Chats, während das laufende noch schreibt: jedes bleibt bei seiner Datei", async () => {
    const gesehen: ArchiveSave[] = [];
    const p = port({ save: async (i) => { gesehen.push(i); await new Promise((r) => setTimeout(r, 5)); return { name: i.name ?? "laufendes.json" }; } });
    const c = new ConvoArchive(p);
    const a = c.persist([frage], meta);                                              // das laufende Gespräch schreibt noch
    c.adopt({ name: "alt.json", created: "2026-10-01T08:00:00.000Z" }, [frage]);     // der Nutzer öffnet einen alten Chat
    await a;
    await c.persist([frage, antwort], meta);                                         // der alte Chat bekommt eine Runde
    expect(gesehen[0]?.name).toBeUndefined();                                        // das laufende bekam eine neue Datei
    expect(gesehen[1]?.name).toBe("alt.json");                                       // der alte schreibt in seine eigene, nicht in „laufendes.json“
  });
  it("needsSave: nur mit Frage und nur bei geändertem Stand", async () => {
    const c = new ConvoArchive(port());
    expect(c.needsSave([marke])).toBe(false);
    expect(c.needsSave([frage])).toBe(true);
    await c.persist([frage], meta);
    expect(c.needsSave([frage])).toBe(false);
    expect(c.needsSave([frage, antwort])).toBe(true);
  });
});
