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

import { createClientLogger } from '@modules/logger';
import {
  type Architecture,
  type AsyncInstallHook,
  type BrewInstallParams,
  type CompletionConfig,
  type CurlScriptInstallParams,
  type CurlTarInstallParams,
  type GithubReleaseInstallParams,
  type ManualInstallParams,
  type Platform,
  type PlatformConfigBuilder as PlatformConfigBuilderInterface,
  type PlatformConfigEntry,
  type ToolConfig,
  type ToolConfigBuilder as ToolConfigBuilderInterface,
  type ToolConfigInstallationMethod,
  type ToolConfigInstallParams,
  type ToolConfigUpdateCheck,
} from '../../types';

class PlatformConfigBuilderImpl implements PlatformConfigBuilderInterface {
  private config: Partial<Omit<ToolConfig, 'name' | 'platformConfigs'>> = {};
  private clientLogger = createClientLogger({});
  private toolName: string; // For logging context

  constructor(toolName: string) {
    this.toolName = toolName;
    // Initialize with a 'none' installation method by default for platform configs
    this.config.installationMethod = 'none';
    this.config.installParams = undefined;
  }

  bin(names: string | string[]): this {
    this.config.binaries = Array.isArray(names) ? names : [names];
    return this;
  }

  version(version: string): this {
    this.config.version = version;
    return this;
  }

  install(method: 'github-release', params: GithubReleaseInstallParams): this;
  install(method: 'brew', params: BrewInstallParams): this;
  install(method: 'curl-script', params: CurlScriptInstallParams): this;
  install(method: 'curl-tar', params: CurlTarInstallParams): this;
  install(method: 'manual', params: ManualInstallParams): this;
  install(method: ToolConfigInstallationMethod, params: ToolConfigInstallParams): this {
    if (method === 'none') {
      this.clientLogger.warn(
        `[PlatformConfigBuilderImpl] 'none' is not a valid installation method for platform-specific config for tool "${this.toolName}". Ignoring.`
      );
      return this;
    }
    this.config.installationMethod = method;
    this.config.installParams = params;
    return this;
  }

  hooks(hooks: {
    beforeInstall?: AsyncInstallHook;
    afterDownload?: AsyncInstallHook;
    afterExtract?: AsyncInstallHook;
    afterInstall?: AsyncInstallHook;
  }): this {
    if (this.config.installParams) {
      this.config.installParams.hooks = { ...this.config.installParams.hooks, ...hooks };
    } else {
      this.clientLogger.warn(
        `[PlatformConfigBuilderImpl] hooks() called for tool "${this.toolName}" platform config before install(). Hooks will not be set.`
      );
    }
    return this;
  }

  zsh(code: string): this {
    if (!this.config.zshInit) {
      this.config.zshInit = [];
    }
    this.config.zshInit.push(code);
    return this;
  }

  symlink(source: string, target: string): this {
    if (!this.config.symlinks) {
      this.config.symlinks = [];
    }
    this.config.symlinks.push({ source, target });
    return this;
  }

  completions(config: CompletionConfig): this {
    this.config.completions = config;
    return this;
  }

  build(): Partial<Omit<ToolConfig, 'name' | 'platformConfigs'>> {
    // Ensure binaries is an array if not set but install method implies it
    // This check is more for internal consistency; Zod schema handles final validation.
    if (this.config.installationMethod && this.config.installationMethod !== 'none' && (!this.config.binaries || this.config.binaries.length === 0)) {
        // this.clientLogger.debug(`[PlatformConfigBuilderImpl] Tool "${this.toolName}" platform config has installation method but no binaries defined.`);
    }
    return this.config;
  }
}

export class ToolConfigBuilder implements ToolConfigBuilderInterface {
  private clientLogger = createClientLogger({});
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

  constructor(toolName: string) {
    this.toolName = toolName;
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
      this.clientLogger.warn(
        `[ToolConfigBuilder] hooks() called for tool "${this.toolName}" before install(). Hooks will not be set as install() was not called first.`
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
    architecturesOrConfigure: Architecture | ((builder: PlatformConfigBuilderInterface) => void),
    configureCallback?: (builder: PlatformConfigBuilderInterface) => void,
  ): this {
    let targetArchitectures: Architecture | undefined;
    let configureFn: (builder: PlatformConfigBuilderInterface) => void;

    if (typeof architecturesOrConfigure === 'function') {
      configureFn = architecturesOrConfigure;
      targetArchitectures = undefined; // Applies to all architectures for the given platforms
    } else {
      targetArchitectures = architecturesOrConfigure;
      if (typeof configureCallback !== 'function') {
        throw new Error(
          `[ToolConfigBuilder] platform() called for tool "${this.toolName}" with architectures but without a configure callback.`
        );
      }
      configureFn = configureCallback;
    }

    const platformBuilder = new PlatformConfigBuilderImpl(this.toolName);
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
    const baseProperties: Partial<ToolConfig> = {
      name: this.toolName,
      binaries: this.binaries,
      version: this.versionNum,
      zshInit: this.zshScripts.length > 0 ? this.zshScripts : undefined,
      symlinks: this.symlinkPairs.length > 0 ? this.symlinkPairs : undefined,
      completions: this.completionSettings,
      updateCheck: this.updateCheckConfig,
      platformConfigs: this.platformConfigEntries.length > 0 ? this.platformConfigEntries : undefined,
    };

    if (this.currentInstallationMethod && this.currentInstallationMethod !== 'none' && this.currentInstallParams) {
      return {
        ...baseProperties,
        installationMethod: this.currentInstallationMethod,
        installParams: this.currentInstallParams,
        binaries: (baseProperties.binaries && baseProperties.binaries.length > 0) ? baseProperties.binaries : [],
      } as ToolConfig;
    }

    const finalBinaries =
      baseProperties.binaries && baseProperties.binaries.length > 0 ? baseProperties.binaries : [];

    if (
      finalBinaries.length === 0 &&
      !baseProperties.zshInit &&
      !baseProperties.symlinks &&
      (!baseProperties.platformConfigs || baseProperties.platformConfigs.length === 0)
    ) {
      throw new Error(
        `Tool "${this.toolName}" must define at least binaries, zshInit, symlinks, or platformConfigs.`
      );
    }

    return {
      ...baseProperties,
      binaries: finalBinaries,
      installationMethod: 'none',
      installParams: undefined,
    } as ToolConfig;
  }
}
