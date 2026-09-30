import type { Skill } from "./skill";

export interface Selection {
  /** gepinnte Skills: voller Body im System-Prompt */
  loaded: Skill[];
  /** nicht gepinnt — nur die description im Prompt, den Body holt `load_skill` */
  descriptionOnly: Skill[];
  /** enabled: false — bewusst abgeschaltete Skills. Erscheinen weder im Prompt noch in
   *  der Chat-Meldung: ein selbst gesetztes enabled: false braucht keine Rueckmeldung,
   *  die Datei liegt ja sichtbar im Vault. Das Feld existiert trotzdem, fuer Aufrufer,
   *  die den Unterschied zwischen "nicht gefunden" und "gefunden, aber aus" brauchen. */
  disabled: string[];
  /** Zeichen, um die die gepinnten Bodies `skillBudgetChars` uebersteigen; 0 = im Budget.
   *  Der Pin gewinnt ueber das Budget — ueberschritten wird gemeldet, nicht gekappt. */
  overBudget: number;
}

/** Zweistufig: gepinnte Skills kommen immer voll, alle anderen nur mit description (Name
 *  aufsteigend — vorhersagbar und stabil, dieselben Dateien ergeben dieselbe Auswahl).
 *  Das Budget ist die Obergrenze fuer die gepinnten; sprengen sie es, laden sie trotzdem und
 *  `overBudget` nennt den Ueberhang. Gezaehlt wird nur der Body — die description steht ohnehin
 *  fuer jeden Skill im Prompt. */
export function selectSkills(skills: Skill[], budgetChars: number): Selection {
  const sorted = [...skills].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const loaded: Skill[] = [];
  const descriptionOnly: Skill[] = [];
  const disabled: string[] = [];
  let used = 0;
  for (const s of sorted) {
    if (!s.enabled) {
      disabled.push(s.name);
    } else if (s.pinned) {
      loaded.push(s);
      used += s.body.length;
    } else {
      descriptionOnly.push(s);
    }
  }
  return { loaded, descriptionOnly, disabled, overBudget: Math.max(0, used - budgetChars) };
}
