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

interface DependencyVersions {
  zod: string;
  typeFest: string;
  bunTypes: string;
}

async function cleanPreviousBuild(): Promise<void> {
  if (fs.existsSync(OUTPUT_DIR)) {
    console.log('🧹 Cleaning previous build...');
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
  console.log('🏗️  Building CLI...');
  console.log(`📍 Entry: ${ENTRY_POINT}`);
  console.log(`📦 Output: ${CLI_OUTPUT_FILE}`);

  process.env['DOTFILES_VERSION'] = cliPackageJson.version;

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
    env: 'DOTFILES_*',
  });

  if (!result.success) {
    console.error('❌ Build failed:');
    for (const message of result.logs) {
      console.error(`   ${message}`);
    }
    throw new Error('CLI build failed');
  }

  // Make cli.js executable
  fs.chmodSync(CLI_OUTPUT_FILE, 0o755);

  return result;
}

async function createTempTsConfig(): Promise<void> {
  const tempTsConfig = {
    extends: '../packages/schemas/tsconfig.json',
    compilerOptions: {
      noEmit: false,
      declaration: true,
      emitDeclarationOnly: true,
      outDir: './temp-schemas-build',
    },
    include: ['../packages/schemas/src/**/*'],
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
      'type-fest': dependencyVersions.typeFest,
      '@types/bun': dependencyVersions.bunTypes,
    },
  };

  await Bun.write(TEMP_SCHEMAS_PACKAGE_PATH, JSON.stringify(tempPackageJson, null, 2));

  // Copy .npmrc for package resolution
  if (fs.existsSync(NPMRC_PATH)) {
    await $`cp ${NPMRC_PATH} ${TEMP_SCHEMAS_NPMRC_PATH}`.quiet();
  }
}

async function buildSchemaTypes(dependencyVersions: DependencyVersions): Promise<void> {
  await createTempTsConfig();
  await $`bun tsgo --project ${BUILD_TSCONFIG_PATH}`.quiet();

  await createTempSchemasPackage(dependencyVersions);

  // Install external dependencies in the temp build folder
  await $`cd ${TEMP_SCHEMAS_BUILD_DIR} && bun install`.quiet();

  // Bundle only our @dotfiles packages, keeping zod and type-fest as external dependencies
  await $`cd ${OUTPUT_DIR} && bun dts-bundle-generator --out-file schemas.d.ts ${path.basename(TEMP_SCHEMAS_BUILD_DIR)}/index.d.ts --no-check --external-imports zod --external-imports type-fest`.quiet();
}

async function createValidationTsConfig(): Promise<void> {
  const tempValidationTsConfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    files: ['./schemas.d.ts'],
  };

  await Bun.write(VALIDATION_TSCONFIG_PATH, JSON.stringify(tempValidationTsConfig, null, 2));
}

async function validateSchemas(dependencyVersions: DependencyVersions): Promise<void> {
  console.log('🔍 Validating generated schemas...');

  // Create validation package.json directly
  const tempValidationPackageJson = {
    name: 'temp-validation',
    version: '0.0.0',
    type: 'module',
    dependencies: {
      zod: dependencyVersions.zod,
      'type-fest': dependencyVersions.typeFest,
      '@types/bun': dependencyVersions.bunTypes,
    },
  };

  await Bun.write(OUTPUT_PACKAGE_JSON_PATH, JSON.stringify(tempValidationPackageJson, null, 2));
  await createValidationTsConfig();

  // Copy .npmrc for validation install
  if (fs.existsSync(NPMRC_PATH)) {
    await $`cp ${NPMRC_PATH} ${OUTPUT_DIR}/.npmrc`.quiet();
  }

  // Install dependencies for validation
  await $`cd ${OUTPUT_DIR} && bun install`.quiet();

  // Validate with TypeScript
  await $`cd ${OUTPUT_DIR} && bun tsgo --project ${path.basename(VALIDATION_TSCONFIG_PATH)}`.quiet();

  console.log('✅ Schema validation passed');
}

async function cleanupValidationFiles(): Promise<void> {
  const filesToCleanup: string[] = [
    VALIDATION_TSCONFIG_PATH,
    OUTPUT_NODE_MODULES_PATH,
    OUTPUT_LOCKFILE_PATH,
    path.join(OUTPUT_DIR, '.npmrc'),
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
  console.log('📝 Building @dotfiles/schemas types...');

  try {
    const dependencyVersions = await getDependencyVersions();
    await buildSchemaTypes(dependencyVersions);
    await validateSchemas(dependencyVersions);
    await cleanupValidationFiles();
    await cleanupTempFiles();

    console.log('✅ @dotfiles/schemas types bundled with dts-bundle-generator');
  } catch (error) {
    console.error('❌ Schema type generation failed');
    throw error;
  }
}

async function generatePackageJson(dependencyVersions: DependencyVersions): Promise<void> {
  const packageJson = {
    name: 'dotfiles',
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
      'type-fest': dependencyVersions.typeFest,
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
    console.error('❌ CLI test failed with exit code:', testResult.exitCode);
    console.error('Error output:', testResult.stderr.toString());
    throw new Error('CLI test failed');
  }
}

async function printBuildSummary(): Promise<void> {
  console.log('✅ Build completed successfully!');
  console.log(`📁 Output directory: ${OUTPUT_DIR}`);
  console.log(`🗂️  Generated files:`);

  // Read all files from the output directory
  const files = fs.readdirSync(OUTPUT_DIR);

  for (const file of files.sort()) {
    const filePath = path.join(OUTPUT_DIR, file);
    const relativePath = path.relative(process.cwd(), filePath);
    const stats = fs.statSync(filePath);

    if (stats.isFile()) {
      console.log(`   - ${relativePath}`);
    }
  }
}

async function main(): Promise<void> {
  cdToRepoRoot(import.meta.url);

  try {
    await cleanPreviousBuild();

    const dependencyVersions = await getDependencyVersions();
    await buildCli();
    await generateSchemaTypes();
    await generatePackageJson(dependencyVersions);
    await testBuiltCli();
    await printBuildSummary();
  } catch (error) {
    console.error('❌ Build error:', error);
    process.exit(1);
  }
}

await main();
