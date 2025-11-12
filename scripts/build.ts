#!/usr/bin/env bun

import fs from 'node:fs';
import path from 'node:path';
import { $ } from 'bun';
import cliPackageJson from '../package.json';
import { cdToRepoRoot, extractTypeAliasSignature } from './lib';

const LINE_BREAK = '\n';

const ROOT_DIR = process.cwd();
const PACKAGES_DIR = path.join(ROOT_DIR, 'packages');
const TMP_DIR = path.join(ROOT_DIR, '.tmp');
const OUTPUT_DIR = path.join(ROOT_DIR, '.dist');
const CLI_OUTPUT_FILE = path.join(OUTPUT_DIR, 'cli.js');
const ENTRY_POINT = path.resolve(PACKAGES_DIR, 'cli/src/main.ts');
const NPMRC_PATH = path.join(ROOT_DIR, '.npmrc');
const BUILD_TSCONFIG_PATH = path.join(OUTPUT_DIR, 'tsconfig--build.json');

const TEMP_SCHEMAS_BUILD_DIR_NAME = 'temp-schemas-build';
const TEMP_SCHEMAS_BUILD_DIR = path.join(TMP_DIR, TEMP_SCHEMAS_BUILD_DIR_NAME);
const TEMP_SCHEMAS_PACKAGE_PATH = path.join(TEMP_SCHEMAS_BUILD_DIR, 'package.json');
const TEMP_SCHEMAS_NPMRC_PATH = path.join(TEMP_SCHEMAS_BUILD_DIR, '.npmrc');

const OUTPUT_PACKAGE_JSON_PATH = path.join(OUTPUT_DIR, 'package.json');
const OUTPUT_NPMRC_PATH = path.join(OUTPUT_DIR, '.npmrc');
const OUTPUT_BUNFIG_PATH = path.join(OUTPUT_DIR, 'bunfig.toml');
const OUTPUT_BUN_LOCK_PATH = path.join(OUTPUT_DIR, 'bun.lock');
const SCHEMA_CHECK_TSCONFIG_PATH = path.join(OUTPUT_DIR, 'tsconfig--schemas-check.json');
const ROOT_NODE_MODULES_PATH = path.join(ROOT_DIR, 'node_modules');
const ROOT_BUN_CACHE_PATH = path.join(ROOT_NODE_MODULES_PATH, '.bun');
const BUN_INSTALL_CACHE_ENV = `BUN_INSTALL_CACHE=${ROOT_BUN_CACHE_PATH}`;
const BUILD_CHECK_DIR = path.join(TMP_DIR, 'build-check');
const BUILD_CHECK_NODE_MODULES_PATH = path.join(BUILD_CHECK_DIR, 'node_modules');
const BUILD_CHECK_PACKAGE_JSON_PATH = path.join(BUILD_CHECK_DIR, 'package.json');
const BUILD_CHECK_TSCONFIG_PATH = path.join(BUILD_CHECK_DIR, 'tsconfig.json');
const BUILD_CHECK_INDEX_PATH = path.join(BUILD_CHECK_DIR, 'index.ts');
const INSTALLER_PACKAGE_PREFIX = 'installer-';
const INSTALLER_BUILD_CHECK_RELATIVE_PATH = path.join('build-check', 'buildCheck.ts');
const BUILD_CHECK_SCRIPT_SUFFIX = '--buildCheck.ts';

interface InstallerBuildCheckScript {
  packageName: string;
  sourcePath: string;
}

interface DependencyVersions {
  zod: string;
  bunTypes: string;
  typescript: string;
}

interface SchemaCheckCompilerOptions {
  target: string;
  module: string;
  moduleResolution: string;
  strict: boolean;
  noEmit: boolean;
  skipLibCheck: boolean;
  types: string[];
}

interface SchemaCheckTsconfig {
  compilerOptions: SchemaCheckCompilerOptions;
  files: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
  result['catalog'] = source['catalog'];
  result['catalogs'] = source['catalogs'];
  return result;
}

function ensureBunCacheDirectory(): void {
  fs.mkdirSync(ROOT_NODE_MODULES_PATH, { recursive: true });
  fs.mkdirSync(ROOT_BUN_CACHE_PATH, { recursive: true });
}

async function installWorkspaceDependencies(): Promise<void> {
  ensureBunCacheDirectory();
  writeStdout('📦 Ensuring workspace dependencies...');
  try {
    await $`bun install`.quiet();
  } catch (error) {
    writeError('❌ Failed to install workspace dependencies:', error);
    throw normalizeError(error, 'Workspace dependency installation failed');
  }
}

async function installDependenciesInOutputDir(): Promise<void> {
  ensureBunCacheDirectory();
  try {
    await $`cd ${OUTPUT_DIR} && ${BUN_INSTALL_CACHE_ENV} bun install`.quiet();
  } catch (error) {
    writeError('❌ Failed to install temporary workspace dependencies:', error);
    throw normalizeError(error, 'Temporary dependency installation failed');
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

function normalizeError(error: unknown, fallbackMessage: string): Error {
  if (isError(error)) {
    return error;
  }

  const fallbackError = new Error(fallbackMessage);
  return fallbackError;
}

function isError(value: unknown): value is Error {
  return value instanceof Error;
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
  const bunTypesMatch = pmLsOutput.match(/@types\/bun@(\d+\.\d+\.\d+)/);
  const typescriptMatch = pmLsOutput.match(/(?:^|\s)typescript@(\d+\.\d+\.\d+)/);

  if (!zodMatch || !bunTypesMatch || !typescriptMatch) {
    throw new Error('Could not find zod, type-fest, @types/bun, or typescript versions in bun pm ls output');
  }

  const zodVersion = zodMatch[1];
  const bunTypesVersion = bunTypesMatch[1];
  const typescriptVersion = typescriptMatch[1];

  if (!zodVersion || !bunTypesVersion || !typescriptVersion) {
    throw new Error('Could not extract version numbers from dependency output');
  }

  const versions: DependencyVersions = {
    zod: zodVersion,
    bunTypes: bunTypesVersion,
    typescript: typescriptVersion,
  };

  return versions;
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
    '@dotfiles/*': [`${ROOT_DIR}/packages/*/src/index.ts`, `${ROOT_DIR}/packages/*/index.ts`],
  };
  const compilerOptions: Record<string, unknown> = {
    noEmit: false,
    declaration: true,
    emitDeclarationOnly: true,
    outDir: TEMP_SCHEMAS_BUILD_DIR,
    skipLibCheck: true,
    skipDefaultLibCheck: true,
    noImplicitAny: false,
    paths,
  };
  const tempTsConfig: Record<string, unknown> = {
    extends: `${ROOT_DIR}/packages/cli/tsconfig.json`,
    compilerOptions,
    include: [`${ROOT_DIR}/packages/cli/src/schema-exports.ts`],
  };

  await Bun.write(BUILD_TSCONFIG_PATH, JSON.stringify(tempTsConfig, null, 2));
}

async function createTempSchemasPackage(dependencyVersions: DependencyVersions): Promise<void> {
  const dependencies: Record<string, string> = {
    zod: dependencyVersions.zod,
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
  const workspaces: string[] = [TEMP_SCHEMAS_BUILD_DIR, `${ROOT_DIR}/packages/*`];
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

  await Bun.write(path.join(OUTPUT_DIR, 'package.json'), JSON.stringify(tempRootPackageJson, null, 2));

  // Copy bunfig.toml for catalog configuration
  if (fs.existsSync('bunfig.toml')) {
    await $`cp bunfig.toml ${OUTPUT_BUNFIG_PATH}`.quiet();
  }

  // Copy .npmrc to .dist for package resolution
  if (fs.existsSync(NPMRC_PATH)) {
    await $`cp ${NPMRC_PATH} ${OUTPUT_NPMRC_PATH}`.quiet();
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

  await $`bunx dts-bundle-generator --project ${BUILD_TSCONFIG_PATH} --out-file ${outputPath} --no-check --export-referenced-types --external-imports=@dotfiles/core --external-imports=zod --external-inlines=@dotfiles/config --external-inlines=@dotfiles/logger --external-inlines=@dotfiles/installer-brew --external-inlines=@dotfiles/installer-cargo --external-inlines=@dotfiles/installer-curl-script --external-inlines=@dotfiles/installer-curl-tar --external-inlines=@dotfiles/installer-github --external-inlines=@dotfiles/installer-manual -- ${schemaExportsPath}`.quiet();

  writeStdout('✅ Successfully created schemas.d.ts with dts-bundle-generator');
}

function logYamlConfigTypeSignature(): void {
  const schemaTsconfigPath = SCHEMA_CHECK_TSCONFIG_PATH;
  const schemaSourcePath = path.join(OUTPUT_DIR, 'schemas.d.ts');
  const schemaCompilerOptions: SchemaCheckCompilerOptions = {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  };
  const schemaTsconfig: SchemaCheckTsconfig = {
    compilerOptions: schemaCompilerOptions,
    files: ['./schemas.d.ts'],
  };

  try {
    fs.writeFileSync(schemaTsconfigPath, JSON.stringify(schemaTsconfig, null, 2));
    const signature = extractTypeAliasSignature(schemaTsconfigPath, schemaSourcePath, 'YamlConfig');
    writeStdout('ℹ️ YamlConfig type signature:');
    writeStdout(signature);
  } catch (error) {
    writeError('⚠️ Failed to print YamlConfig type signature:', error);
    throw normalizeError(error, 'YamlConfig type extraction failed');
  } finally {
    fs.rmSync(schemaTsconfigPath, { force: true });
  }
}

function getBaseValidationSource(): string {
  const source: string = `
    import type { Architecture, Platform, YamlConfig } from '@gitea/dotfiles';
    import { defineTool } from '@gitea/dotfiles';

    export const baseBuildCheckArchitecture: Architecture = 'x86_64';
    export const baseBuildCheckPlatform: Platform = 'macos';
    export const baseBuildCheckDefineTool: typeof defineTool = defineTool;
  `;

  const formattedSource: string = `${source.trim()}\n`;
  return formattedSource;
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
      writeStderr(`❌ Missing build check script: ${packageName}`);
      process.exit(1);
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
    fs.copyFileSync(script.sourcePath, destinationPath);
  }
}

async function setupBuildCheckProject(dependencyVersions: DependencyVersions): Promise<void> {
  if (fs.existsSync(BUILD_CHECK_DIR)) {
    fs.rmSync(BUILD_CHECK_DIR, { recursive: true, force: true });
  }

  fs.mkdirSync(BUILD_CHECK_DIR, { recursive: true });

  const validationSource: string = getBaseValidationSource();
  await Bun.write(BUILD_CHECK_INDEX_PATH, validationSource);

  copyInstallerBuildCheckScripts(BUILD_CHECK_DIR);

  const compilerOptions: Record<string, unknown> = {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  };
  const tsConfig: Record<string, unknown> = {
    compilerOptions,
    include: ['./**/*.ts'],
  };
  await Bun.write(BUILD_CHECK_TSCONFIG_PATH, JSON.stringify(tsConfig, null, 2));

  const packageJson: Record<string, unknown> = {
    name: 'build-check',
    private: true,
    type: 'module',
    dependencies: {
      '@gitea/dotfiles': 'file:../../.dist',
    },
    devDependencies: {
      typescript: dependencyVersions.typescript,
    },
  };
  await Bun.write(BUILD_CHECK_PACKAGE_JSON_PATH, JSON.stringify(packageJson, null, 2));

  if (fs.existsSync(NPMRC_PATH)) {
    await $`cp ${NPMRC_PATH} ${path.join(BUILD_CHECK_DIR, '.npmrc')}`.quiet();
  }

  await $`cd ${BUILD_CHECK_DIR} && ${BUN_INSTALL_CACHE_ENV} bun install`.quiet();

  createBuildCheckSymlink();
}

function createBuildCheckSymlink(): void {
  fs.mkdirSync(BUILD_CHECK_NODE_MODULES_PATH, { recursive: true });

  const namespacePath = path.join(BUILD_CHECK_NODE_MODULES_PATH, '@gitea');
  fs.mkdirSync(namespacePath, { recursive: true });

  const symlinkPath = path.join(namespacePath, 'dotfiles');
  if (fs.existsSync(symlinkPath)) {
    fs.rmSync(symlinkPath, { recursive: true, force: true });
  }

  const absoluteOutputPath = path.resolve(OUTPUT_DIR);
  fs.symlinkSync(absoluteOutputPath, symlinkPath, 'dir');
}

async function runBuildCheck(): Promise<void> {
  try {
    await $`cd ${BUILD_CHECK_DIR} && bunx tsc --noEmit`;
  } catch (error) {
    throw normalizeError(error, 'Schema validation failed');
  }
}

async function validateSchemas(dependencyVersions: DependencyVersions): Promise<void> {
  writeStdout('🔍 Validating generated schemas...');
  await setupBuildCheckProject(dependencyVersions);
  await runBuildCheck();
  writeStdout('✅ Schema validation passed');
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
  writeStdout('📝 Building @dotfiles/core config types...');

  try {
    await buildSchemaTypes(dependencyVersions);
    logYamlConfigTypeSignature();
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
    await generateSchemaTypes(dependencyVersions);
    await generatePackageJson(dependencyVersions);

    try {
      await validateSchemas(dependencyVersions);
      writeStdout('✅ @dotfiles/core config types bundled with dts-bundle-generator');
    } finally {
      await cleanupTempFiles();
    }

    await testBuiltCli();
    await printBuildSummary();
  } catch {
    process.exit(1);
  }
}

await main();
