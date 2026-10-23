/* `base:` einer Arbeit (Spec § 10): `"<Pfad>.base#<Ansicht>"`. Koda schreibt nie in eine .base
 * des Nutzers — die genannte Ansicht muss dort schon vom Typ „Koda-Kontext“ sein. Pure: die
 * .base liest der Adapter und reicht das geparste YAML herein. */

/** Typ der registrierten Bases-Ansicht — dieselbe Konstante wie `KODA_BASES_VIEW` im Adapter,
 *  hier, weil `src/core/` den Adapter nicht importieren darf. */
export const KODA_BASES_VIEW_TYPE = "koda-context";

export interface BaseRef { path: string; view: string }

/** Pfad und Ansicht aus dem Verweis, oder null (kein `#`, leere Teile, kein `.base`). Getrennt
 *  wird am ERSTEN `#` — Ansichtsnamen dürfen `#` enthalten, Pfade in Obsidian nicht. */
export function parseBaseRef(ref: string): BaseRef | null {
  const i = ref.indexOf("#");
  if (i === -1) return null;
  const path = ref.slice(0, i).trim();
  const view = ref.slice(i + 1).trim();
  if (path === "" || view === "" || !path.toLowerCase().endsWith(".base")) return null;
  return { path, view };
}

export type BaseViewCheck = "ok" | "missing" | "wrong-type";

/** Gibt es in der .base eine Ansicht dieses Namens, und ist sie vom Typ „Koda-Kontext“? */
export function checkBaseView(yaml: unknown, view: string): BaseViewCheck {
  if (typeof yaml !== "object" || yaml === null) return "missing";
  const views = (yaml as { views?: unknown }).views;
  if (!Array.isArray(views)) return "missing";
  const hit = views.find((v): v is Record<string, unknown> => typeof v === "object" && v !== null && (v as Record<string, unknown>).name === view);
  if (hit === undefined) return "missing";
  return hit.type === KODA_BASES_VIEW_TYPE ? "ok" : "wrong-type";
}
