import { init, parse } from "es-module-lexer";
import { readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { BuildError } from "./handleBuildError";

const DOTFILES_PACKAGE_PREFIX = "@dotfiles/";
const NODE_BUILTIN_PREFIX = "node:";
const BUN_BUILTIN_PREFIX = "bun:";
const BUN_MODULE_NAME = "bun";
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
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return false;
  }

  // URLs are not bare imports (http://, https://, data:, etc.)
  if (specifier.includes("://") || specifier.startsWith("data:")) {
    return false;
  }

  return true;
}

/**
 * Checks if the import should be bundled because it's part of the dashboard client context.
 * Dashboard client code runs in the browser, so all its dependencies must be bundled.
 *
 * This includes:
 * 1. Direct imports from dashboard client source files
 * 2. Transitive dependencies - if the importer is in node_modules, it means we're
 *    resolving a dependency of a package we've already decided to bundle, so continue bundling
 */
function isDashboardClientImport(importer: string): boolean {
  // Direct imports from dashboard client source
  if (importer.includes("/dashboard/") && importer.includes("/client/")) {
    return true;
  }

  // Transitive dependencies - if the importer is in node_modules, it's a dependency
  // of something we're already bundling (either dashboard client or its deps).
  // Continue bundling to include the full dependency tree.
  if (importer.includes("/node_modules/")) {
    return true;
  }

  return false;
}

/**
 * Determines if a bare import should be externalized (kept as a runtime dependency).
 *
 * Externalization rules:
 * 1. Non-bare imports (paths, URLs) are never externalized by this function
 * 2. `@dotfiles/*` packages are bundled (not externalized)
 * 3. Imports from dashboard client code are bundled (browser context requires bundling)
 * 4. All other bare imports are externalized
 *
 * This allows the CLI to ship as a self-contained bundle while keeping large
 * third-party dependencies as runtime requirements listed in package.json.
 */
export function shouldExternalizeNonDotfilesBareImport(specifier: string, importer: string): boolean {
  if (!isBareImportSpecifier(specifier)) {
    return false;
  }

  if (specifier.startsWith(DOTFILES_PACKAGE_PREFIX)) {
    return false;
  }

  // Dashboard client imports must be bundled - browser can't resolve bare imports
  if (isDashboardClientImport(importer)) {
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
  if (specifier.startsWith("@")) {
    const parts: string[] = specifier.split("/");
    const scope: string | undefined = parts[0];
    const name: string | undefined = parts[1];

    if (!scope || !name) {
      return specifier;
    }

    return `${scope}/${name}`;
  }

  const [name]: string[] = specifier.split("/");
  return name ?? specifier;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function getStringArrayProperty(record: Record<string, unknown>, key: string): string[] {
  const value: unknown = record[key];
  if (!Array.isArray(value)) {
    throw new BuildError(`Invalid source map, missing ${key}`);
  }

  const strings: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      throw new BuildError(`Invalid source map, ${key} contains non-string entries`);
    }
    strings.push(entry);
  }

  return strings;
}

function tryGetWorkspacePackageFolderFromSourcePath(sourcePath: string): string | undefined {
  const parts: string[] = sourcePath.split("/");
  const packagesIndex: number = parts.indexOf("packages");
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
  const parts: string[] = sourcePath.split("/");
  const nodeModulesIndex: number = parts.indexOf("node_modules");
  const candidateIndex: number = nodeModulesIndex + 1;

  if (nodeModulesIndex === -1) {
    return undefined;
  }

  const first: string | undefined = parts[candidateIndex];
  if (!first) {
    return undefined;
  }

  if (first.startsWith("@")) {
    const second: string | undefined = parts[candidateIndex + 1];
    if (!second) {
      return undefined;
    }
    return `${first}/${second}`;
  }

  return first;
}

export async function getBundledDependenciesFromSourceMap(sourceMapPath: string): Promise<string[]> {
  const raw: string = await readFile(sourceMapPath, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new BuildError("Failed to parse cli.js source map", error);
  }

  if (!isRecord(parsed)) {
    throw new BuildError("Invalid cli.js source map");
  }

  const sources: string[] = getStringArrayProperty(parsed, "sources");

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
  console.log("📦 Bundled dependencies found:");
  for (const dependency of bundledDependencies) {
    console.log(`  - ${dependency}`);
  }
}

export async function getExternalRuntimeDependenciesFromBundle(bundlePath: string): Promise<string[]> {
  await init;
  const code: string = await readFile(bundlePath, "utf8");
  const imports = parse(code)[0];

  const bareNonBuiltinImports: string[] = imports
    .map((entry) => entry.n)
    .filter((name): name is string => typeof name === "string")
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
      `@dotfiles packages must be bundled, found external imports: ${dotfilesRuntimeImports.join(", ")}`,
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

  console.log("📦 External dependencies found:");
  for (const dependency of externalDependencies) {
    console.log(`  - ${dependency}`);
  }
}
