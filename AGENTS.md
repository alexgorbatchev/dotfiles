# dotfiles-installer

Monorepo for `@alexgorbatchev/dotfiles`. Go implementation (`pkg/`, `cmd/dotfiles/`) with Preact dashboard client (`packages/dashboard/`).

## Shared commands

- Default action (run tests without compile): `just`
- Run CLI: `just run` (e.g. `just run --help`, `just run --config /path/to/dotfiles.config.ts generate`)
- Run CLI against fixture project: `just test-project` (runs `state generate` by default, or `just test-project state diff`, etc.)
- Install deps: `bun install --frozen-lockfile`
- Format & autofix: `just fix` (or `bun fix`)
- Lint: `just lint` (or `bun lint`)
- Typecheck: `just typecheck` (or `bun typecheck`)
- Check skill documentation links, anchors and page reachability: `just docs-links` (runs `scripts/check-docs-links.ts`)
- Go unit tests: `just test-unit` (or `go test ./pkg/... ./cmd/... ./scripts/...`)
- Go E2E tests: `just test-e2e` (or `go test -p 1 ./tests/e2e/...`)
- TypeScript tests: `just test-ts` (or `bun test`)
- Full release build, end to end: `just test-build` (runs `TestRunBuild` behind the `buildtest` tag)
- All tests: `just test` (Go unit, Go E2E and TypeScript)
- Full check: `just check` (or `bun check`)
- Build / compile binaries: `just compile` (or `bun compile`)
- CLI against fixture project: `go run ./cmd/dotfiles --config test-project/dotfiles.config.ts state generate`
- Dashboard server against fixture: `just dashboard` (or `go run ./cmd/dotfiles --config test-project/dotfiles.config.ts dashboard`)
- Deploy local dev build into dotfiles directory: `just dev-bootstrap` (or `just dev-bootstrap /path/to/target`)

## Workspace map

- CLI entrypoint: `cmd/dotfiles/` -> `cmd/dotfiles/AGENTS.md`
- Dashboard workspace: `packages/dashboard/` -> `packages/dashboard/AGENTS.md`
- Go arch package: `pkg/arch/` -> `pkg/arch/AGENTS.md`
- Go archive package: `pkg/archive/` -> `pkg/archive/AGENTS.md`
- Go backup package: `pkg/backup/` -> `pkg/backup/AGENTS.md`
- Go block package: `pkg/block/` -> `pkg/block/AGENTS.md`
- Go cliout package: `pkg/cliout/` -> `pkg/cliout/AGENTS.md`
- Go config package: `pkg/config/` -> `pkg/config/AGENTS.md`
- Go dashboard package: `pkg/dashboard/` -> `pkg/dashboard/AGENTS.md`
- Go db package: `pkg/db/` -> `pkg/db/AGENTS.md`
- Go downloader package: `pkg/downloader/` -> `pkg/downloader/AGENTS.md`
- Go drift package: `pkg/drift/` -> `pkg/drift/AGENTS.md`
- Go embedded package: `pkg/embedded/` -> `pkg/embedded/AGENTS.md`
- Go exec package: `pkg/exec/` -> `pkg/exec/AGENTS.md`
- Go features package: `pkg/features/` -> `pkg/features/AGENTS.md`
- Go filesystem package: `pkg/fs/` -> `pkg/fs/AGENTS.md`
- Go github package: `pkg/github/` -> `pkg/github/AGENTS.md`
- Go installer package: `pkg/installer/` -> `pkg/installer/AGENTS.md`
- Go lifecycle package: `pkg/lifecycle/` -> `pkg/lifecycle/AGENTS.md`
- Go logger package: `pkg/logger/` -> `pkg/logger/AGENTS.md`
- Go orchestrator package: `pkg/orchestrator/` -> `pkg/orchestrator/AGENTS.md`
- Go proxy package: `pkg/proxy/` -> `pkg/proxy/AGENTS.md`
- Go registry package: `pkg/registry/` -> `pkg/registry/AGENTS.md`
- Go scaffold package: `pkg/scaffold/` -> `pkg/scaffold/AGENTS.md`
- Go shell package: `pkg/shell/` -> `pkg/shell/AGENTS.md`
- Go shellinit package: `pkg/shellinit/` -> `pkg/shellinit/AGENTS.md`
- Go shim package: `pkg/shim/` -> `pkg/shim/AGENTS.md`
- Go symlink package: `pkg/symlink/` -> `pkg/symlink/AGENTS.md`
- Go typecheck package: `pkg/typecheck/` -> `pkg/typecheck/AGENTS.md`
- Go unwrap package: `pkg/unwrap/` -> `pkg/unwrap/AGENTS.md`
- Go updater package: `pkg/updater/` -> `pkg/updater/AGENTS.md`
- Go usagelog package: `pkg/usagelog/` -> `pkg/usagelog/AGENTS.md`
- Go utils package: `pkg/utils/` -> `pkg/utils/AGENTS.md`
- Go venv package: `pkg/venv/` -> `pkg/venv/AGENTS.md`
- Go version package: `pkg/version/` -> `pkg/version/AGENTS.md`
- Go VM package: `pkg/vm/` -> `pkg/vm/AGENTS.md`
- Go E2E test suite: `tests/e2e/`
- Verification fixture: `test-project/`
- Isolated installer test workspace: `test-install/` -> `test-install/AGENTS.md`
- Repository automation & scripts: `scripts/` -> `scripts/AGENTS.md`
- Build & packaging orchestration: `scripts/build/` -> `scripts/build/AGENTS.md`
- Dev bootstrap script: `scripts/dev-bootstrap/` -> `scripts/dev-bootstrap/AGENTS.md`
- Documentation link verification: `scripts/docs-links/` -> `scripts/docs-links/AGENTS.md`
- Hosted bootstrap installer: `scripts/managed-installer/` -> `scripts/managed-installer/AGENTS.md`
- Go-to-TypeScript type generator: `scripts/typegen/` -> `scripts/typegen/AGENTS.md`

## Shared gotchas

- **Dashboard client rebuild required:** The Go binary embeds compiled dashboard assets from `pkg/dashboard/dist/`. Any changes under `packages/dashboard/src/client/` require running `bun compile` to re-bundle client assets into Go source before launching the dashboard server.
- **A fresh checkout must generate the fixture once before `bun check` passes:** `test-project/tsconfig.json` maps `@alexgorbatchev/dotfiles` to `test-project/.generated/node_modules/`, which only exists after `go run ./cmd/dotfiles --config test-project/dotfiles.config.ts state generate`. Until then `just typecheck` reports dozens of TS2307/TS7006 errors that have nothing to do with the working tree. Run `just prepare` and that generate once in any new clone or worktree.
- **Starter tool configurations are never auto-created:** Loading a configuration does not write `.tool.ts` files. `dotfiles tool scaffold` and `dotfiles tool add` are the commands that provision them into the tool configs directory. Neither overwrites an existing file unless `--force` is passed, and `scripts/managed-installer/install.sh` calls `dotfiles tool scaffold` without `--force`.
- **`--platform`/`--arch` must reach the loader:** `.platform()` blocks in tool files are evaluated while the configuration is being loaded, so the flags are passed through `vm.WithTarget`. Platform and architecture matching itself lives in Go (`vm.Target.matchesTarget`, `config.MatchesPlatform`), and a misspelled `Platform`/`Architecture` member is rejected at load time rather than silently widening or disabling a block. The project-level `platform` list in `dotfiles.config.ts` (`config.ApplyPlatformOverrides`) is matched against the same target, in `vm.decodeProjectConfig`, before placeholders are resolved.
- **Skill docs have one physical source:** `pkg/embedded/skill/` is the source of truth, embedded directly in the binary. Keep `.agents/skills/dotfiles` as a relative symlink to `../../pkg/embedded/skill`. Edits through either path modify the same files. `scripts/build/main.go` copies the canonical directory into `.dist/skill/` without deleting or rewriting the source, and `packages/docs` publishes it through the agent symlink.
- **Skill snippets are type-checked:** `pkg/embedded/skill_snippets_test.go` compiles every ` ```typescript ` / ` ```ts ` fence in the skill against the embedded declarations. A fragment must say how it is completed: ` ```typescript builder ` (chain on an `install()` builder), ` ```typescript shell ` (chain on a shell configurator), ` ```typescript body ` (statements inside a `defineTool` callback), ` ```typescript config ` (members of the `defineConfig` object), or ` ```typescript no-typecheck ` for an example whose point is the error it contains. An unknown tag fails the test; a fragment left untagged fails to compile.
- **Declarations follow the runtime, not the docs:** `pkg/vm/dsl-types.ts` declares only members `pkg/vm/loader-api.ts` provides and parameters `pkg/installer/*.go` reads. When a doc and Go disagree, fix the doc or Go, never the declaration alone; `tests/type-tests` (tsd, run by `just typecheck`) pins every member.
- **The full release build is not part of `just test-unit` or `just check`:** `TestRunBuild` rewrites generated sources, `.dist` and `.tmp`. Every package that loads a TypeScript configuration records the repository root as a test input, and Go hashes each entry's modification time, so a build inside `go test` stops `pkg/installer`, `pkg/scaffold`, `pkg/vm` and `cmd/dotfiles` from ever reusing a cached result. The test lives behind the `buildtest` build tag and runs from `just test-build`, which CI runs as a step after the checks.
- **Tests get an isolated `MemFS`:** `fs.NewMemFS()` never consults the real filesystem, so a test cannot come to depend on what happens to be installed on the machine running it. `fs.NewMemFSWithHostFallback()` lets `Exists`, `Stat`, `Lstat` and `Readlink` (never reads) answer from the host, and is for dry runs, which have to see the machine they would install onto.
- **Stale generated output:** Do not manually edit `.generated/` output directories in fixtures or builds. If generated output gets stale, delete the matching `.generated/` directory and rerun the CLI.
- **Release version match:** Tagged release `vX.Y.Z` must strictly match `version` in `package.json`. GitHub releases must be created/updated via `gh release` with release notes derived from actual git history.
- **Verify release binaries:** Every release must be verified to ensure CI has completed and actually produced and uploaded all platform binary assets and checksums to the GitHub release.

## Shared conventions

- Before implementing a feature in any language, inspect existing dependencies and maintained third-party libraries. Prefer a suitable library, or native/standard-library functionality when it meets the requirements. Write custom functionality only when suitable existing solutions cannot meet them.
- Implement Go code in `pkg/` organized by responsibility (domain-oriented, e.g. `pkg/config/`, `pkg/installer/`, `pkg/logger/`).
- Accept interfaces, return concrete structs in Go functions. Wrap errors with context using `%w` (`fmt.Errorf("action: %w", err)`).
- Write platform-independent tests: never branch on `runtime.GOOS` to select a different expected value. Assert on identity and intent (that a specific tool config is present) rather than on aggregate counts that platform-specific behavior can change, and inject the target OS as a parameter (as `scaffold.Options.TargetOS` does) when the subject genuinely is platform-specific behavior.
- Copy `defineConfig` patterns from `test-project/dotfiles.config.ts`.
- Copy `.tool.ts` patterns from `test-project/tools/github-release--bat.tool.ts`.
- Keep root `README.md` brief; point detailed documentation to the website or skills.
- Document every public API in exactly one canonical page under `.agents/skills/dotfiles/references/`. Every other page that mentions it links to that page instead of restating parameters, tables, or option lists; a second copy of an API's surface is a defect, not redundancy.

## Shared boundaries

- Test-only exception to the project-local `.tmp` policy: Go tests may use the OS temporary directory through `t.TempDir()` and `os.MkdirTemp("", ...)` for isolated sandboxes and shared test binaries. Keep these artifacts outside the module so randomized names and directory metadata do not invalidate Go's test cache. Use automatic test cleanup or a `TestMain` in an `_test.go` file; remove only artifacts owned by that test process. Do not override `TMPDIR` or `GOTMPDIR` to point inside the repository for these tests. Temporary agent scripts and manual verification artifacts still belong in the project's `.tmp`.
- Always: fetch GitHub application data through non-API transports by default. Reuse existing fetching and downloader infrastructure through verified non-API paths; inspect a helper's implementation before reusing it.
- Only with explicit opt-in: use the `gh` CLI for enterprise GitHub access, including API requests made by `gh api` or other `gh` commands. Scope the opt-in to the configured operation and target. An enterprise hostname, credentials, installed `gh`, or a failed non-API request does not enable this mode automatically.
- Never: call GitHub REST or GraphQL APIs directly from application HTTP clients, SDKs, or proxies, or automatically fall back to API requests or the `gh` CLI. This applies to both public GitHub and GitHub Enterprise. Authentication and caching do not authorize API access outside the explicit enterprise `gh` CLI opt-in.
- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
- Always: keep the dotfiles skill frontmatter's `author: alexgorbatchev` and `metadata` block with `created_on`, `last_modified` (`YYYY-MM-DD HH:MM`), and `status: current`. Preserve `created_on` and update `last_modified` when revising the skill.
- Always: maintain a minimum of 90% statement/line coverage across all packages.
- Always: run `bun check` before declaring work complete.
- Always: verify that every release actually produces and uploads all compiled release binary assets via `gh release view vX.Y.Z --json assets`.
- Ask first: public API or CLI behavior changes, dependency additions or removals, `.github/workflows/*` changes, release or publish logic updates, package version bumps.
- Always: typecheck with `tsc` from `typescript` 7. TypeScript 7 is released, so the native compiler ships as `tsc` in the `typescript` package; the `@typescript/native-preview` package and its `tsgo` binary were the pre-release form and are gone.
- Never: hand-edit `.dist/` or `test-project/.generated/`; bypass Go abstractions with raw `node:fs` or `fetch`; commit compiled Go binaries.

## References

- Dashboard guidelines: `packages/dashboard/AGENTS.md`
- Go E2E test harness: `tests/e2e/harness.go`
- Skill definitions: `.agents/skills/dotfiles/`
- Release scripts: `scripts/release.ts`, `.github/workflows/ci.yml`, `.github/workflows/publish.yml`
