/**
 * Main Build Script
 *
 * Bundles the CLI application into a standalone distributable package.
 *
 * This script performs the following operations:
 * 1. Cleans previous build artifacts from .dist directory
 * 2. Installs workspace dependencies
 * 3. Bundles the CLI entry point (packages/cli/src/main.ts) into a minified executable
 * 4. Generates TypeScript schema types for tool configuration (ProjectConfig)
 * 5. Creates package.json with proper exports and dependencies
 * 6. Validates generated schemas with tsd type tests
 * 7. Tests the built CLI executable
 * 8. Outputs build summary with list of generated files
 *
 * Output: Creates .dist directory containing:
 * - cli.js (bundled executable)
 * - cli.js.map (source map)
 * - schemas.d.ts (TypeScript definitions for tool configurations)
 * - package.json (npm package metadata)
 *
 * Usage:
 *   bun run build
 */

/** biome-ignore-all lint/suspicious/noConsole: build script */

import fs from 'node:fs';
import path from 'node:path';
import { $ } from 'bun';
import { extractTypeAliasSignature } from '../extractTypeAliasSignature';
import { getPackageJson } from '../getPackageJson';
import { getRepoRoot } from '../path-utils';
import { generateToolTypes } from './generateToolTypes';
import { BuildError, handleBuildError } from './handleBuildError';

const ROOT_DIR = getRepoRoot();
const PACKAGES_DIR = path.join(ROOT_DIR, 'packages');
const TMP_DIR = path.join(ROOT_DIR, '.tmp');
const OUTPUT_DIR = path.join(ROOT_DIR, '.dist');
const CLI_OUTPUT_FILE = path.join(OUTPUT_DIR, 'cli.js');
const ENTRY_POINT = path.resolve(PACKAGES_DIR, 'cli/src/main.ts');
const NPMRC_PATH = path.join(ROOT_DIR, '.npmrc');
const BUNFIG_PATH = path.join(ROOT_DIR, 'bunfig.toml');
const BUILD_TSCONFIG_PATH = path.join(OUTPUT_DIR, 'tsconfig--build.json');

const TEMP_SCHEMAS_BUILD_DIR_NAME = 'temp-schemas-build';
const TEMP_SCHEMAS_BUILD_DIR = path.join(TMP_DIR, TEMP_SCHEMAS_BUILD_DIR_NAME);
const TEMP_SCHEMAS_PACKAGE_PATH = path.join(TEMP_SCHEMAS_BUILD_DIR, 'package.json');
const TEMP_SCHEMAS_NPMRC_PATH = path.join(TEMP_SCHEMAS_BUILD_DIR, '.npmrc');
const OUTPUT_PACKAGES_DIR = path.join(OUTPUT_DIR, 'packages');

const OUTPUT_PACKAGE_JSON_PATH = path.join(OUTPUT_DIR, 'package.json');
const OUTPUT_NPMRC_PATH = path.join(OUTPUT_DIR, '.npmrc');
const OUTPUT_BUNFIG_PATH = path.join(OUTPUT_DIR, 'bunfig.toml');
const OUTPUT_BUN_LOCK_PATH = path.join(OUTPUT_DIR, 'bun.lock');
const OUTPUT_SCHEMAS_D_TS_PATH = path.join(OUTPUT_DIR, 'schemas.d.ts');
const SCHEMA_CHECK_TSCONFIG_PATH = path.join(OUTPUT_DIR, 'tsconfig--schemas-check.json');
const ROOT_NODE_MODULES_PATH = path.join(ROOT_DIR, 'node_modules');
const ROOT_BUN_CACHE_PATH = path.join(ROOT_NODE_MODULES_PATH, '.bun');
const BUN_INSTALL_CACHE_ENV = `BUN_INSTALL_CACHE=${ROOT_BUN_CACHE_PATH}`;
const TYPE_TESTS_DIR_NAME = 'type-tests';
const TSD_TEST_FILE_EXTENSION = '.test-d.ts';
const TSD_TESTS_DIR = path.join(TMP_DIR, 'tsd-tests');
const TSD_TESTS_CONFIG_PATH = path.join(TSD_TESTS_DIR, 'tsconfig.json');
const TSD_TESTS_PACKAGE_JSON_PATH = path.join(TSD_TESTS_DIR, 'package.json');
const TSD_TESTS_NPMRC_PATH = path.join(TSD_TESTS_DIR, '.npmrc');
const TSD_TESTS_NODE_MODULES_PATH = path.join(TSD_TESTS_DIR, 'node_modules');
const TSD_TESTS_GITEA_NAMESPACE_PATH = path.join(TSD_TESTS_NODE_MODULES_PATH, '@gitea');
const TSD_TESTS_GITEA_SYMLINK_PATH = path.join(TSD_TESTS_GITEA_NAMESPACE_PATH, 'dotfiles');

/**
 * Version information for key dependencies required by the build.
 */
interface IDependencyVersions {
  /** Version of the zod validation library. */
  zod: string;
  /** Version of the @types/bun TypeScript definitions. */
  bunTypes: string;
  /** Version of the @types/node TypeScript definitions. */
  nodeTypes: string;
}

interface ITypeTestFile {
  packageName: string;
  fileName: string;
  sourcePath: string;
}

/**
 * Ensures that the Bun package cache directory exists.
 *
 * Creates `node_modules/` and `node_modules/.bun/` directories recursively
 * if they don't exist. This prevents installation failures when installing
 * packages in isolated build directories.
 */
function ensureBunCacheDirectory(): void {
  fs.mkdirSync(ROOT_NODE_MODULES_PATH, { recursive: true });
  fs.mkdirSync(ROOT_BUN_CACHE_PATH, { recursive: true });
}

/**
 * Copies a file from source to destination if the source file exists.
 *
 * @param sourcePath - The path to the source file.
 * @param destinationPath - The path where the file should be copied.
 */
function copyFileIfExists(sourcePath: string, destinationPath: string): void {
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destinationPath);
  }
}

/**
 * Directories to exclude when copying packages.
 */
const EXCLUDED_DIRS: string[] = ['node_modules', '__tests__', 'type-tests'];

/**
 * Recursively copies a directory, excluding specified directories.
 *
 * @param sourcePath - The source directory path.
 * @param destinationPath - The destination directory path.
 * @param excludeDirs - Directory names to exclude from copying.
 */
function copyDirectoryRecursive(sourcePath: string, destinationPath: string, excludeDirs: string[]): void {
  fs.mkdirSync(destinationPath, { recursive: true });

  const entries: fs.Dirent[] = fs.readdirSync(sourcePath, { withFileTypes: true });

  for (const entry of entries) {
    const sourceEntryPath: string = path.join(sourcePath, entry.name);
    const destEntryPath: string = path.join(destinationPath, entry.name);

    if (entry.isDirectory()) {
      if (excludeDirs.includes(entry.name)) {
        continue;
      }
      copyDirectoryRecursive(sourceEntryPath, destEntryPath, excludeDirs);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourceEntryPath, destEntryPath);
    } else if (entry.isSymbolicLink()) {
      const linkTarget: string = fs.readlinkSync(sourceEntryPath);
      fs.symlinkSync(linkTarget, destEntryPath);
    }
  }
}

/**
 * Copies all workspace packages to the output directory.
 *
 * Copies each package from `packages/` to `.dist/packages/`, excluding
 * `node_modules`, `__tests__`, and `type-tests` directories. This creates
 * an isolated copy that can be used as a workspace without affecting
 * the original packages' node_modules.
 */
function copyPackagesToOutputDir(): void {
  console.log('📦 Copying packages to build directory...');
  fs.mkdirSync(OUTPUT_PACKAGES_DIR, { recursive: true });

  const packages: fs.Dirent[] = fs.readdirSync(PACKAGES_DIR, { withFileTypes: true });

  for (const entry of packages) {
    if (!entry.isDirectory()) {
      continue;
    }

    const sourcePackagePath: string = path.join(PACKAGES_DIR, entry.name);
    const destPackagePath: string = path.join(OUTPUT_PACKAGES_DIR, entry.name);

    copyDirectoryRecursive(sourcePackagePath, destPackagePath, EXCLUDED_DIRS);
  }
}

function getTypeTestFiles(): ITypeTestFile[] {
  const packages: fs.Dirent[] = fs.readdirSync(PACKAGES_DIR, { withFileTypes: true });
  const files: ITypeTestFile[] = [];

  for (const entry of packages) {
    if (!entry.isDirectory()) {
      continue;
    }

    const packageName: string = entry.name;
    const typeTestsDir: string = path.join(PACKAGES_DIR, packageName, TYPE_TESTS_DIR_NAME);

    if (!fs.existsSync(typeTestsDir)) {
      continue;
    }

    const typeTestEntries: fs.Dirent[] = fs.readdirSync(typeTestsDir, { withFileTypes: true });

    for (const typeTestEntry of typeTestEntries) {
      if (!typeTestEntry.isFile()) {
        continue;
      }

      if (!typeTestEntry.name.endsWith(TSD_TEST_FILE_EXTENSION)) {
        continue;
      }

      const sourcePath: string = path.join(typeTestsDir, typeTestEntry.name);
      const file: ITypeTestFile = {
        packageName,
        fileName: typeTestEntry.name,
        sourcePath,
      };

      files.push(file);
    }
  }

  return files;
}

function copyTypeTestFiles(destinationDir: string): void {
  const files: ITypeTestFile[] = getTypeTestFiles();

  for (const file of files) {
    const packageDestinationDir: string = path.join(destinationDir, file.packageName);
    fs.mkdirSync(packageDestinationDir, { recursive: true });
    const destinationPath: string = path.join(packageDestinationDir, file.fileName);
    fs.copyFileSync(file.sourcePath, destinationPath);
  }
}

async function createTsdTestsPackageJson(): Promise<void> {
  const packageJsonDependencies: Record<string, string> = {
    '@gitea/dotfiles': `file://${OUTPUT_DIR}`,
  };

  const packageJson: Record<string, unknown> = {
    name: 'tsd-tests',
    private: true,
    type: 'module',
    types: './index.d.ts',
    dependencies: packageJsonDependencies,
  };

  await Bun.write(TSD_TESTS_PACKAGE_JSON_PATH, JSON.stringify(packageJson, null, 2));
}

async function createTsdTestsTsConfig(): Promise<void> {
  const compilerOptions: Record<string, unknown> = {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    lib: ['ES2022'],
  };

  const tsConfig: Record<string, unknown> = {
    compilerOptions,
    include: ['./**/*.d.ts'],
  };

  await Bun.write(TSD_TESTS_CONFIG_PATH, JSON.stringify(tsConfig, null, 2));
}

async function createTsdTestsEntryPoint(): Promise<void> {
  const entryPoint = "export * from '@gitea/dotfiles';\n";
  await Bun.write(path.join(TSD_TESTS_DIR, 'index.d.ts'), entryPoint);
}

function symlinkDirectory(sourcePath: string, destinationPath: string, description: string): void {
  if (!fs.existsSync(sourcePath)) {
    throw new BuildError(`Required path for ${description} not found: ${sourcePath}`);
  }

  fs.rmSync(destinationPath, { recursive: true, force: true });
  fs.symlinkSync(sourcePath, destinationPath, 'dir');
}

function ensureTsdTestsNodeModules(): void {
  fs.mkdirSync(TSD_TESTS_NODE_MODULES_PATH, { recursive: true });

  const tsdModuleSourcePath: string = path.join(ROOT_NODE_MODULES_PATH, 'tsd');
  const tsdModuleDestinationPath: string = path.join(TSD_TESTS_NODE_MODULES_PATH, 'tsd');
  symlinkDirectory(tsdModuleSourcePath, tsdModuleDestinationPath, 'tsd module');

  fs.mkdirSync(TSD_TESTS_GITEA_NAMESPACE_PATH, { recursive: true });
  symlinkDirectory(OUTPUT_DIR, TSD_TESTS_GITEA_SYMLINK_PATH, '@gitea/dotfiles package');
}

async function setupTsdTestsProject(): Promise<void> {
  fs.rmSync(TSD_TESTS_DIR, { recursive: true, force: true });
  fs.mkdirSync(TSD_TESTS_DIR, { recursive: true });

  copyTypeTestFiles(TSD_TESTS_DIR);
  await createTsdTestsPackageJson();
  await createTsdTestsEntryPoint();
  await createTsdTestsTsConfig();
  copyFileIfExists(NPMRC_PATH, TSD_TESTS_NPMRC_PATH);
  ensureTsdTestsNodeModules();
}

/**
 * Ensures workspace dependencies are installed.
 *
 * Runs `bun install` at the repository root to ensure all dependencies
 * are available before the build starts.
 *
 * @throws {BuildError} If dependency installation fails.
 */
async function ensureWorkspaceDependencies(): Promise<void> {
  ensureBunCacheDirectory();
  console.log('🔄 Ensuring workspace dependencies...');
  try {
    await $`bun install`.quiet();
  } catch (error) {
    throw new BuildError('Workspace dependency installation failed', error);
  }
}

/**
 * Installs dependencies in the output directory with Bun caching.
 *
 * Runs `bun install` in the `.dist` directory using the workspace's shared
 * Bun cache to speed up installation.
 *
 * @throws {BuildError} If dependency installation fails.
 */
async function installDependenciesInOutputDir(): Promise<void> {
  ensureBunCacheDirectory();
  try {
    await $`cd ${OUTPUT_DIR} && ${BUN_INSTALL_CACHE_ENV} bun install`.quiet();
  } catch (error) {
    throw new BuildError('Temporary dependency installation failed', error);
  }
}

/**
 * Removes previous build artifacts from the `.dist` directory.
 *
 * Removes the temporary module symlink first to prevent dangling references,
 * then removes the `.dist` directory if it exists.
 */
async function cleanPreviousBuild(): Promise<void> {
  if (fs.existsSync(OUTPUT_DIR)) {
    console.log('🧹 Cleaning previous build...');
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
}

/**
 * Retrieves version numbers for key dependencies from the workspace.
 *
 * Runs `bun pm ls` to get installed package versions and extracts version
 * numbers for `zod`, `@types/bun`, and `typescript`. These versions are used
 * to ensure the built package includes compatible dependencies.
 *
 * @returns Version information for required dependencies.
 * @throws {BuildError} If any required dependency version cannot be determined.
 */
async function getDependencyVersions(): Promise<IDependencyVersions> {
  const pmLsResult = await $`bun pm ls --all`.quiet();
  const pmLsOutput = pmLsResult.stdout.toString();

  function extractVersion(pattern: RegExp, name: string): string {
    const match = pmLsOutput.match(pattern);
    if (!match) {
      throw new BuildError(`Could not find ${name} version in bun pm ls output`);
    }
    const version = match[1];
    if (!version) {
      throw new BuildError(`Could not extract ${name} version number`);
    }
    return version;
  }

  const versions: IDependencyVersions = {
    zod: extractVersion(/zod@(\d+\.\d+\.\d+)/, 'zod'),
    bunTypes: extractVersion(/@types\/bun@(\d+\.\d+\.\d+)/, '@types/bun'),
    nodeTypes: extractVersion(/@types\/node@(\d+\.\d+\.\d+)/, '@types/node'),
  };

  return versions;
}

/**
 * Builds the CLI application into a single bundled executable.
 *
 * Uses Bun's build API to bundle the CLI entry point (`packages/cli/src/main.ts`)
 * into a minified, standalone JavaScript file with an external source map.
 * The output file is made executable with `chmod 0o755`.
 *
 * Build configuration:
 * - Target: Bun runtime
 * - Format: ES modules
 * - Minification: Enabled
 * - Source maps: External
 * - Code splitting: Disabled
 *
 * @returns The Bun build output containing success status and logs.
 * @throws {BuildError} If the build fails.
 */
async function buildCli(): Promise<Bun.BuildOutput> {
  console.log('🏗️  Building CLI...');
  console.log(`📍 Entry: ${ENTRY_POINT}`);
  console.log(`📦 Output: ${CLI_OUTPUT_FILE}`);

  const result = await Bun.build({
    entrypoints: [ENTRY_POINT],
    outdir: OUTPUT_DIR,
    naming: 'cli.js',
    minify: true,
    sourcemap: 'external',
    target: 'bun',
    format: 'esm',
    splitting: false,
    define: {
      'import.meta.main': 'true',
    },
    env: 'inline',
  });

  if (!result.success) {
    console.error('❌ Build failed:');
    for (const message of result.logs) {
      console.error(`   ${message.toString()}`);
    }
    throw new BuildError('CLI build failed');
  }

  // Make cli.js executable
  fs.chmodSync(CLI_OUTPUT_FILE, 0o755);

  return result;
}

/**
 * Creates a temporary TypeScript configuration for schema type generation.
 *
 * Generates a `tsconfig--build.json` file that extends the CLI package's tsconfig
 * and configures TypeScript to:
 * - Emit only declaration files (`.d.ts`)
 * - Output to a temporary directory
 * - Include only the schema-exports file
 *
 * This configuration is used by the TypeScript compiler to generate type definitions
 * for the tool configuration schemas.
 */
async function createTempTsConfig(): Promise<void> {
  const tempTsConfig = {
    extends: `${ROOT_DIR}/tsconfig.json`,
    compilerOptions: {
      noEmit: false,
      declaration: true,
      emitDeclarationOnly: true,
      outDir: TEMP_SCHEMAS_BUILD_DIR,
      skipLibCheck: true,
      skipDefaultLibCheck: true,
      noImplicitAny: false,
      paths: {
        '@dotfiles/*': [`${ROOT_DIR}/packages/*/src/index.ts`, `${ROOT_DIR}/packages/*/index.ts`],
      },
    },
    include: [`${ROOT_DIR}/packages/cli/src/schema-exports.ts`],
  };

  await Bun.write(BUILD_TSCONFIG_PATH, JSON.stringify(tempTsConfig, null, 2));
}

/**
 * Creates temporary package.json files for schema type bundling.
 *
 * Generates two package.json files:
 * 1. A temporary schemas package with dependencies needed for type generation
 * 2. A temporary root package.json that sets up a workspace containing both
 *    the temporary schemas package and the main workspace packages
 *
 * Also copies `.npmrc` and `bunfig.toml` configuration files to ensure
 * consistent dependency resolution during the bundling process.
 *
 * @param dependencyVersions - Version information for required dependencies.
 */
async function createTempSchemasPackage(dependencyVersions: IDependencyVersions): Promise<void> {
  const tempPackageJson = {
    name: 'temp-schemas',
    version: '0.0.0',
    type: 'module',
    dependencies: {
      zod: dependencyVersions.zod,
      '@types/bun': dependencyVersions.bunTypes,
      '@types/node': dependencyVersions.nodeTypes,
      '@dotfiles/core': 'workspace:*',
      '@dotfiles/config': 'workspace:*',
    },
  };

  const tempRootPackageJson = {
    name: 'temp-root',
    private: true,
    workspaces: [TEMP_SCHEMAS_BUILD_DIR, `${OUTPUT_PACKAGES_DIR}/*`],
    catalog: getPackageJson().catalog,
    catalogs: getPackageJson().catalogs,
  };

  await Bun.write(TEMP_SCHEMAS_PACKAGE_PATH, JSON.stringify(tempPackageJson, null, 2));
  await Bun.write(OUTPUT_PACKAGE_JSON_PATH, JSON.stringify(tempRootPackageJson, null, 2));

  copyFileIfExists(NPMRC_PATH, TEMP_SCHEMAS_NPMRC_PATH);
  copyFileIfExists(NPMRC_PATH, OUTPUT_NPMRC_PATH);
  copyFileIfExists(BUNFIG_PATH, OUTPUT_BUNFIG_PATH);
}

/**
 * Generates TypeScript declaration files for tool configuration schemas.
 *
 * This function orchestrates the schema type generation process:
 * 1. Creates a temporary TypeScript configuration
 * 2. Compiles schema-exports.ts to generate `.d.ts` files
 * 3. Sets up a temporary workspace for type bundling
 * 4. Installs dependencies in the output directory
 * 5. Uses dts-bundle-generator to bundle all type definitions into a single `schemas.d.ts`
 *
 * The bundler ensures all module augmentations from installer plugins are included
 * by using schema-exports as the entry point, which imports all installer modules.
 *
 * @param dependencyVersions - Version information for dependencies to include in package.json.
 */
async function buildSchemaTypes(dependencyVersions: IDependencyVersions): Promise<void> {
  await createTempTsConfig();
  await $`bun tsgo --project ${BUILD_TSCONFIG_PATH}`.quiet();

  // Copy packages to .dist/packages/ to create an isolated workspace
  // This prevents bun from creating symlinks in the original packages' node_modules
  copyPackagesToOutputDir();

  await createTempSchemasPackage(dependencyVersions);

  // Install external dependencies in the .dist folder (which has workspace config)
  await installDependenciesInOutputDir();

  // Use dts-bundle-generator with schema-exports.d.ts as entry point
  // schema-exports imports defineToolWithPlugins which imports all installer plugins
  // This ensures all module augmentations are loaded
  const schemaExportsPath = path.join(TEMP_SCHEMAS_BUILD_DIR, 'schema-exports.d.ts');

  await $`bunx dts-bundle-generator --project ${BUILD_TSCONFIG_PATH} --out-file ${OUTPUT_SCHEMAS_D_TS_PATH} --no-check --export-referenced-types --external-imports=@dotfiles/core --external-imports=zod --external-inlines=@dotfiles/config --external-inlines=@dotfiles/logger --external-inlines=@dotfiles/installer-brew --external-inlines=@dotfiles/installer-cargo --external-inlines=@dotfiles/installer-curl-script --external-inlines=@dotfiles/installer-curl-tar --external-inlines=@dotfiles/installer-github --external-inlines=@dotfiles/installer-manual -- ${schemaExportsPath}`.quiet();

  console.log('✅ Successfully created schemas.d.ts with dts-bundle-generator');
}

/**
 * Validates the generated `ProjectConfig` type signature.
 *
 * Uses the TypeScript compiler API to extract the type signature of `ProjectConfig`
 * from the generated `schemas.d.ts` file and verifies that it contains expected
 * properties like `generatedDir`. This ensures the schema bundling succeeded.
 *
 * @throws {BuildError} If the ProjectConfig type is invalid or missing required properties.
 */
function checkProjectConfigTypeSignature(): void {
  const schemaTsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    },
    files: ['./schemas.d.ts'],
  };

  try {
    fs.writeFileSync(SCHEMA_CHECK_TSCONFIG_PATH, JSON.stringify(schemaTsconfig, null, 2));
    const signature = extractTypeAliasSignature(SCHEMA_CHECK_TSCONFIG_PATH, OUTPUT_SCHEMAS_D_TS_PATH, 'ProjectConfig');

    if (!signature.includes('generatedDir: string')) {
      console.error('ℹ️ ProjectConfig appears to be invalid:');
      console.error(signature);
      throw new BuildError('ProjectConfig type extraction failed');
    }
  } finally {
    fs.rmSync(SCHEMA_CHECK_TSCONFIG_PATH, { force: true });
  }
}

/**
 * Removes temporary files created during the build process.
 *
 * Deletes:
 * - Temporary schemas build directory
 * - Build tsconfig file
 * - Copied configuration files (.npmrc, bunfig.toml)
 * - Lock files (bun.lock)
 * - Schema check tsconfig
 */
async function runTypeTests(): Promise<void> {
  console.log('🔍 Running tsd type tests...');
  try {
    await setupTsdTestsProject();
    await $`cd ${TSD_TESTS_DIR} && bunx tsd --typings ./index.d.ts --files './**/*.test-d.ts'`.quiet();
    console.log('✅ tsd type tests passed');
  } catch (error) {
    throw new BuildError('Schema type validation failed', error);
  }

  console.log('✅ @dotfiles/core config types validated with tsd');
}

/**
 * Cleans up the schema build artifacts from the output directory.
 *
 * Removes the copied packages directory and node_modules that were only
 * needed for schema type generation. This must be called after schema
 * generation but before tsd tests to prevent tsd from processing
 * unnecessary files.
 */
function cleanupSchemaBuildArtifacts(): void {
  fs.rmSync(OUTPUT_PACKAGES_DIR, { recursive: true, force: true });
  fs.rmSync(path.join(OUTPUT_DIR, 'node_modules'), { recursive: true, force: true });
}

async function cleanupTempFiles(): Promise<void> {
  const filesToCleanup: string[] = [
    TEMP_SCHEMAS_BUILD_DIR,
    BUILD_TSCONFIG_PATH,
    OUTPUT_NPMRC_PATH,
    OUTPUT_BUNFIG_PATH,
    OUTPUT_BUN_LOCK_PATH,
    SCHEMA_CHECK_TSCONFIG_PATH,
  ];

  for (const filePath of filesToCleanup) {
    fs.rmSync(filePath, { recursive: true, force: true });
  }
}

/**
 * Generates TypeScript declaration files for tool configuration schemas.
 *
 * Orchestrates the complete schema generation and validation process:
 * 1. Builds schema type definitions using TypeScript compiler
 * 2. Validates the generated ProjectConfig type signature
 *
 * @param dependencyVersions - Version information for dependencies.
 * @throws {BuildError} If schema generation or validation fails.
 */
async function generateSchemaTypes(dependencyVersions: IDependencyVersions): Promise<void> {
  console.log('📝 Building @dotfiles/core config types...');

  try {
    await buildSchemaTypes(dependencyVersions);
    checkProjectConfigTypeSignature();
    cleanupSchemaBuildArtifacts();
  } catch (error) {
    throw new BuildError('Schema type generation failed', error);
  }
}

/**
 * Generates the package.json file for the distributable package.
 *
 * Creates a package.json in the `.dist` directory with:
 * - Package name: @gitea/dotfiles
 * - Version from the workspace root package.json
 * - Binary entry point for the `dotfiles` command
 * - ES module exports with type definitions
 * - Runtime dependency on zod
 *
 * @param dependencyVersions - Version information for runtime dependencies.
 */
async function generatePackageJson(dependencyVersions: IDependencyVersions): Promise<void> {
  const packageJson = {
    name: '@gitea/dotfiles',
    version: getPackageJson().version,
    type: 'module',
    bin: {
      dotfiles: './cli.js',
    },
    types: './schemas.d.ts',
    exports: {
      '.': {
        import: {
          types: './schemas.d.ts',
          default: './cli.js',
        },
      },
    },
    dependencies: {
      zod: dependencyVersions.zod,
      '@types/bun': dependencyVersions.bunTypes,
      '@types/node': dependencyVersions.nodeTypes,
    },
  };

  fs.writeFileSync(OUTPUT_PACKAGE_JSON_PATH, JSON.stringify(packageJson, null, 2));
}

/**
 * Tests the built CLI executable by running it with the `--version` flag.
 *
 * Executes `bun cli.js --version` to verify that:
 * 1. The CLI executable is valid and can be run
 * 2. The version flag works correctly
 * 3. The build produced a functional application
 *
 * @throws {BuildError} If the CLI test fails.
 */
async function testBuiltCli(): Promise<void> {
  console.log('🧪 Testing built CLI...');

  const testResult = await $`bun ${CLI_OUTPUT_FILE} --version`.quiet();

  if (testResult.exitCode === 0) {
    console.log(`✅ CLI test passed - version: ${testResult.stdout.toString().trim()}`);
  } else {
    console.error(`❌ CLI test failed with exit code: ${testResult.exitCode}`);
    console.error(`Error output: ${testResult.stderr.toString()}`);
    throw new BuildError('CLI test failed');
  }
}

/**
 * Prints a summary of the build output to the console.
 *
 * Displays:
 * - Success message
 * - Output directory path
 * - List of all generated files in the `.dist` directory
 */
async function printBuildSummary(): Promise<void> {
  console.log('✅ Build completed successfully!');
  console.log(`📁 Output directory: ${OUTPUT_DIR}`);
  console.log('🗂️  Generated files:');

  // Read all files from the output directory
  const files = fs.readdirSync(OUTPUT_DIR);

  for (const file of files.sort()) {
    const filePath = path.join(OUTPUT_DIR, file);
    const relativePath = path.relative(ROOT_DIR, filePath);
    const stats = fs.statSync(filePath);

    if (stats.isFile()) {
      console.log(`   - ${relativePath}`);
    }
  }
}

/**
 * Main build entry point.
 *
 * Orchestrates the complete build process:
 * 1. Cleans previous build artifacts
 * 2. Retrieves dependency versions
 * 3. Builds the CLI executable
 * 4. Generates schema type definitions
 * 5. Creates package.json
 * 6. Validates schemas with tsd type tests
 * 7. Tests the built CLI
 * 8. Prints build summary
 * 9. Restores workspace dependencies
 *
 * @throws {BuildError} If any step of the build process fails.
 */
await handleBuildError(
  async () => {
    await ensureWorkspaceDependencies();
    await cleanPreviousBuild();

    const dependencyVersions = await getDependencyVersions();

    await buildCli();
    await generateSchemaTypes(dependencyVersions);
    await generatePackageJson(dependencyVersions);

    generateToolTypes({}, path.join(OUTPUT_DIR, 'tool-types.d.ts'));

    await runTypeTests();
    await testBuiltCli();
    await cleanupTempFiles();

    await printBuildSummary();
  },
  async () => {
    await cleanupTempFiles();
  }
);
