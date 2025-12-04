# User Prompt
> currently a symlink for completions is named using toolName, which is basically tool file name, however when toolName doesn't match bin, we get incorrect symlink name and completions obviously will not work, we need to optional `bin` here which would be used to name completions files correctly based on shell

# Primary Objective
Fix completion symlink naming to use the binary name instead of the tool name when they differ, ensuring shell completions work correctly.

# Open Questions
- [ ] None at this time

# Tasks
- [x] **TS001**: Identify the root cause of the problem
- [x] **TS002**: Create a failing test to isolate the problem, if unable to create a failing test STOP and report to the user
- [x] **TS003**: Confirm the root cause of the problem based on the failing test
- [x] **TS004**: Think very hard, step by step, to identify a solution, then STOP and:
    - Describe the problem as you understand it
    - Describe proposed solution
    - Iterate with the user on proposed solution
- [x] **TS005**: Write down follow up tasks needed to implement the solution
- [x] **TS006**: Add `bin` field to `shellCompletionConfigSchema` in core package
- [x] **TS007**: Add `bin` to `IShellCompletionConfigOptions` in builder types
- [x] **TS008**: Update `CompletionGenerator.generateCompletionFilename()` to use `config.bin`
- [x] **TS009**: Update tests to use `config.bin` instead of `context.binName`
- [x] **TS010**: Run full test suite and fix any issues
- [x] **TS011**: Update documentation

## TS004 Solution Proposal

### Problem Description

When a tool file is named differently from its binary (e.g., `curl-script--fnm.tool.ts` defines binary `fnm`), the completion file gets incorrectly named after the tool file name (`_curl-script--fnm`) instead of the binary name (`_fnm`). Shell completion systems expect filenames to match the binary for automatic loading.

### Proposed Solution (Updated based on user feedback)

Add a `bin` property to `ShellCompletionConfig` that specifies which binary the completion is for. This is more explicit and user-friendly than inferring from context.

**Usage:**
```typescript
.completions({ cmd: 'fnm completions --shell zsh', bin: 'fnm' })
```

### Implementation Details

1. `packages/core/src/tool-config/shell/shellCompletionConfigSchema.ts` - Add `bin` field to schema
2. `packages/core/src/builder/builder.types.ts` - Add `bin` to `IShellCompletionConfigOptions`
3. `packages/shell-init-generator/src/completion-generator/CompletionGenerator.ts` - Use `config.bin` in filename generation

### Priority Order for Completion Filename

1. Custom `name` in completion config (highest - explicit full filename)
2. `bin` from completion config (new - binary name for shell-specific naming)
3. `toolName` (fallback - existing behavior)

### Design Rationale

- `name` = explicit full filename override (e.g., `_my-custom-name`)
- `bin` = binary name, shell-specific naming applied (e.g., `bin: 'fnm'` → `_fnm` for zsh, `fnm.bash` for bash)
- No `bin` = falls back to toolName for backward compatibility

## TS001 Analysis

### Root Cause Identified

The issue is in `CompletionGenerator.generateCompletionFilename()` method in `packages/shell-init-generator/src/completion-generator/CompletionGenerator.ts`:

```typescript
private generateCompletionFilename(customName: string | undefined, toolName: string, shellType: ShellType): string {
  if (customName) {
    return customName;
  }

  switch (shellType) {
    case 'zsh':
      return `_${toolName}`;  // <-- Uses toolName (e.g., 'curl-script--fnm') not bin name (e.g., 'fnm')
    case 'bash':
      return `${toolName}.bash`;
    case 'powershell':
      return `${toolName}.ps1`;
    default:
      return `${toolName}.${shellType}`;
  }
}
```

### Call Chain

1. `GeneratorOrchestrator.generateCompletionsForTool()` calls `completionGenerator.generateAndWriteCompletionFile(completionConfig, toolName, shellType, context)`
2. `CompletionGenerator.generateAndWriteCompletionFile()` calls `generateCompletionFile(config, toolName, ...)`
3. `generateCompletionFile()` (via `generateFromCommand` or `generateFromSource`) calls `generateCompletionFilename(config.name, toolName, shellType)`
4. If `config.name` is not provided, the filename defaults to `_${toolName}` for zsh

### The Problem

When a tool file is named `curl-script--fnm.tool.ts` but the binary is `fnm`, the completion file gets named `_curl-script--fnm` instead of `_fnm`. Shell completion systems expect the filename to match the binary name (e.g., `_fnm` for zsh).

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
- TS001: Identified root cause - `generateCompletionFilename()` uses `toolName` not binary name
- TS002, TS003: Created failing tests demonstrating the issue
- TS004: Solution proposal updated based on user feedback to use `config.bin` instead of `context.binName`
- TS006-TS011: Implemented `bin` field in schema, types, generator, and documentation
