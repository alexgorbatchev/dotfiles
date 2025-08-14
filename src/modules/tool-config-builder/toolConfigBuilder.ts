import { logs, type TsLogger } from '@modules/logger';
import type {
  Architecture,
  AsyncInstallHook,
  BrewInstallParams,
  BrewToolConfig,
  CompletionConfig,
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
  ShellConfig,
  ShellConfigs,
  ShellScript,
  ToolConfig,
  ToolConfigBuilder as ToolConfigBuilderInterface,
  ToolConfigInstallationMethod,
  ToolConfigInstallParams,
  ToolConfigUpdateCheck,
} from '@types';

/**
 * Internal shell configuration storage organized by shell type
 */
interface ShellStorage {
  scripts: ShellScript[];
  aliases: Record<string, string>;
  environment: Record<string, string>;
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
  public completionSettings?: CompletionConfig;
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

  bin(name: string, pattern?: string): this {
    const binaryPattern = pattern || `*/${name}`;
    this.binaries.push({ name, pattern: binaryPattern });
    return this;
  }

  version(version: string): this {
    this.versionNum = version;
    return this;
  }

  // Overloaded install method
  install(method: 'github-release', params: GithubReleaseInstallParams): this;
  install(method: 'brew', params: BrewInstallParams): this;
  install(method: 'curl-script', params: CurlScriptInstallParams): this;
  install(method: 'curl-tar', params: CurlTarInstallParams): this;
  install(method: 'manual', params: ManualInstallParams): this;
  install(method: ToolConfigInstallationMethod, params: ToolConfigInstallParams): this {
    this.currentInstallationMethod = method;
    this.currentInstallParams = params;
    return this;
  }

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
        logs.config.warning.ignored(
          'hooks',
          `hooks() called for tool "${this.toolName}" before install(). Hooks will not be set as install() was not called first.`
        )
      );
    }
    return this;
  }

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
      this.completionSettings = {
        ...this.completionSettings,
        zsh: config.completions,
      };
    }
    return this;
  }

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
      this.completionSettings = {
        ...this.completionSettings,
        bash: config.completions,
      };
    }
    return this;
  }

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
      this.completionSettings = {
        ...this.completionSettings,
        powershell: config.completions,
      };
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

      if (hasScripts || hasAliases || hasEnvironment) {
        result[shellType] = {
          ...(hasScripts && { scripts: config.scripts }),
          ...(hasAliases && { aliases: config.aliases }),
          ...(hasEnvironment && { environment: config.environment }),
        };
        hasAnyConfig = true;
      }
    }

    return hasAnyConfig ? result : undefined;
  }

  symlink(source: string, target: string): this {
    this.symlinkPairs.push({ source, target });
    return this;
  }

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
        const missingCallbackError = logs.config.error.required(
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

  completions(config: CompletionConfig): this {
    this.completionSettings = config;
    return this;
  }

  // Method to set updateCheck configuration
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
      binaries: this.binaries.map((b) => b.name),
      binaryConfigs: this.binaries.length > 0 ? this.binaries : undefined,
      version: this.versionNum,
      shellConfigs: this.buildShellConfigs(),
      symlinks: this.symlinkPairs.length > 0 ? this.symlinkPairs : undefined,
      completions: this.completionSettings,
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
      binaries: this.binaries.length > 0 ? this.binaries.map((b) => b.name) : undefined,
      binaryConfigs: this.binaries.length > 0 ? this.binaries : undefined,
      version: this.versionNum !== 'latest' ? this.versionNum : undefined,
      shellConfigs: this.buildShellConfigs(),
      symlinks: this.symlinkPairs.length > 0 ? this.symlinkPairs : undefined,
      completions: this.completionSettings,
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
    return Boolean(
      this.currentInstallationMethod && this.currentInstallationMethod !== 'none' && this.currentInstallParams
    );
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
    const invalidMethodError = logs.config.error.invalid(
      'installationMethod',
      this.currentInstallationMethod ?? 'unknown',
      'github-release | brew | curl-script | curl-tar | manual'
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
      const requiredConfigError = logs.config.error.required(
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
      installationMethod: 'none',
      installParams: undefined,
    };
  }
}
