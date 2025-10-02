#! /usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR/.."

scripts/check-cli.sh generate 
cd .generated/bin

FZF_OUTPUT=$(./fzf --version 2>&1) || {
  echo "Error: fzf failed to print version:" >&2
  echo "$FZF_OUTPUT" >&2
  exit 1
}
echo "$FZF_OUTPUT"

# cargo installer
EZA_OUTPUT=$(./eza --version 2>&1) || {
  echo "Error: eza failed to print version:" >&2
  echo "$EZA_OUTPUT" >&2
  exit 1
}
echo "$EZA_OUTPUT"