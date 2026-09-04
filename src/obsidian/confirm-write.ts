import { ButtonComponent, Modal, type App } from "obsidian";
import { applyDestructive } from "../vendor/kit-obsidian/confirm";
import { diffLines } from "../vendor/kit/diff";
import { t } from "../vendor/kit/i18n";
import type { DeleteRequest, MoveRequest, WriteFileRequest, WriteRequest } from "./vault-tools";

/** Wie viele Notizen hierher verlinken, als Satz. Getrennt nach Vorgang, weil die Zahl
 *  Verschiedenes bedeutet: beim Verschieben werden die Links MITGEZOGEN (eine Zusage),
 *  beim Loeschen BRECHEN sie (eine Warnung). Dieselbe Zahl, gegenteilige Nachricht — sie
 *  neutral zu formulieren waere die schlechteste der drei Moeglichkeiten. */
function backlinkLine(n: number, destructive: boolean): string {
  if (n === 0) return destructive ? "" : t("confirm.backlinks.none");
  if (destructive) {
    return n === 1 ? t("confirm.delete.backlinks.one") : t("confirm.delete.backlinks.many", String(n));
  }
  return n === 1 ? t("confirm.backlinks.one") : t("confirm.backlinks.many", String(n));
}

/** Quelle → Ziel als zwei beschriftete Zeilen statt eines Pfeils in einer: Pfade sind lang,
 *  und in einer Zeile bricht der Umbruch mitten im Pfad — dann ist nicht mehr erkennbar,
 *  wo der eine aufhoert und der andere anfaengt. */
function pathPair(parent: HTMLElement, from: string, to: string): void {
  const box = parent.createDiv({ cls: "koda-move-paths" });
  for (const [label, value] of [[t("confirm.move.from"), from], [t("confirm.move.to"), to]]) {
    const row = box.createDiv({ cls: "koda-move-row" });
    row.createEl("strong", { text: `${label}: ` });
    row.createSpan({ cls: "koda-move-path", text: value });
  }
}

/** Schreibfreigabe mit Vorschau. Drei Vorgaenge, EIN Modal (UI-STANDARD §2):
 *  create/append zeigen den neuen Text, replace den Zeilen-Diff, move/delete die
 *  betroffenen Pfade und die Reichweite ueber die Backlinks.
 *  Esc/Wegklicken = Ablehnung (loest genau einmal auf). */
export function confirmWrite(app: App, req: WriteRequest): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: boolean): void => {
      if (!settled) { settled = true; resolve(v); }
    };
    const modal = new (class extends Modal {
      onOpen(): void {
        const btns = req.kind === "write"
          ? this.renderWrite(req)
          : req.kind === "move" ? this.renderMove(req) : this.renderDelete(req);
        btns();
      }

      /** Button-Reihenfolge und -Container folgen UI-STANDARD §2 (verbindlich): Cancel links,
       *  Bestaetigen rechts, beide im nativen modal-button-container — wie im vendorten
       *  kit-obsidian/confirm.ts. mod-cta und destructive schliessen sich gegenseitig aus
       *  (Kit-Konvention). */
      private buttons(okLabel: string, destructive: boolean): () => void {
        return () => {
          const row = this.contentEl.createDiv({ cls: "modal-button-container" });
          new ButtonComponent(row).setButtonText(t("confirm.cancel")).onClick(() => { done(false); this.close(); });
          const ok = new ButtonComponent(row).setButtonText(okLabel).onClick(() => { done(true); this.close(); });
          if (destructive) applyDestructive(ok); else ok.setCta();
        };
      }

      private renderWrite(r: WriteFileRequest): () => void {
        this.titleEl.setText(t("confirm.title", r.mode, r.path));
        // Additiv, nie ersetzend: die vollstaendige Vorschau darunter bleibt die
        // Grundlage der Freigabe (Invariante "Vorschau == geschriebener Inhalt").
        if (r.effect !== undefined && r.effect !== "") {
          const eff = this.contentEl.createDiv({ cls: "koda-effect" });
          eff.createEl("strong", { text: t("confirm.effect") });
          eff.createSpan({ text: ` ${r.effect}` });
        }
        const box = this.contentEl.createDiv({ cls: "koda-preview" });
        if (r.mode === "replace") {
          for (const lineItem of diffLines(r.oldText, r.newText)) {
            box.createDiv({ cls: `koda-diff-${lineItem.kind}`, text: lineItem.text });
          }
        } else {
          box.createEl("pre", { text: r.newText });
        }
        // replace ist destruktiv (ueberschreibt bestehenden Inhalt), create/append sind additiv.
        return this.buttons(t("confirm.write"), r.mode === "replace");
      }

      /** Kein Diff und keine Textvorschau: der Inhalt aendert sich beim Verschieben nicht.
       *  Was sich aendert, ist der Ort — und wie weit die Aenderung reicht. */
      private renderMove(r: MoveRequest): () => void {
        this.titleEl.setText(t(r.rename ? "confirm.rename.title" : "confirm.move.title"));
        pathPair(this.contentEl, r.path, r.destination);
        this.contentEl.createDiv({ cls: "koda-move-note", text: backlinkLine(r.backlinks, false) });
        // Ein Move ist nicht destruktiv: nichts geht verloren, und Obsidian zieht die Links nach.
        return this.buttons(t(r.rename ? "confirm.rename.ok" : "confirm.move.ok"), false);
      }

      private renderDelete(r: DeleteRequest): () => void {
        this.titleEl.setText(t("confirm.delete.title"));
        this.contentEl.createDiv({ cls: "koda-move-path", text: r.path });
        const warn = backlinkLine(r.backlinks, true);
        if (warn !== "") this.contentEl.createDiv({ cls: "koda-delete-warn", text: warn });
        // Der Hinweis auf den Papierkorb ist keine Beschwichtigung, sondern die Information,
        // die den Unterschied zwischen "weg" und "wiederherstellbar" ausmacht.
        this.contentEl.createDiv({ cls: "koda-move-note", text: t("confirm.delete.hint") });
        return this.buttons(t("confirm.delete.ok"), true);
      }

      onClose(): void {
        done(false);
        this.contentEl.empty();
      }
    })(app);
    modal.open();
  });
}
