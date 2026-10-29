# pkg/shim

Wrapper script shim generator.

## Commands

- Test: `go test ./pkg/shim/...`

## Local conventions

- Generate executable shell wrappers that record usage and invoke binaries or trigger auto-installs.
- A shim's shebang names bash by absolute path (`Config.BashPath`), never `#!/usr/bin/env bash`: a shim runs under whatever PATH invokes its binary (launchd, cron, tests), and one without bash would fail before the shim starts. The orchestrator resolves it with `findSystemBinary("bash")`, which passes over this project's own shims and shim directory, so a dotfiles-managed bash never becomes another shim's interpreter. `Generate` rejects a relative path or one containing whitespace, which the kernel would split.
- Orchestrator and dashboard tests build their filesystem with the package's `newMemFS()`, which models a host with `/bin/bash`; a test that needs no bash, or a specific one, uses `fs.NewMemFS()` and writes what it needs.
- A shim's `@update` runs `tool update --shim-mode` and prints nothing of its own: only the CLI knows whether the tool is pinned, current or updated, and `--shim-mode` reports that outcome.

## Local gotchas

- Executing a shim for an uninstalled binary in a subshell can cause recursive install loops -> use recursion guard environment variables (`DOTFILES_INSTALLING_<TOOL>`).
- `Generator.Generate` fails when the shim's directory is missing, and it never creates the usage-log directory. That is deliberate: the orchestrator hands it a tool-scoped tracked filesystem, so a `MkdirAll` here records `paths.targetDir` and the usage-log directory as shims owned by that tool, which the next `generate` then removes as stale. Both directories are provisioned by `Orchestrator.ensureShimDirs` under the `"system"` owner -> fix a missing-directory error there, never by creating directories in this package.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `shim_test.go`.
- Ask first: modifying the embedded shim script template (`shim.tmpl`).
- Never: remove the recursion guard from generated shims; create directories from `Generator.Generate`.

## References

- `pkg/shim/shim.go`
- `pkg/shim/shim.tmpl`
