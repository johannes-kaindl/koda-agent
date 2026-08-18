import { describe, it, expect } from "vitest";
import { ChatHttpError, chatErrorMessage, extractErrorMessage, isContextOverflow } from "../src/core/llm/chat-error";

describe("extractErrorMessage", () => {
  it("zieht error.message aus einem OpenAI-Fehlerbody", () => {
    expect(extractErrorMessage({ error: { message: "model not found" } })).toBe("model not found");
  });
  it("zieht error, wenn es selbst ein String ist", () => {
    expect(extractErrorMessage({ error: "kaputt" })).toBe("kaputt");
  });
  it("zieht message als Rückfall", () => {
    expect(extractErrorMessage({ message: "hoppla" })).toBe("hoppla");
  });
  it("zieht detail — die FastAPI-Form, die OpenWebUI schickt", () => {
    expect(extractErrorMessage({ detail: "Not authenticated" })).toBe("Not authenticated");
  });
  it("null bei unbekanntem Body — der Aufrufer nutzt dann den Rohtext", () => {
    expect(extractErrorMessage({ irgendwas: 1 })).toBeNull();
    expect(extractErrorMessage("kein objekt")).toBeNull();
  });
});

describe("chatErrorMessage", () => {
  it("401 nennt den Schlüssel als Ursache statt das Netz", () => {
    const msg = chatErrorMessage(new ChatHttpError(401, '{"detail":"Not authenticated"}'));
    expect(msg).toContain("401");
    expect(msg).toMatch(/Schlüssel/);
    expect(msg).not.toMatch(/VPN/);
  });
  it("403 wird wie 401 als Zugriffsproblem gemeldet", () => {
    expect(chatErrorMessage(new ChatHttpError(403, ""))).toMatch(/Schlüssel/);
  });
  it("400 zeigt die Serverbegründung — dort steht der eigentliche Grund", () => {
    const msg = chatErrorMessage(new ChatHttpError(400, '{"error":{"message":"model \\"\\" not found"}}'));
    expect(msg).toContain('model "" not found');
  });
  it("404 zeigt auf die Adresse, nicht auf die Erreichbarkeit", () => {
    const msg = chatErrorMessage(new ChatHttpError(404, ""));
    expect(msg).toContain("404");
    expect(msg).toMatch(/Adresse|Pfad/);
  });
  it("5xx wird als Server-Fehler gemeldet, nicht als Konfigurationsfehler", () => {
    expect(chatErrorMessage(new ChatHttpError(502, ""))).toMatch(/Server/);
  });
  it("nicht-JSON-Body wird gekürzt durchgereicht statt verworfen", () => {
    const msg = chatErrorMessage(new ChatHttpError(500, "<html>Gateway kaputt</html>"));
    expect(msg).toContain("Gateway kaputt");
  });
  it("ein Fehler ohne HTTP-Status bleibt der Erreichbarkeits-Fall", () => {
    const msg = chatErrorMessage(new Error("Chat-Netzwerkfehler"));
    expect(msg).toMatch(/nicht erreichbar/);
  });
  it("nennt beim Erreichbarkeits-Fall nicht mehr nur lokal/VPN — Cloud-Endpunkte gibt es auch", () => {
    // Regression: die alte Festmeldung riet „(lokal/VPN)" und schickte damit jeden
    // Nutzer eines gehosteten Endpunkts in die falsche Richtung.
    expect(chatErrorMessage(new Error("boom"))).not.toBe("Chat-LLM nicht erreichbar (lokal/VPN).");
  });
});

describe("isContextOverflow", () => {
  it("erkennt LM-Studio-, Ollama- und OpenAI-Formulierungen", () => {
    expect(isContextOverflow('{"error":"The number of tokens to keep from the initial prompt is greater than the context length"}')).toBe(true);
    expect(isContextOverflow('{"error":{"message":"This model\'s maximum context length is 8192 tokens. However, your messages resulted in 9000 tokens."}}')).toBe(true);
    expect(isContextOverflow("context window exceeded")).toBe(true);
    expect(isContextOverflow("Too many tokens in prompt")).toBe(true);
  });
  it("laesst gewoehnliche Fehler durch", () => {
    expect(isContextOverflow('{"detail":"Not authenticated"}')).toBe(false);
    expect(isContextOverflow("")).toBe(false);
  });
});
