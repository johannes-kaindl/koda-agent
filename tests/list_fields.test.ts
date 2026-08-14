import { formatFieldValue, pickFields } from "../src/core/tools/list";

describe("formatFieldValue", () => {
  it("meldet fehlende und leere Werte als Gedankenstrich", () => {
    expect(formatFieldValue(undefined)).toBe("—");
    expect(formatFieldValue(null)).toBe("—");
    expect(formatFieldValue("")).toBe("—");
    expect(formatFieldValue("   ")).toBe("—");
    expect(formatFieldValue([])).toBe("—");
  });
  it("gibt Skalare unveraendert und Zahlen/Booleans als Text", () => {
    expect(formatFieldValue("1_backlog_📥")).toBe("1_backlog_📥");
    expect(formatFieldValue(3)).toBe("3");
    expect(formatFieldValue(false)).toBe("false");
  });
  it("verbindet Listen mit Komma", () => {
    expect(formatFieldValue(["@rechner", "@buero"])).toBe("@rechner, @buero");
  });
  it("laesst Wikilinks unangetastet — sie sind der Fall, den eine Gegenprobe pruefen muss", () => {
    expect(formatFieldValue("[[20_Projekte/P/P|P]]")).toBe("[[20_Projekte/P/P|P]]");
  });
  it("kollabiert Zeilenumbrueche zu Leerzeichen", () => {
    expect(formatFieldValue("a\nb\n  c")).toBe("a b c");
  });
  it("kuerzt bei 120 Zeichen mit Auslassungszeichen", () => {
    const out = formatFieldValue("x".repeat(200));
    expect(out).toHaveLength(121);
    expect(out.endsWith("…")).toBe(true);
  });
  it("stellt verschachtelte Objekte als Platzhalter dar statt sie auszuschreiben", () => {
    expect(formatFieldValue({ a: 1 })).toBe("{…}");
  });
  it("stellt auch Funktionen als Platzhalter dar — kein Skalar, kein Array", () => {
    expect(formatFieldValue(() => 1)).toBe("{…}");
  });
});

describe("pickFields", () => {
  it("liefert genau die angeforderten Felder in der angeforderten Reihenfolge", () => {
    const fm = { status: "offen", priority: 2, extra: "ignoriert" };
    expect(pickFields(fm, ["priority", "status"])).toEqual({ priority: "2", status: "offen" });
  });
  it("liefert fuer fehlendes Frontmatter alle Felder als Gedankenstrich", () => {
    expect(pickFields(null, ["status"])).toEqual({ status: "—" });
  });
  it("liefert ohne angeforderte Felder ein leeres Objekt", () => {
    expect(pickFields({ status: "offen" }, [])).toEqual({});
  });
});
