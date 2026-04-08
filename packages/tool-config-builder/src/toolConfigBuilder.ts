import type {
  Architecture,
  AsyncInstallHook,
  HookEventName,
  IInstallParamsRegistry,
  InstallMethod,
  IPlatformConfigBuilder as PlatformConfigBuilderInterface,
  IPlatformInstallFunction,
  IToolConfigBuilder as ToolConfigBuilderInterface,
  IToolConfigContext,
  IToolPathMapping,
  Platform,
  PlatformConfig,
  PlatformConfigEntry,
  ShellConfigs,
  ShellConfiguratorAsyncCallback,
  ShellConfiguratorCallback,
  ToolConfig,
  ToolConfigUpdateCheck,
} from "@dotfiles/core";
import type { TsLogger } from "@dotfiles/logger";
import { messages } from "./log-messages";
import { ShellConfigurator } from "./ShellConfigurator";
import type {
  InternalShellConfigs,
  IShellStorage,
  MaybePromise,
  PlatformConfigureCallback,
  PlatformSelectorInput,
  ShellConfiguratorHandler,
  ShellTypeKey,
} from "./types";

export interface IBinaryConfig {
  name: string;
  pattern: string;
}

type InstallParams = IInstallParamsRegistry[InstallMethod];
type BuilderInstallParams = InstallParams | Record<string, unknown>;
type PlatformInstallArguments = [InstallMethod, InstallParams] | [];
type HostnamePattern = string | RegExp;

/**
 * A fluent API for creating {@link @dotfiles/core#ToolConfig} objects.
 *
 * This builder provides a chainable interface to define all aspects of a tool's
 * configuration, from its name and version to complex, platform-specific
 * installation instructions and shell integrations.
 *
 * @example
 * ```typescript
 * const nodeConfig = new IToolConfigBuilder(logger, 'node')
 *   .version('20.0.0')
 *   .bin('node')
 *   .bin('npm')
 *   .install('github-release', { repo: 'nodejs/node' })
 *   .zsh((shell) => shell.env({ NODE_ENV: 'development' }))
 *   .platform(Platform.Windows, (p) => {
 *     p.install('manual', {
 *       // ... windows specific install
 *     });
 *   })
 *   .build();
 * ```
 */
export class IToolConfigBuilder implements ToolConfigBuilderInterface {
  private logger: TsLogger;
  public toolName: string;
  public binaries: IBinaryConfig[] = [];
  public versionNum: string = "latest";
  public currentInstallationMethod?: string;
  public currentInstallParams?: BuilderInstallParams;
  private dependencies: string[] = [];
  private isDisabled: boolean = false;
  private hostnamePattern?: string;

  // Organized shell storage matching final ToolConfig structure
  private internalShellConfigs: InternalShellConfigs = {
    zsh: { scripts: [], aliases: {}, env: {}, functions: {}, paths: [] },
    bash: { scripts: [], aliases: {}, env: {}, functions: {}, paths: [] },
    powershell: { scripts: [], aliases: {}, env: {}, functions: {}, paths: [] },
  };
  private context?: IToolConfigContext;

  public symlinkPairs: IToolPathMapping[] = [];
  public copyPairs: IToolPathMapping[] = [];
  private updateCheckConfig?: ToolConfigUpdateCheck;
  private platformConfigEntries: PlatformConfigEntry[] = [];

  private isPlatformScope: boolean;

  /**
   * Defines a binary executable provided by the tool.
   *
   * A shim will be generated for each binary, making it available in the system's PATH.
   * **This method can be called multiple times** to define all binaries for a tool.
   *
   * @param name - The name of the binary (e.g., `node`, `npm`).
   * @param pattern - An optional glob pattern to locate the binary within the installed files.
   *   If not provided, it defaults to `* /${name}`.
   * @returns The `IToolConfigBuilder` instance for chaining.
   */
  bin(name: string, pattern?: string): this {
    const binaryPattern = pattern || `*/${name}`;
    this.binaries.push({ name, pattern: binaryPattern });
    return this;
  }

  /**
   * Sets the version of the tool to be installed.
   *
   * This can be a specific version string, a semantic versioning range, or 'latest'.
   * **This method should only be called once**; subsequent calls will override the previous value.
   *
   * @param version - The version identifier.
   * @returns The `IToolConfigBuilder` instance for chaining.
   */
  version(version: string): this {
    this.versionNum = version;
    return this;
  }

  /**
   * Specifies the installation method and its required parameters.
   *
   * This is a critical step that defines how the tool is acquired and installed.
   * Type safety for the parameters is provided by each plugin through module augmentation.
   * **This method should only be called once**; subsequent calls will override the previous value.
   *
   * @param method - The installation method (e.g., 'github-release', 'brew').
   * @param params - A configuration object specific to the chosen method.
   * @returns The `IToolConfigBuilder` instance for chaining.
   */
  install<M extends InstallMethod>(method: M, params: IInstallParamsRegistry[M]): this;
  install(method: string, params: Record<string, unknown>): this;
  install(method: string, params: Record<string, unknown>): this {
    this.currentInstallationMethod = method;
    this.currentInstallParams = params;
    return this;
  }

  /**
   * Attach a hook handler to a specific lifecycle event.
   *
   * Multiple handlers can be added by calling this method multiple times with the same event name.
   * **This method must be called after {@link IToolConfigBuilder.install}**.
   *
   * @param event - The lifecycle event name (kebab-case: 'before-install', 'after-download', 'after-extract', 'after-install')
   * @param handler - The async hook function to execute
   * @returns The `IToolConfigBuilder` instance for chaining.
   */
  hook(event: HookEventName, handler: AsyncInstallHook<never>): this {
    if (!this.currentInstallParams) {
      this.logger.warn(
        messages.configurationFieldIgnored(
          "hook",
          `hook() called for tool "${this.toolName}" before install(). Hook will not be set as install() was not called first.`,
        ),
      );
      return this;
    }

    const hooksObj = (this.currentInstallParams["hooks"] as Record<string, AsyncInstallHook<never>[]>) || {};
    const eventHooks: AsyncInstallHook<never>[] = hooksObj[event] || [];
    eventHooks.push(handler);
    hooksObj[event] = eventHooks;
    this.currentInstallParams["hooks"] = hooksObj;

    return this;
  }

  /**
   * Configures shell integration for Zsh.
   *
   * This method allows defining shell scripts, environment variables, aliases,
   * and completion scripts that should be sourced by Zsh.
   * **This method can be called multiple times**; configurations are merged.
   *
   * @param config - A {@link @dotfiles/core#ShellConfig} object for Zsh.
   * @returns The `IToolConfigBuilder` instance for chaining.
   */
  zsh(callback: ShellConfiguratorCallback): this;
  zsh(callback: ShellConfiguratorAsyncCallback): Promise<this>;
  zsh(callback: ShellConfiguratorHandler): MaybePromise<this> {
    return this.configureShell("zsh", callback);
  }

  /**
   * Configures shell integration for Bash.
   *
   * This method allows defining shell scripts, environment variables, aliases,
   * and completion scripts that should be sourced by Bash.
   * **This method can be called multiple times**; configurations are merged.
   *
   * @param config - A {@link @dotfiles/core#ShellConfig} object for Bash.
   * @returns The `IToolConfigBuilder` instance for chaining.
   */
  bash(callback: ShellConfiguratorCallback): this;
  bash(callback: ShellConfiguratorAsyncCallback): Promise<this>;
  bash(callback: ShellConfiguratorHandler): MaybePromise<this> {
    return this.configureShell("bash", callback);
  }

  /**
   * Configures shell integration for PowerShell.
   *
   * This method allows defining shell scripts, environment variables, aliases,
   * and completion scripts that should be sourced by PowerShell.
   * **This method can be called multiple times**; configurations are merged.
   *
   * @param config - A {@link @dotfiles/core#ShellConfig} object for PowerShell.
   * @returns The `IToolConfigBuilder` instance for chaining.
   */
  powershell(callback: ShellConfiguratorCallback): this;
  powershell(callback: ShellConfiguratorAsyncCallback): Promise<this>;
  powershell(callback: ShellConfiguratorHandler): MaybePromise<this> {
    return this.configureShell("powershell", callback);
  }

  /**
   * Builds the final shell configurations object by consolidating internal shell storage.
   *
   * Iterates through all shell types (zsh, bash, powershell) and creates a ShellConfigs
   * object containing only the shell types that have actual configuration data.
   *
   * @returns A ShellConfigs object if any shell has configuration, undefined otherwise.
   */
  private buildShellConfigs(): ShellConfigs | undefined {
    const shellTypes = ["zsh", "bash", "powershell"] as const;
    const result: ShellConfigs = {};
    let hasAnyConfig = false;

    for (const shellType of shellTypes) {
      const config = this.internalShellConfigs[shellType];
      const hasScripts = config.scripts.length > 0;
      const hasAliases = Object.keys(config.aliases).length > 0;
      const hasEnv = Object.keys(config.env).length > 0;
      const hasFunctions = Object.keys(config.functions).length > 0;
      const hasPaths = config.paths.length > 0;
      const hasCompletions = config.completions !== undefined;

      const hasAnyShellConfig = hasScripts || hasAliases || hasEnv || hasFunctions || hasPaths || hasCompletions;

      if (hasAnyShellConfig) {
        result[shellType] = {
          ...(hasScripts && { scripts: config.scripts }),
          ...(hasAliases && { aliases: config.aliases }),
          ...(hasEnv && { env: config.env }),
          ...(hasFunctions && { functions: config.functions }),
          ...(hasPaths && { paths: config.paths }),
          ...(hasCompletions && { completions: config.completions }),
        };
        hasAnyConfig = true;
      }
    }

    return hasAnyConfig ? result : undefined;
  }

  /**
   * Defines a symbolic link to be created.
   *
   * This is useful for linking configuration files from a tool's installation
   * directory to a standard location in the user's home directory.
   * **This method can be called multiple times**.
   *
   * @param source - The path to the source file, relative to the location of the current `.tool.ts` file.
   * @param target - The absolute path where the symbolic link should be created.
   * @returns The `IToolConfigBuilder` instance for chaining.
   */
  symlink(source: string, target: string): this {
    this.symlinkPairs.push({ source, target });
    return this;
  }

  /**
   * Defines a file or directory to be copied.
   *
   * This is useful for configuration files that should be independently editable
   * at the target location, unlike symlinks which reference the original file.
   * **This method can be called multiple times**.
   *
   * @param source - The path to the source file or directory, relative to the location of the current `.tool.ts` file.
   * @param target - The absolute path where the copy should be placed.
   * @returns The `IToolConfigBuilder` instance for chaining.
   */
  copy(source: string, target: string): this {
    this.copyPairs.push({ source, target });
    return this;
  }

  /**
   * Declares binary dependencies required before generating this tool.
   *
   * @param binaryNames - One or more binary names that must be available
   * @returns The `IToolConfigBuilder` instance for chaining.
   */
  dependsOn(...binaryNames: string[]): this {
    for (const rawName of binaryNames) {
      const trimmedName = rawName.trim();
      if (trimmedName.length === 0) {
        const invalidDependencyWarning = messages.configurationFieldInvalid("dependency", rawName, "non-empty string");
        this.logger.warn(invalidDependencyWarning);
        continue;
      }

      if (!this.dependencies.includes(trimmedName)) {
        this.dependencies.push(trimmedName);
      }
    }

    return this;
  }

  /**
   * Defines platform-specific configuration overrides.
   *
   * This powerful feature allows for different installation methods, binaries,
   * or versions depending on the operating system and architecture.
   * **This method can be called multiple times** to define overrides for different platforms.
   *
   * @param platforms - The target platform(s), using the {@link @dotfiles/core#Platform} enum.
   *   Multiple platforms can be combined with a bitwise OR (e.g., `Platform.MacOS | Platform.Linux`).
   * @param architecturesOrConfigure - Either an {@link @dotfiles/core#Architecture} enum to target
   *   specific CPU architectures, or the configuration callback function if architecture is not specified.
   * @param configureCallback - The callback function that receives a new `IToolConfigBuilder`
   *   instance to define the platform-specific overrides. This is required if `architecturesOrConfigure`
   *   is an architecture.
   * @returns The `IToolConfigBuilder` instance for chaining.
   */
  platform(
    platforms: Platform,
    architecturesOrConfigure: PlatformSelectorInput,
    configureCallback?: PlatformConfigureCallback,
  ): this {
    let targetArchitectures: Architecture | undefined;
    let configureFn: PlatformConfigureCallback;

    if (typeof architecturesOrConfigure === "function") {
      configureFn = architecturesOrConfigure;
      targetArchitectures = undefined; // Applies to all architectures for the given platforms
    } else {
      targetArchitectures = architecturesOrConfigure;
      if (typeof configureCallback !== "function") {
        const missingCallbackError = messages.configurationFieldRequired(
          "configure callback",
          `platform() called for tool "${this.toolName}" with architectures but without a configure callback`,
        );
        this.logger.error(missingCallbackError);
        throw new Error(missingCallbackError);
      }
      configureFn = configureCallback;
    }

    const platformBuilder = new IToolConfigBuilder(this.logger, this.toolName, true);
    platformBuilder.setContext(this.context);

    // Create platform install function that works like the main install function
    const platformInstall: IPlatformInstallFunction = ((...args: PlatformInstallArguments) => {
      if (args.length === 0) {
        return platformBuilder as unknown as PlatformConfigBuilderInterface;
      }

      const [method, params] = args;
      platformBuilder.install(method, params);
      return platformBuilder as unknown as PlatformConfigBuilderInterface;
    }) as IPlatformInstallFunction;

    configureFn(platformInstall);
    const platformConfig = platformBuilder.buildPlatformConfig();

    this.platformConfigEntries.push({
      platforms,
      architectures: targetArchitectures,
      config: platformConfig,
    });

    return this;
  }

  /**
   * Marks the tool as disabled.
   *
   * A disabled tool is skipped during generation with a warning message.
   * This is useful for temporarily disabling a tool without removing its configuration.
   *
   * @returns The `IToolConfigBuilder` instance for chaining.
   */
  disable(): this {
    this.isDisabled = true;
    return this;
  }

  /**
   * Restricts the tool to specific hostnames.
   *
   * When set, the tool is only installed on machines where the hostname matches.
   * If the hostname doesn't match, the tool is skipped with a warning message.
   *
   * @param pattern - A literal hostname string or a RegExp for pattern matching.
   *   - String: exact match (case-sensitive)
   *   - RegExp: pattern match (e.g., `/^work-.*$/` matches any hostname starting with "work-")
   * @returns The `IToolConfigBuilder` instance for chaining.
   *
   * @example
   * // Exact hostname match
   * install('github-release', { repo: 'tool/repo' })
   *   .hostname('my-laptop')
   *
   * @example
   * // Pattern match using regex
   * install('github-release', { repo: 'tool/repo' })
   *   .hostname(/^work-.*$/)
   */
  hostname(pattern: HostnamePattern): this {
    if (pattern instanceof RegExp) {
      this.hostnamePattern = pattern.source;
    } else {
      this.hostnamePattern = pattern;
    }
    return this;
  }

  /**
   * Configures the behavior for checking for tool updates.
   *
   * **This method should only be called once**; subsequent calls will override the previous value.
   *
   * @param config - A {@link @dotfiles/core#ToolConfigUpdateCheck} object.
   * @returns The `IToolConfigBuilder` instance for chaining.
   */
  updateCheck(config: ToolConfig["updateCheck"]): this {
    this.updateCheckConfig = config;
    return this;
  }

  /**
   * Finalizes the configuration and returns the complete {@link @dotfiles/core#ToolConfig} object.
   *
   * This method validates the constructed configuration and returns the final, immutable
   * tool configuration object.
   *
   * @returns The built {@link @dotfiles/core#ToolConfig}.
   */
  build(): ToolConfig {
    const baseConfig = this.buildBaseConfig();

    if (this.hasInstallationMethod()) {
      return this.buildInstallableToolConfig(baseConfig);
    }

    this.validateConfigurationOnly(baseConfig);
    return this.buildConfigurationOnlyTool(baseConfig);
  }

  /**
   * Builds the base configuration object containing common fields shared by all tool configs.
   *
   * This includes name, binaries, version, shell configurations, symlinks, update check settings,
   * and platform-specific configurations. Optional fields are only included if they have values.
   *
   * @returns The base configuration object.
   */
  private buildBaseConfig() {
    return {
      name: this.toolName,
      binaries:
        this.binaries.length > 0 ? this.binaries.map((b) => (b.pattern === `*/${b.name}` ? b.name : b)) : undefined,
      version: this.versionNum,
      disabled: this.isDisabled ? true : undefined,
      hostname: this.hostnamePattern,
      shellConfigs: this.buildShellConfigs(),
      symlinks: this.symlinkPairs.length > 0 ? this.symlinkPairs : undefined,
      copies: this.copyPairs.length > 0 ? this.copyPairs : undefined,
      updateCheck: this.updateCheckConfig,
      dependencies: this.dependencies.length > 0 ? [...this.dependencies] : undefined,
      platformConfigs: this.isPlatformScope
        ? undefined
        : this.platformConfigEntries.length > 0
          ? this.platformConfigEntries
          : undefined,
    };
  }

  /**
   * Builds a platform-specific configuration object.
   *
   * This creates a configuration object suitable for use within a platform override.
   * It excludes the 'name' and 'platformConfigs' fields to avoid circular references,
   * as platform configs are nested within the main tool config.
   *
   * @returns A platform configuration object with undefined values removed.
   */
  private buildPlatformConfig(): PlatformConfig {
    const config: Record<string, unknown> = {
      binaries:
        this.binaries.length > 0 ? this.binaries.map((b) => (b.pattern === `*/${b.name}` ? b.name : b)) : undefined,
      version: this.versionNum !== "latest" ? this.versionNum : undefined,
      shellConfigs: this.buildShellConfigs(),
      symlinks: this.symlinkPairs.length > 0 ? this.symlinkPairs : undefined,
      copies: this.copyPairs.length > 0 ? this.copyPairs : undefined,
      updateCheck: this.updateCheckConfig,
      dependencies: this.dependencies.length > 0 ? [...this.dependencies] : undefined,
    };

    // Add installation method and params if they exist
    if (this.hasInstallationMethod()) {
      config["installationMethod"] = this.currentInstallationMethod;
      config["installParams"] = this.currentInstallParams;
    }

    // Remove undefined values to keep the config clean
    Object.keys(config).forEach((key) => {
      if (config[key] === undefined) {
        delete config[key];
      }
    });

    return config as PlatformConfig;
  }

  /**
   * Checks if an installation method and parameters have been configured.
   *
   * @returns True if both installation method and params are set, false otherwise.
   */
  private hasInstallationMethod(): boolean {
    return Boolean(this.currentInstallationMethod && this.currentInstallParams);
  }

  /**
   * Builds the final tool configuration for tools with an installation method.
   *
   * Takes the base configuration and adds the installation method and parameters,
   * returning a properly typed configuration object.
   * Ensures binaries array is always defined for installable tools.
   *
   * @param baseConfig - The base configuration object.
   * @returns A typed ToolConfig based on the installation method.
   */
  private buildInstallableToolConfig(baseConfig: ReturnType<typeof this.buildBaseConfig>): ToolConfig {
    return {
      ...baseConfig,
      binaries: baseConfig.binaries && baseConfig.binaries.length > 0 ? baseConfig.binaries : [],
      installationMethod: this.currentInstallationMethod,
      installParams: this.currentInstallParams,
    } as ToolConfig;
  }

  /**
   * Validates that configuration-only tools (without installation method) have meaningful content.
   *
   * Ensures that tools without an installation method still define at least one of:
   * binaries, shell configurations, symlinks, or platform configurations.
   *
   * @param baseConfig - The base configuration object to validate.
   * @throws Error if the configuration is empty and provides no functionality.
   */
  private validateConfigurationOnly(baseConfig: ReturnType<typeof this.buildBaseConfig>): void {
    const finalBinaries = baseConfig.binaries && baseConfig.binaries.length > 0 ? baseConfig.binaries : [];
    const hasContent =
      finalBinaries.length > 0 ||
      baseConfig.shellConfigs ||
      baseConfig.symlinks ||
      baseConfig.copies ||
      (baseConfig.platformConfigs && baseConfig.platformConfigs.length > 0);

    if (!hasContent) {
      const requiredConfigError = messages.configurationFieldRequired(
        "tool definition",
        `Tool "${baseConfig.name}" must define at least binaries, shell init scripts (zsh/bash/powershell), symlinks, or platformConfigs`,
      );
      this.logger.error(requiredConfigError);
      throw new Error(requiredConfigError);
    }
  }

  /**
   * Builds the final configuration for tools without an installation method.
   *
   * These are configuration-only tools that provide shell integration, symlinks, or other
   * functionality without being installed through the system. The installation method
   * is set to 'manual' with empty params.
   *
   * @param baseConfig - The base configuration object.
   * @returns A ManualToolConfig representing the configuration-only tool.
   */
  private buildConfigurationOnlyTool(baseConfig: ReturnType<typeof this.buildBaseConfig>): ToolConfig {
    return {
      ...baseConfig,
      binaries: baseConfig.binaries && baseConfig.binaries.length > 0 ? baseConfig.binaries : [],
      installationMethod: "manual",
      installParams: {},
    } as unknown as ToolConfig;
  }

  /**
   * Creates a new IToolConfigBuilder instance.
   *
   * @param parentLogger - The parent logger from which a sublogger will be created.
   * @param toolName - The name of the tool being configured.
   * @param isPlatformScope - Whether this builder is used for platform-specific configuration.
   *   When true, the builder will not include platformConfigs in the output to avoid circular references.
   */
  constructor(parentLogger: TsLogger, toolName: string, isPlatformScope = false) {
    this.logger = parentLogger.getSubLogger({ name: "IToolConfigBuilder" });
    this.toolName = toolName;
    this.isPlatformScope = isPlatformScope;
  }

  public setContext(context: IToolConfigContext | undefined): void {
    this.context = context;
  }

  /**
   * Provides read-only access to the internal shell configurations.
   *
   * This getter is used primarily for testing to verify that shell configurations
   * are being stored correctly before they are transformed into the final format.
   *
   * @returns A read-only view of the internal shell configurations.
   */
  get shellConfigs(): Readonly<InternalShellConfigs> {
    return this.internalShellConfigs;
  }

  private configureShell(shellType: ShellTypeKey, callback: ShellConfiguratorHandler): MaybePromise<this> {
    const storage: IShellStorage = this.internalShellConfigs[shellType];
    const configurator = new ShellConfigurator(storage, shellType, this.context, this.logger, this.toolName);

    const callbackResult = callback(configurator);

    if (this.isPromise(callbackResult)) {
      const next: Promise<this> = callbackResult.then(() => this);
      return next;
    }

    return this;
  }

  private isPromise(value: unknown): value is Promise<unknown> {
    if (value === null || value === undefined) {
      return false;
    }

    if (typeof value !== "object" && typeof value !== "function") {
      return false;
    }

    const maybePromise = value as PromiseLike<unknown>;
    return typeof maybePromise.then === "function";
  }
}
