/** Byte-Token-Guard (Kodas deutsche Meldung um den Kit-Kern `decodeByteTokens`, code-kit 0.27.1).
 *
 *  Der Kern ist seit Welle 22 im Kit (`pure/byte-tokens`, Herkunft: dieses Modul). Hier bleibt nur,
 *  was dem Kit absichtlich fehlt: die deutsche Meldung, gebaut aus `run` und `line`. Sie geht als
 *  Werkzeug-Fehler ans Modell, das die Stelle dann selbst korrigiert. Ein BOM
 *  (`<0xEF><0xBB><0xBF>`) bleibt seit dem Kit als U+FEFF stehen statt verschluckt zu werden.
 *  Zur Regel (nur Folgen mit einem Byte >= 0x80, nichts raten) siehe den Kopf des Kit-Moduls. */
import { decodeByteTokens as decodeKit } from "../../vendor/kit/byte-tokens";

export type ByteTokenResult = { ok: true; text: string } | { ok: false; error: string };

export function decodeByteTokens(text: string): ByteTokenResult {
  const r = decodeKit(text);
  if (r.ok) return r;
  return {
    ok: false,
    error:
      `Ungueltige Byte-Folge ${r.run} in Zeile ${r.line}: sie ergibt kein vollstaendiges UTF-8-Zeichen. ` +
      `Schreibe das Zeichen selbst (z. B. 🗂) oder lass es weg — nichts geschrieben.`,
  };
}
