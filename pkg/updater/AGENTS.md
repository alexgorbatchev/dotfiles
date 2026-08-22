# pkg/updater

Self-update engine for the `dotfiles` CLI binary from GitHub Releases.

## Core Responsibilities

- `CheckForUpdate(ctx, opts)`: Queries GitHub Releases API (`alexgorbatchev/dotfiles`), compares semver against `main.Version`, and evaluates update status.
- `Upgrade(ctx, opts)`: Downloads release archives (`dotfiles_<version>_<os>_<arch>.tar.gz`) and `checksums.txt`, verifies SHA-256 integrity, extracts binary, and performs atomic binary replacement at `os.Executable()`.
- `replace_unix.go` & `replace_windows.go`: Handles platform-specific atomic binary replacement and backup swaps.

## Local conventions

- Standard library HTTP and `pkg/downloader` for file downloads and checksum verification.
- Unit tests use `httptest.NewServer` and mock release payloads.
- Maintain minimum 90% statement/line coverage.

## Boundaries

- Always: wrap errors with context (`fmt.Errorf("...: %w", err)`).
- Never: modify running binary without checksum validation.
