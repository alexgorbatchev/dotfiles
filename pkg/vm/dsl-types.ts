import type {
  CargoConfig,
  CatalogConfig,
  DownloaderConfig,
  FeaturesConfig,
  HostConfig,
  LoggingConfig,
  PathsConfig,
  ProjectConfig,
  ShellInstallConfig,
  SystemConfig,
  UpdatesConfig,
} from "../../packages/dashboard/src/shared/types.gen.ts";

export type Resolvable<TParams, TReturn> =
  | TReturn
  | ((params: TParams) => TReturn)
  | ((params: TParams) => Promise<TReturn>);

/**
 * Recursive partial type making all nested properties of T optional.
 */
export type DeepPartial<T> = T extends Function
  ? T
  : T extends Array<infer U>
    ? DeepPartial<U>[]
    : T extends object
      ? { [P in keyof T]?: DeepPartial<T[P]> }
      : T;

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
  Linux = 1,
  MacOS = 2,
  Windows = 4,
  All = 7,
}

/**
 * CPU architecture bitmask flags.
 */
export enum Architecture {
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
 * Directory paths configuration for dotfiles projects.
 */
export interface IPathsConfig extends DeepPartial<PathsConfig> {}

/**
 * Features configuration for dotfiles projects.
 */
export interface IFeaturesConfig extends DeepPartial<FeaturesConfig> {}

/**
 * Documentation catalog generator configuration.
 */
export interface ICatalogConfig extends DeepPartial<CatalogConfig> {}

/**
 * Shell profile injection configuration.
 */
export interface IShellInstallConfig extends DeepPartial<ShellInstallConfig> {}

/**
 * Remote host repository and token configuration.
 */
export interface IHostConfig extends DeepPartial<HostConfig> {}

/**
 * Cargo package manager host and user-agent configuration.
 */
export interface ICargoConfig extends DeepPartial<CargoConfig> {}

/**
 * Downloader timeout, retry, and caching configuration.
 */
export interface IDownloaderConfig extends DeepPartial<DownloaderConfig> {}

/**
 * System privilege elevation configuration.
 */
export interface ISystemConfig extends DeepPartial<SystemConfig> {}

/**
 * Logging and debug output configuration.
 */
export interface ILoggingConfig extends DeepPartial<LoggingConfig> {}

/**
 * Update check intervals and behaviors configuration.
 */
export interface IUpdatesConfig extends DeepPartial<UpdatesConfig> {}

/**
 * Operating systems a project-level platform override can target.
 */
export type PlatformMatchOS = "macos" | "linux" | "windows";

/**
 * CPU architectures a project-level platform override can target.
 */
export type PlatformMatchArch = "x86_64" | "arm64";

/**
 * Selects the machines a platform override applies to. At least one of os and arch is
 * required; a field left out matches any value.
 */
export type PlatformMatch =
  | { os: PlatformMatchOS; arch?: PlatformMatchArch }
  | { os?: PlatformMatchOS; arch: PlatformMatchArch };

/**
 * A partial project configuration folded into the base configuration when any of its
 * matchers matches the machine the CLI runs on (or the --platform/--arch target).
 * Overrides apply in order, so a later matching entry wins over an earlier one.
 */
export interface IPlatformOverride {
  /**
   * Matchers, any one of which selects this override.
   */
  match: [PlatformMatch, ...PlatformMatch[]];
  /**
   * The configuration sections to override. Objects merge recursively; every other
   * value replaces the base value.
   */
  config: DeepPartial<ProjectConfig>;
}

/**
 * Main project configuration structure returned by defineConfig callbacks.
 */
export interface IProjectConfig extends DeepPartial<ProjectConfig> {
  /**
   * Platform-specific overrides of the configuration sections above.
   */
  platform?: IPlatformOverride[];
}

/**
 * Context object passed to defineConfig callbacks.
 */
export interface IConfigContext {
  configFileDir: string;
  systemInfo: ISystemInfoInternal;
}

/**
 * A single match handed to a replaceInFile callback.
 */
export interface IReplaceInFileMatch {
  /**
   * The text that matched.
   */
  substring: string;
  /**
   * Capture groups, in order. A group that did not participate is undefined.
   */
  captures: (string | undefined)[];
  /**
   * Index in the searched text where the match starts.
   */
  offset: number;
  /**
   * The text the pattern was applied to.
   */
  input: string;
  /**
   * Named capture groups, when the pattern declares any.
   */
  groups: Record<string, string>;
}

/**
 * Options for replaceInFile.
 */
export interface IReplaceInFileOptions {
  /**
   * Apply the pattern to the whole file (the default) or to each line separately.
   * Line mode is what makes ^ and $ mean "line" rather than "file".
   */
  mode?: "file" | "line";
  /**
   * Reported when the pattern matches nothing, explaining what was expected.
   */
  errorMessage?: string;
}

/**
 * Produces the replacement for one match.
 */
export type ReplaceInFileReplacer = (match: IReplaceInFileMatch) => string | Promise<string>;

/**
 * Replaces text in a file, returning whether anything changed.
 *
 * Every match is replaced whether or not the pattern carries the "g" flag. A plain
 * string pattern is matched literally. The file is not rewritten when nothing matched
 * or when the result is identical to what was already there.
 */
export type ReplaceInFileFn = (
  filePath: string,
  from: string | RegExp,
  to: string | ReplaceInFileReplacer,
  options?: IReplaceInFileOptions,
) => Promise<boolean>;

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
   * Directory containing the tool's configuration file (alias for configFileDir).
   */
  toolDir?: string;
  /**
   * Active project configuration.
   */
  projectConfig?: IProjectConfig;
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
   * Replaces text in a file.
   */
  replaceInFile: ReplaceInFileFn;
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
 * Parameters accepted by every installer. These are handled by the orchestrator
 * rather than by an individual installer, so they apply regardless of the
 * installation method chosen.
 */
export interface ICommonInstallParams {
  /**
   * Install this tool automatically during `dotfiles generate`, rather than only
   * when it is installed explicitly. Tools that an auto-installed tool depends on
   * are auto-installed with it.
   */
  auto?: boolean;
}

/**
 * Parameters for manual installation method.
 */
export interface IManualInstallParams extends ICommonInstallParams {
  /**
   * Absolute or relative path to a pre-existing binary executable on disk.
   */
  binaryPath?: string;
  /**
   * If true, creates a symlink to binaryPath instead of copying it.
   */
  symlink?: boolean;
}

/**
 * Parameters for Cargo (Rust) crate installer.
 */
export interface ICargoInstallParams extends ICommonInstallParams {
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
  /**
   * Where the prebuilt binary is fetched from. Defaults to "cargo-quickinstall".
   */
  binarySource?: string;
  /**
   * GitHub repository to fetch a prebuilt release binary from, used when
   * binarySource selects a GitHub release rather than cargo-quickinstall.
   */
  githubRepo?: string;
  /**
   * Glob or regex pattern selecting the release asset. Supports the placeholders
   * {crateName}, {version}, {platform} and {arch}.
   */
  assetPattern?: string;
  /**
   * Expected SHA-256 checksum of the downloaded artifact.
   */
  sha256?: string;
}

/**
 * Parameters for Homebrew package manager installer (macOS & Linux).
 */
export interface IBrewInstallParams extends ICommonInstallParams {
  /**
   * Homebrew formula name (e.g. "ripgrep" or "node").
   */
  formula?: string;
  /**
   * Homebrew Cask name for macOS GUI/binary packages (e.g. "iterm2"), or `true` if formula is a cask.
   */
  cask?: boolean | string;
  /**
   * Optional custom Homebrew tap repository or repositories (e.g. "user/repo" or ["user/repo1", "user/repo2"]).
   */
  tap?: string | string[];
  /**
   * Explicitly trust Homebrew tap(s) or formula(s) before tapping/installing (`brew trust <target>`).
   * When set to `true`, automatically trusts all configured `tap` repositories. Defaults to `false`.
   */
  trust?: boolean | string | string[];
  /**
   * Additional CLI flags passed directly to `brew install` (e.g. `['--HEAD']`, `['--build-from-source']`).
   */
  args?: string[];
  /**
   * Force overwrite existing installations (`--force`).
   */
  force?: boolean;
  /**
   * Link formula into Homebrew prefix (`--force` or `--overwrite`).
   */
  link?: boolean | { overwrite?: boolean; force?: boolean };
  /**
   * Background service management action (`true`, `'start'`, `'stop'`, `'restart'`, etc.).
   */
  service?: boolean | string;
  /**
   * Arguments passed to the binary to detect its version (e.g. `['--version']`).
   */
  versionArgs?: string[];
  /**
   * Regular expression pattern used to extract the version from command output.
   */
  versionRegex?: string | RegExp;
}

/**
 * Parameters for APT package manager installer (Debian / Ubuntu).
 */
export interface IAptInstallParams extends ICommonInstallParams {
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
export interface IPacmanInstallParams extends ICommonInstallParams {
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
export interface IDnfInstallParams extends ICommonInstallParams {
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
 * Where the macOS `.dmg` / `.pkg` installers obtain their artifact. A "url" source
 * downloads a fixed address; a "github-release" source resolves an asset from a
 * repository release.
 */
export interface IMacInstallSource {
  /**
   * Selects how the artifact is located. Anything other than "github-release" is
   * treated as a direct URL.
   */
  type?: "url" | "github-release";
  /**
   * Direct HTTP/HTTPS URL, for the "url" source type.
   */
  url?: string;
  /**
   * GitHub repository in "owner/repo" format, for the "github-release" source type.
   */
  repo?: string;
  /**
   * Release tag to install. Defaults to the latest release.
   */
  version?: string;
  /**
   * Glob or regex pattern selecting the release asset.
   */
  assetPattern?: string;
  /**
   * Pattern used to choose between assets when assetPattern matches several.
   */
  assetSelector?: string;
}

/**
 * Parameters for macOS PKG package installer.
 */
export interface IPkgInstallParams extends ICommonInstallParams {
  /**
   * Direct HTTP/HTTPS URL to the macOS `.pkg` package file. Provide this or
   * `source`.
   */
  url?: string;
  /**
   * Where to obtain the package, when it is not a fixed URL.
   */
  source?: IMacInstallSource;
}

/**
 * Parameters for macOS DMG disk image installer.
 */
export interface IDmgInstallParams extends ICommonInstallParams {
  /**
   * Direct HTTP/HTTPS URL to the macOS `.dmg` disk image. Provide this or
   * `source`.
   */
  url?: string;
  /**
   * Where to obtain the disk image, when it is not a fixed URL.
   */
  source?: IMacInstallSource;
  /**
   * Name of the `.app` bundle or binary inside the disk image to copy.
   */
  appName: string;
}

/**
 * Parameters for NPM global package installer.
 */
export interface INpmInstallParams extends ICommonInstallParams {
  /**
   * NPM package name. Defaults to the tool name.
   */
  package?: string;
  /**
   * Package manager used to perform the install (e.g. "npm", "bun", "pnpm").
   * Defaults to "npm".
   */
  packageManager?: string;
  /**
   * Target package version. Defaults to the latest published version.
   */
  version?: string;
  /**
   * Reinstall even when the package is already present.
   */
  force?: boolean;
}

/**
 * Parameters for Zsh plugin installer.
 */
export interface IZshPluginInstallParams extends ICommonInstallParams {
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
export interface IGiteaReleaseInstallParams extends ICommonInstallParams {
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
  assetPattern?: string | RegExp;
  /**
   * Gitea instance base URL.
   */
  instanceUrl: string;
}

/**
 * Parameters for cURL tarball archive installer (.tar.gz, .tar.xz, .zip).
 */
export interface ICurlTarInstallParams extends ICommonInstallParams {
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
export interface ICurlScriptInstallParams extends ICommonInstallParams {
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
  /**
   * Environment variables passed to the installer script execution.
   */
  env?: Record<string, string>;
}

/**
 * Parameters for cURL binary file installer.
 */
export interface ICurlBinaryInstallParams extends ICommonInstallParams {
  /**
   * Direct HTTP/HTTPS URL to the executable binary.
   */
  url: string;
}

/**
 * Parameters for GitHub release asset installer.
 */
export interface IGithubReleaseInstallParams extends ICommonInstallParams {
  /**
   * GitHub repository path in "owner/repo" format (e.g. "BurntSushi/ripgrep").
   */
  repo: string;
  /**
   * Release tag to install. Defaults to the latest release.
   */
  version?: string;
  /**
   * Glob or regex pattern to select the asset archive/binary.
   */
  assetPattern?: string | RegExp;
  /**
   * Enable `gh` CLI fallback on GitHub API rate limits.
   */
  ghCli?: boolean;
  /**
   * GitHub API token used to authenticate release and asset requests.
   */
  token?: string;
  /**
   * Include prerelease versions when resolving the latest release.
   *
   * NOTE: not yet honoured by the installer, which resolves "latest" through the
   * GitHub `releases/latest` endpoint. That endpoint excludes prereleases, so a
   * repository publishing only prereleases currently cannot be resolved.
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
 * Context provided to lifecycle hook handlers.
 */
export interface IHookContext extends IToolConfigContext {
  /**
   * Temporary installation directory the installer stages into.
   */
  stagingDir: string;
  /**
   * Stable directory the installed tool now occupies. Only `after-install` provides
   * it; before the install completes there is nothing installed to point at.
   */
  installedDir?: string;
  /**
   * Paths of the binaries the installer produced. Only `after-install` provides them.
   */
  binaryPaths?: string[];
  /**
   * Version that was installed. Only `after-install` provides it, and only when the
   * installer resolved one.
   */
  version?: string;
  /**
   * File operations. The same bindings as `fs` on the tool context, under the name
   * hooks use.
   */
  fileSystem: IFileSystem;
  /**
   * Runs a shell command. Available only to hooks: configuration is evaluated on every
   * CLI invocation, so a tool factory must not be able to execute anything.
   */
  $: (strings: TemplateStringsArray | string[], ...values: unknown[]) => IShellPromise;
}

/**
 * Result of a command run from a hook. Awaiting it runs the command; the modifiers
 * apply beforehand, so `await $`cmd`.quiet()` stays silent.
 */
export interface IShellPromise extends PromiseLike<IShellOutput> {
  /**
   * Suppresses echoing the command before it runs.
   */
  quiet(): IShellPromise;
  /**
   * Returns the outcome instead of throwing when the command exits non-zero.
   */
  noThrow(): IShellPromise;
  /**
   * Runs the command and resolves with its standard output.
   */
  text(): Promise<string>;
  /**
   * Runs the command and parses its standard output as JSON.
   */
  json(): Promise<unknown>;
}

/**
 * What a command reports once it has run.
 */
export interface IShellOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Handler function for lifecycle hooks.
 */
export type HookHandler = (context: IHookContext) => Promise<unknown> | unknown;

/**
 * Fluent builder interface for configuring a tool installation and environment.
 */
export interface IToolConfigBuilder {
  /**
   * Defines a binary that this tool provides.
   */
  bin(name: string, pattern?: string | RegExp): this;
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
  hostname(pattern: string | RegExp): this;
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
  platform(plat: Platform, arc: Architecture, cb: PlatformCallback): this;
  /**
   * Configures architecture specific installer methods.
   */
  arch(arc: Architecture, cb: ArchCallback): this;
  /**
   * Registers custom lifecycle hooks.
   */
  hook(event: string, handler: HookHandler): this;
}

/**
 * Fluent builder interface for platform-specific configurations.
 */
export interface IPlatformConfigBuilder {
  /**
   * Defines a binary that this tool provides on this platform.
   */
  bin(name: string, pattern?: string | RegExp): this;
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
  hostname(pattern: string | RegExp): this;
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
  hook(event: string, handler: HookHandler): this;
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

export type ConfigFactory = (ctx: IConfigContext) => IProjectConfig | Promise<IProjectConfig>;
export type AsyncConfigureTool = (install: IInstallFunction, ctx: IToolConfigContext) => unknown;
