# @dotfiles/build

Build and release tooling for the publishable `.dist/` output.

## Quick start

- Build distributable: `bun compile`
- Release build: `bun release`
- Output directory: `.dist/`

## What the build produces

`bun compile` now produces **two distributable forms** from the same source tree:

1. **npm/package-managed distribution**
   - Bun ESM entry at `.dist/cli.js`
   - runtime dependencies installed from `.dist/package.json`
   - dashboard chunks/assets emitted alongside the JS entry

2. **Standalone compiled binary**
   - native executable at `.dist/dotfiles`
   - embedded dashboard assets
   - embedded authoring declaration payload used to generate `.generated/authoring-types.d.ts` for binary-only projects

## Key outputs

The build writes these artifacts into `.dist/`:

- `cli.js` and `cli.js.map` — bundled CLI entry for the npm/package-managed distribution
- `dashboard.js`, `dashboard-*.js`, `dashboard-*.css`, `cli-*.js`, `prerender-*.js` — dashboard assets for the JS distribution
- `dotfiles` — compiled standalone binary
- `schemas.d.ts` — bundled public schema/config declarations for the published package
- `authoring-types.d.ts` — bundled authoring declarations embedded into the standalone binary
- `tool-types.d.ts` — generated tool-registry augmentation file for the published package output
- `package.json` — publishable/runtime manifest for `.dist/`
- `README.md`, `LICENSE`, `.agents/skills/**` — shipped support files

## Build pipeline overview

The build orchestration lives in `packages/build/src/build/build.ts` and runs these stages in order:

1. Ensure workspace dependencies
2. Clean previous build output
3. Build the JS CLI distribution
4. Resolve external runtime dependencies from the emitted JS bundle
5. Generate declaration bundles
   - `schemas.d.ts`
   - `authoring-types.d.ts`
6. Generate `.dist/package.json`
7. Install runtime dependencies into `.dist/`
8. Enforce CLI JS bundle size budget
9. Copy shipped docs/skills/assets
10. Generate `.dist/tool-types.d.ts`
11. Run type-level validation (`tsd`)
12. Smoke-test the packed npm/package-managed distribution
13. Build the standalone compiled binary
14. Smoke-test the standalone compiled binary
15. Clean temporary files
16. Print build summary

## Declaration outputs

### `schemas.d.ts`

This is the public declaration bundle for the publishable package. It matches the npm/package-managed distribution and can keep some imports external where appropriate.

### `authoring-types.d.ts`

This is a separate authoring-focused declaration bundle derived from the real authoring surface, not from a hand-maintained shim.

It is used by the compiled binary only:

- the build embeds its contents into `.dist/dotfiles`
- `dotfiles generate` writes `.generated/authoring-types.d.ts` when running from the standalone binary
- generated `.generated/tool-types.d.ts` references that file automatically

Binary-only projects should still include only `.generated/tool-types.d.ts` in their `tsconfig.json`; the supporting declaration file is generated and referenced automatically.

## Dashboard behavior

The dashboard uses Bun HTML imports:

```typescript
import clientApp from "../client/dashboard.html";
```

That leads to two runtime modes:

- **JS/npm distribution**: dashboard chunks are emitted to disk beside `cli.js`, and production dashboard serving still uses the existing on-disk asset workaround.
- **Compiled binary**: dashboard assets are embedded into the executable, and compiled mode skips the on-disk chunk workaround and serves the embedded assets instead.

If dashboard bundling changes, validate both paths:

- packed npm/package-managed dashboard smoke test
- compiled-binary dashboard smoke test

## Smoke tests performed by the build

### Packed npm/package-managed smoke test

The build packs `.dist/`, installs it into a temporary environment, and verifies:

- `bun <packed cli.js> --version`
- dashboard startup and `/api/health`
- HTML response from `/`
- emitted JS/CSS asset fetches from the packed environment

### Standalone compiled-binary smoke test

The build creates a temporary binary-only project and verifies:

- `generate` succeeds
- `.generated/tool-types.d.ts` is created
- `.generated/authoring-types.d.ts` is created
- generated tool types reference the supporting authoring file
- the generated project typechecks using only `.generated/tool-types.d.ts`
- dashboard startup and embedded asset serving work from the compiled binary

## Important implementation boundaries

- Orchestration belongs in `src/build/build.ts`
- procedural stages belong in `src/build/steps/`
- reusable helpers belong in `src/build/helpers/`
- never hand-edit `.dist/`; change sources and rerun `bun compile`

## Troubleshooting

- **Compiled project cannot resolve the public authoring imports during typecheck**
  - rerun `dotfiles generate` from the standalone binary so `.generated/tool-types.d.ts` and `.generated/authoring-types.d.ts` are refreshed

- **Nested helper imports fail only in standalone mode**
  - the compiled loader now rewrites the reachable local module graph, not just the entry file; if this regresses, verify both focused config-loader tests and the compiled-binary smoke project

- **Dashboard runtime failure in JS/package-managed mode**
  - verify the on-disk emitted asset path and the production asset-serving workaround

- **Dashboard runtime failure in compiled mode**
  - verify the compiled binary smoke test, because compiled mode relies on embedded assets instead of `process.chdir(import.meta.dir)` chunk serving

- **Schema or authoring declaration bundle failures**
  - check the temporary declaration emit, `dts-bundle-generator` configuration, and the resolved generated entry declaration paths

- **Bundle size failure**
  - usually means external runtime dependencies were accidentally bundled into `.dist/cli.js`
