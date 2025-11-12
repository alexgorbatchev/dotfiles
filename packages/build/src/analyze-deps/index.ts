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

interface PackageJson {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface PackageInfo {
  name: string;
  formattedSize: string;
  internalDependencies: string[];
}

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

async function loadPackages(projectRoot: string) {
  const glob = new Bun.Glob('packages/*/package.json');
  const packageJsonPaths = await Array.fromAsync(glob.scan({ cwd: projectRoot, absolute: true }));

  const packages = new Map<string, PackageJson>();
  const packagePaths = new Map<string, string>();

  for (const p of packageJsonPaths) {
    const content: PackageJson = await Bun.file(p).json();
    if (content.name) {
      packages.set(content.name, content);
      packagePaths.set(content.name, path.dirname(p));
    }
  }
  return { packages, packagePaths };
}

async function analyzeDependencies(
  packages: Map<string, PackageJson>,
  packagePaths: Map<string, string>
): Promise<PackageInfo[]> {
  const packageNames = [...packages.keys()];
  const packageInfos: PackageInfo[] = [];

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

function printDependencyTree(packageInfos: PackageInfo[]) {
  console.log('Workspace Package Dependency Tree:');

  for (const info of packageInfos) {
    console.log(`\n${info.name} ${info.formattedSize}`);

    if (info.internalDependencies.length > 0) {
      info.internalDependencies.forEach((depName, index) => {
        const isLast = index === info.internalDependencies.length - 1;
        const prefix = isLast ? '└─' : '├─';
        console.log(`${prefix} ${depName}`);
      });
    } else {
      console.log('└─ (no internal dependencies)');
    }
  }
}

async function main() {
  const projectRoot = path.resolve(import.meta.dir, '../../../..');
  const { packages, packagePaths } = await loadPackages(projectRoot);
  const packageInfos = await analyzeDependencies(packages, packagePaths);

  packageInfos.sort((a, b) => a.internalDependencies.length - b.internalDependencies.length);

  printDependencyTree(packageInfos);
}

main().catch(console.error);
