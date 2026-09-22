# pkg/installer

Tool installer plugins (github-release, curl-script, cargo, brew, apt, dnf, pacman, pkg, etc.).

## Commands

- Test: `go test ./pkg/installer/...`

## Local conventions

- Support slash-delimited `/pattern/flags` syntax across `compileRegex` and `MatchAssetPattern` for JavaScript `RegExp` interoperability.
- Homebrew installer (`BrewInstaller`): `trust` defaults to `false`. When `trust: true`, automatically trust configured `tap`(s) before tapping/installing.
- Always use the injected `fs.FS` (`ResolvedFS.IsAbs()` / `ResolvedFS.Abs()`) for resolving user/tool paths (such as `binaryPath` in manual installer) instead of raw stdlib `filepath.IsAbs`.
- Resolve a `binaryPath` install parameter only through `ResolveBinaryPath` (`binary_path.go`, v1 `expandToolConfigPath` rules), which `manual`, `curl-script` and the orchestrator share so the same value cannot mean different paths depending on who reads it.
- `curl-script` never searches system directories for a binary its script installed elsewhere. Without `binaryPath` the declared binaries must be in the staging directory; with it, the one declared binary is symlinked to the path as written (never copied, never to the path's resolved target) so self-updating tools stay current.
- Log `INFO` progress messages when fetching API releases, downloading assets, and extracting archives.
- Decide whether a download is an archive with `archive.IsSupported` / `archive.Extension`; never keep a local list of archive suffixes. Release installers (github-release, gitea-release) hand the downloaded asset to `releaseAssetInstaller` in `release_asset.go`, which extracts archives, installs extensionless assets as the binary, and fails on anything else (unextractable archive formats, checksums, packages) instead of chmod-ing them.
- `MatchAssetPattern` globs support minimatch-style brace alternation (`*.{tar.xz,zip}`) via `expandBraces` over `path.Match`, matching the v1 matcher.
- Implement installer plugins by satisfying the `Installer` interface in `pkg/installer/installer.go`.
- A `CheckUpdate` that has no way to learn the latest upstream version for the tool it was given returns `ErrUpdateCheckUnsupported`, never an empty `UpdateCheckResult`: callers report the sentinel as "update check not supported" (`tool update <tool>` then reinstalls, as v1 did, while updating everything skips unless `--force`; `tool check` and the dashboard say so), while an empty result reads as "up to date".
- `CargoInstaller.CheckUpdate` resolves the latest version through `resolveVersion`, the same `versionSource` dispatch `Install` uses (crates.io by default), and wraps a failed query as an error naming the tool. Keep one resolution path so a check never reports a version the install would not fetch.

## Local gotchas

- Unlogged network requests or asset downloads look like hung processes -> always log explicit progress steps (`Fetching release info...`, `Downloading...`, `Extracting...`).

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in installer test files for any installer modifications.
- Ask first: adding new installer plugin types or changing installer interface contracts.
- Never: perform silent background downloads without logging progress.

## References

- `pkg/installer/installer.go`
- `pkg/installer/github.go`
