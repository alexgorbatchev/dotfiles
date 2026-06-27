---
created_on: 2026-06-27 11:00
last_modified: 2026-06-27 11:00
status: current
ticket_status: open
---

# Wave 8: Optimize TrackedFileSystem Write-Guard Memory Footprint

## Problem

In `TrackedFileSystem.WriteFile` (`pkg/fs/tracked_fs.go`), we perform a content comparison check before writing to disk and recording an operation. While we optimized this to perform a size check first, if the file size on disk matches the new data length exactly, the current code reads the _entire_ existing file into memory using `t.fs.ReadFile(path)`. For larger files, this creates a major memory allocation spike.

## Why this matters

Memory footprint and latency are critical for performance on low-memory servers or embedded development setups. If a user has large configuration files, reading the full files into memory just to perform a verification check causes significant garbage collection overhead and potential Out-Of-Memory (OOM) risks.

## Observed context

- Go files:
  - `pkg/fs/tracked_fs.go` (contains `WriteFile`)
- TS reference:
  - `.workspaces/main/packages/registry/src/file/TrackedFileSystem.ts`

## Desired outcome

`TrackedFileSystem.WriteFile` performs the content comparison without reading the entire existing file into memory at once. It streams and compares the files in chunks to achieve a constant $O(1)$ memory comparison footprint.

## Acceptance criteria

- [ ] **Stream-Based Chunk Comparison:** If the file size on disk matches the data length, open the existing file using `t.fs.Open(path)`.
- [ ] **Chunked Reads:** Read the existing file in chunks (e.g., using a 4KB buffer) and compare with the corresponding slices of the new `data` slice.
- [ ] **Early Exit:** Stop reading and exit immediately on any mismatch to save disk I/O.
- [ ] **Unit Testing:** Add a unit test in `pkg/fs/tracked_fs_test.go` verifying that chunked content matching works perfectly for identical files, files with different sizes, and files of identical size but differing content.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
