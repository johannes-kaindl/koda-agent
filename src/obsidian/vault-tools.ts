import type { ToolOutcome, ToolRunner } from "../core/agent/types";
import { resolveFolderPath, resolveNotePath, READ_EXTENSIONS } from "../core/tools/path-guard";
import { writePolicy } from "../core/tools/write-policy";
import { movePolicy, planMove } from "../core/tools/move";
import { appendMemoryLine } from "../core/memory/memory";
import { serializeFrontmatter } from "../vendor/kit/frontmatter";
import { sanitizeSkillName, skillPath } from "../core/skills/path";
import {
  formatSearchResult, formatRelatedResult, hasIndexableText,
  type RetrievalApi, type TextHit,
} from "../core/tools/retrieval";
import {
  collectFolderNotes, pickFields, formatListResult, suggestFolders, formatEmptyFolder,
  collectSubfolders, folderExists,
} from "../core/tools/list";
import type { EditorPort, WorkspacePort } from "../core/context/ports";
import { renderWorkspaceReport } from "../core/context/workspace-line";
import { DEFAULT_SETTINGS } from "../core/settings-types";

export interface VaultPort {
  listMarkdownPaths(): string[];
  /** Alle Ordner des Vaults, auch die ohne eine einzige Notiz. Aus `listMarkdownPaths` sind
   *  genau diese nicht ableitbar — und ein Ordner, den das Werkzeug nicht sieht, wird vom
   *  Modell als „existiert nicht" berichtet (gemessen 2026-09-25, `_Koda/Brain`). */
  listFolderPaths(): string[];
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
  /** Verschieben ODER Umbenennen — fuer Obsidian dieselbe Operation. Die Implementierung
   *  muss `fileManager.renameFile` nutzen, nicht `vault.rename`: nur erstere zieht die
   *  Wikilinks der verweisenden Notizen nach. Ein Move ohne Nachzug hinterlaesst tote
   *  Links und verletzt die Zero-Broken-Links-Regel des Vaults. */
  move(from: string, to: string): Promise<void>;
  /** In den Papierkorb, nicht `unlink`. Die Implementierung muss `fileManager.trashFile`
   *  nutzen, weil das der Papierkorb-Einstellung des Vaults folgt — damit ist der Vorgang
   *  in der Regel umkehrbar, und genau darauf beruht die Entscheidung, Koda ueberhaupt
   *  loeschen zu lassen. */
  trash(path: string): Promise<void>;
  /** Wie viele Notizen auf diese verweisen. Synchron und ohne Dateizugriff (aus
   *  `metadataCache.resolvedLinks`), weil die Zahl im Bestaetigungs-Modal steht und ein
   *  Modal nicht auf Dateizugriffe warten darf. */
  backlinkCount(path: string): number;
}

/** Eine Schreibfreigabe. Drei Arten, EIN Modal (UI-STANDARD §2: ein Confirm-Modal je
 *  Plugin) — unterschieden ueber `kind`, damit der Modal-Code nicht raten muss, ob
 *  `newText` eine Vorschau oder ein leerer Platzhalter ist. `kind` fehlt beim Schreiben
 *  bewusst nicht: es ist verpflichtend, sonst waere ein vergessenes Feld ein stiller
 *  Fall-through in den Text-Zweig. */
export type WriteRequest = WriteFileRequest | MoveRequest | DeleteRequest;

export interface WriteFileRequest {
  kind: "write";
  path: string;
  mode: "create" | "append" | "replace";
  oldText: string;
  newText: string;
  /** Klartext, was sich kuenftig aendert — nur bei Skills gesetzt. Additiv: das Modal
   *  zeigt ihn ZUSAETZLICH zur vollstaendigen Vorschau, nie an ihrer Stelle. */
  effect?: string;
}

export interface MoveRequest {
  kind: "move";
  path: string;
  destination: string;
  /** Umbenennen (gleicher Ordner) oder Verschieben — das Modal benennt den Vorgang so,
   *  wie er dem Nutzer erscheint. */
  rename: boolean;
  /** Zahl der verweisenden Notizen. Sie steht im Modal, weil sie die Reichweite des
   *  Vorgangs sichtbar macht: ohne sie sieht ein Move nach einer Datei aus, waehrend er
   *  N weitere anfasst. */
  backlinks: number;
}

export interface DeleteRequest {
  kind: "delete";
  path: string;
  backlinks: number;
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
      /** Die Namen, die gerade angeboten werden — Quelle ist `currentToolNames()`.
       *  Bewusst als Funktion und nicht als Wert: schaltet der Nutzer mitten im Gespraech
       *  ein Werkzeug ab, greift das ab dem naechsten Aufruf, statt bis zum Neustart auf
       *  dem Stand vom Aufbau zu stehen (dieselbe Ueberlegung wie bei `retrieval`).
       *  Fehlt das Feld ganz, ist alles erlaubt — Altaufrufer und Tests, die nur den
       *  Werkzeug-Kern messen, sollen keine Liste mitfuehren muessen. */
      allowed?: () => Set<string>;
      /** Arbeitsplatz fuer `get_workspace` — fehlt in Tests, die nur den Vault-Kern messen. */
      workspace?: WorkspacePort;
      /** Editor fuer `edit_active_note`; jede Methode liest frisch (Invariante, Spec E5). */
      editor?: EditorPort;
      /** Sprache der Werkzeug-Texte; fehlt → deutsch wie die Stubs. */
      lang?: () => "de" | "en";
      /** Einstellung `contextFrontmatterChars`, frisch je Aufruf gelesen. Sie wird hier
       *  GESPALTEN gelesen — > 0 kappt nur den Block, 0 waehlt die Kopfdaten ueberall ab;
       *  die Begruendung steht an `renderWorkspaceReport`. Fehlt das Feld, gilt der
       *  Auslieferungswert, also keine Abwahl (Tests, die nur den Vault-Kern messen). */
      contextFrontmatterChars?: () => number;
    },
  ) {}

  async run(name: string, args: unknown): Promise<ToolOutcome> {
    const a = (typeof args === "object" && args !== null ? args : {}) as Record<string, unknown>;
    try {
      // VOR dem switch: der Runner darf nicht allein am Namen entscheiden. Ein Modell kann
      // ein abgeschaltetes Werkzeug halluzinieren oder es aus einer aelteren Runde im
      // Verlauf aufgreifen — ohne diese Zeile schriebe `write_note` dann trotzdem, im
      // Koda-Ordner sogar ohne Rueckfrage. Die Oberflaeche verspricht „Was Koda tun darf";
      // gehalten wird das Versprechen hier (Spec E3: messen statt annehmen).
      const erlaubt = this.opts.allowed?.();
      if (erlaubt !== undefined && !erlaubt.has(name) && !this.fehltAusFremdemGrund(name)) {
        return { ok: false, error: `Werkzeug abgeschaltet: ${name} — der Nutzer hat es in den Einstellungen deaktiviert. Nutze ein anderes.` };
      }
      switch (name) {
        case "search_notes": return await this.search(str(a.query), num(a.max_results, SEARCH_CAP));
        case "read_note": return await this.read(str(a.path));
        case "related_notes": return await this.relatedNotes(str(a.path));
        case "write_note": return await this.write(str(a.path), str(a.content), str(a.mode));
        case "move_note": return await this.moveNote(str(a.source_path), str(a.destination_path));
        case "delete_note": return await this.deleteNote(str(a.path));
        case "write_skill":
          return await this.writeSkill(str(a.name), str(a.description), str(a.body), str(a.mode));
        case "save_memory": return await this.saveMemory(str(a.text));
        case "list_notes":
          // `folder` ist Pflicht, aber "" (Vault-Wurzel) ist ein gueltiger, ausdruecklicher
          // Wert dafuer — `str(undefined)` liefert ebenfalls "" und wuerde ein vergessenes
          // Feld sonst still zur Wurzel machen (rekursiver Dump statt Fehlermeldung). Beide
          // Faelle muessen daher VOR dem str()-Aufruf auseinandergehalten werden, analog zu
          // "query fehlt" bei search_notes und dem gemeldeten Modus bei write_note.
          if (a.folder === undefined) return { ok: false, error: "folder fehlt" };
          // Bewusst mit await, anders als die Brief-Vorlage: `resolveFolderPath` wirft
          // SYNCHRON innerhalb der async-Methode, was ohne await eine abgelehnte Promise
          // ausserhalb dieses try/catch ergibt (Traversal wuerde nicht als Fehler-Result
          // gemeldet, sondern als unbehandelte Ablehnung durchschlagen).
          return await this.listNotes(str(a.folder), bool(a.recursive), strArray(a.fields));
        case "get_workspace": {
          // Eigene Spanne statt num(): num() kappt bei 25 (fuer max_results gedacht) und
          // behandelt 0 als "fehlt" — around_cursor: 0 ("nur die Cursor-Zeile") ist aber ein
          // gueltiger, ausdruecklicher Wert.
          const radius = typeof a.around_cursor === "number" && Number.isFinite(a.around_cursor)
            ? Math.min(Math.max(Math.trunc(a.around_cursor), 0), 200)
            : 20;
          return this.getWorkspace(radius);
        }
        case "edit_active_note": return await this.editActiveNote(str(a.path), str(a.mode), str(a.text));
        default: return { ok: false, error: `unbekanntes Tool: ${name}` };
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Tool fehlgeschlagen" };
    }
  }

  /** Fehlt der Name aus einem Grund, den der Guard NICHT kennt? Dann schweigt er und laesst
   *  durch — die Meldung soll von der Stelle kommen, die den Grund wirklich kennt.
   *
   *  Der Fall ist heute genau einer: `related_notes` fehlt in der angebotenen Liste aus
   *  ZWEI Gruenden — der Nutzer hat es abgeschaltet, ODER vault-rag liefert keinen Index.
   *  Der Guard sieht nur die Liste und kann die beiden nicht auseinanderhalten; `relatedNotes()`
   *  fragt die Nachbar-API selbst und meldet Klartext. Ohne diese Ausnahme beschuldigte die
   *  Antwort ans Modell den falschen Verursacher („der Nutzer hat es deaktiviert"), obwohl nur
   *  das Nachbarplugin aus ist — genau die plausible, aber falsche Ursachenmeldung, die in
   *  diesem Repo schon einmal teuer war.
   *
   *  Die bewusste Abschaltung durch den Nutzer bleibt gedeckt: laeuft vault-rag, ist der
   *  fremde Grund nicht gegeben und der Guard greift wie fuer jedes andere Werkzeug. */
  private fehltAusFremdemGrund(name: string): boolean {
    return name === "related_notes" && (this.opts.retrieval?.() ?? null) === null;
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

    // Immer beide Wege — die fruehere Trefferzahl-Schwelle schnitt genau die Fragen ab,
    // fuer die es den semantischen Weg gibt (Begruendung in core/tools/retrieval.ts).
    // Ein Fehler der Fremd-API darf die Volltextsuche NIE mitreissen: sie ist der
    // verlaessliche Teil der Antwort.
    const api = this.opts.retrieval?.() ?? null;
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

  /** Die einzige Stelle mit erweiterter Erlaubnis. Schreiben, Verschieben und Loeschen
   *  rufen `resolveNotePath` weiter ohne zweiten Parameter — der Default ist `.md`. */
  private async read(path: string): Promise<ToolOutcome> {
    const norm = resolveNotePath(path, READ_EXTENSIONS);
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
      const approved = await this.confirm({ kind: "write", path: norm, mode, oldText, newText: effective });
      if (!approved) return { ok: false, error: "vom Nutzer abgelehnt" };
    }

    if (mode === "create") await this.vault.create(norm, effective);
    else if (mode === "append") await this.vault.append(norm, effective);
    else await this.vault.overwrite(norm, effective);
    return { ok: true, content: `geschrieben: ${norm} (${mode})` };
  }

  /** Verschieben und Umbenennen — fuer Obsidian dieselbe Operation, fuer den Nutzer nicht.
   *
   *  Reihenfolge ist hier Sicherheit, nicht Stil: erst planen (beide Pfade durch den Guard,
   *  Gleichheit raus), dann Existenz pruefen, dann fragen, dann schreiben. Wer die Freigabe
   *  vor die Existenzpruefung zieht, laesst den Nutzer einen Vorgang bestaetigen, der
   *  danach an einer Kleinigkeit scheitert — und gewoehnt ihn daran, Modale wegzuklicken. */
  private async moveNote(source: string, destination: string): Promise<ToolOutcome> {
    const plan = planMove(source, destination);
    if (!(await this.vault.exists(plan.source))) {
      return { ok: false, error: `nicht gefunden: "${plan.source}"` };
    }
    // Ein belegtes Ziel wird gemeldet, nie ueberschrieben: ein Move, der still eine fremde
    // Notiz ersetzt, ist Datenverlust mit Erfolgsmeldung.
    if (await this.vault.exists(plan.destination)) {
      return { ok: false, error: `existiert schon: "${plan.destination}" — Ziel ist belegt` };
    }

    if (movePolicy(plan.source, plan.destination, this.opts.kodaFolder()) === "confirm") {
      const approved = await this.confirm({
        kind: "move",
        path: plan.source,
        destination: plan.destination,
        rename: plan.kind === "rename",
        backlinks: this.vault.backlinkCount(plan.source),
      });
      if (!approved) return { ok: false, error: "vom Nutzer abgelehnt" };
    }

    await this.vault.move(plan.source, plan.destination);
    const verb = plan.kind === "rename" ? "umbenannt" : "verschoben";
    return { ok: true, content: `${verb}: ${plan.source} → ${plan.destination}` };
  }

  /** Loeschen fragt IMMER — auch im Koda-Ordner, wo Schreiben frei ist.
   *
   *  Der raeumliche Freibrief begruendet sich damit, dass Kodas eigener Kram den Vault des
   *  Nutzers nicht beruehrt. Beim Loeschen traegt das nicht: die Wirkung ist dieselbe, egal
   *  wo die Datei liegt, und sie ist die einzige, die nichts hinterlaesst, woran man sie
   *  bemerken koennte. Dieselbe Ueberlegung wie bei `write_skill` — Wirkung schlaegt Ort. */
  private async deleteNote(path: string): Promise<ToolOutcome> {
    const norm = resolveNotePath(path);
    if (!(await this.vault.exists(norm))) return { ok: false, error: `nicht gefunden: "${norm}"` };

    const approved = await this.confirm({
      kind: "delete", path: norm, backlinks: this.vault.backlinkCount(norm),
    });
    if (!approved) return { ok: false, error: "vom Nutzer abgelehnt" };

    await this.vault.trash(norm);
    return { ok: true, content: `in den Papierkorb gelegt: ${norm}` };
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
      const approved = await this.confirm({ kind: "write", path, mode, oldText, newText: content, effect: desc });
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
    const folders = this.vault.listFolderPaths();
    // Ein Ordner ohne Notiz ist ein Befund, kein Fehler — nur ein Ordner, den es nicht gibt,
    // ist einer. Erst die Ordnerliste macht die beiden unterscheidbar.
    if (!folderExists(all, folders, norm)) {
      return { ok: false, error: formatEmptyFolder(norm, suggestFolders(all, norm), true) };
    }
    const paths = collectFolderNotes(all, norm, recursive);
    const max = Math.max(1, this.opts.listMaxRows());
    const shown = paths.slice(0, max);
    const rows = shown.map((p) => ({ path: p, fields: pickFields(this.vault.frontmatterOf(p), fields) }));
    const subfolders = collectSubfolders(all, folders, norm, recursive);
    return {
      ok: true,
      content: formatListResult({ folder: norm, recursive, total: paths.length, rows, subfolders, subfolderMax: max }),
    };
  }

  private getWorkspace(radius: number): ToolOutcome {
    const ws = this.opts.workspace;
    if (ws === undefined) return { ok: false, error: "Arbeitsplatz nicht verfügbar: kein Zugriff auf den Workspace." };
    const snap = ws.snapshot();
    const fmMax = this.opts.contextFrontmatterChars?.() ?? DEFAULT_SETTINGS.contextFrontmatterChars;
    return { ok: true, content: renderWorkspaceReport(snap, ws.linesAround(radius), this.opts.lang?.() ?? "de", fmMax) };
  }

  /** Invariante „Vorschau == geschriebener Inhalt": Pfad und Markierung werden VOR dem Modal
   *  gelesen und NACH der Bestaetigung erneut geprueft. Zwischen beiden liegt Nutzerzeit. */
  private async editActiveNote(path: string, mode: string, text: string): Promise<ToolOutcome> {
    const ed = this.opts.editor;
    if (ed === undefined) return { ok: false, error: "Kein Editor verfügbar." };
    if (mode !== "replace_selection" && mode !== "insert_at_cursor") {
      return { ok: false, error: `unbekannter Modus: ${mode} — erlaubt sind replace_selection und insert_at_cursor` };
    }
    const target = resolveNotePath(path);
    const active = ed.path();
    if (active === null) return { ok: false, error: "Keine aktive Notiz mit Editor im Hauptbereich — nichts geschrieben." };
    // Case-insensitiv wie writePolicy: ein vom Modell leicht anders grossgeschriebener Pfad
    // ("notes/plan.md" gegen "Notes/Plan.md") ist dieselbe Notiz, kein Wechsel.
    if (active.toLowerCase() !== target.toLowerCase()) {
      return { ok: false, error: `Aktiv ist inzwischen ${active}, nicht ${target} — nichts geschrieben.` };
    }
    const old = mode === "replace_selection" ? ed.selection() : "";
    if (mode === "replace_selection" && old === "") {
      return { ok: false, error: "Keine Markierung im Editor — für replace_selection muss Text markiert sein." };
    }
    if (writePolicy(target, this.opts.kodaFolder()) === "confirm") {
      const req: WriteFileRequest = { kind: "write", path: target, mode: mode === "replace_selection" ? "replace" : "append", oldText: old, newText: text };
      // Additiv, nur bei insert_at_cursor: WriteRequest.mode bleibt "append" (Wortlaut fuer
      // append-artiges Verhalten), aber das Modal zeigte dafuer "append" an — irrefuehrend fuer
      // eine Einfuegung an der Cursor-Position. Die effect-Zeile steht ZUSAETZLICH ueber der
      // Vorschau, ersetzt sie nicht.
      if (mode === "insert_at_cursor") {
        req.effect = (this.opts.lang?.() ?? "de") === "de"
          ? "wird an der Cursor-Position eingefügt, nicht angehängt"
          : "will be inserted at the cursor position, not appended";
      }
      const ok = await this.confirm(req);
      if (!ok) return { ok: false, error: "vom Nutzer abgelehnt" };
      const activeAfter = ed.path();
      if (activeAfter === null || activeAfter.toLowerCase() !== target.toLowerCase()) {
        return { ok: false, error: `Aktiv ist inzwischen ${activeAfter ?? "keine Notiz"}, nicht ${target} — nichts geschrieben.` };
      }
      if (mode === "replace_selection" && ed.selection() !== old) {
        return { ok: false, error: "Die Markierung hat sich seit dem Aufruf geändert — nichts geschrieben. Erneut aufrufen." };
      }
    }
    if (mode === "replace_selection") {
      ed.replaceSelection(text);
      return { ok: true, content: `Markierung ersetzt (${old.length} → ${text.length} Zeichen) in ${target}` };
    }
    ed.insertAtCursor(text);
    return { ok: true, content: `${text.length} Zeichen am Cursor eingefügt in ${target}` };
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
