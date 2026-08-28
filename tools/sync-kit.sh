#!/bin/sh
# Re-vendor kit modules from ../obsidian-kit. Run after kit updates.
#
# Gelesen wird aus einer festen Ref (KIT_REF), nicht aus dem Arbeitsstand des Nachbar-Repos.
# Grund (Dach-Task „sync-kit.sh — Pin-Konsistenz gegen code-kit 0.28.0", 2026-08-27): ein `cp`
# aus `$KIT/src/...` misst dessen Arbeitsverzeichnis, der Pin kam aus dessen `HEAD` — zwei
# verschiedene Messungen unter einer Behauptung. Seit obsidian-kit 0.28.0 ist das kein
# Schoenheitsfehler mehr: dort sind pure-Module nach code-kit abgewandert, ein Lauf gegen einen
# 0.28.0-Arbeitsstand zoege also andere Dateien ein und stempelte sie mit dem falschen Pin.
# `git show <ref>:<pfad>` ist reproduzierbar und stoert keine parallele Session im Nachbar-Repo.
# Muster uebernommen aus `audio-interface/tools/sync-kit.sh`, 2026-08-28.
set -e

KIT=../obsidian-kit
KIT_REF=${KIT_REF:-0.27.0}
VER=$(git -C "$KIT" describe --tags --abbrev=0 "$KIT_REF")
SHA=$(git -C "$KIT" rev-parse --short "$KIT_REF^{commit}")

PURE="think-splitter reasoning endpoint endpoint_config endpoint_diagnostics settings i18n num timeout frontmatter model-context error_body diff settings_schema model-choice model-list-cache"
OBS="clock confirm folder-suggest settings_walker endpoint-list model-picker"

mkdir -p src/vendor/kit src/vendor/kit-obsidian tests/vendor/kit

# Stempel und Inhalt entstehen in EINER Umleitung: schlaegt `git show` fehl (falsche Ref,
# verschobenes Modul), bricht `set -e` ab, bevor die Zieldatei geschrieben ist — es bleibt
# kein Torso zurueck, der den Stempel traegt und dadurch wie gueltiges Vendoring aussieht.
vendor() { # vendor <kit-relativer-pfad> <zielpfad>
  { printf '%s\n' "// vendored from obsidian-kit@$VER, $1 — do not hand-edit; re-vendor via tools/sync-kit.sh"
    git -C "$KIT" show "$KIT_REF:$1"; } > "$2"
}

# uebernommen aus vim-dojo/tools/sync-kit.sh, 2026-08-28
# Kit-interne Querimporte aufs Vendor-Layout umschreiben. Im Kit liegen die Schichten als
# src/obsidian + src/pure nebeneinander, hier als src/vendor/kit-obsidian + src/vendor/kit —
# `../pure/` zeigt hier also ins Leere. Das ist die EINZIGE zulaessige Abweichung von verbatim;
# bei jedem Re-Vendor reproduzieren, sonst darf nichts abweichen.
# Praezedenz: kuro-gamification, markdown-presentation, vault-crews, vim-dojo (seit 0.26.0).
relayer() { # relayer <vendored-file>
  f=$1

  # (0) VORBEDINGUNG: der Umschrieb setzt die Zwei-Ordner-Form der Kit-README voraus. Ohne
  #     sie zeigt `../kit/` von src/vendor/kit/ aus auf DIE DATEI SELBST.
  case "$f" in
    src/vendor/kit-obsidian/*) ;;
    *) echo "sync-kit: $f liegt nicht in src/vendor/kit-obsidian/ — der Querimport-Umschrieb setzt die Zwei-Ordner-Form voraus (obsidian-kit/README.md)" >&2; exit 1 ;;
  esac
  [ -d src/vendor/kit ] || { echo "sync-kit: src/vendor/kit/ fehlt — pure-Schicht anlegen, bevor gekoppelte Module mit Querimport vendoriert werden" >&2; exit 1; }

  # (1) Umschreiben, und feststellen OB umgeschrieben wurde. `cmp` statt md5: portabel,
  #     macOS (md5) und GitHub-CI (md5sum) heissen verschieden.
  sed 's|\(["'"'"']\)\.\./pure/|\1../kit/|g' "$f" > "$f.tmp"
  if cmp -s "$f" "$f.tmp"; then rm -f "$f.tmp"; return 0; fi   # nichts zu tun, KEINE Notiz
  mv "$f.tmp" "$f"

  # (2) Gegenprobe: bleibt ein ../pure/ stehen, bricht der Build spaeter und woanders.
  if grep -q '\.\./pure/' "$f"; then
    echo "sync-kit: '../pure/' in $f nicht umgeschrieben — Muster pruefen" >&2; exit 1
  fi

  # (3) Mitvendorier-Gegenprobe: jedes umgeschriebene Ziel muss auch wirklich da sein.
  for dep in $(sed -n 's|.*from ["'"'"']\.\./kit/\([A-Za-z0-9_/-]*\)["'"'"'].*|\1|p' "$f" | sort -u); do
    [ -f "src/vendor/kit/$dep.ts" ] || {
      echo "sync-kit: $f importiert ../kit/$dep, aber src/vendor/kit/$dep.ts fehlt — mitvendorieren" >&2; exit 1
    }
  done

  note="// ONE mechanical deviation from verbatim: kit-internal imports ../pure/ → ../kit/ (vendor layout); reproduce on every re-vendor, nothing else may differ."
  printf '%s\n' "$note" | cat - "$f" > "$f.tmp"
  mv "$f.tmp" "$f"
}

# pure zuerst: die Mitvendorier-Gegenprobe in relayer() setzt sie voraus.
for m in $PURE; do
  vendor "src/pure/$m.ts" "src/vendor/kit/$m.ts"
  echo "vendored obsidian-kit@$VER/pure/$m.ts"
done

for m in $OBS; do
  vendor "src/obsidian/$m.ts" "src/vendor/kit-obsidian/$m.ts"
  relayer "src/vendor/kit-obsidian/$m.ts"
  echo "vendored obsidian-kit@$VER/obsidian/$m.ts"
done

vendor "src/testing/obsidian-mock.ts" "tests/vendor/kit/obsidian-mock.ts"

list() { printf '%s' "$1" | sed 's/ /.ts, /g;s/$/.ts/'; }

cat > src/vendor/kit/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "vendored": "$(list "$PURE")",
  "note": "Verbatim snapshot. Never hand-edit. Re-vendor via tools/sync-kit.sh (liest KIT_REF, nicht den Arbeitsstand). kit-obsidian/ siehe dessen VENDOR.json; tests/vendor/kit/obsidian-mock.ts traegt seinen Pin in der Stempelzeile (dort liegt kein VENDOR.json)."
}
JSON
cat > src/vendor/kit-obsidian/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "vendored": "$(list "$OBS")",
  "note": "Verbatim snapshot. Never hand-edit. Re-vendor via tools/sync-kit.sh (liest KIT_REF, nicht den Arbeitsstand)."
}
JSON
echo "VENDOR.json → $VER ($SHA)"
