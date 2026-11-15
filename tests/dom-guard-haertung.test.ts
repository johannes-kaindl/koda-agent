// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { attachDomGuard } from "../src/vendor/kit-obsidian/dom-guard";
import { probeDomGuard } from "./vendor/kit/dom-guard-probe";

// Linkschutz: die Kopie des Wächters, die Koda ausliefert, hält die Härtungsfälle des Kits (on*-Attribute, Formulare, ping, javascript:/obsidian:-Links, Verweise auf die Wirtsseite, wartende Rahmen).
// Klick, Navigation und Anfragen (Gruppe `limit`) misst nur der echte Chromium, nicht dieser Test.
it("der Wächter hält die Härtungsfälle (kein Fall außer held)", async () => {
  expect((await probeDomGuard(attachDomGuard)).filter((x) => x.state !== "held")).toEqual([]);
});
