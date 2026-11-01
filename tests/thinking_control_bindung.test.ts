import { describe, it, expect, vi } from "vitest";
import { thinkingAlwaysGuessHint, thinkingLevelTexts, thinkingLockedTexts, thinkingOffTexts } from "../src/vendor/kit-obsidian/thinking-control";
import { buildModelBar } from "../src/vendor/kit-obsidian/model-bar";
import { createThinkingBinding, effectiveSuppress } from "../src/core/chat/thinking-binding";
import type { ThinkingLevel } from "../src/vendor/kit/sampling-profiles";
import { makeFakeEl } from "./vendor/kit/obsidian-mock";

// Welle 27 (K3), nachgeführt mit obsidian-kit 0.70.1 (locked), 0.71.0 (hint) und 0.73.0 (Stufen-Dropdown): Kodas Denk-Steuerung ist die des Kits in der Modellzeile (`buildModelBar({ thinking })`), seit 0.73.0 immer
// ein Dropdown mit den Stufen des Modells; der dritte Zustand „immer an“ (gpt-oss) läuft über das Kit-Feld `locked`. Gemessen wird die ECHTE Kit-Steuerung mit Kodas Anbindung (`createThinkingBinding`), nicht ein Nachbau:
// je Zustand die ANZEIGE (Wert, Einträge, gesperrt?, Name), der SCHREIBWEG (was schreibt eine Wahl?) und der REQUEST (`effectiveSuppress`, `tests/chat_client.test.ts`).
// Der Kernsatz: eine Stufe, die das Dropdown anbietet, muss ankommen. Wer „hoch“ wählt, sieht danach „hoch“ (kein Zurückspringen auf „mittel“), und die Stufe steht in den Einstellungen.

interface Zustand { suppress: boolean; level: ThinkingLevel | null; schreibt: number }

function zeile(model: string, backend: string, state: Zustand, lang: "en" | "de" = "en") {
  const think = createThinkingBinding({
    model: () => model,
    backend: () => backend,
    suppress: () => state.suppress,
    level: () => state.level,
    setThinking: async (patch) => {
      if (patch.suppress !== undefined) state.suppress = patch.suppress;
      if (patch.level !== undefined) state.level = patch.level;
      state.schreibt += 1;
    },
  });
  const el = makeFakeEl();
  const bar = buildModelBar({
    app: {} as never,
    containerEl: el as never,
    llm: { models: async () => ({ models: [model], reachable: true }), setModel: async () => {}, modelInUse: () => model, source: () => ({}) },
    onOtherEndpoint: null,
    strings: { lang },
    thinking: {
      family: think.family, backend: think.backend, current: think.current, onLevel: think.onLevel, setLevel: think.setLevel, levelPicker: think.levelPicker,
      strings: { button: (level) => (level === "off" ? "Thinking: off" : "Thinking: on"), pickerLabel: "Thinking", ...thinkingLevelTexts(lang), offNotPossible: thinkingOffTexts(lang) },
      locked: () => (think.alwaysOn() ? thinkingLockedTexts(lang) : undefined),
      hint: () => (think.guessAlways() ? thinkingAlwaysGuessHint(lang) : undefined),
    },
  });
  // Das Fake-DOM kennt keine Tag-Selektoren: die Steuerung hat Symbol (children[0]) und Dropdown (children[1]), der Wert steht in der Komponente.
  const dd = (): any => (el as any).querySelector(".okit-thinking-control")?.children[1]?.__component;
  const wahl = async (v: string): Promise<void> => { await dd().onChangeCB(v); await Promise.resolve(); await Promise.resolve(); };
  return {
    bar, state, dd, wahl,
    get wert(): string { return dd()?.getValue() ?? ""; },
    get eintraege(): string[] { return Object.keys(dd()?.options ?? {}); },
    get anzeige(): Record<string, string> { return dd()?.options ?? {}; },
    get gesperrt(): boolean { return dd()?.selectEl.disabled === true; },
    get aria(): string | null { return dd()?.selectEl.getAttribute("aria-label") ?? null; },
  };
}

const neu = (over: Partial<Zustand> = {}): Zustand => ({ suppress: false, level: null, schreibt: 0, ...over });

describe("Denk-Dropdown der Modellzeile: die Steuerung des Kits mit Kodas Anbindung (Messung)", () => {
  it("an, ohne eigene Wahl: „Mittel“ aus der Liste des Modells, bedienbar, Request unterdrückt nichts", () => {
    const k = zeile("qwen3.6-27b", "lmstudio", neu());
    expect(k.dd()).toBeTruthy();                                  // die Steuerung steht in der Zeile (Klasse des Kits), nicht im Kopf
    expect(k.gesperrt).toBe(false);
    expect(k.wert).toBe("medium");
    expect(k.eintraege).toEqual(["off", "low", "medium", "high"]);
    expect(k.anzeige.medium).toBe("Medium");
    expect(effectiveSuppress("qwen3.6-27b", false)).toBe(false);
  });

  it("aus: „Aus“, und eine Wahl schaltet an und schreibt die Stufe mit", async () => {
    const k = zeile("qwen3.6-27b", "lmstudio", neu({ suppress: true }));
    expect(k.wert).toBe("off");
    expect(effectiveSuppress("qwen3.6-27b", true)).toBe(true);
    await k.wahl("low");
    expect(k.state).toEqual({ suppress: false, level: "low", schreibt: 1 });
  });

  it("DER KERN: eine gewählte Stufe bleibt stehen (kein Zurückspringen auf „Mittel“) und liegt in den Einstellungen", async () => {
    const k = zeile("qwen3.6-27b", "lmstudio", neu());
    await k.wahl("high");
    expect(k.state).toEqual({ suppress: false, level: "high", schreibt: 1 });
    k.bar.update();
    expect(k.wert).toBe("high");
    await k.wahl("low");
    k.bar.update();
    expect(k.wert).toBe("low");
    expect(k.state.level).toBe("low");
  });

  it("Aus lässt die gewählte Stufe stehen, und Einschalten bringt sie zurück", async () => {
    const k = zeile("qwen3.6-27b", "lmstudio", neu({ level: "high" }));
    await k.wahl("off");
    expect(k.state).toEqual({ suppress: true, level: "high", schreibt: 1 });
    k.bar.update();
    expect(k.wert).toBe("off");
    const think = createThinkingBinding({ model: () => "qwen3.6-27b", backend: () => "lmstudio", suppress: () => k.state.suppress, level: () => k.state.level, setThinking: async (p) => { if (p.suppress !== undefined) k.state.suppress = p.suppress; } });
    await think.toggle();                                         // der Befehl „Thinking umschalten“ schaltet wieder an
    expect(think.current()).toBe("high");
  });

  it.each([false, true])("immer an (gpt-oss, Wunsch suppress=%s): gesperrt, Kit-Text, KEIN Schreibweg, Request unterdrückt nie", async (suppress) => {
    const k = zeile("gpt-oss-20b", "lmstudio", neu({ suppress }));
    expect(k.gesperrt).toBe(true);
    expect(k.anzeige[k.wert]).toBe("Always on");
    expect(k.aria).toBe("Thinking. Thinking: always on. This model always thinks; thinking can't be turned off here.");
    expect(k.state).toEqual(neu({ suppress }));                    // das Zeichnen schreibt nichts; die Bedienung ist gesperrt, `toggle` und der Request prüfen die Sperre selbst (unten)
    expect(effectiveSuppress("gpt-oss-20b", suppress)).toBe(false);
  });

  it("immer an, deutsch: „Immer an“ (Kit-Text)", () => {
    const k = zeile("gpt-oss-20b", "lmstudio", neu(), "de");
    expect(k.anzeige[k.wert]).toBe("Immer an");
    expect(k.gesperrt).toBe(true);
  });

  it("Claude: die Stufen des Modells (low bis max), „aus“ ist dort keine Stufe, und eine gespeicherte Stufe wird auf die Liste gelegt", () => {
    const aus = zeile("claude-sonnet-5-5", "anthropic", neu({ suppress: true }));
    expect(aus.eintraege).not.toContain("off");
    expect(aus.eintraege).toEqual(expect.arrayContaining(["low", "medium", "high"]));
    expect(aus.gesperrt).toBe(false);
    expect(effectiveSuppress("claude-sonnet-5-5", true)).toBe(true);   // der Request senkt dort nur den Aufwand (Kit)
    const hoch = zeile("claude-sonnet-5-5", "anthropic", neu({ level: "high" }));
    expect(hoch.wert).toBe("high");
  });

  it("gemma 4: auf LM Studio gibt es „Aus“ nicht (niedrigste Stufe), auf Ollama schon — das Backend entscheidet die Liste", () => {
    const lms = zeile("google/gemma-4-26b-a4b", "lmstudio", neu({ suppress: true }));
    const ollama = zeile("gemma4:e4b", "ollama", neu({ suppress: true }));
    expect(lms.eintraege).not.toContain("off");
    expect(ollama.eintraege).toContain("off");
    expect(lms.gesperrt).toBe(false);                              // kein „immer an“: der Request unterdrückt weiter (effectiveSuppress)
  });

  it("„denkt vermutlich immer“ (deepseek-r1): der Hinweis steht im Namen des bedienbaren Dropdowns, an wie aus", async () => {
    const an = zeile("deepseek-r1:8b", "lmstudio", neu());
    const aus = zeile("deepseek-r1:8b", "lmstudio", neu({ suppress: true }));
    expect(an.aria).toContain("This model probably always thinks — turning it off likely has no effect");
    expect(aus.aria).toContain("This model probably always thinks — turning it off likely has no effect");
    expect(an.gesperrt).toBe(false);
    await an.wahl("off");
    expect(an.state.suppress).toBe(true);
    expect(effectiveSuppress("deepseek-r1:8b", true)).toBe(true);
  });

  it("der Hinweis auf Deutsch, und ein Modell ohne Verdacht (qwen3) trägt keinen", () => {
    const de = zeile("qwq:32b", "lmstudio", neu(), "de");
    expect(de.aria).toContain("Dieses Modell denkt vermutlich immer — Abschalten wirkt wahrscheinlich nicht");
    const ohne = zeile("qwen3:8b", "lmstudio", neu());
    expect(ohne.aria).not.toContain("probably");
  });

  it("Claude: die Namens-Heuristik des Kits rät „denkt vermutlich immer“ (Entscheidung bleibt im Kit, Koda macht keine Ausnahme)", () => {
    expect(createThinkingBinding({ model: () => "claude-sonnet-5-5", backend: () => "anthropic", suppress: () => false, level: () => null, setThinking: async () => {} }).guessAlways()).toBe(true);
  });

  it("gpt-oss: gesperrt, und der Hinweis „vermutlich“ entfällt (das Modell denkt sicher)", () => {
    const k = zeile("gpt-oss-20b", "lmstudio", neu());
    expect(k.aria).not.toContain("probably");
  });

  it("ein Modellwechsel zeichnet die Steuerung neu: gesperrt, sobald das gesendete Modell gpt-oss ist (bar.update() liest das Modell frisch)", () => {
    let model = "qwen3:8b";
    const think = createThinkingBinding({ model: () => model, backend: () => "lmstudio", suppress: () => false, level: () => null, setThinking: async () => {} });
    const el = makeFakeEl();
    const bar = buildModelBar({
      app: {} as never, containerEl: el as never, onOtherEndpoint: null,
      llm: { models: async () => ({ models: [], reachable: true }), setModel: async () => {}, modelInUse: () => model, source: () => ({}) },
      thinking: {
        family: think.family, backend: think.backend, current: think.current, onLevel: think.onLevel, setLevel: think.setLevel, levelPicker: think.levelPicker,
        strings: { button: () => "T", pickerLabel: "T", ...thinkingLevelTexts("en") }, locked: () => (think.alwaysOn() ? thinkingLockedTexts("en") : undefined),
      },
    });
    const gesperrt = (): boolean => (el as any).querySelector(".okit-thinking-control")?.children[1]?.__component.selectEl.disabled === true;
    expect(gesperrt()).toBe(false);
    model = "gpt-oss:20b";
    bar.update();
    expect(gesperrt()).toBe(true);
    model = "qwen3:8b";
    bar.update();
    expect(gesperrt()).toBe(false);
  });
});

describe("Anbindung: alwaysOn, Befehl und Request-Seite", () => {
  const binding = (model: string, suppress = false) => createThinkingBinding({ model: () => model, backend: () => "unknown", suppress: () => suppress, level: () => null, setThinking: vi.fn(async () => {}) });

  it("guessAlways nur für den Namens-Verdacht, nie für gpt-oss (gesperrt) und nie ohne Modell", () => {
    for (const m of ["deepseek-r1:8b", "qwq:32b", "magistral-small", "glm-z1:9b"]) expect(binding(m).guessAlways()).toBe(true);
    for (const m of ["qwen3:8b", "gpt-oss:20b", ""]) expect(binding(m).guessAlways()).toBe(false);
  });

  it("alwaysOn nur für Modelle, die sich nicht abschalten lassen (gpt-oss/harmony)", () => {
    expect(binding("gpt-oss:20b").alwaysOn()).toBe(true);
    expect(binding("gpt-oss:20b", true).alwaysOn()).toBe(true);
    expect(binding("qwen3:8b").alwaysOn()).toBe(false);
    expect(binding("").alwaysOn()).toBe(false);
  });

  it("current/onLevel/setLevel bilden suppressThinking und thinkingLevel ab: off ↔ suppress, jede andere Stufe schaltet an UND merkt sich die Wahl", async () => {
    const setThinking = vi.fn(async () => {});
    const b = createThinkingBinding({ model: () => "qwen3:8b", backend: () => "unknown", suppress: () => true, level: () => null, setThinking });
    expect(b.current()).toBe("off");
    expect(b.onLevel()).toBe("medium");                  // ohne eigene Wahl die Anzeige wie bisher; das Kit legt sie auf die Liste des Modells
    await b.setLevel("off");
    await b.setLevel("high");
    expect(setThinking.mock.calls).toEqual([[{ suppress: true }], [{ suppress: false, level: "high" }]]);   // „aus“ lässt die Stufe stehen
    expect(b.levelPicker()).toBe(false);
  });

  it("current und onLevel kennen die gewählte Stufe", () => {
    const b = createThinkingBinding({ model: () => "qwen3:8b", backend: () => "unknown", suppress: () => false, level: () => "low", setThinking: async () => {} });
    expect(b.current()).toBe("low");
    expect(b.onLevel()).toBe("low");
  });

  it("der Befehl „Thinking umschalten“ kippt an/aus und tut bei einem gesperrten Modell nichts", async () => {
    const calls: unknown[] = [];
    const mk = (model: string, suppress: boolean) => createThinkingBinding({ model: () => model, backend: () => "unknown", suppress: () => suppress, level: () => null, setThinking: async (p) => { calls.push(p); } });
    await mk("qwen3:8b", false).toggle();
    await mk("qwen3:8b", true).toggle();
    expect(calls).toEqual([{ suppress: true }, { suppress: false }]);
    await mk("gpt-oss:20b", false).toggle();
    await mk("gpt-oss:20b", true).toggle();
    expect(calls).toHaveLength(2);                      // die Sperre gilt auch für diesen Zugang
  });
});

describe("effectiveSuppress — der Request folgt der Sperre des Knopfs", () => {
  it("immer-an-Modell + Suppress-Wunsch → nie unterdrücken", () => {
    expect(effectiveSuppress("gpt-oss:20b", true)).toBe(false);
  });
  it("normales Modell + Suppress-Wunsch → unterdrücken; ohne Wunsch → nicht", () => {
    expect(effectiveSuppress("qwen3:8b", true)).toBe(true);
    expect(effectiveSuppress("qwen3:8b", false)).toBe(false);
  });
  // Die reichere Erkennung des Kits (deepseek-r1, qwq: „denkt vermutlich immer“) fasst das Request-Verhalten nicht an: sie schlucken reasoning_effort:"none" als No-op,
  // gpt-oss/harmony lehnt den Request ab. Nur Letzteres rechtfertigt eine Sperre; Pflicht-Gegenprobe zur Zeile „alwaysOn“ oben.
  it.each(["deepseek-r1:8b", "qwq:32b", "magistral-small", "glm-z1:9b"])("%s: weder gesperrt noch vom Suppress ausgenommen", (model) => {
    const b = createThinkingBinding({ model: () => model, backend: () => "unknown", suppress: () => true, level: () => null, setThinking: async () => {} });
    expect(b.alwaysOn()).toBe(false);
    expect(effectiveSuppress(model, true)).toBe(true);
  });
});
