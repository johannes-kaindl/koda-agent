import type { ToolOutcome, ToolRunner } from "../core/agent/types";
import { resolveFolderPath, resolveNotePath } from "../core/tools/path-guard";
import { writePolicy } from "../core/tools/write-policy";
import { appendMemoryLine } from "../core/memory/memory";
import { serializeFrontmatter } from "../vendor/kit/frontmatter";
import { sanitizeSkillName, skillPath } from "../core/skills/path";
import {
  needsSemantic, formatSearchResult, formatRelatedResult, hasIndexableText,
  type RetrievalApi, type TextHit,
} from "../core/tools/retrieval";
import {
  collectFolderNotes, pickFields, formatListResult, suggestFolders, formatEmptyFolder,
} from "../core/tools/list";

export interface VaultPort {
  listMarkdownPaths(): string[];
  read(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  create(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  overwrite(path: string, content: string): Promise<void>;
  /** Frontmatter aus Obsidians metadataCache — `null`, wenn die Notiz keins hat oder
   *  nicht im Cache steht. Bewusst synchron und ohne Dateizugriff: `list_notes` fragt
   *  sonst je Aufruf N Dateien an, und ein Werkzeug gegen teure Pruefschritte darf
   *  nicht selbst der teuerste Aufruf sein. */
  frontmatterOf(path: string): Record<string, unknown> | null;
}

export interface WriteRequest {
  path: string;
  mode: "create" | "append" | "replace";
  oldText: string;
  newText: string;
  /** Klartext, was sich kuenftig aendert — nur bei Skills gesetzt. Additiv: das Modal
   *  zeigt ihn ZUSAETZLICH zur vollstaendigen Vorschau, nie an ihrer Stelle. */
  effect?: string;
}

export type ConfirmWritePort = (req: WriteRequest) => Promise<boolean>;

const SEARCH_CAP = 10;
const SNIPPET = 80;

export class VaultTools implements ToolRunner {
  constructor(
    private readonly vault: VaultPort,
    private readonly confirm: ConfirmWritePort,
    private readonly opts: {
      kodaFolder(): string;
      today(): string;
      /** Frisch je Aufruf gelesen — vault-rag kann zur Laufzeit an- oder abgeschaltet
       *  werden. Fehlt das Feld ganz, verhaelt sich Koda wie vor der Andockung. */
      retrieval?: () => RetrievalApi | null;
      /** Frisch je Aufruf gelesen, damit eine Aenderung in den Einstellungen sofort greift. */
      listMaxRows(): number;
    },
  ) {}

  async run(name: string, args: unknown): Promise<ToolOutcome> {
    const a = (typeof args === "object" && args !== null ? args : {}) as Record<string, unknown>;
    try {
      switch (name) {
        case "search_notes": return await this.search(str(a.query), num(a.max_results, SEARCH_CAP));
        case "read_note": return await this.read(str(a.path));
        case "related_notes": return await this.relatedNotes(str(a.path));
        case "write_note": return await this.write(str(a.path), str(a.content), str(a.mode));
        case "write_skill":
          return await this.writeSkill(str(a.name), str(a.description), str(a.body), str(a.mode));
        case "save_memory": return await this.saveMemory(str(a.text));
        case "list_notes":
          // Bewusst mit await, anders als die Brief-Vorlage: `resolveFolderPath` wirft
          // SYNCHRON innerhalb der async-Methode, was ohne await eine abgelehnte Promise
          // ausserhalb dieses try/catch ergibt (Traversal wuerde nicht als Fehler-Result
          // gemeldet, sondern als unbehandelte Ablehnung durchschlagen).
          return await this.listNotes(str(a.folder), bool(a.recursive), strArray(a.fields));
        default: return { ok: false, error: `unbekanntes Tool: ${name}` };
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Tool fehlgeschlagen" };
    }
  }

  private async search(query: string, cap: number): Promise<ToolOutcome> {
    if (query.trim() === "") return { ok: false, error: "query fehlt" };
    const q = query.toLowerCase();
    const hits: TextHit[] = [];
    for (const path of this.vault.listMarkdownPaths()) {
      if (hits.length >= cap) break;
      if (path.toLowerCase().includes(q)) {
        hits.push({ path, snippet: "(Dateiname)" });
        continue;
      }
      const text = await this.vault.read(path).catch(() => "");
      const at = text.toLowerCase().indexOf(q);
      if (at !== -1) {
        const from = Math.max(0, at - SNIPPET / 2);
        const snippet = text.slice(from, from + SNIPPET).replace(/\s+/g, " ").trim();
        hits.push({ path, snippet: `…${snippet}…` });
      }
    }

    // Semantik nur, wenn Volltext duenn bleibt (Spec E4): sie kostet je Aufruf eine
    // Einbettungs-Anfrage. Ein Fehler der Fremd-API darf die Volltextsuche NIE
    // mitreissen — sie ist der verlaessliche Teil der Antwort.
    const api = needsSemantic(hits.length) ? this.opts.retrieval?.() ?? null : null;
    const semantic = api === null ? null : await api.search(query, { k: cap }).catch(() => null);

    return { ok: true, content: formatSearchResult(hits, semantic) };
  }

  /** Verwandte Notizen aus vault-rags Index. Nutzt denselben Pfad-Guard wie read_note —
   *  ein ungueltiger Pfad wird oben in run() zu einem Fehler-Result. */
  private async relatedNotes(path: string): Promise<ToolOutcome> {
    const api = this.opts.retrieval?.() ?? null;
    if (api === null) {
      return { ok: false, error: 'Semantischer Index nicht verfügbar — das Plugin "Vault Retrieval" ist nicht aktiv.' };
    }
    const norm = resolveNotePath(path);
    const r = await api.related(norm).catch(() => null);
    if (r === null) return { ok: false, error: "Semantischer Index nicht verfügbar — Abfrage fehlgeschlagen." };

    // Nur im not-indexed-Fall lesen: sonst kostet jede related-Abfrage einen Dateizugriff
    // fuer eine Auskunft, die niemand braucht. `null` heisst „nicht lesbar" — dann bleibt
    // die Meldung unbestimmt, statt eine Ursache zu behaupten.
    let hasText: boolean | null = null;
    if (!r.ok && r.reason === "not-indexed") {
      const raw = await this.vault.read(norm).catch(() => null);
      hasText = raw === null ? null : hasIndexableText(raw);
    }
    return { ok: true, content: formatRelatedResult(r, norm, hasText) };
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

  /** Skills schreibt das Plugin, nicht das Modell: Pfad und Frontmatter entstehen hier,
   *  damit sie strukturell nicht kaputt sein koennen. Kein append — an Verhaltens-
   *  anweisungen anzuhaengen produziert Widerspruchsmengen statt Skills. */
  private async writeSkill(name: string, description: string, body: string, mode: string): Promise<ToolOutcome> {
    if (mode !== "create" && mode !== "replace") {
      return { ok: false, error: `mode muss create|replace sein, war: "${mode}"` };
    }
    const clean = sanitizeSkillName(name);
    if (clean === "") return { ok: false, error: "name fehlt oder besteht nur aus unerlaubten Zeichen" };
    const desc = description.trim().replace(/\s*\n\s*/g, " ");
    if (desc === "") return { ok: false, error: "description fehlt — sie erklaert dem Nutzer, was sich kuenftig aendert" };

    const path = skillPath(this.opts.kodaFolder(), clean);
    const exists = await this.vault.exists(path);
    if (mode === "create" && exists) return { ok: false, error: `Skill existiert schon: "${clean}" — nutze replace` };
    if (mode === "replace" && !exists) return { ok: false, error: `Skill nicht gefunden: "${clean}" — nutze create` };

    const content = `${serializeFrontmatter({ description: desc, enabled: "true" }, ["description", "enabled"])}\n${body.trim()}\n`;

    // Die Policy wird gefragt, obwohl die Antwort hier feststeht: die Grenze gehoert
    // an EINE Stelle, und diese Zeile bricht auffaellig, wenn sie dort je wegfaellt.
    if (writePolicy(path, this.opts.kodaFolder()) === "confirm") {
      const oldText = exists ? await this.vault.read(path) : "";
      const approved = await this.confirm({ path, mode, oldText, newText: content, effect: desc });
      if (!approved) return { ok: false, error: "vom Nutzer abgelehnt" };
    }

    if (mode === "create") await this.vault.create(path, content);
    else await this.vault.overwrite(path, content);
    return { ok: true, content: `Skill geschrieben: ${path}` };
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

  /** Ordnerinhalt in EINEM Aufruf. Die Kappung liegt vor dem Frontmatter-Holen: gezaehlt
   *  wird ueber die Pfadliste (billig), geholt nur fuer die Zeilen, die auch erscheinen. */
  private async listNotes(folder: string, recursive: boolean, fields: string[]): Promise<ToolOutcome> {
    const norm = resolveFolderPath(folder);
    const all = this.vault.listMarkdownPaths();
    const paths = collectFolderNotes(all, norm, recursive);
    if (paths.length === 0) {
      return { ok: false, error: formatEmptyFolder(norm, suggestFolders(all, norm)) };
    }
    const shown = paths.slice(0, Math.max(1, this.opts.listMaxRows()));
    const rows = shown.map((p) => ({ path: p, fields: pickFields(this.vault.frontmatterOf(p), fields) }));
    return { ok: true, content: formatListResult({ folder: norm, recursive, total: paths.length, rows }) };
  }
}

function str(v: unknown): string { return typeof v === "string" ? v : ""; }
function num(v: unknown, fallback: number): number { return typeof v === "number" && v > 0 ? Math.min(v, 25) : fallback; }

/** Modelle liefern Booleans mal als `true`, mal als `"true"`, mal als `1`/`0`. Tolerant
 *  lesen ist hier richtig: der strenge Weg wuerde einen gemeinten rekursiven Aufruf
 *  still zu einem flachen machen — wieder ein Ergebnis, das vollstaendig aussieht und
 *  keines ist. */
function bool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  if (typeof v === "number") return v === 1;
  return false;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
