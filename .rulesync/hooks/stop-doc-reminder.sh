#!/usr/bin/env bash
# Stop hook: remind agent to update docs if production code changed

INPUT=$(cat)
STOP_REASON=$(echo "$INPUT" | jq -r '.stop_reason // "unknown"')

# Only remind on normal stops (not errors/interrupts)
if [ "$STOP_REASON" = "error" ]; then
  exit 0
fi

cat <<'REMINDER'
## Documentation Reminder

If you changed production code in this session, check whether these need updating:

1. **make-tool reference** (PRIORITY) — `.rulesync/skills/dotfiles/references/make-tool.md`
   - New installation methods, config options, builder methods, or context variables
   - New examples or changed API surface

2. **Dotfiles skill references** — `.rulesync/skills/dotfiles/references/`
   - `api-reference.md` — exports, builder methods, utilities
   - `installation-methods/overview.md` and sibling files — installation method parameters
   - `shell-and-hooks.md` — shell integration, completions, hooks
   - `configuration.md` — project config, platform support, troubleshooting

3. **Package READMEs** — `packages/*/README.md`
   - Changed package APIs or behavior

Skip this if changes were docs-only, test-only, or internal refactoring with no API impact.
REMINDER
