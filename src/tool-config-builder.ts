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
  private config: Partial<ToolConfig> = {
    binaries: [],
    version: 'latest', // Default version
    symlinks: [],
    archOverrides: {},
  };
  private toolName: string;

  constructor(name: string) {
    this.toolName = name;
    this.config.name = name;
  }

  bin(names: string | string[]): this {
    this.config.binaries = Array.isArray(names) ? names.slice() : [names];
    return this;
  }

  version(version: string): this {
    this.config.version = version;
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
    this.config.installation = { method, params: { ...params } };
    // Ensure hooks object exists on params if not provided
    if (this.config.installation.params && !this.config.installation.params.hooks) {
      this.config.installation.params.hooks = {};
    }
    return this;
  }

  hooks(hooks: {
    beforeInstall?: AsyncInstallHook;
    afterDownload?: AsyncInstallHook;
    afterExtract?: AsyncInstallHook;
    afterInstall?: AsyncInstallHook;
  }): this {
    if (!this.config.installation) {
      // Initialize with a default or throw an error if install() must be called first
      // For now, let's assume a manual install if not specified, or require install() first.
      // Throwing an error might be safer to enforce proper usage.
      throw new Error('Cannot call hooks() before install(). Define an installation method first.');
    }
    // Merge with existing hooks, with new ones taking precedence
    this.config.installation.params.hooks = {
      ...(this.config.installation.params.hooks || {}),
      ...hooks,
    };
    return this;
  }

  zsh(code: string): this {
    this.config.zshInit = (this.config.zshInit || '') + code.trim() + '\n';
    return this;
  }

  symlink(source: string, target: string): this {
    if (!this.config.symlinks) {
      this.config.symlinks = [];
    }
    this.config.symlinks.push({ source, target });
    return this;
  }

  arch(osArch: string, configureOverrides: (c: IToolConfigBuilder) => void): this {
    // Create a new builder instance for the override.
    // Pass the original tool name to maintain context, or a derived name for clarity.
    const overrideBuilder = new ToolConfigBuilder(this.toolName); // Or `${this.toolName}-${osArch}`
    configureOverrides(overrideBuilder);

    if (!this.config.archOverrides) {
      this.config.archOverrides = {};
    }

    // Get the configuration from the override builder.
    // We need to exclude 'name' and 'archOverrides' from the override config itself
    // as they are contextual to the main config.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { name, archOverrides, ...overrideConfig } = overrideBuilder.getConfig();

    this.config.archOverrides[osArch] = overrideConfig;
    return this;
  }

  // Method to retrieve the fully built configuration
  // This should be called by the generator to get the final config object.
  getConfig(): ToolConfig {
    // Perform any final validation or default assignments here if needed
    if (!this.config.name) {
      throw new Error('Tool name must be set.');
    }
    if (this.config.binaries?.length === 0 && this.config.name) {
      // Default binary name to tool name if not specified
      this.config.binaries = [this.config.name];
    }

    return {
      name: this.config.name,
      binaries: this.config.binaries || [],
      version: this.config.version || 'latest',
      installation: this.config.installation,
      zshInit: this.config.zshInit,
      symlinks: this.config.symlinks || [],
      archOverrides: this.config.archOverrides || {},
    };
  }
}
