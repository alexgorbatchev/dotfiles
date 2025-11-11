#!/usr/bin/env bun

import fs from 'node:fs';
import path from 'node:path';
import { $ } from 'bun';
import cliPackageJson from '../package.json';
import { cdToRepoRoot } from './lib';

const OUTPUT_DIR = './.dist';
const CLI_OUTPUT_FILE = path.join(OUTPUT_DIR, 'cli.js');
const ENTRY_POINT = path.resolve(process.cwd(), 'packages/cli/src/main.ts');
const NPMRC_PATH = '.npmrc';
const BUILD_TSCONFIG_PATH = path.join(OUTPUT_DIR, 'temp-tsconfig.json');
const VALIDATION_TSCONFIG_PATH = path.join(OUTPUT_DIR, 'temp-validation-tsconfig.json');

const TEMP_SCHEMAS_BUILD_DIR = path.join(OUTPUT_DIR, 'temp-schemas-build');
const TEMP_SCHEMAS_PACKAGE_PATH = path.join(TEMP_SCHEMAS_BUILD_DIR, 'package.json');
const TEMP_SCHEMAS_NPMRC_PATH = path.join(TEMP_SCHEMAS_BUILD_DIR, '.npmrc');

const OUTPUT_PACKAGE_JSON_PATH = path.join(OUTPUT_DIR, 'package.json');
const OUTPUT_NODE_MODULES_PATH = path.join(OUTPUT_DIR, 'node_modules');
const OUTPUT_LOCKFILE_PATH = path.join(OUTPUT_DIR, 'bun.lockb');
const ROOT_NODE_MODULES_PATH = path.join(process.cwd(), 'node_modules');
const ROOT_BUN_CACHE_PATH = path.join(ROOT_NODE_MODULES_PATH, '.bun');
const BUN_INSTALL_CACHE_ENV = `BUN_INSTALL_CACHE=${ROOT_BUN_CACHE_PATH}`;
const LINE_BREAK = '\n';

interface DependencyVersions {
  zod: string;
  typeFest: string;
  bunTypes: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) {
    return false;
  }

  const entries = Object.entries(value);
  for (const [, entryValue] of entries) {
    if (typeof entryValue !== 'string') {
      return false;
    }
  }

  return true;
}

function parseCliPackageVersion(value: unknown): string {
  if (!isRecord(value)) {
    throw new Error('Invalid CLI package metadata: expected object');
  }

  const versionValue = value['version'];

  if (typeof versionValue !== 'string') {
    throw new Error('Invalid CLI package metadata: missing version string');
  }

  return versionValue;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }

  const emptyRecord: Record<string, unknown> = {};
  return emptyRecord;
}

function parseRootPackageMetadata(value: unknown): Record<string, unknown> {
  const source = toRecord(value);
  const result: Record<string, unknown> = {};

  if (Object.hasOwn(source, 'catalog')) {
    result['catalog'] = source['catalog'];
  }

  if (Object.hasOwn(source, 'catalogs')) {
    result['catalogs'] = source['catalogs'];
  }

  return result;
}

function ensureBunCacheDirectory(): void {
  if (!fs.existsSync(ROOT_NODE_MODULES_PATH)) {
    fs.mkdirSync(ROOT_NODE_MODULES_PATH, { recursive: true });
  }

  if (!fs.existsSync(ROOT_BUN_CACHE_PATH)) {
    fs.mkdirSync(ROOT_BUN_CACHE_PATH, { recursive: true });
  }
}

async function installWorkspaceDependencies(): Promise<void> {
  ensureBunCacheDirectory();
  writeStdout('📦 Ensuring workspace dependencies...');
  const installResult = await $`bun install`.quiet();

  if (installResult.exitCode !== 0) {
    writeStderr('❌ Failed to install workspace dependencies');
    throw new Error('Workspace dependency installation failed');
  }
}

async function installDependenciesInOutputDir(): Promise<void> {
  ensureBunCacheDirectory();
  const installResult = await $`cd ${OUTPUT_DIR} && ${BUN_INSTALL_CACHE_ENV} bun install`.quiet();

  if (installResult.exitCode !== 0) {
    writeStderr('❌ Failed to install temporary workspace dependencies');
    throw new Error('Temporary dependency installation failed');
  }
}

function writeStdout(message: string): void {
  process.stdout.write(`${message}${LINE_BREAK}`);
}

function writeStderr(message: string): void {
  process.stderr.write(`${message}${LINE_BREAK}`);
}

function writeError(prefix: string, error: unknown): void {
  if (error instanceof Error) {
    const detail: string = error.stack ?? error.message;
    process.stderr.write(`${prefix} ${detail}${LINE_BREAK}`);
    return;
  }

  process.stderr.write(`${prefix} ${String(error)}${LINE_BREAK}`);
}

const cliPackageVersion = parseCliPackageVersion(cliPackageJson);

async function cleanPreviousBuild(): Promise<void> {
  if (fs.existsSync(OUTPUT_DIR)) {
    writeStdout('🧹 Cleaning previous build...');
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
}

async function getDependencyVersions(): Promise<DependencyVersions> {
  const pmLsResult = await $`bun pm ls --all`.quiet();
  const pmLsOutput = pmLsResult.stdout.toString();

  const zodMatch = pmLsOutput.match(/zod@(\d+\.\d+\.\d+)/);
  const typeFestMatch = pmLsOutput.match(/type-fest@(\d+\.\d+\.\d+)/);
  const bunTypesMatch = pmLsOutput.match(/@types\/bun@(\d+\.\d+\.\d+)/);

  if (!zodMatch || !typeFestMatch || !bunTypesMatch) {
    throw new Error('Could not find zod, type-fest, or @types/bun versions in bun pm ls output');
  }

  const zodVersion = zodMatch[1];
  const typeFestVersion = typeFestMatch[1];
  const bunTypesVersion = bunTypesMatch[1];

  if (!zodVersion || !typeFestVersion || !bunTypesVersion) {
    throw new Error('Could not extract version numbers from dependency output');
  }

  return {
    zod: zodVersion,
    typeFest: typeFestVersion,
    bunTypes: bunTypesVersion,
  };
}

async function buildCli(): Promise<Bun.BuildOutput> {
  writeStdout('🏗️  Building CLI...');
  writeStdout(`📍 Entry: ${ENTRY_POINT}`);
  writeStdout(`📦 Output: ${CLI_OUTPUT_FILE}`);

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
    writeStderr('❌ Build failed:');
    for (const message of result.logs) {
      writeStderr(`   ${String(message)}`);
    }
    throw new Error('CLI build failed');
  }

  // Make cli.js executable
  fs.chmodSync(CLI_OUTPUT_FILE, 0o755);

  return result;
}

async function createTempTsConfig(): Promise<void> {
  const paths: Record<string, string[]> = {
    '@dotfiles/*': ['./../packages/*/src/index.ts', './../packages/*/index.ts'],
  };
  const compilerOptions: Record<string, unknown> = {
    noEmit: false,
    declaration: true,
    emitDeclarationOnly: true,
    outDir: './temp-schemas-build',
    skipLibCheck: true,
    skipDefaultLibCheck: true,
    noImplicitAny: false,
    paths,
  };
  const tempTsConfig: Record<string, unknown> = {
    extends: '../packages/cli/tsconfig.json',
    compilerOptions,
    include: ['../packages/cli/src/schema-exports.ts'],
  };

  await Bun.write(BUILD_TSCONFIG_PATH, JSON.stringify(tempTsConfig, null, 2));
}

async function createTempSchemasPackage(dependencyVersions: DependencyVersions): Promise<void> {
  const dependencies: Record<string, string> = {
    zod: dependencyVersions.zod,
    'type-fest': dependencyVersions.typeFest,
    '@types/bun': dependencyVersions.bunTypes,
    '@dotfiles/core': 'workspace:*',
    '@dotfiles/config': 'workspace:*',
    '@dotfiles/logger': 'workspace:*',
  };
  const tempPackageJson: Record<string, unknown> = {
    name: 'temp-schemas',
    version: '0.0.0',
    type: 'module',
    dependencies,
  };

  await Bun.write(TEMP_SCHEMAS_PACKAGE_PATH, JSON.stringify(tempPackageJson, null, 2));

  // Copy .npmrc for package resolution
  if (fs.existsSync(NPMRC_PATH)) {
    await $`cp ${NPMRC_PATH} ${TEMP_SCHEMAS_NPMRC_PATH}`.quiet();
  }
  
  // Copy root package.json catalog configuration
  const rootPackageJsonRaw: unknown = await Bun.file('package.json').json();
  const rootPackageMetadata = parseRootPackageMetadata(rootPackageJsonRaw);
  const workspaces: string[] = ['temp-schemas-build', '../packages/*'];
  const tempRootPackageJson: Record<string, unknown> = {
    name: 'temp-root',
    private: true,
    workspaces,
  };

  if (Object.hasOwn(rootPackageMetadata, 'catalog')) {
    tempRootPackageJson['catalog'] = rootPackageMetadata['catalog'];
  }

  if (Object.hasOwn(rootPackageMetadata, 'catalogs')) {
    tempRootPackageJson['catalogs'] = rootPackageMetadata['catalogs'];
  }
  
  await Bun.write(
    path.join(OUTPUT_DIR, 'package.json'),
    JSON.stringify(tempRootPackageJson, null, 2),
  );
  
  // Copy bunfig.toml for catalog configuration
  if (fs.existsSync('bunfig.toml')) {
    await $`cp bunfig.toml ${OUTPUT_DIR}/bunfig.toml`.quiet();
  }
  
  // Copy .npmrc to .dist for package resolution
  if (fs.existsSync(NPMRC_PATH)) {
    await $`cp ${NPMRC_PATH} ${OUTPUT_DIR}/.npmrc`.quiet();
  }
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
  const outputPath = path.join(OUTPUT_DIR, 'schemas.d.ts');

  await $`bunx dts-bundle-generator --project ${BUILD_TSCONFIG_PATH} --out-file ${outputPath} --no-check --export-referenced-types --external-imports=@dotfiles/core --external-imports=zod --external-inlines=@dotfiles/config --external-inlines=@dotfiles/logger -- ${schemaExportsPath}`.quiet();

  writeStdout('✅ Successfully created schemas.d.ts with dts-bundle-generator');
}

async function createValidationTsConfig(): Promise<void> {
  await Bun.write(
    VALIDATION_TSCONFIG_PATH,
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          noUnusedLocals: false, // Validation file intentionally keeps unused locals
          noUnusedParameters: false, // Validation file intentionally keeps unused parameters
        },
        include: ['./schemas.d.ts', './validate-exports.ts'],
        exclude: ['../packages/**/*'],
      },
      null,
      2,
    ),
  );
}

async function createExportValidationFile(): Promise<void> {
  const validationCode = `
    // TypeScript validation file to ensure required exports are present
    import type { Architecture, Platform } from './schemas';
    import { defineTool } from './schemas';

    // These should compile without errors if exports are correct
    const _arch: Architecture = 'x86_64';
    const _platform: Platform = 'macos';
    const _defineTool = defineTool;

    // Verify defineTool is a function
    const _isFunction: typeof defineTool extends Function ? true : false = true;

    // should work
    defineTool((install, _ctx) => install('github-release', { repo: 'BurntSushi/ripgrep' }));

    // @ts-expect-error: known install method with invalid params should fail type checking
    defineTool((install, _ctx) => install('github-release', { invalid: 'value' }));

    // @ts-expect-error: unknown install method should fail type checking
    defineTool((install, _ctx) => install('unknown', {}));
  `;

  await Bun.write(path.join(OUTPUT_DIR, 'validate-exports.ts'), validationCode);
}

async function validateSchemas(dependencyVersions: DependencyVersions): Promise<void> {
  writeStdout('🔍 Validating generated schemas...');

  // Read the existing workspace package.json created by buildSchemaTypes
  const existingPackageJsonRaw: unknown = JSON.parse(await Bun.file(OUTPUT_PACKAGE_JSON_PATH).text());
  const existingPackageJson = toRecord(existingPackageJsonRaw);
  const existingDependenciesValue = existingPackageJson['dependencies'];
  const existingDependencies: Record<string, string> = isStringRecord(existingDependenciesValue)
    ? existingDependenciesValue
    : {};

  const updatedDependencies: Record<string, string> = {
    ...existingDependencies,
    zod: dependencyVersions.zod,
    'type-fest': dependencyVersions.typeFest,
    '@types/bun': dependencyVersions.bunTypes,
  };

  const updatedPackageJson: Record<string, unknown> = {
    ...existingPackageJson,
    dependencies: updatedDependencies,
  };

  await Bun.write(OUTPUT_PACKAGE_JSON_PATH, JSON.stringify(updatedPackageJson, null, 2));
  await createValidationTsConfig();
  await createExportValidationFile();

  // Copy .npmrc for validation install
  if (fs.existsSync(NPMRC_PATH)) {
    await $`cp ${NPMRC_PATH} ${OUTPUT_DIR}/.npmrc`.quiet();
  }

  // Install dependencies for validation
  await installDependenciesInOutputDir();

  // Validate with TypeScript
  await $`cd ${OUTPUT_DIR} && bun tsgo --project ${path.basename(VALIDATION_TSCONFIG_PATH)}`.quiet();

  writeStdout('✅ Schema validation passed');
}

async function cleanupValidationFiles(): Promise<void> {
  const filesToCleanup: string[] = [
    VALIDATION_TSCONFIG_PATH,
    OUTPUT_NODE_MODULES_PATH,
    OUTPUT_LOCKFILE_PATH,
    path.join(OUTPUT_DIR, '.npmrc'),
    path.join(OUTPUT_DIR, 'validate-exports.ts'),
  ];

  for (const filePath of filesToCleanup) {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { recursive: true, force: true });
    }
  }
}

async function cleanupTempFiles(): Promise<void> {
  const filesToCleanup: string[] = [TEMP_SCHEMAS_BUILD_DIR, BUILD_TSCONFIG_PATH];

  for (const filePath of filesToCleanup) {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { recursive: true, force: true });
    }
  }
}

async function generateSchemaTypes(): Promise<void> {
  writeStdout('📝 Building @dotfiles/core config types...');

  try {
    const dependencyVersions = await getDependencyVersions();
    await buildSchemaTypes(dependencyVersions);
    await validateSchemas(dependencyVersions);
    await cleanupValidationFiles();
    await cleanupTempFiles();

    writeStdout('✅ @dotfiles/core config types bundled with dts-bundle-generator');
  } catch (error) {
    writeStderr('❌ Schema type generation failed');
    throw error;
  }
}

async function generatePackageJson(dependencyVersions: DependencyVersions): Promise<void> {
  const bin: Record<string, string> = {
    dotfiles: './cli.js',
  };
  const exportImportEntry: Record<string, string> = {
    types: './schemas.d.ts',
    default: './cli.js',
  };
  const exportsField: Record<string, unknown> = {
    '.': {
      import: exportImportEntry,
    },
  };
  const dependencies: Record<string, string> = {
    zod: dependencyVersions.zod,
    'type-fest': dependencyVersions.typeFest,
  };
  const packageJson: Record<string, unknown> = {
    name: '@gitea/dotfiles',
    version: cliPackageVersion,
    type: 'module',
    bin,
    exports: exportsField,
    dependencies,
  };

  fs.writeFileSync(OUTPUT_PACKAGE_JSON_PATH, JSON.stringify(packageJson, null, 2));
}

async function testBuiltCli(): Promise<void> {
  writeStdout('🧪 Testing built CLI...');

  const testResult = await $`bun ${CLI_OUTPUT_FILE} --version`.quiet();

  if (testResult.exitCode === 0) {
    writeStdout(`✅ CLI test passed - version: ${testResult.stdout.toString().trim()}`);
  } else {
    writeStderr(`❌ CLI test failed with exit code: ${testResult.exitCode}`);
    writeStderr(`Error output: ${testResult.stderr.toString()}`);
    throw new Error('CLI test failed');
  }
}

async function printBuildSummary(): Promise<void> {
  writeStdout('✅ Build completed successfully!');
  writeStdout(`📁 Output directory: ${OUTPUT_DIR}`);
  writeStdout('🗂️  Generated files:');

  // Read all files from the output directory
  const files = fs.readdirSync(OUTPUT_DIR);

  for (const file of files.sort()) {
    const filePath = path.join(OUTPUT_DIR, file);
    const relativePath = path.relative(process.cwd(), filePath);
    const stats = fs.statSync(filePath);

    if (stats.isFile()) {
      writeStdout(`   - ${relativePath}`);
    }
  }
}

async function main(): Promise<void> {
  cdToRepoRoot(import.meta.url);

  try {
    await cleanPreviousBuild();
    await installWorkspaceDependencies();

    const dependencyVersions = await getDependencyVersions();
    await buildCli();
    await generateSchemaTypes();
    await generatePackageJson(dependencyVersions);
    await testBuiltCli();
    await printBuildSummary();
  } catch (error) {
    writeError('❌ Build error:', error);
    process.exit(1);
  }
}

await main();
