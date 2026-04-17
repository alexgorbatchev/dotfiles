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

## Build Process Deep Dive

The core compilation logic lives in `packages/build/src/build/build.ts`
(executed via `bun run compile`).

Sequential build steps (failure at any step aborts the workflow):

1. **Install deps**: `steps/ensureWorkspaceDependencies.ts`
2. **Clean `.dist/`**: `steps/cleanPreviousBuild.ts`
3. **Bundle CLI**: `steps/buildCli.ts`
4. **Resolve runtime deps**: `steps/resolveRuntimeDependencies.ts`
5. **Generate `schemas.d.ts`**: `steps/generateSchemaTypes.ts`
6. **Generate `.dist/package.json`**: `steps/generateDistPackageJson.ts`
7. **Install `.dist/node_modules`**: `helpers/installDependenciesInOutputDir.ts`
8. **Check bundle size (<=500KB)**: `steps/enforceCliBundleSizeLimit.ts`
9. **Copy skill to `.dist/skill/`**: `steps/copySkill.ts`
10. **Generate `tool-types.d.ts`**: `steps/generateToolTypesFile.ts`
11. **Run tsd type tests**: `steps/runTypeTests.ts`
12. **Test packed build**: `steps/testPackedBuild.ts`
13. **Cleanup temp files**: `steps/cleanupTempFiles.ts`
14. **Print summary**: `steps/printBuildSummary.ts`

### Common Build Failures

**Type Test Failures (Step 11)**
The build runs `tsd` against the **bundled** `.dist/schemas.d.ts`, not the source types.
_Debugging_: Inspect the failing `packages/*/type-tests/*.test-d.ts` test files and `.dist/schemas.d.ts` to see how the bundled types diverge.

**Bundle Size Exceeded (Step 8)**
The total CLI bundle must be `<= 500KB`. Check for accidentally bundled thick dependencies that should have been marked external.

**Packed Build Test (Step 12)**
This executes the CLI using an `npm pack` tarball to simulate what the user downloads. A failure here indicates the `files` array or `main`/`bin` mappings in `.dist/package.json` are incorrect.

## Key Architecture Paths

- `packages/build/src/release/index.ts`: Trigger script logic (`bun run release`)
- `packages/build/src/build/build.ts`: Compilation orchestrator
- `packages/build/src/build/steps/`: Individual build steps
- `packages/build/src/build/helpers/`: Build pipeline utilities
- `.dist/`: The resulting compiled output that is published to NPM
- `.github/workflows/publish.yml`: The remote CI publisher routine
- `.github/workflows/ci.yml`: The standard PR and commit check routine
