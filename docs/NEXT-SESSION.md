# Seed: Nach-Smoke der QoL-Features + `gui-smoke-setup`

Stand: 2026-08-06, Ende einer langen Session. Der vorherige Seed (vier QoL-Bausteine)
ist **vollständig abgearbeitet** — siehe § Erledigt unten.

## Warum diese beiden Dinge zusammengehören

Der Tag hat zweimal gezeigt, dass die teuren Fehler die sind, **die kein Unit-Test sieht**:
der Gesamt-statt-Idle-Timeout und der Session-Killer durch leere Tool-Argumente waren beide
unsichtbar für ein grünes Gate — und beide lagen auch außerhalb der zehn Punkte der
händischen Smoke-Checkliste. Ein automatisierter GUI-Smoke ist damit kein Komfort mehr,
sondern die Lücke, durch die beides geschlüpft ist.

Deshalb: **erst den händischen Nach-Smoke** der vier neuen Features (~10 Min, Jays Hände),
**dann sofort `gui-smoke-setup`** — so werden die automatisierten Prüfpunkte aus dem
frischen Smoke abgeleitet statt aus dem Gedächtnis rekonstruiert.

## Schritt 1 — Nach-Smoke, was noch nie im laufenden Obsidian lief

Alle vier QoL-Features sind gebaut, getestet (108/108) und deployed (ProtoVault + Pallas),
aber **keines wurde je angeklickt**. Prüfpunkte:

- [ ] **Verbindungstest.** Einstellungen → Endpunkt-Zeile → „Testen" bei `127.0.0.1:1234`
      → „Verbunden". Dann URL auf `:9999` → „Verbindung abgelehnt". Dann auf
      `http://nichtda.invalid` → „Hostname unbekannt". (Danach zurückstellen.)
- [ ] **Modell-Dropdown.** „Modelle abrufen" → Auswahlliste statt Textfeld, der gespeicherte
      Name bleibt gewählt. Endpunkt abschalten → erneut abrufen → Feld ist gesperrt, Name
      bleibt sichtbar (nicht verschwunden).
- [ ] **Presets.** An der leeren Zeile am Ende: „LM Studio hinzufügen" legt eine Zeile an.
      An bestehenden Zeilen darf es diese Knöpfe NICHT geben.
- [ ] **Failover.** Zwei Zeilen: oben ein toter Endpunkt (`:9999`), darunter der echte.
      Eine Frage stellen → Antwort kommt trotzdem (der zweite gewinnt). Danach beide tot
      → Klartext „Kein Endpunkt erreichbar", kein Stacktrace.
- [ ] **Idle-Timeout (Regression).** Eine Frage, die eine lange Antwort erzwingt
      („schreib mir einen ausführlichen Pflanzplan mit zwölf Sorten"). Muss **vollständig**
      durchlaufen. Vorher starb so etwas nach 120 s mitten im Satz.
      Belegt: derselbe Fall braucht am Endpunkt real 310–512 s (Parcours, `big-argument`).
- [ ] **Wikilinks.** In einer Antwort mit `[[Links]]` einen anklicken → Notiz öffnet.

Nicht abgehakte Punkte sind Fixes VOR `gui-smoke-setup`.

## Schritt 2 — `gui-smoke-setup`

Skill in `.claude/skills/gui-smoke-setup/`. Vendored den CDP-Treiber, schreibt Prüfpunkte,
fährt die Gegenprobe. Referenz: `3d-codeblocks/scripts/gui-smoke.ts` (n=1),
`vault-rag/scripts/gui-smoke.ts` (n=2).

⚠️ **Fünf CDP-Fallstricke stehen in der REGISTRY** (Dach, Zeile „GUI-Smoke gegen ein
laufendes Obsidian fahren") — vor dem Schreiben lesen, sie kosten sonst je eine Schleife:
1. `Page.bringToFront` reicht auf macOS nicht; zusätzlich `osascript … activate`.
2. Ein Prüfpunkt, dessen Gegenstand fehlen kann, wird grün, wenn er die Abwesenheit nicht
   selbst als rot behandelt — er ist dann ausgerechnet im Defektfall grün.
3. `app.changeTheme` schreibt in `.obsidian/appearance.json` — Body-Klassen tauschen.
4. **Seit Obsidian 1.13 sind die Einstellungen ein eigenes Fenster** (`about:blank`), in dem
   **kein `app`-Objekt** existiert → zwei CDP-Verbindungen nötig. Ein Filter auf
   `app://obsidian.md` findet die Settings nie und meldet „keine Zeilen im DOM".
5. Nach einer Mutation auf die **Wirkung** warten, nicht auf eine Sekundenzahl.

## Danach (eigene Sessions)

- **`plugin-release-setup`** — `github`-Remote + Erst-Release. Account-/Auth-Schritte bleiben
  bei Jay. Offene TaskNote im Cockpit: „koda-agent hat keine release.yml".
- **Store-Einreichung** — Developer Dashboard auf `community.obsidian.md`, danach **Rescan
  manuell anstoßen** (läuft nicht von selbst an; Dach-`AGENTS.md`).
- **Stufe 2** — Markdown-Skill-System, Compaction, Aufräum-Assistent (Spec).
- **Modell-Matrix im Parcours** (`/Users/Shared/50_Testground/tool-calling-parcour`) — gehört
  der dortigen Session; braucht den Endpunkt **exklusiv**.

## Erledigt in dieser Session (2026-08-06)

- GUI-Smoke 10/10 grün (händisch, Handover-Note abgehakt).
- **Zwei Betriebsbefunde**, beide unsichtbar für Tests und Checkliste:
  `4c56f90` Idle- statt Gesamt-Timeout (+ Einstellung, Default 300 s) ·
  `479aeba` leere `tool_call`-Argumente vergifteten die ganze Sitzung (LM Studio → HTTP 500
  auf **jede** Folgeanfrage; am Endpunkt isoliert, Fix am Transport-Rand heilt laufende
  Sitzungen mit).
- `9a5cb33` Wikilinks in Antworten klickbar (MarkdownRenderer).
- **Alle vier QoL-Bausteine:** `b462854` Verbindungstest · `5693a8c` Modell-Auswahl ·
  `b02f15e` Failover · `8928238` Presets. Gate 108/108.
- REGISTRY im Dach (`4353f0c`): vier neue Einträge, zwei auf n=3 gehoben.
- Nebenprodukt: `/Users/Shared/50_Testground/tool-calling-parcour` (Messwerkzeug für
  Tool-Calling-Fähigkeit und Tempo lokaler Endpunkte).

## Zwei Dinge, die man wissen muss, bevor man Zahlen zitiert

1. **`docs/LAB.md` ist widerlegt.** Die Aussage „qwen3.6 ruft Tools zuverlässig" stammt aus
   **je einem Lauf** pro Fall. Dasselbe Modell lieferte am 2026-08-06 den abgeschnittenen
   Aufruf, der die Sitzung tötete. Der Parcours misst dasselbe mit Wiederholungen — dort
   steht qwen3.6-27b bei 8/8 Aufgaben, aber das ist eine andere Aussage als „zuverlässig".
2. **`textFallback: false` bleibt trotzdem richtig** — natives Tool-Calling funktioniert,
   der Ausfall war ein Abbruch, kein fehlendes Können. Nicht „vereinfachen".
