# Koda

Koda ist ein agentischer Begleiter für deinen Obsidian-Vault — eine Chat-Seitenleiste,
die deine Notizen durchsuchen, lesen und neue schreiben kann, immer mit einer klaren
Regel dafür, wann sie vorher deine Zustimmung braucht. Sie läuft ausschließlich gegen
einen OpenAI-kompatiblen LLM-Endpunkt, den du konfigurierst (ein lokaler Server wie
[LM Studio](https://lmstudio.ai), oder ein gehosteter Anbieter, wenn du einen
API-Schlüssel hinterlegst), und führt ihr Gedächtnis in einer schlichten
Markdown-Notiz, die du selbst lesen und bearbeiten kannst.

*Stand: 0.4.0 — im Obsidian-Community-Store gelistet, keine signierten Builds.
Aktueller Umfang und Entwurfsentscheidungen stehen in `CLAUDE.md`.*

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/gitea/v/release/jkaindl/koda-agent?gitea_url=https%3A%2F%2Fgit.jkaindl.de&label=release)](https://git.jkaindl.de/jkaindl/koda-agent/releases)
[![Obsidian](https://img.shields.io/badge/obsidian-1.8.7%2B-purple)](https://obsidian.md)

> **Hinweis:** Diese Übersetzung folgt der englischen [`README.md`](README.md).
> Bei Abweichungen gilt die englische Fassung.

## Features

- **Chat-Seitenleiste** (Ribbon-Icon + Befehl) mit gestreamten Antworten, einem
  einklappbaren „Denken"-Block für Reasoning-Modelle und einer Stopp-Schaltfläche, die
  die Teilantwort stehen lässt.
- **Fünf Werkzeuge:** `search_notes`, `read_note`, `write_note`, `save_memory`,
  `write_skill` — das Modell ruft sie beim Antworten selbst auf, jeder Schritt erscheint
  im Chat. Ein sechstes, `related_notes`, kommt hinzu, wenn semantische Suche verfügbar
  ist (siehe unten).
- **Semantische Suche, falls du sie schon hast** *(optional)* — ist das Plugin
  [Vault Retrieval](https://github.com/johannes-kaindl/vault-rag) installiert und dein
  Vault indiziert, nutzt Koda dessen Embedding-Index: `search_notes` ergänzt
  bedeutungsbasierte Treffer, wenn die wörtliche Suche dünn ausfällt (weniger als drei
  Treffer), und ein Werkzeug `related_notes` beantwortet „was gibt es noch dazu?" direkt
  aus dem Index — offline, ohne Endpunkt. Wörtliche und semantische Treffer erscheinen
  als **getrennte, beschriftete Blöcke**, nie zu einer Rangliste vermischt: ein
  wörtlicher Treffer beweist, dass eine Formulierung existiert, ein semantischer nicht.
  Ohne dieses Plugin verhält sich Koda exakt wie vorher — nichts zu konfigurieren, und
  kein totes Werkzeug im Prompt.
- **Ein dauerhaftes, einsehbares Gedächtnis** — `save_memory` hängt datierte Zeilen an
  `<Koda-Ordner>/Memory.md` an, das bei jeder Frage wieder in den System-Prompt
  einfließt. Nichts wird irgendwo abgelegt, wo du es nicht öffnen und ändern kannst.
- **Sitzungen bleiben erhalten** — der Chatverlauf wird als JSONL-Log im Plugin-Ordner
  geschrieben und beim Neustart von Obsidian wiederhergestellt. „Neuer Chat" beginnt ein
  frisches Log.
- **Einstellungen:** ein oder mehrere Endpunkte (URL, optionaler API-Schlüssel,
  optionale Modell-Übersteuerung je Endpunkt — Reihenfolge bestimmt, welcher genutzt
  wird), globale Modell-ID, maximale Werkzeugrunden pro Frage, Schalter zum Ausblenden
  des Denkens, Text-Fallback für Modelle ohne natives Tool-Calling, Sprache der
  Oberfläche und ein optionales „beim Start öffnen" (standardmäßig aus).

## Voraussetzungen

- **Obsidian 1.8.7** oder neuer. Desktop und Mobil — Koda ist nicht desktop-only.
- **Ein OpenAI-kompatibler Chat-Endpunkt** mit einem **tool-calling-fähigen Modell**.
  Das kann ein lokaler Server sein ([LM Studio](https://lmstudio.ai), Ollama, …) oder
  ein gehosteter Anbieter, wenn du einen API-Schlüssel hinterlegst. Modelle ohne natives
  Tool-Calling lassen sich über den Text-Fallback nutzen, weniger zuverlässig.
- *Optional:* das Plugin
  [Vault Retrieval](https://github.com/johannes-kaindl/vault-rag) mit indiziertem Vault,
  das semantische Suche und das Werkzeug `related_notes` beisteuert. Koda funktioniert
  vollständig ohne es.

## Installation

Koda liegt im Obsidian-Community-Store: **Einstellungen → Community-Plugins →
Durchsuchen → „Koda" → Installieren → Aktivieren**. Alternativ `main.js`,
`manifest.json` und `styles.css` aus einem
[Release](https://github.com/johannes-kaindl/koda-agent/releases) nach
`<vault>/.obsidian/plugins/koda-agent/` legen.

## Verwendung

1. Die Seitenleiste öffnen — Ribbon-Icon (Hund) oder Befehl **Koda öffnen**.
2. Eine Frage stellen. Koda streamt die Antwort; bei Reasoning-Modellen sitzt der
   „Denken"-Block eingeklappt darüber, und **Stopp** beendet den Stream, ohne das
   Angekommene zu verwerfen.
3. **Den Werkzeugen zusehen.** Jeder Aufruf von `search_notes` / `read_note` /
   `write_note` erscheint im Chat, während er passiert — du siehst also, auf welchen
   Notizen eine Antwort beruht, statt es glauben zu müssen.
4. **Schreibvorgänge außerhalb des Koda-Ordners bestätigen.** Ein Dialog zeigt vorher
   den neuen Text (Anlegen und Anhängen) oder ein Zeilen-Diff (Ersetzen) — siehe
   [Die Schreibregel](#die-schreibregel).
5. **Neuer Chat** beginnt ein frisches Sitzungs-Log. Alte Sitzungen werden nach einem
   Obsidian-Neustart wiederhergestellt; es sind einfache JSONL-Dateien im Plugin-Ordner.

Bittest du Koda, sich etwas zu merken, hängt es eine datierte Zeile an
`<Koda-Ordner>/Memory.md` an — eine gewöhnliche Notiz, die du öffnen, ändern oder
löschen kannst.

## Konfiguration

Ersteinrichtung:

1. Einen OpenAI-kompatiblen LLM-Server mit einem tool-calling-fähigen Modell starten
   (z.B. LM Studio, standardmäßig auf `http://127.0.0.1:1234`).
2. In Obsidian Koda aktivieren und **Einstellungen → Koda** öffnen.
3. Die Endpunkt-URL eintragen (und den API-Schlüssel, falls nötig). Das Feld **Modell**
   auf die Modell-ID setzen, die der Server meldet — außer die Endpunkt-Zeile trägt
   bereits eine eigene Übersteuerung.
4. Optional den **Koda-Ordner** ändern (Standard `Koda`) — dort liegen Gedächtnis und
   freie Schreibvorgänge.
5. Die Seitenleiste über das Hunde-Icon im Ribbon oder den Befehl **Koda öffnen**
   aufrufen und eine Frage stellen.

Die vollständige Liste der Einstellungen:

| Einstellung | Standard | Bedeutung |
|---|---|---|
| Endpunkte | `http://127.0.0.1:1234` | URL, optionaler API-Schlüssel, optionale Modell-Übersteuerung je Zeile. Eine Prioritätsliste — siehe [Endpunkte](#endpunkte) |
| Modell | *(leer)* | Modell-ID, die an den Endpunkt geht, sofern die Zeile sie nicht übersteuert |
| Koda-Ordner | `Koda` | Wo Gedächtnis, Skills und freie Schreibvorgänge liegen |
| Maximale Werkzeugrunden | 8 (1–50) | Wie viele Werkzeugaufrufe Koda je Frage verketten darf, bevor es antworten muss |
| Zeitlimit je Anfrage | 300 s (30–900) | Hartes Limit pro Modellaufruf |
| Skill-Budget | 6000 Zeichen (1000–100000) | Wie viel Skill-Text in den System-Prompt passt |
| Denken ausblenden | an | Blendet den Reasoning-Block standardmäßig aus |
| Text-Fallback für Tool-Calls | aus | Für Modelle ohne natives Tool-Calling |
| Sprache der Oberfläche | automatisch | Folgt Obsidian, oder fest Deutsch/Englisch |
| Beim Start öffnen | aus | Opt-in; die Seitenleiste bleibt zu, bis du sie holst |

## Funktionsweise

Eine Frage startet eine **Agenten-Schleife**: Koda schickt deine Nachricht plus einen
System-Prompt an den Endpunkt, und das Modell antwortet entweder direkt oder ruft eines
seiner Werkzeuge auf. Ein Werkzeugaufruf wird gegen den Vault ausgeführt, sein Ergebnis
wandert zurück ins Gespräch, und das Modell ist wieder dran — bis zu **Maximale
Werkzeugrunden**, danach muss es mit dem antworten, was es hat. Genau das hindert ein
festgefahrenes Modell daran, endlos auf deinem Vault zu kreisen.

Der System-Prompt wird für jede Frage frisch aus drei Quellen zusammengesetzt: Kodas
eigene Anweisungen, der Inhalt von `Memory.md` und die aktiven Skills, die ins
Skill-Budget passen. Alle drei sind schlichtes Markdown in deinem Vault — was Koda
steuert, ist also lesbar und änderbar; es gibt keinen verborgenen Zustand.

Schreibvorgänge laufen nie einfach durch. `write_note` wird zuerst gegen den Koda-Ordner
geprüft; alles außerhalb geht durch den Bestätigungsdialog, und eine Ablehnung wird dem
Modell als abgelehnter Schreibvorgang zurückgemeldet statt stillschweigend geschluckt.

Die Suche fällt weich zurück statt zu brechen: Koda schlägt die Plugin-API von Vault
Retrieval zur Laufzeit defensiv nach. Ist sie da, füllt `search_notes` dünne wörtliche
Ergebnisse mit semantischen auf (in einem eigenen, beschrifteten Block) und
`related_notes` wird als sechstes Werkzeug registriert; ist sie nicht da, taucht beides
im Prompt gar nicht erst auf.

## Die Schreibregel

Koda schreibt frei innerhalb des **Koda-Ordners**, den du in den Einstellungen festlegst
(Standard: `Koda`) — dort liegen sein Gedächtnis und seine Entwürfe. Jeder
Schreibvorgang **außerhalb** dieses Ordners öffnet zuerst einen Bestätigungsdialog: eine
Vorschau des neuen Textes bei Anlegen/Anhängen, ein Zeilen-Diff beim Ersetzen. Lehnst du
ab, wird Koda mitgeteilt, dass der Schreibvorgang abgelehnt wurde (die Datei bleibt
unberührt); bestätigst du, geht er durch. Einen anderen Weg, eine Notiz außerhalb seines
eigenen Ordners anzufassen, hat Koda nicht.

## Endpunkte

Die Endpunktliste in den Einstellungen ist eine Prioritätsliste, keine Ausfallkette:
**der erste Eintrag ist immer der genutzte.** Sortiere die Liste um (Schaltfläche „nach
oben" in jeder Zeile), um zu wechseln, mit welchem Server Koda spricht — ein
automatisches Ausweichen auf den nächsten Eintrag gibt es im MVP nicht.

## Skills

Ein Skill ist eine Markdown-Notiz in `<Koda-Ordner>/Skills/`, die Kodas Verhalten
steuert. Du schreibst sie selbst — oder lässt Koda sie schreiben, was immer eine
Bestätigung verlangt.

```markdown
---
description: Antworte immer mit einem Ausrufezeichen am Ende
enabled: true
---

Hänge an jede Antwort ein „!" an.
```

- Der **Name ist der Dateiname** ohne `.md`.
- `description` ist Pflicht — sie erklärt in einem Satz, was sich ändert, und ist das,
  was du im Bestätigungsdialog siehst.
- `enabled: false` schaltet einen Skill ab, ohne ihn zu löschen.
- Unterordner werden nicht gelesen.

Zu Beginn eines Gesprächs wandern alle aktiven Skills in Kodas System-Prompt. Wie viel
Text dort höchstens Platz hat, steuert **Skill-Budget** in den Einstellungen (Standard
6000 Zeichen); was nicht mehr hineinpasst, erscheint nur mit seiner Beschreibung — Koda
weiß dann, dass es den Skill gibt, kann ihm aber nicht folgen. Welche Skills gerade
wirken, steht oben im Gespräch.

**Skills verlangen immer eine Bestätigung**, auch innerhalb des Koda-Ordners, wo Koda
sonst frei schreiben darf. Der Grund: ein Skill ist kein Entwurf — er ändert, was Koda
künftig tut.

## Entwicklung

```bash
npm install
npm run gate       # lint + typecheck + typecheck:scripts + test + check:pure + build
npm run dev        # esbuild watch build
npm test           # vitest + no-abs-paths-Prüfung
npm run lab:tools  # skriptgesteuerte Tool-Calling-Sonde gegen einen laufenden Endpunkt (siehe docs/LAB.md)
```

### Struktur

- `src/core/` — pure Logik: Agenten-Schleife, Werkzeug-Policy, Gedächtnis, Sitzungen,
  Diff, Zusammenführung der Suchergebnisse (keine Obsidian-Importe; erzwungen von
  `check:pure`).
- `src/llm/` — `KodaChatClient` + `XhrSseTransport` (streamender Chat-Client).
- `src/obsidian/` — View, Werkzeug-Adapter zum Vault, Bestätigungsdialog,
  Einstellungs-Tab und das defensive Nachschlagen der Plugin-API von Vault Retrieval.
- `src/vendor/kit` + `src/vendor/kit-obsidian/` — eine wortgleiche Momentaufnahme von
  `../obsidian-kit` (Endpunkt-Konfiguration, i18n, Reasoning-/Think-Splitter,
  Bestätigungsdialog, Ordner-Vorschlag, …), erneuert über `tools/sync-kit.sh`. Diese
  Dateien nie von Hand ändern.
- `src/i18n/` — DE-/EN-Strings der Oberfläche.
- `scripts/koda-lab.ts` — die Tool-Calling-Sonde hinter `npm run lab:tools`; Befunde
  stehen in [`docs/LAB.md`](docs/LAB.md).

Die manuelle GUI-Smoke-Checkliste vor jedem Release steht in
[`docs/SMOKE.md`](docs/SMOKE.md).

## Grenzen (bewusst, noch nicht, oder nie)

- Kein Terminal-/Vollsystem-Zugriff — dauerhaft außerhalb des Umfangs (Store-Richtlinie
  + Sicherheit).
- Noch keine Verdichtungs- oder Synthese-Abläufe — für spätere Stufen geplant, siehe
  `CLAUDE.md`.
- Kein Heartbeat, keine geplante Hintergrundarbeit — Koda handelt nur, wenn du es
  bittest.

## Lizenz

[AGPL-3.0-or-later](LICENSE) — © 2026 Jay.
