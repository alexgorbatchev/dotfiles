# pkg/config

Project and tool configuration structures, platform resolution, and context helpers.

## Commands

- Test: `go test ./pkg/config/...`

## Local conventions

- Accept interfaces, return concrete structs in Go functions.
- Wrap errors with context using `%w` (`fmt.Errorf("action: %w", err)`).
- Ensure configuration JSON tags accurately reflect the expected project and tool config schema and reject unknown fields during decoding.
- `ToolConfig.RequestedVersion` is the only reading of which version an installation asks for: the `version` install parameter for github-release, gitea-release, apt, dnf, pacman, npm, and uv, `source.version` of a github-release `source` for dmg and pkg, each winning over `.version()`, which is the requested version for every other method. The orchestrator's installation record and already-installed check read it too. Its one writer is `ToolConfig.WithRequestedVersion`, which `tool update` and the dashboard's update route use to install a chosen release on a copy of the configuration; never set `Version` or `InstallParams["version"]` by hand for that, since a `version: "latest"` parameter (or dmg/pkg `source.version`) would win over it. `UpdateRefusal` treats anything it names other than `"latest"` as a pin, so a method that starts reading a version parameter is added to `requestedVersion`, never read on the side.
- `ToolConfig.Validate` is the one per-tool check, and `ValidateToolConfigs` the one loop over it: both configuration loaders (`vm.LoadTypeScriptConfig` and the JSON branch of `BootstrapServices` in `cmd/dotfiles/bootstrap.go`) call it and fail the load naming the file the tool came from (its `.tool.ts` file, or the JSON configuration file), so nothing downstream sees a tool that fails it. Add a new per-tool rule to `Validate` (install-parameter rules as a case of the `validateInstallParams` switch), never as a second loop over the tools in the loader or as a hand-written check in `tool validate`. Every newly rejected configuration is a load-time behaviour change: document it on the declaration's canonical page and call it out in the release notes.
- A rule no single tool can check lives in `ValidateToolConfigs` after the per-tool loop, the way `validateFileClaims` (`file_claims.go`) rejects two declarations, of one tool or of two, that write one file. It takes the project configuration with its paths already resolved, so the JSON branch of `BootstrapServices` validates after `ProjectConfig.ResolvePlaceholders`. The check reads declared targets through `ResolveTargetPath`, the function the orchestrator writes every symlink, copy, template, block and directory through, so the check and the engine agree on which file a spelling names; code that writes a declaration resolves its target only through it. `ToolConfig.IsActive` (with `MatchesHostname`) is the reading of whether this machine carries a tool out.

- `installMethods` (`install_params.go`, read through `InstallMethods()`) is the canonical list of installation method names, and `ToolConfig.Validate` rejects any other non-empty `InstallationMethod`. pkg/vm cannot consult `installer.DefaultRegistry()` (pkg/installer imports pkg/vm), so tests pin the list to that registry (`pkg/installer`) and to the `InstallMethod` union in `pkg/vm/dsl-types.ts` (`pkg/vm`); a new installer adds its name to all three. Code after the load treats a failed installer lookup as an internal error, never as a user-facing warning.
- `ToolConfig.CargoSources` (`cargo_params.go`) is the one reading of a cargo tool's `binarySource`, `versionSource` (with its default from the binary source and `cargoTomlUrl`), `githubRepo` and `cargoTomlUrl`, and rejects a value outside `CargoBinarySources()` / `CargoVersionSources()` or a source without the parameter it reads. `validateInstallParams` calls it at load, and `CargoInstaller.Install` (before the dry run returns) and `CheckUpdate` call it again for a tool that never came through a loader. Tests pin the lists to the installer's dispatch (`TestCargoHandlesEveryConfigSource`) and to `ICargoInstallParams` in `pkg/vm/dsl-types.ts` (`TestCargoSourceDeclarationsMatchConfig`); a new source is added to all three.

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
