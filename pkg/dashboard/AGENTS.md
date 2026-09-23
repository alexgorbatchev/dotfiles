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
- `check-update` answers `{status, currentVersion, latestVersion, error?}`, where `status` is `orchestrator.CheckStatus` from `orchestrator.ClassifyCheck`, the same value `tool check --json` reports (`ToolCheckStatus` in `src/shared/types.ts`). `installer.ErrUpdateCheckUnsupported`, a tool with no installation method and one with update checks disabled answer `success: true` with status `unsupported` and an `error` saying why.
- `update` refuses a tool whose requested version (`config.ToolConfig.RequestedVersion`, a `version` install parameter the method reads or else `.version()`) pins anything other than `"latest"` (`config.ToolConfig.UpdateRefusal`, the check the CLI's `tool update` makes) before asking its installer, answering `success: false` with the refusal as `error`, like the route's other refusals.
- `update` decides through `orchestrator.PlanUpdate` and installs through `Orchestrator.ApplyUpdate`, the calls the CLI's `tool update <tool>` makes, never a check of its own: a tool that is not installed, an unknown installer or a failed check answers `success: false` and installs nothing, `installer.ErrUpdateCheckUnsupported` broadcasts the CLI's warning and reinstalls, and the answer (`IUpdateToolResponse`) carries `oldVersion`/`newVersion` from the installation records with `updated` meaning they differ, `status`/`latestVersion` what the check found (the same `orchestrator.CheckStatus` as check-update; an `ahead-of-latest` tool is left alone and broadcast as such, never "Already up to date"), and `reinstalled` whether the tool was installed again.
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
