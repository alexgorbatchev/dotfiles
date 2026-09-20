# pkg/typecheck

TypeScript compiler orchestration, generated `tsconfig.json` rendering, and diagnostic output parsing for dotfiles configurations.

## Commands

- Test: `go test ./pkg/typecheck/...`

## Local conventions

- TSConfig generation (`Program.TSConfig`): renders `tsconfig.json` under `.generated/` targeting `ESNext`, `moduleResolution: "bundler"`, `strict: true`, `noEmit: true`, and path mappings for `@alexgorbatchev/dotfiles` and `@dotfiles/cli`.
- Isolated globals: `types` compiler option is explicitly empty (`"types": []`) to prevent ambient Node or Bun type definitions from introducing invalid global symbols. Declarations rely on `globals.d.ts` and `index.d.ts`.
- TypeScript compiler runner (`Run`): executes compiler with `--pretty false -p <tsconfigPath>`, setting working directory so reported file paths remain relative to project root.
- Diagnostic parser (`ParseDiagnostics`): parses compiler output matching `<file>(<line>,<col>): error <code\>: <message\>` and multiline indented message continuations into structured `Diagnostic` structs.

## Local gotchas

- TypeScript compilation in tests requires an on-disk project and the repository's native compiler binary (`testutil.FindTypeScriptCompiler`); in-memory unit tests skip subprocess compiler execution.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
- Always: write matching unit tests in `typecheck_test.go`.
- Ask first: changing `tsconfig.json` compiler options or package path mappings.
- Never: populate `types` in generated `tsconfig.json` with external node/bun types.

## References

- `pkg/typecheck/typecheck.go`
- `pkg/typecheck/typecheck_test.go`
