import type { TsLogger } from '@dotfiles/logger';
import type {
  Architecture,
  AsyncInstallHook,
  BrewInstallParams,
  BrewToolConfig,
  CargoInstallParams,
  CargoToolConfig,
  CurlScriptInstallParams,
  CurlScriptToolConfig,
  CurlTarInstallParams,
  CurlTarToolConfig,
  GithubReleaseInstallParams,
  GithubReleaseToolConfig,
  ManualInstallParams,
  ManualToolConfig,
  Platform,
  PlatformConfigEntry,
  ShellCompletionConfig,
  ShellConfig,
  ShellConfigs,
  ShellScript,
  ToolConfig,
  ToolConfigBuilder as ToolConfigBuilderInterface,
  ToolConfigInstallationMethod,
  ToolConfigInstallParams,
  ToolConfigUpdateCheck,
} from '@dotfiles/schemas';
import { toolConfigBuilderLogMessages } from './log-messages';

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

export class ToolConfigBuilder implements ToolConfigBuilderInterface {
  private logger: TsLogger;
  public toolName: string;
  public binaries: BinaryConfig[] = [];
  public versionNum: string = 'latest';
  public currentInstallationMethod?: ToolConfigInstallationMethod;
  public currentInstallParams?: ToolConfigInstallParams;

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

  constructor(parentLogger: TsLogger, toolName: string, isPlatformScope = false) {
    this.logger = parentLogger.getSubLogger({ name: 'ToolConfigBuilder' });
    this.toolName = toolName;
    this.isPlatformScope = isPlatformScope;
  }

  get shellConfigs(): Readonly<InternalShellConfigs> {
    return this.internalShellConfigs;
  }

  /**
   * Defines a binary that this tool provides. A shim will be generated for each binary.
   *
   * **Can be called multiple times** - each call adds to the binaries array.
   *
   * @param name The name of the binary executable
   * @param pattern Optional search pattern for finding the binary (defaults to star-slash-name)
   * @returns The ToolConfigBuilder instance for chaining
   *
   * @example
   * ```typescript
   * c.bin('tool')
   * c.bin('tool1').bin('tool2')  // Multiple calls
   * ```
   */
  bin(name: string, pattern?: string): this {
    const binaryPattern = pattern || `*/${name}`;
    this.binaries.push({ name, pattern: binaryPattern });
    return this;
  }

  /**
   * Sets the tool version.
   *
   * **Should be called only once** - subsequent calls replace the previous value.
   *
   * @param version The version string, SemVer constraint, or 'latest'
   * @returns The ToolConfigBuilder instance for chaining
   *
   * @example
   * ```typescript
   * c.version('1.2.3')
   * c.version('latest')
   * c.version('^2.0.0')
   * ```
   */
  version(version: string): this {
    this.versionNum = version;
    return this;
  }

  /**
   * Sets the installation method and parameters for this tool.
   *
   * **Should be called only once** - subsequent calls replace the previous installation method.
   *
   * @param method The installation method to use
   * @param params Parameters specific to the installation method
   * @returns The ToolConfigBuilder instance for chaining
   *
   * @example
   * ```typescript
   * c.install('github-release', { repo: 'owner/repo' })
   * c.install('brew', { formula: 'tool' })
   * c.install('manual', { binaryPath: './bin/tool' })
   * ```
   */
  // Overloaded install method
  install(method: 'github-release', params: GithubReleaseInstallParams): this;
  install(method: 'brew', params: BrewInstallParams): this;
  install(method: 'curl-script', params: CurlScriptInstallParams): this;
  install(method: 'curl-tar', params: CurlTarInstallParams): this;
  install(method: 'cargo', params: CargoInstallParams): this;
  install(method: 'manual', params: ManualInstallParams): this;
  install(method: ToolConfigInstallationMethod, params: ToolConfigInstallParams): this {
    this.currentInstallationMethod = method;
    this.currentInstallParams = params;
    return this;
  }

  /**
   * Sets installation hooks for this tool.
   *
   * **Can be called multiple times** - subsequent calls merge with existing hooks.
   * **Must be called after install()** - will be ignored with warning if called before.
   *
   * @param hooks Object containing hook functions for different installation phases
   * @returns The ToolConfigBuilder instance for chaining
   *
   * @example
   * c.install('github-release', { repo: 'owner/repo' })
   *  .hooks({ afterInstall: async (context) => { } })
   */
  hooks(hooks: {
    beforeInstall?: AsyncInstallHook;
    afterDownload?: AsyncInstallHook;
    afterExtract?: AsyncInstallHook;
    afterInstall?: AsyncInstallHook;
  }): this {
    if (this.currentInstallParams) {
      this.currentInstallParams.hooks = { ...this.currentInstallParams.hooks, ...hooks };
    } else {
      this.logger.warn(
        toolConfigBuilderLogMessages.configurationFieldIgnored(
          'hooks',
          `hooks() called for tool "${this.toolName}" before install(). Hooks will not be set as install() was not called first.`
        )
      );
    }
    return this;
  }

  /**
   * Configures zsh shell integration (scripts, aliases, environment, completions).
   *
   * **Can be called multiple times** - configuration is merged (scripts are appended, aliases/environment are merged).
   *
   * @param config Shell configuration object
   * @returns The ToolConfigBuilder instance for chaining
   *
   * @example
   * c.zsh({ aliases: { ll: 'ls -la' } })
   *  .zsh({ environment: { EDITOR: 'vim' } })  // Multiple calls merge
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
   * Configures bash shell integration (scripts, aliases, environment, completions).
   *
   * **Can be called multiple times** - configuration is merged (scripts are appended, aliases/environment are merged).
   *
   * @param config Shell configuration object
   * @returns The ToolConfigBuilder instance for chaining
   *
   * @example
   * c.bash({ aliases: { ll: 'ls -la' } })
   *  .bash({ environment: { EDITOR: 'vim' } })  // Multiple calls merge
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
   * Configures PowerShell integration (scripts, aliases, environment, completions).
   *
   * **Can be called multiple times** - configuration is merged (scripts are appended, aliases/environment are merged).
   *
   * @param config Shell configuration object
   * @returns The ToolConfigBuilder instance for chaining
   *
   * @example
   * c.powershell({ aliases: { ll: 'Get-ChildItem' } })
   *  .powershell({ environment: { EDITOR: 'code' } })  // Multiple calls merge
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
   * Adds a symbolic link to be created when the tool is installed.
   *
   * **Can be called multiple times** - each call adds to the symlinks array.
   *
   * @param source Path to the source file relative to the tool config directory
   * @param target Absolute path where the symlink should be created
   * @returns The ToolConfigBuilder instance for chaining
   *
   * @example
   * c.symlink('./config/tool.conf', '~/.config/tool.conf')
   *  .symlink('./scripts/helper.sh', '~/bin/helper')  // Multiple calls
   */
  symlink(source: string, target: string): this {
    this.symlinkPairs.push({ source, target });
    return this;
  }

  /**
   * Adds platform-specific configuration overrides.
   *
   * **Can be called multiple times** - each call adds a new platform config entry.
   *
   * @param platforms Target platform(s) using Platform enum (can be combined with bitwise OR)
   * @param architecturesOrConfigure Either Architecture enum or configuration callback function
   * @param configureCallback Optional configuration callback when architectures are specified
   * @returns The ToolConfigBuilder instance for chaining
   *
   * @example
   * c.platform(Platform.MacOS, (pb) => pb.install('brew', { formula: 'tool' }))
   *  .platform(Platform.Linux, (pb) => pb.install('cargo', { crateName: 'tool' }))
   */
  platform(
    platforms: Platform,
    architecturesOrConfigure: Architecture | ((builder: ToolConfigBuilderInterface) => void),
    configureCallback?: (builder: ToolConfigBuilderInterface) => void
  ): this {
    let targetArchitectures: Architecture | undefined;
    let configureFn: (builder: ToolConfigBuilderInterface) => void;

    if (typeof architecturesOrConfigure === 'function') {
      configureFn = architecturesOrConfigure;
      targetArchitectures = undefined; // Applies to all architectures for the given platforms
    } else {
      targetArchitectures = architecturesOrConfigure;
      if (typeof configureCallback !== 'function') {
        const missingCallbackError = toolConfigBuilderLogMessages.configurationFieldRequired(
          'configure callback',
          `platform() called for tool "${this.toolName}" with architectures but without a configure callback`
        );
        this.logger.error(missingCallbackError);
        throw new Error(missingCallbackError);
      }
      configureFn = configureCallback;
    }

    const platformBuilder = new ToolConfigBuilder(this.logger, this.toolName, true);
    configureFn(platformBuilder);
    const platformConfig = platformBuilder.buildPlatformConfig();

    this.platformConfigEntries.push({
      platforms,
      architectures: targetArchitectures,
      config: platformConfig,
    });

    return this;
  }

  /**
   * Configures update checking behavior for this tool.
   *
   * **Should be called only once** - subsequent calls replace the previous configuration.
   *
   * @param config Update check configuration object
   * @returns The ToolConfigBuilder instance for chaining
   *
   * @example
   * c.updateCheck({ enabled: true, constraint: '^1.0.0' })
   */
  updateCheck(config: ToolConfig['updateCheck']): this {
    this.updateCheckConfig = config;
    return this;
  }

  build(): ToolConfig {
    const baseConfig = this.buildBaseConfig();

    if (this.hasInstallationMethod()) {
      return this.buildInstallableToolConfig(baseConfig);
    }

    this.validateConfigurationOnly(baseConfig);
    return this.buildConfigurationOnlyTool(baseConfig);
  }

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
   * Builds a platform config object that excludes name and platformConfigs fields.
   * This is used when creating platform-specific configurations to avoid circular references.
   */
  private buildPlatformConfig() {
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

    return config;
  }

  private hasInstallationMethod(): boolean {
    return Boolean(this.currentInstallationMethod && this.currentInstallParams);
  }

  private buildInstallableToolConfig(baseConfig: ReturnType<typeof this.buildBaseConfig>): ToolConfig {
    const installableBase = {
      ...baseConfig,
      binaries: baseConfig.binaries && baseConfig.binaries.length > 0 ? baseConfig.binaries : [],
    };

    switch (this.currentInstallationMethod) {
      case 'github-release':
        return {
          ...installableBase,
          installationMethod: 'github-release',
          installParams: this.currentInstallParams,
        } as GithubReleaseToolConfig;
      case 'brew':
        return {
          ...installableBase,
          installationMethod: 'brew',
          installParams: this.currentInstallParams,
        } as BrewToolConfig;
      case 'curl-script':
        return {
          ...installableBase,
          installationMethod: 'curl-script',
          installParams: this.currentInstallParams,
        } as CurlScriptToolConfig;
      case 'curl-tar':
        return {
          ...installableBase,
          installationMethod: 'curl-tar',
          installParams: this.currentInstallParams,
        } as CurlTarToolConfig;
      case 'cargo':
        return {
          ...installableBase,
          installationMethod: 'cargo',
          installParams: this.currentInstallParams,
        } as CargoToolConfig;
      case 'manual':
        return {
          ...installableBase,
          installationMethod: 'manual',
          installParams: this.currentInstallParams,
        } as ManualToolConfig;
      default:
        return this.throwInvalidMethodError();
    }
  }

  private throwInvalidMethodError(): never {
    const invalidMethodError = toolConfigBuilderLogMessages.configurationFieldInvalid(
      'installationMethod',
      this.currentInstallationMethod ?? 'unknown',
      'github-release | brew | curl-script | curl-tar | cargo | manual'
    );
    this.logger.error(invalidMethodError);
    throw new Error(invalidMethodError);
  }

  private validateConfigurationOnly(baseConfig: ReturnType<typeof this.buildBaseConfig>): void {
    const finalBinaries = baseConfig.binaries && baseConfig.binaries.length > 0 ? baseConfig.binaries : [];
    const hasContent =
      finalBinaries.length > 0 ||
      baseConfig.shellConfigs ||
      baseConfig.symlinks ||
      (baseConfig.platformConfigs && baseConfig.platformConfigs.length > 0);

    if (!hasContent) {
      const requiredConfigError = toolConfigBuilderLogMessages.configurationFieldRequired(
        'tool definition',
        `Tool "${baseConfig.name}" must define at least binaries, shell init scripts (zsh/bash/powershell), symlinks, or platformConfigs`
      );
      this.logger.error(requiredConfigError);
      throw new Error(requiredConfigError);
    }
  }

  private buildConfigurationOnlyTool(baseConfig: ReturnType<typeof this.buildBaseConfig>): ToolConfig {
    return {
      ...baseConfig,
      binaries: baseConfig.binaries && baseConfig.binaries.length > 0 ? baseConfig.binaries : [],
      installationMethod: 'manual',
      installParams: {},
    } as ManualToolConfig;
  }
}
