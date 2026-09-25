export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "search_notes",
    description:
      "Search the vault by file name and full text. Returns matching note paths with a short snippet. Use before answering questions about the vault. Use list_notes instead when you need everything in a folder — search only finds literal matches and cannot tell you what a folder contains.",
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
    description: "Read the full content of one note. Path must be vault-relative and end in .md, .base (a Bases view definition, YAML) or .canvas (a canvas, JSON).",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Vault-relative path, e.g. Projekte/Plan.md or Projekte/Overview.base" } },
      required: ["path"],
    },
  },
  {
    name: "list_notes",
    description:
      "List every note in a vault folder in ONE call, with the frontmatter fields you ask for. Use this whenever completeness matters — all tasks in a folder and their status, all notes of a project — instead of opening notes one by one or inferring the list from prose you read elsewhere. If the result is capped, the first line says so. Without recursive, the first lines also name the subfolders and how many notes each holds, including subfolders that hold no notes.",
    parameters: {
      type: "object",
      properties: {
        folder: { type: "string", description: "Vault-relative folder, e.g. Projekt/_Tasks. Empty string means the vault root." },
        recursive: { type: "boolean", description: "Include subfolders. Default false." },
        fields: {
          type: "array",
          items: { type: "string" },
          description: "Frontmatter field names to show per note, e.g. [\"status\",\"priority\"]. Omit for paths only.",
        },
      },
      required: ["folder"],
    },
  },
  {
    name: "get_workspace",
    description:
      "What the user is looking at right now: the active note with its properties, the full selection, the lines around the cursor, and every open tab. A user message may start with a short [Working context] block that summarises this; call get_workspace when you need the full selection, the cursor surroundings, or the complete tab list.",
    parameters: {
      type: "object",
      properties: {
        around_cursor: { type: "integer", description: "Lines of context above and below the cursor, default 20" },
      },
      required: [],
    },
  },
  {
    name: "edit_active_note",
    description:
      "Edit the note the user is working in: replace the current selection or insert at the cursor. Always shows the change and asks the user first. Pass the path of the active note exactly as given in the working context; the call fails if another note became active or the selection changed since.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Vault-relative path of the active note, as shown in the working context" },
        // Kein `enum` hier — google/gemma-4-31b (Original-Template) scheitert an einem
        // String-enum im Tool-Schema mit HTTP 400 "Unknown test: sequence" (llm-setup
        // gemma-4-31b-tool-schema-bug.md). Die erlaubten Werte stehen deshalb nur in der
        // description; VaultTools.editActiveNote validiert sie selbst und meldet einen
        // falschen Wert als Tool-Ergebnis zurueck.
        mode: { type: "string", description: "One of replace_selection, insert_at_cursor. replace_selection needs a selection; insert_at_cursor inserts at the caret" },
        text: { type: "string", description: "The replacement or the text to insert" },
      },
      required: ["path", "mode", "text"],
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
        // Kein `enum` (s. edit_active_note.mode oben) — die Werte stehen in der description,
        // write() in vault-tools.ts validiert sie.
        mode: {
          type: "string",
          description:
            "Required, one of create/append/replace. 'create' for a new note (fails if it exists), 'append' to add to the end of an existing note, 'replace' to overwrite it entirely. Prefer 'append' when adding to an existing note — 'replace' discards everything else in the file.",
        },
      },
      required: ["path", "content", "mode"],
    },
  },
  {
    name: "move_note",
    description:
      "Move or rename a Markdown note. Obsidian updates the wikilinks in every note that "
      + "links to it, so links stay intact. Moving within the Koda folder is free; anything "
      + "else requires the user's approval. Fails if the source is missing or the target "
      + "path is already taken — it never overwrites.",
    parameters: {
      type: "object",
      properties: {
        source_path: { type: "string", description: "Vault-relative path of the note to move, ending in .md" },
        destination_path: {
          type: "string",
          description:
            "Vault-relative target path ending in .md. Same folder with a different file name renames the note; "
            + "a different folder moves it. Missing folders are created.",
        },
      },
      required: ["source_path", "destination_path"],
    },
  },
  {
    name: "delete_note",
    description:
      "Move a Markdown note to the trash. Always requires the user's approval, even inside "
      + "the Koda folder. The note goes to the vault's configured trash rather than being "
      + "erased, but notes linking to it will have broken links — prefer move_note into an "
      + "archive folder when the content might still be wanted.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Vault-relative path ending in .md" } },
      required: ["path"],
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
        // Kein `enum` (s. edit_active_note.mode oben) — writeSkill() in vault-tools.ts
        // validiert die Werte.
        mode: {
          type: "string",
          description: "Required, one of create/replace. 'create' for a new skill (fails if it exists), 'replace' to overwrite an existing one entirely.",
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

/** Die Werkzeugliste haengt am Zustand der Nachbarplugins UND an der Wahl des Nutzers und
 *  wird deshalb je Gespraech gebaut statt als Konstante ausgeliefert. Sie ist der einzige
 *  Ort, an dem sie entsteht — abgeschaltet heisst hier: nicht gesendet, das Modell erfaehrt
 *  nichts davon (Spec E3). Die Kopie ist Absicht: ein Aufrufer soll TOOL_DEFS nicht
 *  versehentlich veraendern koennen. */
export function toolDefs(opts: {
  related: boolean;
  disabled?: string[];
  descriptions?: Record<string, string>;
}): ToolDef[] {
  const alle = opts.related ? [...TOOL_DEFS, RELATED_DEF] : [...TOOL_DEFS];
  const aus = new Set(opts.disabled ?? []);
  const eigen = opts.descriptions ?? {};
  return alle
    .filter((d) => !aus.has(d.name))
    .map((d) => {
      const text = (eigen[d.name] ?? "").trim();
      return text === "" ? { ...d } : { ...d, description: text };
    });
}
