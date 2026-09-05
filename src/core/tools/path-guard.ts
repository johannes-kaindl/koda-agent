/** Path-Guard: vault-relativ, kein Traversal, nur .md. Reine String-Logik (kein node:path).
 *  Adaptiert aus vault-rag (security-reviewed), ohne exclude-Praefixe. */
export function normalizeRel(rel: string): string {
  return rel.split(/[\\/]/).filter((s) => s !== "" && s !== ".").join("/");
}

/** Was Koda LESEN darf. Schreiben bleibt `.md` — `.base` (YAML) und `.canvas` (JSON) sind
 *  strukturierte Formate, die ein vom Modell geschriebener Teiltext kaputt macht. Spec E9
 *  Punkt 5: „Lesen erlaubt .md/.base/.canvas, Schreiben bleibt .md." */
export const READ_EXTENSIONS: readonly string[] = [".md", ".base", ".canvas"];

const WRITE_EXTENSIONS: readonly string[] = [".md"];

export function resolveNotePath(rel: string, allow: readonly string[] = WRITE_EXTENSIONS): string {
  if (rel.startsWith("/")) throw new Error(`Nur vault-relative Pfade erlaubt: "${rel}"`);
  const parts = rel.split(/[\\/]/).filter((s) => s !== "" && s !== ".");
  if (parts.some((s) => s === "..")) throw new Error(`Pfad verlässt den Vault: "${rel}"`);
  const norm = parts.join("/");
  const klein = norm.toLowerCase();
  if (!allow.some((ext) => klein.endsWith(ext))) {
    throw new Error(`Nur ${allow.join(", ")} erlaubt: "${rel}"`);
  }
  return norm;
}

/** Ordner-Variante des Guards. Zwei bewusste Unterschiede zu `resolveNotePath`:
 *  kein `.md`-Zwang, und ein fuehrender `/` ist erlaubt statt ein Fehler — Modelle
 *  schreiben Ordner regelmaessig als "/20_Projekte/", das ist Schreibweise und keine
 *  Absicht, aus dem Vault zu zeigen. Der eigentliche Schutz (`..`) bleibt identisch.
 *  Rueckgabe "" bedeutet Vault-Wurzel. */
export function resolveFolderPath(rel: string): string {
  const parts = rel.split(/[\\/]/).filter((s) => s !== "" && s !== ".");
  if (parts.some((s) => s === "..")) throw new Error(`Pfad verlässt den Vault: "${rel}"`);
  return parts.join("/");
}
