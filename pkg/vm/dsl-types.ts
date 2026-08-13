export type Resolvable<TParams, TReturn> =
  | TReturn
  | ((params: TParams) => TReturn)
  | ((params: TParams) => Promise<TReturn>);

/**
 * Interface for sandboxed file system operations.
 *
 * All methods execute synchronously within the Goja VM runtime, but return
 * Promises to preserve standard async/await compatibility in TypeScript.
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

/**
 * Parameters for manual installation method.
 */
export interface IManualInstallParams {
  /**
   * Absolute or relative path to a pre-existing binary executable on disk.
   */
  binaryPath?: string;
}

/**
 * Parameters for Cargo (Rust) crate installer.
 */
export interface ICargoInstallParams {
  /**
   * Name of the Cargo crate to install.
   */
  crate?: string;
  /**
   * Alias for crate name.
   */
  crateName?: string;
  /**
   * Specific crate version constraint to install.
   */
  version?: string;
}

/**
 * Parameters for Homebrew package manager installer (macOS & Linux).
 */
export interface IBrewInstallParams {
  /**
   * Homebrew formula name (e.g. "ripgrep" or "node").
   */
  formula?: string;
  /**
   * Homebrew Cask name for macOS GUI/binary packages (e.g. "iterm2").
   */
  cask?: string;
  /**
   * Optional custom Homebrew tap repository (e.g. "user/repo").
   */
  tap?: string;
}

/**
 * Parameters for APT package manager installer (Debian / Ubuntu).
 */
export interface IAptInstallParams {
  /**
   * APT package name.
   */
  packageName?: string;
  /**
   * Alias for packageName.
   */
  package?: string;
  /**
   * Target package version constraint.
   */
  version?: string;
  /**
   * Whether to run `apt-get update` before installation.
   */
  update?: boolean;
}

/**
 * Parameters for Pacman package manager installer (Arch Linux).
 */
export interface IPacmanInstallParams {
  /**
   * Pacman package name (repository prefix like "extra/ripgrep" is automatically stripped).
   */
  packageName?: string;
  /**
   * Alias for packageName.
   */
  package?: string;
  /**
   * Target package version constraint.
   */
  version?: string;
  /**
   * Whether to run `pacman -Syu` system upgrade before installation.
   */
  sysupgrade?: boolean;
}

/**
 * Parameters for DNF package manager installer (Fedora / RHEL / CentOS).
 */
export interface IDnfInstallParams {
  /**
   * DNF package name.
   */
  packageName?: string;
  /**
   * Alias for packageName.
   */
  package?: string;
  /**
   * Target package version constraint.
   */
  version?: string;
  /**
   * Whether to run `dnf check-update` before installation.
   */
  refresh?: boolean;
}

/**
 * Parameters for macOS PKG package installer.
 */
export interface IPkgInstallParams {
  /**
   * Direct HTTP/HTTPS URL to the macOS `.pkg` package file.
   */
  url: string;
}

/**
 * Parameters for macOS DMG disk image installer.
 */
export interface IDmgInstallParams {
  /**
   * Direct HTTP/HTTPS URL to the macOS `.dmg` disk image.
   */
  url: string;
  /**
   * Name of the `.app` bundle or binary inside the disk image to copy.
   */
  appName: string;
}

/**
 * Parameters for NPM global package installer.
 */
export interface INpmInstallParams {
  /**
   * NPM package name.
   */
  packageName?: string;
  /**
   * Alias for packageName.
   */
  package?: string;
  /**
   * Install package globally (`npm install -g`). Defaults to true.
   */
  global?: boolean;
}

/**
 * Parameters for Zsh plugin installer.
 */
export interface IZshPluginInstallParams {
  /**
   * GitHub or Gitea repository path (e.g. "zsh-users/zsh-autosuggestions").
   */
  repo?: string;
  /**
   * Direct git repository URL.
   */
  url?: string;
  /**
   * Name of the plugin directory/file.
   */
  pluginName?: string;
  /**
   * Automatically clone and activate plugin during generation.
   */
  auto?: boolean;
}

/**
 * Parameters for Gitea release asset installer.
 */
export interface IGiteaReleaseInstallParams {
  /**
   * Gitea host or instance URL.
   */
  host?: string;
  /**
   * Repository path (owner/repo).
   */
  repo: string;
  /**
   * Glob or regex pattern to select release asset filename.
   */
  assetPattern?: string;
  /**
   * Gitea instance base URL.
   */
  instanceUrl: string;
}

/**
 * Parameters for cURL tarball archive installer (.tar.gz, .tar.xz, .zip).
 */
export interface ICurlTarInstallParams {
  /**
   * Direct HTTP/HTTPS URL to the archive.
   */
  url: string;
  /**
   * Subdirectory path inside the archive containing binaries.
   */
  binDir?: string;
  /**
   * CLI flags passed to detect binary version (e.g. "--version").
   */
  versionArgs?: string | string[];
  /**
   * Regular expression pattern to extract version from output.
   */
  versionRegex?: string | RegExp;
}

/**
 * Parameters for cURL shell script installer.
 */
export interface ICurlScriptInstallParams {
  /**
   * HTTP/HTTPS URL to the installation script.
   */
  url: string;
  /**
   * Interpreter command to execute the script (e.g. "bash", "sh", "zsh").
   */
  shell?: string;
  /**
   * Arguments passed to the installer script.
   */
  args?: string[] | Resolvable<IToolConfigContext, string[]>;
}

/**
 * Parameters for cURL binary file installer.
 */
export interface ICurlBinaryInstallParams {
  /**
   * Direct HTTP/HTTPS URL to the executable binary.
   */
  url: string;
}

/**
 * Parameters for GitHub release asset installer.
 */
export interface IGithubReleaseInstallParams {
  /**
   * GitHub repository path in "owner/repo" format (e.g. "BurntSushi/ripgrep").
   */
  repo: string;
  /**
   * Glob or regex pattern to select the asset archive/binary.
   */
  assetPattern?: string;
  /**
   * Enable `gh` CLI fallback on GitHub API rate limits.
   */
  ghCli?: boolean;
  /**
   * Include prerelease versions when resolving latest release.
   */
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

export type ShellStrings = TemplateStringsArray | string;

export interface IPathModule {
  isAbsolute(p: string): boolean;
  join(...args: string[]): string;
  dirname(p: string): string;
  basename(p: string): string;
}

export interface ISystemInfo {
  os: string;
  arch: string;
  libc: string;
}

export type ShellCallback = (shell: IShellConfigurator) => void;
export type PlatformCallback = (install: IPlatformInstallFunction) => void;
export type ArchCallback = (install: IPlatformInstallFunction) => void;

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
   *
   * Supported installer methods: `manual`, `apt`, `dnf`, `pacman`, `pkg`.
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
  zsh(cb: ShellCallback): this;
  /**
   * Configures bash specific settings.
   */
  bash(cb: ShellCallback): this;
  /**
   * Configures powershell specific settings.
   */
  powershell(cb: ShellCallback): this;
  /**
   * Configures platform specific installer methods.
   */
  platform(plat: Platform, cb: PlatformCallback): this;
  /**
   * Configures architecture specific installer methods.
   */
  arch(arc: Architecture, cb: ArchCallback): this;
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
   *
   * Supported installer methods: `manual`, `apt`, `dnf`, `pacman`, `pkg`.
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
  zsh(cb: ShellCallback): this;
  /**
   * Configures Bash shell initialization on this platform.
   */
  bash(cb: ShellCallback): this;
  /**
   * Configures PowerShell initialization on this platform.
   */
  powershell(cb: ShellCallback): this;
  /**
   * Registers an async hook handler on this platform.
   */
  hook(event: string, handler: unknown): this;
}

/**
 * Crystal-clear installer method loader with generic type-safety.
 */
export interface IInstallFunction {
  /**
   * Dynamically loads an installer method by name.
   */
  <M extends InstallMethod>(method: M, params?: IInstallParamsRegistry[M]): IToolConfigBuilder;
  /**
   * Configures a tool without a specific installer plugin.
   */
  (): IToolConfigBuilder;
  /**
   * Manual binary installer for local system executables. Supported for sudo.
   */
  manual(params?: IManualInstallParams): IToolConfigBuilder;
  /**
   * Cargo (Rust) crate installer.
   */
  cargo(params?: ICargoInstallParams): IToolConfigBuilder;
  /**
   * cURL script installer executing remote shell setup scripts.
   */
  "curl-script"(params?: ICurlScriptInstallParams): IToolConfigBuilder;
  /**
   * Homebrew package manager installer (macOS & Linux).
   */
  brew(params?: IBrewInstallParams): IToolConfigBuilder;
  /**
   * Zsh plugin git repository installer.
   */
  "zsh-plugin"(params?: IZshPluginInstallParams): IToolConfigBuilder;
  /**
   * Gitea release asset downloader.
   */
  "gitea-release"(params?: IGiteaReleaseInstallParams): IToolConfigBuilder;
  /**
   * cURL tarball archive extractor (.tar.gz, .tar.xz, .zip).
   */
  "curl-tar"(params?: ICurlTarInstallParams): IToolConfigBuilder;
  /**
   * cURL direct standalone binary downloader.
   */
  "curl-binary"(params?: ICurlBinaryInstallParams): IToolConfigBuilder;
  /**
   * macOS DMG disk image installer.
   */
  dmg(params?: IDmgInstallParams): IToolConfigBuilder;
  /**
   * NPM global package installer.
   */
  npm(params?: INpmInstallParams): IToolConfigBuilder;
  /**
   * APT package manager installer (Debian / Ubuntu). Supported for sudo.
   */
  apt(params?: IAptInstallParams): IToolConfigBuilder;
  /**
   * Pacman package manager installer (Arch Linux). Supported for sudo.
   */
  pacman(params?: IPacmanInstallParams): IToolConfigBuilder;
  /**
   * DNF package manager installer (Fedora / RHEL / CentOS). Supported for sudo.
   */
  dnf(params?: IDnfInstallParams): IToolConfigBuilder;
  /**
   * macOS PKG package installer. Supported for sudo.
   */
  pkg(params?: IPkgInstallParams): IToolConfigBuilder;
  /**
   * GitHub release asset downloader with automatic architecture/platform matching.
   */
  "github-release"(params?: IGithubReleaseInstallParams): IToolConfigBuilder;
}

/**
 * Platform-specific installer method loader.
 */
export interface IPlatformInstallFunction {
  /**
   * Dynamically loads a platform installer method by name.
   */
  <M extends InstallMethod>(method: M, params?: IInstallParamsRegistry[M]): IPlatformConfigBuilder;
  /**
   * Configures a tool on this platform without a specific installer plugin.
   */
  (): IPlatformConfigBuilder;
  /**
   * Manual binary installer on this platform. Supported for sudo.
   */
  manual(params?: IManualInstallParams): IPlatformConfigBuilder;
  /**
   * Cargo (Rust) crate installer on this platform.
   */
  cargo(params?: ICargoInstallParams): IPlatformConfigBuilder;
  /**
   * cURL script installer on this platform.
   */
  "curl-script"(params?: ICurlScriptInstallParams): IPlatformConfigBuilder;
  /**
   * Homebrew package manager installer on this platform.
   */
  brew(params?: IBrewInstallParams): IPlatformConfigBuilder;
  /**
   * Zsh plugin git repository installer on this platform.
   */
  "zsh-plugin"(params?: IZshPluginInstallParams): IPlatformConfigBuilder;
  /**
   * Gitea release asset downloader on this platform.
   */
  "gitea-release"(params?: IGiteaReleaseInstallParams): IPlatformConfigBuilder;
  /**
   * cURL tarball archive extractor on this platform.
   */
  "curl-tar"(params?: ICurlTarInstallParams): IPlatformConfigBuilder;
  /**
   * cURL direct standalone binary downloader on this platform.
   */
  "curl-binary"(params?: ICurlBinaryInstallParams): IPlatformConfigBuilder;
  /**
   * macOS DMG disk image installer on this platform.
   */
  dmg(params?: IDmgInstallParams): IPlatformConfigBuilder;
  /**
   * NPM global package installer on this platform.
   */
  npm(params?: INpmInstallParams): IPlatformConfigBuilder;
  /**
   * APT package manager installer on this platform. Supported for sudo.
   */
  apt(params?: IAptInstallParams): IPlatformConfigBuilder;
  /**
   * Pacman package manager installer on this platform. Supported for sudo.
   */
  pacman(params?: IPacmanInstallParams): IPlatformConfigBuilder;
  /**
   * DNF package manager installer on this platform. Supported for sudo.
   */
  dnf(params?: IDnfInstallParams): IPlatformConfigBuilder;
  /**
   * macOS PKG package installer on this platform. Supported for sudo.
   */
  pkg(params?: IPkgInstallParams): IPlatformConfigBuilder;
  /**
   * GitHub release asset downloader on this platform.
   */
  "github-release"(params?: IGithubReleaseInstallParams): IPlatformConfigBuilder;
}

export type ConfigFactory = (ctx: IConfigContext) => unknown;
export type AsyncConfigureTool = (install: IInstallFunction, ctx: IToolConfigContext) => unknown;
