import type {
  CargoConfig,
  CatalogConfig,
  DownloaderConfig,
  FeaturesConfig,
  HostConfig,
  PathsConfig,
  ProjectConfig,
  ShellInstallConfig,
  SystemConfig,
  ToolConfig,
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
 * What `stat` and `lstat` report about a path.
 */
export interface IFileStats {
  /**
   * True for a regular file.
   */
  isFile: boolean;
  /**
   * True for a directory.
   */
  isDirectory: boolean;
  /**
   * True for a symbolic link. Only `lstat` ever reports it: `stat` describes what the
   * link points at.
   */
  isSymbolicLink: boolean;
  /**
   * Permission bits alone, in the form `chmod` takes (`0o755`). The kind of the path
   * is reported by the three flags above rather than folded into this number.
   */
  mode: number;
  /**
   * Size in bytes.
   */
  size: number;
}

/**
 * File operations available to a tool factory as `ctx.fs` and to lifecycle hooks as
 * `fileSystem`. Every call is carried out by the Go runtime synchronously; the Promise
 * return types keep `await` valid at the call site. Files are read and written as UTF-8.
 * A call that cannot be carried out rejects, so `await` throws rather than continuing
 * against a file that is not there. `exists` is the exception: an absent path is its
 * answer, not a failure.
 */
export interface IFileSystem {
  /**
   * Reads the entire contents of a file. Rejects when the file is not there, rather
   * than resolving to an empty string.
   */
  readFile(path: string): Promise<string>;
  /**
   * Writes data to a file, replacing the file if it already exists.
   */
  writeFile(path: string, content: string): Promise<void>;
  /**
   * Checks if a path exists on disk. Resolves to `false` for an absent path, and
   * rejects only when the lookup itself cannot be made.
   */
  exists(path: string): Promise<boolean>;
  /**
   * Creates a directory together with any missing parent directories. Succeeds when
   * the directory already exists.
   */
  mkdir(path: string): Promise<void>;
  /**
   * Alias of `mkdir`.
   */
  ensureDir(path: string): Promise<void>;
  /**
   * Reads the entry names of a directory. Rejects when the directory is not there,
   * rather than resolving to an empty list.
   */
  readdir(path: string): Promise<string[]>;
  /**
   * Removes a file, or a directory together with everything under it.
   */
  rm(path: string): Promise<void>;
  /**
   * Moves a file or directory.
   */
  rename(from: string, to: string): Promise<void>;
  /**
   * Creates a symbolic link at `linkPath` pointing at `target`.
   */
  symlink(target: string, linkPath: string): Promise<void>;
  /**
   * Removes an empty directory, and refuses a path that is not a directory. Use `rm`
   * to remove a directory together with what is inside it.
   */
  rmdir(path: string): Promise<void>;
  /**
   * Changes the permission bits of a path, e.g. `0o755` to make a file executable.
   */
  chmod(path: string, mode: number): Promise<void>;
  /**
   * Copies a file, replacing the destination if it already exists.
   */
  copyFile(source: string, destination: string): Promise<void>;
  /**
   * Describes a path, following a symbolic link to what it points at.
   */
  stat(path: string): Promise<IFileStats>;
  /**
   * Describes a path without following a symbolic link, so a link is reported as the
   * link itself.
   */
  lstat(path: string): Promise<IFileStats>;
  /**
   * Reads where a symbolic link points.
   */
  readlink(path: string): Promise<string>;
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
 * Standard C library implementations, spelled the way release assets spell them
 * (`x86_64-unknown-linux-gnu`, `x86_64-unknown-linux-musl`). `systemInfo.libc` reports
 * one of these values, so a member compares against it directly.
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
 * What the runtime reports about the machine a configuration is evaluated for. The
 * values follow the `--platform`, `--arch` and `--libc` flags when those are given.
 */
export interface ISystemInfo {
  /**
   * Operating system name: `"darwin"`, `"linux"`, `"windows"`, or `"unknown"`.
   */
  os: string;
  /**
   * CPU architecture name: `"amd64"`, `"arm64"`, or `"unknown"`.
   */
  arch: string;
  /**
   * C library on Linux: `"gnu"`, `"musl"`, or `"unknown"` (compare against `Libc`).
   */
  libc: string;
  /**
   * Home directory paths written with `~` resolve against. It is the project's
   * `paths.homeDir`, which a configuration may deliberately point somewhere other
   * than the invoking user's own home; inside `defineConfig`, where that value is
   * still being defined, it is the invoking user's home directory.
   */
  homeDir: string;
  /**
   * Name of the machine, as `.hostname()` matches against. Empty when the machine
   * cannot report one.
   */
  hostname: string;
}

/**
 * Context object passed to defineConfig callbacks.
 */
export interface IConfigContext {
  configFileDir: string;
  systemInfo: ISystemInfo;
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
 * Structured logger. Messages are prefixed with the tool name.
 */
export interface ILogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
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
   * Directory containing the project configuration file.
   */
  configFileDir: string;
  /**
   * Directory containing this tool's `.tool.ts` file.
   */
  toolDir: string;
  /**
   * Active project configuration.
   */
  projectConfig: ProjectConfig;
  /**
   * Operating system, architecture and libc the configuration is evaluated for.
   */
  systemInfo: ISystemInfo;
  /**
   * Absolute path to the active version directory of the tool.
   */
  currentDir: string;
  /**
   * Temporary directory the installer stages into. While the configuration is merely
   * being read no installation is under way, so the value is the literal placeholder
   * `{stagingDir}`, which the runtime substitutes when the value is used in install
   * parameters. A hook receives the real path.
   */
  stagingDir: string;
  /**
   * Logger utility for printing structured messages.
   */
  log: ILogger;
  /**
   * File operations.
   */
  fs: IFileSystem;
  /**
   * The same bindings as `fs`, under the name hooks use.
   */
  fileSystem: IFileSystem;
  /**
   * Replaces text in a file.
   */
  replaceInFile: ReplaceInFileFn;
  /**
   * Resolves a glob pattern to exactly one path. A relative pattern is resolved
   * against `toolDir`. Throws when the pattern matches nothing or more than one path.
   */
  resolve(pattern: string): string;
}

/**
 * A POSIX permission, written the way it is written everywhere else: `"0600"`,
 * `"600"` and `"0o600"` all mean the same thing. Anything that is not an octal
 * permission between `"0000"` and `"0777"` is rejected when the configuration loads,
 * rather than guessed at.
 */
export type Mode = string;

/**
 * What to do when both the file on disk and the source in the repository have changed
 * since dotfiles last wrote the file.
 *
 * Only that case is decided here. A file only the repository changed is updated, and
 * a file only the user changed is left alone, whatever this says.
 */
export type ConflictPolicy =
  /** Combine both changes, marking any lines that cannot be combined. The default. */
  | "merge"
  /** Leave the file on disk as it is. */
  | "keep-local"
  /** Replace the file, keeping what was there as a backup. */
  | "overwrite"
  /** Ask. */
  | "prompt";

/**
 * Where a managed block is inserted the first time it is written. It has no effect
 * once the block is in the file: a block that has been placed stays where it is.
 */
export type BlockPosition = "top" | "bottom";

/**
 * Options for a directory a tool needs to exist.
 */
export interface IEnsureDirOptions {
  /**
   * The permission the directory must have. `~/.ssh` is the reason this exists: ssh
   * refuses to use a key whose directory other users can read.
   */
  mode?: Mode;
}

/**
 * Options for a symbolic link.
 */
export interface ISymlinkOptions {
  /**
   * The permission enforced on what the link points at. A symlink carries no
   * permission of its own, so this applies to the source file, which is how a private
   * key ends up at `0600` without an imperative `chmod` in a hook.
   */
  mode?: Mode;
}

/**
 * Options for a copied file or directory.
 */
export interface ICopyOptions {
  /**
   * The permission the copy must have.
   */
  mode?: Mode;
  /**
   * What to do when the copy and its source have both changed. Defaults to `merge`.
   */
  conflict?: ConflictPolicy;
}

/**
 * Options for a managed block: the region of a shared file that this tool owns.
 */
export interface IBlockOptions {
  /**
   * Names the region within the file. It is written into the markers and is how the
   * block is found again on the next run, so it must be unique within the file and
   * may contain only letters, digits, dots, dashes and underscores.
   */
  id: string;
  /**
   * What goes between the markers. Everything outside them is left exactly as it was,
   * which is what makes a block impossible to conflict with an edit made elsewhere in
   * the file.
   */
  content: Resolvable<IToolConfigContext, string>;
  /**
   * The permission the whole file must have. The file is shared, so this is the
   * permission of a file this tool does not own outright -- `~/.ssh/config` at `0600`.
   */
  mode?: Mode;
  /**
   * Where to put the block the first time it is written. Defaults to `bottom`.
   */
  position?: BlockPosition;
  /**
   * What to do when the block's own content has been edited on disk and in the
   * repository. Defaults to `merge`. Only the block is considered: an edit made
   * outside the markers is never a conflict.
   */
  conflict?: ConflictPolicy;
}

/**
 * Options for a file rendered from a template.
 */
export interface ITemplateOptions {
  /**
   * The values the template's `{tokens}` are filled with. Project placeholders such as
   * `{paths.homeDir}` and `{toolName}` work without being declared here; a name
   * declared here wins over a project one. A `{token}` nothing fills is an error, not
   * an empty string.
   */
  variables?: Resolvable<IToolConfigContext, Record<string, string | number | boolean>>;
  /**
   * The permission the rendered file must have.
   */
  mode?: Mode;
  /**
   * What to do when the rendered file and the template have both changed. Defaults to
   * `merge`.
   */
  conflict?: ConflictPolicy;
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
 * Arguments passed to a binary to make it print its version, e.g. `["--version"]`.
 */
export type VersionArgs = string | string[];

/**
 * Pattern extracting the version from the binary's output. The first capture group is
 * used when there is one, otherwise the whole match.
 */
export type VersionRegex = string | RegExp;

/**
 * Parameters for manual installation method.
 */
export interface IManualInstallParams extends ICommonInstallParams {
  /**
   * Path to a pre-existing executable, relative to the `.tool.ts` file or absolute.
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
   * Name of the Cargo crate to install. Defaults to the tool name.
   */
  crateName?: string;
  /**
   * Where the prebuilt binary is fetched from. Defaults to "cargo-quickinstall".
   * When the prebuilt download fails the crate is compiled with `cargo install`.
   */
  binarySource?: "cargo-quickinstall" | "github-releases";
  /**
   * GitHub repository in "owner/repo" format to fetch a prebuilt release binary from,
   * used with `binarySource: "github-releases"`.
   */
  githubRepo?: string;
  /**
   * Glob or regex pattern selecting the release asset. Supports the placeholders
   * {crateName}, {version}, {platform} and {arch}.
   */
  assetPattern?: string;
  /**
   * Where the version to install is read from. Defaults to "cargo-toml" when
   * cargoTomlUrl is set, to "github-releases" when binarySource is "github-releases",
   * and to "crates-io" otherwise.
   */
  versionSource?: "cargo-toml" | "crates-io" | "github-releases";
  /**
   * Cargo.toml to read the version from with `versionSource: "cargo-toml"`. Defaults
   * to the main branch of githubRepo on raw.githubusercontent.com.
   */
  cargoTomlUrl?: string;
  /**
   * Include prerelease versions when resolving the latest version, from crates.io and
   * from GitHub releases alike. Defaults to false: the newest stable release.
   */
  prerelease?: boolean;
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
   * Homebrew formula or cask name (e.g. "ripgrep"). Defaults to the tool name.
   */
  formula?: string;
  /**
   * Install `formula` as a cask (`brew install --cask`).
   */
  cask?: boolean;
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
   * Link the formula after installing (`brew link`), optionally with `--overwrite` or `--force`.
   */
  link?: boolean | { overwrite?: boolean; force?: boolean };
  /**
   * Background service action run after installing (`brew services <action> <formula>`).
   * `true` means "start".
   */
  service?: boolean | string;
  /**
   * Arguments passed to the binary to detect its version (e.g. `['--version']`).
   */
  versionArgs?: VersionArgs;
  /**
   * Regular expression pattern used to extract the version from command output.
   */
  versionRegex?: VersionRegex;
}

/**
 * Parameters for APT package manager installer (Debian / Ubuntu).
 */
export interface IAptInstallParams extends ICommonInstallParams {
  /**
   * APT package name. Defaults to the tool name.
   */
  package?: string;
  /**
   * Exact package version, installed as `package=version`.
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
   * Defaults to the tool name.
   */
  package?: string;
  /**
   * Exact package version, installed as `package=version`.
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
   * DNF package name. Defaults to the tool name.
   */
  package?: string;
  /**
   * Exact version/release suffix, installed as `package-version`.
   */
  version?: string;
  /**
   * Whether to run `dnf makecache` before installation.
   */
  refresh?: boolean;
}

/**
 * One file attached to a release.
 */
export interface IReleaseAsset {
  /**
   * The asset's filename, e.g. `ripgrep-14.1.0-aarch64-apple-darwin.tar.gz`.
   */
  name: string;
  /**
   * Address the asset is downloaded from.
   */
  browser_download_url: string;
  /**
   * The forge's identifier for the asset.
   */
  id: number;
}

/**
 * A release, as the forge reported it.
 */
export interface IRelease {
  /**
   * The forge's identifier for the release.
   */
  id: number;
  /**
   * Tag the release was cut from, e.g. `v14.1.0`.
   */
  tag_name: string;
  /**
   * Title of the release.
   */
  name: string;
  /**
   * Whether the forge marks the release as a prerelease.
   */
  prerelease: boolean;
  /**
   * Whether the release is still a draft. GitHub reports it; Gitea does not.
   */
  draft?: boolean;
  /**
   * Every file attached to the release.
   */
  assets: IReleaseAsset[];
}

/**
 * Context given to an `assetSelector`.
 *
 * It is the tool context plus the release the installer resolved, so the choice can
 * depend on the whole set of assets at once, or on the release's tag -- neither of
 * which a per-filename `assetPattern` can express.
 */
export interface IAssetSelectionContext extends IToolConfigContext {
  /**
   * Every asset of the release, to choose one of.
   */
  assets: IReleaseAsset[];
  /**
   * The release the assets belong to.
   */
  release: IRelease;
  /**
   * The configured `assetPattern`, when there is one. It is not applied for you: a
   * selector that wants it narrows the assets itself. A `RegExp` arrives in its
   * `/source/flags` form.
   */
  assetPattern?: string;
}

/**
 * Chooses which release asset to install.
 *
 * It is called once the release has been resolved, and must return one of the assets it
 * was given. Returning nothing fails the installation rather than falling back to the
 * built-in matcher: having asked for a specific asset, quietly installing a different
 * one is what the parameter exists to prevent.
 */
export type AssetSelector = (
  context: IAssetSelectionContext,
) => IReleaseAsset | undefined | Promise<IReleaseAsset | undefined>;

/**
 * A macOS `.dmg` / `.pkg` artifact downloaded from a fixed address.
 */
export interface IMacUrlSource {
  type: "url";
  /**
   * Direct HTTP/HTTPS URL of the artifact, or of an archive containing it.
   */
  url: string;
}

/**
 * A macOS `.dmg` / `.pkg` artifact resolved from a GitHub release.
 */
export interface IMacGithubReleaseSource {
  type: "github-release";
  /**
   * GitHub repository in "owner/repo" format.
   */
  repo: string;
  /**
   * Release tag to install. Defaults to the latest release.
   */
  version?: string;
  /**
   * Glob or regex pattern selecting the release asset.
   */
  assetPattern?: string | RegExp;
  /**
   * Chooses the asset yourself, instead of by pattern. Reach for it only when a
   * pattern cannot express the choice.
   */
  assetSelector?: AssetSelector;
  /**
   * Fetch release metadata through the `gh` CLI instead of the GitHub API.
   */
  ghCli?: boolean;
  /**
   * Include prerelease versions when resolving the latest release.
   */
  prerelease?: boolean;
}

/**
 * Where the macOS `.dmg` / `.pkg` installers obtain their artifact.
 */
export type MacInstallSource = IMacUrlSource | IMacGithubReleaseSource;

/**
 * Parameters for macOS PKG package installer.
 */
export interface IPkgInstallParams extends ICommonInstallParams {
  /**
   * Where to obtain the package.
   */
  source: MacInstallSource;
  /**
   * Target volume for `installer -target`. Defaults to "/".
   */
  target?: string;
  /**
   * Absolute path of the primary installed binary, when it is not found on PATH after
   * the package is installed.
   */
  binaryPath?: string;
  /**
   * Arguments passed to the installed binary to detect its version.
   */
  versionArgs?: VersionArgs;
  /**
   * Regular expression pattern used to extract the version from command output.
   */
  versionRegex?: VersionRegex;
  /**
   * GitHub API token used when the source is a GitHub release.
   */
  token?: string;
}

/**
 * Parameters for macOS DMG disk image installer.
 */
export interface IDmgInstallParams extends ICommonInstallParams {
  /**
   * Where to obtain the disk image.
   */
  source: MacInstallSource;
  /**
   * Name of the `.app` bundle inside the disk image (e.g. "MyApp.app"). Defaults to
   * the first `.app` found, then to `<toolName>.app`.
   */
  appName?: string;
  /**
   * Name of the executable inside `Contents/MacOS` of the bundle. Defaults to the tool name.
   */
  binaryName?: string;
  /**
   * Path of the executable relative to the `.app` bundle, when it is not
   * `Contents/MacOS/<binaryName>`.
   */
  binaryPath?: string;
  /**
   * Arguments passed to the installed binary to detect its version.
   */
  versionArgs?: VersionArgs;
  /**
   * Regular expression pattern used to extract the version from command output.
   */
  versionRegex?: VersionRegex;
  /**
   * GitHub API token used when the source is a GitHub release.
   */
  token?: string;
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
   * Package manager used to perform the install. Defaults to "npm".
   */
  packageManager?: "npm" | "bun";
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
   * GitHub repository path (e.g. "zsh-users/zsh-autosuggestions").
   */
  repo?: string;
  /**
   * Direct git repository URL.
   */
  url?: string;
  /**
   * Name of the plugin directory. Defaults to the repository name.
   */
  pluginName?: string;
  /**
   * File to source, relative to the plugin directory, when the plugin does not follow
   * the standard `<pluginName>.plugin.zsh` naming.
   */
  source?: string;
}

/**
 * Parameters for Gitea release asset installer.
 */
export interface IGiteaReleaseInstallParams extends ICommonInstallParams {
  /**
   * Gitea instance base URL (e.g. "https://codeberg.org").
   */
  instanceUrl: string;
  /**
   * Repository path (owner/repo).
   */
  repo: string;
  /**
   * Release tag to install. Defaults to the latest release.
   */
  version?: string;
  /**
   * Glob or regex pattern to select release asset filename.
   */
  assetPattern?: string | RegExp;
  /**
   * Chooses the asset yourself, instead of by pattern. Reach for it only when a
   * pattern cannot express the choice.
   */
  assetSelector?: AssetSelector;
  /**
   * API token used to authenticate with the instance.
   */
  token?: string;
  /**
   * Include prerelease versions when resolving the latest release.
   */
  prerelease?: boolean;
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
   * Expected SHA-256 checksum of the downloaded archive.
   */
  sha256?: string;
  /**
   * CLI flags passed to detect binary version (e.g. "--version").
   */
  versionArgs?: VersionArgs;
  /**
   * Regular expression pattern to extract version from output.
   */
  versionRegex?: VersionRegex;
}

/**
 * Parameters for cURL shell script installer.
 */
/**
 * Context given to a curl-script `args` or `env` function.
 *
 * It is the tool context, with the members that only exist once the script has been
 * fetched. Unlike the context a tool factory is evaluated with, `stagingDir` here is
 * the real directory rather than the `{stagingDir}` placeholder, because the resolver
 * runs when the script is about to be executed.
 */
export interface ICurlScriptResolverContext extends IToolConfigContext {
  /**
   * Absolute path of the downloaded installation script, inside `stagingDir`.
   */
  scriptPath: string;
}

export interface ICurlScriptInstallParams extends ICommonInstallParams {
  /**
   * HTTP/HTTPS URL to the installation script.
   */
  url: string;
  /**
   * Interpreter the script runs with. Defaults to "sh".
   */
  shell?: "bash" | "sh";
  /**
   * Arguments passed to the installer script, or a function producing them. A literal
   * argument may contain `{stagingDir}`, which is replaced with the staging directory;
   * a function is called when the script is about to run and receives the real paths
   * in `ICurlScriptResolverContext` instead.
   */
  args?: Resolvable<ICurlScriptResolverContext, string[]>;
  /**
   * Environment variables set for the installer script, or a function producing them.
   * Resolved the same way as `args`.
   */
  env?: Resolvable<ICurlScriptResolverContext, Record<string, string>>;
  /**
   * Where the script installs the binary, for a script that picks its own location
   * instead of installing into `stagingDir`, e.g. `"~/.local/bin/claude"`. Relative to
   * the `.tool.ts` file or absolute; `~` and path placeholders are expanded.
   *
   * After the script runs, the declared binary is always a symlink to this path as
   * written, never a copy and never the path's own resolved target, so a tool that
   * updates itself by repointing its launcher stays current. Installation fails if
   * nothing exists at the path. Only one `.bin()` may be declared alongside it.
   */
  binaryPath?: string;
  /**
   * CLI flags passed to detect binary version (e.g. "--version").
   */
  versionArgs?: VersionArgs;
  /**
   * Regular expression pattern to extract version from output.
   */
  versionRegex?: VersionRegex;
}

/**
 * Parameters for cURL binary file installer.
 */
export interface ICurlBinaryInstallParams extends ICommonInstallParams {
  /**
   * Direct HTTP/HTTPS URL to the executable binary.
   */
  url: string;
  /**
   * Expected SHA-256 checksum of the downloaded binary.
   */
  sha256?: string;
  /**
   * CLI flags passed to detect binary version (e.g. "--version").
   */
  versionArgs?: VersionArgs;
  /**
   * Regular expression pattern to extract version from output.
   */
  versionRegex?: VersionRegex;
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
   * Chooses the asset yourself, instead of by pattern. Reach for it only when a
   * pattern cannot express the choice.
   */
  assetSelector?: AssetSelector;
  /**
   * Fetch release metadata through the `gh` CLI instead of the GitHub API.
   */
  ghCli?: boolean;
  /**
   * GitHub API token used to authenticate release and asset requests. Defaults to
   * `GITHUB_TOKEN`, then `GH_TOKEN`, from the environment.
   */
  token?: string;
  /**
   * Include prerelease versions when resolving the latest release.
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

/**
 * Where a shell completion file comes from. Completions are generated after the tool
 * is installed, so `cmd` can run the installed binary.
 */
export interface ICompletionsConfig {
  /**
   * Command whose standard output is written as the completion file. Its first word is
   * resolved against the tool's installed binaries, never against PATH.
   */
  cmd?: string;
  /**
   * Existing completion file, relative to the tool directory or absolute. Ignored when
   * `cmd` is set.
   */
  source?: string;
  /**
   * Binary the completion is for, when it differs from the tool name. Names the
   * generated file (`_<bin>` for zsh).
   */
  bin?: string;
}

/**
 * How a binary declared with `.bin()` is exposed.
 */
export interface IBinaryOptions {
  /**
   * Glob or regex locating the binary inside an extracted archive, when it is not at
   * the archive root or one level deep under its own name.
   */
  pattern?: string | RegExp;
  /**
   * Whether `dotfiles generate` writes a shim for the binary into `paths.targetDir`,
   * which is on PATH. Defaults to `true`. Set `false` for a binary the CLI itself or
   * other tools use but that must not shadow the same program elsewhere on the
   * machine; the binary is still installed under the tool's `current` directory.
   */
  shim?: boolean;
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
   * Configures shell completions from a completion file or from a command's output. A
   * string is a file path, relative to the tool directory or absolute.
   */
  completions(completions: string | ICompletionsConfig): this;
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
 * Lifecycle events an installation emits, in the order it reaches them. Registering
 * any other name is rejected when the configuration is read.
 */
export type HookEvent = "before-install" | "after-download" | "after-extract" | "after-install";

/**
 * Runs a shell command from a hook. Available only to hooks: configuration is evaluated
 * on every CLI invocation, so a tool factory must not be able to execute anything.
 */
export type HookShell = (strings: ShellStrings, ...values: unknown[]) => IShellPromise;

/**
 * What an archive extraction produced.
 */
export interface IExtractResult {
  /**
   * Every file that was unpacked, as an absolute path.
   */
  extractedFiles: string[];
  /**
   * The unpacked files the extractor marked executable.
   */
  executables: string[];
}

/**
 * Context provided to lifecycle hook handlers. Every event receives the same type;
 * the members an event does not provide are `undefined`.
 */
export interface IHookContext extends IToolConfigContext {
  /**
   * Temporary installation directory the installer stages into.
   */
  stagingDir: string;
  /**
   * The resolved configuration of the tool being installed, as the installer sees it.
   */
  toolConfig: ToolConfig;
  /**
   * Path of the fetched asset. Only `after-download` provides it.
   */
  downloadPath?: string;
  /**
   * Directory the archive was unpacked into. Only `after-extract` provides it.
   */
  extractDir?: string;
  /**
   * What came out of the archive. Only `after-extract` provides it.
   */
  extractResult?: IExtractResult;
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
   * Runs a shell command from the directory holding the tool's `.tool.ts`.
   */
  $: HookShell;
}

/**
 * Result of a command run from a hook. Awaiting it runs the command; the modifiers
 * apply beforehand, so `await $`cmd`.quiet()` stays silent.
 */
export interface IShellPromise extends PromiseLike<IShellOutput> {
  /**
   * Suppresses echoing the command and its output.
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
   * Defines a binary that this tool provides, with options for where it is found and
   * whether it gets a shim.
   */
  bin(name: string, options: IBinaryOptions): this;
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
  copy(src: string, dst: string, options?: ICopyOptions): this;
  /**
   * Ensures a directory exists, with the permission it needs to have.
   */
  ensureDir(dirPath: string, options?: IEnsureDirOptions): this;
  /**
   * Owns one marker-delimited region of a shared file, leaving every other byte
   * of it exactly as it was.
   *
   * This is what files such as `~/.ssh/config`, `~/.bashrc` and `/etc/hosts` need:
   * they are shared with the user and with other tools, so owning one outright
   * overwrites their work and appending to one grows a duplicate on every run.
   */
  block(target: string, options: IBlockOptions): this;
  /**
   * Renders a template from the repository to a target path.
   */
  template(source: string, target: string, options?: ITemplateOptions): this;
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
  symlink(src: string, dst: string, options?: ISymlinkOptions): this;
  /**
   * Configures shell settings across all supported shells (zsh, bash, powershell).
   */
  shell(cb: ShellCallback): this;
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
   * Registers a lifecycle hook.
   */
  hook(event: HookEvent, handler: HookHandler): this;
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
   * Defines a binary that this tool provides on this platform, with options for where
   * it is found and whether it gets a shim.
   */
  bin(name: string, options: IBinaryOptions): this;
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
  copy(src: string, dst: string, options?: ICopyOptions): this;
  /**
   * Ensures a directory exists on this platform, with the permission it needs to have.
   */
  ensureDir(dirPath: string, options?: IEnsureDirOptions): this;
  /**
   * Owns one marker-delimited region of a shared file on this platform, leaving every other byte
   * of it exactly as it was.
   *
   * This is what files such as `~/.ssh/config`, `~/.bashrc` and `/etc/hosts` need:
   * they are shared with the user and with other tools, so owning one outright
   * overwrites their work and appending to one grows a duplicate on every run.
   */
  block(target: string, options: IBlockOptions): this;
  /**
   * Renders a template from the repository to a target path on this platform.
   */
  template(source: string, target: string, options?: ITemplateOptions): this;
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
  symlink(src: string, dst: string, options?: ISymlinkOptions): this;
  /**
   * Configures shell settings across all supported shells (zsh, bash, powershell) on this platform.
   */
  shell(cb: ShellCallback): this;
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
   * Registers a lifecycle hook on this platform.
   */
  hook(event: HookEvent, handler: HookHandler): this;
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
