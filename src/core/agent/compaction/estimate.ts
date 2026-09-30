import { toWireMessages, type ChatMessage } from "../types";
import { IMAGE_EST_CHARS } from "../../tools/images";

/** Grobe Token-Schaetzung: Zeichen der Wire-Form durch 4. Kein Tokenizer im Plugin — die
 *  Schwelle (Default 75 %) und das reaktive Netz fangen den Schaetzfehler. `overheadChars`
 *  ist, was neben den Nachrichten mitgeht (Tool-Definitionen). */
export function estimateTokens(msgs: ChatMessage[], overheadChars = 0): number {
  // Die Wire-Form ohne aufgeloeste URLs misst ein Bild als 0 — es bekommt deshalb einen Zuschlag.
  const images = msgs.reduce((n, m) => n + (m.images?.length ?? 0), 0);
  return Math.ceil((JSON.stringify(toWireMessages(msgs)).length + overheadChars + images * IMAGE_EST_CHARS) / 4);
}
