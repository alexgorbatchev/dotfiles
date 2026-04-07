---
name: project-release-debug
description: >-
  Debug `bun release` build and publish failures. Use when `bun release` or
  `bun release --dry-run` fails, or when the user reports issues with the
  release process including build errors, type test failures, bundle size
  limits, publish errors, or version bumping problems.
targets:
  - '*'
---

# Debugging `bun release`

## Always Use `--dry-run`

```bash
bun release --dry-run
```

This runs the full pipeline (version bump, build, type tests) but **skips `npm publish` and git commit/tag**. It reverts the version bump at the end.

**Critical:** `--dry-run` does NOT exercise `npm publish`. If the user reports a publishing failure, you cannot reproduce it with `--dry-run`. See [Publishing Failures](#publishing-failures) below.

## Release Pipeline

`bun release` → `packages/build/src/release/index.ts`

1. Bump version (`bun pm version patch --no-git-tag-version`)
2. Build (`bun run compile`)
3. **[skipped in dry-run]** Publish (`npm publish` from `.dist/`)
4. **[skipped in dry-run]** Git commit + tag

`bun run compile` → `packages/build/src/build/build.ts`

Sequential steps — failure at any step aborts:

| Step | What                          | Key file                                    |
| ---- | ----------------------------- | ------------------------------------------- |
| 1    | Install deps                  | `steps/ensureWorkspaceDependencies.ts`      |
| 2    | Clean `.dist/`                | `steps/cleanPreviousBuild.ts`               |
| 3    | Bundle CLI                    | `steps/buildCli.ts`                         |
| 4    | Resolve runtime deps          | `steps/resolveRuntimeDependencies.ts`       |
| 5    | Generate `schemas.d.ts`       | `steps/generateSchemaTypes.ts`              |
| 6    | Generate `.dist/package.json` | `steps/generateDistPackageJson.ts`          |
| 7    | Install `.dist/node_modules`  | `helpers/installDependenciesInOutputDir.ts` |
| 8    | Check bundle size (<=500KB)   | `steps/enforceCliBundleSizeLimit.ts`        |
| 9    | Copy skill to `.dist/skill/`  | `steps/copySkill.ts`                        |
| 10   | Generate `tool-types.d.ts`    | `steps/generateToolTypesFile.ts`            |
| 11   | Run tsd type tests            | `steps/runTypeTests.ts`                     |
| 12   | Test packed build             | `steps/testPackedBuild.ts`                  |
| 13   | Cleanup temp files            | `steps/cleanupTempFiles.ts`                 |
| 14   | Print summary                 | `steps/printBuildSummary.ts`                |

All steps live in `packages/build/src/build/steps/`.
All helpers live in `packages/build/src/build/helpers/`.

## Common Failure Points

### Type Test Failures (Step 11)

The most common failure. The build runs `tsd` against the **bundled** `.dist/schemas.d.ts`, not the source types.

**How it works:**

1. Collects all `*.test-d.ts` files from `packages/*/type-tests/`
2. Creates temp project in `.tmp/tsd-tests/` with symlink to `.dist`
3. Runs `bun x tsd --typings ./index.d.ts --files './**/*.test-d.ts'`

**Key difference from `bun typecheck`:** The bundled types in `.dist/schemas.d.ts` do NOT include module augmentations from other packages. Registries like `IKnownBinNameRegistry` resolve to their fallback types (e.g. `string` or `never`) in the bundled context.

**Debugging:** Read the failing `.test-d.ts` file and `.dist/schemas.d.ts` to understand how the type resolves differently in the bundled context.

### Bundle Size (Step 8)

CLI bundle must be <= 500KB. If exceeded, check for accidentally bundled dependencies that should be external.

### Packed Build Test (Step 12)

Runs CLI and dashboard from an `npm pack` tarball. Failures here mean the `files` field in `.dist/package.json` is missing required files, or runtime imports are unresolved.

## Publishing Failures

`--dry-run` **cannot reproduce publishing issues** because `npm publish` is entirely skipped.

For publish failures:

- Check `publishConfig.registry` in `packages/build/src/build/steps/generateDistPackageJson.ts`

- Run `npm publish --dry-run` manually from `.dist/` after a successful `bun release --dry-run` to test publishing without actually uploading

## Key Paths

| Path                                  | Purpose                              |
| ------------------------------------- | ------------------------------------ |
| `packages/build/src/release/index.ts` | Release orchestrator                 |
| `packages/build/src/build/build.ts`   | Build orchestrator                   |
| `packages/build/src/build/steps/`     | All build steps                      |
| `packages/build/src/build/helpers/`   | Build helpers                        |
| `.dist/`                              | Build output (published to registry) |
| `.dist/schemas.d.ts`                  | Bundled type definitions             |
| `.dist/package.json`                  | Generated package manifest           |
| `.tmp/tsd-tests/`                     | Temp directory for type tests        |
| `packages/*/type-tests/*.test-d.ts`   | Type test source files               |
