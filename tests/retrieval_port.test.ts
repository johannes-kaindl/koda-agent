import { describe, it, expect } from "vitest";
import { readRetrievalApi } from "../src/obsidian/retrieval";

const api = {
  apiVersion: 1,
  status: () => ({ apiVersion: 1, indexed: true, noteCount: 3 }),
  search: async () => ({ ok: true as const, hits: [] }),
  related: async () => ({ ok: true as const, hits: [] }),
};
const appWith = (plugin: unknown) => ({ plugins: { plugins: { "vault-retrieval": plugin } } });

describe("readRetrievalApi", () => {
  it("findet eine vollstaendige API", () => {
    expect(readRetrievalApi(appWith({ api }))).toBe(api);
  });

  it("gibt null zurueck, wenn vault-rag gar nicht installiert ist", () => {
    expect(readRetrievalApi({ plugins: { plugins: {} } })).toBeNull();
  });

  it("gibt null zurueck, wenn das Plugin da ist, aber keine api traegt (aeltere Version)", () => {
    expect(readRetrievalApi(appWith({}))).toBeNull();
  });

  it("lehnt eine fremde Hauptversion ab, statt auf gut Glueck zu rufen", () => {
    expect(readRetrievalApi(appWith({ api: { ...api, apiVersion: 2 } }))).toBeNull();
  });

  it("lehnt ein Objekt ab, dem eine Methode fehlt", () => {
    expect(readRetrievalApi(appWith({ api: { apiVersion: 1, status: api.status } }))).toBeNull();
  });

  it("faellt bei kaputter app-Struktur auf null statt zu werfen", () => {
    for (const bad of [null, undefined, {}, { plugins: null }, { plugins: { plugins: null } }]) {
      expect(readRetrievalApi(bad)).toBeNull();
    }
  });
});
