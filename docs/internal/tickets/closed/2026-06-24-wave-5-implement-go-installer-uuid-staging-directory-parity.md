---
created_on: 2026-06-24 19:15
last_modified: 2026-06-24 19:15
status: current
ticket_status: open
---

# Wave 5: Implement Go Installer UUID Staging Directory Parity

## Problem

During dry-runs and standard installations, Go's orchestrator dynamically configures target installation directories directly to the stable `/current` folder.

- **The Gap:** TypeScript's orchestrator creates a temporary, uniquely-named staging directory using a randomly-generated UUID (e.g., `binaries/zsh-plugin--zsh-vi-mode/eb2fd077-a1fc-468e-9e22-32c9c6fd7d50`), performs all repository checkout, download, and layout verification tasks inside that UUID directory, and only promotes it to `/current` via atomic filesystem renames upon successful completion.
- **The Consequences:** This architectural mismatch causes dry-run validations to diverge. The dual-run parity verification harness (`bun check:ci`) fails because the generated files list and directory structures in `.generated/ts/` (which contains UUID subfolders) do not match `.generated/go/` (which directly targets `current`).

## Why this matters

Adopting staging subdirectories provides atomic isolation during installations. If a checkout or extraction fails midway, the stable `/current` folder remains untouched and uncorrupted. Bringing Go into directory-layout parity ensures that the dual-run verification suite (`bun check:ci`) passes flawlessly and guarantees production durability when migrating users from TS to Go.

## Observed context

- Specified in `packages/installer/src/Installer.ts` and `packages/installer-zsh-plugin/src/installFromZshPlugin.ts`.
- Codebase files affected:
  - `pkg/orchestrator/orchestrator.go` (refactor dynamic `toolDestDir` setup to use UUID staging and atomic linking)
  - `pkg/installer/zsh_plugin.go` (and other installers, ensuring they install to staging and are renamed to current)

## Desired outcome

Go's installation pipeline uses identical UUID-based staging and transactional renaming behavior, resulting in 100% path parity in `db_file_operations.json` and directory listings, resolving the parity discrepancies during dual-runs.

## Acceptance criteria

- [ ] Modify `pkg/orchestrator/orchestrator.go`'s `InstallTool` to generate a random UUID staging folder name for each installation pass.
- [ ] Direct the installer plugins to execute their downloads and extractions inside this UUID staging subdirectory.
- [ ] Upon successful plugin execution, perform an atomic rename or symlink promotion from the UUID subdirectory to the `/current` directory path.
- [ ] Ensure that dry-runs correctly register the UUID folders and matching file operations, mimicking TS output.
- [ ] Run `bun check:ci` and verify that the Go CLI and TS CLI produce byte-for-byte identical directory structures and database records.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
