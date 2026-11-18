/**
 * Linearität der Funktionen, die Modell-, Vault- oder Fremdtext zerlegen (ReDoS-Konvention, CORE-TEST-26 (b)): der erschöpfende Fuzz `pruefeLinearFuzz`
 * aus dem Kit-Testmodul, dazu feste Eingaben für die Stellen, die er nicht erreicht. Gemessen wird ein Quotient t(50 000)/t(10 000), keine Millisekunden.
 *
 * Geprüft sind die Wege, auf denen Text von außen in den Kern kommt: die Antwort des Modells (`parseTextToolCall`, `decodeByteTokens`), Frontmatter-Werte
 * aus dem Vault (`formatFieldValue`, `pickFields`, `cell`), die Memory-Datei (`appendMemoryLine`), das Sitzungsprotokoll (`parseLines`), Skill-Dateien
 * (`parseSkill`, `cleanSkillRef`, `sanitizeSkillName`) und die Eingaben des Modells für Pfade und Verweise (`resolveNotePath`, `resolveFolderPath`, `parseBaseRef`).
 *
 * Nicht Gegenstand: `firstJsonObject`, `decodeKit`, `normalizeRelPath` und `parseFrontmatter` (Kit, dort mit eigenem Fuzz oder Linearitätstest).
 * Die Gegenprobe (eine absichtlich quadratische Fassung wird rot) steht am Ende dieser Datei.
 */
import { describe, expect, it } from "vitest";
import { pruefeLinear, pruefeLinearFuzz } from "./vendor/kit/linear-probe";
import { parseTextToolCall } from "../src/core/agent/text-fallback";
import { decodeByteTokens } from "../src/core/tools/decode-byte-tokens";
import { cell, formatFieldValue, pickFields } from "../src/core/tools/list";
import { appendMemoryLine } from "../src/core/memory/memory";
import { parseLines } from "../src/core/memory/session";
import { parseSkill } from "../src/core/skills/skill";
import { cleanSkillRef } from "../src/core/skills/load";
import { sanitizeSkillName } from "../src/core/skills/path";
import { resolveFolderPath, resolveNotePath } from "../src/core/tools/path-guard";
import { parseBaseRef } from "../src/core/abilities/base-ref";
import { PLACEHOLDER_FOLDER, PLACEHOLDER_LANG, renderRules } from "../src/core/prompt/rules";

const FUZZ_MS = 180_000;

/** Befund als lesbarer Text, damit eine rote Zeile ohne Nachlesen verständlich ist (CORE-TEST-14). */
const befund = (r: { verdaechtig: ReadonlyArray<{ message: string }> }): string => r.verdaechtig.map((v) => v.message).join("\n");
const fuzz = (fn: (s: string) => unknown, alphabet: readonly string[], maxLaenge = 3): void => {
  const f = pruefeLinearFuzz(fn, { alphabet, maxLaenge });
  expect(f.linear, befund(f)).toBe(true);
  // Eine Bilanz ohne Messung ist kein Erfolg (CORE-TEST-19).
  expect(f.gemessen, "der Fuzz hat Eingaben gemessen").toBeGreaterThan(20);
};

describe("Antwort des Modells", () => {
  it("parseTextToolCall: Fuzz über Think-Marken, Zäune, Klammern, Anführungszeichen", () => {
    fuzz(parseTextToolCall, ["<think>", "</think>", "```json\n", "```\n", "{", "}", '"', "\\"]);
  }, FUZZ_MS);

  it("decodeByteTokens: Fuzz über Byte-Marken und Zeilenumbruch", () => {
    fuzz(decodeByteTokens, ["<0x", ">", "E2", "<0xE2>", "<0x80>", "\n", "a"]);
  }, FUZZ_MS);
});

describe("Vault-Text: Frontmatter-Werte, Memory, Protokoll, Skills", () => {
  it("formatFieldValue: Fuzz über Leerraum, Zeilenumbruch, Wagenrücklauf und Text (Wert aus dem Vault)", () => {
    // `x` am Anfang und Ende: sonst schneidet `trim()` den Lauf ab, bevor die Zerlegung ihn sieht (Schritt 1 der Konvention).
    fuzz((s) => formatFieldValue(`x${s}x`), [" ", "\t", "\n", "\r\n", "x", "·"]);
    fuzz((s) => formatFieldValue([`x${s}x`, "y"]), [" ", "\n", "x"]);
  }, FUZZ_MS);

  it("pickFields und cell: Fuzz über Anführungszeichen, Trenner und Text", () => {
    fuzz((s) => cell(s), ['"', "·", "=", "x", " "]);
    fuzz((s) => pickFields({ a: `x${s}x` }, ["a", s]), [" ", "\n", '"', "x"], 2);
  }, FUZZ_MS);

  it("appendMemoryLine: lange Zeilenumbruch-Läufe in der vorhandenen Memory-Datei", () => {
    // `existing` ist die ganze Datei des Nutzers; der Lauf steht mitten im Text, nicht am Ende (sonst trifft `$` sofort).
    fuzz((s) => appendMemoryLine(`# Memory\n${s}\n- Eintrag`, "text", "2026-11-18"), ["\n", " ", "x", "-"]);
    fuzz((s) => appendMemoryLine(s, "text", "2026-11-18"), ["\n", "x", " "]);
  }, FUZZ_MS);

  it("parseLines: Fuzz über JSON-Zeichen und Zeilenumbruch (Sitzungsprotokoll)", () => {
    // Zwei Einträge je Einheit: jede Zeile geht durch `JSON.parse`, drei Einträge kosteten rund 110 s im Gate.
    fuzz(parseLines, ['{"role":"user","content":"', '"}', "\n", "{", "}", '"'], 2);
  }, FUZZ_MS);

  it("parseSkill, cleanSkillRef und sanitizeSkillName: Fuzz über Frontmatter-Zäune, Doppelpunkt, Trenner und Punkte", () => {
    fuzz((s) => parseSkill("n", s), ["---\n", "description: x\n", "\n", ":", " ", "x", "-"]);
    fuzz(cleanSkillRef, [".md", " ", "/", "\\", "..", "x"]);
    fuzz(sanitizeSkillName, [".md", " ", ":", "*", "?", "x", "#"]);
  }, FUZZ_MS);

  it("parseSkill: lange Leerraum- und Zeilenfolgen im Rumpf bleiben linear", () => {
    for (const einheit of [" ", "\n", "\r\n", "- ", ": "]) {
      const r = pruefeLinear((s: string) => parseSkill("n", s), (n) => `---\ndescription: x\n---\n${einheit.repeat(n)}x`);
      expect(r.linear, `${JSON.stringify(einheit)}: ${r.message}`).toBe(true);
    }
  });
});

describe("Eingaben des Modells für Pfade, Verweise und Regeln", () => {
  it("resolveNotePath und resolveFolderPath: Fuzz über Trenner, Punkte, Leerraum", () => {
    fuzz(resolveNotePath, ["/", "\\", "..", ".", " ", ".md", "x"]);
    fuzz(resolveFolderPath, ["/", "\\", "..", ".", " ", "x"]);
  }, FUZZ_MS);

  it("parseBaseRef: Fuzz über Raute, Endung, Leerraum", () => {
    fuzz(parseBaseRef, ["#", ".base", " ", "x"]);
  }, FUZZ_MS);

  it("renderRules: Platzhalter, Schrägstriche am Ende des Ordners", () => {
    fuzz((s) => renderRules(`${PLACEHOLDER_LANG} ${PLACEHOLDER_FOLDER}`, { lang: "de", folder: `x${s}x` }), ["/", "x", " "]);
    fuzz((s) => renderRules(s, { lang: "en", folder: "Koda" }), [PLACEHOLDER_LANG, PLACEHOLDER_FOLDER, "{{", "}}", "x"]);
  }, FUZZ_MS);
});

describe("Verhalten unverändert: die linearen Fassungen liefern, was die alten Regexe lieferten", () => {
  // Das Orakel ist die frühere Fassung. Kurze Zeichenfolgen aus dem Alphabet der Fälle, die den Unterschied ausmachen (Leerraum mit und ohne Zeilenumbruch, Schrägstriche).
  const alle = (alphabet: readonly string[], maxLaenge: number): string[] => {
    let stufe: string[] = [""];
    const out: string[] = [""];
    for (let i = 0; i < maxLaenge; i++) {
      stufe = stufe.flatMap((v) => alphabet.map((z) => v + z));
      out.push(...stufe);
    }
    return out;
  };

  it("formatFieldValue: wie `replace(/\\s*\\r?\\n\\s*/g, \" \").trim()` (die Zeichenfolgen bleiben unter der Kürzungsgrenze)", () => {
    for (const s of alle([" ", "\t", "\n", "\r", "a"], 6)) {
      const alt = s.replace(/\s*\r?\n\s*/g, " ").trim();
      expect(formatFieldValue(s), JSON.stringify(s)).toBe(alt === "" ? "—" : alt);
    }
  });

  it("appendMemoryLine: wie `replace(/\\n*$/, \"\\n\")`", () => {
    for (const s of alle(["\n", " ", "a"], 6)) {
      const erwartet = s.trim() === "" ? undefined : `${s.replace(/\n*$/, "\n")}- [d] t\n`;
      if (erwartet !== undefined) expect(appendMemoryLine(s, "t", "d"), JSON.stringify(s)).toBe(erwartet);
    }
  });

  it("renderRules: wie `replace(/\\/+$/, \"\")` am Ordner", () => {
    for (const s of alle(["/", "a", " "], 6)) {
      expect(renderRules(PLACEHOLDER_FOLDER, { lang: "de", folder: s }), JSON.stringify(s)).toBe(s.replace(/\/+$/, ""));
    }
  });
});

describe("Gegenprobe: der Fuzz kann rot werden (CORE-TEST-01)", () => {
  /** Absichtlich quadratisch: dieselbe Form wie `existing.replace(/\n*$/, "\n")` in der Fassung vor dem Fix (Lauf von Zeilenumbrüchen mitten im Text). */
  const quadratisch = (s: string): string => s.replace(/\n*$/, "\n");

  it("pruefeLinearFuzz meldet die quadratische Form als Verdacht", () => {
    const f = pruefeLinearFuzz((s) => quadratisch(`#\n${s}\n- Eintrag`), { alphabet: ["\n", "x"], maxLaenge: 1, verschachtelt: false });
    expect(f.linear).toBe(false);
    expect(f.verdaechtig.map((v) => v.einheit)).toContain("\n");
  }, FUZZ_MS);
});
