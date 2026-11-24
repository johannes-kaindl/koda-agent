import type { Confidence } from "../../vendor/kit/capabilities";
import type { OcrProviderApi } from "../../vendor/kit/ocr-provider";
import type { DescribeProviderApi } from "../../vendor/kit/describe-provider";
import { describeErrorText, ocrErrorText } from "../../vendor/kit/provider-error-texts";

/** Formate, die Vision-Modelle und der OCR-Anbieter lesen. SVG fehlt mit Absicht: es ist Text,
 *  kein Rasterbild, und kein Vision-Endpunkt nimmt es als `image_url`. */
const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

export function imageExtension(path: string): string {
  const at = path.lastIndexOf(".");
  return at === -1 ? "" : path.slice(at + 1).toLowerCase();
}

export function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.has(imageExtension(path));
}

/** Zeichen, die ein Bild in der Token-Schaetzung (`estimateTokens`) kostet — grob 1000 Token.
 *  Ohne diesen Zuschlag saehe die Verdichtung ein Bild als leer, weil die Wire-Form ohne
 *  aufgeloeste URLs nur den Text misst. */
export const IMAGE_EST_CHARS = 4000;

export type ImageMode = "vision" | "ocr" | "none";

/** Vision, wenn das Modell sie wahrscheinlich kann (Entscheidung Master: `likely` genuegt);
 *  sonst OCR, wenn ein Anbieter da ist. */
export function chooseImageMode(vision: Confidence, ocrAvailable: boolean): ImageMode {
  if (vision !== "no") return "vision";
  return ocrAvailable ? "ocr" : "none";
}

export type ImageSource = "vision" | "ocr:image-to-markdown" | "describe:image-to-markdown";
export type ImageReadOutcome =
  | { ok: true; content: string; source: ImageSource; images?: { path: string }[] }
  | { ok: false; error: string };

/** Vision: das Werkzeug liefert nur einen Text-Marker, das Bild selbst haengt als Pfad am
 *  Ergebnis und wird erst am Transport-Rand zu einem `image_url`-Part (nie Base64 im Verlauf). */
export function visionResult(path: string): ImageReadOutcome {
  return { ok: true, source: "vision", content: `Bild ${path} — es ist diesem Ergebnis angehängt.`, images: [{ path }] };
}

/** OCR ueber den Anbieter image-to-markdown. Der Vertrag wirft nie — ein Wurf ist trotzdem
 *  ein Anbieter-Defekt und darf den Lauf nicht mitreissen. */
/** Warum der Text statt des Bildes kommt — das Ergebnis sagt es dazu, damit Koda (und der
 *  Nutzer im Werkzeugschritt) einen Textbericht nicht fuer das Bild selbst halten. */
export type OcrWhy = "no-vision" | "too-big" | "vision-failed";

const OCR_NOTE: Record<OcrWhy, string> = {
  "no-vision": "Hinweis: Das Bild kommt nur als OCR-Text an, weil das Modell ohne Bildfähigkeit erkannt wurde. Layout, Farben und Details, die nicht im Text stehen, kannst du daraus nicht beantworten — sag das, statt zu raten.",
  "too-big": "Hinweis: Das Bild ist größer als die Grenze für die Bildübergabe und kommt nur als OCR-Text an. Layout, Farben und Details, die nicht im Text stehen, kannst du daraus nicht beantworten — sag das, statt zu raten.",
  "vision-failed": "Hinweis: Das Modell konnte das Bild nicht annehmen; es kommt nur als OCR-Text an. Layout, Farben und Details, die nicht im Text stehen, kannst du daraus nicht beantworten — sag das, statt zu raten.",
};

export async function ocrResult(api: Pick<OcrProviderApi, "extractText">, path: string, why?: OcrWhy): Promise<ImageReadOutcome> {
  let r: Awaited<ReturnType<OcrProviderApi["extractText"]>>;
  try {
    r = await api.extractText(path);
  } catch (e) {
    return { ok: false, error: `Texterkennung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}` };
  }
  // Die Saetze kommen aus dem Kit (`ocrErrorText`). Deutsch, nicht nach UI-Sprache: der Rest dieses Ergebnisses und jeder andere
  // Werkzeug-Text Kodas ist deutsch, ein englischer Satz davor waere ein gemischtes Ergebnis fuer das Modell.
  if (typeof r !== "string") return { ok: false, error: ocrErrorText(r, "de") };
  const text = r.trim();
  const body = text === "" ? `Im Bild ${path} wurde kein Text erkannt.` : `Text aus ${path} (Texterkennung):\n\n${text}`;
  const content = why === undefined ? body : `${OCR_NOTE[why]}\n\n${body}`;
  return { ok: true, source: "ocr:image-to-markdown", content };
}

const DESCRIBE_NOTE: Record<OcrWhy, string> = {
  "no-vision": "Hinweis: Das Bild kommt nur als Beschreibung eines anderen Modells an, weil das Modell ohne Bildfähigkeit erkannt wurde. Einzelheiten, die in der Beschreibung fehlen, kannst du nicht beantworten — sag das, statt zu raten.",
  "too-big": "Hinweis: Das Bild ist größer als die Grenze für die Bildübergabe und kommt nur als Beschreibung eines anderen Modells an. Einzelheiten, die in der Beschreibung fehlen, kannst du nicht beantworten — sag das, statt zu raten.",
  "vision-failed": "Hinweis: Das Modell konnte das Bild nicht annehmen; es kommt nur als Beschreibung eines anderen Modells an. Einzelheiten, die in der Beschreibung fehlen, kannst du nicht beantworten — sag das, statt zu raten.",
};

/** Bildbeschreibung ueber den Anbieter image-to-markdown (`describeImage`, Kit-Vertrag `describe-provider`). Wie `ocrResult`: der Vertrag
 *  wirft nie, ein Wurf ist trotzdem ein Anbieter-Defekt. Deutsch gewuenscht (`language`): das Werkzeug-Ergebnis ist deutsch. */
export async function describeResult(api: Pick<DescribeProviderApi, "describeImage">, path: string, why?: OcrWhy): Promise<ImageReadOutcome> {
  let r: Awaited<ReturnType<DescribeProviderApi["describeImage"]>>;
  try {
    r = await api.describeImage(path, { language: "de" });
  } catch (e) {
    return { ok: false, error: `Bildbeschreibung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}` };
  }
  if ("error" in r) return { ok: false, error: describeErrorText(r, "de") };
  const from = r.model === undefined ? "" : `, ${r.model}`;
  const body = `Beschreibung von ${path} (Bildbeschreibung${from}):\n\n${r.text.trim()}`;
  return { ok: true, source: "describe:image-to-markdown", content: why === undefined ? body : `${DESCRIBE_NOTE[why]}\n\n${body}` };
}

/** Der Textweg fuer ein Bild, das das Modell nicht selbst sieht: erst die Beschreibung (image-to-markdown), scheitert sie, die
 *  Texterkennung; ohne Beschreibungs-API wie bisher nur Texterkennung. Scheitert die Beschreibung und es gibt keine Texterkennung,
 *  bleibt ihr Fehler das Ergebnis. */
export async function textResult(
  apis: { describe: Pick<DescribeProviderApi, "describeImage"> | null; ocr: Pick<OcrProviderApi, "extractText"> | null },
  path: string,
  why: OcrWhy,
): Promise<ImageReadOutcome> {
  let failed: ImageReadOutcome | null = null;
  if (apis.describe !== null) {
    const d = await describeResult(apis.describe, path, why);
    if (d.ok) return d;
    failed = d;
  }
  if (apis.ocr !== null) return ocrResult(apis.ocr, path, why);
  return failed ?? { ok: false, error: "Texterkennung nicht verfügbar: das Plugin image-to-markdown ist nicht (mehr) aktiv." };
}
