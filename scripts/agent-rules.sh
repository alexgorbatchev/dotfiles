#!/usr/bin/env bash 

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR/.."

bun rulesync generate --roo
bun rulesync generate --claudecode
