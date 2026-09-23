# scripts/dev-bootstrap

Developer utility for compiling, version-stamping, and deploying a local development build into a target dotfiles directory (defaults to `~/.dotfiles`) for offline testing.

## Purpose

Enables testing feature changes, bug fixes, or TypeScript declaration updates against a real or isolated dotfiles directory without publishing a release to GitHub or executing manual build, copy, and permission steps.

## Commands

- Run dev bootstrap (defaults to `~/.dotfiles`): `just dev-bootstrap` (or `go run ./scripts/dev-bootstrap`)
- Run dev bootstrap with target: `just dev-bootstrap ~/.tmp/test-dotfiles`
- Run dev bootstrap with verbose output: `go run ./scripts/dev-bootstrap -v [target]`
- Run package unit tests: `go test -v ./scripts/dev-bootstrap/...`
- Check statement coverage: `go test -cover ./scripts/dev-bootstrap/...`

## Local conventions

- The deployment pipeline executes five sequential steps:
  1. **Refresh embedded assets**: Runs `scripts/build/main.go --assets-only` so `pkg/embedded/dist` embeds the latest declarations, skill documentation, and dashboard assets before compiling.
  2. **Compile host binary**: Compiles `./cmd/dotfiles` into `.tmp/dotfiles-dev` (or `.tmp/dotfiles-dev.exe` on Windows).
  3. **Resolve target paths**: Expands leading `~` or `$HOME` paths and inspects the target directory's `dotfiles.config.ts` (or `dotfiles.config.js`). If no configuration exists, it provisions starter project files (`package.json`, `tsconfig.json`, `dotfiles.config.ts`) and runs `tool scaffold`.
  4. **Deploy local executable**: Copies the compiled binary to `<binariesDir>/dotfiles/current/dotfiles` and ensures executable permissions (`0755`).
  5. **Execute full generation**: Runs `state generate` using the deployed binary against the target configuration, ensuring shims, shell integration, declarative files, and TypeScript declaration sync (`.generated/node_modules/@alexgorbatchev/dotfiles`) reflect the current working tree.
- **Version stamping**: Development binaries compiled by `dev-bootstrap` are stamped with `999.0.0-dev.<short sha>` via `-ldflags "-s -w -X main.Version=..."`. The `999.0.0` major semver prefix ensures local builds are distinct from release tags and prevents `self upgrade` or update checkers from flagging them as outdated or attempting to downgrade them.
- Always compile temporary dev binaries into `.tmp/` inside the repository root. Never use global `/tmp`.
- Unit tests must never run the real `scripts/build/main.go --assets-only` against the repository root: it rewrites `pkg/embedded/dist` and `pkg/dashboard/dist` while other packages compile against them (issue #180). Set `SkipAssets: true`, or, to exercise the asset step, point `RepoRoot` at `newFakeRepoRoot`, whose `scripts/build/main.go` is a stub.
- Tests share one compiled CLI through `sharedDevBin(t)`, built at most once per test binary run and removed by `TestMain`. The compile step itself is exercised against `newFakeRepoRoot` with a stub `cmd/dotfiles/main.go`, so no test writes the repository's `.tmp/dotfiles-dev`. Name binaries with the package's `binName`, never a `runtime.GOOS` branch.
- Test binaries go in the OS temp directory (`t.TempDir`, `os.MkdirTemp("", ...)`), not the repository's `.tmp/`: the root `AGENTS.md` explains that packages loading a TypeScript configuration hash the repository root's entries as test inputs, so writing under `.tmp/` during `go test` would stop them reusing cached results. The `.tmp/` rule above applies to `dev-bootstrap` runs, not its tests.
- Command-line handling lives in `parseArgs`, and tests cover it there. `runMain` always refreshes assets and compiles the CLI, so tests never call it past an argument error.

## Local gotchas

- **Never run the Go toolchain under a test-overridden `HOME`:** When `GOPATH` is not exported (as on CI runners), Go derives it from `HOME`, so a `go build` or `go run` started after `t.Setenv("HOME", t.TempDir())` extracts the module cache into the temp directory. Go writes that cache read-only, and the `TempDir` cleanup then fails with `permission denied` (issue #171). Tests that change `HOME` must pass a prebuilt `DevBin` and `SkipAssets: true`. Reproduce with `env -u GOPATH -u GOMODCACHE go test -count=1 ./scripts/dev-bootstrap/`, as a non-root user.
- **Shim routing**: The interactive shim generated at `<dotfilesDir>/.generated/bin/dotfiles` executes `<binariesDir>/dotfiles/current/dotfiles`. Deploying directly to `<binariesDir>/dotfiles/current/dotfiles` ensures interactive shell invocations run the local development build immediately without requiring a GitHub release download.
- **Empty target bootstrap**: `tool scaffold` requires an existing `dotfiles.config.ts` or `dotfiles.config.js` to initialize services. When bootstrapping a fresh target directory, `dev-bootstrap` creates starter configuration files before invoking `tool scaffold`.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
- Always: maintain a minimum of 90% statement/line coverage across `scripts/dev-bootstrap`.
- Always: clean up temporary test directories created during unit test execution (`t.TempDir()`).
- Never: publish releases automatically without explicit user authorization.
- Never: modify or delete existing user tool configuration files in the target directory unless provisioning starter configurations in an empty directory.

## References

- `scripts/dev-bootstrap/main.go`
- `scripts/dev-bootstrap/main_test.go`
- `scripts/build/main.go`
- `cmd/dotfiles/bootstrap.go`
- `Justfile`
