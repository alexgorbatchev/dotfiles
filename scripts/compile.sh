#!/usr/bin/env bash 

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR/.."

OUTFILE="$(pwd)/dist/dotfiles-generator"

mkdir -p "$(dirname "$OUTFILE")"

bun build \
  ./src/cli.ts \
  --compile \
  --minify \
  --define 'CLI_BIN_PATH="'"$OUTFILE"'"' \
  --outfile "$OUTFILE"
