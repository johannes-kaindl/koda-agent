# Koda

> 🇩🇪 Deutsch · [🇬🇧 English](https://github.com/johannes-kaindl/koda-agent/blob/main/README.md)

**Ein Begleiter in deinem Obsidian-Vault: eine Chat-Seitenleiste, die deine Notizen durchsucht, liest und schreibt, und fragt, bevor sie etwas von dir anfasst.**

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://github.com/johannes-kaindl/koda-agent/blob/main/LICENSE)
[![Release](https://img.shields.io/github/v/release/johannes-kaindl/koda-agent)](https://github.com/johannes-kaindl/koda-agent/releases/latest)
![Obsidian](https://img.shields.io/badge/obsidian-1.8.7%2B%20%C2%B7%20desktop%20%26%20mobile-7c3aed)

Koda arbeitet mit einem OpenAI-kompatiblen Modell deiner Wahl, typischerweise einem auf deinem eigenen Rechner ([LM Studio](https://lmstudio.ai), Ollama) — deine Notizen müssen ihn dann nicht verlassen. Alles, was Koda steuert — seine Anweisung, sein Gedächtnis, seine Skills —, ist eine Markdown-Notiz, die du lesen und ändern kannst.

## Features

- **Mit dem Vault sprechen.** Koda schlägt selbst nach: Volltextsuche, Notizen lesen (auch Bases- und Canvas-Dateien), Ordner auflisten, mit Frontmatter oder als Ordnerbaum. Jeder Werkzeugaufruf erscheint im Chat, du siehst also, auf welchen Notizen eine Antwort beruht.
- **Schreibt mit deiner Zustimmung.** Frei schreibt Koda nur in seinem eigenen Ordner. Alles andere — schreiben, verschieben, die gerade offene Notiz bearbeiten — öffnet zuerst einen Dialog mit dem Text oder einem Zeilen-Diff. Löschen und Skills schreiben fragen immer.
- **Arbeitskontext.** Jede Frage kann mitnehmen, was du gerade vor dir hast: Zeiger auf die offene Notiz und die Markierung, oder ganze Notizen samt verlinkter Nachbarn, alle offenen Tabs oder die Notizen, die inhaltlich zu deiner Frage passen. Der Tab **Kontext** zeigt, was mitgeht, und du kannst jedes Stück herausnehmen.
- **Gedächtnis und Skills als Notizen.** *„Merk dir, dass …"* hängt eine datierte Zeile an `Koda/Memory.md`. Skills sind Markdown-Notizen mit dauerhaften Anweisungen; Koda kann sie für dich schreiben, mit Bestätigung.
- **Lange Gespräche.** Bevor ein Gespräch das Modell überläuft, verdichtet Koda es: erst alte Werkzeug-Ergebnisse, dann eine Zusammenfassung älterer Antworten. Was du im Chat siehst und deine eigenen Nachrichten bleiben unangetastet.
- **Einstellbar für kleine Modelle.** Anweisung ersetzen, einzelne Werkzeuge abschalten und die genaue Anweisung ansehen, die das Modell bekommt.
- **Arbeitet mit Nachbarn, braucht keine.** Mit [Vault Retrieval](https://github.com/johannes-kaindl/vault-rag) sucht Koda zusätzlich nach Bedeutung; andere Plugins können Koda ihre Werkzeuge leihen. Ohne sie fehlt nichts.

## Voraussetzungen

- **Obsidian 1.8.7** oder neuer, Desktop oder Mobil.
- **Ein OpenAI-kompatibler Chat-Endpunkt mit einem Modell, das Werkzeuge aufrufen kann**: ein lokaler Server (LM Studio, Ollama, …) oder ein gehosteter Anbieter mit API-Schlüssel. Modelle ohne natives Tool-Calling gehen über einen Text-Fallback, weniger zuverlässig.
- **Ein lokaler Server braucht eingeschaltetes CORS** (LM Studio: *Enable CORS* oder `lms server start --cors`; Ollama: `OLLAMA_ORIGINS`). Der Verbindungstest geht auch ohne, der Chat nicht; Koda benennt diesen Fall, wenn er eintritt.
- *Optional:* [Vault Retrieval](https://github.com/johannes-kaindl/vault-rag) mit indiziertem Vault — für die Suche nach Bedeutung, den Kontext-Modus **Vault** und das Werkzeug `related_notes`.

## Installation

### Community-Plugins (empfohlen)

1. **Einstellungen → Community-Plugins → Durchsuchen** öffnen.
2. Nach **Koda** suchen, **Installieren**, dann **Aktivieren**.

### AnySource Sideloader

Mit [AnySource Sideloader](https://github.com/johannes-kaindl/anysource-sideloader) `https://github.com/johannes-kaindl/koda-agent` als Quelle eintragen und Koda von dort installieren. Updates kommen dann wie bei jedem anderen Plugin.

### Von Hand

`main.js`, `manifest.json` und `styles.css` aus dem [neuesten Release](https://github.com/johannes-kaindl/koda-agent/releases/latest) nach `<dein Vault>/.obsidian/plugins/koda-agent/` legen, dann unter **Einstellungen → Community-Plugins** aktivieren. Jedes Release enthält zusätzlich `checksums.sha256` (`shasum -a 256 -c checksums.sha256`).

## Verwendung

1. Modell-Server starten, **Einstellungen → Koda** öffnen, in der Endpunkt-Zeile (Standard `http://127.0.0.1:1234`) **Testen** drücken und unter **Modell → Modelle abrufen** das Modell wählen.
2. Die Seitenleiste über das **Hunde-Symbol** in der Menüleiste oder den Befehl **Koda öffnen** öffnen.
3. Eine Frage zu deinem Vault stellen. Die Statuszeile sagt, was Koda gerade tut; jeder Werkzeugaufruf erscheint im Chat.
4. Im Tab **Kontext** oder über das Dropdown neben **Senden** prüfen und ändern, was mitgeht.
5. Schreibvorgänge im Dialog erlauben oder abbrechen, der sich vor jeder Änderung außerhalb des Koda-Ordners öffnet.

Die Anleitung [Getting started](https://github.com/johannes-kaindl/koda-agent/blob/main/docs/getting-started.md) geht das Schritt für Schritt durch (auf Englisch).

## Konfiguration

Alles liegt unter **Einstellungen → Koda**: Endpunkte und Modell, der Koda-Ordner (Standard `Koda`), wie viele Werkzeugaufrufe eine Antwort nehmen darf, die Verdichtung, der Arbeitskontext und die Modell-Steuerung. Die [Einstellungs-Referenz](https://github.com/johannes-kaindl/koda-agent/blob/main/docs/reference/settings.md) führt jede Einstellung mit Standard und Wertebereich (auf Englisch).

## Funktionsweise

Eine Frage startet eine Agenten-Schleife: das Modell antwortet oder ruft ein Werkzeug auf, Koda führt es gegen den Vault aus und gibt das Ergebnis zurück, bis zu einer Grenze, die du einstellst. Geschrieben wird über eine einzige Regel — frei im Koda-Ordner, überall sonst ein Dialog —, die kein Werkzeug umgehen kann. Die Anweisung an das Modell entsteht für jedes Gespräch neu aus Kodas Regeln, deiner Memory-Notiz und deinen Skills. Mehr in [How Koda works](https://github.com/johannes-kaindl/koda-agent/blob/main/docs/explanation/how-koda-works.md).

## Dokumentation

Die Nutzer-Dokumentation ist auf Englisch.

- **[Dokumentation](https://github.com/johannes-kaindl/koda-agent/blob/main/docs/README.md)** — Einstieg, nach Diátaxis gegliedert: Anleitung, How-tos, Referenz, Erklärung.
- **[Erste Schritte](https://github.com/johannes-kaindl/koda-agent/blob/main/docs/getting-started.md)** — von der Installation bis zur ersten Antwort und zum ersten bestätigten Schreibvorgang.
- **[Fehlerbehebung](https://github.com/johannes-kaindl/koda-agent/blob/main/docs/how-to/troubleshooting.md)** — eine Meldung oder ein Symptom, die Ursache und was zu tun ist.

## Mitmachen

Das kanonische Repository ist [git.jkaindl.de/jkaindl/koda-agent](https://git.jkaindl.de/jkaindl/koda-agent); GitHub ist sein Spiegel. Issues gern auf [GitHub](https://github.com/johannes-kaindl/koda-agent/issues). Entwicklungsnotizen (Befehle, Struktur, Smoke-Checkliste) stehen in `CLAUDE.md` im Repository.

## Lizenz

[AGPL-3.0-or-later](https://github.com/johannes-kaindl/koda-agent/blob/main/LICENSE) — © 2026 Jay.
