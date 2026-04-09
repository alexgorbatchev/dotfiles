# @dotfiles/cli

CLI entrypoints, command wiring, and user-facing command behavior for the dotfiles toolchain.

## Commands

- Focused test: `bun test:native packages/cli/src/__tests__/generateCommand.test.ts`
- CLI smoke test against fixture config: `bun cli --config=test-project/dotfiles.config.ts generate`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep one command per file in `src/*Command.ts`; place shared CLI helpers beside the commands that use them rather than creating generic abstraction layers.
- Copy command test setup from `src/__tests__/generateCommand.test.ts` and `src/__tests__/executeCliCommand.ts` before inventing new harness code.

## Local gotchas

- CLI behavior is public surface. Any command, flag, completion, or output contract change must update tests and `.agents/skills/dotfiles/**` in the same change.

## Boundaries

- Ask first: adding/removing commands, changing user-facing output contracts, or altering completion behavior.
- Never: read `test-project/` from automated tests or add `console.*` in command implementations.

## References

- `README.md`
- `src/__tests__/generateCommand.test.ts`
- `src/defineTool.ts`
- `src/generateZshCompletion.ts`
