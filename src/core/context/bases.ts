/* Bases als Kontextquelle (Spec E7, Etappe 3b). Pure: Obsidians Bases-Objekte erreichen
 * diesen Kern nie. Der Adapter (src/obsidian/bases-view.ts) kopiert beim Uebernehmen Pfade
 * und Zeichenketten — alte BasesEntry liefern nach einem Update still veraltete Werte
 * (docs/LAB.md, Spike-Falle 4). Fehlende Werte kommen hier als `null` an; das Wort „null"
 * (NullValue.toString(), Falle 1) darf nie in einen Block.
 *
 * Schnappschuss statt Live-Abo (Etappe-3-Zuschnitt Punkt 5): eine Base im Hintergrund
 * liefert keine Updates (Falle 3) — der Zeitstempel sagt, welchen Stand der Block zeigt. */
import type { ContextAttachment, ContextItem } from "./types";

export const BASE_FORMS = ["table", "notes", "both"] as const;
export type BaseForm = (typeof BASE_FORMS)[number];

export interface BaseRow {
  path: string;
  /** Anzeigetext des groupBy-Werts; null = keine Gruppierung oder Zeile ohne Wert. */
  group: string | null;
  /** Je Spalte der Anzeigetext; null = Wert fehlt. */
  values: (string | null)[];
}

export interface BaseSnapshot {
  /** Ein Schnappschuss je Ansicht: `<basePath> · <viewName>` (gebildet im Adapter, `bases-view.ts`). */
  id: string;
  basePath: string;
  viewName: string;
  /** Lokale Zeit, `YYYY-MM-DD HH:mm` (aus dem Kit-Modul `local-stamp`, gebildet im Adapter). */
  takenAt: string;
  form: BaseForm;
  columns: string[];
  rows: BaseRow[];
}

export function normalizeForm(raw: unknown): BaseForm {
  return typeof raw === "string" && (BASE_FORMS as readonly string[]).includes(raw) ? (raw as BaseForm) : "table";
}

export function upsertBase(list: readonly BaseSnapshot[], snap: BaseSnapshot): BaseSnapshot[] {
  const i = list.findIndex((b) => b.id === snap.id);
  if (i === -1) return [...list, snap];
  const next = [...list];
  next[i] = snap;
  return next;
}

export function removeBase(list: readonly BaseSnapshot[], id: string): BaseSnapshot[] {
  return list.some((b) => b.id === id) ? list.filter((b) => b.id !== id) : (list as BaseSnapshot[]);
}

export function basePaths(list: readonly BaseSnapshot[]): string[] {
  const out: string[] = [];
  const gesehen = new Set<string>();
  for (const b of list) {
    if (b.form === "table") continue;
    for (const r of b.rows) {
      if (gesehen.has(r.path)) continue;
      gesehen.add(r.path);
      out.push(r.path);
    }
  }
  return out;
}

type Lang = "de" | "en";
const T = {
  de: {
    head: (b: BaseSnapshot) => `## Base: ${b.basePath} · ${b.viewName} (Stand ${b.takenAt})`,
    note: "Notiz",
    noGroup: "(ohne Wert)",
    cut: (a: number, n: number) => `[gekürzt: ${a} von ${n} Zeilen — die Base in Obsidian zeigt alle]`,
  },
  en: {
    head: (b: BaseSnapshot) => `## Base: ${b.basePath} · ${b.viewName} (as of ${b.takenAt})`,
    note: "Note",
    noGroup: "(no value)",
    cut: (a: number, n: number) => `[cut: ${a} of ${n} rows — the base in Obsidian shows all]`,
  },
} as const;

function cell(v: string | null): string {
  return v === null ? "" : v.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

/** Eine Base als Text, hoechstens `max` Zeichen — gekuerzt wird zeilenweise, nie mitten in
 *  einer Zeile. Liefert den Text und wie viele Zeilen er zeigt. */
function renderOne(b: BaseSnapshot, max: number, lang: Lang): { text: string; full: string; shown: number } {
  const t = T[lang];
  const kopfzeilen = [`| ${[t.note, ...b.columns].map(cell).join(" | ")} |`, `| ${["---", ...b.columns.map(() => "---")].join(" | ")} |`];
  const gruppiert = b.rows.some((r) => r.group !== null);
  const bau = (bis: number): string => {
    const teile: string[] = [t.head(b)];
    let gruppe: string | null | undefined;
    for (const r of b.rows.slice(0, bis)) {
      if (gruppiert && r.group !== gruppe) {
        gruppe = r.group;
        teile.push(`### ${gruppe ?? t.noGroup}`, ...kopfzeilen);
      } else if (!gruppiert && teile.length === 1) {
        teile.push(...kopfzeilen);
      }
      teile.push(`| ${[r.path, ...r.values].map(cell).join(" | ")} |`);
    }
    if (bis < b.rows.length) teile.push(t.cut(bis, b.rows.length));
    return teile.join("\n");
  };
  const full = bau(b.rows.length);
  if (full.length <= max) return { text: full, full, shown: b.rows.length };
  // Rueckwaerts suchen, bis Text samt Kuerzungs-Meldung passt; 0 Zeilen ist erlaubt.
  for (let n = b.rows.length - 1; n >= 0; n--) {
    const text = bau(n);
    if (text.length <= max) return { text, full, shown: n };
  }
  return { text: "", full, shown: 0 };
}

export interface TableRender { blocks: string[]; items: ContextItem[]; used: number }

export function renderTables(list: readonly BaseSnapshot[], budget: number, lang: Lang): TableRender {
  const blocks: string[] = [];
  const items: ContextItem[] = [];
  let rest = Math.max(0, budget);
  for (const b of list) {
    if (b.form === "notes") continue;
    const r = renderOne(b, rest, lang);
    if (r.text === "") continue;
    blocks.push(r.text);
    const item: ContextItem = { source: "base", path: b.basePath, kind: "table", via: b.id, chars: r.text.length };
    if (r.shown < b.rows.length) item.fullChars = r.full.length;
    items.push(item);
    rest -= r.text.length;
  }
  return { blocks, items, used: blocks.reduce((s, x) => s + x.length, 0) };
}

export function withBaseTables(ctx: ContextAttachment, tables: TableRender): ContextAttachment {
  if (tables.blocks.length === 0) return ctx;
  return {
    ...ctx,
    text: [ctx.text, ...tables.blocks].join("\n\n"),
    items: [...ctx.items, ...tables.items],
  };
}
