# HOME / Path Resolution Enforcement (Implementation TODOs)

Context
- Goal: make path resolution rules unambiguous and consistently enforced, with guardrails that prevent accidental bypass.
- Non-negotiable rule:
  - `--config` path may resolve `~/` using the system home (bootstrap) because config is not loaded yet.
  - After config is loaded and `projectConfig.paths.homeDir` is known, **all `~/` inside config values must resolve using `projectConfig.paths.homeDir`**.

Definitions
- **Bootstrap home**: system home (e.g. `os.homedir()`), available before config is loaded.
- **Configured home**: `projectConfig.paths.homeDir`, available only after config load determines it.
- **Resolved path** (repo policy): a path string that contains no tilde (`~`) home shorthand.

Non-goals / important constraints
- Do not expand `~` inside arbitrary script contents. Only expand `~` in fields that are intended to be filesystem paths.
- All filesystem access must go through `IFileSystem` (this is an existing repo rule). `ResolvedFileSystem` assumes this.

Implementation principle
- Do not rely on humans remembering to call helper functions.
- Enforce at boundaries (config normalization + filesystem boundary) and add automated checks.

## TODO

### T001 — Decide and document the canonical token syntax for config
Deliverable: documentation + schema comments updated to one canonical token syntax.

Rules to adopt (based on current implementation behavior):
- Canonical token format is `{TOKEN}`.
- Supported token sources:
  - Environment variables: `{HOME}`, `{PATH}`, etc.
  - Nested config values: `{paths.homeDir}`, `{paths.dotfilesDir}`, etc.
  - Injected special token: `{configFileDir}`.
- Explicitly NOT supported:
  - `${HOME}` style.
  - `{env.HOME}` style.

Token grammar details (must be documented so behavior is unambiguous):
- Tokens are replaced inside YAML/TS-derived string values.
- Replacement is applied repeatedly until the config string stabilizes (fixed-point substitution).
- Token escaping: prefix the `{...}` token with `$` to prevent substitution.
  - Example: `${HOME}` remains a literal string `${HOME}`.
  - This escape mechanism is only for literal preservation; `${HOME}` is NOT treated as a token.

Acceptance criteria:
- Docs + schema comments match the real implementation.
- Users can determine the supported token grammar from docs alone.

### T002 — Fix documentation/schema mismatches (`${HOME}` vs `{HOME}`)
Deliverable: a complete list of files/sections referencing `${HOME}`, plus the edits required.

Steps:
- Search the repo for `${HOME}` (docs + schema comments).
- For each match, update to `{HOME}` (or remove if misleading).
- Ensure examples show `{paths.homeDir}` and `{configFileDir}` where appropriate.

Acceptance criteria:
- No `${HOME}` remains in docs/schema comments.

### T003 — Specify the config evaluation order (staged resolution model)
Deliverable: a written spec that resolves the circular dependency around `paths.homeDir`.

Required algorithm (must be described precisely):
1. Resolve config file location (`--config`):
   - If `--config` contains `~/`, resolve using bootstrap home.
   - Do not require configured home at this stage.
2. Load raw config object:
   - Parse YAML/TS config into an object.
3. Establish the initial token environment:
  - Define `configFileDir` based on the resolved config file path.
  - Define environment tokens from the process environment.
  - Define `{HOME}` as bootstrap home for the purpose of bootstrapping `paths.homeDir`.
4. Determine configured home (`paths.homeDir`) first:
   - Compute `paths.homeDir` from its configured value.
  - Apply token substitution within `paths.homeDir` using the initial token environment.
  - Expand `~` within `paths.homeDir` using bootstrap home (bootstrapping exception).
  - Result of this step is the concrete configured home.
5. Post-home token environment:
  - Redefine `{HOME}` to mean configured home (not bootstrap home) for the remainder of config processing.
  - Ensure `{paths.homeDir}` resolves to configured home.
6. Config path-field resolution pass (NOT global string rewriting):
  - Apply fixed-point token substitution across config.
  - Expand `~` ONLY for config fields that represent filesystem paths.
    - Minimum required scope: the entire `projectConfig.paths` subtree.
    - Also required: any other documented “path” fields outside `paths` (e.g., shell profile path settings).
    - Explicitly excluded: script contents / shell snippets / text blobs.
7. Validate final config with zod schema.

Acceptance criteria:
- The spec explicitly states what base is used for `~` in each stage.
- The spec explicitly states what `{HOME}` maps to before and after `paths.homeDir` is determined.

Implementation note:
- If it is ambiguous whether a config string is a “path field”, default to NOT expanding `~` there; require the caller to express intent via:
  - `{paths.homeDir}/...` for paths, or
  - `${HOME}` (escaped token) for literal shell expansion.

### T004 — Align the config loader implementation with the staged spec
Deliverable: code changes that implement T003 exactly and remove any conflicting behavior.

Must address the known discrepancy:
- Current behavior expands `~` relative to `configFileDir` in config processing.
- This must be removed.
- If “relative-to-config-file” is needed, it must be expressed via `{configFileDir}` only (never via `~`).

Acceptance criteria:
- After config is fully loaded, there are no `~` occurrences in any config fields that represent filesystem paths (at minimum `projectConfig.paths.*`).
- `~` in config path fields is always interpreted as configured home (except the special bootstrapping of `paths.homeDir` itself).

### T005 — Define and enforce post-load invariants
Deliverable: a short spec + runtime assertions.

Invariants after config load:
- `projectConfig.paths.homeDir` is the single source of truth for home expansion.
- No `~` remains in any config-derived path fields.
- Any user-facing path rendering that wants `~/...` uses a contraction function (e.g., fold absolute paths back to `~/` for logs), but internal state remains expanded.

Acceptance criteria:
- A single helper (or assertion) can verify “no tilde remains” and is used in the config load pipeline.

### T006 — Introduce explicit `IResolvedFileSystem` (branded type)
Deliverable: a new type that cannot be accidentally satisfied by a plain `IFileSystem`.

Requirements:
- `IResolvedFileSystem` must be non-structural (brand via `unique symbol`), so `NodeFileSystem`, `MemFileSystem`, `TrackedFileSystem` cannot be passed accidentally.
- The brand must be applied only by `ResolvedFileSystem`.
- No type assertions (`as`) are allowed in production to “force” compatibility.

Location and export requirements:
- Implement `IResolvedFileSystem` in the file-system package and export it from packages/file-system/src/index.ts.
- `ResolvedFileSystem` must be in the file-system package and exported from the same index.

Acceptance criteria:
- TypeScript prevents passing an unresolved filesystem into APIs that require `IResolvedFileSystem`.

### T007 — Implement `ResolvedFileSystem` (decorator pattern)
Deliverable: `ResolvedFileSystem` that implements `IResolvedFileSystem` and delegates to an inner `IFileSystem`.

Behavior:
- Expands `~` and `~/...` in all path arguments using `projectConfig.paths.homeDir`.
- Does not use `os.homedir()`.
- Must transform every method argument that is a path (enumerate from the `IFileSystem` interface):
  - Single-path args named `path`:
    - `readFile(path, ...)`
    - `readFileBuffer(path)`
    - `writeFile(path, ...)`
    - `exists(path)`
    - `mkdir(path, ...)`
    - `readdir(path)`
    - `rm(path, ...)`
    - `rmdir(path, ...)`
    - `stat(path)`
    - `lstat(path)`
    - `readlink(path)`
    - `chmod(path, ...)`
    - `ensureDir(path)`
  - Two-path methods:
    - `copyFile(src, dest, ...)` (expand both)
    - `rename(oldPath, newPath)` (expand both)
    - `symlink(target, path, ...)` (expand both)
- Must not log; it is a pure boundary normalizer.

Platform behavior requirements:
- Expand `~` when it is exactly `~`, or starts with `~/`, or starts with `~\\` (Windows separator).
- Do not expand `~user/...` forms (unsupported).

Composition order requirement:
- `ResolvedFileSystem` is outermost so downstream wrappers (like `TrackedFileSystem`) see fully resolved paths.

Acceptance criteria:
- A targeted test suite verifies every `IFileSystem` method expands `~` correctly (including two-path methods).

Testing guidance (must be implementable without guesswork):
- Create a minimal spy `IFileSystem` implementation for tests that records every received path argument and throws by default.
- Wrap the spy with `ResolvedFileSystem` and call each method once with `~`/`~/x`/`~\\x` inputs.
- Assert the spy saw `${configuredHome}`-prefixed paths.
- Include one test that ensures non-tilde paths are passed through unchanged.
- Include one test that ensures `~user/x` is not expanded.

### T008 — Refactor path-sensitive services to require `IResolvedFileSystem`
Deliverable: signature updates across packages so unresolved FS cannot be passed.

Scope guidance:
- Any service that accepts user/config-derived paths and touches the filesystem should accept `IResolvedFileSystem`.
- Construction is centralized at the composition root (CLI/service setup) and always wraps the chosen inner FS (NodeFS or MemFS) after config load.

Acceptance criteria:
- It is impossible (via types) to call “real work” services with an unresolved FS.
- Dry-run mode (MemFS) still works by wrapping MemFS into an `IResolvedFileSystem` after config load.

### T009 — Add automated guardrails to prevent regressions
Deliverable: repo-level checks/tests.

Minimum set:
- A test or CI check that fails if production TypeScript contains new ad-hoc tilde expansion logic:
  - `path.startsWith('~/')`, `=== '~'`, `replace(/^~.../)`, etc. outside of the canonical implementations.
- A check that fails if `~/` string literals are introduced in production TS (allowlist tests/docs/fixtures).

Allowlist guidance:
- Allowed locations for tilde-handling logic:
  - The single tilde expander utility (if retained), and/or `ResolvedFileSystem` implementation.
- Allowed locations for `~/` literals:
  - Docs and tests only.

Acceptance criteria:
- Developers get fast feedback when they accidentally introduce a bypass.

## Notes / Current State
- Config token substitution currently behaves like `{VAR}` lookups, not `${VAR}` and not `{env.VAR}`.
- `{configFileDir}` already exists and should be the only way to express "relative to config file" intent.
