# @dotfiles/tool-config-builder

Fluent builder API for declarative `.tool.ts` definitions and shell configuration composition.

## Commands

- Focused test: `bun test:native packages/tool-config-builder/src/__tests__/toolConfigBuilder.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep builder entrypoints in `src/toolConfigBuilder.ts` and shell-specific builder behavior in `src/ShellConfigurator.ts`.
- When installation-method support changes, update builder typing, schema expectations, and example-driven tests together.

## Local gotchas

- This package defines authoring ergonomics for `.tool.ts` files. Small API changes ripple into user configs and generated type helpers.

## Boundaries

- Ask first: changing fluent API shape, method names, or platform-override behavior.
- Never: add compatibility chains for retired builder methods.

## References

- `README.md`
- `src/toolConfigBuilder.ts`
- `src/ShellConfigurator.ts`
- `src/createInstallFunction.ts`
