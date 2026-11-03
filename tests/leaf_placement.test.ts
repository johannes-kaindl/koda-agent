import { describe, it, expect } from "vitest";
import { chatPlacement } from "../src/core/chat/leaf-placement";

describe("chatPlacement — wo Koda öffnet (Entscheidung Johannes 2026-11-02: alle Mobilgeräte im Hauptbereich)", () => {
  it("ein schon geöffneter Chat bleibt, wo er ist — auf dem Desktop wie am Handy", () => {
    expect(chatPlacement({ hasExisting: true, isMobile: false })).toBe("existing");
    expect(chatPlacement({ hasExisting: true, isMobile: true })).toBe("existing");
  });

  it("Desktop: ohne offenen Chat die rechte Seitenleiste (unverändert)", () => {
    expect(chatPlacement({ hasExisting: false, isMobile: false })).toBe("side");
  });

  it("Handy und Tablet: ohne offenen Chat ein Tab im Hauptbereich, nicht die Schublade", () => {
    expect(chatPlacement({ hasExisting: false, isMobile: true })).toBe("tab");
  });
});
