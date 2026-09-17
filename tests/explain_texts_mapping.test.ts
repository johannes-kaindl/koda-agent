import { describe, it, expect } from "vitest";
import { t, setLang } from "../src/vendor/kit/i18n";
import { EXPLAIN_TEXTS } from "../src/vendor/kit/explain-texts";
import "../src/i18n/strings";

/* Sieben von acht Kit-Erklaertexten (explain-texts.ts@0.38.0) sind auf Kodas eigene
   i18n-Schluessel gemappt (Auftrag kodatext-w5). Der achte (reasoningIgnoresSuppress)
   hat in Koda keine Entsprechung — Koda meldet den Sachverhalt bislang nicht, das ist
   kein Teil dieses Auftrags. Getestet wird die Zuordnung, nicht der Kit-Text selbst
   (der ist obsidian-frei und Sache des Kit-Repos). */
const MAPPING: { key: string; explainKey: keyof typeof EXPLAIN_TEXTS; placeholder?: string; fill: string }[] = [
  { key: "error.chatBlocked", explainKey: "corsBlocked", fill: "" },
  { key: "settings.model.hint.no-list", explainKey: "noModelList", fill: "" },
  { key: "settings.endpoints.thirdParty", explainKey: "apiKeyThirdParty", placeholder: "{content}", fill: "X" },
  { key: "settings.model.hint.unreachable", explainKey: "endpointUnreachableKeepsModel", fill: "" },
  { key: "view.thoughtOnly", explainKey: "reasoningOnlyNoText", fill: "" },
  { key: "settings.suppress.desc", explainKey: "suppressThinkingDesc", placeholder: "{feature}", fill: "X" },
  { key: "error.truncatedEmpty", explainKey: "tokenLimitBeforeText", fill: "" },
];

describe("Kit-Erklaertexte (explain-texts.ts@0.38.0) auf Kodas t() gemappt", () => {
  for (const lang of ["en", "de"] as const) {
    for (const { key, explainKey, placeholder, fill } of MAPPING) {
      it(`${key} liefert den Kit-Text (${lang.toUpperCase()})`, () => {
        setLang(lang);
        const kitText = EXPLAIN_TEXTS[explainKey][lang];
        const expected = placeholder ? kitText.replace(placeholder, fill) : kitText;
        const actual = placeholder ? t(key, fill) : t(key);
        expect(actual).toBe(expected);
      });
    }
  }
});
