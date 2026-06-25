import fs from "node:fs";
import path from "node:path";
import { getPackageJson } from "../../getPackageJson";
import type { IBuildContext, IDependencyVersions } from "../types";

const NPM_PACKAGE_NAME = "@alexgorbatchev/dotfiles";
const NPM_PUBLIC_REGISTRY_URL = "https://registry.npmjs.org/";
const PUBLIC_PACKAGE_KEYWORDS: string[] = ["dotfiles", "cli", "developer-tools", "tool-installer", "shell", "bun"];

/**
 * Writes the output package.json used for publishing/running the built CLI, including optional native dependencies.
 * Also generates the sub-directories and package.json files for each of the 4 native target packages.
 */
export async function generateDistPackageJson(
  context: IBuildContext,
  dependencyVersions: IDependencyVersions,
): Promise<void> {
  const rootPackageJson = getPackageJson();

  // Clean, Go-native package dependencies (only types required for compilation of user .tool.ts files)
  const dependencies: Record<string, string> = {
    "@types/bun": dependencyVersions.bunTypes,
    "@types/node": dependencyVersions.nodeTypes,
  };

  const platforms = [
    { osName: "darwin", cpuArch: "x64", nodeArch: "x64" },
    { osName: "darwin", cpuArch: "arm64", nodeArch: "arm64" },
    { osName: "linux", cpuArch: "x64", nodeArch: "x64" },
    { osName: "linux", cpuArch: "arm64", nodeArch: "arm64" },
  ];

  // Optional dependencies for multi-platform distribution
  const optionalDependencies: Record<string, string> = {};
  for (const plat of platforms) {
    optionalDependencies[`${NPM_PACKAGE_NAME}-${plat.osName}-${plat.cpuArch}`] = rootPackageJson.version;
  }

  const packageJson: Record<string, unknown> = {
    name: NPM_PACKAGE_NAME,
    version: rootPackageJson.version,
    description: "Declarative, versioned dotfiles management with generated shims and shell integration.",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/alexgorbatchev/dotfiles.git",
    },
    homepage: "https://github.com/alexgorbatchev/dotfiles#readme",
    bugs: {
      url: "https://github.com/alexgorbatchev/dotfiles/issues",
    },
    keywords: PUBLIC_PACKAGE_KEYWORDS,
    type: "module",
    main: "./cli.js",
    bin: {
      dotfiles: "cli.js",
    },
    types: "./schemas.d.ts",
    exports: {
      ".": {
        import: {
          types: "./schemas.d.ts",
          default: "./cli.js",
        },
      },
    },
    files: ["*.js", "*.d.ts", "skill", "README.md", "LICENSE"],
    publishConfig: {
      registry: NPM_PUBLIC_REGISTRY_URL,
      access: "public",
    },
    dependencies,
    optionalDependencies,
  };

  fs.writeFileSync(context.paths.outputPackageJsonPath, JSON.stringify(packageJson, null, 2));

  // Generate packages directory in .dist for native platform-specific packages
  const outputPackagesDir = path.join(context.paths.outputDir, "packages");
  if (!fs.existsSync(outputPackagesDir)) {
    fs.mkdirSync(outputPackagesDir, { recursive: true });
  }

  for (const plat of platforms) {
    const subPkgName = `${NPM_PACKAGE_NAME}-${plat.osName}-${plat.cpuArch}`;
    const subPkgDir = path.join(
      outputPackagesDir,
      `${NPM_PACKAGE_NAME.replace("@", "")}-${plat.osName}-${plat.cpuArch}`,
    );
    fs.mkdirSync(subPkgDir, { recursive: true });
    fs.mkdirSync(path.join(subPkgDir, "bin"), { recursive: true });

    const subPkgJson = {
      name: subPkgName,
      version: rootPackageJson.version,
      description: `Statically compiled native Go binary of @alexgorbatchev/dotfiles for ${plat.osName}-${plat.cpuArch}.`,
      license: "MIT",
      os: [plat.osName],
      cpu: [plat.nodeArch],
      bin: {
        dotfiles: "./bin/dotfiles",
      },
      files: ["bin"],
      publishConfig: {
        registry: NPM_PUBLIC_REGISTRY_URL,
        access: "public",
      },
    };

    fs.writeFileSync(path.join(subPkgDir, "package.json"), JSON.stringify(subPkgJson, null, 2));
  }

  console.log("✅ Statically generated clean main and optional native package.jsons successfully!");
}
