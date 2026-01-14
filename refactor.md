# Logger Context Propagation Refactor

## Problem Statement

The logging architecture has a **temporal mismatch**: services are created once at CLI startup (before tool names are known), but tool context is only available at command execution time.

### Current Broken Flow

```
CLI Startup
    ↓
setupServices() → ALL services created with parentLogger (NO tool context)
    ↓
Services store logger in constructor:
  - HookExecutor.logger = parentLogger.getSubLogger({ name: 'HookExecutor' })
  - Plugins store this.logger in constructor
  - Downloader.logger = parentLogger.getSubLogger({ name: 'Downloader' })
  - ArchiveExtractor.logger = parentLogger.getSubLogger({ name: 'ArchiveExtractor' })
    ↓
User runs: dotfiles install ripgrep  ← toolName FIRST KNOWN HERE
    ↓
Installer.install(toolName, ...)
  → Creates logger WITH context: getSubLogger({ name: 'install', context: toolName })
    ↓
BUT: Calls to HookExecutor, Plugins, Downloader use PRE-STORED loggers (no context)
```

### Symptoms

- Hook execution logs show `[hookName]` but NOT `[toolName]`
- Plugin logs don't show which tool they're installing
- Download/extract logs don't show which tool the operation is for
- Inconsistent log output makes debugging difficult

### Current Inconsistent Patterns

| Component                             | Has Tool Context? | Pattern                                    |
| ------------------------------------- | ----------------- | ------------------------------------------ |
| `Installer.install()`                 | ✅ Yes            | `getSubLogger({ context: toolName })`      |
| `ShimGenerator.generateForTool()`     | ✅ Yes            | `getSubLogger({ context: toolName })`      |
| `SymlinkGenerator.generateForTool()`  | ✅ Yes            | `getSubLogger({ context: toolName })`      |
| `CurlScriptInstallerPlugin.install()` | ✅ Yes            | `getSubLogger({ context: toolName })`      |
| `HookExecutor.executeHook()`          | ❌ No             | Uses stored logger                         |
| `InstallerPluginRegistry.install()`   | ❌ No             | Creates sublogger without context          |
| `CurlTarInstallerPlugin.install()`    | ❌ No             | Uses `this.logger` directly                |
| `GitHubReleaseInstallerPlugin`        | ❌ No             | Uses logger param but caller lacks context |
| `Downloader.download()`               | ❌ No             | Uses stored logger                         |
| `ArchiveExtractor.extract()`          | ❌ No             | Uses stored logger                         |

---

## Solution: Required Logger Injection

### Core Principle

**Tool-specific operations must receive a logger with tool context as a REQUIRED parameter.**

Classes should NOT store loggers for tool-specific operations. Instead:

1. Caller creates a logger with `{ context: toolName }`
2. Caller passes it as a required parameter
3. Callee creates sublogger with `{ name: 'methodName' }` from the passed logger

### What Changes

| Component                               | Before                   | After                                |
| --------------------------------------- | ------------------------ | ------------------------------------ |
| Plugin constructors                     | Store `this.logger`      | Remove logger storage (for tool ops) |
| `IInstallerPlugin.install()`            | Has `parentLogger` param | Keep (already correct)               |
| `InstallerPluginRegistry.install()`     | No logger param          | Add required `parentLogger`          |
| `Installer.executeInstallationMethod()` | Ignores logger           | Pass contextual logger to registry   |
| `HookExecutor` constructor              | Stores logger            | Remove logger storage                |
| `HookExecutor.executeHook()`            | No logger param          | Add required `parentLogger`          |
| `HookExecutor.executeHooks()`           | No logger param          | Add required `parentLogger`          |
| `Installer.handleInstallEvent()`        | Uses this.hookExecutor   | Pass contextual logger               |
| `Downloader` constructor                | Stores logger            | Keep for system ops only             |
| `Downloader.download()`                 | Uses stored logger       | Add required `parentLogger`          |
| `ArchiveExtractor` constructor          | Stores logger            | Keep for system ops only             |
| `ArchiveExtractor.extract()`            | Uses stored logger       | Add required `parentLogger`          |

### Classes That Legitimately Keep Stored Loggers

These do system-level operations without tool context:

- `Installer` constructor → class-level logging
- `GeneratorOrchestrator` → `generateAll` overview (individual tools add context)
- CLI commands → command registration, validation

---

## Implementation Tasks

### Task 1: Update HookExecutor

**Status**: ✅ Completed
**Files**:

- `packages/installer/src/utils/HookExecutor.ts`
- `packages/installer/src/utils/__tests__/HookExecutor*.test.ts`

**Changes**:

1. Remove `this.logger` storage from constructor (keep `writeOutput` storage)
2. Add required `parentLogger: TsLogger` parameter to `executeHook()`
3. Add required `parentLogger: TsLogger` parameter to `executeHooks()`
4. Add required `parentLogger: TsLogger` parameter to `createEnhancedContext()`
5. Update all test files to pass logger parameter

---

### Task 2: Update Installer to Pass Logger to HookExecutor

**Status**: ✅ Completed
**Files**:

- `packages/installer/src/Installer.ts`
- `packages/installer/src/__tests__/Installer*.test.ts`

**Changes**:

1. In `handleInstallEvent()`: Extract logger from `event.context.logger` and pass to `hookExecutor.executeHook()`
2. In `executeBeforeInstallHook()`: Pass contextual logger to `hookExecutor.executeHook()`
3. In `executeAfterInstallHook()`: Pass contextual logger to `hookExecutor.executeHook()`
4. In `createBaseInstallContext()`: Ensure logger is included in context for event handler access

---

### Task 3: Update InstallerPluginRegistry

**Status**: ✅ Completed
**Files**:

- `packages/core/src/InstallerPluginRegistry.ts`
- `packages/core/src/__tests__/InstallerPluginRegistry.test.ts`

**Changes**:

1. Add required `parentLogger: TsLogger` parameter to `install()` method
2. Use `parentLogger.getSubLogger({ name: 'install' })` instead of `this.logger.getSubLogger()`
3. Pass logger to `plugin.install()` (already has param, just needs correct value)
4. Update tests to pass logger parameter

---

### Task 4: Update Installer to Pass Logger to Registry

**Status**: ✅ Completed
**Files**:

- `packages/installer/src/Installer.ts`

**Changes**:

1. In `executeInstallationMethod()`: Pass contextual logger to `this.registry.install()`
2. Remove the unused `_logger` parameter pattern

---

### Task 5: Update Downloader

**Status**: ✅ Completed (with modified approach)
**Files**:

- `packages/downloader/Downloader.ts`
- `packages/downloader/IDownloader.ts`
- `packages/downloader/__tests__/Downloader*.test.ts`

**Changes**:

1. Add required `parentLogger: TsLogger` parameter to `download()` method in interface
2. Update implementation to use passed logger instead of stored logger for download operations
3. Keep stored logger only for constructor/system-level logging
4. Update all tests to pass logger parameter

---

### Task 5.1: Add Logger Assertions to Modified Tests

**Status**: ✅ Completed
**Files**:

- `packages/downloader/__tests__/Downloader.test.ts`
- `packages/downloader/__tests__/Downloader--cached.test.ts`
- `packages/symlink-generator/src/__tests__/SymlinkGenerator.test.ts`
- `packages/core/src/context/__tests__/createToolConfigContext.test.ts` (already had logger.expect)
- `packages/installer/src/__tests__/downloadWithProgress.test.ts`
- `packages/installer-github/src/github-client/__tests__/GitHubApiClient--getLatestRelease.test.ts`
- `packages/installer-github/src/github-client/__tests__/GitHubApiClient--getReleaseByTag.test.ts`
- `packages/installer-github/src/github-client/__tests__/GitHubApiClient--getReleaseByConstraint.test.ts`
- `packages/installer-github/src/github-client/__tests__/GitHubApiClient--getRateLimit.test.ts`
- `packages/installer-github/src/github-client/__tests__/GitHubApiClient--getAllReleases.test.ts`
- `packages/installer-github/src/github-client/__tests__/GitHubApiClient--customHost.test.ts`

**Changes**:

1. Added `logger.expect()` assertion to verify logger is receiving calls in each test
2. Piggybacked on existing tests (no separate test needed)

---

### Task 5.2: Integration Test for Logger Context Propagation (Install Command)

**Status**: ✅ Completed
**Files**:

- `packages/installer/src/__tests__/Installer--logger-context-propagation.test.ts`

**Changes**:

1. Created integration test to verify tool name context flows through all services
2. Tests verify context propagation to:
   - InstallerPluginRegistry.install
   - HookExecutor (before-install, after-download, after-extract, after-install)
   - createBinaryEntrypoints
3. Uses `logger.expect(levels, path, [context], matchers)` to verify `[toolName]` prefix appears in logs
4. Ensures consistent context across entire installation lifecycle

---

### Task 5.3: Integration Test for Logger Context Propagation (Update Command)

**Status**: ✅ Completed
**Files**:

- `packages/cli/src/__tests__/updateCommand--logger-context-propagation.test.ts`

**Changes**:

1. Create integration test to verify tool name context flows through update command
2. Tests verify context propagation to:
   - VersionChecker operations
   - Installer.install (reuses install flow)
3. Verify `[toolName]` prefix appears in logs for update-specific operations
4. Test both successful update and "already up to date" scenarios

---

### Task 5.4: Integration Test for Logger Context Propagation (Check-Updates Command)

**Status**: ✅ Completed
**Files**:

- `packages/cli/src/__tests__/checkUpdatesCommand--logger-context-propagation.test.ts`

**Changes**:

1. Create integration test to verify tool name context flows through check-updates command
2. Tests verify context propagation to:
   - Version checking per tool
   - Plugin.resolveVersion calls
3. Verify `[toolName]` prefix appears in logs when checking single tool
4. Verify per-tool context when checking all tools

---

### Task 5.5: Integration Test for Logger Context Propagation (Generate Command)

**Status**: ✅ Completed
**Files**:

- `packages/generator-orchestrator/src/__tests__/GeneratorOrchestrator--logger-context-propagation.test.ts`

**Changes**:

1. Create integration test to verify tool name context flows through generation
2. Tests verify context propagation to:
   - ShimGenerator.generateForTool
   - SymlinkGenerator.generateForTool
   - ShellInitGenerator (per-tool operations)
3. Verify `[toolName]` prefix appears in logs for each tool's generation
4. Ensure consistent context when generating for multiple tools

---

### Task 5.6: Integration Test for Logger Context Propagation (Files Command)

**Status**: ✅ Completed
**Files**:

- `packages/cli/src/__tests__/filesCommand--logger-context-propagation.test.ts`

**Changes**:

1. Create integration test to verify tool name context flows through files command
2. Tests verify context propagation when displaying files for a specific tool
3. Verify `[toolName]` prefix appears in logs during file tree building

---

### Task 5.7: Integration Test for Logger Context Propagation (Cleanup Command)

**Status**: ✅ Completed
**Files**:

- `packages/cli/src/__tests__/cleanupCommand--logger-context-propagation.test.ts`

**Changes**:

1. Create integration test to verify tool name context flows through cleanup command
2. Tests verify context propagation to:
   - Per-tool cleanup operations
   - FileRegistry operations per tool
3. Verify `[toolName]` prefix appears in logs when cleaning up specific tool
4. Verify per-tool context when cleaning all tools

---

### Task 6: Update ArchiveExtractor

**Status**: ✅ Completed
**Files**:

- `packages/archive-extractor/src/ArchiveExtractor.ts`
- `packages/archive-extractor/src/IArchiveExtractor.ts`
- `packages/archive-extractor/src/__tests__/ArchiveExtractor*.test.ts`

**Changes**:

1. Add required `parentLogger: TsLogger` parameter to `extract()` method in interface
2. Update implementation to use passed logger
3. Update all tests to pass logger parameter

---

### Task 7: Update All Installer Plugins - Remove Stored Logger

**Status**: ✅ Completed
**Files**:

- `packages/installer-github/src/GitHubReleaseInstallerPlugin.ts`
- `packages/installer-cargo/src/CargoInstallerPlugin.ts`
- `packages/installer-curl-tar/src/CurlTarInstallerPlugin.ts`
- `packages/installer-curl-script/src/CurlScriptInstallerPlugin.ts`
- `packages/installer-brew/src/BrewInstallerPlugin.ts`
- `packages/installer-manual/src/ManualInstallerPlugin.ts`
- All associated test files

**Changes for each plugin**:

1. Remove `this.logger` from constructor (if used for tool operations)
2. Use the `parentLogger` parameter in `install()` method exclusively
3. Pass logger to Downloader.download() and ArchiveExtractor.extract() calls
4. Update tests

---

### Task 8: Update Plugin Callers (Downloader/Extractor calls)

**Status**: ✅ Completed
**Files**:

- `packages/installer-github/src/installFromGitHubRelease.ts`
- `packages/installer-cargo/src/installFromCargo.ts`
- `packages/installer-curl-tar/src/installFromCurlTar.ts`
- `packages/installer-curl-script/src/installFromCurlScript.ts`

**Changes**:

1. Pass logger to all `downloader.download()` calls
2. Pass logger to all `archiveExtractor.extract()` calls

---

### Task 9: Update CLI main.ts Constructor Calls

**Status**: ✅ Completed
**Files**:

- `packages/cli/src/main.ts`

**Changes**:

1. Remove logger from HookExecutor constructor (if applicable after Task 1)
2. Verify all service construction is correct
3. No logger removal needed for services that legitimately use system-level logging

---

### Task 10: Final Verification

**Status**: ✅ Completed

**Checks**:

1. Run `bun typecheck` - all types pass
2. Run `bun test` - all tests pass
3. Run `bun lint` - no linting errors
4. Manual test: `bun cli --config=test-project/config.ts install ripgrep --log=debug`
5. Verify logs show `[toolName]` prefix consistently

---

## Verification Criteria

After refactor, running `dotfiles install ripgrep` should produce logs like:

```
[ripgrep] Installing tool...
[ripgrep] Downloading from https://...
[ripgrep] Extracting archive...
[ripgrep][after-download] Executing hook...
[ripgrep][after-extract] Executing hook...
[ripgrep] Installation complete
```

NOT like (current broken state):

```
Installing tool...
Downloading from https://...
Extracting archive...
[after-download] Executing hook...    ← Missing [ripgrep]
[after-extract] Executing hook...     ← Missing [ripgrep]
Installation complete
```

---

## Task Dependencies

```
Task 1 (HookExecutor) ──────────────────┐
                                        ├──→ Task 2 (Installer→HookExecutor)
Task 3 (InstallerPluginRegistry) ───────┤
                                        ├──→ Task 4 (Installer→Registry)
Task 5 (Downloader) ────────────────────┤
                                        ├──→ Task 8 (Plugin callers)
Task 6 (ArchiveExtractor) ──────────────┤
                                        │
Task 7 (Plugins remove stored logger) ──┘

Task 9 (CLI main.ts) ← depends on Tasks 1-8

Integration Tests (can run after core refactor):
Task 5.2 (Install context) ✅
Task 5.3 (Update context) ← depends on Task 5.2 pattern
Task 5.4 (Check-Updates context) ← depends on Task 5.2 pattern
Task 5.5 (Generate context) ← depends on Task 5.2 pattern
Task 5.6 (Files context) ← depends on Task 5.2 pattern
Task 5.7 (Cleanup context) ← depends on Task 5.2 pattern

Task 10 (Verification) ← depends on all
```

Recommended order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 5.3-5.7 → 10

---

## Phase 2: CLI Command Logger Context

### Problem

CLI commands embed tool names in log messages but don't set logger context.

**Current broken pattern:**

```typescript
// In filesCommand.ts
logger.error(messages.toolNotFound(toolName, source)); // toolName embedded in message
```

**Expected pattern:**

```typescript
const toolLogger = logger.getSubLogger({ context: toolName });
toolLogger.error(messages.toolNotFound(source)); // toolName comes from context
```

---

### Task 11: Update filesCommand Logger Context

**Status**: ⏳ In Progress
**Files**:

- `packages/cli/src/filesCommand.ts`
- `packages/cli/src/log-messages.ts`
- `packages/cli/src/__tests__/filesCommand--logger-context-propagation.test.ts`

**Changes**:

1. Create sublogger with `{ context: toolName }` when toolName is known
2. Update log messages to remove embedded tool name
3. Update tests to verify context is set

---

### Task 12: Update cleanupCommand Logger Context

**Status**: ⏳ Not Started
**Files**:

- `packages/cli/src/cleanupCommand.ts`
- `packages/cli/src/log-messages.ts`
- `packages/cli/src/__tests__/cleanupCommand--logger-context-propagation.test.ts`

**Changes**:

1. Create sublogger with `{ context: toolName }` for per-tool cleanup operations
2. Update log messages to remove embedded tool name
3. Update tests to verify context is set

---

### Task 13: Update checkUpdatesCommand Logger Context

**Status**: ⏳ Not Started
**Files**:

- `packages/cli/src/checkUpdatesCommand.ts`
- `packages/cli/src/log-messages.ts`
- `packages/cli/src/__tests__/checkUpdatesCommand--logger-context-propagation.test.ts`

**Changes**:

1. Create sublogger with `{ context: toolName }` for per-tool operations
2. Update log messages to remove embedded tool name
3. Update tests to verify context is set

---

### Task 14: Update updateCommand Logger Context

**Status**: ⏳ Not Started
**Files**:

- `packages/cli/src/updateCommand.ts`
- `packages/cli/src/log-messages.ts`
- `packages/cli/src/__tests__/updateCommand--logger-context-propagation.test.ts`

**Changes**:

1. Create sublogger with `{ context: toolName }` when toolName is known
2. Update log messages to remove embedded tool name
3. Update tests to verify context is set

---

### Task 15: Final Verification (Phase 2)

**Status**: ⏳ Not Started

**Checks**:

1. Run `bun typecheck` - all types pass
2. Run `bun test` - all tests pass
3. Run `bun lint` - no linting errors
4. Manual test: verify `[toolName]` prefix appears in CLI command logs
