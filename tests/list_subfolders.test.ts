import { collectSubfolders, folderExists, formatListResult, formatEmptyFolder } from "../src/core/tools/list";

// Nachgestellt ist der Fall vom 2026-09-25: `list_notes("_Koda")` meldete „4 von 4 Notizen",
// verschwieg die drei bewohnten Unterordner, und Koda schloss daraus, sie existierten nicht.
const NOTES = [
  "_Koda/_Koda.md",
  "_Koda/Memory.md",
  "_Koda/Brain/Brain.md",
  "_Koda/Brain/Patterns.md",
  "_Koda/Brain/Tief/X.md",
  "_Koda/Lab/Lab.md",
  "Anderes/Y.md",
];
// Ordner ohne eine einzige Notiz kennt nur die Ordnerliste des Vaults — aus Notizpfaden sind
// sie nicht ableitbar. `Sessions` steht fuer den echten Fall: dort liegen JSONL-Dateien, also
// ist der Ordner nicht LEER, er enthaelt nur keine Notiz.
const FOLDERS = ["_Koda", "_Koda/Brain", "_Koda/Brain/Tief", "_Koda/Lab", "_Koda/Sessions", "_Koda/Brain/Leer", "Anderes"];

describe("collectSubfolders", () => {
  it("nennt flach die direkten Unterordner mit ihrer Notizzahl darunter, alphabetisch", () => {
    expect(collectSubfolders(NOTES, FOLDERS, "_Koda", false)).toEqual([
      { path: "_Koda/Brain", notes: 3 },
      { path: "_Koda/Lab", notes: 1 },
      { path: "_Koda/Sessions", notes: 0 },
    ]);
  });
  it("findet Unterordner auch ohne Ordnerliste, sofern Notizen darin liegen", () => {
    expect(collectSubfolders(NOTES, [], "_Koda", false).map((s) => s.path)).toEqual(["_Koda/Brain", "_Koda/Lab"]);
  });
  it("nennt rekursiv nur die Ordner ohne Notiz — alle anderen stehen schon in den Pfaden", () => {
    expect(collectSubfolders(NOTES, FOLDERS, "_Koda", true)).toEqual([
      { path: "_Koda/Brain/Leer", notes: 0 },
      { path: "_Koda/Sessions", notes: 0 },
    ]);
  });
  it("behandelt die Vault-Wurzel als Ordner", () => {
    expect(collectSubfolders(NOTES, FOLDERS, "", false).map((s) => s.path)).toEqual(["Anderes", "_Koda"]);
  });
  it("verwechselt kein Praefix mit einem Ordner (_Koda2 ist kein Kind von _Koda)", () => {
    expect(collectSubfolders(["_Koda2/A.md"], ["_Koda", "_Koda2"], "_Koda", false)).toEqual([]);
  });
  it("vergleicht NFC-normalisiert, gibt aber den Originalpfad aus", () => {
    const nfd = "Bücher";
    expect(collectSubfolders([`${nfd}/Neu/a.md`], [nfd, `${nfd}/Neu`], "Bücher", false))
      .toEqual([{ path: `${nfd}/Neu`, notes: 1 }]);
  });
  it("ignoriert den Wurzel-Eintrag, den Obsidian als \"/\" fuehren kann", () => {
    expect(collectSubfolders([], ["/", "A"], "", false)).toEqual([{ path: "A", notes: 0 }]);
  });
});

describe("folderExists", () => {
  it("kennt Ordner aus der Ordnerliste und aus Notizpfaden", () => {
    expect(folderExists(NOTES, FOLDERS, "_Koda/Sessions")).toBe(true);
    expect(folderExists(NOTES, [], "_Koda/Brain/Tief")).toBe(true);
    expect(folderExists(NOTES, FOLDERS, "_Koda/Fehlt")).toBe(false);
  });
  it("die Vault-Wurzel existiert immer", () => {
    expect(folderExists([], [], "")).toBe(true);
  });
});

describe("formatListResult mit Unterordnern", () => {
  const rows = [{ path: "_Koda/Memory.md", fields: {} }];
  it("sagt schon in der Kopfzeile, dass Unterordner NICHT mitgelistet sind", () => {
    const out = formatListResult({
      folder: "_Koda", recursive: false, total: 1, rows,
      subfolders: [{ path: "_Koda/Brain", notes: 3 }, { path: "_Koda/Sessions", notes: 0 }],
    });
    const [head, second] = out.split("\n");
    expect(head).toContain("1 von 1 Notizen");
    expect(head).toContain("2 Unterordner");
    expect(head).toContain("3 Notizen");
    expect(head).toContain("recursive:true");
    expect(second).toBe("Unterordner: _Koda/Brain (3 Notizen) · _Koda/Sessions (keine Notiz)");
  });
  it("sagt nie „leer“ — ein Ordner ohne Notiz kann andere Dateien enthalten", () => {
    const out = formatListResult({
      folder: "_Koda", recursive: false, total: 1, rows, subfolders: [{ path: "_Koda/Sessions", notes: 0 }],
    });
    expect(out).not.toMatch(/leer/i);
  });
  it("nennt rekursiv die Ordner ohne Notiz in einer eigenen Zeile", () => {
    const out = formatListResult({
      folder: "_Koda", recursive: true, total: 1, rows, subfolders: [{ path: "_Koda/Sessions", notes: 0 }],
    });
    expect(out.split("\n")[1]).toBe("Ordner ohne Notiz: _Koda/Sessions");
    expect(out.split("\n")[0]).not.toContain("recursive:true");
  });
  it("kappt eine lange Unterordner-Liste sichtbar", () => {
    const subfolders = Array.from({ length: 5 }, (_, i) => ({ path: `A/${i}`, notes: 1 }));
    const out = formatListResult({ folder: "A", recursive: false, total: 1, rows, subfolders, subfolderMax: 2 });
    expect(out.split("\n")[1]).toBe("Unterordner: A/0 (1 Notiz) · A/1 (1 Notiz) · … und 3 weitere");
    // Die Kopfzeile zaehlt ALLE, nicht nur die gezeigten.
    expect(out.split("\n")[0]).toContain("5 Unterordner mit 5 Notizen");
  });
  it("traegt einen Ordner ohne direkte Notiz, aber mit Unterordnern, als Befund statt als Fehler", () => {
    const out = formatListResult({
      folder: "_Koda", recursive: false, total: 0, rows: [], subfolders: [{ path: "_Koda/Brain", notes: 3 }],
    });
    expect(out.split("\n")[0]).toContain("0 von 0 Notizen");
    expect(out).toContain("_Koda/Brain (3 Notizen)");
    expect(out.endsWith("\n")).toBe(false);
  });
  it("sagt bei einem existierenden Ordner ohne jede Notiz, dass er existiert", () => {
    const out = formatListResult({ folder: "_Koda/Sessions", recursive: false, total: 0, rows: [], subfolders: [] });
    expect(out).toBe('0 von 0 Notizen in "_Koda/Sessions" — der Ordner existiert, enthält aber keine Notiz');
  });
  it("aendert ohne Unterordner nichts am bisherigen Format", () => {
    const out = formatListResult({ folder: "_Koda", recursive: false, total: 1, rows, subfolders: [] });
    expect(out).toBe('1 von 1 Notizen in "_Koda"\n\n_Koda/Memory.md');
  });
});

describe("formatEmptyFolder mit Existenz-Aussage", () => {
  it("sagt, dass es den Ordner nicht gibt, wenn die Ordnerliste das belegt", () => {
    expect(formatEmptyFolder("A/B", [], true)).toMatch(/gibt es nicht/);
  });
  it("bleibt ohne Beleg bei der vorsichtigen Fassung", () => {
    expect(formatEmptyFolder("A/B", [])).not.toMatch(/gibt es nicht/);
  });
});
