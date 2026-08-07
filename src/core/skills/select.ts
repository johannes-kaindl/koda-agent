import type { Skill } from "./skill";

export interface Selection {
  /** voller Body im System-Prompt */
  loaded: Skill[];
  /** Budget erschoepft — nur die description im Prompt */
  descriptionOnly: Skill[];
  /** enabled: false — bewusst abgeschaltete Skills. Erscheinen weder im Prompt noch in
   *  der Chat-Meldung: ein selbst gesetztes enabled: false braucht keine Rueckmeldung,
   *  die Datei liegt ja sichtbar im Vault. Das Feld existiert trotzdem, fuer Aufrufer,
   *  die den Unterschied zwischen "nicht gefunden" und "gefunden, aber aus" brauchen. */
  disabled: string[];
}

/** Greedy nach Namen sortiert. Die Sortierung ist willkuerlich, aber vorhersagbar und
 *  stabil — und genau das ist die Eigenschaft, die zaehlt: dieselben Dateien ergeben
 *  immer dieselbe Auswahl. Gezaehlt wird nur der Body; die description steht ohnehin
 *  fuer jeden Skill im Prompt, auch fuer die ausgelassenen. */
export function selectSkills(skills: Skill[], budgetChars: number): Selection {
  const sorted = [...skills].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const loaded: Skill[] = [];
  const descriptionOnly: Skill[] = [];
  const disabled: string[] = [];
  let used = 0;
  for (const s of sorted) {
    if (!s.enabled) {
      disabled.push(s.name);
      continue;
    }
    if (used + s.body.length <= budgetChars) {
      loaded.push(s);
      used += s.body.length;
    } else {
      descriptionOnly.push(s);
    }
  }
  return { loaded, descriptionOnly, disabled };
}
