/* Der aufklappbare Denkblock NACH dem Antwortende (Entscheidung Johannes 2026-10-17). Waehrend des Stroms zeichnet ihn der
 * Kit-Stream-Bereich (`buildStreamArea`); beim Neuzeichnen des Verlaufs ist die Stream-Blase weg, der Text steht aber als
 * `thinking` an der gespeicherten Nachricht. Hier derselbe Aufbau mit denselben Kit-Klassen (`okit-stream-reasoning*`, CSS in
 * `styles.css`), damit beide Zustaende gleich aussehen — samt Kopier-Knopf aus dem Kit (`copyToClipboard`). */
import { setIcon } from "obsidian";
import { copyToClipboard } from "../vendor/kit-obsidian/clipboard";
import { t } from "../vendor/kit/i18n";

const COPIED_FLASH_MS = 1500;

/** Zugeklappt, ohne Strom: kein `open`. Der Kopier-Knopf klappt den Block nicht auf oder zu. */
export function buildThinkingBlock(parent: HTMLElement, text: string): HTMLElement {
  const det = parent.createEl("details", { cls: "okit-stream-reasoning koda-thinking" });
  const summary = det.createEl("summary");
  summary.createSpan({ cls: "okit-stream-reasoning-label", text: t("view.thinkingDone") });
  const btn = summary.createEl("button", {
    cls: "clickable-icon okit-stream-reasoning-copy",
    attr: { type: "button", "aria-label": t("view.thinkingCopy") },
  });
  setIcon(btn, "copy");
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    void copyToClipboard(text, {
      copiedMessage: t("view.thinkingCopied"),
      onCopied: () => {
        setIcon(btn, "check");
        btn.addClass("is-copied");
        window.setTimeout(() => { setIcon(btn, "copy"); btn.removeClass("is-copied"); }, COPIED_FLASH_MS);
      },
    });
  });
  det.createEl("pre", { text });
  return det;
}
