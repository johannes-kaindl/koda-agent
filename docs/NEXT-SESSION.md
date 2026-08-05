# Seed: QoL-Ausbau (nächste Session)

**Entschieden von Jay 2026-08-06, 00:40** — alle vier QoL-Bausteine, die in den
Nachbar-Plugins üblich sind. Vorgehen wie beim MVP: kurze Design-Runde (die
Muster sind etabliert, Brainstorming kann knapp sein), dann Plan, dann
Subagent-Execution. Kit-first: **übernehmen, nicht neu bauen.**

## Die vier Features (mit Registry-Ankern)

1. **Verbindungstest pro Endpoint-Zeile** — Test-Button + Klartext-Status.
   Kit: `endpoint_diagnostics` (`ENDPOINT_PRESETS`/`validateEndpointInput`/
   Status-Typen; via `tools/sync-kit.sh` nachvendoren — Exportnamen vor
   Implementierung am Kit-Quelltext verifizieren, Stand ../obsidian-kit @0.23.0).
   UI-Vorlage (n=3, guter Schnitt): `../vault-crews/src/obsidian/settings.ts`
   `buildListEditor` + pure `endpoint-editor-model.ts`; ⚠️ Gotcha
   „i18n-Statuskeys statt Klartext-Feld" (Registry, n=2).
2. **Modell-Dropdown mit ehrlichem Offline-Verhalten** — `/v1/models` parsen:
   `../vim-dojo/src/llm/modelList.ts` (`extractModelIds`, pure/TDD);
   Offline-Verhalten: `../vault-rag/src/model_choice.ts` (`resolveModelChoice`);
   ⚠️ Gotcha „Dropdown-Default MUSS persistiert werden" (Registry).
3. **Endpoint-Failover** — „erster erreichbarer gewinnt" zur Laufzeit:
   Kit `resolveActiveEndpointConfig` (bereits vendored!) + Orchestrierung
   (Session-Cache, Re-Resolve, 1 Retry) nach `../vim-dojo/src/llm/endpointResolver.ts`
   (`EndpointResolver`). Danach `settings.endpoints.desc` in beiden Sprachen
   wieder auf das Failover-Versprechen anheben (wurde im MVP bewusst
   auf „erster Eintrag" abgesenkt — Commit `00974fc`).
4. **Endpoint-Presets** — LM-Studio-/Ollama-Schnellauswahl beim Anlegen einer
   Zeile (`ENDPOint_PRESETS` aus demselben Kit-Modul wie Punkt 1).

## Offene Design-Punkte für die kurze Design-Runde

- Transport der Probe: `requestUrl` (obsidian, CORS-frei) vs. XHR — Nachbarn prüfen.
- Wo lebt der Failover-Cache: Plugin-Feld vs. eigener `EndpointResolver`-Port
  (vim-dojo-Schnitt bevorzugt, testbar).
- Modell-Dropdown auch je Endpunkt-Zeile (model-Override) oder nur global?
  (vault-rag hat beides; MVP-QoL: global reicht vermutlich, Jay fragen.)

## Kontext-Stand beim Seeden

- MVP komplett auf `main` (`ce6f096`), Gate grün 79/79, deployed in
  ProtoVault + Pallas (noch nicht aktiviert), GUI-Smoke offen →
  Handover-Note im Pallas-Cockpit `25_Coding/koda-agent/Handover.md`.
- Ebenfalls offen (eigene Sessions, nicht Teil des QoL-Ausbaus):
  REGISTRY-Einträge im Dach, `gui-smoke-setup`, `plugin-release-setup`.
- Deferred-Minor-Liste aus den Reviews: siehe Commit-Historie der Fix-Commits
  (`5f2b05a`, `2ab5790`) und Plan-Selbstreview; nichts davon blockiert QoL.
