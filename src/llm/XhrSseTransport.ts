/* ==========================================================
   XHR-basierter SSE-Transport — die EINZIGE browser-nahe Datei
   unter src/llm/.

   Obsidians requestUrl kann nicht streamen, und fetch liefert in der
   Desktop-Runtime keinen verlässlichen Teil-Stream (PROF-OBS-12).
   Bewusst dünn: keine Logik hier, alles Interpretierende gehört in
   KuroChatClient — deshalb ist diese Datei auch nicht unit-getestet
   (kein XHR unter jests testEnvironment: node).
   ========================================================== */
import type { SseTransport } from './KodaChatClient';

export class XhrSseTransport implements SseTransport {
  postStream(
    url: string,
    body: unknown,
    headers: Record<string, string>,
    onChunk: (raw: string) => void,
    signal: AbortSignal,
  ): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let seen = 0;

      const pump = (): void => {
        const text = xhr.responseText;
        if (text.length > seen) {
          onChunk(text.slice(seen));
          seen = text.length;
        }
      };

      const abort = (): void => {
        xhr.abort();
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      };

      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);

      signal.addEventListener('abort', abort, { once: true });

      xhr.onprogress = pump;
      xhr.onload = (): void => {
        signal.removeEventListener('abort', abort);
        pump();
        resolve(xhr.status);
      };
      xhr.onerror = (): void => {
        signal.removeEventListener('abort', abort);
        reject(new Error('network error'));
      };

      xhr.send(JSON.stringify(body));
    });
  }
}
