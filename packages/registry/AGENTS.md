# @dotfiles/registry

File, tool-installation, and usage registries that persist generated artifact and installation state.

## Commands

- Focused test: `bun test:native packages/registry/src/tool/__tests__/ToolInstallationRegistry.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep file and tool registries separated under `src/file/` and `src/tool/`; do not collapse them into one generic persistence layer.
- Use tracked file-system helpers where file writes must be recorded, instead of duplicating registration logic in callers.

## Local gotchas

- Registry records are cleanup and reporting inputs. If persistence shape changes, generation and installer callers can silently drift.

## Boundaries

- Ask first: changing database record shape, registry semantics, or usage tracking behavior.
- Never: write directly to registry tables from outside the registry package.

## References

- `README.md`
- `src/file/`
- `src/tool/`
- `src/tool/ToolInstallationRegistry.ts`
