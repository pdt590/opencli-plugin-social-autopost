#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="social-autopost"
SOURCE_DIR="${HERMES_SKILLS_DIR:-$HOME/.hermes/skills}/$SKILL_NAME"
DEST_DIR="$SCRIPT_DIR/skills/$SKILL_NAME"

if [[ ! -d "$SOURCE_DIR" ]]; then
  printf 'Error: Hermes skill directory not found: %s\n' "$SOURCE_DIR" >&2
  exit 1
fi

if [[ ! -f "$SOURCE_DIR/SKILL.md" ]]; then
  printf 'Error: SKILL.md not found in Hermes skill directory: %s\n' "$SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$(dirname -- "$DEST_DIR")"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$SOURCE_DIR/" "$DEST_DIR/"
else
  rm -rf -- "$DEST_DIR"
  mkdir -p "$DEST_DIR"
  cp -a "$SOURCE_DIR/." "$DEST_DIR/"
fi

printf 'Cloned Hermes skill:\n  %s\n  → %s\n' "$SOURCE_DIR" "$DEST_DIR"
