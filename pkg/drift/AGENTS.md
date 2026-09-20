# pkg/drift

Drift detection, 3-way text merging, diff computation, and drift inspection across declared files and blocks.

## Commands

- Test: `go test ./pkg/drift/...`

## Local conventions

- Three-way state machine (`Evaluate`): evaluates `Base` (last recorded in registry), `Current` (file on disk), and `Desired` (what repository would write now) to determine drift state (`StateNew`, `StateInSync`, `StateUnmanaged`, `StateMissing`, `StateUpstreamUpdate`, `StateLocalDrift`, `StateConflict`).
- Policy decision table (`Decide`): only states with competing changes allow policy selection (`PolicyMerge`, `PolicyKeepLocal`, `PolicyOverwrite`, `PolicyPrompt`); states without ambiguity always resolve to their single non-destructive action (`StateInSync` -> `ActionNothing`; `StateNew`/`StateMissing`/`StateUpstreamUpdate` -> `ActionWrite`).
- 3-Way merge (`Merge`): uses `diff3.Diff3Merge` with standard 7-character git-compatible conflict markers (`<<<<<<< local`, `=======`, `>>>>>>> dotfiles`) so mergetools and editors recognize conflicts cleanly.
- Preserves exact newline terminations: splitting on `\n` and joining on `\n` ensures trailing newlines are never added or stripped unintentionally.
- Refuse binary content: 3-way merge explicitly rejects binary content containing null bytes (`0x00`).
- Unified diffing (`UnifiedDiff`): produces standard unified diffs between old and new text, returning empty string when identical and reporting binary diff notices when inputs contain null bytes.
- Drift inspection (`Inspector`): inspects symlinks, copies, templates, and managed comment blocks against SQLite registry state and the injected `fs.FS` filesystem.
- Symlink canonicalization: normalizes symlink target paths and common host aliases (such as macOS `/private/var`, `/private/tmp`, `/private/etc` prefixes) when evaluating symlink drift.

## Local gotchas

- 9-character conflict markers emitted by some raw diff libraries are not recognized by git or standard editors -> always format conflict markers with 7 characters (`<<<<<<< local`, `=======`, `>>>>>>> dotfiles`).
- Merging binary files corrupts data -> `Merge` and `splitLines` reject content with null bytes with an explicit error.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `drift_test.go`, `diff_test.go`, and `inspector_test.go`.
- Ask first: modifying the drift state machine, default merge policies, or conflict marker labels.
- Never: discard local user edits silently without respecting configured drift policies.

## References

- `pkg/drift/drift.go`
- `pkg/drift/diff.go`
- `pkg/drift/inspector.go`
- `pkg/drift/drift_test.go`
