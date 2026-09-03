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

# ZWEITE REF, NUR FUER DAS TEST-DOUBLE — und das ist Absicht, kein Schlendrian.
# Muster uebernommen aus `epub-exporter/tools/sync-kit.sh` (zwei Refs fuer zwei
# Vendor-Ordner), 2026-09-03.
#
# Die pure-Schicht dieses Repos steht auf 0.27.0. Sie hochzuziehen ist eine INHALTLICHE
# Aenderung an vendoriertem Produktivcode: seit obsidian-kit 0.28.0 sind die pure-Module
# nach code-kit abgewandert, ein Lauf mit einer neueren Ref braecht hier an
# `src/pure/think-splitter.ts` ab. Das Test-Double liegt dagegen unter `src/testing/`,
# ist dort geblieben und hat null Importe — es laesst sich einzeln heben, ohne die
# Produktivschicht anzufassen. Die Trennung ist ablesbar: `tests/vendor/kit/obsidian-mock.ts`
# traegt seinen Pin in der eigenen Stempelzeile (dort liegt kein VENDOR.json), waehrend die
# beiden VENDOR.json den Stand der Produktivschicht nennen.
#
# Wer die Produktivschicht hebt, setzt KIT_REF und faehrt danach `npm run gate` — dann
# duerfen beide Refs wieder gleich sein.
MOCK_REF=${MOCK_REF:-0.31.0}

for ref in "$KIT_REF" "$MOCK_REF"; do
  git -C "$KIT" rev-parse --verify --quiet "$ref^{commit}" >/dev/null \
    || { echo "sync-kit: Ref '$ref' existiert nicht in $KIT (KIT_REF/MOCK_REF setzen)" >&2; exit 1; }
done

VER=$(git -C "$KIT" describe --tags --abbrev=0 "$KIT_REF")
SHA=$(git -C "$KIT" rev-parse --short "$KIT_REF^{commit}")
MOCK_VER=$(git -C "$KIT" describe --tags --abbrev=0 "$MOCK_REF")

PURE="think-splitter reasoning capabilities endpoint endpoint_config endpoint_diagnostics settings i18n num timeout frontmatter model-context error_body diff settings_schema model-choice model-list-cache"
OBS="clock confirm folder-suggest settings_walker endpoint-list model-picker"

mkdir -p src/vendor/kit src/vendor/kit-obsidian tests/vendor/kit

# Stempel und Inhalt entstehen in EINER Umleitung: schlaegt `git show` fehl (falsche Ref,
# verschobenes Modul), bricht `set -e` ab, bevor die Zieldatei geschrieben ist — es bleibt
# kein Torso zurueck, der den Stempel traegt und dadurch wie gueltiges Vendoring aussieht.
vendor() { # vendor <kit-relativer-pfad> <zielpfad> [ref] [version]
  ref=${3:-$KIT_REF}
  ver=${4:-$VER}
  { printf '%s\n' "// vendored from obsidian-kit@$ver, $1 — do not hand-edit; re-vendor via tools/sync-kit.sh"
    git -C "$KIT" show "$ref:$1"; } > "$2"
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
  # ZWEI Muster, seit obsidian-kit 2ab1bb5: die gekoppelte Schicht importierte frueher
  # `../pure/x`, seit dem code-kit-Umzug importiert sie `../vendor/code-kit/{pure,web}/x`.
  # Wer nur das alte kennt, laesst den neuen Import stehen — er zeigt ins Leere, und der
  # Fehler erscheint nicht hier, sondern spaeter im Typecheck/Lint einer anderen Datei
  # (gemessen 2026-09-03 an vim-dojo: acht TS2307 auf einmal in endpoint-list.ts).
  sed -e 's|\(["'"'"']\)\.\./pure/|\1../kit/|g' \
      -e 's|\(["'"'"']\)\.\./vendor/code-kit/pure/|\1../kit/|g' \
      -e 's|\(["'"'"']\)\.\./vendor/code-kit/web/|\1../kit/|g' "$f" > "$f.tmp"
  if cmp -s "$f" "$f.tmp"; then rm -f "$f.tmp"; return 0; fi   # nichts zu tun, KEINE Notiz
  mv "$f.tmp" "$f"

  # (2) Gegenprobe: bleibt ein ../pure/ stehen, bricht der Build spaeter und woanders.
  if grep -qE '\.\./(pure|vendor/code-kit)/' "$f"; then
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

vendor "src/testing/obsidian-mock.ts" "tests/vendor/kit/obsidian-mock.ts" "$MOCK_REF" "$MOCK_VER"

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
echo "VENDOR.json → $VER ($SHA) · obsidian-mock → $MOCK_VER"
