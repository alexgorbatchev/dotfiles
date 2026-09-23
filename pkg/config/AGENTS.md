# pkg/config

Project and tool configuration structures, platform resolution, and context helpers.

## Commands

- Test: `go test ./pkg/config/...`

## Local conventions

- Accept interfaces, return concrete structs in Go functions.
- Wrap errors with context using `%w` (`fmt.Errorf("action: %w", err)`).
- Ensure configuration JSON tags accurately reflect the expected project and tool config schema and reject unknown fields during decoding.
- `ToolConfig.RequestedVersion` is the only reading of which version an installation asks for: the `version` install parameter for github-release, gitea-release, apt, dnf, pacman and npm, `source.version` of a github-release `source` for dmg and pkg, each winning over `.version()`, which is the requested version for every other method. The orchestrator's installation record and already-installed check read it too. Its one writer is `ToolConfig.WithRequestedVersion`, which `tool update` and the dashboard's update route use to install a chosen release on a copy of the configuration; never set `Version` or `InstallParams["version"]` by hand for that, since a `version: "latest"` parameter (or dmg/pkg `source.version`) would win over it. `UpdateRefusal` treats anything it names other than `"latest"` as a pin, so a method that starts reading a version parameter is added to `requestedVersion`, never read on the side.

## Local gotchas

- Modifying `ToolConfig` struct field JSON tags without updating typegen breaks TypeScript type generation -> run `bun compile` after changing config structs.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `config_test.go` for any config struct modifications.
- Ask first: changing public project configuration options or path schema.
- Never: break JSON serialization contracts for `ProjectConfig` or `ToolConfig`.

## References

- `pkg/config/config.go`
- `pkg/config/config_test.go`
