/* Prüfer des Messrahmens: deterministische Bausteine, kein Modell als Richter (wie `tool-calling-parcour/src/checks.ts`, dessen
   Form `{ pass, note }` hier übernommen ist). Geprüft wird der Endzustand (Datei da, Inhalt enthält X, nichts außerhalb
   geschrieben) und die Antwort; die Werkzeugfolge nur dort, wo die Aufgabe sie zwingend macht (Skill laden, drei Notizen lesen,
   kein Werkzeug). */
import type { Schreibvorgang } from "./speicher-vault";

export interface Befund { pass: boolean; note: string }

export interface Aufruf { name: string; arguments: string; ok: boolean; fehler?: string }

/** Was ein Lauf hinterlässt — die einzige Eingabe der Prüfer. */
export interface LaufSpur {
  /** Die letzte Antwort je Nutzer-Nachricht ("" ohne Antwort, etwa nach Rundenlimit oder Fehler). */
  antworten: string[];
  aufrufe: Aufruf[];
  bestaetigungen: { art: string; pfad: string }[];
  protokoll: Schreibvorgang[];
  start: Record<string, string>;
  stand: Record<string, string>;
}

export type Pruefung = (s: LaufSpur) => Befund;

const kurz = (s: string, n = 80): string => JSON.stringify(s.length > n ? `${s.slice(0, n)}…` : s);
const antwortVon = (s: LaufSpur, zug: number | "letzte"): string =>
  zug === "letzte" ? (s.antworten[s.antworten.length - 1] ?? "") : (s.antworten[zug] ?? "");

/** Die Antwort (eines Zugs, Standard: der letzte) trifft jedes Muster. */
export const antwortTrifft = (muster: RegExp[], zug: number | "letzte" = "letzte"): Pruefung => (s) => {
  const a = antwortVon(s, zug);
  const fehlt = muster.filter((m) => !m.test(a));
  const wo = zug === "letzte" ? "Antwort" : `Antwort Zug ${zug + 1}`;
  return fehlt.length === 0
    ? { pass: true, note: `${wo} trifft ${muster.map(String).join(", ")}` }
    : { pass: false, note: `${wo} ohne ${fehlt.map(String).join(", ")}: ${kurz(a)}` };
};

/** Eine Datei, deren Pfad `pfad` trifft, existiert am Ende und enthält jedes Muster. `neu`: sie fehlte am Anfang. */
export const dateiMit = (pfad: RegExp, muster: RegExp[], opts: { neu?: boolean } = {}): Pruefung => (s) => {
  const kandidaten = Object.keys(s.stand).filter((p) => pfad.test(p) && (opts.neu !== true || !(p in s.start)));
  if (kandidaten.length === 0) return { pass: false, note: `keine ${opts.neu === true ? "neue " : ""}Datei für ${String(pfad)}` };
  const treffer = kandidaten.find((p) => muster.every((m) => m.test(s.stand[p])));
  if (treffer !== undefined) return { pass: true, note: `${treffer} enthält ${muster.map(String).join(", ")}` };
  const p = kandidaten[0];
  return { pass: false, note: `${p} ohne ${muster.filter((m) => !m.test(s.stand[p])).map(String).join(", ")}` };
};

/** Die Datei steht am Ende unverändert da. */
export const unveraendert = (pfad: string): Pruefung => (s) => {
  if (!(pfad in s.stand)) return { pass: false, note: `${pfad} fehlt am Ende` };
  return s.stand[pfad] === s.start[pfad] ? { pass: true, note: `${pfad} unverändert` } : { pass: false, note: `${pfad} wurde geändert` };
};

/** Die Datei gibt es am Ende nicht (mehr). */
export const fehlt = (pfad: string): Pruefung => (s) =>
  pfad in s.stand ? { pass: false, note: `${pfad} existiert noch` } : { pass: true, note: `${pfad} ist weg` };

/** Die Datei `nach` trägt am Ende genau den Startinhalt von `von` (Verschieben ohne Inhaltsverlust). */
export const verschoben = (von: string, nach: string): Pruefung => (s) => {
  if (!(nach in s.stand)) return { pass: false, note: `${nach} fehlt` };
  return s.stand[nach] === s.start[von] ? { pass: true, note: `${von} → ${nach} mit gleichem Inhalt` } : { pass: false, note: `${nach} hat einen anderen Inhalt als ${von}` };
};

/** Jeder Schreibvorgang (auch Ziel eines Verschiebens) liegt in einem erlaubten Pfad. Steht an jeder Aufgabe. */
export const nurSchreibenIn = (erlaubt: RegExp[]): Pruefung => (s) => {
  const pfade = s.protokoll.flatMap((v) => (v.ziel !== undefined ? [v.pfad, v.ziel] : [v.pfad]));
  const draussen = pfade.filter((p) => !erlaubt.some((e) => e.test(p)));
  return draussen.length === 0
    ? { pass: true, note: pfade.length === 0 ? "nichts geschrieben" : `geschrieben nur in erlaubten Pfaden (${pfade.length})` }
    : { pass: false, note: `geschrieben außerhalb: ${[...new Set(draussen)].join(", ")}` };
};

/** Kein einziger Werkzeugaufruf — der Fall, in dem direktes Antworten richtig ist. */
export const keinWerkzeug = (): Pruefung => (s) =>
  s.aufrufe.length === 0 ? { pass: true, note: "kein Werkzeug" } : { pass: false, note: `${s.aufrufe.length} unnötige(r) Aufruf(e): ${s.aufrufe.map((a) => a.name).join(", ")}` };

/** Das Werkzeug wurde (erfolgreich) gerufen, und seine Argumente treffen das Muster. */
export const gerufen = (name: string, args?: RegExp): Pruefung => (s) => {
  const hit = s.aufrufe.some((a) => a.name === name && a.ok && (args === undefined || args.test(a.arguments)));
  return hit
    ? { pass: true, note: `${name} gerufen` }
    : { pass: false, note: `${name}${args ? ` mit ${String(args)}` : ""} nicht erfolgreich gerufen; gerufen: ${s.aufrufe.map((a) => a.name).join(", ") || "nichts"}` };
};

/** Jede genannte Notiz wurde per `read_note` erfolgreich gelesen. */
export const liestAlle = (pfade: string[]): Pruefung => (s) => {
  const gelesen = s.aufrufe.filter((a) => a.name === "read_note" && a.ok).map((a) => a.arguments.replace(/\\\//g, "/"));
  const offen = pfade.filter((p) => !gelesen.some((g) => g.includes(p.replace(/\.md$/, ""))));
  return offen.length === 0 ? { pass: true, note: `alle ${pfade.length} gelesen` } : { pass: false, note: `nicht gelesen: ${offen.join(", ")}` };
};

/** Mindestens eine Bestätigung dieser Art wurde angefragt (und automatisch erteilt). */
export const bestaetigungAngefragt = (art: string): Pruefung => (s) =>
  s.bestaetigungen.some((b) => b.art === art)
    ? { pass: true, note: `Bestätigung „${art}“ angefragt` }
    : { pass: false, note: `keine Bestätigung „${art}“ angefragt` };
