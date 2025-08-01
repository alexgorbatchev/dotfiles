/**
 * Development Plan:
 *
 * Implement the ToolConfigBuilder class based on the interface defined in techContext.md.
 * This class will be used by individual tool configuration files to define how a tool is installed and configured.
 *
 * Tasks:
 * - [x] Implement the ToolConfigBuilder class with methods: bin, version, install, hooks, zsh, symlink, platform, completions.
 * - [x] Ensure each method returns 'this' for chaining.
 * - [x] Store the configuration details internally within the class instance.
 * - [x] Add JSDoc comments for each method.
 * - [x] Write tests for the ToolConfigBuilder.
 * - [x] Cleanup linting errors and warnings.
 * - [x] Ensure 100% test coverage.
 * - [x] Remove all commented out code and meta-comments.
 * - [ ] Update the memory bank.
 */

import { type TsLogger } from '@modules/logger';
import type {
  Architecture,
  AsyncInstallHook,
  BrewInstallParams,
  CompletionConfig,
  CurlScriptInstallParams,
  CurlTarInstallParams,
  GithubReleaseInstallParams,
  ManualInstallParams,
  PlatformConfigEntry,
  ToolConfig,
  ToolConfigBuilder as ToolConfigBuilderInterface,
  ToolConfigInstallationMethod,
  ToolConfigInstallParams,
  ToolConfigUpdateCheck,
  Platform,
} from '@types';
import { ErrorTemplates, WarningTemplates } from '@modules/shared/ErrorTemplates';

export class ToolConfigBuilder implements ToolConfigBuilderInterface {
  private logger: TsLogger;
  private toolName: string;
  private binaries: string[] = [];
  private versionNum: string = 'latest';
  private currentInstallationMethod?: ToolConfigInstallationMethod;
  private currentInstallParams?: ToolConfigInstallParams;
  private zshScripts: string[] = [];
  private symlinkPairs: { source: string; target: string }[] = [];
  private completionSettings?: CompletionConfig;
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
        WarningTemplates.config.ignored(
          'hooks',
          `hooks() called for tool "${this.toolName}" before install(). Hooks will not be set as install() was not called first.`
        )
      );
    }
    return this;
  }

  zsh(code: string): this {
    this.zshScripts.push(code);
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
        const missingCallbackError = ErrorTemplates.config.required(
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
        symlinks,
        completions,
        updateCheck,
      };
      switch (this.currentInstallationMethod) {
        case 'github-release':
          return {
            ...base,
            installationMethod: 'github-release',
            installParams: this.currentInstallParams as GithubReleaseInstallParams,
          };
        case 'brew':
          return {
            ...base,
            installationMethod: 'brew',
            installParams: this.currentInstallParams as BrewInstallParams,
          };
        case 'curl-script':
          return {
            ...base,
            installationMethod: 'curl-script',
            installParams: this.currentInstallParams as CurlScriptInstallParams,
          };
        case 'curl-tar':
          return {
            ...base,
            installationMethod: 'curl-tar',
            installParams: this.currentInstallParams as CurlTarInstallParams,
          };
        case 'manual':
          return {
            ...base,
            installationMethod: 'manual',
            installParams: this.currentInstallParams as ManualInstallParams,
          };
        default:
          const invalidMethodError = ErrorTemplates.config.invalid(
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
      !symlinks &&
      (!platformConfigs || platformConfigs.length === 0)
    ) {
      const requiredConfigError = ErrorTemplates.config.required(
        'tool definition',
        `Tool "${name}" must define at least binaries, zshInit, symlinks, or platformConfigs`
      );
      this.logger.error(requiredConfigError);
      throw new Error(requiredConfigError);
    }

    return {
      name,
      binaries: finalBinaries,
      version,
      zshInit,
      symlinks,
      completions,
      updateCheck,
      platformConfigs,
      installationMethod: 'none',
      installParams: undefined,
    };
  }
}
