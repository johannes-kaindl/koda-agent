import { toWireMessages, type ChatMessage } from "../types";
import { IMAGE_EST_CHARS } from "../../tools/images";
import { estimateTokens as estimateTokensFromChars } from "../../../vendor/kit/model-context";

/** Grobe Token-Schaetzung: Zeichen der Wire-Form durch 4. Kein Tokenizer im Plugin — die
 *  Schwelle (Default 75 %) und das reaktive Netz fangen den Schaetzfehler. `overheadChars`
 *  ist, was neben den Nachrichten mitgeht (Tool-Definitionen).
 *
 *  Die Umrechnung Zeichen → Token ist die des Kits (code-kit `model-context`, Stufe `optimistic` = 4: Verdichten ist ein
 *  teurer Schritt, den eine zu hohe Schaetzung faelschlich ausloeste). Hier bleibt nur, was Koda eigen ist: WAS gezaehlt
 *  wird (Wire-Form, Tool-Definitionen, Bildzuschlag). Den Vergleich mit dem Budget (`> budgetTokens`) macht der Loop selbst
 *  und nicht `contextOverflow`: das Budget ist ein einstellbarer Anteil des Fensters (`compactAtPercent`), nicht das Fenster,
 *  und es gibt keine Reserve fuer `max_tokens` — `contextOverflow` wuerde nur ein `null` fuer ein Budget <= 0 hinzufuegen. */
export function estimateTokens(msgs: ChatMessage[], overheadChars = 0): number {
  // Die Wire-Form ohne aufgeloeste URLs misst ein Bild als 0 — es bekommt deshalb einen Zuschlag.
  const images = msgs.reduce((n, m) => n + (m.images?.length ?? 0), 0);
  return estimateTokensFromChars(JSON.stringify(toWireMessages(msgs)).length + overheadChars + images * IMAGE_EST_CHARS, "optimistic");
}
