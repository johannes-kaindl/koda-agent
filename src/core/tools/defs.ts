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
];

export function toWireTools(defs: ToolDef[]): unknown[] {
  return defs.map((d) => ({ type: "function", function: d }));
}
