# dotfiles-installer

Monorepo for `@alexgorbatchev/dotfiles`. Go implementation (`pkg/`, `cmd/dotfiles/`) with Preact dashboard client (`packages/dashboard/`).

## Shared commands

- Default action (run tests without compile): `just`
- Run CLI against fixture project: `just run`
- Install deps: `bun install --frozen-lockfile`
- Format & autofix: `just fix` (or `bun fix`)
- Lint: `just lint` (or `bun lint`)
- Typecheck: `just typecheck` (or `bun typecheck`)
- Check skill documentation links, anchors and page reachability: `just docs-links` (runs `scripts/check-docs-links.ts`)
- Go unit tests: `just test-unit` (or `go test ./pkg/... ./cmd/... ./scripts/...`)
- Go E2E tests: `just test-e2e` (or `go test -count=1 -p 1 ./tests/e2e/...`)
- TypeScript tests: `just test-ts` (or `bun test`)
- All tests: `just test` (Go unit, Go E2E and TypeScript)
- Full check: `just check` (or `bun check`)
- Build / compile binaries: `just compile` (or `bun compile`)
- CLI against fixture project: `go run ./cmd/dotfiles --config test-project/dotfiles.config.ts generate`
- Dashboard server against fixture: `just dashboard` (or `go run ./cmd/dotfiles --config test-project/dotfiles.config.ts dashboard`)

## Workspace map

- CLI entrypoint: `cmd/dotfiles/` -> `cmd/dotfiles/AGENTS.md`
- Dashboard workspace: `packages/dashboard/` -> `packages/dashboard/AGENTS.md`
- Go logger package: `pkg/logger/` -> `pkg/logger/AGENTS.md`
- Go orchestrator package: `pkg/orchestrator/` -> `pkg/orchestrator/AGENTS.md`
- Go installer package: `pkg/installer/` -> `pkg/installer/AGENTS.md`
- Go filesystem package: `pkg/fs/` -> `pkg/fs/AGENTS.md`
- Go VM package: `pkg/vm/` -> `pkg/vm/AGENTS.md`
- Go scaffold package: `pkg/scaffold/`
- Go E2E test suite: `tests/e2e/`
- Verification fixture: `test-project/`
- Isolated installer test workspace: `test-install/` -> `test-install/AGENTS.md`

## Shared gotchas

- **Dashboard client rebuild required:** The Go binary embeds compiled dashboard assets from `pkg/dashboard/dist/`. Any changes under `packages/dashboard/src/client/` require running `bun compile` to re-bundle client assets into Go source before launching the dashboard server.
- **A fresh checkout must generate the fixture once before `bun check` passes:** `test-project/tsconfig.json` maps `@alexgorbatchev/dotfiles` to `test-project/.generated/node_modules/`, which only exists after `go run ./cmd/dotfiles --config test-project/dotfiles.config.ts generate`. Until then `just typecheck` reports dozens of TS2307/TS7006 errors that have nothing to do with the working tree. Run `just prepare` and that generate once in any new clone or worktree.
- **Starter tool configurations are never auto-created:** Loading a configuration does not write `.tool.ts` files. `dotfiles scaffold` is the only thing that provisions them, it never overwrites an existing file unless `--force` is passed, and `scripts/managed-installer/install.sh` calls it without `--force`.
- **`--platform`/`--arch` must reach the loader:** `.platform()` blocks in tool files are evaluated while the configuration is being loaded, so the flags are passed through `vm.WithTarget`. Platform and architecture matching itself lives in Go (`vm.Target.matchesTarget`, `config.MatchesPlatform`), and a misspelled `Platform`/`Architecture` member is rejected at load time rather than silently widening or disabling a block. The project-level `platform` list in `dotfiles.config.ts` (`config.ApplyPlatformOverrides`) is matched against the same target, in `vm.decodeProjectConfig`, before placeholders are resolved.
- **Skill docs are generated:** `.agents/skills/dotfiles/` is the source of truth. `scripts/build/main.go` copies it into `pkg/embedded/skill/` (embedded in the binary) and `.dist/skill/`, and `packages/docs` publishes it from `.agents/`. Edit `.agents/`; edits made directly in `pkg/embedded/skill/` are silently reverted by the next `just compile`.
- **Skill snippets are type-checked:** `pkg/embedded/skill_snippets_test.go` compiles every ` ```typescript ` / ` ```ts ` fence in the skill against the embedded declarations. A fragment must say how it is completed: ` ```typescript builder ` (chain on an `install()` builder), ` ```typescript shell ` (chain on a shell configurator), ` ```typescript body ` (statements inside a `defineTool` callback), ` ```typescript config ` (members of the `defineConfig` object), or ` ```typescript no-typecheck ` for an example whose point is the error it contains. An unknown tag fails the test; a fragment left untagged fails to compile.
- **Declarations follow the runtime, not the docs:** `pkg/vm/dsl-types.ts` declares only members `pkg/vm/loader-api.ts` provides and parameters `pkg/installer/*.go` reads. When a doc and Go disagree, fix the doc or Go, never the declaration alone; `tests/type-tests` (tsd, run by `just typecheck`) pins every member.
- **Stale generated output:** Do not manually edit `.generated/` output directories in fixtures or builds. If generated output gets stale, delete the matching `.generated/` directory and rerun the CLI.
- **Release version match:** Tagged release `vX.Y.Z` must strictly match `version` in `package.json`. GitHub releases must be created/updated via `gh release` with release notes derived from actual git history.
- **Verify release binaries:** Every release must be verified to ensure CI has completed and actually produced and uploaded all platform binary assets and checksums to the GitHub release.

## Shared conventions

- Implement Go code in `pkg/` organized by responsibility (domain-oriented, e.g. `pkg/config/`, `pkg/installer/`, `pkg/logger/`).
- Accept interfaces, return concrete structs in Go functions. Wrap errors with context using `%w` (`fmt.Errorf("action: %w", err)`).
- Write platform-independent tests: never branch on `runtime.GOOS` to select a different expected value. Assert on identity and intent (that a specific tool config is present) rather than on aggregate counts that platform-specific behavior can change, and inject the target OS as a parameter (as `scaffold.Options.TargetOS` does) when the subject genuinely is platform-specific behavior.
- Copy `defineConfig` patterns from `test-project/dotfiles.config.ts`.
- Copy `.tool.ts` patterns from `test-project/tools/github-release--bat.tool.ts`.
- Keep root `README.md` brief; point detailed documentation to the website or skills.
- Document every public API in exactly one canonical page under `.agents/skills/dotfiles/references/`. Every other page that mentions it links to that page instead of restating parameters, tables, or option lists; a second copy of an API's surface is a defect, not redundancy.

## Shared boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
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
