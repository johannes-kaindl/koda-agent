/* Auswertung des Messrahmens als Markdown: Erfolgsrate je Modell und Arm, pass^3, Median der Runden und die übrigen Maße;
   dazu Erfolg je Aufgabe und die Fehlschläge mit Grund. Aufbau wie der Bericht von `tool-calling-parcour` (Fähigkeit und Tempo
   getrennt, Ladezeit eigene Spalte, Messbedingungen im Kopf). */
import type { LaufErgebnis } from "./laeufer";

export interface BerichtKopf {
  datum: string;
  endpunkt: string;
  wiederholungen: number;
  fensterToken: number;
  suppressThinking: boolean;
  /** Ladezeit (Aufwärmlauf) je Modell in ms; nicht in den Laufzeiten enthalten. */
  ladezeitMs: Record<string, number>;
  hinweis?: string;
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sek = (ms: number | null): string => (ms === null ? "–" : `${(ms / 1000).toFixed(1)} s`);
const zahl = (x: number | null): string => (x === null ? "–" : String(Math.round(x)));
const prozent = (x: number): string => `${Math.round(x * 100)} %`;

function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** pass^k je Aufgabe als Schätzer C(c,k)/C(n,k) (Wahrscheinlichkeit, dass k zufällig gezogene Läufe alle bestehen; τ-bench), gemittelt
 *  über die Aufgaben mit mindestens k Läufen. `null`, wenn keine Aufgabe k Läufe hat. */
export function passHochK(laeufe: LaufErgebnis[], k: number): number | null {
  const jeAufgabe = new Map<string, LaufErgebnis[]>();
  for (const l of laeufe) jeAufgabe.set(l.aufgabe, [...(jeAufgabe.get(l.aufgabe) ?? []), l]);
  const werte = [...jeAufgabe.values()].filter((ls) => ls.length >= k).map((ls) => binom(ls.filter((l) => l.bestanden).length, k) / binom(ls.length, k));
  return werte.length === 0 ? null : werte.reduce((a, b) => a + b, 0) / werte.length;
}

const zelle = (s: string): string => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function bericht(laeufe: LaufErgebnis[], kopf: BerichtKopf): string {
  const gruppen = new Map<string, LaufErgebnis[]>();
  for (const l of laeufe) {
    const key = `${l.modell}\u0000${l.arm}`;
    gruppen.set(key, [...(gruppen.get(key) ?? []), l]);
  }
  const L: string[] = [];
  L.push("# Messrahmen Koda — Bericht", "");
  L.push(`- **Datum:** ${kopf.datum}`);
  L.push(`- **Endpunkt:** \`${kopf.endpunkt}\``);
  L.push(`- **Wiederholungen je Aufgabe:** ${kopf.wiederholungen} · **Kontextfenster:** ${kopf.fensterToken} Token · **Temperatur:** 0.2 (Betrieb) · **Denken unterdrückt:** ${kopf.suppressThinking ? "ja" : "nein"}`);
  L.push(`- **Läufe:** ${laeufe.length}`);
  if (kopf.hinweis !== undefined) L.push("", `> ${kopf.hinweis}`);
  L.push("", "## Erfolg und Maße je Modell und Arm", "");
  L.push("| Modell | Arm | Läufe | Erfolg | pass^3 | Runden (Median) | Aufrufe (Mittel) | Fehler | ident. Wdh. | Verdichtungen | Überlauf | Rundenlimit | Bestätigungen | Prompt-Token (Median) | Cache-Token (Median) | erstes Token (Median) | Gesamt (Median) | Ladezeit |");
  L.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const ls of gruppen.values()) {
    const ok = ls.filter((l) => l.bestanden).length;
    const p3 = passHochK(ls, 3);
    const nz = (f: (l: LaufErgebnis) => number | null): number[] => ls.map(f).filter((x): x is number => x !== null);
    const summe = (f: (l: LaufErgebnis) => number): number => ls.reduce((a, l) => a + f(l), 0);
    L.push(`| \`${ls[0].modell}\` | ${ls[0].arm} | ${ls.length} | ${ok}/${ls.length} (${prozent(ok / ls.length)}) | ${p3 === null ? "–" : prozent(p3)} | ${zahl(median(ls.map((l) => l.runden)))} | ${(summe((l) => l.aufrufe) / ls.length).toFixed(1)} | ${summe((l) => l.fehler)} | ${summe((l) => l.identischeWiederholungen)} | ${summe((l) => l.verdichtungen)} | ${summe((l) => l.ueberlaufWiederholungen)} | ${summe((l) => l.rundenlimit)} | ${summe((l) => l.bestaetigungen)} | ${zahl(median(nz((l) => l.promptToken)))} | ${zahl(median(nz((l) => l.cacheToken)))} | ${sek(median(nz((l) => l.ttftMs)))} | ${sek(median(ls.map((l) => l.gesamtMs)))} | ${sek(kopf.ladezeitMs[ls[0].modell] ?? null)} |`);
  }
  const spalten = [...gruppen.values()].map((ls) => ({ titel: `${ls[0].modell} · ${ls[0].arm}`, ls }));
  const aufgaben = [...new Set(laeufe.map((l) => l.aufgabe))];
  L.push("", "## Erfolg je Aufgabe", "");
  L.push(`| Aufgabe | ${spalten.map((s) => `\`${s.titel}\``).join(" | ")} |`);
  L.push(`|---|${spalten.map(() => "---").join("|")}|`);
  for (const id of aufgaben) {
    const art = laeufe.find((l) => l.aufgabe === id)?.art ?? "";
    L.push(`| \`${id}\` (${art}) | ${spalten.map((s) => {
      const rs = s.ls.filter((l) => l.aufgabe === id);
      return rs.length === 0 ? "–" : `${rs.filter((l) => l.bestanden).length}/${rs.length}`;
    }).join(" | ")} |`);
  }
  const fehl = laeufe.filter((l) => !l.bestanden);
  if (fehl.length > 0) {
    L.push("", "## Fehlschläge", "", "Je Zeile ein Lauf; der Verlauf steht in `laeufe.jsonl`. Erst die Verläufe lesen, dann urteilen: ein Prüferfehler sieht aus wie ein Modellfehler.", "");
    L.push("| Modell | Arm | Aufgabe | Lauf | Grund |");
    L.push("|---|---|---|---|---|");
    for (const f of fehl) {
      const grund = [...f.befunde.filter((b) => !b.pass).map((b) => b.note), ...f.laufFehler].join("; ");
      L.push(`| \`${f.modell}\` | ${f.arm} | \`${f.aufgabe}\` | ${f.wiederholung} | ${zelle(grund).slice(0, 240)} |`);
    }
  }
  L.push("");
  return L.join("\n");
}
