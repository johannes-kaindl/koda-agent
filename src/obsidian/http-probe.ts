/* requestUrl-Adapter für die Endpunkt-Probe.

   `requestUrl` statt fetch, weil Obsidians Renderer sonst an CORS scheitert (ein lokaler
   LLM-Server schickt keine Access-Control-Header für app://obsidian.md).
   `throw: false` ist der Punkt: sonst wirft requestUrl bei 4xx/5xx, der echte Status geht
   verloren und ein fehlender Schlüssel (401) sieht aus wie ein falscher Dienst. */
import { requestUrl } from "obsidian";
import type { HttpProbe } from "../core/llm/probe";

export const requestUrlProbe: HttpProbe = {
  async getJson(url, headers) {
    const res = await requestUrl({ url, method: "GET", headers, throw: false });
    let json: unknown = null;
    try {
      json = res.json;
    } catch {
      json = null; // kein JSON-Body — classifyEndpointStatus liest das als "kein LLM-API"
    }
    return { status: res.status, json };
  },
  async postJson(url, body, headers) {
    const res = await requestUrl({ url, method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body), throw: false });
    let json: unknown = null;
    try {
      json = res.json;
    } catch {
      json = null;
    }
    return { status: res.status, json };
  },
};
