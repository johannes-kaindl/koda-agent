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

  it("styles.css traegt kein ungeaufgeloestes ${…} (Befund svg-studio 0.1.3: STREAM_AREA_CSS setzt ${COPY_BUTTON_CSS} ein, der kopierte Rohtext ist im Stylesheet ungueltig und faellt im Store auf)", () => {
    const css = readFileSync("styles.css", "utf8");
    expect(css.match(/\$\{[^}]*\}/g) ?? []).toEqual([]);
  });

  it("Gegenprobe: der Pruefer findet ein eingeschlepptes ${…}", () => {
    const mutiert = readFileSync("styles.css", "utf8") + "\n${COPY_BUTTON_CSS}\n";
    expect(mutiert.match(/\$\{[^}]*\}/g) ?? []).toEqual(["${COPY_BUTTON_CSS}"]);
  });
});
