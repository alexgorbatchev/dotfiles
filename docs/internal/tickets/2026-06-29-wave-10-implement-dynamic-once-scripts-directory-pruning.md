---
created_on: 2026-06-29 09:00
last_modified: 2026-06-29 09:00
status: current
ticket_status: open
---

# Wave 10: Implement Dynamic Once-Scripts Directory Pruning

## Problem

During consecutive `dotfiles generate` executions, the orchestrator is responsible for pruning the `.once` directory to ensure that deleted or modified once-scripts do not leak and run on subsequent shell startups.

In TypeScript, this pruning is dynamic: it scans the `.once` directory using filesystem read operations and deletes any file ending in a shell extension (`.zsh`, `.bash`, `.ps1`, `.sh`).

In Go (`pkg/orchestrator/orchestrator.go` lines 768-775), the pruning is implemented as a hardcoded, speculative loop from `1` to `1000`:
```go
for i := 1; i <= 1000; i++ {
    for _, ext := range []string{"zsh", "bash", "sh", "ps1"} {
        filePath := filepath.Join(onceDir, fmt.Sprintf("once-%03d.%s", i, ext))
        if exists, err := fsys.Exists(filePath); err == nil && exists {
            _ = fsys.Remove(filePath)
        }
    }
}
```

**The Core Gaps:**
1. **Performance Overhead**: This loop issues up to 4,000 physical or virtual filesystem checks on every generation run, regardless of how many scripts actually exist.
2. **Robustness Vulnerability**: If once-scripts exceed index 1000, use custom filenames, or omit the zero-padding formatting (`once-%03d`), Go will fail to find and delete them, leaking stale scripts that execute endlessly on startup.

## Why this matters

The once-scripts directory must be kept clean to prevent stale or obsolete setup tasks from re-executing. Speculative loops are fragile, slow, and non-idiomatic in Go.

## Observed context

- Go files:
  - `pkg/orchestrator/orchestrator.go` (contains the speculative pruning loop)
- TS files:
  - `packages/generator-orchestrator/` (contains original dynamic readdir cleanups)

## Desired outcome

The Go orchestrator uses native, dynamic directory read operations (`ReadDir`) to scan the `.once/` folder and recursively prune all generated once-scripts, eliminating speculative checks and ensuring absolute pruning safety.

## Acceptance criteria

- [ ] **Dynamic Directory Sweep**: Replace the hardcoded `for i := 1; i <= 1000` loop in `pkg/orchestrator/orchestrator.go` with a dynamic `fsys.ReadDir(onceDir)` walk.
- [ ] **Delete All Shell Scripts**: Loop over the returned directory entries and delete all files matching the target shell extensions (`.zsh`, `.bash`, `.sh`, `.ps1`), regardless of their filename indices or formats.
- [ ] **Unit testing**: Add a test inside `pkg/orchestrator/orchestrator_test.go` that:
  - Creates files like `once-9999.zsh`, `once-custom.sh`, and `once-001.ps1` in the virtual `.once` folder.
  - Triggers the once-script pruning method.
  - Asserts that all files are cleanly deleted, demonstrating dynamic pruning.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
