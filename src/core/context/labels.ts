import type { ContextAttachment, ContextMode } from "./types";

type Lang = "de" | "en";

const MODE: Record<Lang, Record<ContextMode, string>> = {
  de: { off: "Aus", workspace: "Arbeitsplatz", note: "Notiz", tabs: "Alle Tabs", vault: "Vault" },
  en: { off: "Off", workspace: "Workspace", note: "Note", tabs: "All tabs", vault: "Vault" },
};

export function modeLabel(mode: ContextMode, lang: Lang): string {
  return MODE[lang][mode];
}

function basename(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
}

/** Eine Zeile fuer die Kontextzeile unter der Nutzer-Blase. NICHT fuer den gui:ask-Bericht —
 *  der baut sein eigenes Label. */
export function contextSummary(ctx: ContextAttachment, lang: Lang): string {
  const parts = [modeLabel(ctx.mode, lang)];
  const active = ctx.items.find((i) => i.source === "active");
  if (active !== undefined) parts.push(basename(active.path));
  const sel = ctx.items.find((i) => i.source === "selection");
  if (sel !== undefined) {
    // Die URSPRUENGLICHE Laenge, nicht die gekuerzte: fuer den Nutzer zaehlt, wie viel er
    // markiert hat, nicht wie viel davon im Block ankam — die Kuerzung meldet sich zusaetzlich.
    const n = sel.fullChars ?? sel.chars;
    const cutSuffix = sel.fullChars !== undefined ? (lang === "de" ? " (gekürzt)" : " (cut)") : "";
    parts.push((lang === "de" ? `Markierung ${n} Z.` : `selection ${n} chars`) + cutSuffix);
  }
  const tabs = ctx.items.filter((i) => i.source === "tab").length;
  if (tabs === 1) parts.push(lang === "de" ? "1 Tab" : "1 tab");
  else if (tabs > 1) parts.push(lang === "de" ? `${tabs} Tabs` : `${tabs} tabs`);
  return parts.join(" · ");
}
