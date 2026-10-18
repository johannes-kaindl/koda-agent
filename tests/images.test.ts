import { describe, it, expect } from "vitest";
import {
  chooseImageMode, imageExtension, isImagePath,
  IMAGE_EST_CHARS, ocrResult, visionResult,
} from "../src/core/tools/images";
import { binaryToDataUrl } from "../src/vendor/kit/data-url";

describe("isImagePath / imageExtension", () => {
  it("erkennt Bildformate, die Vision-Modelle lesen, unabhaengig von der Schreibweise", () => {
    for (const p of ["a.png", "Fotos/x.JPG", "b.jpeg", "c.webp", "d.gif"]) expect(isImagePath(p)).toBe(true);
    expect(imageExtension("Fotos/x.JPG")).toBe("jpg");
  });
  it("lehnt Notizen, SVG und Endungsloses ab", () => {
    for (const p of ["a.md", "a.svg", "png", "a.pdf", "a."]) expect(isImagePath(p)).toBe(false);
  });
});

describe("binaryToDataUrl", () => {
  it("baut eine Data-URL mit MIME aus der Endung", () => {
    const buf = new Uint8Array([104, 105]).buffer; // "hi"
    expect(binaryToDataUrl(buf, "png")).toBe("data:image/png;base64,aGk=");
    expect(binaryToDataUrl(buf, "JPG")).toBe("data:image/jpeg;base64,aGk=");
  });
  it("kommt mit Dateien ueber der Chunk-Grenze zurecht", () => {
    const big = new Uint8Array(0x8000 * 3 + 5).fill(65);
    const url = binaryToDataUrl(big.buffer, "png");
    expect(atob(url.split(",")[1]).length).toBe(big.length);
  });
});

describe("chooseImageMode", () => {
  it("Vision wahrscheinlich oder bestaetigt -> vision, auch mit OCR-Anbieter", () => {
    expect(chooseImageMode("likely", true)).toBe("vision");
    expect(chooseImageMode("confirmed", false)).toBe("vision");
  });
  it("kein Vision -> OCR, wenn ein Anbieter da ist, sonst none", () => {
    expect(chooseImageMode("no", true)).toBe("ocr");
    expect(chooseImageMode("no", false)).toBe("none");
  });
});

describe("visionResult", () => {
  it("haengt das Bild an das Ergebnis und nennt den Pfad im Text", () => {
    const r = visionResult("Fotos/a.png");
    expect(r).toMatchObject({ ok: true, source: "vision", images: [{ path: "Fotos/a.png" }] });
    expect(r.ok && r.content).toContain("Fotos/a.png");
  });
  it("schaetzt ein Bild nicht als 0 Zeichen", () => {
    expect(IMAGE_EST_CHARS).toBeGreaterThan(0);
  });
});

describe("ocrResult", () => {
  it("liefert den erkannten Text mit Quelle und Pfad", async () => {
    const r = await ocrResult({ extractText: async () => "Rechnung 42" }, "a.png");
    expect(r).toMatchObject({ ok: true, source: "ocr:image-to-markdown" });
    expect(r.ok && r.content).toContain("Rechnung 42");
    expect(r.ok && r.content).toContain("a.png");
    expect(r.ok && r.images).toBeUndefined();
  });
  it("meldet ein Bild ohne Text als Ergebnis, nicht als Fehler", async () => {
    const r = await ocrResult({ extractText: async () => "  \n" }, "a.png");
    expect(r.ok).toBe(true);
    expect(r.ok && r.content).toMatch(/kein Text/i);
  });
  it("uebersetzt Vertragsfehler in Klartext, deutsch und wortgleich mit dem Stand vor dem Kit-Tausch", async () => {
    // Die Saetze kommen seit obsidian-kit 0.63.0 aus `ocrErrorText`; die Tabelle hier haelt fest, dass sich fuer Koda kein Wort aendert.
    const erwartet = {
      "backend-unavailable": "Texterkennung nicht verfügbar: m",
      "not-found": "Bild nicht gefunden: m",
      timeout: "Texterkennung hat zu lange gebraucht: m",
      busy: "Texterkennung ist beschäftigt, später erneut versuchen: m",
      unsupported: "Dieses Bildformat liest die Texterkennung nicht: m",
      failed: "Texterkennung fehlgeschlagen: m",
    } as const;
    for (const [error, text] of Object.entries(erwartet) as [keyof typeof erwartet, string][]) {
      const r = await ocrResult({ extractText: async () => ({ error, message: "m" }) }, "a.png");
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error).toBe(text);
    }
  });
  it("faengt einen werfenden Anbieter ab", async () => {
    const r = await ocrResult({ extractText: async () => { throw new Error("kaputt"); } }, "a.png");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("kaputt");
  });
});

describe("ocrResult: Hinweiszeile", () => {
  const api = { extractText: async () => "Rechnung 42" };
  it("nennt je Grund, dass nur Text ankommt", async () => {
    for (const why of ["no-vision", "too-big", "vision-failed"] as const) {
      const r = await ocrResult(api, "a.png", why);
      expect(r.ok && r.content).toMatch(/^Hinweis: .*OCR-Text/);
      expect(r.ok && r.content).toContain("Rechnung 42");
    }
  });
  it("ohne Grund bleibt die Ausgabe wie bisher", async () => {
    const r = await ocrResult(api, "a.png");
    expect(r.ok && r.content.startsWith("Text aus a.png")).toBe(true);
  });
});
