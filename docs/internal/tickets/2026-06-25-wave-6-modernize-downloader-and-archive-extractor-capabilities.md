---
created_on: 2026-06-25 12:00
last_modified: 2026-06-25 12:00
status: current
ticket_status: open
---

# Wave 6: Modernize Downloader and Archive Extractor Capabilities

## Problem

The networking downloader and decompression archive extractors in Go are missing critical capabilities that cause silent runtime failures:

1. **Downloader Lack of Authorization and Retries**:
   Go's `Download` function has a rigid, unconfigurable signature that lacks a custom options struct. It cannot accept custom headers, which means it **cannot propagate GitHub authorization tokens**. This causes downloads of release assets from private repositories to fail with 401/404 errors. Additionally, it lacks download retries with backoff, making it brittle to minor network glitches, and lacks progress callbacks.

2. **Total Loss of Symlinks during Archive Extraction**:
   TS delegates extraction to system utilities (`tar`/`unzip`), which preserve symlinks natively.
   Go's manual extractor in `pkg/archive/archive.go` completely ignores symbolic link headers in Tar archives (`tar.TypeSymlink` or `tar.TypeLink`), and extracts Zip symlinks as raw plain text files containing target paths. This causes unpacked toolchains (like Node.js or Bun) to lose their executable links, completely breaking the tools.

3. **In-Memory Buffering OOM Vulnerability**:
   Go's archive parser reads the entire payload of each file entry into RAM using `io.ReadAll` before writing it to disk:

   ```go
   entryBytes, err := io.ReadAll(tarReader)
   ```

   If a tool's archive contains large binary assets (e.g., a 500MB compiler toolchain), Go buffers the entire file in RAM, risking Out-of-Memory (OOM) crashes on low-resource virtual machines.

4. **Missing Executable Detection & Decompressors**:
   Go's archive parser does not support `.tar.xz`, `.txz`, or single `.gz` files. It also lacks the automatic heuristics-driven check `detectAndSetExecutables` that TS uses to ensure executables and shell scripts have their executable bit (`0o755`) restored.

## Why this matters

Decompression and networking are the bedrock of tool installation. Failing to extract symlinks breaks mainstream toolchains, while full-memory file buffering causes random OOM crashes on small virtual instances. Bypassing authorization headers permanently locks out private git organization distribution.

## Observed context

- Codebase files affected:
  - `pkg/downloader/downloader.go` (defines downloader logic)
  - `pkg/archive/archive.go` (defines extractor logic)
  - `pkg/installer/github.go` (calls downloader without auth token)

## Desired outcome

The Go downloader is a configurable, robust client supporting authorization and retries. The Go archive extractor is a memory-safe, stream-based extractor supporting symlink restoration, automatic executable recovery, and `.tar.xz` formats.

## Acceptance criteria

### 1. Downloader Upgrades

- [ ] Refactor `pkg/downloader/downloader.go` to accept an options struct `DownloadOptions`:
  ```go
  type DownloadOptions struct {
      Headers    map[string]string
      Timeout    time.Duration
      RetryCount int
      RetryDelay time.Duration
      OnProgress func(bytesDownloaded int64, totalBytes int64)
  }
  ```
- [ ] Implement a retry-with-backoff loop inside `downloader.go` using the specified `RetryCount` and `RetryDelay`.
- [ ] Inject custom headers (such as `Authorization: token <token>`) from the `DownloadOptions` struct directly into the outgoing `http.Request`.
- [ ] Wire the options structure to the installer plugins (e.g., `pkg/installer/github.go`), ensuring private repo downloads propagate auth headers.

### 2. Extractor Upgrades (Symlinks and Stream Decompression)

- [ ] Support Symlink extraction in Tar decompressor: update `extractTar` to handle `tar.TypeSymlink` and `tar.TypeLink`, executing proper `os.Symlink` calls.
- [ ] Support Symlink extraction in Zip decompressor: update `extractZip` to parse symlink headers (`f.Mode() & os.ModeSymlink != 0`), read the symlink destination path, and construct native symbolic links.
- [ ] **Stream Buffering**: Eliminate `io.ReadAll` inside `pkg/archive/archive.go`. Use streaming chunked copies like `io.Copy(destFile, tarReader)` to write files directly, limiting RAM usage to standard small buffers (e.g., 32KB) regardless of the file size.
- [ ] Add native decompression support for `.tar.xz`, `.txz`, and single-file `.gz` structures using Go packages or lightweight wrappers.
- [ ] Port the executable heuristics detection from TS (`detectAndSetExecutables`), scanning extracted files and restoring the executable bit (`chmod 0o755`) on files starting with shell shebangs (e.g., `#!/bin/sh`) or having common compiler outputs.
- [ ] Create unit tests inside `pkg/archive/archive_test.go` and `pkg/downloader/downloader_test.go` asserting:
  - Success on downloading and passing authenticating headers.
  - Correct extraction of a test Tarball/Zipball that contains nested symbolic links, verifying the links point to the right relative directories and remain executable.
  - Clean streaming of files without loading entire byte slices into memory.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
