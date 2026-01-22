# Tool Review Analysis Summary

**Generated**: 2026-01-20\
**Last Updated**: 2026-01-22

## Overview

| Category   | Count  | Percentage |
| ---------- | ------ | ---------- |
| ✅ Passed  | 32     | 62%        |
| ❌ Failed  | 15     | 29%        |
| ⚠️ Warnings | 2      | 4%         |
| ⚠️ Missing  | 2      | 4%         |
| **Total**  | **52** | 100%       |

---

## Completed Fixes (Since Review)

The following system improvements have been implemented to address review findings:

### ✅ Asset Selection Improvements (`639d62ed`)

Enhanced `selectBestMatch` in `@dotfiles/arch` package:

- **Exclusion patterns**: Now automatically excludes `.sha256sum`, `.sig`, `.asc`, `buildable-artifact`, and other non-binary files
- **Platform prioritization**: Improved matching for platform-specific asset names
- **Affects**: caddy, zellij, nvim, onefetch, git-town, gitui (6 tools - 40% of failures)

### ✅ Single-File Gzip Support (`220c29c5`)

Added `gzip` format handling in `@dotfiles/archive-extractor`:

- **New format**: Supports `.gz` files that are single compressed binaries (not tarballs)
- **Auto-detection**: Integrated into GitHub release installer
- **Affects**: hermit (1 tool - 7% of failures)

### ✅ Completions Interface Cleanup (`b7b366f4`)

Simplified the `completions()` API in shell configurator:

- **Removed**: Complex `source` property with multiple sub-options
- **Simplified**: Direct `file`, `command`, `inline` options
- **Documentation**: Updated API reference and prompt templates
- **Affects**: gum warning (completion path handling)

---

## Success Categories

### By Installation Method

| Method              | Passed | Failed | Success Rate |
| ------------------- | ------ | ------ | ------------ |
| github-release      | 24     | 10     | 71%          |
| brew (formula/cask) | 6      | 0      | 100%         |
| cargo               | 1      | 0      | 100%         |
| curl-script         | 1      | 2      | 33%          |
| manual              | 0      | 1      | 0%           |
| config-only         | 2      | 0      | 100%         |

### Passing Tools by Type

**Core CLI Tools** (15): ast-grep, atuin, bat, btm, bun, eza, fd, fq, fzf, jq, rg, shfmt, yazi, yek, zoxide

**Development Tools** (7): gh, glow, lazydocker, lazygit, mods, restack, ruff

**Platform Tools (brew)** (6): aerospace, borders, glances, meetingbar, dtop, hwatch

**Shell/Runtime Tools** (3): oh-my-posh, rust, sentences

**Config-Only** (2): node, ssh-config portions

---

## Failure Pattern Analysis

### Pattern 1: Asset Selection Failures (6 tools - 40% of failures)

**Tools**: caddy, git-town, gitui, nvim, onefetch, zellij

**Root Cause**: Default asset pattern matching selects wrong file types:

- Source archives instead of binaries (`buildable-artifact`)
- Wrong platform (`linux` instead of `darwin`)
- Checksum files instead of binaries (`.sha256sum`)
- Non-standard naming conventions (`onefetch-mac.tar.gz`)

**Common Fix**: Add explicit `assetPattern` parameter:

```typescript
install('github-release', {
  repo: 'owner/tool',
  assetPattern: '*darwin*arm64*.tar.gz',
});
```

### Pattern 2: curl-script Binary Location (2 tools - 13% of failures)

**Tools**: fly, fnm

**Root Cause**: curl-script installer saves the installation script but binary doesn't end up in expected location. The staging directory handling doesn't capture the actual installed binary.

**Common Fix**: Review `args` callback to ensure binary is placed in `stagingDir`:

```typescript
install('curl-script', {
  url: '...',
  shell: 'bash',
  args: (ctx) => ['--install-dir', ctx.stagingDir],
});
```

### Pattern 3: Archive Format Handling (1 tool - 7% of failures)

**Tools**: hermit

**Root Cause**: Single-file `.gz` archives are not automatically extracted. The system expects tar archives but hermit distributes as `hermit-darwin-arm64.gz` (gzipped binary, not tarball).

**Common Fix**: Need special handling for single-file gzip or use `assetPattern` to prefer tarball if available.

### Pattern 4: Binary Name Mismatch (1 tool - 7% of failures)

**Tools**: grit

**Root Cause**: Binary inside archive has different name (`gouda`) than expected tool name (`grit`).

**Common Fix**: Use binary pattern in `.bin()`:

```typescript
.bin('grit', '**/gouda')
```

### Pattern 5: Manual Installation Failures (1 tool - 7% of failures)

**Tools**: ssh

**Root Cause**: Manual installation configuration doesn't properly set up the expected structure.

**Common Fix**: Review `binaryPath` configuration and ensure source files exist.

---

## Warning Analysis

### Warning 1: Missing Completion Files

**Tool**: gum

**Issue**: Completion file path changed between versions. Archive structure doesn't match configured path.

**Fix**: Update completion path or use glob pattern for flexibility.

### Warning 2: Hook Execution Errors

**Tool**: navi

**Issue**: JavaScript error in after-install hook (`f.text is not a function`).

**Fix**: Debug hook code - likely incorrect API usage in shell command handling.

---

## Recommendations

### High Priority (Affects Multiple Tools)

1. **Improve Default Asset Selection**
   - Add smarter platform detection in asset matching
   - Exclude common non-binary patterns by default (`.sha256sum`, `.sig`, `buildable-artifact`)
   - Prioritize assets with platform-specific names

2. **curl-script Installer Enhancement**
   - Better documentation on staging directory usage
   - Consider auto-detection of installed binary location

### Medium Priority

3. **Single-File Gzip Support**
   - Add automatic extraction for `.gz` files that aren't tarballs

4. **Completion Path Flexibility**
   - Support glob patterns in completion source paths
   - Fall back gracefully when completion files are missing

### Low Priority

5. **Binary Name Detection**
   - Consider auto-detecting executable files in archives when name doesn't match

---

## Outstanding Issues

### High Priority

#### curl-script Binary Location (2 tools)

**Tools**: fly, fnm\
**Status**: ❌ Not yet fixed\
**Tickets**: `717778e`, `c5b4582`, `81e0da8`, `336b0e1`, `f8b0f49`

The curl-script installer saves the installation script but binaries don't end up in the expected staging directory. Requires either:

- Tool config fix: Add `args: (ctx) => ['--install-dir', ctx.stagingDir]`
- System fix: Auto-detect installed binary location after script execution

#### Binary Name Mismatch (1 tool)

**Tools**: grit\
**Status**: ❌ Not yet fixed

Binary inside archive is named `gouda`, not `grit`. Requires:

- Tool config fix: `.bin('grit', '**/gouda')`
- Or system enhancement: Auto-detect single executable when pattern fails

#### Manual Installation (1 tool)

**Tools**: ssh\
**Status**: ❌ Not yet fixed

Manual installation configuration doesn't set up expected structure. Needs config review.

### Medium Priority

#### Hook Execution Error (1 tool)

**Tools**: navi\
**Status**: ⚠️ Tool works, hook fails

After-install hook fails with `f.text is not a function`. Likely incorrect shell command API usage.

### Pending Verification

The following tools should be re-tested after system fixes:

| Tool     | Original Issue          | Fix Applied        | Needs Re-test |
| -------- | ----------------------- | ------------------ | ------------- |
| caddy    | buildable-artifact      | Asset selection    | ✅            |
| zellij   | .sha256sum selected     | Asset selection    | ✅            |
| nvim     | linux instead of darwin | Asset selection    | ✅            |
| onefetch | Non-standard naming     | Asset selection    | ✅            |
| git-town | Asset selection failed  | Asset selection    | ✅            |
| gitui    | Asset selection failed  | Asset selection    | ✅            |
| hermit   | .gz not extracted       | Gzip support       | ✅            |
| gum      | Completion path missing | Completions API    | ✅            |

---

## Quick Reference: Remaining Fixes

| Tool | Fix Type         | Specific Fix                         | Owner       | Ticket    |
| ---- | ---------------- | ------------------------------------ | ----------- | --------- |
| fly  | curl-script args | Configure `--install-dir` to staging | Tool config | `81e0da8` |
| fnm  | curl-script args | Configure `--install-dir` to staging | Tool config | `81e0da8` |
| grit | bin pattern      | `.bin('grit', '**/gouda')`           | Tool config |           |
| ssh  | manual config    | Review binaryPath setup              | Tool config |           |
| navi | hook code        | Fix `f.text` API usage               | Tool config |           |

---

## Related Tickets

| Ticket    | Title                                            | Status |
| --------- | ------------------------------------------------ | ------ |
| `717778e` | curl-script: Add env parameter to schema         | open   |
| `c5b4582` | curl-script: Support dynamic env like args       | open   |
| `81e0da8` | curl-script: Remove hardcoded INSTALL_DIR        | open   |
| `336b0e1` | curl-script: Document stagingDir concept         | open   |
| `f8b0f49` | curl-script: Fix incorrect fly.io example in docs| open   |
| `9eadaf4` | install command should verify installation       | open   |
| `7e5bdb9` | remove branded types for always/once             | open   |
| `4fdc4fd` | utils tests should be moved to src               | open   |

---

## Documentation TODOs

### `packages/core/src/installer/installHooks.types.ts`

**Issue**: The JSDoc for `$` property is outdated:

```typescript
/**
 * Bun's shell executor for running shell commands...
 */
$: $extended;
```

**Needs update**:

1. Remove "Bun's" - it's no longer Bun-specific
2. Document what the default `cwd` (current working directory) is for shell commands
