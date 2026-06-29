---
created_on: 2026-06-29 09:00
last_modified: 2026-06-29 09:00
status: current
ticket_status: open
---

# Wave 10: Fix Archive Extractor Symlink Validation (Zip-Slip Variant)

## Problem

In `pkg/archive/archive.go`, the archive extractor implements a basic "Zip-Slip" check on directory paths of extracted regular files to prevent directory traversal:

```go
rel, err := filepath.Rel(cleanDest, cleanTarget)
if err != nil || strings.HasPrefix(rel, "..") {
    continue
}
```

However, the extractor **completely fails to perform any sanitization or validation on symbolic link targets** (`header.Linkname` in tar or the string payload in zip files).

When extracting symlink entries:
- In `extractTar` (lines 257-258):
  ```go
  _ = e.fsys.Remove(cleanTarget)
  if err := e.fsys.Symlink(header.Linkname, cleanTarget); err != nil { ... }
  ```
- In `extractZip` (lines 149-150):
  ```go
  _ = e.fsys.Remove(cleanTarget)
  if err := e.fsys.Symlink(targetPath, cleanTarget); err != nil { ... }
  ```

**The Security Vulnerability:** A malicious tarball or zip archive can contain a symbolic link entry named `malicious_dir` pointing to an absolute path (e.g. `/etc`) or an out-of-bounds relative path (e.g. `../../../../etc`). Go's extractor will create this symlink. If a subsequent entry in the same archive is named `malicious_dir/passwd`, the filesystem traversal will follow the previously written symlink and overwrite `/etc/passwd`. Because Go extracts archives inside the host user's security domain, this is an arbitrary remote-code-execution or file-overwrite security vector.

*(Note: Although a Wave 9 ticket was previously created and closed, our security audit proves that the vulnerability remains active and was bypassed in the implementation).*

## Why this matters

The CLI downloads third-party binaries, completions, and libraries from remote URLs (such as GitHub releases). Running an extractor with zero symlink traversal protections leaves the user's host system completely vulnerable to malicious archive manipulations, violating standard sandboxing policies.

## Observed context

- Go files:
  - `pkg/archive/archive.go` (contains `extractTar`, `extractTarXz`, and `extractZip`)

## Desired outcome

The archive extractor enforces strict symbolic link validation. Before writing any symbolic link, the link's target path is parsed and verified to ensure that it cannot escape the bounds of the target destination directory. Any absolute targets or relative paths containing `..` that resolve outside the destination directory must be immediately rejected.

## Acceptance criteria

- [ ] **Sanitize Tar Symlink Targets**: In `extractTar` and `extractTarXz`, parse `header.Linkname`. Verify that the target resolves within the extraction directory boundary. If the link target is absolute or escapes via relative directory traversing, reject the entry and return a descriptive error.
- [ ] **Sanitize Zip Symlink Targets**: In `extractZip`, read and sanitize the symlink target string payload to ensure it does not escape the destination directory.
- [ ] **Reject Out-of-Bounds**: Return a clear security error (e.g., `ErrSymlinkTraversalDetected` or `"malicious symlink traversal detected"`) and halt extraction immediately if a malicious directory traversal attempt is detected.
- [ ] **Unit Testing**: Add a security-focused test case inside `pkg/archive/archive_test.go` that generates a mock tar/zip archive carrying:
  - A symlink pointing to `/tmp/escaped_test` (out-of-bounds absolute target).
  - A symlink pointing to `../../escaped_relative` (out-of-bounds relative target).
  Assert that extracting this mock archive fails and rejects the out-of-bounds creation without creating any files outside the target directory.
- [ ] Run a separate review pass on this ticket using an independent review workflow or review subagent, and resolve all identified feedback/issues until a completely clean review is returned.
