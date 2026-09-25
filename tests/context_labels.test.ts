import { contextSummary, modeLabel, modeOptions } from "../src/core/context/labels";
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
  it("eine Zeile: Modus, aktive Notiz ohne Pfad und Endung, Markierung (Originallaenge, gekuerzt-Hinweis), Tab-Zahl", () => {
    // sel.chars ist 312 (nach Kuerzung), fullChars 1240 (davor) — die Zeile nennt die
    // ORIGINALLAENGE: was der Nutzer markiert hat, nicht was im Block ankam.
    expect(contextSummary(ctx, "de")).toBe("Arbeitsplatz · Project plan · Markierung 1240 Z. (gekürzt) · 2 Tabs");
    expect(contextSummary(ctx, "en")).toBe("Workspace · Project plan · selection 1240 chars (cut) · 2 tabs");
  });
  it("ohne aktive Notiz und ohne Tabs bleibt nur der Modus", () => {
    expect(contextSummary({ mode: "workspace", items: [], text: "" }, "de")).toBe("Arbeitsplatz");
  });
  it("genau ein Tab: Singular statt '1 Tabs'", () => {
    const one: ContextAttachment = {
      mode: "workspace",
      items: [{ source: "tab", path: "Notes/Tools.md", kind: "pointer", chars: 14 }],
      text: "…",
    };
    expect(contextSummary(one, "de")).toBe("Arbeitsplatz · 1 Tab");
    expect(contextSummary(one, "en")).toBe("Workspace · 1 tab");
  });
});

describe("modeOptions", () => {
  it("sperrt Vault ohne vault-rag und sagt warum", () => {
    const opts = modeOptions("de", false);
    const vault = opts.find((o) => o.value === "vault");
    expect(vault).toEqual({ value: "vault", label: "Vault (braucht vault-rag)", disabled: true });
    expect(opts.filter((o) => o.disabled)).toHaveLength(1);
  });
  it("gibt Vault mit vault-rag frei", () => {
    expect(modeOptions("en", true).find((o) => o.value === "vault")).toEqual({ value: "vault", label: "Vault", disabled: false });
  });
});
