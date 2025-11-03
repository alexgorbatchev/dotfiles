/**
 * @file scripts/analyze-deps.ts
 * @description
 * This script analyzes the dependencies of all workspace packages located in the
 * `packages` directory. It generates a dependency tree that outlines the
 * relationships between these packages.
 *
 * The script performs the following actions:
 * 1. Scans for all `package.json` files within the `packages/*` directories.
 * 2. For each package, it identifies its dependencies on other packages within the
 *    same workspace (internal dependencies). This includes `dependencies`,
 *    `devDependencies`, and `peerDependencies`.
 * 3. Calculates the total size of the `src` directory for each package, excluding
 *    any `__tests__` subdirectories.
 * 4. Prints a dependency tree to the console, sorted by the number of internal
 *    dependencies in ascending order.
 *
 * The output for each package includes:
 * - The package name.
 * - The calculated size of its `src` directory in kilobytes (KB).
 * - A list of its internal dependencies, rendered in a tree-like format.
 *
 * This script is useful for understanding the dependency structure of the monorepo
 * and identifying packages with high coupling.
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
  const projectRoot = path.resolve(import.meta.dir, '..');
  const { packages, packagePaths } = await loadPackages(projectRoot);
  const packageInfos = await analyzeDependencies(packages, packagePaths);

  packageInfos.sort((a, b) => a.internalDependencies.length - b.internalDependencies.length);

  printDependencyTree(packageInfos);
}

main().catch(console.error);
