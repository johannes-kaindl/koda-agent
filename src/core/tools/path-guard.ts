/** Path-Guard: vault-relativ, kein Traversal, nur .md. Reine String-Logik (kein node:path).
 *  Adaptiert aus vault-rag (security-reviewed), ohne exclude-Praefixe. */
export function normalizeRel(rel: string): string {
  return rel.split(/[\\/]/).filter((s) => s !== "" && s !== ".").join("/");
}

export function resolveNotePath(rel: string): string {
  if (rel.startsWith("/")) throw new Error(`Nur vault-relative Pfade erlaubt: "${rel}"`);
  const parts = rel.split(/[\\/]/).filter((s) => s !== "" && s !== ".");
  if (parts.some((s) => s === "..")) throw new Error(`Pfad verlässt den Vault: "${rel}"`);
  const norm = parts.join("/");
  if (!norm.toLowerCase().endsWith(".md")) throw new Error(`Nur Markdown-Notizen (.md) erlaubt: "${rel}"`);
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
