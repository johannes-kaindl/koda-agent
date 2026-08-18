import { toWireMessages, type ChatMessage } from "../types";

/** Grobe Token-Schaetzung: Zeichen der Wire-Form durch 4. Kein Tokenizer im Plugin — die
 *  Schwelle (Default 75 %) und das reaktive Netz fangen den Schaetzfehler. `overheadChars`
 *  ist, was neben den Nachrichten mitgeht (Tool-Definitionen). */
export function estimateTokens(msgs: ChatMessage[], overheadChars = 0): number {
  return Math.ceil((JSON.stringify(toWireMessages(msgs)).length + overheadChars) / 4);
}
