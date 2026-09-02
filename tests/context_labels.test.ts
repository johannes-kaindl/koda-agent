import { contextSummary, modeLabel } from "../src/core/context/labels";
import type { ContextAttachment } from "../src/core/context/types";

describe("modeLabel", () => {
  it("benennt jeden Modus in beiden Sprachen", () => {
    expect(modeLabel("workspace", "de")).toBe("Arbeitsplatz");
    expect(modeLabel("workspace", "en")).toBe("Workspace");
    expect(modeLabel("off", "de")).toBe("Aus");
    expect(modeLabel("vault", "en")).toBe("Vault");
  });
});

describe("contextSummary", () => {
  const ctx: ContextAttachment = {
    mode: "workspace",
    items: [
      { source: "active", path: "Notes/Project plan.md", kind: "pointer", chars: 30 },
      { source: "selection", path: "Notes/Project plan.md", kind: "pointer", chars: 312, fullChars: 1240 },
      { source: "tab", path: "Notes/Tools.md", kind: "pointer", chars: 14 },
      { source: "tab", path: "Notes/Compaction.md", kind: "pointer", chars: 19 },
    ],
    text: "…",
  };
  it("eine Zeile: Modus, aktive Notiz ohne Pfad und Endung, Markierung, Tab-Zahl", () => {
    expect(contextSummary(ctx, "de")).toBe("Arbeitsplatz · Project plan · Markierung 312 Z. · 2 Tabs");
    expect(contextSummary(ctx, "en")).toBe("Workspace · Project plan · selection 312 chars · 2 tabs");
  });
  it("ohne aktive Notiz und ohne Tabs bleibt nur der Modus", () => {
    expect(contextSummary({ mode: "workspace", items: [], text: "" }, "de")).toBe("Arbeitsplatz");
  });
});
