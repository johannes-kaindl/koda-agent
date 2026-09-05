/* Der Obsidian-Adapter der Link- und Inhalts-Ports. Gepinnt wird vor allem die Richtung:
 * `resolvedLinks` ist Quelle → Ziel → Anzahl, Backlinks sind die Gegenrichtung, die
 * Obsidian nicht fertig vorhaelt (dieselbe Stelle wie `backlinkCount` in main.ts). */
import { describe, it, expect } from "vitest";
import { makeFakeApp, TFile } from "obsidian";
import { linkPort, contentPort } from "../src/obsidian/links";

function app(links: Record<string, Record<string, number>>): any {
  const a: any = makeFakeApp();
  a.metadataCache.resolvedLinks = links;
  return a;
}

describe("linkPort", () => {
  const a = app({ "A.md": { "B.md": 1, "C.md": 2 }, "Z.md": { "A.md": 1 }, "B.md": {} });

  it("liefert ausgehende Links als Zielpfade", () => {
    expect(linkPort(a).outgoing("A.md")).toEqual(["B.md", "C.md"]);
  });

  it("liefert Backlinks als Quellpfade, ohne die Notiz selbst", () => {
    expect(linkPort(a).backlinks("A.md")).toEqual(["Z.md"]);
  });

  it("zaehlt eine Selbstreferenz nicht als eigenen Backlink", () => {
    const b = app({ "S.md": { "S.md": 1 } });
    expect(linkPort(b).backlinks("S.md")).toEqual([]);
  });

  it("liefert leere Listen fuer eine unbekannte Notiz statt zu werfen", () => {
    expect(linkPort(a).outgoing("Weg.md")).toEqual([]);
    expect(linkPort(a).backlinks("Weg.md")).toEqual([]);
  });
});

describe("contentPort", () => {
  it("liest ueber cachedRead", async () => {
    const a: any = makeFakeApp();
    const datei = new TFile("A.md");
    a.vault.getFileByPath = (p: string) => (p === "A.md" ? datei : null);
    a.vault.cachedRead = (f: unknown) => Promise.resolve(f === datei ? "Inhalt" : "");
    await expect(contentPort(a).read("A.md")).resolves.toBe("Inhalt");
  });

  it("liefert null statt zu werfen, wenn es die Datei nicht gibt", async () => {
    const a: any = makeFakeApp();
    a.vault.getFileByPath = () => null;
    await expect(contentPort(a).read("Weg.md")).resolves.toBeNull();
  });

  it("liefert null, wenn das Lesen scheitert", async () => {
    const a: any = makeFakeApp();
    a.vault.getFileByPath = () => new TFile("A.md");
    a.vault.cachedRead = () => Promise.reject(new Error("kaputt"));
    await expect(contentPort(a).read("A.md")).resolves.toBeNull();
  });
});
