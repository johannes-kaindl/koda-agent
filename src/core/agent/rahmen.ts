/** Interne Schalter des Agenten-Rahmens, gebaut für den Messrahmen (Welle 38, Abgleich „Agenten-Rahmen“ vom 2026-11-25,
 *  Empfehlung 2). Kein Settings-Feld und keine Oberfläche: das Plugin übergibt sie nie, nur der Läufer
 *  `scripts/messrahmen/` setzt sie, um jede Änderung einzeln gegen den Basisstand zu messen. `RAHMEN_STANDARD` ist genau
 *  das Verhalten vor den Schaltern; fehlt das Objekt an einer Lesestelle, gilt es ebenfalls (Tests belegen beides).
 *
 *  Gelesen wird an drei Stellen, weil die drei Änderungen an drei Orten wirken: (a) im Prompt-Bau (`buildSystemPrompt`),
 *  (b) in `read_note` (`VaultTools`) und im Prompt-Bau für `Memory.md`, (c) in der Schleife (`runAgent`). */
export interface RahmenSchalter {
  /** (a) `## Now` trägt nur Datum und Wochentag statt der Minute: der Systemprompt bleibt einen Tag lang gleich, und der
   *  Präfix-Zwischenspeicher des Servers muss ihn nicht je Minute neu rechnen. Die Uhrzeit liefert `get_datetime`. */
  nowNurDatum: boolean;
  /** (b) Obergrenze in Zeichen für das Ergebnis von `read_note`; `null` heißt keine Grenze. Gekappt wird hinten, die
   *  Kappung steht in Zeile 1 (wie bei `list_notes`). */
  leseGrenzeZeichen: number | null;
  /** (b) Obergrenze in Zeichen für `Memory.md` im Systemprompt; `null` heißt keine Grenze. Gekappt wird vorn: `save_memory`
   *  hängt an, die jüngsten Zeilen stehen also am Ende und bleiben. */
  memoryGrenzeZeichen: number | null;
  /** (c) Scheitert derselbe Aufruf (Name und Argumente gleich) zweimal hintereinander, bekommt der zweite Fehler einen
   *  Hinweis, den Aufruf nicht unverändert zu wiederholen. */
  wiederholungsHinweis: boolean;
}

export const RAHMEN_STANDARD: Readonly<RahmenSchalter> = Object.freeze({
  nowNurDatum: false,
  leseGrenzeZeichen: null,
  memoryGrenzeZeichen: null,
  wiederholungsHinweis: false,
});

/** Der Text, den (c) an den zweiten gleichen Fehler hängt. */
export const WIEDERHOLUNGS_HINWEIS =
  "HINWEIS: Derselbe Aufruf ist zweimal hintereinander mit demselben Fehler gescheitert. Wiederhole ihn nicht unverändert — ändere die Argumente, nimm ein anderes Werkzeug oder sage dem Nutzer, was fehlt.";

/** (b) für `read_note`: unverändert ohne Grenze oder unterhalb; sonst die ersten Zeichen mit der Kappung in Zeile 1. */
export function kappeLesen(text: string, rahmen: Readonly<RahmenSchalter>): string {
  const max = rahmen.leseGrenzeZeichen;
  if (max === null || text.length <= max) return text;
  return `[gekappt: die ersten ${max} von ${text.length} Zeichen; der Rest der Notiz fehlt in diesem Ergebnis]\n${text.slice(0, max)}`;
}

/** (b) für `Memory.md` im Prompt: unverändert ohne Grenze oder unterhalb; sonst die letzten Zeichen ab einer ganzen Zeile,
 *  mit der Kappung in Zeile 1 (englisch wie der übrige Prompt). */
export function kappeMemory(text: string, rahmen: Readonly<RahmenSchalter>): string {
  const max = rahmen.memoryGrenzeZeichen;
  if (max === null || text.length <= max) return text;
  const tail = text.slice(text.length - max);
  const nl = tail.indexOf("\n");
  const ganz = nl === -1 ? tail : tail.slice(nl + 1);
  return `(truncated: older lines omitted, showing the last ${ganz.length} of ${text.length} characters)\n${ganz}`;
}
