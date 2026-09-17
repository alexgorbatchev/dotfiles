# pkg/dashboard

Go backend REST API routes and embedded dashboard client server.

## Commands

- Test: `go test ./pkg/dashboard/...`
- Start server: `go run ./cmd/dotfiles --config test-project/dotfiles.config.ts dashboard`

## Local conventions

- Embed compiled React/Preact client assets from `pkg/dashboard/dist/`.
- `NewServer` accepts configurable `host` address (defaults to `127.0.0.1`, configurable via `--host` / `-H`).
- `NewServer` also takes the shared `fs.FS` and the config file path, because route handlers need them to resolve paths the way the loader does.
- Resolve tool configuration directories with `Server.toolConfigsDirs` (which calls `vm.ResolveToolConfigsDirs`), never by reading `Paths.ToolConfigsDir` directly: that value may be a string or a list, and may hold `{configFileDir}`, a relative path, or a `~` path.
- Installers only receive a `ToolConfig`, so several hardcode `HasUpdate` and leave `LocalVersion` empty. Routes that report update state must compare against the installed version from the registry.

## Local gotchas

- Changes to dashboard client require running `bun compile` to re-bundle client assets into Go source.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `dashboard_test.go`.
- Ask first: changing REST API response schemas shared with the frontend.
- Never: hardcode client asset strings without going through build bundling.

## References

- `pkg/dashboard/routes.go`
