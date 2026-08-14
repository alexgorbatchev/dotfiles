# dotfiles-installer

Monorepo for `@alexgorbatchev/dotfiles`. Go implementation (`pkg/`, `cmd/dotfiles/`) with Preact dashboard client (`packages/dashboard/`).

## Shared commands

- Install deps: `bun install --frozen-lockfile`
- Format & autofix: `just fix` (or `bun fix`)
- Lint: `just lint` (or `bun lint`)
- Typecheck: `just typecheck` (or `bun typecheck`)
- Go unit tests: `go test ./pkg/... ./cmd/...`
- Go E2E tests: `go test -count=1 -p 1 ./tests/e2e/...`
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
- Go E2E test suite: `tests/e2e/`
- Verification fixture: `test-project/`

## Shared gotchas

- **Dashboard client rebuild required:** The Go binary embeds compiled dashboard assets from `pkg/dashboard/dist/`. Any changes under `packages/dashboard/src/client/` require running `bun compile` to re-bundle client assets into Go source before launching the dashboard server.
- **Stale generated output:** Do not manually edit `.generated/` output directories in fixtures or builds. If generated output gets stale, delete the matching `.generated/` directory and rerun the CLI.
- **Release version match:** Tagged release `vX.Y.Z` must strictly match `version` in `package.json`. GitHub releases must be created/updated via `gh release` with release notes derived from actual git history.

## Shared conventions

- Implement Go code in `pkg/` organized by responsibility (domain-oriented, e.g. `pkg/config/`, `pkg/installer/`, `pkg/logger/`).
- Accept interfaces, return concrete structs in Go functions. Wrap errors with context using `%w` (`fmt.Errorf("action: %w", err)`).
- Copy `defineConfig` patterns from `test-project/dotfiles.config.ts`.
- Copy `.tool.ts` patterns from `test-project/tools/github-release--bat.tool.ts`.
- Keep root `README.md` brief; point detailed documentation to the website or skills.

## Shared boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
- Always: maintain a minimum of 90% statement/line coverage across all packages.
- Always: run `bun check` before declaring work complete.
- Ask first: public API or CLI behavior changes, dependency additions or removals, `.github/workflows/*` changes, release or publish logic updates, package version bumps.
- Never: hand-edit `.dist/` or `test-project/.generated/`; bypass Go abstractions with raw `node:fs` or `fetch`; commit compiled Go binaries; switch to `tsc`.

## References

- Dashboard guidelines: `packages/dashboard/AGENTS.md`
- Go E2E test harness: `tests/e2e/harness.go`
- Skill definitions: `.agents/skills/dotfiles/`
- Release scripts: `scripts/release.ts`, `.github/workflows/ci.yml`, `.github/workflows/publish.yml`
