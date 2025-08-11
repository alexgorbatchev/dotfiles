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
  ShellConfig,
  ToolConfig,
  ToolConfigBuilder as ToolConfigBuilderInterface,
  ToolConfigInstallationMethod,
  ToolConfigInstallParams,
  ToolConfigUpdateCheck,
  Platform,
} from '@types';
import { always } from '@types';

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
  public zshAliases: Record<string, string> = {};
  public bashAliases: Record<string, string> = {};
  public powershellAliases: Record<string, string> = {};
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

  zsh(configOrScript: ShellConfig | ShellScript, ...additionalScripts: ShellScript[]): this {
    // Handle new API: ShellConfig object
    if (this.isShellConfig(configOrScript)) {
      if (configOrScript.shellInit) {
        this.zshScripts.push(...configOrScript.shellInit);
      }
      if (configOrScript.completions) {
        this.completionSettings = {
          ...this.completionSettings,
          zsh: configOrScript.completions,
        };
      }
      if (configOrScript.aliases) {
        this.zshAliases = { ...this.zshAliases, ...configOrScript.aliases };
      }
      return this;
    }
    
    // Handle old API: ShellScript arguments
    this.zshScripts.push(configOrScript, ...additionalScripts);
    return this;
  }

  bash(configOrScript: ShellConfig | ShellScript, ...additionalScripts: ShellScript[]): this {
    // Handle new API: ShellConfig object
    if (this.isShellConfig(configOrScript)) {
      if (configOrScript.shellInit) {
        this.bashScripts.push(...configOrScript.shellInit);
      }
      if (configOrScript.completions) {
        this.completionSettings = {
          ...this.completionSettings,
          bash: configOrScript.completions,
        };
      }
      if (configOrScript.aliases) {
        this.bashAliases = { ...this.bashAliases, ...configOrScript.aliases };
      }
      return this;
    }
    
    // Handle old API: ShellScript arguments
    this.bashScripts.push(configOrScript, ...additionalScripts);
    return this;
  }

  powershell(configOrScript: ShellConfig | ShellScript, ...additionalScripts: ShellScript[]): this {
    // Handle new API: ShellConfig object
    if (this.isShellConfig(configOrScript)) {
      if (configOrScript.shellInit) {
        this.powershellScripts.push(...configOrScript.shellInit);
      }
      if (configOrScript.completions) {
        this.completionSettings = {
          ...this.completionSettings,
          powershell: configOrScript.completions,
        };
      }
      if (configOrScript.aliases) {
        this.powershellAliases = { ...this.powershellAliases, ...configOrScript.aliases };
      }
      return this;
    }
    
    // Handle old API: ShellScript arguments
    this.powershellScripts.push(configOrScript, ...additionalScripts);
    return this;
  }

  private isShellConfig(value: ShellConfig | ShellScript): value is ShellConfig {
    return typeof value === 'object' && value !== null && !('__brand' in value);
  }

  private generateAliasScripts(aliases: Record<string, string>, shellType: 'zsh' | 'bash' | 'powershell'): ShellScript | undefined {
    const aliasEntries = Object.entries(aliases);
    if (aliasEntries.length === 0) {
      return undefined;
    }

    let aliasScript: string;
    if (shellType === 'powershell') {
      // PowerShell uses Set-Alias
      aliasScript = aliasEntries
        .map(([name, command]) => `Set-Alias ${name} "${command}"`)
        .join('\n');
    } else {
      // Zsh and Bash use the same alias syntax
      aliasScript = aliasEntries
        .map(([name, command]) => `alias ${name}="${command}"`)
        .join('\n');
    }

    // Create a branded script with always timing
    return always`${aliasScript}`;
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
    // Combine manual shell scripts with generated alias scripts
    const zshAliasScript = this.generateAliasScripts(this.zshAliases, 'zsh');
    const bashAliasScript = this.generateAliasScripts(this.bashAliases, 'bash');
    const powershellAliasScript = this.generateAliasScripts(this.powershellAliases, 'powershell');
    
    const zshInit = [
      ...(zshAliasScript ? [zshAliasScript] : []),
      ...this.zshScripts
    ].length > 0 ? [
      ...(zshAliasScript ? [zshAliasScript] : []),
      ...this.zshScripts
    ] : undefined;
    
    const bashInit = [
      ...(bashAliasScript ? [bashAliasScript] : []),
      ...this.bashScripts
    ].length > 0 ? [
      ...(bashAliasScript ? [bashAliasScript] : []),
      ...this.bashScripts
    ] : undefined;
    
    const powershellInit = [
      ...(powershellAliasScript ? [powershellAliasScript] : []),
      ...this.powershellScripts
    ].length > 0 ? [
      ...(powershellAliasScript ? [powershellAliasScript] : []),
      ...this.powershellScripts
    ] : undefined;
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
