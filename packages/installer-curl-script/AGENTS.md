# @dotfiles/installer-curl-script

Installer plugin for tools distributed through downloadable shell install scripts.

## Commands

- Focused test: `bun test:native packages/installer-curl-script/src/__tests__/CurlScriptInstallerPlugin.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep script execution flow in `src/installFromCurlScript.ts` and parameter validation in `src/schemas/`.
- Hook timing matters here: cover `before-install` and `after-download` behavior whenever shell execution changes.

## Local gotchas

- Downloaded script execution is high-risk by nature. Preserve validation and explicit shell selection instead of broadening accepted inputs casually.

## Boundaries

- Ask first: expanding allowed shells or changing hook sequencing for script installs.
- Never: pipe remote scripts straight to a shell outside the controlled install flow.

## References

- `README.md`
- `src/installFromCurlScript.ts`
- `src/CurlScriptInstallerPlugin.ts`
- `src/schemas/`
