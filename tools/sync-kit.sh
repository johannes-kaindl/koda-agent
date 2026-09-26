#!/bin/sh
# Re-vendor kit modules from ../obsidian-kit. Run after kit updates.
set -e

KIT="${KIT_DIR:-../obsidian-kit}"
# Zweite Quelle seit obsidian-kit 2ab1bb5 ("domaenenfreie pure-Teilmenge zieht nach code-kit"):
# alle hier vendorten pure-Module (bis auf frontmatter.ts, das in obsidian-kit/src/pure
# geblieben ist) liegen dort, nicht mehr unter obsidian-kit/src/pure/. Uebernommen aus
# lingotuner/tools/sync-kit.sh (Vorlage, koda-agent kannte bis 0.35.0 nur eine Quelle).
#
# obsidian-kit traegt unter src/vendor/code-kit/ eigene Kopien einiger Module; die werden hier
# bewusst NICHT genommen. Eine Zwischenkopie als Quelle zu nehmen erzeugt eine Kopier-Kette,
# und die sieht bei der naechsten Zaehlung wie ein unabhaengiger Beleg aus.
CODE_KIT="${CODE_KIT_DIR:-../../libs/code-kit}"
[ -d "$KIT/src/pure" ] || { echo "Kit nicht gefunden unter $KIT (KIT_DIR setzen)" >&2; exit 1; }
[ -d "$CODE_KIT/src/ts" ] || { echo "code-kit nicht gefunden unter $CODE_KIT (CODE_KIT_DIR setzen)" >&2; exit 1; }
# CORE-META-22: gelesen wird aus einer FESTEN REF, nicht aus dem Arbeitsstand des
# Nachbar-Repos. Ein `cp` aus dessen Worktree koppelt dieses Repo an einen fremden HEAD.
# Default ist die package.json-Version der Quelle; ein Upgrade ist eine BEWUSSTE Handlung.
VER="${KIT_REF:-$(node -p "require('$KIT/package.json').version")}"
CODE_VER="${CODE_KIT_REF:-$(node -p "require('$CODE_KIT/package.json').version")}"
for paar in "$KIT|$VER" "$CODE_KIT|$CODE_VER"; do
  repo=${paar%%|*}; ref=${paar##*|}
  git -C "$repo" rev-parse --verify --quiet "$ref^{commit}" >/dev/null || {
    echo "FEHLER: Ref '$ref' existiert nicht in $repo." >&2
    echo "  Entweder ist die Version dort ungetaggt, oder KIT_REF/CODE_KIT_REF setzen." >&2
    exit 2
  }
done
SHA=$(git -C "$KIT" rev-parse --short "$VER^{commit}")

# Ein pures Modul kann in drei Schichten liegen. Statt fester Zuordnung wird gesucht — die
# naechste Umschichtung soll dieses Skript nicht wieder toeten, sondern nur einen anderen
# Fundort ergeben. Ausgabe: <repo>|<ref>|<quelle>|<quell-relativer-pfad>|<version>
quelle_fuer() {
  for kandidat in \
    "$KIT|$VER|obsidian-kit|src/pure/$1.ts|$VER" \
    "$CODE_KIT|$CODE_VER|code-kit|src/ts/pure/$1.ts|$CODE_VER" \
    "$CODE_KIT|$CODE_VER|code-kit|src/ts/web/$1.ts|$CODE_VER"; do
    repo=$(printf '%s' "$kandidat" | cut -d'|' -f1)
    ref=$(printf '%s' "$kandidat" | cut -d'|' -f2)
    rel=$(printf '%s' "$kandidat" | cut -d'|' -f4)
    # In der REF nachsehen, nicht im Worktree — sonst faende die Suche eine Datei, die der
    # Lesevorgang danach nicht bekommt.
    if git -C "$repo" cat-file -e "$ref:$rel" 2>/dev/null; then
      printf '%s\n' "$kandidat"; return 0
    fi
  done
  return 1
}

# In eine .tmp lesen und erst bei Erfolg verschieben — eine Ausgabe-Umleitung legt die
# Zieldatei an, BEVOR der Lesebefehl laeuft, und hinterlaesst sonst einen Torso, der mit
# Stempelzeile wie ein gueltiges Vendoring aussieht.
hole() { # hole <repo> <ref> <quell-pfad> <ziel>
  git -C "$1" show "$2:$3" > "$4.tmp" || { rm -f "$4.tmp"; return 1; }
  mv "$4.tmp" "$4"
}

stamp() { # stamp <vendored-file> <quell-relativer-pfad> [<quelle> <version>]
  quelle=${3:-obsidian-kit}
  version=${4:-$VER}
  header="// vendored from $quelle@$version, $2 — do not hand-edit; re-vendor via tools/sync-kit.sh"
  printf '%s\n' "$header" | cat - "$1" > "$1.tmp"
  mv "$1.tmp" "$1"
}

# Kit-interne Querimporte aufs Vendor-Layout umschreiben. Im Kit liegen die Schichten als
# src/obsidian + src/pure nebeneinander, hier als src/vendor/kit-obsidian + src/vendor/kit —
# `../pure/` zeigt hier also ins Leere. Das ist die EINZIGE zulaessige Abweichung von verbatim;
# bei jedem Re-Vendor reproduzieren, sonst darf nichts abweichen.
# Praezedenz: kuro-gamification, markdown-presentation, vault-crews, vim-dojo, lingotuner.
relayer() { # relayer <vendored-file>
  f=$1

  case "$f" in
    src/vendor/kit-obsidian/*) ;;
    *) echo "sync-kit: $f liegt nicht in src/vendor/kit-obsidian/ — der Querimport-Umschrieb setzt die Zwei-Ordner-Form voraus (obsidian-kit/README.md)" >&2; exit 1 ;;
  esac
  [ -d src/vendor/kit ] || { echo "sync-kit: src/vendor/kit/ fehlt — pure-Schicht anlegen, bevor gekoppelte Module mit Querimport vendoriert werden" >&2; exit 1; }

  # ZWEI Muster, seit obsidian-kit 2ab1bb5: die gekoppelte Schicht importierte frueher
  # `../pure/x`, seit dem code-kit-Umzug importiert sie `../vendor/code-kit/{pure,web}/x`.
  # Beide muessen auf `../kit/` zeigen, denn hier liegt die pure Schicht flach unter
  # src/vendor/kit/ — egal aus welcher Quelle das Modul stammt.
  sed -e 's|\(["'"'"']\)\.\./pure/|\1../kit/|g' \
      -e 's|\(["'"'"']\)\.\./vendor/code-kit/pure/|\1../kit/|g' \
      -e 's|\(["'"'"']\)\.\./vendor/code-kit/web/|\1../kit/|g' "$f" > "$f.tmp"
  if cmp -s "$f" "$f.tmp"; then rm -f "$f.tmp"; return 0; fi   # nichts zu tun, KEINE Notiz
  mv "$f.tmp" "$f"

  # Gegenprobe: bleibt eines der Muster stehen, bricht der Build spaeter und woanders.
  if grep -qE '\.\./(pure|vendor/code-kit)/' "$f"; then
    echo "sync-kit: unaufgeloester Kit-Querimport in $f — Muster pruefen" >&2; exit 1
  fi

  # Mitvendorier-Gegenprobe: jedes umgeschriebene Ziel muss auch wirklich da sein.
  for dep in $(sed -n 's|.*from ["'"'"']\.\./kit/\([A-Za-z0-9_/-]*\)["'"'"'].*|\1|p' "$f" | sort -u); do
    [ -f "src/vendor/kit/$dep.ts" ] || {
      echo "sync-kit: $f importiert ../kit/$dep, aber src/vendor/kit/$dep.ts fehlt — mitvendorieren" >&2; exit 1
    }
  done

  note="// ONE mechanical deviation from verbatim: kit-internal imports (../pure/ and ../vendor/code-kit/{pure,web}/) → ../kit/ (vendor layout); reproduce on every re-vendor, nothing else may differ."
  printf '%s\n' "$note" | cat - "$f" > "$f.tmp"
  mv "$f.tmp" "$f"
}

mkdir -p src/vendor/kit src/vendor/kit-obsidian

PURE_MODULE="think-splitter reasoning capabilities endpoint endpoint_config endpoint_diagnostics settings i18n num timeout frontmatter model-context error_body diff settings_schema model-choice model-list-cache stream-blocks"
# Die gekoppelte Schicht (importiert `obsidian`). stable-writer traegt einen Querimport auf
# ../vendor/code-kit/pure/stream-blocks und braucht deshalb den relayer (Fallgruppe unten).
OBSIDIAN_MODULE="clock confirm folder-suggest settings_walker endpoint-list model-picker hub collapsible stream-area stable-writer"

# Die "vendored"-Zeile der VENDOR.json wird aus derselben Liste erzeugt, aus der kopiert wird.
# Zwei Orte fuer dieselbe Wahrheit driften (CORE-META-16) — und zwar leise: die Datei, in der
# man den Vendor-Stand nachschlaegt, waere dann die einzige, die ihn falsch nennt.
liste() { for m in $1; do printf '%s.ts, ' "$m"; done | sed 's/, $//'; }

# Erst ALLE Quellen aufloesen, dann kopieren: ein fehlendes Modul ist ein Aufbaufehler und
# wird als solcher gemeldet, statt den Lauf auf halber Strecke abzubrechen.
for m in $PURE_MODULE; do
  quelle_fuer "$m" >/dev/null || {
    echo "FEHLER: $m.ts liegt weder in $KIT/src/pure/ noch in $CODE_KIT/src/ts/{pure,web}/." >&2
    echo "  Seit obsidian-kit 2ab1bb5 ist code-kit die Quelle der domaenenfreien Module." >&2
    exit 2
  }
done

for m in $PURE_MODULE; do
  fund=$(quelle_fuer "$m")
  repo=$(printf '%s' "$fund" | cut -d'|' -f1)
  ref=$(printf '%s' "$fund" | cut -d'|' -f2)
  quelle=$(printf '%s' "$fund" | cut -d'|' -f3)
  rel=$(printf '%s' "$fund" | cut -d'|' -f4)
  ver=$(printf '%s' "$fund" | cut -d'|' -f5)
  hole "$repo" "$ref" "$rel" "src/vendor/kit/$m.ts" || {
    echo "FEHLER: $ref:$rel nicht lesbar in $repo" >&2; exit 2; }
  stamp "src/vendor/kit/$m.ts" "$rel" "$quelle" "$ver"
  echo "vendored $quelle@$ver/$rel"
done

for m in $OBSIDIAN_MODULE; do
  hole "$KIT" "$VER" "src/obsidian/$m.ts" "src/vendor/kit-obsidian/$m.ts" || {
    echo "FEHLER: $VER:src/obsidian/$m.ts nicht lesbar" >&2; exit 2; }
  # endpoint-list.ts, model-picker.ts und stable-writer.ts tragen Querimporte auf
  # ../vendor/code-kit/{pure,web}/. Ein pauschaler Aufruf waere wirkungslos, aber
  # irrefuehrend — deshalb gezielt.
  case "$m" in endpoint-list|model-picker|stable-writer) relayer "src/vendor/kit-obsidian/$m.ts" ;; esac
  stamp "src/vendor/kit-obsidian/$m.ts" "src/obsidian/$m.ts"
  echo "vendored obsidian-kit@$VER/obsidian/$m.ts"
done

mkdir -p tests/vendor/kit
hole "$KIT" "$VER" "src/testing/obsidian-mock.ts" "tests/vendor/kit/obsidian-mock.ts" || {
  echo "FEHLER: $VER:src/testing/obsidian-mock.ts nicht lesbar" >&2; exit 2; }
stamp "tests/vendor/kit/obsidian-mock.ts" "src/testing/obsidian-mock.ts"
echo "vendored obsidian-kit@$VER/testing/obsidian-mock.ts"

# help-setting.ts (UI-STANDARD §8, Hilfe-Zeile) auf einem EIGENEN Pin: es zieht mit 0.43.0 ein,
# die uebrigen Module behalten ihre Ref. Ein Pin, der nur fuer dieses eine Modul gilt.
KIT_HELP_REF="${KIT_HELP_REF:-0.43.0}"
git -C "$KIT" cat-file -e "$KIT_HELP_REF:src/obsidian/help-setting.ts" 2>/dev/null || {
  echo "FEHLER: $KIT_HELP_REF:src/obsidian/help-setting.ts fehlt in $KIT (KIT_HELP_REF setzen)." >&2; exit 2; }
HELP_SHA=$(git -C "$KIT" rev-parse --short "$KIT_HELP_REF^{commit}")
hole "$KIT" "$KIT_HELP_REF" "src/obsidian/help-setting.ts" "src/vendor/kit-obsidian/help-setting.ts" || {
  echo "FEHLER: $KIT_HELP_REF:src/obsidian/help-setting.ts nicht lesbar" >&2; exit 2; }
f="src/vendor/kit-obsidian/help-setting.ts"
printf '%s\n' "// vendored from obsidian-kit@$KIT_HELP_REF, src/obsidian/help-setting.ts — do not hand-edit; re-vendor via tools/sync-kit.sh" | cat - "$f" > "$f.tmp"
mv "$f.tmp" "$f"
echo "vendored obsidian-kit@$KIT_HELP_REF/obsidian/help-setting.ts"

cat > src/vendor/kit/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "code_kit_version": "$CODE_VER",
  "vendored": "$(liste "$PURE_MODULE")",
  "vendored_mixed_version": [
    {
      "file": "explain-texts.ts",
      "version": "0.38.0",
      "sha": "4988fa0",
      "note": "Einzeln vendoriert (git show 0.38.0:src/pure/explain-texts.ts), NICHT ueber tools/sync-kit.sh — das Skript berechnet eine gemeinsame VER fuer PURE_MODULE+OBSIDIAN_MODULE und haette beim Aufnehmen dieser Datei alle 18 anderen ebenfalls auf 0.38.0 gehoben. Datei ist dependenzfrei (keine Kit-internen Importe), Einzel-Vendoring deshalb gefahrlos. Re-vendor manuell mit demselben git-show-Befehl gegen einen neuen Tag; Kopf-Stempel und dieser Eintrag von Hand nachziehen."
    }
  ],
  "note": "Verbatim snapshot aus ZWEI Quellen (obsidian-kit + code-kit); welche Datei woher stammt, sagt ihr eigener Kopf. Never hand-edit (Ausnahme: \"vendored_mixed_version\"-Eintraege, die per Definition ausserhalb von tools/sync-kit.sh liegen). Re-vendor via tools/sync-kit.sh. version/sha gelten AUSSCHLIESSLICH fuer die unter \"vendored\" gelisteten Dateien; \"vendored_mixed_version\" traegt seine Version/SHA je Eintrag selbst. kit-obsidian/ siehe dortige VENDOR.json."
}
JSON
cat > src/vendor/kit-obsidian/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "vendored": "$(liste "$OBSIDIAN_MODULE")",
  "help_setting": "help-setting.ts (Kit $KIT_HELP_REF, $HELP_SHA)",
  "note": "Verbatim snapshot. Never hand-edit. Re-vendor via tools/sync-kit.sh. version/sha gelten AUSSCHLIESSLICH fuer die unter \"vendored\" gelisteten Dateien; help-setting.ts liegt auf eigenem Pin (Feld help_setting). endpoint-list.ts, model-picker.ts und stable-writer.ts tragen EINE mechanische Abweichung: kit-interne Importe ../vendor/code-kit/{pure,web}/ sind auf ../kit/ umgeschrieben (Vendor-Layout). Bei jedem Re-Vendoring reproduzieren; sonst darf nichts abweichen. Praezedenz: vim-dojo, markdown-presentation, vault-crews, kuro-gamification, lingotuner."
}
JSON
cat > tests/vendor/kit/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "vendored": "obsidian-mock.ts",
  "note": "Verbatim snapshot. Never hand-edit. Re-vendor via tools/sync-kit.sh."
}
JSON
echo "VENDOR.json → $VER ($SHA)"
