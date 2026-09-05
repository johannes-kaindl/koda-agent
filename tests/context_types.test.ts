import { AVAILABLE_MODES, CONTEXT_MODES, isContextAttachment, isContextMode, type ContextAttachment } from "../src/core/context/types";

const ok: ContextAttachment = {
  mode: "workspace",
  items: [{ source: "active", path: "Notes/Plan.md", kind: "pointer", chars: 40 }],
  text: "[Arbeitskontext · Arbeitsplatz]\nAktive Notiz: Notes/Plan.md",
};

describe("isContextAttachment", () => {
  it("nimmt ein vollstaendiges Feld an", () => {
    expect(isContextAttachment(ok)).toBe(true);
  });
  it("lehnt off als Modus ab — ein Feld mit Modus Aus darf es nicht geben", () => {
    expect(isContextAttachment({ ...ok, mode: "off" })).toBe(false);
  });
  it("lehnt kaputte Formen ab: null, fehlender Text, Item ohne Pfad, unbekannter Modus", () => {
    expect(isContextAttachment(null)).toBe(false);
    expect(isContextAttachment({ mode: "workspace", items: [] })).toBe(false);
    expect(isContextAttachment({ ...ok, items: [{ source: "active", kind: "pointer", chars: 1 }] })).toBe(false);
    expect(isContextAttachment({ ...ok, mode: "galaxy" })).toBe(false);
  });
  it("optionale Felder duerfen fehlen oder gesetzt sein", () => {
    expect(isContextAttachment({ ...ok, items: [{ ...ok.items[0], fullChars: 900, depth: 1, via: "x.base" }] })).toBe(true);
  });
});

describe("Modi", () => {
  it("kennt fuenf Modi, off zuerst", () => {
    expect(CONTEXT_MODES[0]).toBe("off");
    expect(CONTEXT_MODES).toHaveLength(5);
    expect(isContextMode("vault")).toBe(true);
    expect(isContextMode("vaults")).toBe(false);
  });
});

describe("AVAILABLE_MODES", () => {
  it("bietet nach Etappe 2b vier Modi an", () => {
    expect([...AVAILABLE_MODES]).toEqual(["off", "workspace", "note", "tabs"]);
  });

  it("bietet den Vault-Modus noch nicht an — er braucht vault-rag und kommt in Etappe 3", () => {
    expect(AVAILABLE_MODES).not.toContain("vault");
    expect(CONTEXT_MODES).toContain("vault");
  });
});
