import type { App } from "obsidian";
import type { ChatMessage } from "../core/agent/types";
import { binaryToDataUrl, imageExtension } from "../core/tools/images";

/** Loest die Bild-PFADE der Nachrichten in Data-URLs auf — erst hier, am Transport-Rand,
 *  entsteht Base64; die Sitzung (JSONL) traegt nur Pfade. Gestubbte Nachrichten tragen kein
 *  `images` mehr (die Projektion hat es gestrichen), sie kommen hier also nicht vor.
 *
 *  Ein Bild, das sich nicht lesen laesst (Datei geloescht, ueber der Grenze), fehlt in der
 *  Map — `toWireMessages` schickt dann den Text allein, statt die Anfrage zu vergiften. Der
 *  Cache haelt die kodierte URL je Datei-Stand (mtime + Groesse) ueber die Runden eines
 *  Laufs: derselbe 4-MB-Scan wird nicht pro Runde neu gelesen und neu kodiert. */
export function createImageUrlResolver(app: App, maxKb: () => number): (messages: ChatMessage[]) => Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  return async (messages) => {
    const urls = new Map<string, string>();
    const limit = maxKb() * 1024;
    for (const m of messages) {
      for (const img of m.images ?? []) {
        if (urls.has(img.path)) continue;
        try {
          const file = app.vault.getFileByPath(img.path);
          if (file === null || file.stat.size > limit) continue;
          const key = `${img.path}|${file.stat.mtime}|${file.stat.size}`;
          let url = cache.get(key);
          if (url === undefined) {
            url = binaryToDataUrl(await app.vault.readBinary(file), imageExtension(img.path));
            cache.set(key, url);
          }
          urls.set(img.path, url);
        } catch {
          // nicht lesbar -> fehlt in der Map, die Nachricht geht als Text
        }
      }
    }
    return urls;
  };
}
