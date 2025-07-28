#!/usr/bin/env bash 

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR/.."

OUTFILE="$(realpath "$(pwd)/dist/dotfiles-generator")"

bun build \
  ./src/cli.ts \
  --compile \
  --minify \
  --define 'CLI_BIN_PATH="'"$OUTFILE"'"' \
  --outfile "$OUTFILE"
