import { buildThinkingControl, thinkingOffTexts } from "../src/vendor/kit-obsidian/thinking-control";
import { describeModel } from "../src/vendor/kit/endpoint-source";
import { effectiveSuppress, thinkToggleView } from "../src/core/chat/reasoning-toggle";
import { makeFakeEl } from "./vendor/kit/obsidian-mock";

// Welle 27, K3 — Altentscheidung nachgeprüft (`thinking-control`, AGENTS.md „UI-Abweichungen“, docs/internal/decisions.md): trägt der Kit-Knopf Kodas Schalter?
// Gemessen wird die Anbindung, die K3 beschreibt: `current: suppress ? "off" : onLevel()`, `setLevel(l)` schreibt `suppressThinking = (l === "off")`, `levelPicker: () => false`,
// Familie über `describeModel`. Je Zustand (an, aus, immer an) die ANZEIGE (Knopf bedienbar? Beschriftung? aria-pressed?) und der REQUEST (`effectiveSuppress`).
// Ergebnis: der Request bleibt gleich, die Anzeige nicht — der dritte Zustand „immer an“ (gesperrter Knopf) hat im Kit-Knopf keine Entsprechung.

function kitControl(model: string, backend: string | undefined, state: { suppress: boolean }) {
  const el = makeFakeEl();
  const family = describeModel(model, undefined).family;
  buildThinkingControl({
    containerEl: el as never,
    family: () => family,
    backend: () => backend as never,
    current: () => (state.suppress ? "off" : "medium"),
    onLevel: () => "medium",
    setLevel: async (l) => { state.suppress = l === "off"; },
    levelPicker: () => false,
    strings: { button: (level) => (level === "off" ? "Thinking: off" : "Thinking: on"), level: (l) => l, pickerLabel: "Thinking level", offNotPossible: thinkingOffTexts("en") },
  });
  const btn: any = (el as any).querySelector(".okit-thinking-toggle");
  return { btn, text: (btn?.textContent ?? "") as string, aria: btn?.getAttribute("aria-label") as string | null, pressed: btn?.getAttribute("aria-pressed") as string | null };
}

describe("K3: der Kit-Knopf gegen Kodas Schalter (Messung)", () => {
  it("an: Anzeige und Request stimmen überein (Knopf bedienbar, gedrückt, Request unterdrückt nichts)", () => {
    const k = kitControl("qwen3.6-27b", "lm-studio", { suppress: false });
    const koda = thinkToggleView("qwen3.6-27b", false, "lm-studio");
    expect(k.pressed).toBe("true");
    expect(koda.pressed).toBe(true);
    expect(k.btn.disabled ?? false).toBe(false);
    expect(koda.disabled).toBe(false);
    expect(effectiveSuppress("qwen3.6-27b", false)).toBe(false);
  });

  it("aus: Anzeige und Request stimmen überein (nicht gedrückt, Request unterdrückt)", () => {
    const k = kitControl("qwen3.6-27b", "lm-studio", { suppress: true });
    const koda = thinkToggleView("qwen3.6-27b", true, "lm-studio");
    expect(k.pressed).toBe("false");
    expect(koda.pressed).toBe(false);
    expect(effectiveSuppress("qwen3.6-27b", true)).toBe(true);
  });

  it("immer an (gpt-oss): Kodas Knopf ist gesperrt, der Kit-Knopf ist bedienbar und ein Klick schreibt die Einstellung um — ANZEIGE und Schreibweg weichen ab, der Request nicht", () => {
    const state = { suppress: false };
    const k = kitControl("gpt-oss-20b", "lm-studio", state);
    const koda = thinkToggleView("gpt-oss-20b", false, "lm-studio");
    expect(koda.disabled).toBe(true);                       // Koda: gesperrt, aria-disabled, Klick ohne Wirkung (`toggleThinking` kehrt vorher zurück)
    expect(k.btn.disabled ?? false).toBe(false);            // Kit: kein `disabled` vorgesehen (ThinkingControlOptions kennt es nicht)
    k.btn.click();
    expect(state.suppress).toBe(true);                      // der Klick hätte die Einstellung „Denken unterdrücken“ geändert, die Koda hier festhält
    expect(effectiveSuppress("gpt-oss-20b", state.suppress)).toBe(false);   // der Request ignoriert sie weiter: gleich
    expect(effectiveSuppress("gpt-oss-20b", false)).toBe(false);
  });

  it("Claude, aus: der Kit-Knopf nennt „niedrigste Stufe“ (Text des Kits), Kodas Knopf „aus“ mit dem Claude-Hinweis — zwei Beschriftungen für denselben Zustand", () => {
    const k = kitControl("claude-sonnet-5-5", "anthropic", { suppress: true });
    const koda = thinkToggleView("claude-sonnet-5-5", true, "anthropic");
    expect(k.text).toBe("Thinking: lowest level");
    expect(koda.labelKey).toBe("view.thinkingOff");
    expect(koda.hintKey).toBe("view.thinkingHintClaude");
    expect(effectiveSuppress("claude-sonnet-5-5", true)).toBe(true);
  });
});
