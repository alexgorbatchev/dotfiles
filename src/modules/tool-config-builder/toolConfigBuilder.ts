import { type TsLogger, logs } from '@modules/logger';
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
  PlatformConfigEntry,
  ShellScript,
  ToolConfig,
  ToolConfigBuilder as ToolConfigBuilderInterface,
  ToolConfigInstallationMethod,
  ToolConfigInstallParams,
  ToolConfigUpdateCheck,
  Platform,
} from '@types';

export class ToolConfigBuilder implements ToolConfigBuilderInterface {
  private logger: TsLogger;
  public toolName: string;
  public binaries: string[] = [];
  public versionNum: string = 'latest';
  public currentInstallationMethod?: ToolConfigInstallationMethod;
  public currentInstallParams?: ToolConfigInstallParams;
  public zshScripts: ShellScript[] = [];
  public bashScripts: ShellScript[] = [];
  public powershellScripts: ShellScript[] = [];
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

  bin(names: string | string[]): this {
    this.binaries = Array.isArray(names) ? names : [names];
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

  zsh(...scripts: ShellScript[]): this {
    this.zshScripts.push(...scripts);
    return this;
  }

  bash(...scripts: ShellScript[]): this {
    this.bashScripts.push(...scripts);
    return this;
  }

  powershell(...scripts: ShellScript[]): this {
    this.powershellScripts.push(...scripts);
    return this;
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
    const platformConfig = platformBuilder.build();

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
    // Always return a valid ToolConfig, even for platform scope
    const name = this.toolName;
    const binaries = this.binaries;
    const version = this.versionNum;
    const zshInit = this.zshScripts.length > 0 ? this.zshScripts : undefined;
    const bashInit = this.bashScripts.length > 0 ? this.bashScripts : undefined;
    const powershellInit = this.powershellScripts.length > 0 ? this.powershellScripts : undefined;
    const symlinks = this.symlinkPairs.length > 0 ? this.symlinkPairs : undefined;
    const completions = this.completionSettings;
    const updateCheck = this.updateCheckConfig;
    const platformConfigs = this.isPlatformScope
      ? undefined
      : this.platformConfigEntries.length > 0
        ? this.platformConfigEntries
        : undefined;

    if (
      this.currentInstallationMethod &&
      this.currentInstallationMethod !== 'none' &&
      this.currentInstallParams
    ) {
      // Discriminated union: must match the correct type for each installationMethod
      const base = {
        name,
        binaries: binaries && binaries.length > 0 ? binaries : [],
        version,
        zshInit,
        bashInit,
        powershellInit,
        symlinks,
        completions,
        updateCheck,
      };
      switch (this.currentInstallationMethod) {
        case 'github-release':
          return {
            ...base,
            installationMethod: 'github-release',
            installParams: this.currentInstallParams,
          } as GithubReleaseToolConfig;
        case 'brew':
          return {
            ...base,
            installationMethod: 'brew',
            installParams: this.currentInstallParams,
          } as BrewToolConfig;
        case 'curl-script':
          return {
            ...base,
            installationMethod: 'curl-script',
            installParams: this.currentInstallParams,
          } as CurlScriptToolConfig;
        case 'curl-tar':
          return {
            ...base,
            installationMethod: 'curl-tar',
            installParams: this.currentInstallParams,
          } as CurlTarToolConfig;
        case 'manual':
          return {
            ...base,
            installationMethod: 'manual',
            installParams: this.currentInstallParams,
          } as ManualToolConfig;
        default:
          const invalidMethodError = logs.config.error.invalid(
            'installationMethod',
            this.currentInstallationMethod!,
            'github-release | brew | curl-script | curl-tar | manual'
          );
          this.logger.error(invalidMethodError);
          throw new Error(invalidMethodError);
      }
    }

    const finalBinaries = binaries && binaries.length > 0 ? binaries : [];

    if (
      finalBinaries.length === 0 &&
      !zshInit &&
      !bashInit &&
      !powershellInit &&
      !symlinks &&
      (!platformConfigs || platformConfigs.length === 0)
    ) {
      const requiredConfigError = logs.config.error.required(
        'tool definition',
        `Tool "${name}" must define at least binaries, shell init scripts (zsh/bash/powershell), symlinks, or platformConfigs`
      );
      this.logger.error(requiredConfigError);
      throw new Error(requiredConfigError);
    }

    return {
      name,
      binaries: finalBinaries,
      version,
      zshInit,
      bashInit,
      powershellInit,
      symlinks,
      completions,
      updateCheck,
      platformConfigs,
      installationMethod: 'none',
      installParams: undefined,
    };
  }
}
