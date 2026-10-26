import { describe, it, expect, vi } from "vitest";
import { thinkingAlwaysGuessHint, thinkingLockedTexts, thinkingOffTexts } from "../src/vendor/kit-obsidian/thinking-control";
import { buildModelBar } from "../src/vendor/kit-obsidian/model-bar";
import { createThinkingBinding, effectiveSuppress } from "../src/core/chat/thinking-binding";
import { makeFakeEl } from "./vendor/kit/obsidian-mock";

// Welle 27 (K3), nachgeführt mit obsidian-kit 0.70.1 (locked) und 0.71.0 (hint): Kodas Denk-Steuerung ist der Knopf des Kits in der Modellzeile (`buildModelBar({ thinking })`), der dritte Zustand „immer an“ (gpt-oss)
// läuft über das Kit-Feld `locked`. Gemessen wird der ECHTE Kit-Knopf mit Kodas Anbindung (`createThinkingBinding`), nicht ein Nachbau: je Zustand die ANZEIGE (bedienbar? Beschriftung? aria-pressed?),
// der SCHREIBWEG (ändert ein Klick `suppressThinking`?) und der REQUEST (`effectiveSuppress`). Der Request ist unverändert gegenüber der Kopf-Aktion, die dieser Knopf ablöst.

interface Zustand { suppress: boolean; schreibt: number }

function zeile(model: string, backend: string, state: Zustand, lang: "en" | "de" = "en") {
  const think = createThinkingBinding({
    model: () => model,
    backend: () => backend,
    suppress: () => state.suppress,
    setSuppress: async (s) => { state.suppress = s; state.schreibt += 1; },
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
      strings: { button: (level) => (level === "off" ? "Thinking: off" : "Thinking: on"), level: (l) => l, pickerLabel: "Thinking", offNotPossible: thinkingOffTexts(lang) },
      locked: () => (think.alwaysOn() ? thinkingLockedTexts(lang) : undefined),
      hint: () => (think.guessAlways() ? thinkingAlwaysGuessHint(lang) : undefined),
    },
  });
  const btn: any = (el as any).querySelector(".okit-thinking-toggle")  // der Mock kennt keine Nachfahren-Selektoren; die Zeile hat genau einen Knopf;
  return { bar, btn, state, text: (btn?.textContent ?? "") as string, aria: btn?.getAttribute("aria-label") as string | null, pressed: btn?.getAttribute("aria-pressed") as string | null };
}

describe("Denk-Knopf der Modellzeile: der Kit-Knopf mit Kodas Anbindung (Messung)", () => {
  it("an: bedienbar, gedrückt, Request unterdrückt nichts; ein Klick schaltet aus und schreibt die Einstellung", () => {
    const k = zeile("qwen3.6-27b", "lmstudio", { suppress: false, schreibt: 0 });
    expect(k.btn).toBeTruthy();                         // der Knopf steht in der Zeile (Klasse des Kits), nicht mehr im Kopf
    expect(k.btn.disabled ?? false).toBe(false);
    expect(k.pressed).toBe("true");
    expect(k.text).toBe("Thinking: on");
    expect(effectiveSuppress("qwen3.6-27b", false)).toBe(false);
    k.btn.click();
    expect(k.state).toEqual({ suppress: true, schreibt: 1 });
  });

  it("aus: nicht gedrückt, Request unterdrückt; ein Klick schaltet an", () => {
    const k = zeile("qwen3.6-27b", "lmstudio", { suppress: true, schreibt: 0 });
    expect(k.pressed).toBe("false");
    expect(k.text).toBe("Thinking: off");
    expect(effectiveSuppress("qwen3.6-27b", true)).toBe(true);
    k.btn.click();
    expect(k.state).toEqual({ suppress: false, schreibt: 1 });
  });

  it.each([false, true])("immer an (gpt-oss, Wunsch suppress=%s): gesperrt, gedrückt, Kit-Text, KEIN Schreibweg, Request unterdrückt nie", (suppress) => {
    const k = zeile("gpt-oss-20b", "lmstudio", { suppress, schreibt: 0 });
    expect(k.btn.disabled).toBe(true);
    expect(k.pressed).toBe("true");
    expect(k.text).toBe("Thinking: always on");
    expect(k.aria).toBe("Thinking: always on. This model always thinks; thinking can't be turned off here.");
    k.btn.click();
    expect(k.state).toEqual({ suppress, schreibt: 0 });   // der Klick schreibt „Denken unterdrücken“ nicht um
    expect(effectiveSuppress("gpt-oss-20b", suppress)).toBe(false);
  });

  it("immer an, deutsch: „Denken: immer an“ (Kit-Text)", () => {
    const k = zeile("gpt-oss-20b", "lmstudio", { suppress: false, schreibt: 0 }, "de");
    expect(k.text).toBe("Denken: immer an");
    expect(k.btn.disabled).toBe(true);
  });

  it("Claude, aus: „niedrigste Stufe“ statt „aus“ (der Request senkt nur den Aufwand), bedienbar, Request unterdrückt", () => {
    const k = zeile("claude-sonnet-5-5", "anthropic", { suppress: true, schreibt: 0 });
    expect(k.text).toBe("Thinking: lowest level");       // früher Kodas „Thinking: aus“ mit dem Claude-Hinweis: der Kit-Text sagt dasselbe und gilt für jede Familie, die sich nicht abschalten lässt
    expect(k.aria).toContain("lowest available level");
    expect(k.btn.disabled ?? false).toBe(false);
    expect(effectiveSuppress("claude-sonnet-5-5", true)).toBe(true);
    k.btn.click();
    expect(k.state).toEqual({ suppress: false, schreibt: 1 });
  });

  it("gemma 4: auf LM Studio lässt sich „aus“ nicht erreichen (niedrigste Stufe), auf Ollama schon — das Backend entscheidet die Beschriftung", () => {
    const lms = zeile("google/gemma-4-26b-a4b", "lmstudio", { suppress: true, schreibt: 0 });
    const ollama = zeile("gemma4:e4b", "ollama", { suppress: true, schreibt: 0 });
    expect(lms.text).toBe("Thinking: lowest level");
    expect(ollama.text).toBe("Thinking: off");
    expect(lms.btn.disabled ?? false).toBe(false);   // kein „immer an“: der Request unterdrückt weiter (effectiveSuppress), der Kit-Text sagt nur, was auf diesem Backend ankommt
  });

  it("„denkt vermutlich immer“ (deepseek-r1): der Hinweis steht im bedienbaren Knopf, an wie aus; der Knopf schaltet weiter und der Request unterdrückt", () => {
    const an = zeile("deepseek-r1:8b", "ollama", { suppress: false, schreibt: 0 });
    const aus = zeile("deepseek-r1:8b", "ollama", { suppress: true, schreibt: 0 });
    expect(an.aria).toBe("Thinking: on. This model probably always thinks — turning it off likely has no effect");
    expect(aus.aria).toBe("Thinking: off. This model probably always thinks — turning it off likely has no effect");
    expect(an.text).toBe("Thinking: on");              // die sichtbare Beschriftung bleibt, der Hinweis steht im Namen des Knopfs (Tooltip)
    expect(an.btn.disabled ?? false).toBe(false);
    an.btn.click();
    expect(an.state).toEqual({ suppress: true, schreibt: 1 });
    expect(effectiveSuppress("deepseek-r1:8b", true)).toBe(true);
  });

  it("der Hinweis auf Deutsch, und ein Modell ohne Verdacht (qwen3) trägt keinen aria-label", () => {
    const de = zeile("qwq:32b", "lmstudio", { suppress: false, schreibt: 0 }, "de");
    expect(de.aria).toBe("Thinking: on. Dieses Modell denkt vermutlich immer — Abschalten wirkt wahrscheinlich nicht");
    const ohne = zeile("qwen3:8b", "lmstudio", { suppress: false, schreibt: 0 });
    expect(ohne.aria).toBeNull();
  });

  it("Claude: die Namens-Heuristik des Kits rät „denkt vermutlich immer“ — der Hinweis steht im Knopf; im Zustand aus nennt der Name nur den Grund „niedrigste Stufe“, der Hinweis entfällt dort (Entscheidung bleibt im Kit, Koda macht keine Ausnahme)", () => {
    expect(createThinkingBinding({ model: () => "claude-sonnet-5-5", backend: () => "anthropic", suppress: () => false, setSuppress: async () => {} }).guessAlways()).toBe(true);
    const an = zeile("claude-sonnet-5-5", "anthropic", { suppress: false, schreibt: 0 });
    const aus = zeile("claude-sonnet-5-5", "anthropic", { suppress: true, schreibt: 0 });
    expect(an.aria).toBe("Thinking: on. This model probably always thinks — turning it off likely has no effect");
    // Der Name trägt höchstens EINEN Grund (obsidian-kit 0.72.0): im Zustand aus erklärt „niedrigste Stufe“ schon, warum der Knopf nicht abschaltet,
    // der Verdacht „denkt vermutlich immer“ steht dort nicht noch einmal daneben. Im Zustand an (oben) bleibt er der einzige Grund.
    expect(aus.aria!.startsWith("Thinking: lowest level. Thinking can't be fully turned off here")).toBe(true);
    expect(aus.aria).not.toContain("probably always thinks");
    expect(aus.btn.disabled ?? false).toBe(false);
  });

  it("gpt-oss: gesperrt, und der Hinweis „vermutlich“ entfällt (das Modell denkt sicher)", () => {
    const k = zeile("gpt-oss-20b", "lmstudio", { suppress: false, schreibt: 0 });
    expect(k.aria).toBe("Thinking: always on. This model always thinks; thinking can't be turned off here.");
    expect(k.aria).not.toContain("probably");
  });

  it("Claude, an: „Thinking: on“, nicht gesperrt (Claude ist kein immer-denkendes Modell im Sinn von gpt-oss)", () => {
    const k = zeile("claude-sonnet-5-5", "anthropic", { suppress: false, schreibt: 0 });
    expect(k.text).toBe("Thinking: on");
    expect(k.btn.disabled ?? false).toBe(false);
  });

  it("ein Modellwechsel zeichnet den Knopf neu: gesperrt, sobald das gesendete Modell gpt-oss ist (bar.update() liest das Modell frisch)", () => {
    let model = "qwen3:8b";
    const state = { suppress: false };
    const think = createThinkingBinding({ model: () => model, backend: () => "lmstudio", suppress: () => state.suppress, setSuppress: async () => {} });
    const el = makeFakeEl();
    const bar = buildModelBar({
      app: {} as never, containerEl: el as never, onOtherEndpoint: null,
      llm: { models: async () => ({ models: [], reachable: true }), setModel: async () => {}, modelInUse: () => model, source: () => ({}) },
      thinking: {
        family: think.family, backend: think.backend, current: think.current, onLevel: think.onLevel, setLevel: think.setLevel, levelPicker: think.levelPicker,
        strings: { button: () => "T", level: (l) => l, pickerLabel: "T" }, locked: () => (think.alwaysOn() ? thinkingLockedTexts("en") : undefined),
      },
    });
    const btn = () => (el as any).querySelector(".okit-thinking-toggle");
    expect(btn().disabled ?? false).toBe(false);
    model = "gpt-oss:20b";
    bar.update();
    expect(btn().disabled).toBe(true);
    model = "qwen3:8b";
    bar.update();
    expect(btn().disabled ?? false).toBe(false);
  });
});

describe("Anbindung: alwaysOn, Befehl und Request-Seite", () => {
  const binding = (model: string, suppress = false) => createThinkingBinding({ model: () => model, backend: () => "unknown", suppress: () => suppress, setSuppress: vi.fn(async () => {}) });

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

  it("current/onLevel/setLevel bilden suppressThinking ab: off ↔ suppress, jede andere Stufe ↔ nicht unterdrückt", async () => {
    const setSuppress = vi.fn(async () => {});
    const b = createThinkingBinding({ model: () => "qwen3:8b", backend: () => "unknown", suppress: () => true, setSuppress });
    expect(b.current()).toBe("off");
    expect(b.onLevel()).not.toBe("off");
    await b.setLevel("off");
    await b.setLevel(b.onLevel());
    expect(setSuppress.mock.calls).toEqual([[true], [false]]);
    expect(b.levelPicker()).toBe(false);
  });

  it("der Befehl „Thinking umschalten“ kippt an/aus und tut bei einem gesperrten Modell nichts", async () => {
    const calls: boolean[] = [];
    const mk = (model: string, suppress: boolean) => createThinkingBinding({ model: () => model, backend: () => "unknown", suppress: () => suppress, setSuppress: async (s) => { calls.push(s); } });
    await mk("qwen3:8b", false).toggle();
    await mk("qwen3:8b", true).toggle();
    expect(calls).toEqual([true, false]);
    await mk("gpt-oss:20b", false).toggle();
    await mk("gpt-oss:20b", true).toggle();
    expect(calls).toEqual([true, false]);               // die Sperre gilt auch für diesen Zugang
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
    const b = createThinkingBinding({ model: () => model, backend: () => "unknown", suppress: () => true, setSuppress: async () => {} });
    expect(b.alwaysOn()).toBe(false);
    expect(effectiveSuppress(model, true)).toBe(true);
  });
});
