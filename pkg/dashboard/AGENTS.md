# pkg/dashboard

Go backend REST API routes and embedded dashboard client server.

## Commands

- Test: `go test ./pkg/dashboard/...`
- Start server: `go run ./cmd/dotfiles --config test-project/dotfiles.config.ts dashboard`

## Local conventions

- Embed compiled React/Preact client assets from `pkg/dashboard/dist/`.
- `NewServer` accepts configurable `host` address (defaults to `127.0.0.1`, configurable via `--host` / `-H`).
- `NewServer` also takes the shared `fs.FS` and the config file path, because route handlers need them to resolve paths the way the loader does.
- Resolve tool configuration directories with `Server.toolConfigsDirs` (which calls `PathsConfig.GetToolConfigsDirs`), never by reading `Paths.ToolConfigsDir` directly: that value may be a string or a list. Placeholders, `~` and relative paths are already resolved by `ProjectConfig.ResolvePlaceholders` when the loader hands the configuration over.
- Installers only receive a `ToolConfig`, so most leave `LocalVersion` empty. Routes that report update state must compare against the installed version from the registry.
- `check-update` answers `installer.ErrUpdateCheckUnsupported` (and a tool with no installation method or with update checks disabled) with `success: true` and `supported: false` plus an `error` saying why, the shape v1 used; `hasUpdate: false` then says nothing about the tool.
- `update` refuses a tool whose `.version()` pins anything other than `"latest"` (`config.ToolConfig.UpdateRefusal`, the check the CLI's `tool update` makes) before asking its installer, answering `success: false` with the refusal as `error`, like the route's other refusals.
- `Server.SetVersion` sets the CLI release version reported in the `/api/config` response (`version`).

## Local gotchas

- Changes to dashboard client require running `bun compile` to re-bundle client assets into Go source.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `dashboard_test.go`.
- Ask first: changing REST API response schemas shared with the frontend.
- Never: hardcode client asset strings without going through build bundling.

## References

- `pkg/dashboard/routes.go`
