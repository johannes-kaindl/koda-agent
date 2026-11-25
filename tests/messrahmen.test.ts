// Gegenprobe des Messrahmens (scripts/messrahmen/, CORE-TEST-01 und -24): durch den echten Loop, die echten Werkzeuge und HTTP
// gegen die Attrappe besteht jede Musterlösung und fällt jede falsche Lösung durch. Dazu: die Arme kommen am Draht an.
import { AUFGABEN } from "../scripts/messrahmen/aufgaben";
import { starteAttrappe, type Attrappe } from "../scripts/messrahmen/attrappe";
import { laufeAufgabe, type Arm, type LaufErgebnis } from "../scripts/messrahmen/laeufer";
import { passHochK } from "../scripts/messrahmen/auswertung";
import { startStand } from "../scripts/messrahmen/vault-stand";
import { isChatMessage } from "../src/core/agent/types";

let attrappe: Attrappe;
beforeAll(async () => { attrappe = await starteAttrappe(); });
afterAll(async () => { await attrappe.schliessen(); });

const start = startStand();
// Jeder Lauf bekommt einen eigenen Modellnamen: die Attrappe zählt die Schritte je Name.
let nr = 0;
const lauf = (id: string, modus: "muster" | "falsch", arm: Arm = "basis"): Promise<LaufErgebnis> => {
  const a = AUFGABEN.find((x) => x.id === id);
  if (a === undefined) throw new Error(id);
  return laufeAufgabe(a, {
    endpoint: attrappe.url, apiKey: "", modell: `${modus}/${id}/${arm}-${++nr}`, arm, start, fensterToken: 8192, timeoutMs: 10_000, suppressThinking: true,
  }, 1);
};
const gruende = (e: LaufErgebnis): string => e.befunde.filter((b) => !b.pass).map((b) => b.note).join("; ");

describe("Messrahmen gegen die Attrappe", () => {
  it("hat 20 bis 25 Aufgaben mit eindeutigen Ids und der Mischung aus dem Brief", () => {
    expect(AUFGABEN.length).toBeGreaterThanOrEqual(20);
    expect(AUFGABEN.length).toBeLessThanOrEqual(25);
    expect(new Set(AUFGABEN.map((a) => a.id)).size).toBe(AUFGABEN.length);
    expect(AUFGABEN.filter((a) => a.art === "injektion")).toHaveLength(4);
    expect(AUFGABEN.filter((a) => a.art === "ohne-werkzeug")).toHaveLength(3);
    expect(AUFGABEN.find((a) => a.art === "gespraech")?.zuege).toHaveLength(4);
  });

  it.each(AUFGABEN.map((a) => a.id))("Musterlösung besteht: %s", async (id) => {
    const e = await lauf(id, "muster");
    expect(gruende(e)).toBe("");
    expect(e.bestanden).toBe(true);
  });

  it.each(AUFGABEN.map((a) => a.id))("falsche Lösung fällt durch: %s", async (id) => {
    const e = await lauf(id, "falsch");
    expect(e.bestanden).toBe(false);
  });

  it("Injektion: der Grund nennt die Wirkung, nicht nur die Antwort", async () => {
    expect(gruende(await lauf("injektion-memory", "falsch"))).toMatch(/Koda\/Memory\.md wurde geändert/);
    expect(gruende(await lauf("injektion-loeschen", "falsch"))).toMatch(/Garden\/Tomatoes\.md fehlt/);
  });

  it("Arm a kommt am Draht an: ## Now ohne Minute, Basis mit", async () => {
    const basis = await lauf("datum-wochentag", "muster", "basis");
    const a = await lauf("datum-wochentag", "muster", "a");
    expect(attrappe.systemPrompts.get(basis.modell)).toContain("## Now\n2026-11-25 (Wednesday) 14:37, Europe/Berlin");
    expect(attrappe.systemPrompts.get(a.modell)).toContain("## Now\n2026-11-25 (Wednesday), Europe/Berlin");
  });

  it("Arm b kommt am Werkzeug an: read_note der langen Notiz ist gekappt, in der Basis nicht", async () => {
    const ergebnis = async (arm: Arm): Promise<string> => {
      const e = await lauf("gespraech-folgefragen", "muster", arm);
      const tool = e.verlauf.find((m) => isChatMessage(m) && m.role === "tool");
      return tool !== undefined && isChatMessage(tool) ? tool.content : "";
    };
    expect(await ergebnis("basis")).toMatch(/^# Meeting log/);
    expect(await ergebnis("b")).toMatch(/^\[gekappt: die ersten 8000 von \d+ Zeichen/);
  });
});

describe("pass^k", () => {
  const l = (aufgabe: string, bestanden: boolean): LaufErgebnis => ({ aufgabe, bestanden } as LaufErgebnis);
  it("schätzt C(c,k)/C(n,k) je Aufgabe und mittelt", () => {
    // Aufgabe x: 3 von 5 → 1/10; Aufgabe y: 5 von 5 → 1.
    const ls = [...[true, true, true, false, false].map((b) => l("x", b)), ...[1, 2, 3, 4, 5].map(() => l("y", true))];
    expect(passHochK(ls, 3)).toBeCloseTo((0.1 + 1) / 2);
    expect(passHochK([l("x", true)], 3)).toBeNull();
  });
});
