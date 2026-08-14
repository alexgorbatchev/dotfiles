# pkg/shim

Wrapper script shim generator.

## Commands

- Test: `go test ./pkg/shim/...`

## Local conventions

- Generate executable shell wrappers that record usage and invoke binaries or trigger auto-installs.

## Local gotchas

- Executing a shim for an uninstalled binary in a subshell can cause recursive install loops -> use recursion guard environment variables (`DOTFILES_INSTALLING_<TOOL>`).

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict)
- Always: write matching unit tests in `shim_test.go`.
- Ask first: modifying the embedded shim script template (`shim.tmpl`).
- Never: remove the recursion guard from generated shims.

## References

- `pkg/shim/shim.go`
- `pkg/shim/shim.tmpl`
