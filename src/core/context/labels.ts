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

/** Eine Zeile fuer die Kontextzeile unter der Nutzer-Blase und den gui:ask-Bericht. */
export function contextSummary(ctx: ContextAttachment, lang: Lang): string {
  const parts = [modeLabel(ctx.mode, lang)];
  const active = ctx.items.find((i) => i.source === "active");
  if (active !== undefined) parts.push(basename(active.path));
  const sel = ctx.items.find((i) => i.source === "selection");
  if (sel !== undefined) parts.push(lang === "de" ? `Markierung ${sel.chars} Z.` : `selection ${sel.chars} chars`);
  const tabs = ctx.items.filter((i) => i.source === "tab").length;
  if (tabs > 0) parts.push(lang === "de" ? `${tabs} Tabs` : `${tabs} tabs`);
  return parts.join(" · ");
}
