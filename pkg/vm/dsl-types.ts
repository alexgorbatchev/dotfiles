export type Resolvable<TParams, TReturn> =
  | TReturn
  | ((params: TParams) => TReturn)
  | ((params: TParams) => Promise<TReturn>);

/**
 * Interface for sandboxed file system operations.
 */
export interface IFileSystem {
  /**
   * Reads the entire contents of a file.
   */
  readFile(path: string, encoding?: string): Promise<string>;
  /**
   * Writes data to a file, replacing the file if it already exists.
   */
  writeFile(path: string, content: string, encoding?: string): Promise<void>;
  /**
   * Checks if a path exists on disk.
   */
  exists(path: string): Promise<boolean>;
  /**
   * Creates a directory and all nested parent directories if needed.
   */
  mkdir(path: string): Promise<void>;
  /**
   * Reads the contents of a directory.
   */
  readdir(path: string): Promise<string[]>;
  /**
   * Removes a file or directory.
   */
  rm(path: string): Promise<void>;
}

/**
 * Operating system bitmask flags.
 */
export enum Platform {
  None = 0,
  Linux = 1,
  MacOS = 2,
  Windows = 4,
  Unix = 3,
  All = 7,
}

/**
 * CPU architecture bitmask flags.
 */
export enum Architecture {
  None = 0,
  X86_64 = 1,
  Arm64 = 2,
  All = 3,
}

/**
 * Standard C library implementations.
 */
export enum Libc {
  Unknown = "unknown",
  Gnu = "gnu",
  Musl = "musl",
}

/**
 * Context object passed to defineConfig callbacks.
 */
export interface IConfigContext {
  configFileDir: string;
  systemInfo: ISystemInfoInternal;
}

/**
 * Context object for tool configuration.
 */
export interface IToolConfigContext {
  /**
   * Name of the tool being configured.
   */
  toolName: string;
  /**
   * Path to the directory containing the configuration file.
   */
  configFileDir: string;
  /**
   * System environment information.
   */
  systemInfo: ISystemInfoInternal;
  /**
   * Absolute path to the active version directory of the tool.
   */
  currentDir: string;
  /**
   * Absolute path to the temporary staging directory during installation.
   */
  stagingDir: string;
  /**
   * Logger utility for printing structured messages.
   */
  log: {
    trace: (msg: string) => void;
    debug: (msg: string) => void;
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
  /**
   * Virtual sandboxed file system.
   */
  fs: IFileSystem;
  /**
   * Execute shell commands securely and capture stdout.
   */
  $: (strings: TemplateStringsArray | string[], ...values: unknown[]) => Promise<string>;
}

/**
 * System hardware and platform metrics.
 */
export interface ISystemInfoInternal {
  platform: Platform;
  arch: Architecture;
  homeDir: string;
  hostname: string;
}

export interface IManualInstallParams {
  binaryPath?: string;
}
export interface ICargoInstallParams {
  crate?: string;
  crateName?: string;
  version?: string;
}
export interface IBrewInstallParams {
  formula?: string;
  cask?: string;
  tap?: string;
}
export interface IAptInstallParams {
  packageName?: string;
  package?: string;
  version?: string;
  update?: boolean;
}
export interface IPacmanInstallParams {
  packageName?: string;
  package?: string;
  version?: string;
  sysupgrade?: boolean;
}
export interface IDnfInstallParams {
  packageName?: string;
  package?: string;
  version?: string;
  refresh?: boolean;
}
export interface IPkgInstallParams {
  url: string;
}
export interface IDmgInstallParams {
  url: string;
  appName: string;
}
export interface INpmInstallParams {
  packageName?: string;
  package?: string;
  global?: boolean;
}
export interface IZshPluginInstallParams {
  repo?: string;
  url?: string;
  pluginName?: string;
  auto?: boolean;
}
export interface IGiteaReleaseInstallParams {
  host?: string;
  repo: string;
  assetPattern?: string;
  instanceUrl: string;
}
export interface ICurlTarInstallParams {
  url: string;
  binDir?: string;
  versionArgs?: string | string[];
  versionRegex?: string | RegExp;
}
export interface ICurlScriptInstallParams {
  url: string;
  shell?: string;
  args?: string[] | Resolvable<IToolConfigContext, string[]>;
}
export interface ICurlBinaryInstallParams {
  url: string;
}
export interface IGithubReleaseInstallParams {
  repo: string;
  assetPattern?: string;
  ghCli?: boolean;
  prerelease?: boolean;
}

/**
 * Set of supported installation helper methods.
 */
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

export interface IKnownBinNameRegistry {
  __placeholder__?: never;
}

export type KnownBinNameKeys = Exclude<keyof IKnownBinNameRegistry, "__placeholder__">;
export type KnownBinName = [KnownBinNameKeys] extends [never] ? string : KnownBinNameKeys;

export type ShellPathGuard<T> = "PATH" extends keyof T ? never : T;

/**
 * Fluent configurator used inside shell callbacks (zsh, bash, powershell) to specify environment scripts.
 */
export interface IShellConfigurator<KnownFunctions extends string = never> {
  /**
   * Sets environment variables for the shell.
   *
   * **Note**: To modify PATH, use `shell.path()` instead. Setting PATH via
   * env() is prohibited to ensure proper deduplication.
   */
  env<T extends Record<string, string>>(values: ShellPathGuard<T>): this;
  /**
   * Sets shell aliases.
   */
  alias(values: Record<string, string>): this;
  /**
   * Sets shell aliases (equivalent to alias()).
   */
  aliases(values: Record<string, string>): this;
  /**
   * Appends a script to be executed during shell initialization.
   */
  script(content: string): this;
  /**
   * Appends a script with a specific execution trigger (once vs always).
   */
  script(kind: "once" | "always", content: string): this;
  /**
   * Appends a script to be executed once during shell initialization.
   */
  once(script: string): this;
  /**
   * Appends a script to be executed always during shell initialization.
   */
  always(script: string): this;
  /**
   * Declares native shell functions.
   */
  functions<K extends string>(values: Record<K, string>): IShellConfigurator<KnownFunctions | K>;
  /**
   * Appends a path value to the PATH environment variable.
   */
  path(pathValue: Resolvable<void, string>): this;
  /**
   * Configures shell completions from static files, URL downloads, or generated dynamically.
   */
  completions(
    completions:
      | string
      | Resolvable<void, unknown>
      | { bin?: string; value?: string; cmd?: string; source?: string; url?: string },
  ): this;
  /**
   * Sources a script file during shell initialization.
   */
  sourceFile(relativePath: string): this;
  /**
   * Sources the output of a defined shell function.
   */
  sourceFunction(functionName: string): this;
  /**
   * Sources the output of inline shell code wrapped in a temporary function.
   */
  source(content: string): this;
}

/**
 * Fluent builder interface for configuring a tool installation and environment.
 */
export interface IToolConfigBuilder {
  /**
   * Defines a binary that this tool provides.
   */
  bin(name: string, pattern?: string): this;
  /**
   * Sets the target binaries of the tool config.
   */
  binaries(binaries: string[]): this;
  /**
   * Sets the version constraint of the tool (defaults to 'latest').
   */
  version(v: string): this;
  /**
   * Requires elevated privileges (sudo) to execute installations.
   */
  sudo(): this;
  /**
   * Marks this tool as disabled.
   */
  disable(): this;
  /**
   * Limits this tool execution to specific hostnames.
   */
  hostname(pattern: string): this;
  /**
   * Configures automatic update verification parameters.
   */
  updateCheck(config: { enabled?: boolean; constraint?: string }): this;
  /**
   * Copies a file or directory from source to target.
   */
  copy(src: string, dst: string): this;
  /**
   * Declares package dependencies.
   */
  dependsOn(...binaryNames: KnownBinName[]): this;
  /**
   * Declares package dependencies.
   */
  depends(...binaryNames: KnownBinName[]): this;
  /**
   * Creates a symbolic link.
   */
  symlink(src: string, dst: string): this;
  /**
   * Configures zsh specific settings.
   */
  zsh(cb: (shell: IShellConfigurator) => void): this;
  /**
   * Configures bash specific settings.
   */
  bash(cb: (shell: IShellConfigurator) => void): this;
  /**
   * Configures powershell specific settings.
   */
  powershell(cb: (shell: IShellConfigurator) => void): this;
  /**
   * Configures platform specific installer methods.
   */
  platform(plat: Platform, cb: (install: IPlatformInstallFunction) => void): this;
  /**
   * Configures architecture specific installer methods.
   */
  arch(arc: Architecture, cb: (install: IPlatformInstallFunction) => void): this;
  /**
   * Registers custom lifecycle hooks.
   */
  hook(event: string, handler: unknown): this;
}

/**
 * Fluent builder interface for platform-specific configurations.
 */
export interface IPlatformConfigBuilder {
  /**
   * Defines a binary that this tool provides on this platform.
   */
  bin(name: string, pattern?: string): this;
  /**
   * Sets target binaries on this platform.
   */
  binaries(binaries: string[]): this;
  /**
   * Overrides the tool version constraint on this platform.
   */
  version(v: string): this;
  /**
   * Requires elevated privileges (sudo) on this platform.
   */
  sudo(): this;
  /**
   * Disables this tool on this platform.
   */
  disable(): this;
  /**
   * Limits this tool execution to specific hostnames on this platform.
   */
  hostname(pattern: string): this;
  /**
   * Configures automatic update parameters on this platform.
   */
  updateCheck(config: { enabled?: boolean; constraint?: string }): this;
  /**
   * Copies a file or directory from source to target on this platform.
   */
  copy(src: string, dst: string): this;
  /**
   * Declares binary dependencies on this platform.
   */
  dependsOn(...binaryNames: KnownBinName[]): this;
  /**
   * Declares binary dependencies on this platform (alias of dependsOn()).
   */
  depends(...binaryNames: KnownBinName[]): this;
  /**
   * Creates a symbolic link on this platform.
   */
  symlink(src: string, dst: string): this;
  /**
   * Configures Zsh shell initialization on this platform.
   */
  zsh(cb: (shell: IShellConfigurator) => void): this;
  /**
   * Configures Bash shell initialization on this platform.
   */
  bash(cb: (shell: IShellConfigurator) => void): this;
  /**
   * Configures PowerShell initialization on this platform.
   */
  powershell(cb: (shell: IShellConfigurator) => void): this;
  /**
   * Registers an async hook handler on this platform.
   */
  hook(event: string, handler: unknown): this;
}

/**
 * Crystal-clear installer method loader with generic type-safety.
 */
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

/**
 * Platform-specific installer method loader.
 */
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

export type ConfigFactory = (ctx: IConfigContext) => unknown;
export type AsyncConfigureTool = (install: IInstallFunction, ctx: IToolConfigContext) => unknown;
