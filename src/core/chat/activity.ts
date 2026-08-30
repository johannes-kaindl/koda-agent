/* Was Koda gerade tut — als Zustand, nicht als Ja/Nein.
 *
 * Anlass (Quicktask Johannes): „Wenn Koda aktiv ist, ohne etwas zu schreiben, dann weiss man
 * momentan nicht, ob gerade was passiert." Ein blosses Lebenszeichen reicht dafuer nicht: die
 * lange Stille sitzt VOR dem ersten Token und zwischen den Werkzeugschritten, und beides sieht
 * von aussen gleich aus. Die Zeile muss also die Taetigkeit tragen.
 *
 * Pure gehalten, damit die Abfolge einer echten Runde testbar ist, ohne Obsidian zu starten —
 * dieselbe Bauart wie src/core/agent/compaction/.
 *
 * Loest die transiente Blase `summarizingHint()` in der View ab: das war derselbe Mechanismus
 * an einem zweiten Ort, und zwei Orte fuer „Koda arbeitet" melden dasselbe Ereignis doppelt. */

export type ActivityEvent =
  /** ask() startet. */                       | { kind: "ask" }
  /** ein Werkzeug beginnt (args = roher JSON-String des Modells). */
                                              | { kind: "tool-start"; name: string; args: string }
  /** das Werkzeug ist zurueck. */            | { kind: "tool-end" }
  /** erstes/weiteres Antwort-Token. */       | { kind: "token" }
  /** erstes/weiteres Reasoning-Token. */     | { kind: "reasoning" }
  /** Stufe-2-Verdichtung laeuft an. */       | { kind: "summarizing" }
  /** abschliessender renderLog(). */         | { kind: "done" };

export interface Activity {
  busy: boolean;
  /** i18n-Key der Taetigkeit; leer im Ruhezustand. */
  labelKey: string;
  /** Platzhalter {0} des Keys; leer, wenn der Key keinen braucht. */
  labelArg: string;
}

export const IDLE: Activity = { busy: false, labelKey: "", labelArg: "" };

const THINKING: Activity = { busy: true, labelKey: "activity.thinking", labelArg: "" };

/** Das eine Feld, das eine Werkzeug-Taetigkeit fuer einen Menschen lesbar macht.
 *  `save_memory` fehlt bewusst: sein einziges Feld ist der volle Merksatz — als Zeilen-Suffix
 *  waere er zu lang und als Fragment irrefuehrend. Dort steht das Werkzeug fuer sich. */
const ARG_FIELD: Record<string, string> = {
  search_notes: "query",
  read_note: "path",
  list_notes: "folder",
  write_note: "path",
  write_skill: "name",
  related_notes: "path",
};

const KNOWN_TOOLS = new Set([...Object.keys(ARG_FIELD), "save_memory"]);

const ARG_MAX = 40;

function shorten(s: string): string {
  return s.length <= ARG_MAX ? s : s.slice(0, ARG_MAX) + "…";
}

/** Argument aus dem rohen Werkzeug-JSON ziehen. Alles, was schiefgehen kann, endet in `null`
 *  und damit im generischen Label — eine falsche Beschriftung waere schlimmer als eine grobe. */
function argFor(name: string, rawArgs: string): string | null {
  const field = ARG_FIELD[name];
  if (field === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(rawArgs);
    if (typeof parsed !== "object" || parsed === null) return null;
    const value = (parsed as Record<string, unknown>)[field];
    // Nicht-Text (Zahl, Objekt, fehlend) ist kein Anzeigewert: das Modell hat dann etwas
    // geschickt, das der Werkzeugvertrag nicht vorsieht — der generische Fall ist ehrlicher.
    return typeof value === "string" && value !== "" ? shorten(value) : null;
  } catch {
    return null;
  }
}

function toolActivity(name: string, rawArgs: string): Activity {
  if (name === "save_memory") return { busy: true, labelKey: "activity.tool.save_memory", labelArg: "" };
  const arg = argFor(name, rawArgs);
  if (arg === null || !KNOWN_TOOLS.has(name)) {
    return { busy: true, labelKey: "activity.tool.generic", labelArg: shorten(name) };
  }
  return { busy: true, labelKey: `activity.tool.${name}`, labelArg: arg };
}

/** Jedes Ereignis bestimmt die Taetigkeit vollstaendig — `prev` geht bewusst nicht ein.
 *  Der Parameter bleibt in der Signatur, damit die Aufrufstelle wie ein `reduce` liest und
 *  eine spaetere Regel mit Gedaechtnis nichts umbaut. */
export function nextActivity(_prev: Activity, e: ActivityEvent): Activity {
  switch (e.kind) {
    case "ask":
    case "reasoning":
    // Nach einem Werkzeugschritt ist wieder das Modell dran — und genau dort liegt die zweite
    // tote Phase, in der frueher nichts zu sehen war.
    case "tool-end":
      return THINKING;
    case "token":
      return { busy: true, labelKey: "activity.writing", labelArg: "" };
    case "summarizing":
      return { busy: true, labelKey: "activity.summarizing", labelArg: "" };
    case "tool-start":
      return toolActivity(e.name, e.args);
    case "done":
      return IDLE;
  }
}
