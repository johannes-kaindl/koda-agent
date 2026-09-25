import { describe, it, expect } from "vitest";
import { readToolProviders } from "../src/obsidian/providers";

const tool = { name: "semantic_search", description: "s", parameters: { type: "object", properties: {}, required: [] }, writes: false };
const good = { apiVersion: 1, tools: () => [tool], execute: async () => ({ ok: true as const, content: "" }) };
const appWith = (plugins: Record<string, unknown>) => ({ plugins: { plugins } });

describe("readToolProviders — alle Anbieter aus dem Plugin-Register, in stabiler Reihenfolge", () => {
  it("findet jedes Plugin, dessen api den Vertrag erfuellt, und liefert es unter seiner Plugin-Id", () => {
    const r = readToolProviders(appWith({ "vault-retrieval": { api: good }, "calendar-notes": { api: good } }));
    expect(r.map((p) => p.id)).toEqual(["calendar-notes", "vault-retrieval"]);
    expect(r[0].api).toBe(good);
  });
  it("sortiert nach Plugin-Id, nicht nach Ladereihenfolge — Kollisionen sollen reproduzierbar ausgehen", () => {
    const a = readToolProviders(appWith({ zeta: { api: good }, alpha: { api: good } })).map((p) => p.id);
    const b = readToolProviders(appWith({ alpha: { api: good }, zeta: { api: good } })).map((p) => p.id);
    expect(a).toEqual(["alpha", "zeta"]);
    expect(b).toEqual(a);
  });
  it("ueberspringt Plugins ohne api, mit fremder api und mit halbem Vertrag", () => {
    const r = readToolProviders(appWith({
      "ohne-api": {},
      "fremde-api": { api: { apiVersion: 1, status: () => ({}) } },
      "halb": { api: { tools: () => [tool] } },
      "ohne-writes": { api: { tools: () => [{ ...tool, writes: undefined }], execute: good.execute } },
      "echt": { api: good },
    }));
    expect(r.map((p) => p.id)).toEqual(["echt"]);
  });
  it("faellt bei kaputter app-Struktur auf eine leere Liste statt zu werfen", () => {
    for (const bad of [null, undefined, {}, { plugins: null }, { plugins: { plugins: null } }, { plugins: { plugins: 3 } }]) {
      expect(readToolProviders(bad)).toEqual([]);
    }
  });
  it("liest bei jedem Aufruf frisch — ein zur Laufzeit deaktiviertes Plugin verschwindet", () => {
    const reg: Record<string, unknown> = { "vault-retrieval": { api: good } };
    const app = appWith(reg);
    expect(readToolProviders(app)).toHaveLength(1);
    delete reg["vault-retrieval"];
    expect(readToolProviders(app)).toHaveLength(0);
  });
});
