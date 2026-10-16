// where.ts — Frontmatter-Filter für list_notes. Rein: kein obsidian-Import (check:pure).
//
// Warum es das gibt: „alle offenen Aufgaben eines Projekts“ soll ein Aufruf sein, nicht
// „alles listen und selbst durchsehen“ — dasselbe Argument wie bei list_notes selbst
// (Vollständigkeit kostet sonst N Schritte, Raten ist billiger). Das hier ist STRUKTURELL
// (Feld, Operator, Wert), kein Urteil über Treffergüte; Retrieval bleibt bei vault-rag.

import { nf } from "./list";

export const WHERE_OPS = ["=", "!=", "contains", "exists", "missing"] as const;
export type WhereOp = (typeof WHERE_OPS)[number];
export interface WhereClause { field: string; op: WhereOp; value?: string }

export type WhereParse = { ok: true; clauses: WhereClause[] } | { ok: false; error: string };

const OPS_TEXT = WHERE_OPS.map((o) => `"${o}"`).join(", ");

/** Prüft die Modell-Eingabe. Fehler sind Werte mit Klartext: ein stillschweigend verworfener
 *  Filter lieferte eine vollständig aussehende, aber ungefilterte Liste — genau die
 *  Fehlerklasse, gegen die list_notes antritt. */
export function parseWhere(raw: unknown): WhereParse {
  if (raw === undefined || raw === null) return { ok: true, clauses: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: `where muss eine Liste von Bedingungen sein, z. B. [{"field":"status","op":"=","value":"offen"}] — bekommen: ${typeof raw}.` };
  }
  const clauses: WhereClause[] = [];
  for (const [i, c] of raw.entries()) {
    const at = `where[${i}]`;
    if (typeof c !== "object" || c === null) return { ok: false, error: `${at} ist keine Bedingung (erwartet {field, op, value}).` };
    const o = c as Record<string, unknown>;
    if (typeof o.field !== "string" || o.field.trim() === "") return { ok: false, error: `${at}: field fehlt (Name des Frontmatter-Felds).` };
    const op = o.op;
    if (typeof op !== "string" || !(WHERE_OPS as readonly string[]).includes(op)) {
      return { ok: false, error: `${at}: unbekannter Operator "${String(op)}" — erlaubt sind ${OPS_TEXT}.` };
    }
    if (op === "exists" || op === "missing") {
      clauses.push({ field: o.field.trim(), op });
      continue;
    }
    const v = o.value;
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") {
      return { ok: false, error: `${at}: value fehlt (Operator "${op}" braucht einen Wert).` };
    }
    clauses.push({ field: o.field.trim(), op: op as WhereOp, value: String(v) });
  }
  return { ok: true, clauses };
}

const norm = (s: string): string => nf(s).trim().toLowerCase();

/** Die Werte eines Felds als Texte; Liste → ein Text je Element. Leere Werte fallen weg:
 *  „leer“ und „fehlt“ sind für die Übersicht dasselbe (wie `formatFieldValue`). */
function textsOf(v: unknown): string[] {
  const items = Array.isArray(v) ? v : [v];
  const out: string[] = [];
  for (const x of items) {
    if (x === null || x === undefined) continue;
    if (typeof x === "string" || typeof x === "number" || typeof x === "boolean" || typeof x === "bigint") {
      const s = norm(String(x));
      if (s !== "") out.push(s);
    }
  }
  return out;
}

function valuesOf(fm: Record<string, unknown> | null, field: string): string[] {
  // hasOwnProperty: `field: "toString"` darf nicht den geerbten Prototyp-Eintrag treffen.
  if (fm === null || !Object.prototype.hasOwnProperty.call(fm, field)) return [];
  return textsOf(fm[field]);
}

/** Alle Bedingungen müssen gelten (UND). `=` ist ein ganzer Wert (auf Listen: ein Element),
 *  `contains` ein Teilstring. Ein fehlendes Feld erfüllt weder `=` noch `contains`, wohl
 *  aber `!=` und `missing`. */
export function matchesWhere(fm: Record<string, unknown> | null, clauses: WhereClause[]): boolean {
  return clauses.every((c) => {
    const vals = valuesOf(fm, c.field);
    const want = norm(c.value ?? "");
    switch (c.op) {
      case "exists": return vals.length > 0;
      case "missing": return vals.length === 0;
      case "=": return vals.includes(want);
      case "!=": return !vals.includes(want);
      case "contains": return vals.some((v) => v.includes(want));
    }
  });
}

export function describeWhere(clauses: WhereClause[]): string {
  return clauses.map((c) => {
    if (c.op === "exists") return `${c.field} gesetzt`;
    if (c.op === "missing") return `${c.field} fehlt`;
    return `${c.field} ${c.op} "${c.value ?? ""}"`;
  }).join(" UND ");
}
