import { describe, it, expect } from "vitest";
import { readOcrApi } from "../src/obsidian/ocr";
import { readImageGenApi } from "../src/obsidian/image-gen";

const ocr = { version: 1, extractText: async () => "x" };
const gen = { version: 1, generateImage: async () => "a.png" };
const appWith = (id: string, plugin: unknown) => ({ plugins: { plugins: { [id]: plugin } } });

describe.each([
  ["readOcrApi", readOcrApi, "image-to-markdown", ocr],
  ["readImageGenApi", readImageGenApi, "local-image-generator", gen],
] as const)("%s", (_n, read, id, api) => {
  it("findet eine vollstaendige API unter der Plugin-Id des Besitzers", () => {
    expect(read(appWith(id, { api }))).toBe(api);
  });
  it("gibt null zurueck, wenn das Plugin fehlt oder keine api traegt", () => {
    expect(read({ plugins: { plugins: {} } })).toBeNull();
    expect(read(appWith(id, {}))).toBeNull();
  });
  it("lehnt eine fremde Version und eine fehlende Methode ab", () => {
    expect(read(appWith(id, { api: { ...api, version: 2 } }))).toBeNull();
    expect(read(appWith(id, { api: { version: 1 } }))).toBeNull();
  });
  it("liest nicht unter einer fremden Id", () => {
    expect(read(appWith("anderes-plugin", { api }))).toBeNull();
  });
  it("faellt bei kaputter app-Struktur auf null statt zu werfen", () => {
    for (const bad of [null, undefined, {}, { plugins: null }, { plugins: { plugins: null } }]) expect(read(bad)).toBeNull();
  });
});
