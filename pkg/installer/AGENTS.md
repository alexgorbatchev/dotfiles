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
- A cargo crate's latest version is its newest stable release unless the tool sets `prerelease: true`, which `resolveVersion` applies to the crates-io and github-releases sources (cargo-toml reads the one version its file declares): crates.io answers with `max_stable_version` (`max_version` only with `prerelease`) and a crate with no stable release is an error naming it; the `github-releases` source passes `prerelease` to `githubReleaseClient`, so `releaseEndpoint` decides exactly as it does for github-release. Never take crates.io `max_version` or `newest_version` as the default, and treat `max_version` `0.0.0` without a `max_stable_version` as crates.io's placeholder for a crate with no version.
- When a cargo prebuilt download fails, `cargoFallbackVersion` decides what the `cargo install` fallback compiles: the pinned version, else the resolved one when crates.io resolved it (`cargoVersion.published`) or the tool sets `prerelease`, provided it is an exact crate version (`isCrateVersion`, MAJOR.MINOR.PATCH[-pre], the only form `--version` takes without an operator); that version is returned as installed. A Cargo.toml or release-tag version without `prerelease` is never passed, since it need not be published. Otherwise cargo picks its own newest stable release, which a `prerelease` opt-in refuses with an error instead. crates.io answering that a crate has no installable version (`errNoCrateVersion`) fails the install without compiling.
- A cargo `github-releases` download of a version without a known tag (pinned by `.version()` or by `tool update`) tries each spelling from `releaseTagCandidates` (`v<version>`, then `<version>`) against the download URL itself, never the GitHub API, which is rate limited. Only a 404 (`downloader.StatusError`) moves on to the next spelling; any other failure is returned.
- `CargoInstaller` takes every host, token, cache and the User-Agent from `CargoSettings`, built only by `NewCargoSettings(projCfg)` and applied with `SetCargoSettings` wherever `SetGitHubSettings` is (install pipeline, `configureInstallerForUpdate`, the dashboard's `configureInstallers`, once at server start). Never add per-field URL overrides for tests; point the settings' hosts at an `httptest` server instead. A cargo token is only sent to the host it is configured for (a `cargoTomlUrl` elsewhere goes unauthenticated), and the crates.io/Cargo.toml response caches are keyed by URL alone.

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
