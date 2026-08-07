import { SKILLS_SUBFOLDER } from "../tools/write-policy";

// Pfadtrenner plus die von Obsidian in Dateinamen verbotenen Zeichen, plus Steuerzeichen.
// no-control-regex: siehe eslint.config.mjs (Datei-Override statt Inline-Disable).
const FORBIDDEN = /[\\/:*?"<>|#^[\]]|[\u0000-\u001f]/g;

/** Baut aus einem frei gewaehlten Skill-Namen einen dateisystem-tauglichen. Ein danach
 *  leerer Name ist ein Tool-Fehler, kein Fallback-Fall — geraten wird hier nichts. */
export function sanitizeSkillName(raw: string): string {
  return raw.replace(/\.md$/i, "").replace(FORBIDDEN, "").replace(/\s+/g, " ").trim();
}

/** Den Pfad baut das Plugin, nicht das Modell: kein Traversal, kein vergessenes .md,
 *  keine Ordner-Verirrung. */
export function skillPath(kodaFolder: string, name: string): string {
  return `${kodaFolder.replace(/\/+$/, "")}/${SKILLS_SUBFOLDER}/${name}.md`;
}
