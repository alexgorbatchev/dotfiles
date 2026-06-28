---
created_on: 2026-06-27 12:00
last_modified: 2026-06-27 12:00
status: current
ticket_status: open
---

# Wave 9: Fix Symlink Sandbox Leakage in Orchestrator Unit Tests

## Problem

Go configures sandboxing in `cmd/dotfiles/bootstrap.go` by swapping the root filesystem to `MemFS` during dry runs or testing:
```go
var fsys fs.FS
if dryRun || (isDevTest() && os.Getenv("DOTFILES_E2E_TEST") != "true") {
	fsys = fs.NewMemFS()
} else {
	fsys = fs.NewOSFS()
}
...
if dryRun {
	orch.SetSymlinkFS(fsys)
}
```

**The Severe Sandboxing Leak**:
1. In unit-testing mode (`isDevTest() == true` but `dryRun == false`), `fsys` is correctly instantiated as a virtual `MemFS`.
2. However, the condition `if dryRun` blocks `orch.SetSymlinkFS(fsys)` from executing.
3. Therefore, `o.symlinkFS` remains `nil` in the Orchestrator.
4. When `GenerateTool` runs, it resolves the Symlink Evaluator via:
   ```go
   func (o *Orchestrator) getSymlinkEvaluator() *symlink.Evaluator {
   	if o.symlinkFS != nil {
   		return symlink.NewEvaluatorWithFS(o.symlinkFS)
   	}
   	return symlink.NewEvaluator() // FALLS BACK TO PHYSICAL OSFS!
   }
   ```
5. Since `o.symlinkFS` is `nil`, the evaluator falls back to physical **`OSFS`** operations.
6. When `CreateSymlink` is called during unit testing, **it writes physical symlinks directly to the developer's real host machine**.

## Why this matters

Unit tests must remain 100% hermetic and isolated inside memory boundaries. Leaking symlink creations to the host machine risks corrupting the developer's physical system, overwriting valuable dotfiles, or creating security/reliability issues on the testing machine.

## Observed context

- Go files:
  - `cmd/dotfiles/bootstrap.go` (contains sandboxing setup)
  - `pkg/orchestrator/orchestrator.go` (contains `getSymlinkEvaluator` fallback)

## Desired outcome

Eliminate the physical symlink fallback risk. Ensure that the Orchestrator's Symlink Evaluator always utilizes the identical filesystem bound to the orchestrator's main FS context. Running unit tests in any mode must never write physical symlinks to the developer's host machine.

## Acceptance criteria

- [ ] **Synchronize FS and Symlinks**: In `cmd/dotfiles/bootstrap.go`, ensure that `orch.SetSymlinkFS(fsys)` is executed whenever `fsys` is a virtual `MemFS` (not just when `dryRun` is true).
- [ ] **Dynamic FS Fallback**: In `pkg/orchestrator/orchestrator.go` (`getSymlinkEvaluator`), if `o.symlinkFS` is `nil`, fall back to the main bound filesystem `o.fsys` instead of defaulting to a physical, un-sandboxed `symlink.NewEvaluator()`.
- [ ] **Remove Hardcoded Falling Back**: Eliminate any direct, un-sandboxed `os` or physical file system calls inside the symlink evaluator package.
- [ ] **Verification**: Run the full E2E and unit test suites, asserting that zero physical files, folders, or symlinks are left behind in the host directory structure.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
