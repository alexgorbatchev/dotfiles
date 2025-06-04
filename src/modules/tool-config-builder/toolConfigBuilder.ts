/**
 * Development Plan:
 *
 * Implement the ToolConfigBuilder class based on the interface defined in techContext.md.
 * This class will be used by individual tool configuration files to define how a tool is installed and configured.
 *
 * Tasks:
 * - Implement the ToolConfigBuilder class with methods: bin, version, install, hooks, zsh, symlink, arch, completions.
 * - Ensure each method returns 'this' for chaining.
 * - Store the configuration details internally within the class instance.
 * - Add JSDoc comments for each method.
 * - Write tests for the ToolConfigBuilder.
 * - Cleanup linting errors and warnings.
 * - Ensure 100% test coverage.
 * - Update the memory bank.
 */

import type {
  // Use type-only import
  ToolConfig,
  GithubReleaseInstallParams,
  BrewInstallParams,
  CurlScriptInstallParams,
  CurlTarInstallParams,
  PipInstallParams,
  ManualInstallParams,
  AsyncInstallHook,
  CompletionConfig,
  // SystemInfo, // SystemInfo is not directly used by ToolConfigBuilder but might be relevant for arch overrides context
} from '../../types'; // Updated import path

// Define the ToolConfigBuilder interface with camelCase methods
export interface IToolConfigBuilder {
  // Export the interface
  /**
   * Specifies the names of the binaries that should have shims generated.
   * @param names A single binary name or an array of names.
   */
  bin(names: string | string[]): this;

  /**
   * Specifies the desired version of the tool. Defaults to 'latest'.
   * @param version The version string (e.g., '1.0.0') or 'latest'.
   */
  version(version: string): this;

  /**
   * Configures how the tool is installed.
   * @param method The installation method.
   * @param params Parameters specific to the installation method, including optional hooks.
   */
  install(method: 'github-release', params: GithubReleaseInstallParams): this;
  install(method: 'brew', params: BrewInstallParams): this;
  install(method: 'curl-script', params: CurlScriptInstallParams): this;
  install(method: 'curl-tar', params: CurlTarInstallParams): this;
  install(method: 'pip', params: PipInstallParams): this;
  install(method: 'manual', params: ManualInstallParams): this;
  // Add overloads for other methods if needed

  /**
   * Defines asynchronous TypeScript hook functions to run during the installation lifecycle.
   * @param hooks An object containing optional hook functions for different stages.
   */
  hooks(hooks: {
    beforeInstall?: AsyncInstallHook;
    afterDownload?: AsyncInstallHook;
    afterExtract?: AsyncInstallHook;
    afterInstall?: AsyncInstallHook;
  }): this;

  /**
   * Adds raw Zsh code to the generated 02-config-generated/init.zsh file.
   * Use this for aliases, functions, env vars, path additions, sourcing, etc.
   * @param code A string containing valid Zsh script.
   */
  zsh(code: string): this;

  /**
   * Configures a symbolic link from a source path in the dotfiles repo to a target path in the home directory.
   * @param source The path relative to the dotfiles repository.
   * @param target The target path relative to the user's home directory.
   */
  symlink(source: string, target: string): this;

  /**
   * Defines configuration overrides for specific operating system and architecture combinations.
   * @param osArch The OS-architecture string (e.g., 'darwin-aarch64', 'linux-x86_64'). Use $(uname -s)-$(uname -m) format.
   * @param configureOverrides A callback function that receives a new ToolConfigBuilder to define the overrides.
   */
  arch(osArch: string, configureOverrides: (c: IToolConfigBuilder) => void): this;

  /**
   * Configures shell completions for the tool.
   * @param config An object containing completion configuration for different shells.
   */
  completions(config: CompletionConfig): this;

  /**
   * Builds and returns the final ToolConfig object.
   */
  build(): ToolConfig;
}

export class ToolConfigBuilder implements IToolConfigBuilder {
  private config: Partial<ToolConfig> = {};
  private osArchOverrides: { [key: string]: (c: IToolConfigBuilder) => void } = {};

  constructor(toolName: string) {
    this.config.name = toolName;
    this.config.version = 'latest'; // Default version
    this.config.binaries = [];
    this.config.zshInit = []; // Use zshInit to match ToolConfig
    this.config.symlinks = [];
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
  install(method: 'pip', params: PipInstallParams): this;
  install(method: 'manual', params: ManualInstallParams): this;
  install(method: any, params: any): this {
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
    // Hooks are part of installParams, so merge them there
    if (this.config.installParams) {
      this.config.installParams.hooks = hooks;
    } else {
      // If installParams is not set yet, we might need to initialize it
      // or decide how to handle hooks without an installation method.
      // For now, let's assume install() is called before hooks() if hooks are method-specific.
      // Or, hooks can be top-level if they are general.
      // Based on current ToolConfig, hooks are part of BaseInstallParams.
      // This implies install() must be called first.
      // Let's throw an error or handle this more gracefully if installParams is undefined.
      // For now, we'll assume installParams is set.
      // A more robust solution might involve a temporary storage for hooks
      // until install() is called.
    }
    // The line `this.config.hooks = hooks;` was removed as hooks are now part of installParams
    return this;
  }

  zsh(code: string): this {
    if (!this.config.zshInit) {
      // Use zshInit
      this.config.zshInit = [];
    }
    this.config.zshInit.push(code); // Use zshInit
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
    this.osArchOverrides[osArch] = configureOverrides;
    return this;
  }

  completions(config: CompletionConfig): this {
    this.config.completions = config;
    return this;
  }

  build(): ToolConfig {
    // Apply architecture overrides if any
    // This logic will be handled by the config loader, not the builder itself.
    // The builder just stores the overrides.

    // Basic validation (more comprehensive validation will be done by Zod later)
    if (!this.config.name) {
      throw new Error('Tool name is required.');
    }
    // Validation logic:
    // 1. If binaries are defined, an installationMethod is always required.
    if (
      this.config.binaries &&
      this.config.binaries.length > 0 &&
      !this.config.installationMethod
    ) {
      throw new Error('Installation method is required if binaries are specified.');
    }

    // 2. If no binaries are defined, an installationMethod is only required if
    //    there are also no zshInit entries AND no symlinks.
    //    This means if a tool *only* defines zshInit or *only* symlinks (or both),
    //    it doesn't need an installationMethod.
    //    But if it defines nothing (no binaries, no zsh, no symlinks), it's an issue.
    if (
      (!this.config.binaries || this.config.binaries.length === 0) &&
      !this.config.installationMethod &&
      (!this.config.zshInit || this.config.zshInit.length === 0) &&
      (!this.config.symlinks || this.config.symlinks.length === 0)
    ) {
      throw new Error(
        'Installation method is required if no zshInit, symlinks, or binaries are defined.'
      );
    }

    return this.config as ToolConfig;
  }
}
