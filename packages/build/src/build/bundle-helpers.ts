/** biome-ignore-all lint/suspicious/noConsole: build script */

import { readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { init, parse } from 'es-module-lexer';
import { BuildError } from './handleBuildError';

const DOTFILES_PACKAGE_PREFIX = '@dotfiles/';
const NODE_BUILTIN_PREFIX = 'node:';
const BUN_BUILTIN_PREFIX = 'bun:';
const BUN_MODULE_NAME = 'bun';
const NODE_BUILTIN_MODULES: Set<string> = new Set(builtinModules);

function isBareImportSpecifier(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('/');
}

export function shouldExternalizeNonDotfilesBareImport(specifier: string): boolean {
  if (!isBareImportSpecifier(specifier)) {
    return false;
  }

  if (specifier.startsWith(DOTFILES_PACKAGE_PREFIX)) {
    return false;
  }

  return true;
}

function isBuiltinImportSpecifier(specifier: string): boolean {
  return (
    specifier === BUN_MODULE_NAME ||
    specifier.startsWith(BUN_BUILTIN_PREFIX) ||
    specifier.startsWith(NODE_BUILTIN_PREFIX) ||
    NODE_BUILTIN_MODULES.has(specifier)
  );
}

function getPackageNameFromImportSpecifier(specifier: string): string {
  if (specifier.startsWith('@')) {
    const parts: string[] = specifier.split('/');
    const scope: string | undefined = parts[0];
    const name: string | undefined = parts[1];

    if (!scope || !name) {
      return specifier;
    }

    return `${scope}/${name}`;
  }

  const [name]: string[] = specifier.split('/');
  return name ?? specifier;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function getStringArrayProperty(record: Record<string, unknown>, key: string): string[] {
  const value: unknown = record[key];
  if (!Array.isArray(value)) {
    throw new BuildError(`Invalid source map, missing ${key}`);
  }

  const strings: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      throw new BuildError(`Invalid source map, ${key} contains non-string entries`);
    }
    strings.push(entry);
  }

  return strings;
}

function tryGetWorkspacePackageFolderFromSourcePath(sourcePath: string): string | undefined {
  const parts: string[] = sourcePath.split('/');
  const packagesIndex: number = parts.indexOf('packages');
  const candidateIndex: number = packagesIndex + 1;

  if (packagesIndex === -1) {
    return undefined;
  }

  const folderName: string | undefined = parts[candidateIndex];
  if (!folderName) {
    return undefined;
  }

  return folderName;
}

function tryGetNodeModulesPackageNameFromSourcePath(sourcePath: string): string | undefined {
  const parts: string[] = sourcePath.split('/');
  const nodeModulesIndex: number = parts.indexOf('node_modules');
  const candidateIndex: number = nodeModulesIndex + 1;

  if (nodeModulesIndex === -1) {
    return undefined;
  }

  const first: string | undefined = parts[candidateIndex];
  if (!first) {
    return undefined;
  }

  if (first.startsWith('@')) {
    const second: string | undefined = parts[candidateIndex + 1];
    if (!second) {
      return undefined;
    }
    return `${first}/${second}`;
  }

  return first;
}

export async function getBundledDependenciesFromSourceMap(sourceMapPath: string): Promise<string[]> {
  const raw: string = await readFile(sourceMapPath, 'utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new BuildError('Failed to parse cli.js source map', error);
  }

  if (!isRecord(parsed)) {
    throw new BuildError('Invalid cli.js source map');
  }

  const sources: string[] = getStringArrayProperty(parsed, 'sources');

  const bundledPackages: Set<string> = new Set();

  for (const source of sources) {
    const workspaceFolder: string | undefined = tryGetWorkspacePackageFolderFromSourcePath(source);
    if (workspaceFolder) {
      bundledPackages.add(`${DOTFILES_PACKAGE_PREFIX}${workspaceFolder}`);
      continue;
    }

    const nodeModulesPackageName: string | undefined = tryGetNodeModulesPackageNameFromSourcePath(source);
    if (nodeModulesPackageName && !isBuiltinImportSpecifier(nodeModulesPackageName)) {
      bundledPackages.add(nodeModulesPackageName);
    }
  }

  const bundled: string[] = Array.from(bundledPackages).sort((a, b) => a.localeCompare(b));
  return bundled;
}

export async function printBundledModuleAnalysis(sourceMapPath: string): Promise<void> {
  const bundledDependencies: string[] = await getBundledDependenciesFromSourceMap(sourceMapPath);
  console.log('📦 Bundled dependencies found:');
  for (const dependency of bundledDependencies) {
    console.log(`  - ${dependency}`);
  }
}

export async function getExternalRuntimeDependenciesFromBundle(bundlePath: string): Promise<string[]> {
  await init;
  const code: string = await readFile(bundlePath, 'utf8');
  const imports = parse(code)[0];

  const bareNonBuiltinImports: string[] = imports
    .map((entry) => entry.n)
    .filter((name): name is string => typeof name === 'string')
    .filter((name) => isBareImportSpecifier(name))
    .filter((name) => !isBuiltinImportSpecifier(name));

  const dotfilesRuntimeImports: string[] = Array.from(
    new Set(
      bareNonBuiltinImports
        .filter((name) => name.startsWith(DOTFILES_PACKAGE_PREFIX))
        .map((name) => getPackageNameFromImportSpecifier(name))
    )
  ).sort((a, b) => a.localeCompare(b));

  if (dotfilesRuntimeImports.length > 0) {
    throw new BuildError(
      `@dotfiles packages must be bundled, found external imports: ${dotfilesRuntimeImports.join(', ')}`
    );
  }

  const externalPackageNames: string[] = Array.from(
    new Set(
      bareNonBuiltinImports
        .filter((name) => !name.startsWith(DOTFILES_PACKAGE_PREFIX))
        .map((name) => getPackageNameFromImportSpecifier(name))
    )
  ).sort((a, b) => a.localeCompare(b));

  return externalPackageNames;
}

export async function printExternalModuleAnalysis(bundlePath: string): Promise<void> {
  const externalDependencies: string[] = await getExternalRuntimeDependenciesFromBundle(bundlePath);

  console.log('📦 External dependencies found:');
  for (const dependency of externalDependencies) {
    console.log(`  - ${dependency}`);
  }
}
