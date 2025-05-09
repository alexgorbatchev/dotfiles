import type {
  ToolConfigBuilder as IToolConfigBuilder,
  ToolConfig,
  InstallMethod,
  InstallParams,
  GithubReleaseInstallParams,
  BrewInstallParams,
  CurlScriptInstallParams,
  CurlTarInstallParams,
  PipInstallParams,
  ManualInstallParams,
  AsyncInstallHook,
} from './types';

export class ToolConfigBuilder implements IToolConfigBuilder {
  private partialConfig: {
    name?: string;
    binaries: string[];
    version: string;
    installMethod?: InstallMethod;
    installParams?: InstallParams;
    hooks?: {
      beforeInstall?: AsyncInstallHook;
      afterDownload?: AsyncInstallHook;
      afterExtract?: AsyncInstallHook;
      afterInstall?: AsyncInstallHook;
    };
    zshContent: string[];
    symlinks: { source: string; target: string }[];
    // Store arch-specific configurations separately to be resolved later
    archConfigs: Record<string, Partial<Omit<ToolConfig, 'name' | 'archOverrides'>>>;
  } = {
    binaries: [],
    version: 'latest', // Default version
    zshContent: [],
    symlinks: [],
    archConfigs: {},
  };
  private toolName: string;

  constructor(name: string) {
    this.toolName = name;
    this.partialConfig.name = name;
  }

  bin(names: string | string[]): this {
    this.partialConfig.binaries = Array.isArray(names) ? names.slice() : [names];
    return this;
  }

  version(version: string): this {
    this.partialConfig.version = version;
    return this;
  }

  // Overload signatures for type safety
  install(method: 'github-release', params: GithubReleaseInstallParams): this;
  install(method: 'brew', params: BrewInstallParams): this;
  install(method: 'curl-script', params: CurlScriptInstallParams): this;
  install(method: 'curl-tar', params: CurlTarInstallParams): this;
  install(method: 'pip', params: PipInstallParams): this;
  install(method: 'manual', params: ManualInstallParams): this;
  // Implementation
  install(method: InstallMethod, params: InstallParams): this {
    this.partialConfig.installMethod = method;
    this.partialConfig.installParams = { ...params };
    // Ensure hooks object exists on params if not provided, and also on partialConfig
    if (!this.partialConfig.installParams.hooks) {
      this.partialConfig.installParams.hooks = {};
    }
    if (!this.partialConfig.hooks) {
      this.partialConfig.hooks = {};
    }
    // Sync hooks from params to the top-level hooks property
    this.partialConfig.hooks = {
      ...this.partialConfig.hooks,
      ...this.partialConfig.installParams.hooks,
    };
    return this;
  }

  hooks(hooks: {
    beforeInstall?: AsyncInstallHook;
    afterDownload?: AsyncInstallHook;
    afterExtract?: AsyncInstallHook;
    afterInstall?: AsyncInstallHook;
  }): this {
    if (!this.partialConfig.installMethod) {
      throw new Error('Cannot call hooks() before install(). Define an installation method first.');
    }
    // Merge with existing hooks on partialConfig.hooks
    this.partialConfig.hooks = {
      ...(this.partialConfig.hooks || {}),
      ...hooks,
    };
    // Also update hooks within installParams if it exists
    if (this.partialConfig.installParams) {
      this.partialConfig.installParams.hooks = {
        ...(this.partialConfig.installParams.hooks || {}),
        ...hooks,
      };
    }
    return this;
  }

  zsh(code: string): this {
    this.partialConfig.zshContent.push(code.trim());
    return this;
  }

  symlink(source: string, target: string): this {
    this.partialConfig.symlinks.push({ source, target });
    return this;
  }

  arch(osArch: string, configureOverrides: (c: IToolConfigBuilder) => void): this {
    const overrideBuilder = new ToolConfigBuilder(`${this.toolName}-${osArch}`);
    configureOverrides(overrideBuilder);

    // Retrieve the partial config from the override builder
    const overridePartialConfig = overrideBuilder.getPartialConfig();

    // We want to store the *differences* or specific settings for this arch.
    // The getConfig method will handle merging these.
    this.partialConfig.archConfigs[osArch] = overridePartialConfig;
    return this;
  }

  // Helper to get the current partial config, used by arch method
  private getPartialConfig(): Partial<Omit<ToolConfig, 'name'>> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { name, archConfigs, ...rest } = this.partialConfig;
    return rest;
  }

  // Method to retrieve the fully built configuration
  // This should be called by the generator to get the final config object.
  getConfig(currentOsArch?: string): ToolConfig {
    if (!this.partialConfig.name) {
      throw new Error('Tool name must be set.');
    }

    let finalConfig: ToolConfig = {
      name: this.partialConfig.name,
      binaries:
        this.partialConfig.binaries.length > 0
          ? this.partialConfig.binaries
          : [this.partialConfig.name],
      version: this.partialConfig.version,
      installMethod: this.partialConfig.installMethod,
      installParams: this.partialConfig.installParams,
      hooks: this.partialConfig.hooks,
      zshContent: this.partialConfig.zshContent,
      symlinks: this.partialConfig.symlinks,
    };

    // Apply architecture-specific overrides if currentOsArch is provided and an override exists
    if (currentOsArch && this.partialConfig.archConfigs[currentOsArch]) {
      const archOverride = this.partialConfig.archConfigs[currentOsArch];
      finalConfig = {
        ...finalConfig,
        ...archOverride,
        // Ensure arrays are merged or replaced correctly if needed, for now, it's a shallow merge.
        // For instance, if archOverride has binaries, it replaces, not merges.
        // Hooks might need deeper merging if that's the desired behavior.
        hooks: { ...(finalConfig.hooks || {}), ...(archOverride.hooks || {}) },
        zshContent: archOverride.zshContent || finalConfig.zshContent, // Arch overrides if present
        symlinks: archOverride.symlinks || finalConfig.symlinks, // Arch overrides if present
      };
    }

    // Ensure installParams.hooks and top-level hooks are consistent
    if (finalConfig.installParams && finalConfig.hooks) {
      finalConfig.installParams.hooks = {
        ...(finalConfig.installParams.hooks || {}),
        ...finalConfig.hooks,
      };
    } else if (finalConfig.hooks) {
      // If installParams doesn't exist but top-level hooks do, this might be an issue
      // or imply manual installation where hooks are still relevant.
      // For now, we assume hooks are primarily tied to installParams.
    }

    return finalConfig;
  }
}
