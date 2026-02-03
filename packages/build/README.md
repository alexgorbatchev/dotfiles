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
- `dashboard.js`: the dashboard HTML entry (processed by Bun at runtime).
- `dashboard-*.js`: dashboard client chunks (Preact components).
- `cli-*.js`: Preact runtime chunks used by the dashboard.
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

#### Dashboard Integration

The CLI includes an embedded dashboard (a web UI for managing tools). The dashboard uses **Bun's HTML import feature**, which requires specific build configuration:

```typescript
// In dashboard-server.ts
import clientApp from '../client/dashboard.html';
```

When Bun encounters this import at runtime, it automatically bundles the HTML file and its referenced scripts (Preact components). This is a runtime feature, not a build-time bundling step.

##### Build Configuration for Dashboard Support

1. **Plugin Filter (`/^[^./]/`)**: The externalization plugin must only intercept "bare imports" (package names like `lodash`), not relative paths. Using a catch-all filter like `/.*/` would intercept the HTML import and cause build failures.

2. **Code Splitting (`splitting: true`)**: Required for Bun to properly handle HTML imports and generate separate chunks for client code.

3. **Preact Bundling**: The `preact` and `preact-iso` packages are explicitly bundled (not externalized) because the dashboard client needs them at runtime in the browser context.

4. **JSX Configuration**: Configured for Preact with automatic runtime to support the dashboard's TSX components.

##### Output Files

The build produces:

- `cli.js` - The CLI entry point bundle
- `dashboard.js` - The dashboard HTML entry (processed by Bun at runtime)
- `dashboard-*.js` - Dashboard client chunks (Preact components)
- `cli-*.js` - Preact runtime chunks shared by the dashboard

##### Dashboard Build Test

The build includes a test step that:

1. Starts the built CLI with the `dashboard` command
2. Verifies the server responds to health checks
3. Verifies HTML is served correctly

**Important**: The dashboard server automatically changes to the package directory before starting. This is because Bun's HTML import generates chunk files with relative paths (like `./dashboard-*.js`) that are resolved from the current working directory. The `import.meta.dir` at runtime points to the directory containing the bundled `cli.js`, which is where the chunk files are located.

#### Externalization policy

- All `@dotfiles/*` packages are bundled into the CLI output.
- Dashboard dependencies (`preact`, `preact-iso`) are bundled into the output.
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

### 11.1) Test the built dashboard

The build starts the dashboard server and verifies:

- The `/api/health` endpoint responds with valid JSON
- The root `/` endpoint returns HTML content

This test runs from the `.dist/` directory to ensure chunk files are accessible.

### 12) Cleanup

Temporary build files and directories created during schema generation and type testing are removed.

### 13) Build summary

Finally, the build prints a summary of the files in `.dist/` including their sizes in KB.

### Troubleshooting

- **Bundle size failure**: indicates that external dependencies are likely being bundled into `cli.js`. Review the externalization rules and the printed dependency analysis.

- **Dashboard build failure ("No matching export in index.html")**: The plugin filter is likely catching HTML imports. Ensure the filter is `/^[^./]/` (bare imports only), not `/.*/` (all imports).

- **Dashboard runtime failure ("Bundled file not found")**: Bun's HTML import generates chunks with relative paths that are resolved from CWD. The dashboard server must change to the package directory before serving. This is handled automatically via `process.chdir(import.meta.dir)` in `dashboard-server.ts`.

- **Dynamic import causing extra chunks**: Check for `await import(...)` statements. Dynamic imports cause Bun to split code into separate chunks. Convert to static imports if the split is unwanted.

- **Schema type generation failures**: often relate to declaration emit output location or bundling configuration. Confirm that the schema export declaration file is generated and that temporary workspace install steps ran.

- **Type test failures**: run `bun run build` again with a clean `.dist/` and ensure workspace dependencies are installed.

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
