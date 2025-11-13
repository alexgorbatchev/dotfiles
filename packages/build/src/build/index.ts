#!/usr/bin/env bun

/**
 * Build Script
 *
 * Bundles the CLI application into a standalone distributable package.
 *
 * This script performs the following operations:
 * 1. Cleans previous build artifacts from .dist directory
 * 2. Installs workspace dependencies
 * 3. Bundles the CLI entry point (packages/cli/src/main.ts) into a minified executable
 * 4. Generates TypeScript schema types for tool configuration (YamlConfig)
 * 5. Creates package.json with proper exports and dependencies
 * 6. Validates generated schemas with type checking
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

import fs from 'node:fs';
import path from 'node:path';
import { $ } from 'bun';
import cliPackageJson from '../../../../package.json';
import { extractTypeAliasSignature } from '../extractTypeAliasSignature';
import { getRepoRoot } from '../path-utils';

const LINE_BREAK = '\n';

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

const OUTPUT_PACKAGE_JSON_PATH = path.join(OUTPUT_DIR, 'package.json');
const OUTPUT_NPMRC_PATH = path.join(OUTPUT_DIR, '.npmrc');
const OUTPUT_BUNFIG_PATH = path.join(OUTPUT_DIR, 'bunfig.toml');
const OUTPUT_BUN_LOCK_PATH = path.join(OUTPUT_DIR, 'bun.lock');
const OUTPUT_SCHEMAS_D_TS_PATH = path.join(OUTPUT_DIR, 'schemas.d.ts');
const SCHEMA_CHECK_TSCONFIG_PATH = path.join(OUTPUT_DIR, 'tsconfig--schemas-check.json');
const ROOT_NODE_MODULES_PATH = path.join(ROOT_DIR, 'node_modules');
const ROOT_BUN_CACHE_PATH = path.join(ROOT_NODE_MODULES_PATH, '.bun');
const BUN_INSTALL_CACHE_ENV = `BUN_INSTALL_CACHE=${ROOT_BUN_CACHE_PATH}`;
const BUILD_CHECK_DIR = path.join(TMP_DIR, 'build-check');
const BUILD_CHECK_NODE_MODULES_PATH = path.join(BUILD_CHECK_DIR, 'node_modules');
const BUILD_CHECK_PACKAGE_JSON_PATH = path.join(BUILD_CHECK_DIR, 'package.json');
const BUILD_CHECK_TSCONFIG_PATH = path.join(BUILD_CHECK_DIR, 'tsconfig.json');
const INSTALLER_PACKAGE_PREFIX = 'installer-';
const INSTALLER_BUILD_CHECK_RELATIVE_PATH = path.join('build-check', 'buildCheck.ts');
const BUILD_CHECK_SCRIPT_SUFFIX = '--buildCheck.ts';

class BuildError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'BuildError';
  }
}

interface InstallerBuildCheckScript {
  packageName: string;
  sourcePath: string;
}

interface DependencyVersions {
  zod: string;
  bunTypes: string;
  typescript: string;
}

function ensureBunCacheDirectory(): void {
  fs.mkdirSync(ROOT_NODE_MODULES_PATH, { recursive: true });
  fs.mkdirSync(ROOT_BUN_CACHE_PATH, { recursive: true });
}

function copyFileIfExists(sourcePath: string, destinationPath: string): void {
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destinationPath);
  }
}

async function restoreWorkspaceDependencies(): Promise<void> {
  ensureBunCacheDirectory();
  console.log('🔄 Restoring workspace dependencies...');
  try {
    await $`bun install`.quiet();
  } catch (error) {
    throw new BuildError('Workspace dependency restoration failed', error);
  }
}

async function installDependenciesInOutputDir(): Promise<void> {
  ensureBunCacheDirectory();
  try {
    await $`cd ${OUTPUT_DIR} && ${BUN_INSTALL_CACHE_ENV} bun install`.quiet();
  } catch (error) {
    throw new BuildError('Temporary dependency installation failed', error);
  }
}

async function cleanPreviousBuild(): Promise<void> {
  // Clean build-check first to remove any symlinks pointing to .dist
  fs.rmSync(BUILD_CHECK_DIR, { recursive: true, force: true });

  if (fs.existsSync(OUTPUT_DIR)) {
    console.log('🧹 Cleaning previous build...');
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
}

async function getDependencyVersions(): Promise<DependencyVersions> {
  const pmLsResult = await $`bun pm ls --all`.quiet();
  const pmLsOutput = pmLsResult.stdout.toString();

  const zodMatch = pmLsOutput.match(/zod@(\d+\.\d+\.\d+)/);
  const bunTypesMatch = pmLsOutput.match(/@types\/bun@(\d+\.\d+\.\d+)/);
  const typescriptMatch = pmLsOutput.match(/(?:^|\s)typescript@(\d+\.\d+\.\d+)/);

  if (!zodMatch || !bunTypesMatch || !typescriptMatch) {
    throw new BuildError('Could not find zod, type-fest, @types/bun, or typescript versions in bun pm ls output');
  }

  const zodVersion = zodMatch[1];
  const bunTypesVersion = bunTypesMatch[1];
  const typescriptVersion = typescriptMatch[1];

  if (!zodVersion || !bunTypesVersion || !typescriptVersion) {
    throw new BuildError('Could not extract version numbers from dependency output');
  }

  const versions: DependencyVersions = {
    zod: zodVersion,
    bunTypes: bunTypesVersion,
    typescript: typescriptVersion,
  };

  return versions;
}

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

async function createTempTsConfig(): Promise<void> {
  const tempTsConfig = {
    extends: `${ROOT_DIR}/packages/cli/tsconfig.json`,
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

async function createTempSchemasPackage(dependencyVersions: DependencyVersions): Promise<void> {
  const tempPackageJson = {
    name: 'temp-schemas',
    version: '0.0.0',
    type: 'module',
    dependencies: {
      zod: dependencyVersions.zod,
      '@types/bun': dependencyVersions.bunTypes,
      '@dotfiles/core': 'workspace:*',
      '@dotfiles/config': 'workspace:*',
    },
  };

  const tempRootPackageJson = {
    name: 'temp-root',
    private: true,
    workspaces: [TEMP_SCHEMAS_BUILD_DIR, `${ROOT_DIR}/packages/*`],
    catalog: cliPackageJson.catalog,
    catalogs: cliPackageJson.catalogs,
  };

  await Bun.write(TEMP_SCHEMAS_PACKAGE_PATH, JSON.stringify(tempPackageJson, null, 2));
  await Bun.write(OUTPUT_PACKAGE_JSON_PATH, JSON.stringify(tempRootPackageJson, null, 2));

  copyFileIfExists(NPMRC_PATH, TEMP_SCHEMAS_NPMRC_PATH);
  copyFileIfExists(NPMRC_PATH, OUTPUT_NPMRC_PATH);
  copyFileIfExists(BUNFIG_PATH, OUTPUT_BUNFIG_PATH);
}

async function buildSchemaTypes(dependencyVersions: DependencyVersions): Promise<void> {
  await createTempTsConfig();
  await $`bun tsgo --project ${BUILD_TSCONFIG_PATH}`.quiet();

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

function checkYamlConfigTypeSignature(): void {
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
    const signature = extractTypeAliasSignature(SCHEMA_CHECK_TSCONFIG_PATH, OUTPUT_SCHEMAS_D_TS_PATH, 'YamlConfig');

    if (!signature.includes('generatedDir: string')) {
      console.error('ℹ️ YamlConfig appears to be invalid:');
      console.error(signature);
      throw new BuildError('YamlConfig type extraction failed');
    }
  } finally {
    fs.rmSync(SCHEMA_CHECK_TSCONFIG_PATH, { force: true });
  }
}

function getInstallerBuildCheckScripts(): InstallerBuildCheckScript[] {
  const directoryEntries: fs.Dirent[] = fs.readdirSync(PACKAGES_DIR, { withFileTypes: true });
  const scripts: InstallerBuildCheckScript[] = [];

  for (const entry of directoryEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const packageName: string = entry.name;

    if (!packageName.startsWith(INSTALLER_PACKAGE_PREFIX)) {
      continue;
    }

    const packagePath: string = path.join(PACKAGES_DIR, packageName);
    const buildCheckPath: string = path.join(packagePath, INSTALLER_BUILD_CHECK_RELATIVE_PATH);

    if (!fs.existsSync(buildCheckPath)) {
      throw new BuildError(`❌ Missing build check script: ${packageName}`);
    }

    const script: InstallerBuildCheckScript = {
      packageName,
      sourcePath: buildCheckPath,
    };
    scripts.push(script);
  }

  return scripts;
}

function copyInstallerBuildCheckScripts(destinationDir: string): void {
  const scripts: InstallerBuildCheckScript[] = getInstallerBuildCheckScripts();

  for (const script of scripts) {
    const fileName: string = `${script.packageName}${BUILD_CHECK_SCRIPT_SUFFIX}`;
    const destinationPath: string = path.join(destinationDir, fileName);
    const content = fs.readFileSync(script.sourcePath, 'utf-8');
    const lines = content.split(LINE_BREAK);
    if (lines[0]?.trim() === '// @ts-nocheck') {
      lines.shift();
    }
    fs.writeFileSync(destinationPath, lines.join(LINE_BREAK));
  }
}

async function setupBuildCheckProject(dependencyVersions: DependencyVersions): Promise<void> {
  fs.mkdirSync(BUILD_CHECK_DIR, { recursive: true });
  copyInstallerBuildCheckScripts(BUILD_CHECK_DIR);

  const tsConfig: Record<string, unknown> = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: ['./**/*.ts'],
  };

  const packageJson = {
    name: 'build-check',
    private: true,
    type: 'module',
    dependencies: {
      '@gitea/dotfiles': `file://${OUTPUT_DIR}`,
    },
    devDependencies: {
      typescript: dependencyVersions.typescript,
    },
  };

  await Bun.write(BUILD_CHECK_TSCONFIG_PATH, JSON.stringify(tsConfig, null, 2));
  await Bun.write(BUILD_CHECK_PACKAGE_JSON_PATH, JSON.stringify(packageJson, null, 2));
  copyFileIfExists(NPMRC_PATH, path.join(BUILD_CHECK_DIR, '.npmrc'));

  await $`cd ${BUILD_CHECK_DIR} && ${BUN_INSTALL_CACHE_ENV} bun install`.quiet();

  createBuildCheckSymlink();
}

function createBuildCheckSymlink(): void {
  const namespacePath = path.join(BUILD_CHECK_NODE_MODULES_PATH, '@gitea');
  const symlinkPath = path.join(namespacePath, 'dotfiles');

  fs.mkdirSync(namespacePath, { recursive: true });
  fs.rmSync(symlinkPath, { recursive: true, force: true });
  fs.symlinkSync(OUTPUT_DIR, symlinkPath, 'dir');
}

async function runBuildCheck(): Promise<void> {
  try {
    await $`cd ${BUILD_CHECK_DIR} && bunx tsgo --noEmit`;
  } catch (error) {
    throw new BuildError('Schema validation failed', error);
  }
}

async function validateSchemas(dependencyVersions: DependencyVersions): Promise<void> {
  console.log('🔍 Validating generated schemas...');
  await setupBuildCheckProject(dependencyVersions);
  await runBuildCheck();
  console.log('✅ Schema validation passed');
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

async function generateSchemaTypes(dependencyVersions: DependencyVersions): Promise<void> {
  console.log('📝 Building @dotfiles/core config types...');

  try {
    await buildSchemaTypes(dependencyVersions);
    checkYamlConfigTypeSignature();
  } catch (error) {
    throw new BuildError('❌ Schema type generation failed', error);
  }
}

async function generatePackageJson(dependencyVersions: DependencyVersions): Promise<void> {
  const packageJson = {
    name: '@gitea/dotfiles',
    version: cliPackageJson.version,
    type: 'module',
    bin: {
      dotfiles: './cli.js',
    },
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
    },
  };

  fs.writeFileSync(OUTPUT_PACKAGE_JSON_PATH, JSON.stringify(packageJson, null, 2));
}

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

async function main(): Promise<void> {
  try {
    await cleanPreviousBuild();

    const dependencyVersions = await getDependencyVersions();
    await buildCli();
    await generateSchemaTypes(dependencyVersions);
    await generatePackageJson(dependencyVersions);

    try {
      await validateSchemas(dependencyVersions);
      console.log('✅ @dotfiles/core config types bundled with dts-bundle-generator');
    } finally {
      await cleanupTempFiles();
    }

    await testBuiltCli();
    await printBuildSummary();
  } catch (error: unknown) {
    if (error instanceof BuildError) {
      console.error(`❌ Build failed: ${error.message}`);
      if (error.cause) {
        console.error('Caused by:', error.cause);
      }
    } else {
      console.error(`❌ An unexpected error occurred:`, error);
    }
    throw error;
  } finally {
    await restoreWorkspaceDependencies();
  }
}

await main();
