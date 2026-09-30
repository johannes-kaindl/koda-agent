import { describe, it, expect, vi } from "vitest";
import { VaultTools, type VaultPort } from "../src/obsidian/vault-tools";
import type { OcrProviderApi } from "../src/vendor/kit/ocr-provider";
import type { ImageGenProviderApi } from "../src/vendor/kit/image-gen-provider";
import type { ImageMode } from "../src/core/tools/images";

function vault(): VaultPort {
  return {
    listMarkdownPaths: () => [], listFolderPaths: () => [],
    read: async () => "", exists: async () => false, create: async () => {}, append: async () => {}, overwrite: async () => {},
    frontmatterOf: () => null, move: async () => {}, trash: async () => {}, backlinkCount: () => 0,
  };
}

interface Cfg {
  mode?: ImageMode;
  ocr?: OcrProviderApi | null;
  gen?: ImageGenProviderApi | null;
  size?: number | null;
  maxKb?: number;
  confirmImage?: (r: { prompt: string; folder: string }) => Promise<boolean>;
  allowed?: Set<string>;
}
function tools(c: Cfg) {
  return new VaultTools(vault(), async () => true, {
    kodaFolder: () => "Koda", today: () => "2026-10-01", listMaxRows: () => 50,
    imageMode: () => c.mode ?? "vision",
    ocr: () => c.ocr ?? null,
    imageGen: () => c.gen ?? null,
    imageSize: () => (c.size === undefined ? 1024 : c.size),
    imageMaxKb: () => c.maxKb ?? 4096,
    confirmImage: c.confirmImage,
    ...(c.allowed ? { allowed: () => c.allowed! } : {}),
  });
}

describe("read_image", () => {
  it("Vision: liefert einen Marker und haengt das Bild als Pfad an", async () => {
    const r = await tools({ mode: "vision" }).run("read_image", { path: "Fotos/a.png" });
    expect(r).toMatchObject({ ok: true, images: [{ path: "Fotos/a.png" }] });
  });
  it("OCR: liefert den erkannten Text, kein Bild", async () => {
    const ocr = { version: 1 as const, extractText: vi.fn(async () => "Rechnung 42") };
    const r = await tools({ mode: "ocr", ocr }).run("read_image", { path: "a.png" });
    expect(ocr.extractText).toHaveBeenCalledWith("a.png");
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.content).toContain("Rechnung 42");
    expect(r.ok && r.images).toBeUndefined();
  });
  it("OCR-Modus, aber der Anbieter ist inzwischen weg: Klartext statt Wurf", async () => {
    const r = await tools({ mode: "ocr", ocr: null }).run("read_image", { path: "a.png" });
    expect(r.ok).toBe(false);
  });
  it("kein Vision und kein OCR: sagt, warum nichts geht", async () => {
    const r = await tools({ mode: "none" }).run("read_image", { path: "a.png" });
    expect(!r.ok && r.error).toMatch(/Vision|Texterkennung/);
  });
  it("fehlendes Bild und falsche Endung sind Fehler-Ergebnisse", async () => {
    expect((await tools({ size: null }).run("read_image", { path: "weg.png" })).ok).toBe(false);
    const md = await tools({}).run("read_image", { path: "Notiz.md" });
    expect(!md.ok && md.error).toMatch(/png|jpg/i);
    expect((await tools({}).run("read_image", { path: "../x.png" })).ok).toBe(false);
  });
  it("zu gross fuer Vision: mit OCR-Anbieter wird der Text gelesen, sonst Fehler mit Grenze", async () => {
    const ocr = { version: 1 as const, extractText: async () => "Scan-Text" };
    const viaOcr = await tools({ mode: "vision", size: 10 * 1024 * 1024, maxKb: 4096, ocr }).run("read_image", { path: "scan.png" });
    expect(viaOcr.ok && viaOcr.content).toContain("Scan-Text");
    const none = await tools({ mode: "vision", size: 10 * 1024 * 1024, maxKb: 4096 }).run("read_image", { path: "scan.png" });
    expect(!none.ok && none.error).toContain("4096");
  });
  it("abgeschaltet durch den Nutzer: Klartext, auch bei vorhandener Faehigkeit", async () => {
    const r = await tools({ mode: "vision", allowed: new Set(["read_note"]) }).run("read_image", { path: "a.png" });
    expect(!r.ok && r.error).toMatch(/abgeschaltet/);
  });
});

describe("generate_image", () => {
  const gen = (spy = vi.fn(async () => "Koda/images/hund.png")): ImageGenProviderApi => ({ version: 1, generateImage: spy });

  it("im Koda-Ordner ohne Rueckfrage; Ergebnis enthaelt das Embed", async () => {
    const spy = vi.fn(async () => "Koda/images/hund.png");
    const confirm = vi.fn(async () => true);
    const r = await tools({ gen: gen(spy), confirmImage: confirm }).run("generate_image", { prompt: "ein Hund" });
    expect(confirm).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith("ein Hund", { targetFolder: "Koda/images" });
    expect(r.ok && r.content).toContain("![[Koda/images/hund.png]]");
  });
  it("ausserhalb des Koda-Ordners erst fragen — mit Prompt und Zielordner", async () => {
    const spy = vi.fn(async () => "Projekte/x.png");
    const confirm = vi.fn(async () => true);
    await tools({ gen: gen(spy), confirmImage: confirm }).run("generate_image", { prompt: "Logo", folder: "/Projekte/" });
    expect(confirm).toHaveBeenCalledWith({ prompt: "Logo", folder: "Projekte" });
    expect(spy).toHaveBeenCalledWith("Logo", { targetFolder: "Projekte" });
  });
  it("Ablehnung erzeugt nichts", async () => {
    const spy = vi.fn(async () => "x.png");
    const r = await tools({ gen: gen(spy), confirmImage: async () => false }).run("generate_image", { prompt: "Logo", folder: "Projekte" });
    expect(spy).not.toHaveBeenCalled();
    expect(!r.ok && r.error).toBe("vom Nutzer abgelehnt");
  });
  it("ohne Bestaetigungs-Port wird ausserhalb des Koda-Ordners nie geschrieben", async () => {
    const spy = vi.fn(async () => "x.png");
    const r = await tools({ gen: gen(spy) }).run("generate_image", { prompt: "Logo", folder: "Projekte" });
    expect(spy).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
  });
  it("Vertragsfehler sind Klartext-Ergebnisse, kein Wurf", async () => {
    for (const error of ["backend-unavailable", "timeout", "busy", "refused", "failed"] as const) {
      const r = await tools({ gen: { version: 1, generateImage: async () => ({ error, message: "m" }) } }).run("generate_image", { prompt: "x" });
      expect(r.ok).toBe(false);
    }
    const thrown = await tools({ gen: { version: 1, generateImage: async () => { throw new Error("kaputt"); } } }).run("generate_image", { prompt: "x" });
    expect(!thrown.ok && thrown.error).toContain("kaputt");
  });
  it("ohne Anbieter: Klartext; leerer Prompt: Fehler; Skills-Ordner wird nicht als frei behandelt", async () => {
    expect((await tools({ gen: null }).run("generate_image", { prompt: "x" })).ok).toBe(false);
    expect((await tools({ gen: gen() }).run("generate_image", { prompt: "  " })).ok).toBe(false);
    const confirm = vi.fn(async () => true);
    await tools({ gen: gen(), confirmImage: confirm }).run("generate_image", { prompt: "x", folder: "Koda/Skills" });
    expect(confirm).toHaveBeenCalled();
  });
});
