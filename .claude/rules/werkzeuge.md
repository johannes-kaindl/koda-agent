---
paths:
  - "src/core/tools/**"
  - "src/obsidian/vault-tools.ts"
  - "src/obsidian/confirm-write.ts"
  - "src/core/agent/**"
---

# Werkzeuge, Schreibregel und Agent-Loop — Gotchas

Gotchas zu den Werkzeugen und zu allem, was vor dem Schreiben passiert. Das Warum: `docs/internal/decisions.md` § Schreiben und § Retrieval und Werkzeuge anderer Plugins.

- **Der Runner routet nach der Route, nicht nach dem Namen.** `toolSet()` (`src/core/tools/defs.ts`) ist die eine Menge für Draht und Route; ein montiertes Werkzeug eines Anbieters geht an den Anbieter, auch wenn sein Name einem Wirts-Namen gleicht. `related_notes` gehört vault-rag und steht nicht in `HOST_TOOL_NAMES`.
- **Jeder Schreibpfad läuft durch `writePolicy` und den Byte-Token-Guard vor dem Bestätigen** (jeder Schreibpfad mit Inhalt; `delete_note` fragt immer). Die Grenze für `Skills/` und `Arbeiten/` sitzt in der Policy, nicht in `write_skill`, sonst ist sie über `write_note` zu umgehen. Die Freizone liest den Pfad textlich, die geschützten Unterordner mit `reading: "filesystem"`. `tests/write_policy.test.ts` deckt die Lesarten ab (`Skills `, `Skills.`, `Skills:x`, langes s). Ein dritter, optionaler Parameter `mode` macht `replace` auf `<Koda>/Memory.md` zur Rückfrage (`write_note` und `edit_active_note` mit `replace_selection` reichen ihn durch; `append`, `create`, `insert_at_cursor` und `save_memory` bleiben frei); `movePolicy` und `generateImage` rufen ohne Modus und ändern sich nicht. Der Dateiname steht in `MEMORY_FILE`.
- **Die Vorschau im Bestätigungs-Dialog ist der geschriebene Inhalt** (Invariante „Vorschau == geschriebener Inhalt“); `edit_active_note` verlangt, dass der Pfad zur aktiven Notiz passt.
- **Ergebnisse, die unvollständig aussehen können, sagen es in Zeile 1** (`list_notes`: Kappung, nicht mitgelistete Unterordner, `.base`/`.canvas` auf eigener Zeile). Ein „leer“ und ein „fehlt“ sind verschiedene Aussagen.
- **Die Segmentzählung in `list.ts` (`collectSubfolders`) und `tree.ts` (`collectFolderTree`) kommt aus `countInFolders` (code-kit 0.36.0), ein Durchlauf über die Pfade statt einer je Ordner.** Ganze Segmente, Groß/klein unterschieden (kein `ignoreCase`), der Ordner zählt sich nicht selbst; ein Pfad mit `..` oder NUL zählt in keinem Ordner. Die Zählung nie auf `startsWith` zurückdrehen: `tests/list_count_scope.test.ts` hält sie gegen die alte Zählung und fällt an `..`.
