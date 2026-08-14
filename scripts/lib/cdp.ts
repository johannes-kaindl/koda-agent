/**
 * CDP-Minimalbruecke zu einem laufenden Obsidian — geteilte Grundlage der beiden
 * Treiber in `scripts/`.
 *
 * Herkunft: urspruenglich uebernommen aus `3d-codeblocks/scripts/gui-smoke.ts`,
 * 2026-08-07; am 2026-08-14 aus `koda-agent/scripts/gui-smoke.ts` hierher gezogen, als
 * `gui-ask.ts` dazukam und die Bruecke sonst ein drittes Mal kopiert worden waere.
 * Die Kommentare unten sind teuer bezahlt (Fokus-Drosselung, Vault-Wahl, echter Klick
 * statt `element.click()`) — nicht kuerzen, ohne den jeweiligen Fall zu kennen.
 *
 * Bewusst NICHT im Kit: die Bruecke haengt an Obsidians Renderer-Eigenheiten und hat mit
 * n=2 (hier) plus n=1 (3d-codeblocks, vendored) die Extraktionsschwelle des Dachs zwar
 * erreicht, aber die Abstraktionsgrenze ist zwischen den Repos noch nicht dieselbe —
 * 3d-codeblocks kennt kein Einstellungsfenster-Target. Erst wenn ein drittes Repo
 * dieselbe Form braucht, wandert sie ins Kit.
 */

// --- CDP-Minimalbrücke ------------------------------------------------------
// Node ≥21 bringt `WebSocket` global mit — keine Dependency nötig.

interface CdpTarget {
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

interface CdpResponse {
  id?: number;
  result?: { result?: { value?: unknown }; exceptionDetails?: { text?: string } };
  error?: { message?: string };
}

export class Cdp {
  private nextId = 1;
  private readonly pending = new Map<number, { ok: (v: CdpResponse) => void; fail: (e: Error) => void }>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as CdpResponse;
      if (message.id === undefined) return; // Event, kein Antwort-Frame
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.fail(new Error(message.error.message ?? "CDP-Fehler"));
      else waiter.ok(message);
    });
  }

  static async attach(port: number, vault?: string): Promise<Cdp> {
    return Cdp.attachTo(port, vault, "main");
  }

  /** Das Einstellungsfenster ist seit Obsidian 1.13 ein **eigenes** Fenster (`about:blank`),
   *  kein Modal im Haupt-DOM. Wer dort einen Knopf sucht, findet im Hauptfenster nichts und
   *  liest das als „Feature fehlt“ statt als „falscher Renderer“ (gemessen 2026-08-07).
   *  Vorher muss im Hauptfenster `app.setting.open()` gelaufen sein — vorher existiert das
   *  Target nicht. */
  static async attachSettings(port: number, vault?: string): Promise<Cdp> {
    return Cdp.attachTo(port, vault, "settings");
  }

  private static async attachTo(port: number, vault: string | undefined, which: "main" | "settings"): Promise<Cdp> {
    let targets: CdpTarget[];
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      targets = (await response.json()) as CdpTarget[];
    } catch {
      throw new Error(
        `Kein Debug-Port auf ${port}. Obsidian mit --remote-debugging-port=${port} neu starten ` +
          `(siehe Kopfkommentar).`,
      );
    }

    // Das Hauptfenster ist die Seite mit Obsidians app-Schema; Popouts und DevTools
    // tragen andere URLs. Ohne diese Auswahl landet man im falschen Renderer.
    // Das Einstellungsfenster traegt `about:blank` — es wird ueber den Titel erkannt,
    // der wie beim Hauptfenster den Vault-Namen fuehrt.
    const pages = targets.filter(
      (t) =>
        t.type === "page" &&
        t.webSocketDebuggerUrl !== undefined &&
        (which === "main" ? t.url.startsWith("app://obsidian.md") : t.url === "about:blank"),
    );
    if (pages.length === 0) {
      const seen = targets.map((t) => `${t.type} ${t.url}`).join("\n  ") || "(keine)";
      throw new Error(
        which === "settings"
          ? `Kein Einstellungsfenster unter den Targets — im Hauptfenster erst \`app.setting.open()\`:\n  ${seen}`
          : `Kein Obsidian-Fenster unter den Targets gefunden:\n  ${seen}\n` +
            `Laeuft Obsidian ohne offenes Fenster, ist der Renderer tot — App beenden und neu starten.`,
      );
    }

    // Mehrere offene Vaults sind der Normalfall, nicht die Ausnahme. Blind das erste
    // Fenster zu nehmen hiesse, den Smoke im falschen Vault zu fahren — und der
    // Fehlschlag saehe aus wie ein Plugin-Defekt ("Plugin nicht aktiv"). Der Titel
    // traegt den Vault-Namen ("<Notiz> - <Vault> - Obsidian x.y.z").
    const matching = vault
      ? pages.filter((t) => t.title.toLowerCase().includes(vault.toLowerCase()))
      : pages;
    if (matching.length === 0) {
      throw new Error(
        `Kein Fenster passt zu --vault ${vault}. Offen:\n  ${pages.map((t) => t.title).join("\n  ")}`,
      );
    }
    if (matching.length > 1) {
      throw new Error(
        `Mehrere Obsidian-Fenster offen — mit --vault <name> eines waehlen:\n  ` +
          matching.map((t) => t.title).join("\n  "),
      );
    }
    const page = matching[0];
    // Der Filter oben garantiert die URL, der Typ nicht — der Guard haelt beides zusammen.
    if (!page.webSocketDebuggerUrl) throw new Error(`Fenster ohne Debugger-URL: ${page.title}`);
    console.log(`Fenster: ${page.title}`);

    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("WebSocket-Verbindung fehlgeschlagen")), {
        once: true,
      });
    });
    return new Cdp(socket);
  }

  send(method: string, params: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<CdpResponse> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, fail) => {
      this.pending.set(id, { ok, fail });
      setTimeout(() => {
        if (!this.pending.delete(id)) return;
        fail(new Error(`Zeitüberschreitung: ${method}`));
      }, timeoutMs);
    });
  }

  /** Ausdruck im Renderer auswerten. Wirft die Renderer-Ausnahme weiter, statt sie
   *  als `undefined` zu verschlucken — sonst liest sich ein kaputter Ausdruck wie ein
   *  fehlgeschlagener Prüfpunkt. */
  async evaluate<T>(expression: string, timeoutMs = 30_000): Promise<T> {
    const message = await this.send(
      "Runtime.evaluate",
      { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true },
      timeoutMs,
    );
    const details = message.result?.exceptionDetails;
    if (details) throw new Error(`Renderer: ${details.text ?? "Ausnahme"}`);
    return message.result?.result?.value as T;
  }

  /**
   * Echter Mausklick auf die Mitte eines Elements (`Input.dispatchMouseEvent`) statt
   * `element.click()`.
   *
   * Der Unterschied ist nicht kosmetisch: ein synthetischer Klick traegt `isTrusted:false`
   * und laeuft an Host-Pfaden vorbei, die an echten Zeigereingaben haengen (Fokus, Blur,
   * Tooltip-Handling). Ein Defekt, der genau dort sitzt, bleibt dabei unsichtbar — der
   * Smoke waere gruen und der Nutzer trotzdem eingefroren.
   */
  async clickReal(selector: string): Promise<boolean> {
    const box = await this.evaluate<{ x: number; y: number } | null>(`
      const el = ${selector};
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    `);
    if (!box) return false;
    const common = { x: box.x, y: box.y, button: "left", clickCount: 1, buttons: 1 };
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...common, buttons: 0 });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", ...common });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...common, buttons: 0 });
    return true;
  }

  close(): void {
    this.socket.close();
  }
}

/** Im Renderer: warten, bis `check()` wahr wird (Rendering ist asynchron). */
export const waitFor = (body: string, timeoutMs = 8000): string => `
  const deadline = Date.now() + ${timeoutMs};
  while (Date.now() < deadline) {
    const value = (() => { ${body} })();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
`;

/** Fuer Pruefpunkt 3: derselbe Ausdruck, aber `await` im Rumpf erlaubt. */
export const waitForAsync = (body: string, timeoutMs = 8000): string => `
  const deadline = Date.now() + ${timeoutMs};
  while (Date.now() < deadline) {
    const value = await (async () => { ${body} })();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
`;
