import type { ToolOutcome, ToolRunner } from "../core/agent/types";
import { resolveNotePath } from "../core/tools/path-guard";
import { writePolicy } from "../core/tools/write-policy";
import { appendMemoryLine } from "../core/memory/memory";

export interface VaultPort {
  listMarkdownPaths(): string[];
  read(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  create(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  overwrite(path: string, content: string): Promise<void>;
}

export interface WriteRequest {
  path: string;
  mode: "create" | "append" | "replace";
  oldText: string;
  newText: string;
}

export type ConfirmWritePort = (req: WriteRequest) => Promise<boolean>;

const SEARCH_CAP = 10;
const SNIPPET = 80;

export class VaultTools implements ToolRunner {
  constructor(
    private readonly vault: VaultPort,
    private readonly confirm: ConfirmWritePort,
    private readonly opts: { kodaFolder(): string; today(): string },
  ) {}

  async run(name: string, args: unknown): Promise<ToolOutcome> {
    const a = (typeof args === "object" && args !== null ? args : {}) as Record<string, unknown>;
    try {
      switch (name) {
        case "search_notes": return await this.search(str(a.query), num(a.max_results, SEARCH_CAP));
        case "read_note": return await this.read(str(a.path));
        case "write_note": return await this.write(str(a.path), str(a.content), str(a.mode));
        case "save_memory": return await this.saveMemory(str(a.text));
        default: return { ok: false, error: `unbekanntes Tool: ${name}` };
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Tool fehlgeschlagen" };
    }
  }

  private async search(query: string, cap: number): Promise<ToolOutcome> {
    if (query.trim() === "") return { ok: false, error: "query fehlt" };
    const q = query.toLowerCase();
    const hits: string[] = [];
    for (const path of this.vault.listMarkdownPaths()) {
      if (hits.length >= cap) break;
      if (path.toLowerCase().includes(q)) {
        hits.push(`${path} (Dateiname)`);
        continue;
      }
      const text = await this.vault.read(path).catch(() => "");
      const at = text.toLowerCase().indexOf(q);
      if (at !== -1) {
        const from = Math.max(0, at - SNIPPET / 2);
        const snippet = text.slice(from, from + SNIPPET).replace(/\s+/g, " ").trim();
        hits.push(`${path}: …${snippet}…`);
      }
    }
    return hits.length === 0
      ? { ok: true, content: `Keine Treffer für "${query}".` }
      : { ok: true, content: hits.join("\n") };
  }

  private async read(path: string): Promise<ToolOutcome> {
    const norm = resolveNotePath(path);
    const text = await this.vault.read(norm).catch(() => null);
    return text === null ? { ok: false, error: `Notiz nicht gefunden: "${path}"` } : { ok: true, content: text };
  }

  private async write(path: string, content: string, mode: string): Promise<ToolOutcome> {
    if (mode !== "create" && mode !== "append" && mode !== "replace") {
      return { ok: false, error: `mode muss create|append|replace sein, war: "${mode}"` };
    }
    const norm = resolveNotePath(path);
    const exists = await this.vault.exists(norm);
    if (mode === "create" && exists) return { ok: false, error: `existiert schon: "${norm}" — nutze append oder replace` };
    if (mode !== "create" && !exists) return { ok: false, error: `nicht gefunden: "${norm}" — nutze create` };

    // Effektiver Inhalt, EINMAL berechnet: append ergaenzt ggf. einen fuehrenden
    // Zeilenumbruch. Vorschau (ConfirmWritePort.newText) und der tatsaechliche
    // Schreib-Call unten verwenden exakt denselben Wert — sonst zeigt das Modal
    // etwas anderes an, als am Ende landet (Spec-Invariante: approved == written).
    const effective = mode === "append" && !content.startsWith("\n") ? `\n${content}` : content;

    if (writePolicy(norm, this.opts.kodaFolder()) === "confirm") {
      const oldText = exists ? await this.vault.read(norm) : "";
      const approved = await this.confirm({ path: norm, mode, oldText, newText: effective });
      if (!approved) return { ok: false, error: "vom Nutzer abgelehnt" };
    }

    if (mode === "create") await this.vault.create(norm, effective);
    else if (mode === "append") await this.vault.append(norm, effective);
    else await this.vault.overwrite(norm, effective);
    return { ok: true, content: `geschrieben: ${norm} (${mode})` };
  }

  private async saveMemory(text: string): Promise<ToolOutcome> {
    if (text.trim() === "") return { ok: false, error: "text fehlt" };
    // Abweichung vom Brief: LLM-Text kann eingebettete Zeilenumbrueche enthalten;
    // appendMemoryLine setzt genau EINE Zeile pro Eintrag voraus (Bullet-Format).
    // Ein bloßes trim() liesse Folgezeilen als nicht-Bullet-Text im Memory-File
    // landen. Daher innere Zeilenumbrueche (+ das sie umgebende Whitespace) auf
    // ein Leerzeichen kollabieren.
    const clean = text.trim().replace(/\s*\n\s*/g, " ");
    const path = `${this.opts.kodaFolder().replace(/\/+$/, "")}/Memory.md`;
    const existing = (await this.vault.exists(path)) ? await this.vault.read(path) : "";
    await this.vault.overwrite(path, appendMemoryLine(existing, clean, this.opts.today()));
    return { ok: true, content: `gemerkt: ${clean}` };
  }
}

function str(v: unknown): string { return typeof v === "string" ? v : ""; }
function num(v: unknown, fallback: number): number { return typeof v === "number" && v > 0 ? Math.min(v, 25) : fallback; }
