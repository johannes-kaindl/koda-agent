import { describe, it, expect } from "vitest";
import { sourceChips } from "../src/core/context/labels";
import type { ContextAttachment } from "../src/core/context/types";

const ctx: ContextAttachment = {
  mode: "note",
  text: "…",
  items: [
    { source: "active", path: "Notes/A.md", kind: "full", chars: 500 },
    { source: "link", path: "Notes/B.md", kind: "full", chars: 200, fullChars: 900, depth: 1 },
    { source: "tab", path: "Notes/C.md", kind: "pointer", chars: 11 },
  ],
};

describe("sourceChips", () => {
  it("nimmt nur Volltext-Eintraege — Zeiger stehen schon in der Kontextzeile", () => {
    expect(sourceChips(ctx).map((c) => c.path)).toEqual(["Notes/A.md", "Notes/B.md"]);
  });

  it("beschriftet mit dem Dateinamen ohne Ordner und ohne .md", () => {
    expect(sourceChips(ctx)[0]?.label).toBe("A");
  });

  it("meldet die tatsaechlich gesendete Zeichenzahl, nicht die volle", () => {
    expect(sourceChips(ctx)[1]?.chars).toBe(200);
  });

  it("liefert fuer einen reinen Zeiger-Block eine leere Liste", () => {
    const nur: ContextAttachment = { mode: "workspace", text: "…", items: [ctx.items[2]!] };
    expect(sourceChips(nur)).toEqual([]);
  });
});
