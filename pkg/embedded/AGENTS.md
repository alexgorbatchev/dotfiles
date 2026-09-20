# pkg/embedded

Go `embed.FS` wrappers for shipped TypeScript declarations and default dotfiles AI skill documentation.

## Commands

- Test: `go test ./pkg/embedded/...`

## Local conventions

- `TypesFS` (`embed.FS`): embeds compiled TypeScript declaration files (`index.d.ts`, `globals.d.ts`) and `package.json` under `dist/`.
- `SkillFS` (`embed.FS`): embeds the default dotfiles AI skill files and documentation under `skill/`.
- Declaration files invariant: `TypesFS` contains only `globals.d.ts` and `index.d.ts`; `tool-types.d.ts` is generated per project and must never be embedded.
- Skill snippet type-checking (`skill_snippets_test.go`): all ` ```typescript ` and ` ```ts ` code blocks in embedded skill documentation are extracted, completed with appropriate preludes/wrappers based on their form tag (`builder`, `shell`, `body`, `config`, `no-typecheck`, or bare module), and type-checked against `TypesFS` declarations with the repository's native TypeScript compiler.

## Local gotchas

- **Do not edit `pkg/embedded/skill/` directly:** `.agents/skills/dotfiles/` is the source of truth. `scripts/build/main.go` copies it into `pkg/embedded/skill/` during compilation; hand-edits in `pkg/embedded/skill/` are overwritten on next compile.
- **Untagged or unknown snippet tags fail tests:** Every code snippet in skill docs must be complete TypeScript or tagged with a valid form tag. Unknown tags or untagged syntax fragments will fail `TestSkillSnippetsTypeCheck`.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
- Always: write matching unit tests in `embedded_test.go` or `skill_snippets_test.go`.
- Ask first: changing embedded asset directory structure or snippet compilation tags.
- Never: manually edit `pkg/embedded/dist/` or `pkg/embedded/skill/` files directly without updating build sources.

## References

- `pkg/embedded/embedded.go`
- `pkg/embedded/embedded_test.go`
- `pkg/embedded/skill_snippets_test.go`
