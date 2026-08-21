/**
 * Praxistest-Treiber — stellt Koda im **laufenden** Obsidian eine echte Frage und misst,
 * WAS ER TUT (CORE-TEST-02 b).
 *
 * ## Warum er neben dem GUI-Smoke steht und nicht darin
 *
 * `gui-smoke.ts` prueft ausdruecklich nichts, was eine Modell-Antwort braucht: gemessen
 * am 2026-08-07 ist `qwen/qwen3.6-27b` ueber einem grossen Vault > 90 s stumm, bevor das
 * erste Token kommt — ein Pruefpunkt darauf waere langsam und nicht deterministisch.
 * Beides stimmt weiterhin. Aber genau dahinter liegt eine Klasse von Befunden, die sonst
 * niemand sieht: `VaultTools` haengt am Gespraech, nicht am Plugin-Objekt, und ob Koda ein
 * Werkzeug **waehlt**, entscheidet das Modell. Zwei Beispiele aus dem Betrieb:
 *
 * - 2026-08-14: Koda waehlte `list_notes` von selbst — bei einem Skill, der weiterhin
 *   `search_notes` + `read_note` vorschrieb. Das belegte die Lehre „ein Verbot wirkt, eine
 *   Anordnung nicht" und war mit keinem Unit-Test erreichbar.
 * - 2026-08-13: Die Schwelle der semantischen Suche (< 3 Volltext-Treffer) schnitt genau
 *   die thematischen Fragen ab, fuer die es den semantischen Weg gibt. Das Gate war gruen,
 *   der Smoke auch — sichtbar wurde es erst in einem echten Gespraech.
 *
 * Dieser Treiber ist also nicht die schnelle Variante des Smokes, sondern seine Ergaenzung:
 * langsam, nicht deterministisch, dafuer die einzige Messung von Kodas **Verhalten**.
 * Deshalb hat er auch keine Prueflisten-Semantik (n/n gruen), sondern gibt einen Bericht
 * aus. `--expect` ist ein Zusatz fuer gezielte Gegenproben, keine Testsuite.
 *
 * ## Die Messgroesse ist der Tool-Aufruf, nicht der Antworttext
 *
 * Ein Modell kann behaupten, etwas getan zu haben, ohne den Aufruf zu senden (gemessen
 * 2026-08-08, dort als Sampling-Varianz belegt). Der Bericht zeigt deshalb zuerst die
 * Aufrufe aus `chatLog` und erst danach die Prosa.
 *
 * Aus demselben Grund weist er **Verdichtungs-Marken** aus (`kind: "compaction"`): ab einer
 * Verdichtung sieht das Modell die Runden davor nur noch als Stub oder Zusammenfassung.
 * Ohne die Marke laese sich der Bericht so, als haette Koda den ganzen Verlauf vor Augen —
 * und ein spaeteres Neu-Lesen derselben Notiz saehe nach Verschwendung aus statt nach Folge.
 * Die Stufe-2-Zusammenfassung steht nur mit `--full` vollstaendig da; sie ist der Beleg
 * dafuer, WAS in die Verdichtung gerettet wurde.
 *
 * ## Nicht deterministisch — bewusst
 *
 * Zwei Laeufe derselben Frage koennen verschiedene Werkzeuge waehlen. Ein einzelner Lauf
 * belegt „Koda KANN das", nie „Koda TUT das immer". Fuer eine Aussage ueber Zuverlaessigkeit
 * gehoert der Lauf wiederholt (`--runs`), und selbst dann bleibt es eine Stichprobe.
 *
 * ## Voraussetzung
 *
 * ```bash
 * osascript -e 'quit app "Obsidian"'
 * open -a Obsidian --args --remote-debugging-port=9222
 * ```
 *
 * Dann mit deployter Plugin-Version und erreichbarem Modell-Endpunkt:
 *
 * ```bash
 * npm run gui:ask -- --vault 80_Arbeit --ask "Welche Notizen behandeln lokale KI-Modelle?"
 * npm run gui:ask -- --vault 80_Arbeit --ask "…" --expect "Lokale KI/" --expect "search_notes" --full
 * ```
 *
 * `--expect` prueft gegen den ganzen Verlauf — Tool-Ergebnis UND Antworttext. Es belegt
 * daher NICHT, dass ein Treffer aus dem Werkzeug stammt; ein Modell kann Pfade erfinden.
 * Wer das unterscheiden muss, liest mit `--full` das ungekuerzte Tool-Ergebnis.
 *
 * ⚠️ Nur Lesefragen ohne Aufsicht stellen. Will Koda ausserhalb des Koda-Ordners schreiben,
 * oeffnet sich das Bestaetigungs-Modal und wartet auf einen Menschen — der Treiber laeuft
 * dann in seine Zeitueberschreitung, ohne dass etwas kaputt waere.
 */

import { execFileSync } from "node:child_process";
// Die CDP-Bruecke liegt seit 2026-08-16 zentral im Dach (tools/obsidian-cdp/) und wird
// importiert, nicht vendored — sie ist plugin-neutral. Fehlt das Dach (fremder
// Checkout), bricht esbuild beim Aufloesen ab: das ist die gewollte Meldung.
import { Cdp, attachTo, requireVisible } from "../../tools/obsidian-cdp/cdp.js";

const PLUGIN_ID = "koda-agent";

/** Kodas interne Nachrichtenform (`src/core/agent/types.ts`), soweit hier gebraucht. */
interface ToolCall { id: string; name: string; arguments: string }
interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

/** Verdichtungs-Marke (`CompactionRecord` in `src/core/agent/types.ts`) — der zweite Shape
 *  im `chatLog` neben `ChatMessage`. Referenziert nichts: ihre POSITION im Verlauf sagt,
 *  was verdichtet wurde. Hier gespiegelt statt importiert, wie `ChatMessage` darueber. */
interface CompactionRecord {
  kind: "compaction";
  stage: 1 | 2;
  at: string;
  forced?: true;
  keepToolResults: number;
  summary?: string;
  turns?: number;
  stats: { stubbed: number; bytes: number };
}

type LogEntry = ChatMessage | CompactionRecord;

/** Eine Zeile Bericht je Schritt, den Koda tatsaechlich gegangen ist. */
interface Step {
  kind: "tool-call" | "tool-result" | "answer" | "compaction";
  label: string;
  body: string;
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
}

/** Eine Marke je Verdichtung. Wortlaut bewusst nah an der Marke im Chat
 *  (`view.compaction.*`), damit Bericht und Fenster dasselbe Ereignis gleich benennen.
 *  Defensiv gelesen wie dort: `parseLines` prueft nur, DASS `stats` ein Objekt ist. */
function compactionStep(rec: CompactionRecord): Step {
  const forced = rec.forced === true ? ", erzwungen" : "";
  if (rec.stage === 1) {
    const kb = ((rec.stats?.bytes ?? 0) / 1024).toFixed(1);
    return { kind: "compaction", label: `Stufe 1: ${rec.stats?.stubbed ?? 0} Tool-Ergebnisse gekuerzt, ${kb} KB${forced}`, body: "" };
  }
  return { kind: "compaction", label: `Stufe 2: ${rec.turns ?? 0} Runden zusammengefasst${forced}`, body: rec.summary ?? "" };
}

/** `chatLog` → Bericht. Tool-Ergebnisse werden ihrem Aufruf ueber `toolCallId` zugeordnet,
 *  damit im Bericht „was wurde gefragt" und „was kam zurueck" beieinanderstehen. */
function toSteps(entries: LogEntry[]): Step[] {
  const nameById = new Map<string, string>();
  const steps: Step[] = [];
  for (const entry of entries) {
    if ((entry as CompactionRecord).kind === "compaction") {
      steps.push(compactionStep(entry as CompactionRecord));
      continue;
    }
    const m = entry as ChatMessage;
    if (m.role === "assistant") {
      for (const c of m.toolCalls ?? []) {
        nameById.set(c.id, c.name);
        steps.push({ kind: "tool-call", label: c.name, body: c.arguments });
      }
      if (m.content.trim() !== "") steps.push({ kind: "answer", label: "Antwort", body: m.content });
    } else if (m.role === "tool") {
      const name = m.toolCallId === undefined ? "?" : nameById.get(m.toolCallId) ?? "?";
      steps.push({ kind: "tool-result", label: `↳ ${name}`, body: m.content });
    }
  }
  return steps;
}

async function runOnce(cdp: Cdp, question: string, timeoutMs: number, fresh: boolean): Promise<Step[]> {
  if (fresh) {
    await cdp.evaluate(`await app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].newChat(); return true;`);
  }

  // Wie viele Nachrichten schon standen — der Bericht zeigt nur diesen Lauf.
  const before = await cdp.evaluate<number>(`
    return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].chatLog.length;
  `);

  // Bewusst OHNE await: `ask()` laeuft Minuten, ein `awaitPromise` liefe in das
  // CDP-Zeitlimit. Der Fortschritt wird stattdessen hier gepollt.
  const started = await cdp.evaluate<boolean>(`
    const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    if (p.busy) return false;
    void p.ask(${JSON.stringify(question)});
    return true;
  `);
  if (!started) throw new Error("Koda war bereits beschaeftigt — laeuft im Fenster noch eine Antwort?");

  const deadline = Date.now() + timeoutMs;
  let lastCount = before;
  for (;;) {
    await new Promise((r) => setTimeout(r, 1000));
    const state = await cdp.evaluate<{ busy: boolean; count: number }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      return { busy: p.busy, count: p.chatLog.length };
    `);
    // Ein Lebenszeichen je neuem Schritt: bei > 90 s Stille sieht ein stiller Treiber
    // aus wie ein haengender.
    if (state.count > lastCount) {
      lastCount = state.count;
      process.stdout.write(`  … ${state.count - before} Schritte\n`);
    }
    if (!state.busy) break;
    if (Date.now() > deadline) {
      await cdp.evaluate(`app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].stopRun(); return true;`);
      throw new Error(
        `Zeitueberschreitung nach ${Math.round(timeoutMs / 1000)} s. Moegliche Ursachen: Modell-Endpunkt ` +
          `nicht erreichbar, oder ein Bestaetigungs-Modal wartet im Fenster auf einen Klick.`,
      );
    }
  }

  const messages = await cdp.evaluate<LogEntry[]>(`
    return JSON.parse(JSON.stringify(
      app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].chatLog.slice(${before}),
    ));
  `);
  return toSteps(messages);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? undefined : argv[index + 1];
  };
  const all = (name: string): string[] => {
    const found: string[] = [];
    argv.forEach((a, i) => {
      if (a === `--${name}` && argv[i + 1] !== undefined) found.push(argv[i + 1]);
    });
    return found;
  };

  const question = flag("ask");
  if (question === undefined || question.trim() === "") {
    console.error('Aufruf: npm run gui:ask -- --vault <name> --ask "<Frage>" [--expect <text>] [--runs N]');
    process.exit(2);
  }
  const port = Number(flag("port") ?? 9222);
  const vault = flag("vault");
  const timeoutMs = Number(flag("timeout") ?? 300) * 1000;
  const runs = Number(flag("runs") ?? 1);
  // Ohne `--full` sind Tool-Ergebnisse gekuerzt — bequem zu lesen, aber als BELEG wertlos:
  // gerade der Teil, der eine Gegenprobe traegt (welche Pfade kamen aus dem Werkzeug, welche
  // hat das Modell dazuerfunden?), steht meist hinter dem Schnitt. Bei einer Gegenprobe also
  // immer `--full` — der geklippte Bericht kann nur zeigen, DASS ein Werkzeug lief.
  const full = argv.includes("--full");
  const expects = all("expect");
  const fresh = !argv.includes("--keep-session");

  console.log(`Praxistest — Obsidian auf Port ${port}`);
  // `attachTo` unterscheidet Haupt- und Einstellungen-Fenster an der Sache (nur das
  // Hauptfenster traegt einen Workspace), nicht am lokalisierten Fenstertitel.
  const cdp = await attachTo("workspace", port, vault);
  if (!cdp) {
    throw new Error(
      `Kein Obsidian-Hauptfenster auf Port ${port}` +
        (vault ? ` fuer Vault „${vault}"` : "") +
        ". Laeuft Obsidian mit --remote-debugging-port? (siehe Kopfkommentar)",
    );
  }
  try {
    // Ohne Fokus drosselt Chromium den Renderer — dieselbe Falle wie im GUI-Smoke.
    // `requireVisible` holt das Fenster selbst nach vorn und bricht mit
    // Handlungsanweisung ab, wenn das nicht reicht.
    if (process.platform === "darwin") {
      try {
        execFileSync("osascript", ["-e", 'tell application "Obsidian" to activate']);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } catch {
        console.log("  (Hinweis: `osascript activate` schlug fehl — Fenster ggf. von Hand nach vorn holen)");
      }
    }
    await requireVisible(cdp);

    const plugin = await cdp.evaluate<{ ok: boolean; version?: string; model?: string }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      if (!p) return { ok: false };
      // Das Modell am Endpunkt ist ein OVERRIDE, kein Pflichtfeld — greift keiner, gilt das
      // globale settings.model (Kit: effectiveModel). Ohne den Fallback meldete der Kopf
      // „(keins gesetzt)", waehrend der Lauf laengst gegen ein Modell sprach.
      const ep = p.settings?.endpoints?.[0];
      const model = (ep?.model ?? "").trim() || (p.settings?.model ?? "").trim();
      return { ok: true, version: p.manifest.version, model: model || "(keins gesetzt)" };
    `);
    if (!plugin.ok) throw new Error(`Plugin ${PLUGIN_ID} ist nicht aktiv. Erst deployen.`);
    console.log(`Vault: ${await cdp.evaluate<string>("return app.vault.getName();")}`);
    console.log(`Koda ${plugin.version} · Modell ${plugin.model}`);
    console.log(`Frage: ${question}\n`);

    const seen: string[][] = [];
    for (let run = 1; run <= runs; run++) {
      if (runs > 1) console.log(`--- Lauf ${run}/${runs}`);
      const steps = await runOnce(cdp, question, timeoutMs, fresh);
      seen.push(steps.filter((s) => s.kind === "tool-call").map((s) => s.label));

      console.log("");
      for (const s of steps) {
        if (s.kind === "tool-call") console.log(`  → ${s.label}(${clip(s.body, 160)})`);
        else if (s.kind === "tool-result") {
          console.log(full
            ? `    ${s.label}:\n${s.body.split("\n").map((l) => `      ${l}`).join("\n")}`
            : `    ${s.label}: ${clip(s.body, 400)}`);
        }
        else if (s.kind === "compaction") {
          console.log(`  ⇢ Verlauf verdichtet (${s.label})`);
          if (s.body !== "") {
            console.log(full
              ? s.body.split("\n").map((l) => `      ${l}`).join("\n")
              : `      ${clip(s.body, 400)}`);
          }
        }
        else console.log(`\n  Antwort:\n${s.body.split("\n").map((l) => `    ${l}`).join("\n")}`);
      }

      if (expects.length > 0) {
        // Gegen den GANZEN Verlauf geprueft, nicht nur gegen die Antwort: der Beleg fuer
        // einen Treffer steht im Tool-ERGEBNIS, auch wenn das Modell ihn spaeter unterschlaegt.
        const haystack = steps.map((s) => `${s.label} ${s.body}`).join("\n");
        console.log("");
        for (const e of expects) {
          const hit = haystack.includes(e);
          console.log(`  ${hit ? "✓" : "✗"} erwartet: ${e}`);
          if (!hit) process.exitCode = 1;
        }
      }
      console.log("");
    }

    if (runs > 1) {
      console.log("Werkzeugwahl je Lauf (nicht deterministisch — Stichprobe, kein Beweis):");
      seen.forEach((tools, i) => console.log(`  ${i + 1}: ${tools.join(", ") || "(keins)"}`));
    }
  } finally {
    cdp.close();
  }
}

main().catch((error: unknown) => {
  console.error(`\nFEHLER: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
