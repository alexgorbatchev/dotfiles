# Tool Review Checklist

This document tracks the review status of `.tool.ts` files in the `review` folder against their original definitions.

**Review Date**: 2026-01-20  
**Reviewer**: GitHub Copilot (Claude Opus 4.5)

## Summary

- **Total Original Tools**: 48
- **Passed**: 28
- **Failed**: 15
- **Missing**: 2
- **Config-Only**: 3
- **Extra Tools (reviewed)**: 4 (all pass)

## Tools

| # | Tool | Status | Notes |
|---|------|--------|-------|
| 1 | aerospace | ✅ PASS | Brew cask, config-only (no binary) |
| 2 | ast-grep | ✅ PASS | Binary works: `ast-grep 0.40.5` |
| 3 | atuin | ✅ PASS | Binary works: `atuin 18.11.0` |
| 4 | bat | ✅ PASS | Binary works: `bat 0.26.1` |
| 5 | borders | ✅ PASS | Brew cask, config-only (no binary) |
| 6 | btm | ✅ PASS | Binary works: `bottom 0.12.3` |
| 7 | bun | ✅ PASS | Binary works: `1.3.6` |
| 8 | caddy | ❌ FAIL | Downloaded buildable-artifact source instead of binary |
| 9 | chatgpt | ✅ PASS | Binary works: `ChatGPT CLI v1.10.6` |
| 10 | dive | ✅ PASS | Binary works (uses config file) |
| 11 | eza | ✅ PASS | Binary works: `eza v0.23.4` |
| 12 | fd | ✅ PASS | Binary works: `fd 10.3.0` |
| 13 | fly | ❌ FAIL | curl-script didn't install binary, only script |
| 14 | fnm | ❌ FAIL | curl-script didn't install binary, only script |
| 15 | foobar | ⚠️ MISSING | No .tool.ts file exists |
| 16 | fq | ✅ PASS | Binary works: `0.16.0` |
| 17 | fzf | ✅ PASS | Binary works: `0.67.0` |
| 18 | gh | ✅ PASS | Binary works: `gh 2.85.0` |
| 19 | git-town | ❌ FAIL | Installation directory removed (asset selection failed) |
| 20 | gitui | ❌ FAIL | Installation directory removed (asset selection failed) |
| 21 | glow | ✅ PASS | Binary works: `glow 2.1.1` |
| 22 | grit | ❌ FAIL | Binary named `gouda` in archive, not `grit` |
| 23 | gum | ⚠️ WARN | Binary works but completion source not found |
| 24 | hermit | ❌ FAIL | Binary is still gzipped (not extracted) |
| 25 | jq | ✅ PASS | Binary works: `jq-1.8.1` |
| 26 | k9s | ✅ PASS | Binary works (uses `-v` not `--version`) |
| 27 | lazydocker | ✅ PASS | Binary works: `0.24.4` |
| 28 | lazygit | ✅ PASS | Binary works: `0.58.1` |
| 29 | mods | ✅ PASS | Binary works: `mods v1.8.1` |
| 30 | navi | ⚠️ WARN | Binary works, but after-install hook failed with `f.text is not a function` |
| 31 | node | ✅ PASS | Config-only (no binary, uses fnm) |
| 32 | nvim | ❌ FAIL | Downloaded linux binary instead of darwin |
| 33 | oh-my-posh | ✅ PASS | Binary works: `29.0.2` |
| 34 | onefetch | ❌ FAIL | Asset selection failed (uses `onefetch-mac.tar.gz` naming) |
| 35 | python | ⚠️ MISSING | No .tool.ts file exists |
| 36 | restack | ✅ PASS | Binary works: `restack 0.7.0` |
| 37 | rg | ✅ PASS | Binary works: `ripgrep 15.1.0` |
| 38 | ruff | ✅ PASS | Binary works: `ruff 0.14.13` |
| 39 | rust | ✅ PASS | curl-script (rustup) installed |
| 40 | sentences | ✅ PASS | Binary works: `1.1.2` |
| 41 | sgpt | ✅ PASS | Binary works (uses `-v` not `--version`) |
| 42 | shfmt | ✅ PASS | Binary works: `v3.12.0` |
| 43 | spf | ✅ PASS | Binary works: `superfile v1.5.0` |
| 44 | ssh | ❌ FAIL | Installation directory removed (failed) |
| 45 | yazi | ✅ PASS | Binary works: `Yazi 26.1.4` |
| 46 | yek | ✅ PASS | Binary works: `0.25.0` |
| 47 | zellij | ❌ FAIL | Downloaded sha256sum file instead of binary |
| 48 | zoxide | ✅ PASS | Binary works: `zoxide 0.9.8` |

## Missing Original Tools

The following original tools do not have corresponding `.tool.ts` files:
- `foobar` - Likely a test/example tool
- `python` - No implementation provided

## Extra Tools in Review

The following `.tool.ts` files exist in review but have no corresponding original (all tested and working):

| Tool | Status | Notes |
|------|--------|-------|
| dtop | ✅ PASS | Binary works: `dtop 0.6.7` |
| glances | ✅ PASS | Binary works: `Glances 4.4.1` (via brew) |
| hwatch | ✅ PASS | Binary works: `hwatch 0.3.19` |
| meetingbar | ✅ PASS | Brew cask, config-only (no binary) |
- `meetingbar/meetingbar.tool.ts`

## Detailed Failure Notes

### caddy
**Issue**: Downloaded `caddy_2.10.2_buildable-artifact.tar.gz` which is source code, not a prebuilt binary.
**Fix**: Needs `assetPattern` to select the correct binary archive (e.g., `*darwin*arm64*.tar.gz`).

### fly
**Issue**: curl-script installer downloaded the install script but didn't execute binary installation properly.
**Fix**: Review the curl-script configuration and staging directory handling.

### fnm
**Issue**: curl-script installer only saved the installation script, not the actual binary.
**Fix**: Review curl-script args or staging directory configuration.

### git-town
**Issue**: Asset selection failed, installation directory was removed.
**Fix**: Needs `assetPattern` to match git-town release assets.

### gitui
**Issue**: Asset selection failed, installation directory was removed.
**Fix**: Needs `assetPattern` to match gitui release assets.

### grit
**Issue**: Binary in archive is named `gouda`, not `grit`. Uses wrong GitHub repo for release.
**Fix**: Specify `.bin('grit', '**/gouda')` or correct the binary pattern.

### hermit
**Issue**: Downloads `.gz` file but doesn't extract it - binary remains compressed.
**Fix**: Need to handle single-file gzip archives differently.

### nvim
**Issue**: Asset pattern selected `nvim-linux-arm64.tar.gz` instead of darwin version.
**Fix**: Needs proper `assetPattern` for macOS: `*darwin*.tar.gz` or `*macos*.tar.gz`.

### onefetch
**Issue**: Default asset selection doesn't match `onefetch-mac.tar.gz` naming.
**Fix**: Needs `assetPattern: 'onefetch-mac.tar.gz'` for macOS.

### ssh
**Issue**: Installation failed, directory was removed.
**Fix**: Review manual installation configuration.

### zellij
**Issue**: Downloaded `.sha256sum` checksum file instead of the actual binary.
**Fix**: Needs `assetPattern` excluding `*.sha256sum` files.

## Warnings

### gum
**Issue**: Completion source file not found at expected path.
**Fix**: Review completion configuration - file path may have changed in newer releases.

### navi
**Issue**: after-install hook failed with `f.text is not a function`.
**Fix**: Review hook implementation - appears to be a code error in the hook.

## Legend

- ✅ PASS - Tool installs and binary executes correctly
- ❌ FAIL - Tool installation or binary execution failed
- ⚠️ WARN - Tool works but has warnings
- ⚠️ MISSING - Tool configuration file does not exist
