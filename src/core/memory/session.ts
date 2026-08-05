import type { ChatMessage } from "../agent/types";

export interface SessionSink {
  read(path: string): Promise<string | null>;
  write(path: string, data: string): Promise<void>;
  append(path: string, data: string): Promise<void>;
}

export function serializeLine(m: ChatMessage): string {
  return JSON.stringify(m) + "\n";
}

export function parseLines(text: string): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const raw of text.split("\n")) {
    const lineText = raw.trim();
    if (lineText === "") continue;
    try {
      const parsed = JSON.parse(lineText) as ChatMessage;
      if (typeof parsed.role === "string" && typeof parsed.content === "string") out.push(parsed);
    } catch {
      // Eine kaputte Zeile kostet eine Nachricht, nicht die Session.
    }
  }
  return out;
}

/** Append-only-JSONL im Plugin-Datenordner (traceStore-Muster aus vim-dojo).
 *  Bewusst NICHT im Vault: JSONL wuerde Suche und Sync zumuellen. */
export class SessionStore {
  constructor(private readonly sink: SessionSink, private readonly dir: string) {}

  private get current(): string { return `${this.dir}/current.jsonl`; }
  private get archive(): string { return `${this.dir}/archive.jsonl`; }

  async load(): Promise<ChatMessage[]> {
    const text = await this.sink.read(this.current);
    return text === null ? [] : parseLines(text);
  }

  async appendMessages(msgs: ChatMessage[]): Promise<void> {
    try {
      await this.sink.append(this.current, msgs.map(serializeLine).join(""));
    } catch (e) {
      console.warn("Koda: session append failed", e);
    }
  }

  async startNew(): Promise<void> {
    const text = await this.sink.read(this.current);
    if (text !== null && text.trim() !== "") await this.sink.append(this.archive, text);
    await this.sink.write(this.current, "");
  }
}
