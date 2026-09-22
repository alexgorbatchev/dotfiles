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
- Go-to-TypeScript type generator: `scripts/typegen/` -> `scripts/typegen/AGENTS.md`

## Local conventions

- TypeScript scripts use Bun runtime (`bun <script>.ts`).
- Go scripts are standalone packages executed with `go run ./scripts/<name>`.
- Use `.tmp/` inside the repository root for temporary build artifacts; never write to global `/tmp`.
- Scripts in `scripts/` are excluded from the 90% test coverage requirement enforced on `pkg/` and `cmd/`.

## Local gotchas

- **Release automation safety:** `scripts/release.ts` bumps versions, generates tags, and pushes to git remotes. It requires a completely clean git status (`git status --porcelain`) before running.
- **Asset generation prerequisite:** Fresh checkouts require running `just prepare` before Go packages can compile or pass vet/tests.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
- Never: publish releases, bump versions, push tags, or run `scripts/release.ts` automatically without explicit user authorization.
- Never: hardcode absolute host paths or use global `/tmp`.
- Ask first: adding new top-level scripts or altering the release pipeline sequence.

## References

- `scripts/release.ts`
- `scripts/check-docs-links.ts`
- `Justfile`
