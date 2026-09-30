import { parseFrontmatter } from "../../vendor/kit/frontmatter";

/** Ein Skill: benannte Verhaltensanweisung aus <Koda-Ordner>/Skills/<name>.md.
 *  Der Name ist der Dateiname ohne .md — bewusst KEIN Frontmatter-Feld, damit es
 *  keine zweite Wahrheit ueber den Namen gibt. */
export interface Skill {
  name: string;
  description: string;
  enabled: boolean;
  /** `pinned: true` im Frontmatter: der Body geht immer voll in den Prompt. Ohne Pin steht
   *  nur die description dort, den Body holt sich das Modell mit `load_skill`. */
  pinned: boolean;
  body: string;
}

export type ParseResult =
  | { ok: true; skill: Skill }
  | { ok: false; name: string; reason: "no-description" };

/** `parseFrontmatter` (Kit) wirft nie und liefert IMMER Strings (dokumentierte
 *  Typ-Asymmetrie im Modul-Kopf): fehlt der ---Block, kommt data:{} + der ganze Text
 *  als Body zurueck, und `enabled: false` erreicht uns als "false". Deshalb gibt es
 *  hier genau einen Fehlergrund — eine fehlende Beschreibung. */
export function parseSkill(name: string, raw: string): ParseResult {
  const fm = parseFrontmatter(raw);
  const desc = fm.data["description"];
  if (typeof desc !== "string" || desc.trim() === "") {
    return { ok: false, name, reason: "no-description" };
  }
  const enabledRaw = fm.data["enabled"];
  const enabled = typeof enabledRaw === "string" ? enabledRaw.trim().toLowerCase() !== "false" : true;
  // Wie `enabled` ein String (Kit-Parser, s. oben) — aber mit umgekehrtem Default: nur ein
  // ausdruecklich gesetztes `true` pinnt. Ein Tippfehler laedt dann nicht alles voll.
  const pinnedRaw = fm.data["pinned"];
  const pinned = typeof pinnedRaw === "string" && pinnedRaw.trim().toLowerCase() === "true";
  return { ok: true, skill: { name, description: desc.trim(), enabled, pinned, body: fm.body.trim() } };
}
