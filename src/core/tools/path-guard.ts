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
