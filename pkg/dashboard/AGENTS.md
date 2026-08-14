# pkg/dashboard

Go backend REST API routes and embedded dashboard client server.

## Commands

- Test: `go test ./pkg/dashboard/...`
- Start server: `go run ./cmd/dotfiles --config test-project/dotfiles.config.ts dashboard`

## Local conventions

- Embed compiled React/Preact client assets from `pkg/dashboard/dist/`.
- `NewServer` accepts configurable `host` address (defaults to `127.0.0.1`, configurable via `--host` / `-H`).

## Local gotchas

- Changes to dashboard client require running `bun compile` to re-bundle client assets into Go source.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `dashboard_test.go`.
- Ask first: changing REST API response schemas shared with the frontend.
- Never: hardcode client asset strings without going through build bundling.

## References

- `pkg/dashboard/routes.go`
