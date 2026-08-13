export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "search_notes",
    description:
      "Search the vault by file name and full text. Returns matching note paths with a short snippet. Use before answering questions about the vault.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term (case-insensitive substring)" },
        max_results: { type: "integer", description: "Maximum results, default 10" },
      },
      required: ["query"],
    },
  },
  {
    name: "read_note",
    description: "Read the full content of one Markdown note. Path must be vault-relative and end in .md.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Vault-relative path, e.g. Projekte/Plan.md" } },
      required: ["path"],
    },
  },
  {
    name: "write_note",
    description:
      "Create, append to, or replace a Markdown note. Writing outside the Koda folder requires the user's approval; a rejected write is reported back to you.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path ending in .md" },
        content: { type: "string", description: "Markdown content to write" },
        mode: {
          type: "string",
          enum: ["create", "append", "replace"],
          description:
            "Required. 'create' for a new note (fails if it exists), 'append' to add to the end of an existing note, 'replace' to overwrite it entirely. Prefer 'append' when adding to an existing note — 'replace' discards everything else in the file.",
        },
      },
      required: ["path", "content", "mode"],
    },
  },
  {
    name: "save_memory",
    description:
      "Append one learned fact, preference, or correction to Koda's persistent memory note. Use sparingly for durable knowledge, not conversation details.",
    parameters: {
      type: "object",
      properties: { text: { type: "string", description: "One concise memory line" } },
      required: ["text"],
    },
  },
  {
    name: "write_skill",
    description:
      "Create or replace one of your own skills — a named Markdown instruction that changes how you behave in future conversations. Always requires the user's approval, even though skills live in the Koda folder. Use this when the user teaches you a rule that should keep applying; use save_memory for facts instead.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short skill name, becomes the file name" },
        description: {
          type: "string",
          description: "One sentence describing what will be different from now on. Shown to the user for approval.",
        },
        body: { type: "string", description: "The instruction itself, in Markdown" },
        mode: {
          type: "string",
          enum: ["create", "replace"],
          description: "Required. 'create' for a new skill (fails if it exists), 'replace' to overwrite an existing one entirely.",
        },
      },
      required: ["name", "description", "body", "mode"],
    },
  },
];

export function toWireTools(defs: ToolDef[]): unknown[] {
  return defs.map((d) => ({ type: "function", function: d }));
}

/** Nur verfuegbar, wenn vault-rag einen Index bereitstellt — deshalb kein Teil von
 *  TOOL_DEFS. Ein Werkzeug im Prompt, das nicht laufen kann, kostet Kontext und
 *  provoziert Fehlversuche; bei lokalen Modellen ist die Werkzeugzahl ein
 *  Zuverlaessigkeitsfaktor (Messgrundlage: docs/LAB.md). */
const RELATED_DEF: ToolDef = {
  name: "related_notes",
  description:
    "Find notes semantically related to a given note, using the vault's embedding index. Use it to explore the context around a note: it surfaces connections that share no literal wording, which search_notes cannot find.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Vault-relative path of the note to start from" },
    },
    required: ["path"],
  },
};

/** Die Werkzeugliste haengt am Zustand der Nachbarplugins und wird deshalb je Gespraech
 *  gebaut statt als Konstante ausgeliefert. Die Kopie ist Absicht: ein Aufrufer soll
 *  TOOL_DEFS nicht versehentlich veraendern koennen. */
export function toolDefs(opts: { related: boolean }): ToolDef[] {
  return opts.related ? [...TOOL_DEFS, RELATED_DEF] : [...TOOL_DEFS];
}
