/**
 * Messrahmen Koda — Aufgabensatz × Modelle × Arme × Wiederholungen durch den echten Agent-Loop, ohne Obsidian.
 * Doku: docs/internal/messrahmen.md.
 *
 *   npx esbuild scripts/messrahmen/cli.ts --bundle --platform=node --format=esm --outfile="$TMPDIR/messrahmen.mjs" --log-level=warning \
 *     && node "$TMPDIR/messrahmen.mjs" --endpoint http://127.0.0.1:1234 --modelle <id>[,<id>] --arme basis,a,b,c --wiederholungen 5 --out <ordner>
 *   … && node "$TMPDIR/messrahmen.mjs" --attrappe muster --out <ordner>     # Trockenlauf, kein Modell
 *
 * Ein abgebrochener Lauf setzt mit demselben `--out` fort: fertige Läufe (Modell, Arm, Aufgabe, Wiederholung) stehen in
 * `laeufe.jsonl` und werden übersprungen. Ein API-Schlüssel kommt nur aus einer Umgebungsvariable (`--apikey-env NAME`).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SETTINGS } from "../../src/core/settings-types";
import { KodaChatClient } from "../../src/llm/KodaChatClient";
import { AUFGABEN } from "./aufgaben";
import { starteAttrappe } from "./attrappe";
import { bericht } from "./auswertung";
import { ARME, laufeAufgabe, type Arm, type LaufErgebnis } from "./laeufer";
import { startStand } from "./vault-stand";

function flag(name: string): string | null {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? null : (process.argv[at + 1] ?? null);
}
const liste = (s: string | null): string[] => (s ?? "").split(",").map((x) => x.trim()).filter((x) => x !== "");

/** Deterministisches Mischen (mulberry32), damit eine Fortsetzung dieselbe Reihenfolge sieht. */
function mische<T>(xs: T[], seed: number): T[] {
  let a = seed >>> 0;
  const rnd = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const nodeClock = {
  now: () => Date.now(),
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id: number) => clearTimeout(id),
};

async function main(): Promise<void> {
  const attrappeModus = flag("attrappe");
  if (attrappeModus !== null && attrappeModus !== "muster" && attrappeModus !== "falsch") throw new Error("--attrappe muster|falsch");
  const out = flag("out") ?? join(process.env.TMPDIR ?? "/tmp", `koda-messrahmen-${Date.now()}`);
  mkdirSync(out, { recursive: true });
  const attrappe = attrappeModus !== null ? await starteAttrappe() : null;
  const endpoint = attrappe?.url ?? flag("endpoint") ?? "http://127.0.0.1:1234";
  const modelle = attrappe !== null ? [`attrappe-${attrappeModus}`] : liste(flag("modelle"));
  if (modelle.length === 0) throw new Error("--modelle fehlt (Modell-Ids wie der Server sie nennt, durch Komma getrennt)");
  const arme = (liste(flag("arme")).length > 0 ? liste(flag("arme")) : ["basis"]) as Arm[];
  for (const a of arme) if (!(a in ARME)) throw new Error(`unbekannter Arm: ${a} (basis, a, b, c)`);
  const n = Number(flag("wiederholungen") ?? (attrappe !== null ? "1" : "5"));
  const nurIds = liste(flag("aufgaben"));
  const aufgaben = nurIds.length === 0 ? AUFGABEN : AUFGABEN.filter((a) => nurIds.includes(a.id));
  const fensterToken = Number(flag("fenster") ?? DEFAULT_SETTINGS.contextWindowTokens);
  const timeoutMs = Number(flag("timeout-sec") ?? DEFAULT_SETTINGS.timeoutSec) * 1000;
  const keyEnv = flag("apikey-env");
  const apiKey = keyEnv !== null ? (process.env[keyEnv] ?? "") : "";
  const suppressThinking = process.argv.includes("--denken") ? false : DEFAULT_SETTINGS.suppressThinking;
  const seed = Number(flag("seed") ?? "38");
  const start = startStand();

  const jsonl = join(out, "laeufe.jsonl");
  const fertig: LaufErgebnis[] = existsSync(jsonl)
    ? readFileSync(jsonl, "utf8").split("\n").filter((z) => z.trim() !== "").map((z) => JSON.parse(z) as LaufErgebnis)
    : [];
  const schluessel = (m: string, arm: string, id: string, w: number): string => `${m}\u0000${arm}\u0000${id}\u0000${w}`;
  const erledigt = new Set(fertig.map((l) => schluessel(l.modell, l.arm, l.aufgabe, l.wiederholung)));
  const ladePfad = join(out, "ladezeit.json");
  const ladezeitMs: Record<string, number> = existsSync(ladePfad) ? JSON.parse(readFileSync(ladePfad, "utf8")) as Record<string, number> : {};
  const gesamt = modelle.length * arme.length * n * aufgaben.length;
  console.log(`Messrahmen: ${modelle.length} Modell(e) × ${arme.length} Arm(e) × ${n} Wiederholung(en) × ${aufgaben.length} Aufgaben = ${gesamt} Läufe; schon fertig: ${erledigt.size}; Ausgabe ${out}`);

  for (const modell of modelle) {
    const offen = arme.some((arm) => aufgaben.some((a) => [...Array(n).keys()].some((w) => !erledigt.has(schluessel(modell, arm, a.id, w + 1)))));
    if (!offen) continue;
    // Aufwärmlauf: lädt das Modell (JIT) und weist die Ladezeit getrennt aus (REGISTRY, Methodik-Gotcha).
    if (!(modell in ladezeitMs) && !process.argv.includes("--kein-aufwaermen")) {
      const t0 = Date.now();
      const r = await new KodaChatClient({
        async postStream(url, body, headers, onChunk, signal) {
          const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal });
          const reader = res.body?.getReader();
          if (reader) { const dec = new TextDecoder(); for (;;) { const { done, value } = await reader.read(); if (done) break; onChunk(dec.decode(value, { stream: true })); } }
          return res.status;
        },
      }, timeoutMs, nodeClock).complete(
        { endpoint, apiKey, model: attrappe !== null ? "aufwaermen" : modell, suppressThinking: true },
        [{ role: "user", content: "Antworte nur mit OK." }], [], () => {}, () => {}, new AbortController().signal,
      );
      ladezeitMs[modell] = Date.now() - t0;
      writeFileSync(ladePfad, JSON.stringify(ladezeitMs, null, 2));
      console.log(`  Aufwärmen ${modell}: ${(ladezeitMs[modell] / 1000).toFixed(1)} s${r.ok ? "" : ` — FEHLER ${r.kind}: ${r.detail}`}`);
      if (!r.ok) { process.exitCode = 1; break; }
    }
    for (const arm of arme) {
      for (let w = 1; w <= n; w++) {
        for (const a of mische(aufgaben, seed * 1000 + w)) {
          if (erledigt.has(schluessel(modell, arm, a.id, w))) continue;
          const anfrage = attrappe !== null ? `${attrappeModus}/${a.id}/${arm}-${w}` : modell;
          const e = await laufeAufgabe(a, { endpoint, apiKey, modell: anfrage, arm, start, fensterToken, timeoutMs, suppressThinking }, w);
          e.modell = modell;
          appendFileSync(jsonl, `${JSON.stringify(e)}\n`);
          fertig.push(e);
          const grund = e.bestanden ? "" : ` — ${e.befunde.filter((b) => !b.pass).map((b) => b.note).join("; ")}`;
          console.log(`  ${e.bestanden ? "✓" : "✗"} ${modell} · ${arm} · ${a.id} · ${w}/${n} · ${e.runden} Runden · ${(e.gesamtMs / 1000).toFixed(1)} s${grund}`);
        }
      }
    }
  }
  await attrappe?.schliessen();
  const md = bericht(fertig, {
    datum: new Date().toISOString(), endpunkt: endpoint, wiederholungen: n, fensterToken, suppressThinking, ladezeitMs,
    ...(attrappe !== null ? { hinweis: `Trockenlauf gegen die Attrappe (${attrappeModus}), kein Modell.` } : {}),
  });
  writeFileSync(join(out, "bericht.md"), md);
  console.log(`\n${md}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
