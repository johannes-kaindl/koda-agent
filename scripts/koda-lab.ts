/**
 * koda-lab — misst je Modell eines lokalen OpenAI-kompatiblen Endpunkts,
 * ob natives Tool-Calling funktioniert (Muster: transmute/diagnose-lab, importiert Produktionscode).
 *
 *   npm run lab:tools
 *   npm run lab:tools -- --endpoint http://127.0.0.1:11434 --model qwen3:8b
 */
import { KodaChatClient, type SseTransport } from "../src/llm/KodaChatClient";
import { extractModelIds } from "../src/vendor/kit/endpoint_diagnostics";
import { TOOL_DEFS } from "../src/core/tools/defs";
import { parseTextToolCall } from "../src/core/agent/text-fallback";
import type { ChatMessage } from "../src/core/agent/types";

/** fetch-basierter Streaming-Transport fuer Node — nur fuers Lab, nie im Plugin. */
const transport: SseTransport = {
  async postStream(url, body, headers, onChunk, signal) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal,
    });
    const reader = res.body?.getReader();
    if (reader) {
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        onChunk(dec.decode(value, { stream: true }));
      }
    }
    return res.status;
  },
};

const nodeClock = {
  now: () => Date.now(),
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id: number) => clearTimeout(id),
};

const CASES: { name: string; question: string; expectTool: string | null }[] = [
  { name: "Suche", question: "Welche Notizen habe ich zum Thema Rezepte? Bitte such im Vault.", expectTool: "search_notes" },
  { name: "Lesen", question: "Lies bitte die Notiz Koda/Memory.md und fasse sie zusammen.", expectTool: "read_note" },
  { name: "Kein Tool", question: "Was ist die Hauptstadt von Frankreich? Antworte direkt.", expectTool: null },
];

function flag(name: string): string | null {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? null : (process.argv[at + 1] ?? null);
}

async function listModels(endpoint: string): Promise<string[]> {
  const res = await fetch(`${endpoint}/v1/models`);
  return extractModelIds(await res.json()).filter((id) => !id.includes("embed"));
}

async function main(): Promise<void> {
  const endpoint = flag("endpoint") ?? "http://127.0.0.1:1234";
  const models = flag("model") !== null ? [flag("model") as string] : await listModels(endpoint);
  if (models.length === 0) {
    console.log(`Kein Modell erreichbar unter ${endpoint} — läuft der Server?`);
    process.exitCode = 1;
    return;
  }
  const client = new KodaChatClient(transport, 180_000, nodeClock);

  // Alternierungs-Gegenprobe: lehnt ein Modell zwei `user`-Rollen hintereinander ab
  // (die Annahme hinter `renderMerged` in project.ts)? Ohne Tools, ohne System-Prompt —
  // reine Rollenfrage.
  if (flag("alternation") !== null || process.argv.includes("--alternation")) {
    for (const model of models) {
      const r = await client.complete(
        { endpoint, apiKey: flag("apikey") ?? "", model, suppressThinking: true },
        [{ role: "user", content: "Merke dir: A" }, { role: "user", content: "Was habe ich dir gesagt?" }],
        [], () => {}, () => {},
        new AbortController().signal,
      );
      console.log(`${model}: ${r.ok ? "OK — zwei user hintereinander akzeptiert" : `${r.kind} — ${r.detail}`}`);
    }
    process.exit(0);
  }

  const system: ChatMessage = {
    role: "system",
    content: "You are Koda, a vault assistant. Use the provided tools to search and read notes before answering.",
  };

  for (const model of models) {
    console.log(`\n${"=".repeat(72)}\nMODELL: ${model}\n${"=".repeat(72)}`);
    for (const c of CASES) {
      const started = Date.now();
      const r = await client.complete(
        { endpoint, apiKey: flag("apikey") ?? "", model, suppressThinking: true },
        [system, { role: "user", content: c.question }],
        TOOL_DEFS,
        () => {}, () => {},
        new AbortController().signal,
      );
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      if (!r.ok) {
        console.log(`  ${c.name}: FEHLER nach ${secs}s — ${r.detail.slice(0, 160)}`);
        continue;
      }
      const native = r.toolCalls.length > 0 ? r.toolCalls[0] : null;
      const textual = native === null ? parseTextToolCall(r.content) : null;
      const argsOk = ((): boolean => {
        const raw = native?.arguments ?? textual?.arguments;
        if (raw === undefined) return false;
        try { JSON.parse(raw); return true; } catch { return false; }
      })();
      const verdict =
        c.expectTool === null
          ? (native === null && textual === null ? "OK (direkt geantwortet)" : "ABWEICHUNG (unnoetiger Tool-Call)")
          : native?.name === c.expectTool
            ? `OK nativ (args ${argsOk ? "valide" : "KAPUTT"})`
            : textual?.name === c.expectTool
              ? `NUR TEXT-FALLBACK (args ${argsOk ? "valide" : "KAPUTT"})`
              : `FEHLT (content: ${r.content.slice(0, 80).replace(/\n/g, " ")})`;
      console.log(`  ${c.name}: ${verdict} · ${secs}s · finish=${r.finishReason ?? "-"}`);
    }
  }
}

void main();
