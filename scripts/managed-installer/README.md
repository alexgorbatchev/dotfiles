# Managed Installer

Everything related to the hosted bootstrap installer lives here.

Files:

- `install.sh`: source of truth for the hosted installer
- `test.sh`: scenario runner for local validation
- `install_test.go`: isolated release download and checksum tests, included in `just test-unit`
- `harness_test.go`: scenario workspace cleanup tests, included in `just test-unit`
- `fixtures/`: scenario inputs copied into temp workspaces by `test.sh`

The docs site publishes `install.sh` to `packages/docs/public/install.sh` during `packages/docs/sync.ts`.

The installer resolves a release once and downloads its archive and `checksums.txt` from that pinned release. Before extraction, it requires exactly one valid SHA-256 entry for the archive and verifies the downloaded bytes with `sha256sum` or `shasum`. Missing or ambiguous metadata, a failed verifier, or a mismatch stops the bootstrap and removes its temporary files. The executable `DOTFILES_BINARY_PATH` override bypasses release downloads and remains the caller's responsibility. Published checksums detect damaged or substituted archive bytes; they are not an independent publisher signature.

Run `bash scripts/managed-installer/test.sh download-checksums` for download tests without building `.dist`. These tests mock the release transport and platform, hash actual archive bytes, and cover Linux/macOS targets, explicit/latest versions, malformed/missing/duplicate checksums, download/verifier failures, local overrides and cancellation cleanup. All invalid cases assert that extraction and execution never occur. `test.sh all` also runs the existing configuration scenarios against the local distributable.

Scenario workspaces are removed on success, failure and cancellation. Pass `--keep` to preserve a workspace for inspection. Lifecycle tests exercise both policies in an isolated fixture repository, preserving unrelated scratch.

Validation uses a copied docs workspace through `just typecheck`; it does not rewrite the developer's published installer asset.
