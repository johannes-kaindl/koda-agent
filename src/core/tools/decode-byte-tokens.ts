/** Manche lokalen Modelle schreiben Nicht-ASCII-Zeichen als literale Byte-Token
 *  (`<0xF0><0x9F><0x97><0x82>` statt 🗂) in ihre Werkzeug-Argumente. Belegt in
 *  `_Koda/Skills/koda-start.md` und `koda-dashboard.md` eines Nutzer-Vaults.
 *
 *  Eine Folge wird zu Bytes und streng als UTF-8 gelesen. Gelingt das nicht (abgeschnittene
 *  Folge, verwaistes Fortsetzungsbyte), wird NICHT geraten, sondern abgelehnt: ein still
 *  repariertes Zeichen waere ein erfundenes. Die Meldung geht als Werkzeug-Fehler ans Modell,
 *  das die Stelle dann selbst korrigieren kann.
 *
 *  Nur Folgen, die ein Byte >= 0x80 enthalten, sind gemeint: dort kann ASCII nicht der Sinn
 *  sein. Eine Folge, die nur zu ASCII dekodieren wuerde (`<0x0A>`, `<0x41>`), bleibt literal —
 *  sie kann in einer Notiz ueber Hex-Token stehen. Fuehrende ASCII-Token vor dem ersten
 *  Byte >= 0x80 bleiben ebenfalls stehen; ab dort wird alles gelesen. */
export type ByteTokenResult = { ok: true; text: string } | { ok: false; error: string };

const RUN = /(?:<0x[0-9A-Fa-f]{2}>)+/g;
const TOKEN = /<0x([0-9A-Fa-f]{2})>/g;

export function decodeByteTokens(text: string): ByteTokenResult {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let failure: string | undefined;
  const out = text.replace(RUN, (run, offset: number) => {
    if (failure !== undefined) return run;
    const all = [...run.matchAll(TOKEN)].map((m) => parseInt(m[1], 16));
    const first = all.findIndex((b) => b >= 0x80);
    if (first < 0) return run;
    // Jedes Token ist 6 Zeichen lang (`<0xNN>`), der literale Vorspann damit first * 6.
    const prefix = run.slice(0, first * 6);
    const rest = run.slice(first * 6);
    const bytes = Uint8Array.from(all.slice(first));
    try {
      return prefix + decoder.decode(bytes);
    } catch {
      const line = text.slice(0, offset).split("\n").length;
      failure =
        `Ungueltige Byte-Folge ${rest} in Zeile ${line}: sie ergibt kein vollstaendiges UTF-8-Zeichen. ` +
        `Schreibe das Zeichen selbst (z. B. 🗂) oder lass es weg — nichts geschrieben.`;
      return run;
    }
  });
  return failure === undefined ? { ok: true, text: out } : { ok: false, error: failure };
}
