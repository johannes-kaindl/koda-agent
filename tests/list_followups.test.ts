import { describe, it, expect } from "vitest";
import { formatListResult, isFolderNote, suggestFolders, formatFieldValue, collectFolderNotes } from "../src/core/tools/list";

const row = (path: string, fields: Record<string, string> = {}) => ({ path, fields });

describe("Ordnernotizen sind erkennbar", () => {
  it("erkennt eine Notiz, die so heisst wie ihr Ordner", () => {
    expect(isFolderNote("_Tasks/_Tasks.md")).toBe(true);
    expect(isFolderNote("25_Coding/koda-agent/koda-agent.md")).toBe(true);
  });

  it("erkennt gewoehnliche Notizen NICHT als Ordnernotiz", () => {
    expect(isFolderNote("_Tasks/Irgendeine Aufgabe.md")).toBe(false);
    // In der Vault-Wurzel gibt es keinen Ordner, zu dem die Notiz gehoeren koennte.
    expect(isFolderNote("README.md")).toBe(false);
  });

  it("markiert die Zeile UND nennt die Zahl im Kopf", () => {
    const out = formatListResult({
      folder: "_Tasks", recursive: false, total: 2,
      rows: [row("_Tasks/_Tasks.md"), row("_Tasks/Aufgabe.md")],
    });
    // Genau der gemessene Fall: die Ordnernotiz wurde als 13. Aufgabe mitgezaehlt.
    expect(out).toContain("_Tasks/_Tasks.md (Ordnernotiz)");
    expect(out).toContain("davon 1 Ordnernotiz");
    expect(out).not.toContain("_Tasks/Aufgabe.md (Ordnernotiz)");
  });

  it("schweigt im Kopf, wenn keine Ordnernotiz dabei ist", () => {
    const out = formatListResult({ folder: "x", recursive: false, total: 1, rows: [row("x/a.md")] });
    expect(out).not.toContain("Ordnernotiz");
  });
});

describe("suggestFolders — Naehe zaehlt, nicht das Alphabet", () => {
  const vault = [
    "20_Projekte/26-001 Alpha/_Tasks/a.md",
    "20_Projekte/26-002 Beta/_Tasks/b.md",
    "20_Projekte/26-003 Gamma/_Tasks/c.md",
    "20_Projekte/26-004 Delta/_Tasks/d.md",
    "20_Projekte/26-009 Ziel/_Tasks/z.md",
    "20_Projekte/26-009 Ziel/_Meilensteine/m.md",
    "20_Projekte/26-009 Ziel/_Tasks-Archiv/alt.md",
  ];

  it("nennt bei einem Tippfehler zuerst die Ordner DESSELBEN Projekts", () => {
    // Der Schaden, gegen den das geht: alphabetisch kamen fuenf FREMDE Projekte zuerst,
    // und ein Modell, das einem folgt, listet die Aufgaben eines anderen Projekts.
    const s = suggestFolders(vault, "20_Projekte/26-009 Ziel/_Taskss");
    expect(s[0]).toBe("20_Projekte/26-009 Ziel/_Tasks");
  });

  it("bevorzugt bei gleichem Elternpfad den aehnlicheren Namen", () => {
    // "_Task" statt "_Taskss": nur so bestehen BEIDE Ordner den Substring-Vorfilter,
    // und erst dann entscheidet die Sortierung — sonst misst der Test den Filter.
    const s = suggestFolders(vault, "20_Projekte/26-009 Ziel/_Task");
    expect(s[0]).toBe("20_Projekte/26-009 Ziel/_Tasks");
    expect(s.indexOf("20_Projekte/26-009 Ziel/_Tasks"))
      .toBeLessThan(s.indexOf("20_Projekte/26-009 Ziel/_Tasks-Archiv"));
  });

  it("faellt ohne Pfadhinweis aufs Alphabet zurueck — und bleibt damit deterministisch", () => {
    const s = suggestFolders(vault, "_Tasks");
    expect(s[0]).toBe("20_Projekte/26-001 Alpha/_Tasks");
    expect(suggestFolders(vault, "_Tasks")).toEqual(s);
  });
});

describe("Trenner sind nicht mehrdeutig", () => {
  it("schuetzt einen Feldwert, der den Spaltentrenner enthaelt", () => {
    const out = formatListResult({
      folder: "x", recursive: false, total: 1,
      rows: [row("x/a.md", { titel: "Alpha · Beta" })],
    });
    expect(out).toContain('titel="Alpha · Beta"');
  });

  it("schuetzt einen Feldwert mit Gleichheitszeichen", () => {
    const out = formatListResult({
      folder: "x", recursive: false, total: 1, rows: [row("x/a.md", { formel: "a=b" })],
    });
    expect(out).toContain('formel="a=b"');
  });

  it("schuetzt einen PFAD, der den Spaltentrenner enthaelt", () => {
    const out = formatListResult({
      folder: "x", recursive: false, total: 1, rows: [row("x/Foo · Bar.md", { a: "1" })],
    });
    expect(out).toContain('"x/Foo · Bar.md" · a=1');
  });

  it("laesst harmlose Werte unangetastet", () => {
    const out = formatListResult({
      folder: "x", recursive: false, total: 1, rows: [row("x/a.md", { s: "offen" })],
    });
    expect(out).toContain("x/a.md · s=offen");
  });
});

describe("Unicode: dieselbe Schreibweise, andere Bytes", () => {
  it("findet Notizen, wenn Ordnername und Pfad verschieden normalisiert sind", () => {
    // macOS liefert Pfade als NFD von der Platte, ein Modell schreibt NFC.
    const nfd = "Bücher/Notiz.md";
    expect(collectFolderNotes([nfd], "Bücher", false)).toEqual([nfd]);
  });

  it("gibt den Pfad in der Original-Schreibweise zurueck, nicht normalisiert", () => {
    const nfd = "Bücher/Notiz.md";
    expect(collectFolderNotes([nfd], "Bücher", false)[0]).toBe(nfd);
  });

  it("schlaegt auch bei anderer Normalisierung passende Ordner vor", () => {
    expect(suggestFolders(["Bücher/x/a.md"], "Bücher/y")).toContain("Bücher/x");
  });
});

describe("Kappung zerschneidet keine Zeichen", () => {
  it("schneidet ein Surrogatpaar nicht in der Mitte durch", () => {
    const value = `${"a".repeat(119)}😀xyz`;
    const out = formatFieldValue(value);
    // Kein halbes Zeichen: was zurueckkommt, ist wieder als Codepoints lesbar.
    expect([...out].every((c) => c.codePointAt(0)! < 0xd800 || c.codePointAt(0)! > 0xdfff)).toBe(true);
    expect(out.endsWith("…")).toBe(true);
  });
});
