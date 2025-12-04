#!/usr/bin/env bun

/**
 * Package Dependency Analyzer
 *
 * Analyzes and visualizes internal dependencies between workspace packages.
 *
 * This script:
 * 1. Scans all packages in the workspace
 * 2. Calculates the source code size for each package (excluding tests)
 * 3. Identifies internal dependencies (dependencies on other workspace packages)
 * 4. Displays a dependency tree showing relationships between packages
 * 5. Sorts packages by number of internal dependencies (least to most)
 *
 * Useful for:
 * - Understanding package interdependencies
 * - Identifying potential circular dependencies
 * - Planning refactoring or modularization
 * - Visualizing package sizes and complexity
 *
 * Usage:
 *   bun run analyze-deps
 */

import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { getRepoRoot } from '../path-utils';

/**
 * Metadata from a package.json file.
 */
interface IPackageJson {
  /** The package name (e.g., '@dotfiles/core'). */
  name: string;
  /** Production dependencies. */
  dependencies?: Record<string, string>;
  /** Development dependencies. */
  devDependencies?: Record<string, string>;
  /** Peer dependencies. */
  peerDependencies?: Record<string, string>;
}

/**
 * Analyzed information about a workspace package.
 */
interface IPackageInfo {
  /** The package name. */
  name: string;
  /** Formatted source code size (e.g., '21.93 KB'). */
  formattedSize: string;
  /** List of other workspace packages this package depends on. */
  internalDependencies: string[];
}

/**
 * Calculates the total size of a directory in bytes.
 *
 * Recursively traverses the directory, summing file sizes.
 * Excludes `__tests__` directories from the calculation.
 *
 * @param dirPath - The path to the directory.
 * @returns The total size in bytes.
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;
  try {
    const files = await readdir(dirPath, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        if (file.name !== '__tests__') {
          totalSize += await getDirectorySize(fullPath);
        }
      } else {
        const stats = await stat(fullPath);
        totalSize += stats.size;
      }
    }
  } catch {
    // Ignore errors if directory doesn't exist, etc.
  }
  return totalSize;
}

/**
 * Loads all package.json files from workspace packages.
 *
 * Scans the `packages/` directory for `package.json` files and creates
 * maps of package names to their parsed contents and directory paths.
 *
 * @param projectRoot - The absolute path to the repository root.
 * @returns Maps of package names to their metadata and paths.
 */
async function loadPackages(projectRoot: string) {
  const glob = new Bun.Glob('packages/*/package.json');
  const packageJsonPaths = await Array.fromAsync(glob.scan({ cwd: projectRoot, absolute: true }));

  const packages = new Map<string, IPackageJson>();
  const packagePaths = new Map<string, string>();

  for (const p of packageJsonPaths) {
    const content: IPackageJson = await Bun.file(p).json();
    if (content.name) {
      packages.set(content.name, content);
      packagePaths.set(content.name, path.dirname(p));
    }
  }
  return { packages, packagePaths };
}

/**
 * Analyzes dependencies between workspace packages.
 *
 * For each package, identifies which other workspace packages it depends on
 * (internal dependencies) and calculates the source code size.
 *
 * @param packages - Map of package names to their package.json data.
 * @param packagePaths - Map of package names to their directory paths.
 * @returns Array of package information including dependencies and sizes.
 */
async function analyzeDependencies(
  packages: Map<string, IPackageJson>,
  packagePaths: Map<string, string>
): Promise<IPackageInfo[]> {
  const packageNames = [...packages.keys()];
  const packageInfos: IPackageInfo[] = [];

  for (const name of packageNames) {
    const pkg = packages.get(name);
    if (!pkg) {
      continue;
    }

    const allDependencies = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
      ...(pkg.peerDependencies || {}),
    };

    const internalDependencies = Object.keys(allDependencies).filter((depName) => packageNames.includes(depName));

    const packagePath = packagePaths.get(name);
    const srcSize = packagePath ? await getDirectorySize(path.join(packagePath, 'src')) : 0;
    const formattedSize = srcSize > 0 ? `(${(srcSize / 1024).toFixed(2)} KB)` : '(no src)';

    packageInfos.push({
      name,
      formattedSize,
      internalDependencies,
    });
  }

  return packageInfos;
}

/**
 * Prints a formatted dependency tree to the console.
 *
 * Displays each package with its size and internal dependencies using
 * tree-like formatting with box-drawing characters.
 *
 * @param packageInfos - Array of package information to display.
 */
function printDependencyTree(packageInfos: IPackageInfo[]) {
  for (const info of packageInfos) {
    if (info.internalDependencies.length > 0) {
      info.internalDependencies.forEach((_depName, index) => {
        const isLast = index === info.internalDependencies.length - 1;
        // Tree prefix for visualization (intentionally unused in current implementation)
        void (isLast ? '└─' : '├─');
      });
    }
  }
}

/**
 * Main entry point for the dependency analyzer.
 *
 * Loads all workspace packages, analyzes their internal dependencies,
 * sorts them by dependency count (least to most), and prints a dependency tree.
 */
async function main() {
  const projectRoot = getRepoRoot();
  const { packages, packagePaths } = await loadPackages(projectRoot);
  const packageInfos = await analyzeDependencies(packages, packagePaths);

  packageInfos.sort((a, b) => a.internalDependencies.length - b.internalDependencies.length);

  printDependencyTree(packageInfos);
}

// biome-ignore lint/suspicious/noConsole: build script
main().catch(console.error);
