import type {
  Architecture,
  AsyncInstallHook,
  InstallerPluginRegistry,
  Platform,
  PlatformConfig,
  PlatformConfigBuilder as PlatformConfigBuilderInterface,
  PlatformConfigEntry,
  PlatformInstallFunction,
  ShellCompletionConfig,
  ShellConfig,
  ShellConfigs,
  ShellScript,
  ToolConfig,
  ToolConfigBuilder as ToolConfigBuilderInterface,
  ToolConfigUpdateCheck,
} from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import { messages } from './log-messages';

/**
 * Internal shell configuration storage organized by shell type
 */
interface ShellStorage {
  scripts: ShellScript[];
  aliases: Record<string, string>;
  environment: Record<string, string>;
  completions?: ShellCompletionConfig;
}

/**
 * Internal shell configurations organized by shell type
 */
interface InternalShellConfigs {
  zsh: ShellStorage;
  bash: ShellStorage;
  powershell: ShellStorage;
}

export interface BinaryConfig {
  name: string;
  pattern: string;
}

/**
 * A fluent API for creating {@link @dotfiles/core#ToolConfig} objects.
 *
 * This builder provides a chainable interface to define all aspects of a tool's
 * configuration, from its name and version to complex, platform-specific
 * installation instructions and shell integrations.
 *
 * @example
 * ```typescript
 * const nodeConfig = new ToolConfigBuilder(logger, 'node')
 *   .version('20.0.0')
 *   .bin('node')
 *   .bin('npm')
 *   .install('github-release', { repo: 'nodejs/node' })
 *   .zsh({
 *     environment: { NODE_ENV: 'development' },
 *   })
 *   .platform(Platform.Windows, (p) => {
 *     p.install('manual', {
 *       // ... windows specific install
 *     });
 *   })
 *   .build();
 * ```
 */
export class ToolConfigBuilder implements ToolConfigBuilderInterface {
  private logger: TsLogger;
  private registry?: InstallerPluginRegistry;
  public toolName: string;
  public binaries: BinaryConfig[] = [];
  public versionNum: string = 'latest';
  public currentInstallationMethod?: string;
  public currentInstallParams?: Record<string, unknown>;

  // Organized shell storage matching final ToolConfig structure
  private internalShellConfigs: InternalShellConfigs = {
    zsh: { scripts: [], aliases: {}, environment: {} },
    bash: { scripts: [], aliases: {}, environment: {} },
    powershell: { scripts: [], aliases: {}, environment: {} },
  };

  public symlinkPairs: { source: string; target: string }[] = [];
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
   * @returns The `ToolConfigBuilder` instance for chaining.
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
   * @returns The `ToolConfigBuilder` instance for chaining.
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
   * @returns The `ToolConfigBuilder` instance for chaining.
   */
  install(method: string, params: Record<string, unknown>): this {
    this.currentInstallationMethod = method;
    this.currentInstallParams = params;
    return this;
  }

  /**
   * Attaches asynchronous hooks to the installation process.
   *
   * These hooks allow for custom logic to be executed at different stages of the
   * installation lifecycle, such as before installation or after extraction.
   * **This method must be called after {@link ToolConfigBuilder.install}**.
   * **This method can be called multiple times**; subsequent calls will merge with existing hooks.
   *
   * @param hooks - An object containing one or more hook functions.
   * @returns The `ToolConfigBuilder` instance for chaining.
   */
  hooks(hooks: {
    beforeInstall?: AsyncInstallHook;
    afterDownload?: AsyncInstallHook;
    afterExtract?: AsyncInstallHook;
    afterInstall?: AsyncInstallHook;
  }): this {
    if (this.currentInstallParams) {
      const existingHooks = (this.currentInstallParams['hooks'] as Record<string, unknown>) || {};
      this.currentInstallParams['hooks'] = { ...existingHooks, ...hooks };
    } else {
      this.logger.warn(
        messages.configurationFieldIgnored(
          'hooks',
          `hooks() called for tool "${this.toolName}" before install(). Hooks will not be set as install() was not called first.`
        )
      );
    }
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
   * @returns The `ToolConfigBuilder` instance for chaining.
   */
  zsh(config: ShellConfig): this {
    if (config.shellInit) {
      this.internalShellConfigs.zsh.scripts.push(...config.shellInit);
    }
    if (config.environment) {
      this.internalShellConfigs.zsh.environment = {
        ...this.internalShellConfigs.zsh.environment,
        ...config.environment,
      };
    }
    if (config.aliases) {
      this.internalShellConfigs.zsh.aliases = {
        ...this.internalShellConfigs.zsh.aliases,
        ...config.aliases,
      };
    }
    if (config.completions) {
      this.internalShellConfigs.zsh.completions = config.completions;
    }
    return this;
  }

  /**
   * Configures shell integration for Bash.
   *
   * This method allows defining shell scripts, environment variables, aliases,
   * and completion scripts that should be sourced by Bash.
   * **This method can be called multiple times**; configurations are merged.
   *
   * @param config - A {@link @dotfiles/core#ShellConfig} object for Bash.
   * @returns The `ToolConfigBuilder` instance for chaining.
   */
  bash(config: ShellConfig): this {
    if (config.shellInit) {
      this.internalShellConfigs.bash.scripts.push(...config.shellInit);
    }
    if (config.environment) {
      this.internalShellConfigs.bash.environment = {
        ...this.internalShellConfigs.bash.environment,
        ...config.environment,
      };
    }
    if (config.aliases) {
      this.internalShellConfigs.bash.aliases = {
        ...this.internalShellConfigs.bash.aliases,
        ...config.aliases,
      };
    }
    if (config.completions) {
      this.internalShellConfigs.bash.completions = config.completions;
    }
    return this;
  }

  /**
   * Configures shell integration for PowerShell.
   *
   * This method allows defining shell scripts, environment variables, aliases,
   * and completion scripts that should be sourced by PowerShell.
   * **This method can be called multiple times**; configurations are merged.
   *
   * @param config - A {@link @dotfiles/core#ShellConfig} object for PowerShell.
   * @returns The `ToolConfigBuilder` instance for chaining.
   */
  powershell(config: ShellConfig): this {
    if (config.shellInit) {
      this.internalShellConfigs.powershell.scripts.push(...config.shellInit);
    }
    if (config.environment) {
      this.internalShellConfigs.powershell.environment = {
        ...this.internalShellConfigs.powershell.environment,
        ...config.environment,
      };
    }
    if (config.aliases) {
      this.internalShellConfigs.powershell.aliases = {
        ...this.internalShellConfigs.powershell.aliases,
        ...config.aliases,
      };
    }
    if (config.completions) {
      this.internalShellConfigs.powershell.completions = config.completions;
    }
    return this;
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
    const shellTypes = ['zsh', 'bash', 'powershell'] as const;
    const result: ShellConfigs = {};
    let hasAnyConfig = false;

    for (const shellType of shellTypes) {
      const config = this.internalShellConfigs[shellType];
      const hasScripts = config.scripts.length > 0;
      const hasAliases = Object.keys(config.aliases).length > 0;
      const hasEnvironment = Object.keys(config.environment).length > 0;
      const hasCompletions = config.completions !== undefined;

      if (hasScripts || hasAliases || hasEnvironment || hasCompletions) {
        result[shellType] = {
          ...(hasScripts && { scripts: config.scripts }),
          ...(hasAliases && { aliases: config.aliases }),
          ...(hasEnvironment && { environment: config.environment }),
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
   * @returns The `ToolConfigBuilder` instance for chaining.
   */
  symlink(source: string, target: string): this {
    this.symlinkPairs.push({ source, target });
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
   * @param configureCallback - The callback function that receives a new `ToolConfigBuilder`
   *   instance to define the platform-specific overrides. This is required if `architecturesOrConfigure`
   *   is an architecture.
   * @returns The `ToolConfigBuilder` instance for chaining.
   */
  platform(
    platforms: Platform,
    architecturesOrConfigure: Architecture | ((install: PlatformInstallFunction) => PlatformConfigBuilderInterface),
    configureCallback?: (install: PlatformInstallFunction) => PlatformConfigBuilderInterface
  ): this {
    let targetArchitectures: Architecture | undefined;
    let configureFn: (install: PlatformInstallFunction) => PlatformConfigBuilderInterface;

    if (typeof architecturesOrConfigure === 'function') {
      configureFn = architecturesOrConfigure;
      targetArchitectures = undefined; // Applies to all architectures for the given platforms
    } else {
      targetArchitectures = architecturesOrConfigure;
      if (typeof configureCallback !== 'function') {
        const missingCallbackError = messages.configurationFieldRequired(
          'configure callback',
          `platform() called for tool "${this.toolName}" with architectures but without a configure callback`
        );
        this.logger.error(missingCallbackError);
        throw new Error(missingCallbackError);
      }
      configureFn = configureCallback;
    }

    const platformBuilder = new ToolConfigBuilder(this.logger, this.toolName, true);

    // Create platform install function that works like the main install function
    const platformInstall: PlatformInstallFunction = ((method?: string, params?: Record<string, unknown>) => {
      if (method) {
        platformBuilder.install(method, params || {});
      }
      return platformBuilder as unknown as PlatformConfigBuilderInterface;
    }) as PlatformInstallFunction;

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
   * Configures the behavior for checking for tool updates.
   *
   * **This method should only be called once**; subsequent calls will override the previous value.
   *
   * @param config - A {@link @dotfiles/core#ToolConfigUpdateCheck} object.
   * @returns The `ToolConfigBuilder` instance for chaining.
   */
  updateCheck(config: ToolConfig['updateCheck']): this {
    this.updateCheckConfig = config;
    return this;
  }

  /**
   * Finalizes the configuration and returns the complete {@link @dotfiles/core#ToolConfig} object.
   *
   * This method validates the constructed configuration and returns the final, immutable
   * tool configuration object. If a registry was provided, it will be used for schema validation.
   *
   * @returns The built {@link @dotfiles/core#ToolConfig}.
   */
  build(): ToolConfig {
    const baseConfig = this.buildBaseConfig();

    if (this.hasInstallationMethod()) {
      const config = this.buildInstallableToolConfig(baseConfig);

      // Validate against registry schema if available
      if (this.registry) {
        try {
          const schema = this.registry.getToolConfigSchema();
          const result = schema.safeParse(config);

          if (!result.success) {
            const validationError = messages.configurationFieldInvalid(
              'tool configuration',
              this.toolName,
              result.error.message
            );
            this.logger.error(validationError);
            throw new Error(validationError);
          }
        } catch (error) {
          // If registry doesn't have composed schema yet, proceed without validation
          // This maintains backward compatibility
          if (error instanceof Error && !error.message.includes('not composed')) {
            throw error;
          }
        }
      }

      return config;
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
      shellConfigs: this.buildShellConfigs(),
      symlinks: this.symlinkPairs.length > 0 ? this.symlinkPairs : undefined,
      updateCheck: this.updateCheckConfig,
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
      version: this.versionNum !== 'latest' ? this.versionNum : undefined,
      shellConfigs: this.buildShellConfigs(),
      symlinks: this.symlinkPairs.length > 0 ? this.symlinkPairs : undefined,
      updateCheck: this.updateCheckConfig,
    };

    // Add installation method and params if they exist
    if (this.hasInstallationMethod()) {
      config['installationMethod'] = this.currentInstallationMethod;
      config['installParams'] = this.currentInstallParams;
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
   * returning a properly typed configuration object. When a registry is available,
   * it supports dynamic plugin-provided installation methods. Otherwise, it uses
   * the hardcoded switch statement for backward compatibility.
   * Ensures binaries array is always defined for installable tools.
   *
   * @param baseConfig - The base configuration object.
   * @returns A typed ToolConfig based on the installation method.
   */
  private buildInstallableToolConfig(baseConfig: ReturnType<typeof this.buildBaseConfig>): ToolConfig {
    const installableBase = {
      ...baseConfig,
      binaries: baseConfig.binaries && baseConfig.binaries.length > 0 ? baseConfig.binaries : [],
    };

    // If registry is available, support dynamic methods
    if (this.registry) {
      return {
        ...installableBase,
        installationMethod: this.currentInstallationMethod,
        installParams: this.currentInstallParams,
      } as ToolConfig;
    }

    // Without registry, validate against known core methods
    const validMethods: string[] = ['github-release', 'brew', 'curl-script', 'curl-tar', 'cargo', 'manual'];

    if (this.currentInstallationMethod && validMethods.includes(this.currentInstallationMethod)) {
      return {
        ...installableBase,
        installationMethod: this.currentInstallationMethod,
        installParams: this.currentInstallParams,
      } as ToolConfig;
    }

    // Invalid method without registry
    return this.throwInvalidMethodError();
  }

  /**
   * Throws an error for invalid installation methods.
   *
   * This is called when the installation method doesn't match any of the known types,
   * which should not happen due to TypeScript's type checking but provides a runtime safeguard.
   *
   * @throws Always throws an error with details about the invalid method.
   */
  private throwInvalidMethodError(): never {
    const invalidMethodError = messages.configurationFieldInvalid(
      'installationMethod',
      this.currentInstallationMethod ?? 'unknown',
      'github-release | brew | curl-script | curl-tar | cargo | manual'
    );
    this.logger.error(invalidMethodError);
    throw new Error(invalidMethodError);
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
      (baseConfig.platformConfigs && baseConfig.platformConfigs.length > 0);

    if (!hasContent) {
      const requiredConfigError = messages.configurationFieldRequired(
        'tool definition',
        `Tool "${baseConfig.name}" must define at least binaries, shell init scripts (zsh/bash/powershell), symlinks, or platformConfigs`
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
      installationMethod: 'manual',
      installParams: {},
    } as unknown as ToolConfig;
  }

  /**
   * Creates a new ToolConfigBuilder instance.
   *
   * @param parentLogger - The parent logger from which a sublogger will be created.
   * @param toolName - The name of the tool being configured.
   * @param registryOrIsPlatformScope - Either an InstallerPluginRegistry for validation or a boolean
   *   indicating if this is platform scope (for backward compatibility).
   * @param isPlatformScope - Whether this builder is used for platform-specific configuration.
   *   When true, the builder will not include platformConfigs in the output to avoid circular references.
   */
  constructor(
    parentLogger: TsLogger,
    toolName: string,
    registryOrIsPlatformScope?: InstallerPluginRegistry | boolean,
    isPlatformScope = false
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'ToolConfigBuilder' });
    this.toolName = toolName;

    // Handle overloaded constructor
    if (typeof registryOrIsPlatformScope === 'boolean') {
      this.isPlatformScope = registryOrIsPlatformScope;
      this.registry = undefined;
    } else if (registryOrIsPlatformScope) {
      this.registry = registryOrIsPlatformScope;
      this.isPlatformScope = isPlatformScope;
    } else {
      this.registry = undefined;
      this.isPlatformScope = isPlatformScope;
    }
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
}
