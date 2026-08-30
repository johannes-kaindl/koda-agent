import { describe, it, expect } from "vitest";
import { splitStable } from "../src/core/chat/stream-blocks";

describe("splitStable — Schnitt an der letzten Absatzgrenze", () => {
  it("ohne Absatzgrenze bleibt alles im Schwanz", () => {
    expect(splitStable("Ein angefangener Satz")).toEqual({ stable: "", tail: "Ein angefangener Satz" });
  });

  it("leerer Text ergibt zwei leere Haelften", () => {
    expect(splitStable("")).toEqual({ stable: "", tail: "" });
  });

  it("schneidet nach dem ersten abgeschlossenen Absatz", () => {
    expect(splitStable("Erster Absatz.\n\nZweiter halb")).toEqual({
      stable: "Erster Absatz.\n\n",
      tail: "Zweiter halb",
    });
  });

  it("schneidet an der LETZTEN Grenze, nicht an der ersten", () => {
    expect(splitStable("A\n\nB\n\nC halb")).toEqual({ stable: "A\n\nB\n\n", tail: "C halb" });
  });

  it("mehr als zwei Zeilenumbrueche gehoeren ganz zum stabilen Teil", () => {
    expect(splitStable("A\n\n\n\nB")).toEqual({ stable: "A\n\n\n\n", tail: "B" });
  });

  it("endet der Text auf einer Grenze, ist der Schwanz leer", () => {
    expect(splitStable("Fertig.\n\n")).toEqual({ stable: "Fertig.\n\n", tail: "" });
  });

  it("eine einzelne Zeilenschaltung ist keine Grenze (Listen bleiben zusammen)", () => {
    expect(splitStable("- eins\n- zwei\n- dr")).toEqual({ stable: "", tail: "- eins\n- zwei\n- dr" });
  });
});

// Der Fall, der die Regel traegt: waehrend ein Codeblock laeuft, darf NICHT geschnitten
// werden — sonst rendert die Haelfte eines Fence als Absatz und der Rest nie wieder als Code.
describe("splitStable — offener Codeblock ist keine Grenze", () => {
  it("Leerzeile INNERHALB eines offenen Fence schneidet nicht", () => {
    const text = "Hier:\n\n```ts\nconst a = 1;\n\nconst b = 2;";
    expect(splitStable(text)).toEqual({ stable: "Hier:\n\n", tail: "```ts\nconst a = 1;\n\nconst b = 2;" });
  });

  it("nach dem schliessenden Fence darf wieder geschnitten werden", () => {
    const text = "Hier:\n\n```ts\nconst a = 1;\n```\n\nUnd weiter";
    expect(splitStable(text)).toEqual({
      stable: "Hier:\n\n```ts\nconst a = 1;\n```\n\n",
      tail: "Und weiter",
    });
  });

  it("ein Fence mit Sprache zaehlt genauso wie einer ohne", () => {
    const text = "```\nroh\n\nweiter";
    expect(splitStable(text)).toEqual({ stable: "", tail: "```\nroh\n\nweiter" });
  });

  it("Tilde-Fences zaehlen ebenfalls", () => {
    const text = "Vorwort\n\n~~~\ncode\n\nnoch code";
    expect(splitStable(text)).toEqual({ stable: "Vorwort\n\n", tail: "~~~\ncode\n\nnoch code" });
  });

  it("eingerueckter Fence schliesst den Block trotzdem", () => {
    const text = "- Punkt\n\n  ```\n  code\n  ```\n\nDanach";
    expect(splitStable(text)).toEqual({ stable: "- Punkt\n\n  ```\n  code\n  ```\n\n", tail: "Danach" });
  });

  it("zwei abgeschlossene Bloecke: Schnitt hinter dem zweiten", () => {
    const text = "```\neins\n```\n\n```\nzwei\n```\n\nRest";
    expect(splitStable(text)).toEqual({ stable: "```\neins\n```\n\n```\nzwei\n```\n\n", tail: "Rest" });
  });
});

describe("splitStable — die Halbierung verliert nichts", () => {
  for (const text of [
    "",
    "abc",
    "a\n\nb",
    "a\n\n```\nx\n\ny",
    "```\nx\n```\n\nnach",
    "A\n\nB\n\nC\n\n",
  ]) {
    it(`stable + tail ergibt den Ausgangstext: ${JSON.stringify(text)}`, () => {
      const { stable, tail } = splitStable(text);
      expect(stable + tail).toBe(text);
    });
  }
});
