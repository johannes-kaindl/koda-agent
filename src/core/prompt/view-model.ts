import { DEFAULT_RULES, checkRules, effectiveRules, type RuleWarning } from "./rules";
import { activeReadingTools, availableReadingTools } from "./effective";
import { toolDefs } from "../tools/defs";

/** Was die Anweisungs-Zeile zeigt. Der Auslieferungsstand ist der PLATZHALTER, nie der
 *  Wert (Spec E2) — und geprueft wird der Text, der wirklich gilt: ohne Override ist das
 *  der Auslieferungsstand, sonst der Override. */
export interface PromptRowModel {
  value: string;
  placeholder: string;
  warnings: RuleWarning[];
  /** Die lesenden Werkzeuge, die der Nutzer abgeschaltet hat — leer, solange alles aktiv
   *  ist. Die Warnung `reading-tool-off` nennt sie beim Namen: „ein Lesewerkzeug fehlt"
   *  schickt sonst auf die Suche nach dem Schalter, um den es geht. Das MODELL erfaehrt
   *  weiterhin nichts davon (Spec E3, Entscheidung Johannes 2026-09-05) — abgeschaltet
   *  heisst abgeschaltet; gewarnt wird dort, wo die Entscheidung faellt. */
  readingToolsOff: string[];
}

export function promptRow(
  s: { systemPromptOverride: string; toolsDisabled: string[] },
  related: boolean,
): PromptRowModel {
  // Dieselbe Funktion, die auch `buildSystemPrompt` waehlen laesst: die Warnzeile prueft
  // damit garantiert den Text, der gesendet wird (Spec E2, eine Wahrheit).
  const wirksam = effectiveRules(s.systemPromptOverride);
  const aktiv = activeReadingTools(s.toolsDisabled, related);
  const moeglich = availableReadingTools(related);
  return {
    value: s.systemPromptOverride,
    placeholder: DEFAULT_RULES,
    warnings: checkRules(wirksam, aktiv, moeglich),
    readingToolsOff: moeglich.filter((n) => !aktiv.includes(n)),
  };
}

/** Eine Zeile je Werkzeug — die volle Liste, auch `read_image` ohne Bildsicht (dann
 *  `unavailable`). Ein Werkzeug, das spurlos verschwindet, schickt den Nutzer auf die
 *  Suche nach einem Schalter, den es nie gab (Spec E3). */
export interface ToolRowModel {
  name: string;
  /** Die ausgelieferte Beschreibung — immer, auch wenn eine eigene gesetzt ist. */
  placeholder: string;
  /** Die eigene Beschreibung, "" wenn keine. */
  own: string;
  enabled: boolean;
  unavailable: boolean;
  /** Was fehlt, wenn `unavailable`: benennt den Hinweis neben dem Namen. */
  needs: "image-read" | "image-gen" | "plugin-missing" | null;
}

export function toolRows(
  s: { toolsDisabled: string[]; toolDescriptions: Record<string, string> },
  // Standard: verfuegbar — nur ein Aufrufer, der es anders weiss (Settings-Tab), graut aus.
  images: { read: boolean; generate: boolean } = { read: true, generate: true },
): ToolRowModel[] {
  const aus = new Set(s.toolsDisabled);
  // Die ganze Liste; die Verfuegbarkeit entscheidet nur ueber die Ausgrauung, nicht ueber die
  // Sichtbarkeit. `related_notes` gehoert nicht dazu: es kommt von vault-rag und steht in dessen Gruppe. Ohne `descriptions` — der Platzhalter MUSS
  // der Auslieferungsstand bleiben, sonst ist er nach einer eigenen Beschreibung
  // unwiederbringlich weg.
  return toolDefs({ readImage: true, generateImage: true }).map((d) => {
    const needs: ToolRowModel["needs"] =
      d.name === "read_image" && !images.read ? "image-read"
        : d.name === "generate_image" && !images.generate ? "image-gen"
          : null;
    return {
      name: d.name,
      placeholder: d.description,
      own: s.toolDescriptions[d.name] ?? "",
      enabled: !aus.has(d.name),
      unavailable: needs !== null,
      needs,
    };
  });
}

/** Zeilen fuer Werkzeuge, die fremde Plugins anbieten — dieselbe Zeile wie ein eigenes Werkzeug
 *  (Schalter + eigene Beschreibung), gruppiert je Plugin. Namen, die ein Wirts-Werkzeug
 *  verdeckt (Kollision), bekommen keine Zeile: sie werden nie gesendet.
 *
 *  Dazu die Namen, die der Nutzer abgeschaltet oder umbeschrieben hat und die KEIN Anbieter
 *  mehr liefert (Plugin deaktiviert): sie bleiben als ausgegraute Zeile sichtbar, mit dem
 *  Schalter — sonst waere eine Einstellung ohne Ort, an dem man sie zuruecknimmt. */
export interface ProviderToolGroup { id: string; rows: ToolRowModel[] }
/** Ein Werkzeug, das nicht angeboten wird, weil sein Name schon vergeben ist. `with`: die Id des
 *  Anbieters, der den Namen zuerst belegt hat; `null` heisst, ein eigenes Werkzeug Kodas. */
export interface ProviderToolCollision { id: string; name: string; with: string | null }

export function providerToolGroups(
  s: { toolsDisabled: string[]; toolDescriptions: Record<string, string> },
  offers: ReadonlyArray<{ id: string; tools: ReadonlyArray<{ name: string; description: string }> }>,
  hostNames: ReadonlySet<string>,
): { groups: ProviderToolGroup[]; missing: ToolRowModel[]; collisions: ProviderToolCollision[] } {
  const aus = new Set(s.toolsDisabled);
  const gesehen = new Set<string>();
  const von = new Map<string, string>();
  const collisions: ProviderToolCollision[] = [];
  const groups: ProviderToolGroup[] = [];
  for (const o of offers) {
    const rows: ToolRowModel[] = [];
    for (const t of o.tools) {
      if (hostNames.has(t.name)) { collisions.push({ id: o.id, name: t.name, with: null }); continue; }
      if (gesehen.has(t.name)) { collisions.push({ id: o.id, name: t.name, with: von.get(t.name) ?? null }); continue; }
      gesehen.add(t.name);
      von.set(t.name, o.id);
      rows.push({ name: t.name, placeholder: t.description, own: s.toolDescriptions[t.name] ?? "", enabled: !aus.has(t.name), unavailable: false, needs: null });
    }
    if (rows.length > 0) groups.push({ id: o.id, rows });
  }
  const bekannt = new Set<string>([...hostNames, ...gesehen]);
  const namen = [...new Set([...s.toolsDisabled, ...Object.keys(s.toolDescriptions)])].filter((n) => !bekannt.has(n)).sort();
  const missing = namen.map((name): ToolRowModel => ({
    name, placeholder: "", own: s.toolDescriptions[name] ?? "", enabled: !aus.has(name), unavailable: true, needs: "plugin-missing",
  }));
  return { groups, missing, collisions };
}
