# Task

> Add `shell.functions({ 'funcname': 'funcbody' })` API to shell-init-generator that generates shell functions with HOME override similar to `always` and `once`.

# Primary Objective

Implement `shell.functions()` API that allows defining shell functions where HOME is automatically overridden to the configured home path, consistent with `always` and `once` behavior.

# Analysis

## Current Architecture

- `IShellConfigurator` interface in `packages/core/src/builder/builder.types.ts` defines the API for shell configuration
- `ShellConfigurator` class in `packages/tool-config-builder/src/ShellConfigurator.ts` implements the interface
- `IShellStorage` in `packages/tool-config-builder/src/types.ts` holds accumulated shell config
- `AlwaysScriptFormatter` and `OnceScriptFormatter` wrap scripts in subshells with HOME override
- `BaseShellGenerator.generateToolSection()` formats always scripts using `AlwaysScriptFormatter`
- Shell types supported: zsh, bash, powershell

## How HOME Override Works

For zsh/bash always scripts:

```zsh
(
  HOME="{homeDir}"
  {scriptContent}
)
```

For powershell:

```powershell
$homeOrig = $env:HOME
$userProfileOrig = $env:USERPROFILE
try {
  $env:HOME = "{homeDir}"
  $env:USERPROFILE = "{homeDir}"
  {scriptContent}
} finally {
  $env:HOME = $homeOrig
  $env:USERPROFILE = $userProfileOrig
}
```

## Proposed Design for Functions

Shell functions need similar HOME override but in function body:

For zsh/bash:

```zsh
funcname() {
  (
    HOME="{homeDir}"
    {funcbody}
  )
}
```

For powershell:

```powershell
function funcname {
  $homeOrig = $env:HOME
  $userProfileOrig = $env:USERPROFILE
  try {
    $env:HOME = "{homeDir}"
    $env:USERPROFILE = "{homeDir}"
    {funcbody}
  } finally {
    $env:HOME = $homeOrig
    $env:USERPROFILE = $userProfileOrig
  }
}
```

# Open Questions

- [x] Should functions support multiple shells (zsh, bash, fish)? **YES - same as always/once**
- [x] Should the function body be shell-specific or generic? **Shell-specific via shell callback**

# Tasks

- [x] **TS001**: Analyze codebase to understand current architecture
- [x] **TS002**: Add `functions` property to `IShellStorage` interface
- [x] **TS003**: Add `functions()` method to `IShellConfigurator` interface
- [x] **TS004**: Implement `functions()` method in `ShellConfigurator` class
- [x] **TS005**: Add `IShellInitContent.functions` property
- [x] **TS006**: Create `FunctionScriptFormatter` to format functions with HOME override
- [x] **TS007**: Update `BaseShellGenerator.extractShellContent()` to extract functions
- [x] **TS008**: Update `BaseShellGenerator.generateToolSection()` to include functions
- [x] **TS009**: Add tests for all new functionality
- [x] **TS010**: Update documentation

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
- [x] `bun lint`, `bun typecheck` and `bun test` commands runs successfully in the new worktree.
- [x] `bun run build` completes successfully.
- [x] `.dist/cli.js` contains no external dependencies, you must not print its contents to console as it may be very large.
- [x] Use `bun test-project` to generate and install tools, verify `.generated` directory is created correctly.
- [x] Tests do not print anything to console.

# Change Log

- Initial task file created
- Implemented `shell.functions()` API with HOME override for all shells (zsh, bash, powershell)
- Created `FunctionScriptFormatter` class with shell-specific formatting
- Added tests for `FunctionScriptFormatter` and integration tests
- Updated shell-integration.md documentation with `.functions()` method
