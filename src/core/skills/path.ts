import { SKILLS_SUBFOLDER } from "../tools/write-policy";

// Pfadtrenner plus die von Obsidian in Dateinamen verbotenen Zeichen.
const FORBIDDEN = /[\\/:*?"<>|#^[\]]/g;

/** Steuerzeichen (C0, U+0000..U+001F) raus. Bewusst als Codepoint-Vergleich statt als
 *  Regex-Range: eine Regex mit literalen Steuerzeichen laesst `no-control-regex`
 *  anschlagen — beim Store-Scan sichtbar, lokal nur durch einen Datei-Override
 *  unterdrueckbar, der genau diese Vorschau blind macht. `for...of` laeuft ueber
 *  Codepoints, Surrogatpaare bleiben also unversehrt. */
function stripControlChars(value: string): string {
  let out = "";
  for (const ch of value) if (ch.codePointAt(0)! > 0x1f) out += ch;
  return out;
}

/** Baut aus einem frei gewaehlten Skill-Namen einen dateisystem-tauglichen. Ein danach
 *  leerer Name ist ein Tool-Fehler, kein Fallback-Fall — geraten wird hier nichts. */
export function sanitizeSkillName(raw: string): string {
  const withoutMd = raw.replace(/\.md$/i, "");
  return stripControlChars(withoutMd).replace(FORBIDDEN, "").replace(/\s+/g, " ").trim();
}

/** Den Pfad baut das Plugin, nicht das Modell: kein Traversal, kein vergessenes .md,
 *  keine Ordner-Verirrung. */
export function skillPath(kodaFolder: string, name: string): string {
  return `${kodaFolder.replace(/\/+$/, "")}/${SKILLS_SUBFOLDER}/${name}.md`;
}
