---
name: dotfiles-release
description: Manage and debug the @alexgorbatchev/dotfiles release pipeline, GitHub Actions publishing, and local bun release builds.
---

# Dotfiles Release Pipeline

The release pipeline for `@alexgorbatchev/dotfiles` is automated using GitHub Actions
and the local `scripts/release.ts` (`just release`) preparation script. Release archives
and checksums are built and published automatically to GitHub Releases whenever a semantic
version tag (`vX.Y.Z`) is pushed.

## Core Workflow

To trigger a release:

1. Ensure your git working directory is clean.
2. Run the release trigger script locally:
   ```bash
   just release        # Bumps patch version (e.g. 2.6.0 -> 2.6.1)
   # OR
   just release minor  # Bumps minor version (e.g. 2.6.0 -> 2.7.0)
   # OR
   just release major  # Bumps major version (e.g. 2.6.0 -> 3.0.0)
   ```
3. The script will automatically:
   - Calculate the new version
   - Verify the build compiles properly locally (`bun run compile`)
   - Commit the `package.json` changes
   - Create a `vX.Y.Z` git tag
   - Push the commit and the tag to `origin/main`
4. Immediately create or edit the GitHub release with curated release notes. Do not leave the release on bare auto-generated notes.
   - Use `gh release create vX.Y.Z --title "Version X.Y.Z" --notes "..."` when creating the release manually.
   - If a release already exists, use `gh release edit vX.Y.Z --notes "..."` to replace the placeholder notes.
   - Write a short `## Summary` section and a `## Notable Commits Since vA.B.C` section covering the actual shipped changes in the `previous-tag...new-tag` range.
   - Include the compare link as `**Full Changelog**: https://github.com/alexgorbatchev/dotfiles/compare/vA.B.C...vX.Y.Z`.
5. The `.github/workflows/publish.yml` GitHub Action handles building and uploading the release archives after the tag is pushed.
6. **MANDATORY**: Always check and verify that the release workflow has finished and actually produced and attached all compiled release binary assets and checksums:
   ```bash
   gh release view vX.Y.Z --json assets,name,tagName
   ```
   Confirm that all target platform archives (`dotfiles_X.Y.Z_darwin_amd64.tar.gz`, `dotfiles_X.Y.Z_darwin_arm64.tar.gz`, `dotfiles_X.Y.Z_linux_amd64.tar.gz`, `dotfiles_X.Y.Z_linux_arm64.tar.gz`) and `checksums.txt` are uploaded and valid.

## Diagnostics & Dry Runs

Always test modifications or release processes locally first:

```bash
bun scripts/release.ts --dry-run
```

This runs the full pipeline (version bump and `bun run compile`) but **skips git commit and tagging**, reverting the version bump at the end.

## Release Notes Standard

Every GitHub release should ship with hand-written notes, even when `gh` can generate defaults.

- Treat `--generate-notes` as a starting point at most, not the final output.
- Summarize user-visible changes first, not internal mechanics.
- Prefer 3-5 bullets in `## Summary`.
- Include the most important commits under `## Notable Commits Since vA.B.C`.
- Skip noise like pure release-version commits unless they matter operationally.
- If docs-only or infra-only changes shipped, say so explicitly instead of padding the summary.

## Publishing & CI Workflows

If the publish pipeline fails, the issue is within GitHub Actions (`.github/workflows/publish.yml`)
or the produced artifacts inside the compiled `.dist/` directory.

- The release artifacts are compiled by `bun run compile` (`just compile`).
- `.github/workflows/publish.yml` verifies that `package.json`'s `version` matches the `vX.Y.Z` tag, runs `bun run compile`, uploads `.dist/dotfiles_*.tar.gz` and `.dist/checksums.txt` to the GitHub Release, and marks the release as published/latest.
- You can manually test the release build locally via:
  ```bash
  bun scripts/release.ts --dry-run
  just test-build
  ```

## Build Process Deep Dive

The core compilation logic lives in `scripts/build/main.go`
(executed via `bun run compile` / `just compile`).

Sequential build steps (failure at any step aborts the workflow):

1. **Clean `.dist/`, `pkg/dashboard/dist/`, and `pkg/embedded/dist/`**: removes previous build outputs
2. **Build Dashboard Client**: bundles Preact client with Bun into `pkg/dashboard/dist/`
3. **Run Typegen**: executes `go run scripts/typegen/main.go` to synchronize TS types with Go structs
4. **Generate schema types**: emits `.d.ts` declaration files (`index.d.ts`, `globals.d.ts`) into `.dist/` and `pkg/embedded/dist/`
5. **Copy skill & assets**: copies `README.md`, `LICENSE`, and `pkg/embedded/skill/` into `.dist/`
6. **Compile Go binaries & archives**: compiles native Go binaries for all supported OS/arch targets (`./cmd/dotfiles`), packages `.tar.gz` archives into `.dist/`, measures every target's uncompressed binary against the size budget (`maxBinarySizeBytes` in `scripts/build/main.go`), and writes `.dist/checksums.txt`
7. **Print summary**: outputs build summary

Type declaration tests (`tsd`) are executed separately via `go run scripts/build/main.go --type-tests` (part of `just typecheck` and `TestRunBuild` in `just test-build`).

### Common Build Failures

**Type Test Failures**
`go run scripts/build/main.go --type-tests` runs `tsd` against the generated `.d.ts` files in `.dist/`.
_Debugging_: Inspect failing `tests/type-tests/*.test-d.ts` test files and `.dist/index.d.ts` to see how declaration types diverge.

**Binary Size Exceeded**
The build fails when any release target's binary is over `maxBinarySizeBytes`, and the error names each such binary with its size. See the binary size budget gotcha in `scripts/build/AGENTS.md` for what the budget is for and how to respond.

## Key Architecture Paths

- `scripts/release.ts`: Release trigger script (`just release` / `bun scripts/release.ts`)
- `scripts/build/main.go`: Compilation orchestrator
- `scripts/typegen/main.go`: Go struct to TypeScript type generator
- `docs/internal/architecture/binary-distribution.md`: Binary packaging and distribution design
- `.dist/`: The resulting compiled output uploaded to GitHub Releases
- `.github/workflows/publish.yml`: The remote CI publisher routine
- `.github/workflows/ci.yml`: The standard PR and commit check routine
