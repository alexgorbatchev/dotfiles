import { init, parse } from 'es-module-lexer';
import { readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { BuildError } from './handleBuildError';

const DOTFILES_PACKAGE_PREFIX = '@dotfiles/';
const NODE_BUILTIN_PREFIX = 'node:';
const BUN_BUILTIN_PREFIX = 'bun:';
const BUN_MODULE_NAME = 'bun';
const NODE_BUILTIN_MODULES: Set<string> = new Set(builtinModules);

/**
 * Determines if a specifier is a "bare import" (a package name, not a path or URL).
 *
 * Bare imports are package specifiers like 'lodash' or '@scope/package'.
 * Non-bare imports include:
 * - Relative paths: './foo', '../bar'
 * - Absolute paths: '/foo/bar'
 * - URLs: 'https://...', 'data:...'
 */
function isBareImportSpecifier(specifier: string): boolean {
  // Relative paths, absolute paths, and URLs are not bare imports
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    return false;
  }

  // URLs are not bare imports (http://, https://, data:, etc.)
  if (specifier.includes('://') || specifier.startsWith('data:')) {
    return false;
  }

  return true;
}

/**
 * Packages that should be bundled into the output instead of externalized.
 *
 * The dashboard uses Preact for its client-side UI. These packages must be bundled
 * (not externalized) because:
 * 1. The dashboard client runs in the browser context (via Bun's HTML import)
 * 2. Externalized packages would require a separate install in .dist/
 * 3. Preact is small enough that bundling doesn't significantly impact CLI size
 */
const PACKAGES_TO_BUNDLE = new Set(['preact', 'preact-iso', 'lucide-preact']);

function shouldBundlePackage(specifier: string): boolean {
  // Extract package name from specifier (e.g., 'preact/hooks' -> 'preact')
  const packageName = specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];

  return PACKAGES_TO_BUNDLE.has(packageName ?? '');
}

/**
 * Determines if a bare import should be externalized (kept as a runtime dependency).
 *
 * Externalization rules:
 * 1. Non-bare imports (paths, URLs) are never externalized by this function
 * 2. `@dotfiles/*` packages are bundled (not externalized)
 * 3. Dashboard dependencies (preact, preact-iso) are bundled (not externalized)
 * 4. All other bare imports are externalized
 *
 * This allows the CLI to ship as a self-contained bundle while keeping large
 * third-party dependencies as runtime requirements listed in package.json.
 */
export function shouldExternalizeNonDotfilesBareImport(specifier: string): boolean {
  if (!isBareImportSpecifier(specifier)) {
    return false;
  }

  if (specifier.startsWith(DOTFILES_PACKAGE_PREFIX)) {
    return false;
  }

  // Dashboard dependencies should be bundled, not externalized
  if (shouldBundlePackage(specifier)) {
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

  const bundled: string[] = Array.from(bundledPackages).toSorted((a, b) => a.localeCompare(b));
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
        .map((name) => getPackageNameFromImportSpecifier(name)),
    ),
  ).toSorted((a, b) => a.localeCompare(b));

  if (dotfilesRuntimeImports.length > 0) {
    throw new BuildError(
      `@dotfiles packages must be bundled, found external imports: ${dotfilesRuntimeImports.join(', ')}`,
    );
  }

  const externalPackageNames: string[] = Array.from(
    new Set(
      bareNonBuiltinImports
        .filter((name) => !name.startsWith(DOTFILES_PACKAGE_PREFIX))
        .map((name) => getPackageNameFromImportSpecifier(name)),
    ),
  ).toSorted((a, b) => a.localeCompare(b));

  return externalPackageNames;
}

export async function printExternalModuleAnalysis(bundlePath: string): Promise<void> {
  const externalDependencies: string[] = await getExternalRuntimeDependenciesFromBundle(bundlePath);

  console.log('📦 External dependencies found:');
  for (const dependency of externalDependencies) {
    console.log(`  - ${dependency}`);
  }
}
