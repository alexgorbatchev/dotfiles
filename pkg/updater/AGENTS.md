# pkg/updater

Self-update engine for the `dotfiles` CLI binary from GitHub Releases.

## Core Responsibilities

- `CheckForUpdate(ctx, opts)`: Queries GitHub Releases API (`alexgorbatchev/dotfiles`), compares semver against `main.Version`, and evaluates update status.
- `Upgrade(ctx, opts)`: Downloads release archives (`dotfiles_<version>_<os>_<arch>.tar.gz`) and `checksums.txt`, verifies SHA-256 integrity, extracts binary, and performs atomic binary replacement at `os.Executable()`.
- `replace_unix.go` & `replace_windows.go`: Handles platform-specific atomic binary replacement and backup swaps.

## Local conventions

- Standard library HTTP and `pkg/downloader` for file downloads and checksum verification.
- Unit tests use `httptest.NewServer` and mock release payloads.
- The release archive is read and the new binary written through the `Config.FS` file system, so a test injects write failures by wrapping `fs.NewOSFS()` (`closeFailFS` in `updater_test.go`) instead of a production test branch. The decompression limit is a parameter of `extractBinaryFromTarGz`, so a test exercises it with a small archive rather than a 100MB fixture.
- Maintain minimum 90% statement/line coverage.

## Local gotchas

- The extracted binary is renamed over the running executable and nothing checks it afterwards, so its write must be all-or-nothing: an entry larger than `maxBinaryDecompressedSize` is rejected with `ErrBinaryTooLarge` from its tar header before anything is written (never truncated with `io.LimitReader`), and a failed copy or close (`fs.WriteAndClose`) removes the file and fails the upgrade.

## Boundaries

- Always: wrap errors with context (`fmt.Errorf("...: %w", err)`).
- Never: modify running binary without checksum validation.
