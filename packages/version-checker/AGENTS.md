# @dotfiles/version-checker

Version comparison and update-status helpers built around semantic version rules.

## Commands

- Focused test: `bun test:native packages/version-checker/src/__tests__/VersionChecker.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep comparison policy in `src/VersionChecker.ts` and interface surface in `src/IVersionChecker.ts`.
- If supported version formats change, update both comparison tests and the callers that surface update state.

## Local gotchas

- Version status drives user-facing update output. Changes that look cosmetic can alter CLI behavior and installer decisions.

## Boundaries

- Ask first: changing semver interpretation or update-status enum semantics.
- Never: special-case package-specific version formats here without a shared policy reason.

## References

- `README.md`
- `src/VersionChecker.ts`
- `src/IVersionChecker.ts`
- `src/__tests__/VersionChecker.test.ts`
