import { collectSubfolders, folderExists, suggestFolders } from "../src/core/tools/list";

// Ordnervergleich laeuft ueber `canonVaultDir` aus obsidian-kit (vault-path): NFC plus Slash-Rauschen.
// macOS liefert Pfade als NFD von der Platte, ein Modell schreibt NFC (und gelegentlich einen Schluss-Slash).
const NFD = "Bücher";
const NOTES = [`${NFD}/Alpha.md`, `${NFD}/Tief/Beta.md`, "Notes/n.md"];

describe("Ordnervergleich ueber canonVaultDir", () => {
  it("folderExists: NFD-Ordner wird mit NFC-Eingabe gefunden", () => {
    expect(folderExists(NOTES, [], "Bücher")).toBe(true);
  });
  it("folderExists: Schluss-Slash und Backslash aendern die Antwort nicht", () => {
    expect(folderExists(NOTES, [], "Bücher/")).toBe(true);
    expect(folderExists(NOTES, [], "Bücher\\Tief")).toBe(true);
  });
  it("folderExists: ein fremder Ordner bleibt unbekannt", () => {
    expect(folderExists(NOTES, [], "Buecher/")).toBe(false);
  });
  it("collectSubfolders: Eingabe mit Schluss-Slash listet dieselben Unterordner", () => {
    const got = collectSubfolders(NOTES, [], "Bücher/", false);
    expect(got).toEqual([{ path: `${NFD}/Tief`, notes: 1 }]);
  });
  it("suggestFolders: Schluss-Slash im Wunschpfad stoert die Praefix-Stufe nicht", () => {
    expect(suggestFolders(NOTES, "Bücher/Fehlt/")).toContain(`${NFD}/Tief`);
  });
});
