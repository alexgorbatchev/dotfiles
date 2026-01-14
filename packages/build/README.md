# @dotfiles/build

Build scripts and utilities for the dotfiles project.

## Build process

This section describes how `bun run build` produces the distributable CLI bundle.

### Quick start

- Build: `bun run build`
- Output: `.dist/`

### Goals

- Produce a single executable Bun ESM bundle for the CLI (`.dist/cli.js`).
- Generate bundled type declarations for schemas/config (`.dist/schemas.d.ts`).
- Ensure runtime dependencies are externalized correctly and recorded in `.dist/package.json`.
- Keep the CLI bundle under a size budget to prevent accidental dependency bundling.

### Key outputs

The build writes the following artifacts to `.dist/`:

- `cli.js` and `cli.js.map`: the bundled CLI entry.
- `schemas.d.ts`: bundled schema/config declaration output.
- `tool-types.d.ts`: generated tool type declarations.
- `package.json`: a publishable/runtime package manifest for the `.dist` folder.
- `docs/`: a copy of the user documentation shipped with the output.

At the end of the build, a summary is printed showing the generated files and their sizes in KB.

### Entry points and structure

The build implementation lives in this package:

- Orchestrator: `packages/build/src/build/build.ts`
- Steps: `packages/build/src/build/steps/*.ts`
- Helpers: `packages/build/src/build/helpers/*.ts`

The orchestrator wires together steps in a fixed order. Steps are procedural and log user-facing progress. Helpers encapsulate shared utilities.

### Pipeline overview

The build runs these stages in order:

1. Ensure workspace dependencies
2. Clean previous build output
3. Build the CLI bundle
4. Analyze runtime dependencies from the emitted bundle
5. Generate schema types (`schemas.d.ts`)
6. Generate output `package.json`
7. Enforce the CLI bundle size limit
8. Copy docs into the output directory
9. Generate `tool-types.d.ts`
10. Run type-level validation (`tsd`)
11. Smoke-test the built CLI
12. Cleanup temporary files
13. Print build summary

The details below correspond to those stages.

### 1) Workspace dependencies

The build starts by ensuring the repo dependencies are installed (`bun install`). This makes the build deterministic on a fresh checkout and ensures required tooling is present.

### 2) Clean output

If `.dist/` exists, it is removed to avoid stale artifacts influencing the result.

### 3) Build CLI bundle

The CLI is built via `Bun.build` into `.dist/cli.js`.

Externalization policy:

- All `@dotfiles/*` packages are bundled into the CLI output.
- All other non-relative bare imports are externalized (kept as runtime dependencies).

After the build succeeds, the step:

- Makes `cli.js` executable.
- Prints bundled dependency analysis (derived from the source map).
- Prints external dependency analysis (derived from the emitted bundle import specifiers).

### 4) Resolve runtime dependencies

Runtime dependencies are derived from the emitted `cli.js` and resolved to installed versions using Bun tooling.

This step produces:

- The list of external runtime dependency names.
- A `name -> version` map for those external dependencies.
- Versions for a small set of special-case dependencies used by later steps (e.g. types).

### 5) Generate schema types (`schemas.d.ts`)

Schema type generation is a multi-stage process:

- Declaration emit happens first (via `tsgo`) to generate `.d.ts` files for the schema entry.
- A temporary workspace is created to make subsequent bundling/validation deterministic.
  - This is important because schema bundling can otherwise work by accident depending on what is available from the root workspace installation and how tolerant the bundler is to unresolved externals.
- `dts-bundle-generator` bundles the emitted declarations into `.dist/schemas.d.ts`.

The bundler is configured to keep specific modules external (and not inline them into the declarations) to match how the runtime package is structured.

### 6) Generate `.dist/package.json`

The build writes a publishable/runtime `package.json` into `.dist/`.

- `dependencies` is populated from the external runtime dependency list detected from `cli.js`.
- Some dependencies are intentionally pinned/hard-included (for example, required `@types/*` entries).

### 7) Enforce bundle size budget

The build fails if `.dist/cli.js` exceeds the configured size limit.

This guard is meant to catch accidental bundling of external packages (for example, if a non-`@dotfiles/*` dependency is pulled into the bundle unexpectedly).

### 8) Copy docs

The `docs/` folder is copied into `.dist/docs/` so the output package can ship documentation alongside the CLI.

### 9) Generate tool types

A `tool-types.d.ts` file is generated into `.dist/` to provide additional declaration surface for tooling.

### 10) Type tests (`tsd`)

A temporary `tsd` project is created and `tsd` is executed against the built output to validate that type tests in workspace packages still pass.

### 11) Smoke test the built CLI

The build runs the built `.dist/cli.js` with `--version` to ensure it executes.

### 12) Cleanup

Temporary build files and directories created during schema generation and type testing are removed.

### 13) Build summary

Finally, the build prints a summary of the files in `.dist/` including their sizes in KB.

### Troubleshooting

- Bundle size failure: indicates that external dependencies are likely being bundled into `cli.js`. Review the externalization rules and the printed dependency analysis.
- Schema type generation failures: often relate to declaration emit output location or bundling configuration. Confirm that the schema export declaration file is generated and that temporary workspace install steps ran.
- Type test failures: run `bun run build` again with a clean `.dist/` and ensure workspace dependencies are installed.

## Scripts

- `build` - Builds the CLI application
- `analyze-deps` - Analyzes workspace package dependencies
- `publish` - Publishes the package to npm
- `release` - Creates a release build
- `version` - Bumps the package version

## Utilities

- `extractTypeAliasSignature` - Extracts TypeScript type alias signatures
- `git-utils` - Git repository utilities
- `path-utils` - Path manipulation utilities
