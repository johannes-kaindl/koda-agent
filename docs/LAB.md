# koda-lab Befunde

## 2026-08-05 · http://127.0.0.1:1234 (LM Studio)

| Modell | Suche | Lesen | Kein Tool | Konsequenz |
|---|---|---|---|---|
| qwen/qwen3.6-27b | OK nativ (args valide) · 24.9s · finish=tool_calls | OK nativ (args valide) · 13.4s · finish=tool_calls | OK (direkt geantwortet) · 3.5s · finish=stop | Natives Tool-Calling zuverlässig über alle drei Fälle — kein Fallback nötig. |
| google/gemma-4-26b-a4b-qat | OK nativ (args valide) · 73.6s · finish=tool_calls | OK nativ (args valide) · 4.1s · finish=tool_calls | OK (direkt geantwortet) · 1.6s · finish=stop | Natives Tool-Calling ebenfalls zuverlässig; JIT-Ladezeit macht den ersten Suche-Call langsam (73.6s), aber der Verdict selbst ist sauber. |

Gemessen mit `npm run lab:tools -- --model <id>` (jeweils Einzel-Lauf, um LM-Studio-JIT-Loads pro Modell kontrolliert zu halten). Ollama (`:11434`) hatte zum Messzeitpunkt nur ein Embedding-Modell (`nomic-embed-text-v1.5`) geladen — nicht tool-fähig, daher nicht gemessen.

### Scope

Gemessen wurden 2 von 7 unter `http://127.0.0.1:1234/v1/models` verfügbaren Nicht-Embedding-Modellen (`qwen/qwen3.6-27b`, `google/gemma-4-26b-a4b-qat`) — eine bewusste Reduktion gegenüber dem im Plan vorgesehenen vollen `npm run lab:tools`-Sweep über alle Modelle. Grund: LM Studio lädt jedes Modell JIT beim ersten Request nach, was bei 27–31B-Modellen mehrere Minuten pro Modell kostet; ein voller Sweep über alle 7 wäre unverhältnismäßig teuer für den Befund gewesen. Der `textFallback`-Default (siehe Entscheidung unten) stützt sich ausschließlich auf diese zwei Modelle. Nicht gemessen: `google/gemma-4-31b`, `google/gemma-4-31b-qat`, `qwen/qwen3.6-35b-a3b`, `google/gemma-4-e4b`, `google/gemma-4-e2b` — können bei Bedarf (z. B. wenn ein schwächeres Modell in der Praxis auffällig wird) einzeln mit `npm run lab:tools -- --model <id>` nachgemessen werden.

### Entscheidung

Beide gemessenen Modelle liefern natives Tool-Calling **zuverlässig** über alle drei Testfälle (Suche, Lesen, Kein-Tool-Fall ohne falsch-positiven Aufruf). Nach der Entscheidungsregel aus dem Plan (native zuverlässig → `textFallback` bleibt `false`) bleibt der Default in Task 9 also:

**`textFallback: false`** (Default). Der Text-Fallback-Parser (`parseTextToolCall`, Task 4) bleibt als Loop-Option erhalten, wird aber für die getesteten Zielmodelle nicht gebraucht — nützlich bleibt er für schwächere/andere lokale Modelle, die kein natives Tool-Calling unterstützen.

## 2026-08-18 · Alternierung (zwei user hintereinander)

`renderMerged` in `src/core/agent/compaction/project.ts` fasst frühere Nutzer-Nachrichten
zu einer einzigen `user`-Nachricht zusammen — bisher aus der HF-Template-Annahme heraus,
Gemma-Chat-Templates lehnten zwei aufeinanderfolgende `user`-Rollen ab („roles must
alternate"). Gemessen wurde das jetzt gegen das laufende LM Studio (`127.0.0.1:1234`) mit
`npm run lab:tools -- --alternation`: je Modell eine toolfreie Anfrage
`[user("Merke dir: A"), user("Was habe ich dir gesagt?")]` über `client.complete`.

| Modell | Ergebnis |
|---|---|
| qwen/qwen3.8-27b | OK — zwei user hintereinander akzeptiert |
| qwen2.5-coder-7b | OK — zwei user hintereinander akzeptiert |
| google/gemma-4-31b | OK — zwei user hintereinander akzeptiert |
| google/gemma-4-26b-a4b-qat | OK — zwei user hintereinander akzeptiert |
| qwen/qwen3.6-35b-a3b | OK — zwei user hintereinander akzeptiert |
| qwen/qwen3.6-27b | OK — zwei user hintereinander akzeptiert |
| google/gemma-4-e4b | OK — zwei user hintereinander akzeptiert |
| google/gemma-4-e2b | OK — zwei user hintereinander akzeptiert |

Alle 8 unter `http://127.0.0.1:1234/v1/models` gelisteten Nicht-Embedding-Modelle
gemessen (4× Gemma, 4× Qwen) — kein einziges 4xx, kein „roles must alternate" oder
Ähnliches. Die HF-Template-Annahme bestätigt sich gegen LM Studio also **nicht**: entweder
normalisiert LM Studios Serving-Schicht die Rollenfolge vor dem Template, oder die hier
geladenen Gemma-Varianten sind toleranter als die zitierte HF-Quelle. Für `renderMerged`
folgt daraus: die Begründung bleibt **vorsorglich**, nicht gemessen bestätigt — das
Zusammenfassen schadet aber nicht (ein `user`-Block ist für jedes Template gültig) und
bleibt deshalb unverändert bestehen.

Gemessen mit `npm run lab:tools -- --alternation` (ein Lauf über alle Modelle; JIT-Ladezeit
pro Modell führte zu keinem Timeout).
