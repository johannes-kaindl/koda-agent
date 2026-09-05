/* Die Komposition: Kandidaten → Abwahl → lesen → Budget → rendern.
 * Zwei Zusicherungen tragen den Rest: gefiltert wird VOR dem Lesen (eine abgewaehlte
 * Notiz kostet keinen Dateizugriff), und nicht lesbare Notizen fallen still heraus. */
import { describe, it, expect, vi } from "vitest";
import { buildFullContext } from "../src/core/context/build";
import { itemKey } from "../src/core/context/selection";
import type { LinkPort, WorkspaceSnapshot } from "../src/core/context/ports";

const links: LinkPort = { outgoing: (p) => (p === "A.md" ? ["B.md"] : []), backlinks: () => [] };

const snap: WorkspaceSnapshot = {
  active: { path: "A.md", frontmatter: null, selection: "", cursorLine: 1, lineCount: 1 },
  tabs: [{ path: "A.md", viewType: "markdown" }, { path: "T.md", viewType: "markdown" }],
};

function inhalt(map: Record<string, string | null>) {
  return { read: vi.fn((p: string) => Promise.resolve(map[p] ?? null)) };
}

describe("buildFullContext", () => {
  it("legt aktive Notiz und verlinkte Nachbarn in den Block", async () => {
    const content = inhalt({ "A.md": "Text A", "B.md": "Text B" });
    const ctx = await buildFullContext({
      mode: "note", snap, links, content, manual: [], off: new Set(),
      linkDepth: 1, budget: 10000, lang: "de",
    });
    expect(ctx.items.map((i) => i.path)).toEqual(["A.md", "B.md"]);
    expect(ctx.text).toContain("Text A");
    expect(ctx.text).toContain("Text B");
  });

  it("laesst einen abgewaehlten Eintrag heraus — und liest ihn gar nicht erst", async () => {
    const content = inhalt({ "A.md": "Text A", "B.md": "Text B" });
    const ctx = await buildFullContext({
      mode: "note", snap, links, content, manual: [], off: new Set([itemKey("link", "B.md")]),
      linkDepth: 1, budget: 10000, lang: "de",
    });
    expect(ctx.items.map((i) => i.path)).toEqual(["A.md"]);
    expect(content.read).not.toHaveBeenCalledWith("B.md");
  });

  it("laesst eine nicht lesbare Notiz still fallen", async () => {
    const content = inhalt({ "A.md": "Text A", "B.md": null });
    const ctx = await buildFullContext({
      mode: "note", snap, links, content, manual: [], off: new Set(),
      linkDepth: 1, budget: 10000, lang: "de",
    });
    expect(ctx.items.map((i) => i.path)).toEqual(["A.md"]);
  });

  it("wendet das Budget an und meldet die Kuerzung", async () => {
    const content = inhalt({ "A.md": "x".repeat(5000), "B.md": "y".repeat(5000) });
    const ctx = await buildFullContext({
      mode: "note", snap, links, content, manual: [], off: new Set(),
      linkDepth: 1, budget: 2000, lang: "de",
    });
    expect(ctx.items.every((i) => i.fullChars === 5000)).toBe(true);
    expect(ctx.text).toContain("gekürzt: 1000 von 5000 Zeichen");
  });

  it("nimmt im Modus Alle Tabs die Tabs statt der Links", async () => {
    const content = inhalt({ "A.md": "a", "T.md": "t", "B.md": "b" });
    const ctx = await buildFullContext({
      mode: "tabs", snap, links, content, manual: [], off: new Set(),
      linkDepth: 3, budget: 10000, lang: "de",
    });
    expect(ctx.items.map((i) => i.path)).toEqual(["A.md", "T.md"]);
  });
});
