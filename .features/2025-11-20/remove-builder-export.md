---
# User Prompt
> remove as Builder export here and replace Builder.blah with direct usage

# Description
The Builder namespace re-export in `packages/core/src/index.ts` needs to be removed and all downstream usages must import the required builder utilities directly.

# Open Questions
- [ ] None (requirements confirmed with user)

# Tasks
- [x] **TS001**: Remove `export * as Builder` and ensure builder API remains available via named exports.
- [x] **TS002**: Update all `Builder.*` usages to direct named imports, run lint/tests, and verify CI requirements.
- [x] **TS003**: Remove inline import expressions and rely on named type imports only.
- [x] **TS004**: Replace namespace type usage with direct named type imports to satisfy tooling requirements.

# Acceptance Criteria
- [x] Builder namespace re-export is removed from `packages/core/src/index.ts`.
- [x] All references use explicit named imports from the builder module.
- [x] Tests and linters pass (or user approves deferral).
- [x] No inline import expressions remain in consuming packages.
- [x] Builder type usage relies on explicit named imports without namespace indirection.

# Change Log
- WIP: remove as Builder export here and replace Builder.blah with direct usage — created feature plan file.
- task: TS001 - Remove `export * as Builder` and ensure builder API remains available via named exports — dropped namespace re-export from `packages/core/src/index.ts`.
- task: TS002 - Update all `Builder.*` usages to direct named imports, run lint/tests, and verify CI requirements — switched consuming packages to direct type imports, removed type assertions, and ran bun lint/typecheck/test (bun fix blocked by invalid `.vscode/mcp.json`).
- WIP: inline imports are not allowed — captured new requirement to remove inline import expressions.
- task: TS003 - Remove inline import expressions and rely on named type imports only — replaced inline import usage with namespace type import and kept runtime builder implementation untouched.
- WIP: import exact types — noted follow-up requirement to swap namespace import for explicit type imports.
- task: TS004 - Replace namespace type usage with direct named type imports to satisfy tooling requirements — switched to explicit `ToolConfigBuilder` type import alias.

## Commit Message
notes...
---
