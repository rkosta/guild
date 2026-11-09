#!/usr/bin/env bash
# Copy agents and commands into ~/.claude/ (user level).
# Run from anywhere: ./scripts/install.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

for dir in agents commands; do
  mkdir -p "$CLAUDE_DIR/$dir"
  for file in "$REPO_DIR/$dir"/*.md; do
    cp "$file" "$CLAUDE_DIR/$dir/"
    echo "  $dir/$(basename "$file") -> $CLAUDE_DIR/$dir/"
  done
done

# Agents this repo used to ship and no longer does.
RETIRED=(agents/tester.md)
for retired in "${RETIRED[@]}"; do
  if [ -f "$CLAUDE_DIR/$retired" ]; then
    rm "$CLAUDE_DIR/$retired"
    echo "  removed retired $retired"
  fi
done

echo "Done. Restart Claude Code and check /agents."
