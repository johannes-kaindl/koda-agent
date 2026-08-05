# koda-lab Befunde

## 2026-08-05 · http://127.0.0.1:1234 (LM Studio)

| Modell | Suche | Lesen | Kein Tool | Konsequenz |
|---|---|---|---|---|
| qwen/qwen3.6-27b | OK nativ (args valide) · 24.9s · finish=tool_calls | OK nativ (args valide) · 13.4s · finish=tool_calls | OK (direkt geantwortet) · 3.5s · finish=stop | Natives Tool-Calling zuverlässig über alle drei Fälle — kein Fallback nötig. |
| google/gemma-4-26b-a4b-qat | OK nativ (args valide) · 73.6s · finish=tool_calls | OK nativ (args valide) · 4.1s · finish=tool_calls | OK (direkt geantwortet) · 1.6s · finish=stop | Natives Tool-Calling ebenfalls zuverlässig; JIT-Ladezeit macht den ersten Suche-Call langsam (73.6s), aber der Verdict selbst ist sauber. |

Gemessen mit `npm run lab:tools -- --model <id>` (jeweils Einzel-Lauf, um LM-Studio-JIT-Loads pro Modell kontrolliert zu halten). Ollama (`:11434`) hatte zum Messzeitpunkt nur ein Embedding-Modell (`nomic-embed-text-v1.5`) geladen — nicht tool-fähig, daher nicht gemessen.

### Entscheidung

Beide gemessenen Modelle liefern natives Tool-Calling **zuverlässig** über alle drei Testfälle (Suche, Lesen, Kein-Tool-Fall ohne falsch-positiven Aufruf). Nach der Entscheidungsregel aus dem Plan (native zuverlässig → `textFallback` bleibt `false`) bleibt der Default in Task 9 also:

**`textFallback: false`** (Default). Der Text-Fallback-Parser (`parseTextToolCall`, Task 4) bleibt als Loop-Option erhalten, wird aber für die getesteten Zielmodelle nicht gebraucht — nützlich bleibt er für schwächere/andere lokale Modelle, die kein natives Tool-Calling unterstützen.
