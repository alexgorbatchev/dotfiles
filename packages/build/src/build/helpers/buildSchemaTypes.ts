import { shell } from "./shell";

import type { IBuildContext, IDependencyVersions } from "../types";
import { getBuiltPackageName } from "@dotfiles/utils";
import { copyPackagesToOutputDir } from "./copyPackagesToOutputDir";
import { createTempSchemasPackage } from "./createTempSchemasPackage";
import { createDtsBundlerTsConfig, createTempTsConfig } from "./createTempTsConfig";
import { installDependenciesInOutputDir } from "./installDependenciesInOutputDir";
import { resolveAuthoringExportsDtsPath, resolveSchemaExportsDtsPath } from "./resolveSchemaExportsDtsPath";

const SCHEMA_EXTERNAL_IMPORTS: string[] = ["@dotfiles/core", "zod", "bun"];
const SCHEMA_EXTERNAL_INLINES: string[] = [
  "@dotfiles/config",
  "@dotfiles/logger",
  "@dotfiles/installer-brew",
  "@dotfiles/installer-cargo",
  "@dotfiles/installer-curl-script",
  "@dotfiles/installer-curl-binary",
  "@dotfiles/installer-curl-tar",
  "@dotfiles/installer-dmg",
  "@dotfiles/installer-github",
  "@dotfiles/installer-manual",
  "@dotfiles/tool-config-builder",
];
const AUTHORING_EXTERNAL_INLINES: string[] = [
  "@dotfiles/config",
  "@dotfiles/core",
  "@dotfiles/logger",
  "@dotfiles/tool-config-builder",
  "@dotfiles/utils",
  "@dotfiles/unwrap-value",
  "@dotfiles/installer-brew",
  "@dotfiles/installer-cargo",
  "@dotfiles/installer-curl-binary",
  "@dotfiles/installer-curl-script",
  "@dotfiles/installer-curl-tar",
  "@dotfiles/installer-dmg",
  "@dotfiles/installer-gitea",
  "@dotfiles/installer-github",
  "@dotfiles/installer-manual",
  "@dotfiles/installer-npm",
  "@dotfiles/installer-pkg",
  "@dotfiles/installer-zsh-plugin",
  "bun",
  "zod",
];
const DOTFILES_CLI_MODULE_NAME = "@dotfiles/cli";

/**
 * Returns path to dts-bundle-generator binary.
 * Uses require.resolve instead of a hardcoded path because bun may hoist the
 * package into node_modules/.bun/ rather than the top-level node_modules/.
 */
function getDtsBundleGeneratorPath(): string {
  return require.resolve("dts-bundle-generator/dist/bin/dts-bundle-generator.js");
}

/**
 * Builds the bundled schema declarations file used in the published output.
 *
 * Notes:
 * - Declaration emit (`tsgo`) happens first and can use the root workspace environment.
 * - A temporary workspace is created and installed in the output directory to make subsequent
 *   bundling/validation steps deterministic.
 * - dts-bundle-generator uses a separate tsconfig that points to generated .d.ts files.
 */
export async function buildSchemaTypes(context: IBuildContext, dependencyVersions: IDependencyVersions): Promise<void> {
  await createTempTsConfig(context);
  await shell`bun tsgo --project ${context.paths.buildTsconfigPath}`;

  copyPackagesToOutputDir(context);
  await createTempSchemasPackage(context, dependencyVersions);
  await installDependenciesInOutputDir(context);

  const schemaExportsPath: string = resolveSchemaExportsDtsPath(context.paths.tempSchemasBuildDir);
  const authoringExportsPath: string = resolveAuthoringExportsDtsPath(context.paths.tempSchemasBuildDir);
  const dtsBundlerConfigPath: string = await createDtsBundlerTsConfig(context);
  const dtsBundleGeneratorPath: string = getDtsBundleGeneratorPath();

  await runDtsBundleGenerator({
    dtsBundleGeneratorPath,
    dtsBundlerConfigPath,
    outputPath: context.paths.outputSchemasDtsPath,
    entryPath: schemaExportsPath,
    externalImports: SCHEMA_EXTERNAL_IMPORTS,
    externalInlines: SCHEMA_EXTERNAL_INLINES,
  });

  await runDtsBundleGenerator({
    dtsBundleGeneratorPath,
    dtsBundlerConfigPath,
    outputPath: context.paths.outputAuthoringTypesDtsPath,
    entryPath: authoringExportsPath,
    externalInlines: AUTHORING_EXTERNAL_INLINES,
  });

  await wrapAuthoringTypesAsAmbientModules(context.paths.outputAuthoringTypesDtsPath);

  console.log("✅ Successfully created schemas.d.ts with dts-bundle-generator");
  console.log("✅ Successfully created authoring-types.d.ts with dts-bundle-generator");
}

interface IRunDtsBundleGeneratorOptions {
  dtsBundleGeneratorPath: string;
  dtsBundlerConfigPath: string;
  outputPath: string;
  entryPath: string;
  externalImports?: string[];
  externalInlines?: string[];
}

async function runDtsBundleGenerator(options: IRunDtsBundleGeneratorOptions): Promise<void> {
  const args: string[] = [
    options.dtsBundleGeneratorPath,
    "--silent",
    "--project",
    options.dtsBundlerConfigPath,
    "--out-file",
    options.outputPath,
    "--no-check",
    "--export-referenced-types=false",
  ];

  for (const packageName of options.externalImports ?? []) {
    args.push("--external-imports", packageName);
  }

  for (const packageName of options.externalInlines ?? []) {
    args.push("--external-inlines", packageName);
  }

  args.push("--", options.entryPath);
  await Bun.$`bun ${args}`.quiet();
}

async function wrapAuthoringTypesAsAmbientModules(authoringTypesPath: string): Promise<void> {
  const sourceContent = await Bun.file(authoringTypesPath).text();
  const moduleBody = removeTrailingEmptyExport(sourceContent).trim();
  const wrappedContent = resolveAuthoringModuleNames()
    .map((moduleName) => [`declare module "${moduleName}" {`, indentBlock(moduleBody), `}`].join("\n"))
    .join("\n\n");

  await Bun.write(authoringTypesPath, `${wrappedContent}\n`);
}

function removeTrailingEmptyExport(content: string): string {
  return content.replace(/\n?export \{\};\s*$/u, "");
}

function indentBlock(content: string): string {
  return content
    .split("\n")
    .map((line) => (line.length > 0 ? `  ${line}` : line))
    .join("\n");
}

function resolveAuthoringModuleNames(): string[] {
  return [...new Set([getBuiltPackageName(), DOTFILES_CLI_MODULE_NAME])];
}
