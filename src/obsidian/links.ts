import type { App } from "obsidian";
import type { ContentPort, LinkPort } from "../core/context/ports";

/** `metadataCache.resolvedLinks` ist Quelle → Ziel → Anzahl. Ausgehende Links sind damit
 *  ein Lookup, Backlinks eine Iteration ueber alle Quellen — dieselbe Gegenrichtung wie
 *  `backlinkCount` in `main.ts`. Bei ~1.200 Notizen ist das trivial (Spec E3); wer hier
 *  einmal einen Index baut, baut Retrieval, und das gehoert vault-rag.
 *
 *  UNAUFGELOESTE Links stehen in `resolvedLinks` nicht — sie fallen also von selbst weg,
 *  ohne dass der Kern etwas davon wissen muss. */
export function linkPort(app: App): LinkPort {
  return {
    outgoing: (path) => Object.keys(app.metadataCache.resolvedLinks[path] ?? {}),
    backlinks: (path) => {
      const alle = app.metadataCache.resolvedLinks;
      return Object.keys(alle).filter((quelle) => quelle !== path && (alle[quelle]?.[path] ?? 0) > 0);
    },
  };
}

/** `cachedRead`, nicht `read`: der Inhalt geht in einen Prompt, nicht in eine Schreib-
 *  operation — Obsidians Lesecache ist dafuer genau richtig und spart bei „Alle Tabs"
 *  ein Dutzend Dateizugriffe je Nachricht. */
export function contentPort(app: App): ContentPort {
  return {
    read: async (path) => {
      const file = app.vault.getFileByPath(path);
      if (file === null) return null;
      return await app.vault.cachedRead(file).catch(() => null);
    },
  };
}
