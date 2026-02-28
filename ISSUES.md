# Code Review Issues

Comprehensive code review performed 2026-02-27. All findings verified against source code with exact file paths and line numbers.

**Test Status**: 2454 tests pass, 0 failures across 254 test files.

---

## 1. Stub Implementations

### 1.1 BrewInstallerPlugin.checkUpdate() is a placeholder

- **File**: `packages/installer-brew/src/BrewInstallerPlugin.ts:120`
- **Current behavior**: Always returns `{ hasUpdate: false }` with a TODO comment and warning log. Does not query `brew info` or any other source.
- **Expected behavior**: Should run `brew info --json=v2 <formula>` to compare installed vs. latest version.
- **Why it matters**: Users relying on `dotfiles check-updates` will never be notified of Homebrew package updates.

### 1.2 ZshPluginInstallerPlugin.checkUpdate() is a placeholder

- **File**: `packages/installer-zsh-plugin/src/ZshPluginInstallerPlugin.ts:139`
- **Current behavior**: Always returns `{ hasUpdate: false, currentVersion: 'unknown' }` with a TODO comment.
- **Expected behavior**: Should run `git fetch` and compare HEAD vs. remote to detect new commits.
- **Why it matters**: Same impact as 1.1 but for zsh plugins. Update checking is completely non-functional for this installer type.

---

## 2. Unfinished Features

### ~~2.1 Completion command PATH separator is not multiplatform~~ FIXED

### ~~2.2 generateProfileHeader has unused parameter~~ FIXED

### ~~2.3 normalizeBinaries JSDoc references nonexistent parameter~~ FIXED

---

## 3. Commented-Out Code and Placeholder References

### ~~3.1 Commented-out cleanup handler in build script~~ FIXED

### ~~3.2 Placeholder GitHub issue URL in HookExecutor~~ FIXED

### 3.3 Dashboard Bun HTMLBundle workaround

- **File**: `packages/dashboard/src/server/dashboard-server.ts:22-31`
- **Current behavior**: Workaround for Bun bug #23431 generates explicit JS file routes to fix Content-Type headers. Comment says `TODO: Remove this workaround once the Bun bug is fixed`.
- **Expected behavior**: Periodically check if the Bun bug is resolved and remove the workaround.
- **Why it matters**: Technical debt that adds complexity to the dashboard server. The bug reference is valid (unlike 3.2) so this is trackable.

---

## 4. Optimization Opportunities

### ~~4.1 Hardcoded /usr/local/bin search path in curl-script installer~~ FIXED

### ~~4.2 Redundant `?? undefined` coalescing~~ FIXED

### ~~4.3 getCommentPrefix returns same value for all cases~~ FIXED

---

## 5. Test Coverage

### 5.1 Test Suite Summary

| Metric           | Value |
| ---------------- | ----- |
| Total test files | 254   |
| Total tests      | 2454  |
| Passing          | 2454  |
| Failing          | 0     |
| Snapshots        | 158   |

### 5.2 Packages with No Test Files

| Package             | Test Files | Notes                                                                         |
| ------------------- | ---------- | ----------------------------------------------------------------------------- |
| `registry-database` | 0          | Contains `RegistryDatabase` class with SQLite operations. Zero test coverage. |

### 5.3 Files with Low Line Coverage

| File                                                                   | Function % | Line % | Notes                                    |
| ---------------------------------------------------------------------- | ---------- | ------ | ---------------------------------------- |
| `shell-init-generator/src/shellTemplates.ts`                           | 42.86      | 48.84  | 7 of 12 exported functions uncovered     |
| `installer/src/utils/writeHookErrorDetails.ts`                         | 69.57      | 49.52  | Error detail formatting largely untested |
| `installer/src/utils/setupBinariesFromArchive.ts`                      | 92.31      | 63.95  | Archive binary setup edge cases untested |
| `shell-init-generator/src/formatters/BasePosixEmissionFormatter.ts`    | 50.00      | 100.00 | Only one of two methods called in tests  |
| `shell-init-generator/src/ShellInitGenerator.ts`                       | 80.00      | 72.00  | Several generation paths not covered     |
| `shell-init-generator/src/completion-generator/CompletionGenerator.ts` | 89.47      | 87.50  | Completion error paths uncovered         |
| `installer/src/utils/executeHooks.ts`                                  | 100.00     | 71.15  | Hook execution error paths not tested    |

### 5.4 Per-Package Coverage (from test run)

Most packages show strong coverage (>85% line coverage) for files that appear in the coverage report. The following packages have source files that did not appear in coverage output at all, suggesting they are only tested through integration or e2e tests rather than unit tests:

- `arch` - tested (5 test files) but coverage not reported in default run
- `config` - tested (9 test files) but coverage not reported
- `core` - tested (7 test files) but coverage not reported
- `dashboard` - tested (16 test files) but coverage not reported
- `downloader` - tested (7 test files) but coverage not reported
- `generator-orchestrator` - tested (7 test files) but coverage not reported

This is likely because `bun test --coverage` only reports coverage for files loaded during that specific test execution, and the parallel test runner distributes files across workers.
