---
# User Prompt
> Follow instructions in [new-feature.prompt.md](vscode-userdata:/Users/alex/Library/Application%20Support/Code/User/profiles/-4257d6dd/prompts/new-feature.prompt.md).
> remove these type aliases

# Source Branch
feature/2025-11-20/remove-install-hook-aliases

# Primary Objective
Remove the deprecated install hook type alias exports from `packages/core/src/installer/installHooks.types.ts`.

# Open Questions
- [ ] None

# Tasks
- [x] **TS001**: Remove deprecated install hook type aliases from `installHooks.types.ts`
- [x] **TS002**: Update all packages to rely on `IInstallContext`, `IDownloadContext`, `IExtractContext`, and `IAfterInstallContext` directly
- [x] **TS003**: Run `bun fix`, `bun lint`, `bun test`, and `bun typecheck` to verify changes

# Acceptance Criteria
- [x] Primary objective is met
- [x] All code quality standards are met
- [x] All tests pass
- [x] All tasks are complete
- [x] All acceptance criteria are met

# Change Log
- Created feature plan
- Completed TS001: Removed deprecated install hook type aliases
- Completed TS002: Replaced all deprecated alias usages across packages with canonical interface names
- Completed TS003: Ran all required checks - typecheck, lint, test all pass
---
