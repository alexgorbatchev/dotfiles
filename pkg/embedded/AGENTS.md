# pkg/embedded

Go `embed.FS` wrappers for shipped TypeScript declarations and the bundled dotfiles AI skill.

## Commands

- Test: `go test ./pkg/embedded/...`

## Local conventions

- `TypesFS` (`embed.FS`): embeds compiled TypeScript declaration files (`index.d.ts`, `globals.d.ts`) and `package.json` under `dist/`.
- `SkillFS` (`embed.FS`): embeds the single dotfiles skill and its reference documentation under `skill/`.
- Declaration files invariant: `TypesFS` contains only `globals.d.ts` and `index.d.ts`; `tool-types.d.ts` is generated per project and must never be embedded.
- Skill parity invariant (`embedded_test.go`): `TestSkillFSMirrorsCanonicalSkill` asserts that `SkillFS` embeds every file from `pkg/embedded/skill/` with identical content and no orphaned files. `TestAgentSkillSymlinkReadsEmbeddedSkill` verifies that the agent symlink resolves to this source and reads the same embedded files.
- Skill snippet type-checking (`skill_snippets_test.go`): all ` ```typescript ` and ` ```ts ` code blocks in embedded skill documentation are extracted, completed with appropriate preludes/wrappers based on their form tag (`builder`, `shell`, `body`, `config`, `no-typecheck`, or bare module), and type-checked against `TypesFS` declarations with the repository's native TypeScript compiler.

## Local gotchas

- **Skill files are maintained source:** Edit `pkg/embedded/skill/` directly or through `.agents/skills/dotfiles`, a relative symlink to `../../pkg/embedded/skill`. Keep the canonical directory real because Go embedding excludes symlinks. Builds copy it to `.dist/skill/` and preserve the source.
- **One bundled skill:** Keep tool-authoring instructions in `skill/SKILL.md` alongside the existing references. `dotfiles skill` prints that entrypoint and `dotfiles skill copy <path>` exports only `dotfiles/`. Author this skill in the current repository rather than global harness directories or the AI registry.
- **Untagged or unknown snippet tags fail tests:** Every code snippet in skill docs must be complete TypeScript or tagged with a valid form tag. Unknown tags or untagged syntax fragments will fail `TestSkillSnippetsTypeCheck`.

## Boundaries

- Always: automatically record all new instructions in the most appropriate `AGENTS.md` file immediately upon receipt (check with user if existing instructions conflict).
- Always: write matching unit tests in `embedded_test.go` or `skill_snippets_test.go`.
- Ask first: changing embedded asset directory structure or snippet compilation tags.
- Never: manually edit generated `pkg/embedded/dist/` files without updating build sources, or delete/regenerate maintained `pkg/embedded/skill/` content during asset preparation.

## References

- `pkg/embedded/embedded.go`
- `pkg/embedded/embedded_test.go`
- `pkg/embedded/skill_snippets_test.go`
