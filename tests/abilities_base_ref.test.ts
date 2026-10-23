import { checkBaseView, parseBaseRef } from "../src/core/abilities/base-ref";

describe("parseBaseRef", () => {
  it("trennt Pfad und Ansicht am ersten #", () => {
    expect(parseBaseRef("Bases/Inbox.base#Neu")).toEqual({ path: "Bases/Inbox.base", view: "Neu" });
    expect(parseBaseRef(" Bases/Inbox.base # Neu #2 ")).toEqual({ path: "Bases/Inbox.base", view: "Neu #2" });
  });
  it("lehnt Verweise ohne Ansicht, ohne Pfad oder ohne .base ab", () => {
    expect(parseBaseRef("Bases/Inbox.base")).toBeNull();
    expect(parseBaseRef("Bases/Inbox.base#")).toBeNull();
    expect(parseBaseRef("#Neu")).toBeNull();
    expect(parseBaseRef("Notes/Inbox.md#Neu")).toBeNull();
  });
});

describe("checkBaseView", () => {
  const yaml = { views: [{ type: "table", name: "Alle" }, { type: "koda-context", name: "Neu" }] };
  it("ok nur für eine Ansicht dieses Namens vom Typ koda-context", () => {
    expect(checkBaseView(yaml, "Neu")).toBe("ok");
    expect(checkBaseView(yaml, "Alle")).toBe("wrong-type");
    expect(checkBaseView(yaml, "Fehlt")).toBe("missing");
  });
  it("kein views-Feld oder kein Objekt heißt missing", () => {
    expect(checkBaseView({ filters: {} }, "Neu")).toBe("missing");
    expect(checkBaseView(null, "Neu")).toBe("missing");
    expect(checkBaseView("text", "Neu")).toBe("missing");
  });
});
