#!/usr/bin/env bash
# Ссылки .claude/skills/<name> → docs/skills/**/SKILL.md (name из шапки скилла).
# До фазы 0 запускается напрямую; потом — pnpm skills:link.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/.claude/skills"
mkdir -p "$dest"
find "$dest" -maxdepth 1 -type l -delete
find "$root/docs/skills" -name SKILL.md -not -path '*/_*' | sort | while read -r f; do
  dir="$(dirname "$f")"
  name="$(sed -n 's/^name: *//p' "$f" | head -1)"
  [ -n "$name" ] || { echo "нет name: $f" >&2; exit 1; }
  [ -e "$dest/$name" ] && { echo "дубль имени: $name" >&2; exit 1; }
  ln -s "../../${dir#$root/}" "$dest/$name"
  echo "$name -> ${dir#$root/}"
done
