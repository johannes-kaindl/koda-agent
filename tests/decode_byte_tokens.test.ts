import { decodeByteTokens } from "../src/core/tools/decode-byte-tokens";

describe("decodeByteTokens", () => {
  it("laesst Text ohne Byte-Token unveraendert", () => {
    expect(decodeByteTokens("Hallo Welt <b>fett</b> 0xF0")).toEqual({ ok: true, text: "Hallo Welt <b>fett</b> 0xF0" });
  });

  // Beleg 1: _Koda/Skills/koda-start.md im Vault Arbeit — U+1F5C2 als Byte-Folge.
  it("wandelt vier UTF-8-Bytes in das Emoji U+1F5C2", () => {
    expect(decodeByteTokens("Ordner <0xF0><0x9F><0x97><0x82> Start")).toEqual({ ok: true, text: "Ordner \u{1F5C2} Start" });
  });

  // Beleg 2: koda-dashboard.md — drei Bytes, U+202F (schmales geschuetztes Leerzeichen).
  it("wandelt drei UTF-8-Bytes in U+202F", () => {
    expect(decodeByteTokens("name: Koda<0xE2><0x80><0xAF>Dashboard")).toEqual({ ok: true, text: "name: Koda Dashboard" });
  });

  it("erkennt Gross- und Kleinschreibung der Hex-Ziffern", () => {
    expect(decodeByteTokens("<0xf0><0x9f><0x97><0x82>")).toEqual({ ok: true, text: "\u{1F5C2}" });
  });

  it("dekodiert mehrere getrennte Folgen einzeln", () => {
    expect(decodeByteTokens("a<0xC3><0xA4>b<0xC3><0xB6>c")).toEqual({ ok: true, text: "aäböc" });
  });

  // Nicht still reparieren: eine abgeschnittene Folge ist kein Zeichen.
  it("lehnt eine unvollstaendige Folge ab und nennt Stelle und Folge", () => {
    const r = decodeByteTokens("Zeile eins\nZeile <0xF0><0x9F> zwei");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("<0xF0><0x9F>");
      expect(r.error).toContain("Zeile 2");
    }
  });

  it("lehnt ein einzelnes Fortsetzungsbyte ab", () => {
    expect(decodeByteTokens("x<0x82>y").ok).toBe(false);
  });

  it("meldet bei mehreren Folgen die erste fehlerhafte", () => {
    const r = decodeByteTokens("<0xC3><0xA4> ok, dann <0xE2><0x80> kaputt");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("<0xE2><0x80>");
  });

  it("fasst <0x..> mit Nicht-Hex oder falscher Laenge nicht an", () => {
    expect(decodeByteTokens("<0xZZ> <0x1> <0x123>")).toEqual({ ok: true, text: "<0xZZ> <0x1> <0x123>" });
  });

  // Entscheidung Master: dokumentierte ASCII-Token (Notiz ueber Hex) bleiben stehen.
  it("laesst eine Folge, die nur zu ASCII dekodieren wuerde, literal", () => {
    expect(decodeByteTokens("Zeilenumbruch ist <0x0A>, A ist <0x41><0x42>")).toEqual({
      ok: true,
      text: "Zeilenumbruch ist <0x0A>, A ist <0x41><0x42>",
    });
  });

  it("laesst fuehrende ASCII-Token stehen und dekodiert ab dem ersten Byte >= 0x80", () => {
    expect(decodeByteTokens("<0x41><0xC3><0xA4>")).toEqual({ ok: true, text: "<0x41>ä" });
  });

  it("meldet bei einer Folge mit ASCII-Vorspann nur den dekodierten Teil als fehlerhaft", () => {
    const r = decodeByteTokens("<0x41><0xF0><0x9F>");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("<0xF0><0x9F>");
  });
});
