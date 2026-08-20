// uebernommen aus vault-rag/src/chat_error.ts, 2026-08-05
/** Pure Übersetzung eines Chat-Transportfehlers in deutschen Klartext.
 *  Kein Transport, kein obsidian-Import — nur Fehler-Shape → Anzeigetext.
 *
 *  Warum es das gibt: der Chat-Pfad ersetzte JEDEN Fehler durch die Festmeldung
 *  „Chat-LLM nicht erreichbar (lokal/VPN)." — auch ein HTTP 401 mit
 *  `{"detail":"Not authenticated"}`. Die Ursache stand also in der Antwort und wurde
 *  gegen eine Vermutung getauscht, die bei einem gehosteten Endpunkt zusätzlich in die
 *  falsche Richtung zeigt (gemeldet 2026-08-05, externer OpenWebUI-Endpunkt).
 */

import { errorMessageFromText } from "../../vendor/kit/error_body";

/** Transportfehler MIT HTTP-Antwort. Trägt Status + Rohbody, damit die Anzeige-Schicht
 *  entscheiden kann — ein `Error("Chat HTTP 401")` hätte den Body bereits weggeworfen. */
export class ChatHttpError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`Chat HTTP ${status}`);
    this.name = "ChatHttpError";
  }
}

// uebernommen aus vault-crews/src/core/chat-response.ts, 2026-08-18
const OVERFLOW_RE = /context (length|window)|too many tokens|maximum context length/i;

/** True, wenn ein (Fehler-)Body auf ein überschrittenes Kontextfenster hindeutet.
 *  Der Server-Text bleibt daneben erhalten — hier wird nur klassifiziert, nicht ersetzt. */
export function isContextOverflow(body: string): boolean {
  return OVERFLOW_RE.test(body);
}

const MAX_DETAIL = 200;

/** Serverbegründung aus einem Rohbody: erst als JSON, sonst gekürzter Rohtext.
 *  "" wenn nichts Verwertbares drinsteht. */
function serverDetail(body: string): string {
  const raw = body.trim();
  if (!raw) return "";
  // `?? raw` bleibt: das Kit gibt bei Nicht-JSON null zurueck und ueberlaesst die
  // Entscheidung dem Aufrufer, weil nur der sein Kuerzungsmass kennt (MAX_DETAIL).
  const msg = errorMessageFromText(raw) ?? raw;
  const oneLine = msg.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_DETAIL ? `${oneLine.slice(0, MAX_DETAIL)}…` : oneLine;
}

function withDetail(text: string, detail: string): string {
  return detail ? `${text} — Server: ${detail}` : text;
}

/** EINE Wahrheit für den Fehlertext einer fehlgeschlagenen Chat-Anfrage. */
export function chatErrorMessage(e: unknown): string {
  if (e instanceof ChatHttpError) {
    const detail = serverDetail(e.body);
    if (e.status === 401 || e.status === 403) {
      return withDetail(
        `Zugriff verweigert (HTTP ${e.status}) — API-Schlüssel fehlt, ist ungültig oder abgelaufen.`,
        detail,
      );
    }
    if (e.status === 404) {
      return withDetail(
        `Chat-Pfad nicht gefunden (HTTP 404) — Adresse des Endpunkts prüfen.`,
        detail,
      );
    }
    if (e.status === 429) {
      return withDetail(`Zu viele Anfragen (HTTP 429) — später erneut versuchen.`, detail);
    }
    if (e.status >= 500) {
      return withDetail(`Server-Fehler am Chat-Endpunkt (HTTP ${e.status}).`, detail);
    }
    // 400 und andere 4xx: die Begründung des Servers ist hier der eigentliche Inhalt
    // (fehlender/unbekannter Modellname, ungültige Parameter).
    return withDetail(`Anfrage abgelehnt (HTTP ${e.status}).`, detail);
  }
  return "Chat-LLM nicht erreichbar — Server aus, Adresse falsch oder Netz/VPN nicht verbunden.";
}
