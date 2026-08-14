---
name: dotfiles-release
description: Manage and debug the @alexgorbatchev/dotfiles release pipeline, GitHub Actions publishing, and local bun release builds.
---

# Dotfiles Release Pipeline

The release pipeline for `@alexgorbatchev/dotfiles` is automated using GitHub Actions
and local `bun run release` preparation scripts. The package is published automatically
to the public NPM registry (`registry.npmjs.org`) whenever a semantic version tag is pushed.

## Core Workflow

To trigger a release:

1. Ensure your git working directory is clean.
2. Run the release trigger script locally:
   ```bash
   bun run release        # Bumps patch version (e.g. 1.0.0 -> 1.0.1)
   # OR
   bun run release minor  # Bumps minor version (e.g. 1.0.0 -> 1.1.0)
   # OR
   bun run release major  # Bumps major version (e.g. 1.0.0 -> 2.0.0)
   ```
3. The script will automatically:
   - Calculate the new version
   - Verify the build compiles properly locally
   - Commit the `package.json` changes
   - Create a `vX.Y.Z` git tag
   - Push the commit and the tag to `origin/main`
4. Immediately create or edit the GitHub release with curated release notes. Do not leave the release on bare auto-generated notes.
   - Use `gh release create vX.Y.Z --title "Version X.Y.Z" --notes "..."` when creating the release manually.
   - If a release already exists, use `gh release edit vX.Y.Z --notes "..."` to replace the placeholder notes.
   - Write a short `## Summary` section and a `## Notable Commits Since vA.B.C` section covering the actual shipped changes in the `previous-tag...new-tag` range.
   - Include the compare link as `**Full Changelog**: https://github.com/alexgorbatchev/dotfiles/compare/vA.B.C...vX.Y.Z`.
5. The `.github/workflows/publish.yml` GitHub Action handles package publishing after the tag is pushed.

## Diagnostics & Dry Runs

Always test modifications or release processes locally first:

```bash
bun run release --dry-run
```

This runs the full pipeline (version bump, build `compile`, type tests) but **skips git commit and tagging**, reverting the version bump at the end.

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

- The package is compiled by `bun run compile`.
- The GitHub action uses NPM provenance to publish the package securely.
- You can manually test the publish command via:
  ```bash
  bun run release --dry-run
  cd .dist && npm publish --dry-run
  ```

## Binary Distribution Architecture

The CLI is distributed through two complementary channels:

### 1. NPM / Bun Optional Platform Packages

When compiled via `bun run compile` (`scripts/build/main.go`):

- Native Go binaries (`./cmd/dotfiles`) are compiled for target OS/architecture combinations (`darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`).
- Each binary is packaged into a platform subpackage (e.g. `@alexgorbatchev/dotfiles-darwin-arm64`) specifying `os` and `cpu` constraints in its `package.json`.
- The root `@alexgorbatchev/dotfiles` package lists all platform subpackages under `optionalDependencies`.
- Package managers (`npm`, `bun`, `pnpm`) inspect `os`/`cpu` and download only the subpackage matching the host system into `node_modules`.
- At runtime, `cli.js` resolves the subpackage binary via `import.meta.resolve` and spawns the native Go process with `spawnSync`.

### 2. Standalone GitHub Releases

The `.github/workflows/publish.yml` CI workflow attaches the compiled native Go binary directly to GitHub Releases (`vX.Y.Z`). The hosted installer (`curl -fsSL https://alexgorbatchev.github.io/dotfiles/install.sh | bash`) downloads this standalone binary directly without requiring Node.js or Bun.

## Build Process Deep Dive

The core compilation logic lives in `scripts/build/main.go`
(executed via `bun run compile`).

Sequential build steps (failure at any step aborts the workflow):

1. **Clean `.dist/` and `pkg/dashboard/dist/`**: removes previous build outputs
2. **Build Dashboard Client**: bundles Preact client with Bun into `pkg/dashboard/dist/`
3. **Run Typegen**: executes `go run scripts/typegen/main.go` to synchronize TS types with Go structs
4. **Generate schema types**: emits `.d.ts` declaration files into `.dist/`
5. **Generate package.jsons**: creates `.dist/package.json` and platform-specific subpackages
6. **Write launcher**: emits `cli.js` cross-platform Node launcher
7. **Copy skill & assets**: copies README, LICENSE, and `.agents/skills/dotfiles` into `.dist/`
8. **Run tsd type tests**: verifies type declarations with `tsd`
9. **Compile Go binaries**: compiles native Go binaries for all supported OS/arch targets (`./cmd/dotfiles`)
10. **Check binary size limit**: ensures binaries remain within the 26MB budget
11. **Print summary**: outputs build summary

### Common Build Failures

**Type Test Failures**
The build runs `tsd` against the generated `.d.ts` files in `.dist/`.
_Debugging_: Inspect failing `tests/type-tests/*.test-d.ts` test files and `.dist/index.d.ts` to see how declaration types diverge.

**Binary Size Exceeded**
Compiled Go binaries must remain within the 26MB budget per platform binary.

## Key Architecture Paths

- `scripts/release.ts`: Release trigger script (`bun run release`)
- `scripts/build/main.go`: Compilation orchestrator
- `scripts/typegen/main.go`: Go struct to TypeScript type generator
- `.dist/`: The resulting compiled output published to NPM and GitHub Releases
- `.github/workflows/publish.yml`: The remote CI publisher routine
- `.github/workflows/ci.yml`: The standard PR and commit check routine
