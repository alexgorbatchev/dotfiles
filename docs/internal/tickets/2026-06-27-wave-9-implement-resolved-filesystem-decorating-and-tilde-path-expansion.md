---
created_on: 2026-06-27 12:00
last_modified: 2026-06-27 12:00
status: current
ticket_status: open
---

# Wave 9: Implement ResolvedFileSystem Decorator and Tilde Path Expansion

## Problem

In the legacy TypeScript codebase, `ResolvedFileSystem` serves as a decorator wrapping any core filesystem instance. It automatically intercepts all path arguments, expanding the user's home shortcut (`~` and `~/`) via `expandHomePath`:
```typescript
public async writeFile(filePath: string, content: FileWriteContent, encoding?: BufferEncoding): Promise<void> {
  await this.inner.writeFile(expandHomePath(this.homeDir, filePath), content, encoding);
}
```
This is a vital abstraction that allows tool configurations (such as writing `~/.bashrc` or symlinking configs) to operate uniformly.

In the Go implementation:
1. `ExpandHomePath` is defined in `pkg/utils/utils.go` but is **never invoked anywhere in the file system or installer pipelines** (verified via code search).
2. No `ResolvedFileSystem` equivalent wraps `OSFS` or `MemFS` in `pkg/fs/fs.go`.

**The Bug:** Any tool configuration targeting a user home directory path (e.g., writing `~/.bashrc` or checking if `~/.ssh` exists) is executed literally by the underlying filesystem. This results in either runtime failures (e.g. `os.ErrNotExist`) or, worse, the physical creation of literal directory structures named `~` in the program's working directory.

## Why this matters

A dotfiles tool-manager's primary purpose is to symlink, configure, and install user configs in their home directory. The inability to resolve the home shortcut (`~`) breaks almost every standard `.tool.ts` configuration, making the Go CLI completely unusable for standard dotfiles deployment.

## Observed context

- Go files:
  - `pkg/fs/fs.go` (defines `FS` interface and implementations)
  - `pkg/utils/utils.go` (defines `ExpandHomePath`)
- TS reference:
  - `.workspaces/main/packages/file-system/src/ResolvedFileSystem.ts`

## Desired outcome

Create a Go `ResolvedFS` decorator wrapping any standard `fs.FS` instance. Integrate this decorator transparently into the bootstrapping phase so that all downstream configurations and installer plugins automatically expand path-based arguments starting with `~` to the user's actual home directory.

## Acceptance criteria

- [ ] **Create ResolvedFS Decorator**: Implement `ResolvedFS` struct in `pkg/fs/resolved_fs.go` that conforms to the `FS` interface.
- [ ] **Intercept FS Methods**: Every file system method (such as `WriteFile`, `ReadFile`, `Exists`, `Remove`, `RemoveAll`, `MkdirAll`, `Symlink`, `Stat`, `Open`, `ReadDir`, `Lstat`) must expand any target path containing `~` or `~/` to the home directory before delegating to the underlying file system.
- [ ] **Home Directory Resolution**: Retrieve the home directory path from `systemInfo` or the operating system environment dynamically upon construction.
- [ ] **Integrate in Bootstrap**: Wrap the primary `fsys` instance created in `cmd/dotfiles/bootstrap.go` (and all test fixtures) with `ResolvedFS` to ensure home directories are expanded uniformly across the runtime.
- [ ] **Unit Testing**: Write unit tests in `pkg/fs/resolved_fs_test.go` asserting that:
  - Calling `resolvedFS.WriteFile("~/test_file.txt", ...)` writes physically to `<home_dir>/test_file.txt`.
  - Directory traversal with double dots (`~/../other`) is handled securely.
  - Non-home paths are processed completely unchanged.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
