/* Attrappen-Endpunkt für den Trockenlauf: ein lokaler HTTP-Server mit der OpenAI-kompatiblen Streaming-Schnittstelle, ohne
   Modell. Er spielt je Aufgabe einen festen Antwortsatz ab (Musterlösung oder falsche Lösung aus aufgaben.ts). Welche, sagt der
   Modellname: `muster/<aufgabe>/<lauf>` oder `falsch/<aufgabe>/<lauf>`; je Name zählt er die Anfragen mit Werkzeugen mit.
   Eine Anfrage ohne Werkzeuge ist die Zusammenfassung der Verdichtung (Stufe 2) und bekommt einen festen Satz, ohne den
   Zähler zu bewegen. Bindet nur an 127.0.0.1. */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { AUFGABEN, falschVon, type Schritt } from "./aufgaben";

export interface Attrappe {
  url: string;
  anfragen: number;
  /** System-Prompt der letzten Anfrage je Modellname — Beleg, dass ein Arm am Draht ankommt. */
  systemPrompts: Map<string, string>;
  schliessen(): Promise<void>;
}

function sse(res: import("node:http").ServerResponse, chunks: unknown[]): void {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`);
  res.end("data: [DONE]\n\n");
}

const chunk = (delta: Record<string, unknown>, finish: string | null = null): unknown =>
  ({ id: "attrappe", object: "chat.completion.chunk", model: "attrappe", choices: [{ index: 0, delta, finish_reason: finish }] });

function antwort(schritt: Schritt, promptZeichen: number): unknown[] {
  const usage = { usage: { prompt_tokens: Math.ceil(promptZeichen / 4), completion_tokens: 10 }, choices: [] };
  if ("text" in schritt) return [chunk({ role: "assistant", content: schritt.text }), chunk({}, "stop"), usage];
  const calls = schritt.aufrufe.map(([name, args], index) => ({
    index, id: `call_${index}_${name}`, type: "function", function: { name, arguments: JSON.stringify(args) },
  }));
  return [chunk({ role: "assistant", tool_calls: calls }), chunk({}, "tool_calls"), usage];
}

/** Startet die Attrappe auf einem freien Port (oder `port`). */
export async function starteAttrappe(port = 0): Promise<Attrappe> {
  const zaehler = new Map<string, number>();
  const state = { anfragen: 0 };
  const systemPrompts = new Map<string, string>();
  const server: Server = createServer((req, res) => {
    if (req.method === "GET" && req.url?.startsWith("/v1/models")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: [{ id: "attrappe", object: "model" }] }));
      return;
    }
    if (req.method !== "POST" || !(req.url ?? "").startsWith("/v1/chat/completions")) {
      res.writeHead(404).end();
      return;
    }
    let roh = "";
    req.on("data", (d: Buffer) => { roh += d.toString("utf8"); });
    req.on("end", () => {
      state.anfragen++;
      const body = JSON.parse(roh) as { model?: string; tools?: unknown[]; messages?: { role?: string; content?: unknown }[] };
      const name = body.model ?? "";
      const sys = body.messages?.find((m) => m.role === "system")?.content;
      if (typeof sys === "string") systemPrompts.set(name, sys);
      const [modus, id] = name.split("/");
      const a = AUFGABEN.find((x) => x.id === id);
      if (a === undefined || (modus !== "muster" && modus !== "falsch" && modus !== "aufwaermen")) {
        if (modus === "aufwaermen") { sse(res, antwort({ text: "OK" }, roh.length)); return; }
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: `Attrappe kennt das Modell nicht: ${name}` } }));
        return;
      }
      if (!Array.isArray(body.tools) || body.tools.length === 0) {
        sse(res, antwort({ text: "Zusammenfassung der bisherigen Runden (Attrappe)." }, roh.length));
        return;
      }
      const schritte = modus === "muster" ? a.muster : falschVon(a);
      const i = zaehler.get(name) ?? 0;
      zaehler.set(name, i + 1);
      sse(res, antwort(schritte[Math.min(i, schritte.length - 1)], roh.length));
    });
  });
  await new Promise<void>((ok) => server.listen(port, "127.0.0.1", ok));
  const { port: p } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${p}`,
    get anfragen() { return state.anfragen; },
    systemPrompts,
    schliessen: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}
