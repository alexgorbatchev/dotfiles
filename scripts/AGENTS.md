# scripts

Repository automation, build orchestration, code generation, release management, and documentation verification tooling.

## Commands

- Run full release build: `just compile` (or `go run scripts/build/main.go`)
- Prepare embedded assets: `just prepare` (or `go run scripts/build/main.go --assets-only`)
- Check documentation links and anchors: `just docs-links` (or `bun scripts/check-docs-links.ts`)
- Run release pipeline: `just release [patch|minor|major]` (or `bun scripts/release.ts [bump]`)
- Deploy local dev build: `just dev-bootstrap [target]` (or `go run ./scripts/dev-bootstrap [target]`)
- Run Go script tests: `go test -v ./scripts/...`
- Run TypeScript script tests: `bun test scripts/`

## Workspace map

- Build & packaging orchestration: `scripts/build/` -> `scripts/build/AGENTS.md`
- Local development deployment: `scripts/dev-bootstrap/` -> `scripts/dev-bootstrap/AGENTS.md`
- Documentation link verification: `scripts/docs-links/` -> `scripts/docs-links/AGENTS.md`
- Hosted bootstrap installer: `scripts/managed-installer/` -> `scripts/managed-installer/AGENTS.md`
- Test suite process supervisor: `scripts/test-runner/` -> `scripts/test-runner/AGENTS.md`
- Go-to-TypeScript type generator: `scripts/typegen/` -> `scripts/typegen/AGENTS.md`

## Local conventions

- TypeScript scripts use Bun runtime (`bun <script>.ts`).
- Go scripts are standalone packages executed with `go run ./scripts/<name>`.
- Use `.tmp/` inside the repository root for temporary build artifacts. Go test sandboxes and shared test binaries may use the OS temporary directory under the test-only exception in the root `AGENTS.md`.
- The release builder in `scripts/build/` and test supervisor in `scripts/test-runner/` must meet the root's 90% statement coverage minimum with behavioral tests. Other scripts are excluded from the coverage requirement enforced on `pkg/` and `cmd/`.
- The user approved a Go supervisor to replace the Bash test runner, including adding its top-level script. Keep scratch ownership, process-group cancellation, child reaping, and failure status preservation in that supervisor.

## Local gotchas

- Release publication is gated on `just setup` followed by `bun run check` before compilation and any commit/tag/push or asset upload. Release dry runs restore the original package contents, including pre-existing edits, after success or failure; once Git integration starts, preserve its state for recovery.
- **Release automation safety:** `scripts/release.ts` bumps versions, generates tags, and pushes to git remotes. It requires a completely clean git status (`git status --porcelain`) before running.
- **Asset generation prerequisite:** Fresh checkouts require running `just prepare` before Go packages can compile or pass vet/tests.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
- Never: publish releases, bump versions, push tags, or run `scripts/release.ts` automatically without explicit user authorization.
- Never: hardcode absolute host paths or use global `/tmp` outside the root policy's Go test exception.
- Ask first: adding new top-level scripts or altering the release pipeline sequence.

## References

- `scripts/release.ts`
- `scripts/check-docs-links.ts`
- `Justfile`
