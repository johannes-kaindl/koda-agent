import { AVAILABLE_MODES, type ContextAttachment, type ContextMode } from "./types";

type Lang = "de" | "en";

const MODE: Record<Lang, Record<ContextMode, string>> = {
  de: { off: "Aus", workspace: "Arbeitsplatz", note: "Notiz", tabs: "Alle Tabs", vault: "Vault" },
  en: { off: "Off", workspace: "Workspace", note: "Note", tabs: "All tabs", vault: "Vault" },
};

export function modeLabel(mode: ContextMode, lang: Lang): string {
  return MODE[lang][mode];
}

export interface ModeOption { value: ContextMode; label: string; disabled: boolean }

const NEEDS_RAG: Record<Lang, string> = { de: "braucht vault-rag", en: "needs vault-rag" };

/** Die Eintraege beider Modus-Dropdowns (Chat und Kontext-Tab) — ein Wortlaut, zwei
 *  Bedienstellen. Vault ohne vault-rag bleibt SICHTBAR, aber gesperrt und nennt den Grund
 *  (Spec E1: „derselbe Wortlaut wie bei related_notes"). */
export function modeOptions(lang: Lang, vaultAvailable: boolean): ModeOption[] {
  return AVAILABLE_MODES.map((m) => {
    const disabled = m === "vault" && !vaultAvailable;
    const label = disabled ? `${modeLabel(m, lang)} (${NEEDS_RAG[lang]})` : modeLabel(m, lang);
    return { value: m, label, disabled };
  });
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

/** Die Quellen unter einer Antwort: nur Volltext-Eintraege. Zeiger (aktive Notiz,
 *  Markierung, Tab-Pfade) stehen bereits vollstaendig in der aufklappbaren Kontextzeile
 *  ueber der Antwort — sie hier zu wiederholen waere Rauschen. Gezeigt wird die GESENDETE
 *  Zeichenzahl, nicht die volle: die Frage unter der Antwort lautet „was hat das Modell
 *  gelesen", nicht „wie gross ist die Notiz". */
export function sourceChips(ctx: ContextAttachment): { path: string; label: string; chars: number }[] {
  return ctx.items
    .filter((i) => i.kind === "full")
    .map((i) => ({ path: i.path, label: basename(i.path), chars: i.chars }));
}
