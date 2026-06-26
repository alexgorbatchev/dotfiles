import fs from "node:fs";
import path from "node:path";
import { shell } from "../helpers";
import { BuildError } from "../handleBuildError";
import type { IBuildContext, IDependencyVersions } from "../types";

// Shared dsl types are loaded dynamically from pkg/vm/dsl-types.ts during generation.

/**
 * Generates bundled schema and config declaration files used by the published package.
 */
export async function generateSchemaTypes(
  context: IBuildContext,
  _dependencyVersions: IDependencyVersions,
): Promise<void> {
  console.log("📝 Generating schema type files directly...");

  try {
    // 1. Run typegen script to update types.gen.ts
    const typegenResult = await shell`go run scripts/typegen/main.go`.noThrow().cwd(context.paths.rootDir);

    if (typegenResult.code !== 0) {
      throw new BuildError(`Go typegen failed: ${typegenResult.stderr.toString()}`);
    }

    // Load dsl-types from pkg/vm/dsl-types.ts
    const dslTypesPath = path.join(context.paths.rootDir, "pkg/vm/dsl-types.ts");
    const dslTypesContent = fs.readFileSync(dslTypesPath, "utf8");

    const publicDeclarationsTemplate = [
      "import { ZodError, z } from 'zod';",
      "export declare function dedentString(str: string): string;",
      "export declare function dedentTemplate(template: string, values: Record<string, string>): string;",
      dslTypesContent,
      "export declare function defineConfig(callback: ConfigFactory): ConfigFactory;",
      "export declare function defineTool(callback: AsyncConfigureTool): AsyncConfigureTool;",
      "export type {",
      "	IManualInstallParams as z_internal_ManualInstallParams,",
      "	ICargoInstallParams as z_internal_CargoInstallParams,",
      "	IBrewInstallParams as z_internal_BrewInstallParams,",
      "	IAptInstallParams as z_internal_AptInstallParams,",
      "	IPacmanInstallParams as z_internal_PacmanInstallParams,",
      "	IDnfInstallParams as z_internal_DnfInstallParams,",
      "	IPkgInstallParams as z_internal_PkgInstallParams,",
      "	IDmgInstallParams as z_internal_DmgInstallParams,",
      "	INpmInstallParams as z_internal_NpmInstallParams,",
      "	IZshPluginInstallParams as z_internal_ZshPluginInstallParams,",
      "	IGiteaReleaseInstallParams as z_internal_GiteaReleaseInstallParams,",
      "	ICurlTarInstallParams as z_internal_CurlTarInstallParams,",
      "	ICurlScriptInstallParams as z_internal_CurlScriptInstallParams,",
      "	ICurlBinaryInstallParams as z_internal_CurlBinaryInstallParams,",
      "	IGithubReleaseInstallParams as z_internal_GithubReleaseInstallParams,",
      "	IInstallParamsRegistry as z_internal_IInstallParamsRegistry,",
      "	InstallMethod as z_internal_InstallMethod,",
      "	ISystemInfoInternal as z_internal_ISystemInfo,",
      "	IKnownBinNameRegistry as z_internal_IKnownBinNameRegistry,",
      "};",
    ].join("\n");

    // 2. Read the generated config interfaces
    const generatedTypesPath = path.join(context.paths.rootDir, "packages/dashboard/src/shared/types.gen.ts");
    const generatedTypesContent = fs.readFileSync(generatedTypesPath, "utf8");

    // Clean up comment lines or duplicate declarations if any
    const cleanedGeneratedTypes = generatedTypesContent
      .replace(/\/\* Do not change, this code is generated from Golang structs \*\//g, "")
      .trim();

    // Ensure outputDir exists
    if (!fs.existsSync(context.paths.outputDir)) {
      fs.mkdirSync(context.paths.outputDir, { recursive: true });
    }

    // 3. Assemble and write schemas.d.ts
    const schemasDtsContent = [
      "// Generated types for @alexgorbatchev/dotfiles",
      publicDeclarationsTemplate,
      cleanedGeneratedTypes,
    ].join("\n\n");
    fs.writeFileSync(context.paths.outputSchemasDtsPath, schemasDtsContent, "utf8");

    // 4. Assemble and write tool-types.d.ts
    const toolTypesDtsContent = [
      "// Generated tool-types for @alexgorbatchev/dotfiles",
      publicDeclarationsTemplate,
      cleanedGeneratedTypes,
    ].join("\n\n");
    fs.writeFileSync(path.join(context.paths.outputDir, "tool-types.d.ts"), toolTypesDtsContent, "utf8");

    // 5. Assemble and write cli.d.ts (wrapped as ambient declarations under "@alexgorbatchev/dotfiles" and "@dotfiles/cli")
    const indentedBody = [publicDeclarationsTemplate, cleanedGeneratedTypes]
      .join("\n\n")
      .split("\n")
      .map((line) => (line.trim().length > 0 ? `  ${line}` : line))
      .join("\n");

    const authoringTypesDtsContent = [
      `declare module "@alexgorbatchev/dotfiles" {`,
      indentedBody,
      `}`,
      "",
      `declare module "@dotfiles/cli" {`,
      `  export * from "@alexgorbatchev/dotfiles";`,
      `}`,
    ].join("\n");

    // Save as BOTH authoring-types.d.ts and cli.d.ts to guarantee 100% resolution for all tool paths and node projects!
    fs.writeFileSync(context.paths.outputAuthoringTypesDtsPath, authoringTypesDtsContent, "utf8");
    fs.writeFileSync(path.join(context.paths.outputDir, "cli.d.ts"), authoringTypesDtsContent, "utf8");

    console.log("... Generated .d.ts files successfully!");
  } catch (error) {
    throw new BuildError("Go-native schema type generation failed", error);
  }
}
