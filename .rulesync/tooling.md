---
root: false
targets: ["*"]
description: 'tooling'
globs:
  - '**/*'
---

## Tooling

- `bun run test {file}` must be used to verify changes.
- `rg` must be used to search for files and text.
- `bun lint` must be used to check for type errors (DO NOT use `tsc` directly).
- Never use `sed` or `awk` to modify files.
