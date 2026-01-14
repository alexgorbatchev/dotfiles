# User Prompt

> we have added context to in SafeLogger.ts, what we need to do is to use toolName for context, so that all logging that is related to specific toolName, prints [toolName] so that user knows what it is related to. TrackedFileSystem.ts already does something similar, and i think we can replace that implementation with a parent logger that already has proper context.
>
> not just trackedfs, everywhere across entire system... there are only a few places of entry into tool specific logic where this needs to be done, for example before installer is called... everything within install is related to one tool that is being install and so on

# Primary Objective

Add logger context with toolName at entry points to tool-specific operations, so ALL logging within those operations automatically includes `[toolName]` prefix.

# Open Questions

- [x] Scope clarified - this is about setting context at entry points, not just TrackedFileSystem

# Tasks

- [x] **TS001**: Identify entry points - Installer.install(), PluginRegistry.executeInstall(), generator methods, CLI handlers
- [x] **TS002**: Design solution - add `getSubLogger({ context: toolName })` at entry points
- [x] **TS003**: Remove manual `[toolName]` prefixing from log-messages.ts in registry package
- [x] **TS004**: Update TrackedFileSystem to pass logger with context via withToolName
- [x] **TS005**: Verify all tests pass
- [x] **TS006**: Update Installer.install() to set logger context with toolName
- [x] **TS007**: Verify all tests, lint, and typecheck pass
- [x] **TS008**: Mark acceptance criteria complete

# Acceptance Criteria

- [x] Primary objective is met
- [x] All temporary code is removed
- [x] All tasks are complete
- [x] Tests added for all new production features
- [x] Related READMEs and docs are updated
- [x] All code quality standards are met
- [x] All changes are checked into source control
- [x] All tests pass
- [x] All acceptance criteria are met
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree

# Change Log

- Initial task file created
- Removed manual `[toolName]` prefixing from registry/file/log-messages.ts
- Updated TrackedFileSystem.withToolName() to create sublogger with context
- Updated TrackedFileSystem log calls to remove toolName parameter (now handled by context)
- Updated Installer.install() to create logger with `context: toolName`
- All tests pass (1085 pass, 2 skip)
- Lint and typecheck pass
- Fixed SafeLogger.getSubLogger to not duplicate parent name when only context is provided
- Added `system` context to all system-level generators (ShimGenerator, ShellInitGenerator, SymlinkGenerator, GeneratorOrchestrator)
- Added `system` context to FileRegistry and ToolInstallationRegistry
- Removed unused `fs` parameter from GeneratorOrchestrator constructor
- Updated logger README with context documentation
- Final: All tests pass (1080 pass, 2 skip), lint and typecheck pass
