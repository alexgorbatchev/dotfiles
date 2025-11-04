import path from 'node:path';
import type { YamlConfig } from '@dotfiles/config';
import type { BaseInstallContext, InstallerPluginRegistry, SystemInfo, ToolConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { TrackedFileSystem } from '@dotfiles/registry/file';
import type { IToolInstallationRegistry } from '@dotfiles/registry/tool';
import { generateTimestamp, resolvePlatformConfig } from '@dotfiles/utils';
import type { IInstaller, InstallOptions, InstallResult } from './types';
import { HookExecutor, messages } from './utils';

/**
 * Orchestrates the tool installation process by coordinating services like `Downloader`,
 * `ArchiveExtractor`, and `GitHubApiClient`. It manages the entire lifecycle, including
 * directory setup, hooks, and artifact tracking.
 *
 * The installer determines the installation method from the `ToolConfig` and delegates
 * to the appropriate private method (e.g., `installFromGitHubRelease`).
 *
 * It is responsible for populating the `InstallResult` object with rich details.
 *
 * ### Public Installation Method Wrappers
 * The class exposes public methods for each installation type (e.g., `installFromGitHubRelease`,
 * `installFromBrew`) that wrap the corresponding standalone functions. These wrappers serve
 * important purposes:
 * - **Testing API**: Allow tests to focus on individual installation methods in isolation
 * - **Dependency Injection**: Properly inject all required services into standalone functions
 * - **Spying/Mocking**: Enable test spies and mocks on specific installation methods
 * - **API Consistency**: Provide uniform method signatures across all installation types
 *
 * ### GitHub Asset Selection
 * For `github-release` installations, the asset selection follows this order of precedence:
 * 1. **`assetSelector` function:** A custom function in the `ToolConfig` for complex selection logic.
 * 2. **`assetPattern` regex:** A regular expression to match against asset filenames.
 * 3. **Default Heuristics:** If the above are not provided, it attempts to find a suitable asset
 *    by matching common platform and architecture names (e.g., "darwin", "linux", "amd64")
 *    in the asset filenames.
 *
 * ### Installation Hooks
 * The installer supports several hooks defined in the `ToolConfig` to allow for
 * custom logic at various stages of the installation process:
 * - `beforeInstall`: Runs before any installation steps.
 * - `afterDownload`: Runs after the tool's asset has been downloaded.
 * - `afterExtract`: Runs after an archive has been extracted.
 * - `afterInstall`: Runs after the main installation process is complete.
 *
 * Each hook receives an `InstallHookContext` object with relevant paths and system info.
 */
export class Installer implements IInstaller {
  private readonly logger: TsLogger;
  private readonly fs: IFileSystem;
  private readonly appConfig: YamlConfig;
  private readonly hookExecutor: HookExecutor;
  private readonly toolInstallationRegistry: IToolInstallationRegistry;
  private readonly systemInfo: SystemInfo;
  private readonly registry: InstallerPluginRegistry;
  private currentToolConfig?: ToolConfig;

  constructor(
    parentLogger: TsLogger,
    fileSystem: IFileSystem,
    appConfig: YamlConfig,
    toolInstallationRegistry: IToolInstallationRegistry,
    systemInfo: SystemInfo,
    registry: InstallerPluginRegistry
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'Installer' });
    this.fs = fileSystem;
    this.appConfig = appConfig;
    this.hookExecutor = new HookExecutor(parentLogger);
    this.toolInstallationRegistry = toolInstallationRegistry;
    this.systemInfo = systemInfo;
    this.registry = registry;

    // Register event handler for installation events to execute hooks
    this.registry.onEvent(async (event) => {
      await this.handleInstallEvent(event);
    });
  }

  /**
   * Handle installation events by executing corresponding hooks
   */
  private async handleInstallEvent(event: {
    type: string;
    toolName: string;
    context: BaseInstallContext & Record<string, unknown>;
  }): Promise<void> {
    if (!this.currentToolConfig) {
      return;
    }

    const hooks = (this.currentToolConfig.installParams as Record<string, unknown>)?.['hooks'] as
      | Record<string, unknown>
      | undefined;
    if (!hooks) {
      return;
    }

    const hook = hooks[event.type];
    if (typeof hook !== 'function') {
      return;
    }

    // Create enhanced context with fileSystem from event
    const toolFs = (event.context['fileSystem'] as typeof this.fs) || this.fs;
    const enhancedContext = this.hookExecutor.createEnhancedContext(event.context, toolFs);

    // Execute the hook with the enhanced context
    // biome-ignore lint/suspicious/noExplicitAny: Hook type varies by event, runtime check ensures it's a function
    const result = await this.hookExecutor.executeHook(event.type, hook as any, enhancedContext);

    // If hook failed, throw error to propagate back to plugin
    if (!result.success) {
      const errorMessage = result.error ? `${event.type} hook failed: ${result.error}` : `Hook ${event.type} failed`;
      throw new Error(errorMessage);
    }
  }

  /**
   * Check if tool is already installed and skip installation if appropriate
   * Returns true if installation should be skipped
   */
  private async shouldSkipInstallation(
    toolName: string,
    resolvedToolConfig: ToolConfig,
    options: InstallOptions | undefined,
    parentLogger: TsLogger
  ): Promise<boolean> {
    const logger = parentLogger.getSubLogger({ name: 'shouldSkipInstallation' });
    if (options?.force) {
      return false;
    }

    const existingInstallation = await this.toolInstallationRegistry.getToolInstallation(toolName);
    if (!existingInstallation) {
      return false;
    }

    const targetVersion = await this.getTargetVersion(toolName, resolvedToolConfig);
    if (targetVersion && existingInstallation.version === targetVersion) {
      logger.debug(messages.outcome.installSuccess(toolName, targetVersion, 'already-installed'));
      return true;
    }

    logger.debug(messages.outcome.outdatedVersion(toolName, existingInstallation.version, targetVersion || 'unknown'));
    return false;
  }

  /**
   * Execute beforeInstall hook if defined
   */
  private async executeBeforeInstallHook(
    resolvedToolConfig: ToolConfig,
    context: BaseInstallContext,
    toolFs: IFileSystem,
    parentLogger: TsLogger
  ): Promise<InstallResult | null> {
    const logger = parentLogger.getSubLogger({ name: 'executeBeforeInstallHook' });
    if (!resolvedToolConfig.installParams?.hooks?.beforeInstall) {
      return null;
    }

    logger.debug(messages.lifecycle.hookExecution('beforeInstall'));
    const enhancedContext = this.hookExecutor.createEnhancedContext(context, toolFs);
    const result = await this.hookExecutor.executeHook(
      'beforeInstall',
      resolvedToolConfig.installParams.hooks.beforeInstall,
      enhancedContext
    );

    if (!result.success) {
      return {
        success: false,
        error: `beforeInstall hook failed: ${result.error}`,
      };
    }

    return null;
  }

  /**
   * Execute afterInstall hook if defined
   */
  private async executeAfterInstallHook(
    resolvedToolConfig: ToolConfig,
    context: BaseInstallContext,
    result: InstallResult,
    toolFs: IFileSystem,
    parentLogger: TsLogger
  ): Promise<void> {
    const logger = parentLogger.getSubLogger({ name: 'executeAfterInstallHook' });
    if (!resolvedToolConfig.installParams?.hooks?.afterInstall) {
      return;
    }

    logger.debug(messages.lifecycle.hookExecution('afterInstall'));

    const enhancedContext = this.hookExecutor.createEnhancedContext(context, toolFs);
    enhancedContext.binaryPath = result.success && result.binaryPaths.length > 0 ? result.binaryPaths[0] : undefined;
    enhancedContext.version = result.success && 'version' in result ? result.version : undefined;

    await this.hookExecutor.executeHook(
      'afterInstall',
      resolvedToolConfig.installParams.hooks.afterInstall,
      enhancedContext,
      { continueOnError: true }
    );
  }

  /**
   * Record successful installation in the registry
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex metadata extraction logic requires multiple conditionals
  private async recordInstallation(
    toolName: string,
    resolvedToolConfig: ToolConfig,
    context: BaseInstallContext,
    result: InstallResult,
    parentLogger: TsLogger
  ): Promise<void> {
    const logger = parentLogger.getSubLogger({ name: 'recordInstallation' });
    if (!result.success || !('version' in result)) {
      return;
    }

    try {
      let downloadUrl: string | undefined;
      let assetName: string | undefined;

      if (result.success && result.metadata) {
        const metadata: unknown = result.metadata;
        if (
          typeof metadata === 'object' &&
          metadata !== null &&
          'method' in metadata &&
          metadata.method === 'github-release'
        ) {
          if ('downloadUrl' in metadata && typeof metadata.downloadUrl === 'string') {
            downloadUrl = metadata.downloadUrl;
          }
          if ('assetName' in metadata && typeof metadata.assetName === 'string') {
            assetName = metadata.assetName;
          }
        } else if (
          typeof metadata === 'object' &&
          metadata !== null &&
          'method' in metadata &&
          metadata.method === 'cargo'
        ) {
          if ('downloadUrl' in metadata && typeof metadata.downloadUrl === 'string') {
            downloadUrl = metadata.downloadUrl;
          }
        }
      }

      const version = result.version;
      if (!version) {
        return;
      }

      const installParams: unknown = resolvedToolConfig.installParams;
      const configuredVersion: string | undefined =
        installParams &&
        typeof installParams === 'object' &&
        'version' in installParams &&
        typeof installParams.version === 'string'
          ? installParams.version
          : undefined;

      const originalTag: string | undefined =
        'originalTag' in result && typeof result.originalTag === 'string' ? result.originalTag : undefined;

      await this.toolInstallationRegistry.recordToolInstallation({
        toolName,
        version,
        installPath: context.installDir,
        timestamp: context.timestamp,
        binaryPaths: result.binaryPaths,
        downloadUrl,
        assetName,
        configuredVersion,
        originalTag,
      });
      logger.debug(messages.outcome.installSuccess(toolName, version, 'registry-recorded'));
    } catch (error) {
      logger.error(messages.outcome.installFailed('registry-record', toolName), error);
    }
  }

  /**
   * Execute the appropriate installation method
   */
  private async executeInstallationMethod(
    toolName: string,
    resolvedToolConfig: ToolConfig,
    context: BaseInstallContext,
    options?: InstallOptions,
    _logger?: TsLogger
  ): Promise<InstallResult> {
    const result = await this.registry.install(
      resolvedToolConfig.installationMethod,
      toolName,
      resolvedToolConfig,
      context,
      options
    );
    // The registry returns InstallResult<unknown>, but we know each plugin
    // returns a specific result type from the InstallResult union
    return result as InstallResult;
  }

  /**
   * Install a tool based on its configuration
   */
  async install(toolName: string, toolConfig: ToolConfig, options?: InstallOptions): Promise<InstallResult> {
    const logger = this.logger.getSubLogger({ name: 'install' });

    // Resolve platform-specific configuration
    const systemInfo = this.getSystemInfo();
    const resolvedToolConfig = resolvePlatformConfig(toolConfig, systemInfo);

    // Store current tool config for event handler access
    this.currentToolConfig = resolvedToolConfig;

    // Create a tool-specific TrackedFileSystem if we have a TrackedFileSystem instance
    const toolFs = this.fs instanceof TrackedFileSystem ? this.fs.withToolName(toolName) : this.fs;

    // Suppress logging in TrackedFileSystem if in shim mode
    if (options?.shimMode && toolFs instanceof TrackedFileSystem) {
      toolFs.setSuppressLogging(true);
    }

    try {
      // Check if tool is already installed (unless force option is used)
      const shouldSkip = await this.shouldSkipInstallation(toolName, resolvedToolConfig, options, logger);
      if (shouldSkip) {
        return {
          success: false,
          error: `Tool ${toolName} is already installed at the target version. Use --force to reinstall.`,
        };
      }

      // Create timestamped installation directory
      const binariesDir = path.join(this.appConfig.paths.generatedDir, 'binaries');
      const timestamp = generateTimestamp();
      const installDir = path.join(binariesDir, toolName, timestamp);

      await toolFs.ensureDir(installDir);
      logger.debug(messages.lifecycle.directoryCreated(installDir));

      // Create context for installation hooks
      const context = this.createBaseInstallContext(toolName, installDir, timestamp, resolvedToolConfig, logger);

      // Run beforeInstall hook if defined
      const beforeInstallResult = await this.executeBeforeInstallHook(resolvedToolConfig, context, toolFs, logger);
      if (beforeInstallResult) {
        return beforeInstallResult;
      }

      let result: InstallResult;
      try {
        // Install based on the installation method
        result = await this.executeInstallationMethod(toolName, resolvedToolConfig, context, options, logger);
      } catch (error) {
        // If installation method throws (e.g., from hook failure), create failure result
        result = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      // If installation failed, clean up the empty installation directory
      if (!result.success && (await toolFs.exists(installDir))) {
        logger.debug(messages.lifecycle.cleaningFailedInstallDir(installDir));
        await toolFs.rm(installDir, { recursive: true, force: true });

        // Also try to remove the parent tool directory if it's now empty
        const toolDir = path.dirname(installDir);
        try {
          const entries = await toolFs.readdir(toolDir);
          if (entries.length === 0) {
            await toolFs.rmdir(toolDir);
          }
        } catch {
          // Parent directory might not be empty or might not exist, which is fine
        }
      }

      // Run afterInstall hook if defined (runs even on failure for cleanup)
      await this.executeAfterInstallHook(resolvedToolConfig, context, result, toolFs, logger);

      // Record successful installation in the registry
      await this.recordInstallation(toolName, resolvedToolConfig, context, result, logger);

      return result;
    } catch (error) {
      logger.error(messages.outcome.installFailed('install', toolName), error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get the target version that would be installed for a tool.
   * For most installation methods, version resolution is handled by the plugins.
   * This method provides a simple fallback for version checking.
   */
  private async getTargetVersion(_toolName: string, toolConfig: ToolConfig): Promise<string | null> {
    // If the version is explicitly set and not 'latest', return it
    if (toolConfig.version && toolConfig.version !== 'latest') {
      return toolConfig.version;
    }
    // For 'latest' or unspecified versions, we can't determine the target version
    // without executing the plugin logic, so return null to skip the version check
    return null;
  }

  /**
   * Create a BaseInstallContext with all required properties from BaseToolContext
   */
  private createBaseInstallContext(
    toolName: string,
    installDir: string,
    timestamp: string,
    toolConfig: ToolConfig,
    parentLogger: TsLogger
  ): BaseInstallContext & { emitEvent?: (type: string, data: Record<string, unknown>) => Promise<void> } {
    const logger = parentLogger.getSubLogger({ name: 'createBaseInstallContext' });
    const getToolDir = (name: string): string => {
      return path.join(this.appConfig.paths.binariesDir, name);
    };

    return {
      toolName,
      installDir,
      timestamp,
      systemInfo: this.getSystemInfo(),
      toolConfig,
      appConfig: this.appConfig,
      // BaseToolContext properties
      toolDir: getToolDir(toolName),
      getToolDir,
      homeDir: this.appConfig.paths.homeDir,
      binDir: this.appConfig.paths.targetDir,
      shellScriptsDir: this.appConfig.paths.shellScriptsDir,
      dotfilesDir: this.appConfig.paths.dotfilesDir,
      generatedDir: this.appConfig.paths.generatedDir,
      logger: logger.getSubLogger({ name: `install-${toolName}` }),
      // Event emitter for plugins to trigger hooks
      emitEvent: async (type: string, data: Record<string, unknown>) => {
        await this.registry.emitEvent({
          type: type as 'afterDownload' | 'afterExtract',
          toolName,
          context: {
            ...this.createBaseInstallContext(toolName, installDir, timestamp, toolConfig, parentLogger),
            ...data,
          },
        });
      },
    };
  }

  /**
   * Get system information for architecture detection
   */
  private getSystemInfo(): SystemInfo {
    return this.systemInfo;
  }
}
