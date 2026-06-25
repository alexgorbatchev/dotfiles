---
created_on: 2026-06-25 11:30
last_modified: 2026-06-25 11:30
status: current
ticket_status: open
---

# Wave 6: Resolve Dry-Run Symlink Leaks and Enforce In-Memory Sandboxing

## Problem

During a `--dry-run` execution under the Go-native engine, file operations are successfully sandboxed in memory (`MemFS`). However, symlinks are not sandboxed. 

Inside `pkg/orchestrator/orchestrator.go`, the orchestrator attempts to create symbolic links:
```go
symEvaluator := o.getSymlinkEvaluator()
for _, sym := range tool.Symlinks {
    wasCreated, err := symEvaluator.CreateSymlink(sym.Source, sym.Target, symlink.Options{Overwrite: true})
```
However, the symlink evaluator setup returns a host-level system evaluator when `o.symlinkFS` is `nil` (which is always the case in production since it is never initialized by the CLI bootstrap sequence):
```go
func (o *Orchestrator) getSymlinkEvaluator() *symlink.Evaluator {
	if o.symlinkFS != nil {
		return symlink.NewEvaluatorWithFS(o.symlinkFS)
	}
	return symlink.NewEvaluator() // uses realFS{} -> directly issues real syscalls on user system!
}
```
This means executing the compiled binary with `generate --dry-run` or running Go unit tests actively mutates, overwrites, or removes symbolic links on the developer's live local system.

Furthermore, both Go and TypeScript write persistent state records directly to the physical `/home/alex/.../registry.db` SQLite database file during dry-run, which corrupts historical audit logs with non-existent operations.

## Why this matters

The core promise of `--dry-run` is absolute safety and idempotence. Bypassing virtual filesystem boundaries to issue real symbolic link syscalls can corrupt, overwrite, or delete critical local configuration files (e.g., inside `$HOME`). Writing dry-run results to physical databases violates database integrity rules.

## Observed context

- Codebase files affected:
  - `pkg/orchestrator/orchestrator.go` (lacks symlink FS initialization on dry-run)
  - `cmd/dotfiles/bootstrap.go` (manages physical db path boot)
  - `pkg/fs/fs.go` (defines core FS interface)
  - `pkg/fs/mem_fs.go` (lacks symlinking methods)

## Desired outcome

The Go engine respects the sandboxing boundary completely on `--dry-run` or test execution:
1. All symlinks must be created and tracked inside the virtual `MemFS` volume, with zero host system syscalls.
2. The SQLite database is redirected to a temporary in-memory `:memory:` connection when dry-run is specified.

## Acceptance criteria

- [ ] Extend the Go `FS` interface in `pkg/fs/fs.go` to include standard symbolic link declarations matching TypeScript's `IFileSystem`:
  ```go
  Symlink(oldname, newname string) error
  Readlink(path string) (string, error)
  Lstat(path string) (os.FileInfo, error)
  ```
- [ ] Implement these methods in `pkg/fs/os_fs.go` (pointing to standard `os` calls) and `pkg/fs/mem_fs.go` (tracking virtual symbolic links inside the in-memory map).
- [ ] Update `pkg/symlink/symlink.go` and its evaluator to run directly on the `FS` interface, making it completely sandboxed when initialized with `MemFS`.
- [ ] In `cmd/dotfiles/bootstrap.go`, if `dryRun` is enabled, construct and inject a `MemFS`-backed symlink evaluator into the orchestrator.
- [ ] In `cmd/dotfiles/bootstrap.go`, if `dryRun` is enabled, intercept the SQLite database opening step and initialize a clean `:memory:` transient database instance rather than opening the physical database file on disk.
- [ ] Create an E2E test file `tests/e2e/dry_run_sandboxing_test.go` asserting that running `generate --dry-run`:
  - Successfully tracks and completes all virtual file writes and virtual symlink creations.
  - Leaves the physical `$HOME` file path untouched (verifying no host symlink creation).
  - Leaves the physical `registry.db` database file unmodified (verifying in-memory DB redirection).
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
