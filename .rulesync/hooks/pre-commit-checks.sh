#!/usr/bin/env bash
set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only intercept git commit commands
if ! echo "$COMMAND" | grep -qE '^\s*git\s+commit\b'; then
  exit 0
fi

ISSUES=""

if ! bun typecheck 2>&1; then
  ISSUES="${ISSUES}\n- bun typecheck failed"
fi

if ! bun lint 2>&1; then
  ISSUES="${ISSUES}\n- bun lint failed"
fi

if ! bun test:all 2>&1; then
  ISSUES="${ISSUES}\n- bun test:all failed"
fi

if [ -n "$ISSUES" ]; then
  printf "git commit BLOCKED due:\n${ISSUES}\n" >&2
  exit 2
fi

exit 0
