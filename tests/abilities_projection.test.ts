import { projectForModel } from "../src/core/agent/compaction/project";
import { skillTextRule } from "../src/core/abilities/projection";
import type { LogEntry } from "../src/core/agent/types";
import type { SkillMode } from "../src/core/abilities/types";

const BODY = "### triage\nInbox sortieren\n\n" + "Schritt. ".repeat(40);
const log = (skill: string, result: string): LogEntry[] => [
  { role: "user", content: "räum auf" },
  { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "load_skill", arguments: JSON.stringify({ name: skill }) }] },
  { role: "tool", toolCallId: "c1", content: result },
  { role: "assistant", content: "fertig" },
];
const rule = (m: Record<string, SkillMode>) => skillTextRule((n) => m[n.toLowerCase()] ?? null);

describe("skillTextRule in der Projektion", () => {
  it("ganz: das load_skill-Ergebnis wird zum Hinweis, der Verlauf bleibt unverändert", () => {
    const entries = log("triage", BODY);
    const out = projectForModel(entries, [rule({ triage: "ganz" })]);
    expect(out[2]).toEqual({ role: "tool", toolCallId: "c1", content: "[Skill triage — steht oben im System-Prompt unter ## Skills]", stubbed: true });
    expect((entries[2] as { content: string }).content).toBe(BODY);
  });

  it("aus: Hinweis, dass der Skill abgeschaltet ist", () => {
    const out = projectForModel(log("Triage", BODY), [rule({ triage: "aus" })]);
    expect(out[2].content).toBe("[Skill Triage — war bis hier aktiv, jetzt abgeschaltet; nicht mehr anwenden]");
  });

  it("Beschreibung oder unbekannter Skill: das Ergebnis bleibt wörtlich", () => {
    expect(projectForModel(log("triage", BODY), [rule({ triage: "beschreibung" })])[2].content).toBe(BODY);
    expect(projectForModel(log("weg", BODY), [rule({ triage: "ganz" })])[2].content).toBe(BODY);
  });

  it("Fehler-Ergebnisse und andere Werkzeuge sieht die Regel nicht", () => {
    expect(projectForModel(log("triage", "ERROR: Skill nicht gefunden"), [rule({ triage: "aus" })])[2].content).toBe("ERROR: Skill nicht gefunden");
    const other: LogEntry[] = [
      { role: "assistant", content: "", toolCalls: [{ id: "c2", name: "read_note", arguments: JSON.stringify({ name: "triage" }) }] },
      { role: "tool", toolCallId: "c2", content: BODY },
    ];
    expect(projectForModel(other, [rule({ triage: "aus" })])[1].content).toBe(BODY);
  });

  it("ohne Regeln ist die Projektion wie bisher", () => {
    expect(projectForModel(log("triage", BODY))[2].content).toBe(BODY);
  });

  it("Sitzungs-Marken gehen nie ans Modell", () => {
    const entries: LogEntry[] = [{ kind: "session", at: "1", state: { arbeit: "A", overlay: { skills: {}, werkzeuge: {}, anbieter: {}, kontext: {} }, manual: [] } }, { role: "user", content: "q" }];
    expect(projectForModel(entries)).toEqual([{ role: "user", content: "q" }]);
  });
});
