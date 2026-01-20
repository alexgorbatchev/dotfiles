# Tool Review Analysis Summary

**Generated**: 2026-01-20

## Overview

| Category | Count | Percentage |
|----------|-------|------------|
| ✅ Passed | 32 | 62% |
| ❌ Failed | 15 | 29% |
| ⚠️ Warnings | 2 | 4% |
| ⚠️ Missing | 2 | 4% |
| **Total** | **52** | 100% |

## Success Categories

### By Installation Method

| Method | Passed | Failed | Success Rate |
|--------|--------|--------|--------------|
| github-release | 24 | 10 | 71% |
| brew (formula/cask) | 6 | 0 | 100% |
| cargo | 1 | 0 | 100% |
| curl-script | 1 | 2 | 33% |
| manual | 0 | 1 | 0% |
| config-only | 2 | 0 | 100% |

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
})
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
})
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

## Quick Reference: Fixes Needed

| Tool | Fix Type | Specific Fix |
|------|----------|--------------|
| caddy | assetPattern | `*darwin*arm64*.tar.gz` |
| fly | curl-script args | Configure `--install-dir` to staging |
| fnm | curl-script args | Configure `--install-dir` to staging |
| git-town | assetPattern | Add darwin/arm64 pattern |
| gitui | assetPattern | Add darwin/arm64 pattern |
| grit | bin pattern | `.bin('grit', '**/gouda')` |
| hermit | archive handling | Handle single-file gzip |
| nvim | assetPattern | `*macos*arm64*.tar.gz` |
| onefetch | assetPattern | `onefetch-mac.tar.gz` |
| ssh | manual config | Review binaryPath setup |
| zellij | assetPattern | Exclude `*.sha256sum` |
| gum | completions | Update completion path |
| navi | hook code | Fix `f.text` API usage |

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
