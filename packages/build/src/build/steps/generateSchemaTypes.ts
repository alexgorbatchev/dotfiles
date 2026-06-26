import fs from "node:fs";
import path from "node:path";
import { shell } from "../helpers";
import { BuildError } from "../handleBuildError";
import type { IBuildContext, IDependencyVersions } from "../types";

const publicDeclarationsTemplate = `
import { ZodError, z } from 'zod';

export type Resolvable<TParams, TReturn> = TReturn | ((params: TParams) => TReturn) | ((params: TParams) => Promise<TReturn>);

export declare function dedentString(str: string): string;
export declare function dedentTemplate(template: string, values: Record<string, string>): string;

export interface IFileSystem {
	readFile(path: string, encoding?: string): Promise<string>;
	writeFile(path: string, content: string, encoding?: string): Promise<void>;
	exists(path: string): Promise<boolean>;
	mkdir(path: string): Promise<void>;
	readdir(path: string): Promise<string[]>;
	rm(path: string): Promise<void>;
}

export enum Platform {
	None = 0,
	Linux = 1,
	MacOS = 2,
	Windows = 4,
	Unix = 3,
	All = 7,
}

export enum Architecture {
	None = 0,
	X86_64 = 1,
	Arm64 = 2,
	All = 3,
}

export enum Libc {
	Unknown = "unknown",
	Gnu = "gnu",
	Musl = "musl",
}

export interface IConfigContext {
	configFileDir: string;
	systemInfo: z_internal_ISystemInfo;
}

export interface IToolConfigContext {
	toolName: string;
	configFileDir: string;
	systemInfo: z_internal_ISystemInfo;
	currentDir: string;
	stagingDir: string;
	log: {
		trace: (msg: string) => void;
		debug: (msg: string) => void;
		info: (msg: string) => void;
		warn: (msg: string) => void;
		error: (msg: string) => void;
	};
	fs: IFileSystem;
	$: (strings: TemplateStringsArray | string[], ...values: any[]) => Promise<string>;
}

export interface z_internal_ISystemInfo {
	platform: Platform;
	arch: Architecture;
	homeDir: string;
	hostname: string;
}

export interface IManualInstallParams { binaryPath?: string }
export interface ICargoInstallParams { crate?: string; crateName?: string; version?: string }
export interface IBrewInstallParams { formula?: string; cask?: string; tap?: string }
export interface IAptInstallParams { packageName?: string; package?: string; version?: string; update?: boolean }
export interface IPacmanInstallParams { packageName?: string; package?: string; version?: string; sysupgrade?: boolean }
export interface IDnfInstallParams { packageName?: string; package?: string; version?: string; refresh?: boolean }
export interface IPkgInstallParams { url: string }
export interface IDmgInstallParams { url: string; appName: string }
export interface INpmInstallParams { packageName?: string; package?: string; global?: boolean }
export interface IZshPluginInstallParams { repo?: string; url?: string; pluginName?: string; auto?: boolean }
export interface IGiteaReleaseInstallParams { host?: string; repo: string; assetPattern?: string; instanceUrl: string }
export interface ICurlTarInstallParams { url: string; binDir?: string; versionArgs?: string | string[]; versionRegex?: string | RegExp }
export interface ICurlScriptInstallParams { url: string; shell?: string; args?: string[] | Resolvable<any, string[]> }
export interface ICurlBinaryInstallParams { url: string }
export interface IGithubReleaseInstallParams { repo: string; assetPattern?: string; ghCli?: boolean; prerelease?: boolean }

export type InstallMethod =
	| "manual"
	| "cargo"
	| "curl-script"
	| "brew"
	| "zsh-plugin"
	| "gitea-release"
	| "curl-tar"
	| "curl-binary"
	| "dmg"
	| "npm"
	| "apt"
	| "pacman"
	| "dnf"
	| "pkg"
	| "github-release";

export interface IInstallParamsRegistry {
	manual: IManualInstallParams;
	cargo: ICargoInstallParams;
	"curl-script": ICurlScriptInstallParams;
	brew: IBrewInstallParams;
	"zsh-plugin": IZshPluginInstallParams;
	"gitea-release": IGiteaReleaseInstallParams;
	"curl-tar": ICurlTarInstallParams;
	"curl-binary": ICurlBinaryInstallParams;
	dmg: IDmgInstallParams;
	npm: INpmInstallParams;
	apt: IAptInstallParams;
	pacman: IPacmanInstallParams;
	dnf: IDnfInstallParams;
	pkg: IPkgInstallParams;
	"github-release": IGithubReleaseInstallParams;
}

export interface z_internal_IKnownBinNameRegistry {
	__placeholder__?: never;
}

export type KnownBinNameKeys = Exclude<keyof z_internal_IKnownBinNameRegistry, "__placeholder__">;
export type KnownBinName = [KnownBinNameKeys] extends [never] ? string : KnownBinNameKeys;

export type ShellPathGuard<T> = "PATH" extends keyof T ? never : T;

export interface IShellConfigurator<KnownFunctions extends string = never> {
	env<T extends Record<string, string>>(values: ShellPathGuard<T>): this;
	alias(values: Record<string, string>): this;
	aliases(values: Record<string, string>): this;
	script(content: string): this;
	script(kind: "once" | "always", content: string): this;
	once(script: string): this;
	always(script: string): this;
	functions<K extends string>(values: Record<K, string>): IShellConfigurator<KnownFunctions | K>;
	path(pathValue: Resolvable<void, string>): this;
	completions(completions: string | Resolvable<void, any> | { bin?: string; value?: string; cmd?: string; source?: string; url?: string }): this;
	sourceFile(relativePath: string): this;
	sourceFunction(functionName: string): this;
	source(content: string): this;
}

export interface IToolConfigBuilder {
	bin(name: string, pattern?: string): this;
	binaries(binaries: string[]): this;
	version(v: string): this;
	sudo(): this;
	disable(): this;
	hostname(pattern: string): this;
	updateCheck(config: { enabled?: boolean; constraint?: string }): this;
	copy(src: string, dst: string): this;
	dependsOn(...binaryNames: KnownBinName[]): this;
	depends(...binaryNames: KnownBinName[]): this;
	symlink(src: string, dst: string): this;
	zsh(cb: (shell: IShellConfigurator) => void): this;
	bash(cb: (shell: IShellConfigurator) => void): this;
	powershell(cb: (shell: IShellConfigurator) => void): this;
	platform(plat: Platform, cb: (install: IPlatformInstallFunction) => void): this;
	arch(arc: Architecture, cb: (install: IPlatformInstallFunction) => void): this;
	hook(event: string, handler: any): this;
}

export interface IPlatformConfigBuilder {
	bin(name: string, pattern?: string): this;
	binaries(binaries: string[]): this;
	version(v: string): this;
	sudo(): this;
	disable(): this;
	hostname(pattern: string): this;
	updateCheck(config: { enabled?: boolean; constraint?: string }): this;
	copy(src: string, dst: string): this;
	dependsOn(...binaryNames: KnownBinName[]): this;
	depends(...binaryNames: KnownBinName[]): this;
	symlink(src: string, dst: string): this;
	zsh(cb: (shell: IShellConfigurator) => void): this;
	bash(cb: (shell: IShellConfigurator) => void): this;
	powershell(cb: (shell: IShellConfigurator) => void): this;
	hook(event: string, handler: any): this;
}

export interface IInstallFunction {
	<M extends InstallMethod>(method: M, params?: IInstallParamsRegistry[M]): IToolConfigBuilder;
	(): IToolConfigBuilder;
	manual(params?: IManualInstallParams): IToolConfigBuilder;
	cargo(params?: ICargoInstallParams): IToolConfigBuilder;
	"curl-script"(params?: ICurlScriptInstallParams): IToolConfigBuilder;
	brew(params?: IBrewInstallParams): IToolConfigBuilder;
	"zsh-plugin"(params?: IZshPluginInstallParams): IToolConfigBuilder;
	"gitea-release"(params?: IGiteaReleaseInstallParams): IToolConfigBuilder;
	"curl-tar"(params?: ICurlTarInstallParams): IToolConfigBuilder;
	"curl-binary"(params?: ICurlBinaryInstallParams): IToolConfigBuilder;
	dmg(params?: IDmgInstallParams): IToolConfigBuilder;
	npm(params?: INpmInstallParams): IToolConfigBuilder;
	apt(params?: IAptInstallParams): IToolConfigBuilder;
	pacman(params?: IPacmanInstallParams): IToolConfigBuilder;
	dnf(params?: IDnfInstallParams): IToolConfigBuilder;
	pkg(params?: IPkgInstallParams): IToolConfigBuilder;
	"github-release"(params?: IGithubReleaseInstallParams): IToolConfigBuilder;
}

export interface IPlatformInstallFunction {
	<M extends InstallMethod>(method: M, params?: IInstallParamsRegistry[M]): IPlatformConfigBuilder;
	(): IPlatformConfigBuilder;
	manual(params?: IManualInstallParams): IPlatformConfigBuilder;
	cargo(params?: ICargoInstallParams): IPlatformConfigBuilder;
	"curl-script"(params?: ICurlScriptInstallParams): IPlatformConfigBuilder;
	brew(params?: IBrewInstallParams): IPlatformConfigBuilder;
	"zsh-plugin"(params?: IZshPluginInstallParams): IPlatformConfigBuilder;
	"gitea-release"(params?: IGiteaReleaseInstallParams): IPlatformConfigBuilder;
	"curl-tar"(params?: ICurlTarInstallParams): IPlatformConfigBuilder;
	"curl-binary"(params?: ICurlBinaryInstallParams): IPlatformConfigBuilder;
	dmg(params?: IDmgInstallParams): IPlatformConfigBuilder;
	npm(params?: INpmInstallParams): IPlatformConfigBuilder;
	apt(params?: IAptInstallParams): IPlatformConfigBuilder;
	pacman(params?: IPacmanInstallParams): IPlatformConfigBuilder;
	dnf(params?: IDnfInstallParams): IPlatformConfigBuilder;
	pkg(params?: IPkgInstallParams): IPlatformConfigBuilder;
	"github-release"(params?: IGithubReleaseInstallParams): IPlatformConfigBuilder;
}

export type ConfigFactory = (ctx: IConfigContext) => any;
export type AsyncConfigureTool = (install: IInstallFunction, ctx: IToolConfigContext) => any;

export interface IConfigContext {
	configFileDir: string;
	systemInfo: z_internal_ISystemInfo;
}

export interface IToolConfigContext {
	toolName: string;
	configFileDir: string;
	systemInfo: z_internal_ISystemInfo;
	currentDir: string;
	stagingDir: string;
	log: {
		trace: (msg: string) => void;
		debug: (msg: string) => void;
		info: (msg: string) => void;
		warn: (msg: string) => void;
		error: (msg: string) => void;
	};
	fs: IFileSystem;
	$: (strings: TemplateStringsArray | string[], ...values: any[]) => Promise<string>;
}

export declare function defineConfig(callback: ConfigFactory): ConfigFactory;
export declare function defineTool(callback: AsyncConfigureTool): AsyncConfigureTool;

export type {
	IManualInstallParams as z_internal_ManualInstallParams,
	ICargoInstallParams as z_internal_CargoInstallParams,
	IBrewInstallParams as z_internal_BrewInstallParams,
	IAptInstallParams as z_internal_AptInstallParams,
	IPacmanInstallParams as z_internal_PacmanInstallParams,
	IDnfInstallParams as z_internal_DnfInstallParams,
	IPkgInstallParams as z_internal_PkgInstallParams,
	IDmgInstallParams as z_internal_DmgInstallParams,
	INpmInstallParams as z_internal_NpmInstallParams,
	IZshPluginInstallParams as z_internal_ZshPluginInstallParams,
	IGiteaReleaseInstallParams as z_internal_GiteaReleaseInstallParams,
	ICurlTarInstallParams as z_internal_CurlTarInstallParams,
	ICurlScriptInstallParams as z_internal_CurlScriptInstallParams,
	ICurlBinaryInstallParams as z_internal_CurlBinaryInstallParams,
	IGithubReleaseInstallParams as z_internal_GithubReleaseInstallParams,
	IInstallParamsRegistry as z_internal_IInstallParamsRegistry,
	InstallMethod as z_internal_InstallMethod,
};
`;

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
