# @dotfiles/arch

Architecture and platform asset-matching helpers used by installer plugins when they choose release artifacts.

## Commands

- Focused test: `bun test:native packages/arch/src/__tests__/getArchitectureRegex.test.ts`
- Full repo check before sign-off: `bun check`

## Local conventions

- Keep pattern generation in `src/getArchitecturePatterns.ts` and regex assembly in `src/createArchitectureRegex.ts` / `src/getArchitectureRegex.ts`; do not mix selection policy into those helpers.
- When changing match behavior, update `src/matchesArchitecture.ts` and `src/selectBestMatch.ts` together so filtering and tie-breaking stay aligned.

## Local gotchas

- Variant ordering is observable installer behavior. If you change preferred variants, update the selection tests before touching callers.

## Boundaries

- Ask first: changing `SystemInfo` semantics or asset precedence, because installer resolution changes across multiple packages.
- Never: hardcode project-specific release naming rules outside the pattern and variant helpers.

## References

- `README.md`
- `src/getArchitecturePatterns.ts`
- `src/selectBestMatch.ts`
