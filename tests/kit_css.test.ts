import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findVendoredCss, missingKitCss } from "./vendor/kit/kit-css";

describe("Kit-CSS-Waechter", () => {
  const vendorDir = "src/vendor/kit-obsidian";

  it("findet die gevendorten *_CSS-Konstanten (sonst bewacht der Test nichts)", () => {
    expect(findVendoredCss(vendorDir).length).toBeGreaterThan(0);
  });

  it("styles.css traegt jede gevendorte Konstante wortgleich", () => {
    expect(missingKitCss(vendorDir, readFileSync("styles.css", "utf8"))).toEqual([]);
  });
});
