/* Die Bases-Ansicht „Koda-Kontext“ (Spec E7). Bases liefern Daten NUR an eine registrierte
 * Ansicht — ein Filter-Nachbau von aussen bekommt nichts (Spike 2026-09-06, Vault-Cockpit `_Intern/LAB.md`).
 *
 * `minAppVersion` 1.11.4 (seit `f60d65c`) — die Bases-API ist immer da (Entscheidung 2026-10-17 00:20), `registerBasesView`
 * wird ohne Feature-Check gerufen und die Unterklasse steht auf Modulebene.
 *
 * Uebernommen wird ein SCHNAPPSCHUSS (Etappe-3-Zuschnitt Punkt 5): Pfade und Anzeigetexte
 * werden kopiert, keine BasesEntry gehalten (Spike-Falle 4). Eine Arbeit mit `base:` oeffnet die Base und
 * laesst die Ansicht selbst uebernehmen, sobald Obsidian Zeilen liefert — nur wenn Pfad UND Ansicht passen. */
import { BasesView, NullValue, type BasesPropertyId, type Plugin, type QueryController, type Value } from "obsidian";
import { KODA_BASES_VIEW_TYPE, type BaseRef } from "../core/abilities/base-ref";
import { normalizeForm, type BaseRow, type BaseSnapshot } from "../core/context/bases";
import { localDate, localTime } from "../vendor/kit/local-stamp";
import { t } from "../vendor/kit/i18n";

/** Dieselbe Konstante wie in `base-ref.ts` (dort pure, hier der Adapter) — eine Quelle. */
export const KODA_BASES_VIEW = KODA_BASES_VIEW_TYPE;
export const FORM_KEY = "uebergabeform";
const SHOW_ROWS = 50;

export interface BasesHost {
  /** `auto`: die Ansicht hat selbst uebernommen (Arbeit mit `base:`), nicht der Nutzer per Knopf. */
  adopt(snap: BaseSnapshot, auto: boolean): void;
  /** Die Base, die eine Arbeit gerade geoeffnet hat und uebernommen haben will; `null`, wenn keine wartet. */
  pending(): BaseRef | null;
}

/** Anzeigetext oder null. Zwei Abwesenheitsformen (Spike-Falle 1): eine unbekannte Formel
 *  liefert echtes `null`, eine fehlende Eigenschaft ein `NullValue` — dessen `toString()`
 *  ergibt „null“ und darf nie in den Block. */
function valueText(v: Value | null): string | null {
  if (v === null || v instanceof NullValue) return null;
  return v.toString();
}

class KodaBasesView extends BasesView {
  type: string = KODA_BASES_VIEW;
  private readonly root: HTMLElement;

  constructor(controller: QueryController, containerEl: HTMLElement, private readonly host: BasesHost) {
    super(controller);
    this.root = containerEl.createDiv({ cls: "koda-bases-view" });
    // Vor dem ersten onDataUpdated — und in einer eingebetteten Base fuer immer (Spike:
    // der Embed instanziiert die Ansicht, versorgt sie aber nicht).
    this.root.createDiv({ cls: "koda-empty", text: t("bases.waiting") });
  }

  onDataUpdated(): void {
    this.paint();
    // Auto-Uebernahme fuer eine Arbeit mit `base:`: Pfad UND Ansichtsname muessen passen — eine andere Base mit gleichnamiger Ansicht
    // darf nicht uebernommen werden. Bei 0 Zeilen nicht: das kann „noch nicht geladen“ heissen, der Knopf bleibt dem Nutzer.
    const p = this.host.pending();
    if (p !== null && this.config.name === p.view && this.app.workspace.getActiveFile()?.path === p.path && this.data.data.length > 0) this.adopt(true);
  }

  private paint(): void {
    const root = this.root;
    root.empty();
    const zeilen = this.data.data.length;
    const kopf = root.createDiv({ cls: "koda-bases-head" });
    const knopf = kopf.createEl("button", { cls: "mod-cta koda-bases-adopt", text: t("bases.adopt") });
    knopf.disabled = zeilen === 0;
    knopf.addEventListener("click", () => { this.adopt(false); });
    kopf.createSpan({ cls: "koda-bases-meta", text: t("bases.rows", String(zeilen)) });

    const liste = root.createDiv({ cls: "koda-bases-rows" });
    const order = this.config.getOrder();
    for (const e of this.data.data.slice(0, SHOW_ROWS)) {
      const werte = order.map((p) => valueText(e.getValue(p))).filter((v): v is string => v !== null);
      liste.createDiv({ cls: "koda-bases-row", text: werte.length > 0 ? `${e.file.path} — ${werte.join(" · ")}` : e.file.path });
    }
    if (zeilen > SHOW_ROWS) liste.createDiv({ cls: "koda-bases-more", text: t("bases.more", String(zeilen - SHOW_ROWS)) });
  }

  /** Kopiert, was die Ansicht JETZT zeigt. Die Base-Datei ist beim Klick die aktive Datei
   *  (der Knopf sitzt in ihrem eigenen Tab); die API nennt den Pfad einer Ansicht nicht. */
  private adopt(auto: boolean): void {
    const basePath = this.app.workspace.getActiveFile()?.path ?? "Base";
    const order: BasesPropertyId[] = this.config.getOrder();
    const rows: BaseRow[] = [];
    for (const g of this.data.groupedData) {
      const group = g.hasKey() && g.key !== undefined ? valueText(g.key) : null;
      for (const e of g.entries) {
        rows.push({ path: e.file.path, group, values: order.map((p) => valueText(e.getValue(p))) });
      }
    }
    const jetzt = new Date();
    this.host.adopt({
      // Ein Schnappschuss je Ansicht: Pfad und Ansicht bilden die Identitaet, zwei Ansichten derselben Base bleiben zwei Schnappschuesse.
      id: `${basePath} · ${this.config.name}`,
      basePath,
      viewName: this.config.name,
      takenAt: `${localDate(jetzt)} ${localTime(jetzt)}`,
      form: normalizeForm(this.config.get(FORM_KEY)),
      columns: order.map((p) => this.config.getDisplayName(p)),
      rows,
    }, auto);
  }
}

export function registerKodaBasesView(plugin: Plugin, host: BasesHost): void {
  plugin.registerBasesView(KODA_BASES_VIEW, {
    name: t("bases.viewName"),
    icon: "dog",
    factory: (controller: QueryController, containerEl: HTMLElement) => new KodaBasesView(controller, containerEl, host),
    // Die Deklaration zeigt nur das Dropdown — den Default traegt `normalizeForm` im Lesecode:
    // `config.get` setzt `default` nicht ein, und `options` wird nie von selbst gerufen (Spike).
    options: () => [{
      type: "dropdown",
      key: FORM_KEY,
      displayName: t("bases.form"),
      default: "table",
      options: { table: t("bases.form.table"), notes: t("bases.form.notes"), both: t("bases.form.both") },
    }],
  });
}
