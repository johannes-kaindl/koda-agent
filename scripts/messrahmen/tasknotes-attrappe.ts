/* TaskNotes-Attrappe für den Messrahmen: die Teilmenge der In-App-API, die Kodas Adapter (src/core/tools/tasknotes.ts)
   ruft, über dem Speicher-Vault. Eine Aufgabe ist eine Notiz unter `TaskNotes/Tasks/` mit Frontmatter, wie TaskNotes sie
   anlegt; der Prüfer misst die Aufgabe deshalb am Vault, nicht an der Attrappe. Kein Nachbau von TaskNotes: Feld-Mapping,
   Dateinamen und Standardwerte des echten Plugins sind hier vereinfacht (Grenze in docs/internal/messrahmen.md). */
import type { TaskInfo, TaskNotesApi } from "../../src/core/tools/tasknotes";
import type { SpeicherVault } from "./speicher-vault";

export const TASK_ORDNER = "TaskNotes/Tasks";

const STATUSES = [{ value: "open" }, { value: "in-progress" }, { value: "done", isCompleted: true }];
const PRIORITIES = [{ value: "low" }, { value: "normal" }, { value: "high" }];

function zeile(k: string, v: unknown): string {
  return Array.isArray(v) ? `${k}: [${v.join(", ")}]` : `${k}: ${String(v)}`;
}

function alsNotiz(t: Record<string, unknown>): string {
  const felder = ["title", "status", "priority", "due", "scheduled", "tags"].filter((k) => t[k] !== undefined);
  const details = typeof t.details === "string" ? `\n${t.details}\n` : "";
  return `---\n${felder.map((k) => zeile(k, t[k])).join("\n")}\n---\n${details}`;
}

export function tasknotesAttrappe(vault: SpeicherVault): TaskNotesApi {
  const lese = (path: string): TaskInfo => {
    const fm = vault.frontmatterOf(path) ?? {};
    const s = (k: string): string | undefined => (typeof fm[k] === "string" ? (fm[k] as string) : undefined);
    return {
      path,
      title: s("title") ?? path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, ""),
      ...(s("status") !== undefined ? { status: s("status") } : {}),
      ...(s("priority") !== undefined ? { priority: s("priority") } : {}),
      ...(s("due") !== undefined ? { due: s("due") } : {}),
    };
  };
  const schreibe = async (path: string, t: Record<string, unknown>): Promise<TaskInfo> => {
    await vault.overwrite(path, alsNotiz(t));
    return lese(path);
  };
  return {
    async listTasks() {
      return vault.listMarkdownPaths().filter((p) => p.startsWith(`${TASK_ORDNER}/`)).sort().map(lese);
    },
    async createTask(data) {
      const title = String(data.title ?? "Task");
      const path = `${TASK_ORDNER}/${title.replace(/[\\/:*?"<>|#^[\]]/g, "").trim()}.md`;
      if (await vault.exists(path)) throw new Error(`Aufgabe existiert schon: ${path}`);
      await vault.create(path, alsNotiz({ status: "open", ...data, title }));
      return lese(path);
    },
    async updateTask(path, patch) {
      const alt = lese(path);
      return schreibe(path, { ...alt, ...patch });
    },
    async completeTask(path) {
      return schreibe(path, { ...lese(path), status: "done" });
    },
    async deleteTask(path) {
      await vault.trash(path);
    },
    getStatuses: () => STATUSES,
    getPriorities: () => PRIORITIES,
  };
}
