import path from 'node:path';
import type { YamlConfig } from '@dotfiles/config';
import type {
  AsyncInstallHook,
  BaseInstallContext,
  InstallerPluginRegistry,
  SystemInfo,
  ToolConfig,
} from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { TrackedFileSystem } from '@dotfiles/registry/file';
import type { IToolInstallationRegistry } from '@dotfiles/registry/tool';
import { generateTimestamp, resolvePlatformConfig } from '@dotfiles/utils';
import type { IInstaller, InstallOptions, InstallResult } from './types';
import { HookExecutor, messages } from './utils';

/**
 * Orchestrates the tool installation process by delegating to plugin-based installation methods
 * registered in the `InstallerPluginRegistry`. Manages the entire installation lifecycle including
 * timestamped directory creation, hook execution, installation tracking, and cleanup.
 *
 * ### Installation Flow
 * 1. Resolves platform-specific configuration using `resolvePlatformConfig`
 * 2. Creates tool-specific file system instance for tracking
 * 3. Checks if tool is already installed (unless force option is used)
 * 4. Creates timestamped installation directory (e.g., `binaries/toolname/2025-11-05-12-34-56`)
 * 5. Executes beforeInstall hook if defined
 * 6. Delegates to plugin for actual installation via `registry.install()`
 * 7. Cleans up failed installations by removing empty directories
 * 8. Executes afterInstall hook if defined
 * 9. Records successful installation in tool installation registry
 *
 * ### Plugin System Integration
 * The installer acts as an orchestrator that coordinates with the plugin registry:
 * - Determines installation method from `toolConfig.installationMethod`
 * - Delegates to appropriate plugin via `registry.install()`
 * - Plugins handle method-specific logic (GitHub releases, Homebrew, Cargo, etc.)
 * - Plugins emit events that trigger corresponding hooks
 *
 * ### Hook Execution
 * Hooks are executed at different stages of installation:
 * - `beforeInstall`: Before any installation steps begin
 * - `afterDownload`: After asset download (emitted by plugins)
 * - `afterExtract`: After archive extraction (emitted by plugins)
 * - `afterInstall`: After installation completes successfully or fails
 *
 * The installer registers an event handler with the plugin registry to execute hooks
 * when plugins emit installation events. Hook execution uses `HookExecutor` for proper
 * error handling, timeouts, and context management.
 *
 * ### File System Tracking
 * Uses `TrackedFileSystem` to track all file operations performed during installation.
 * This enables the registry to record which files belong to which tools for proper
 * management and cleanup. Logging can be suppressed in shim mode.
 *
 * ### Installation Registry
 * Records successful installations with metadata including:
 * - Tool name and version
 * - Installation path and timestamp
 * - Binary paths created
 * - Download URL and asset name (when applicable)
 * - Configured version and original tag (when applicable)
 *
 * ### Error Handling and Cleanup
 * - Failed installations trigger cleanup of empty directories
 * - afterInstall hook runs even on failure for cleanup tasks
 * - Errors are logged with context and returned in InstallResult
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
   * Type guard that validates if a value is an AsyncInstallHook function.
   * Used to safely access hook functions from tool configuration before execution.
   *
   * @param value - Unknown value to check
   * @returns True if value is a function (AsyncInstallHook), false otherwise
   */
  private isAsyncInstallHook(value: unknown): value is AsyncInstallHook {
    return typeof value === 'function';
  }

  /**
   * Handles installation events emitted by plugins by executing corresponding hooks.
   * Registered with the plugin registry during constructor initialization.
   *
   * Flow:
   * 1. Checks if current tool config exists
   * 2. Extracts hooks from tool config install params
   * 3. Finds hook function matching event type (e.g., 'afterDownload')
   * 4. Creates enhanced context with file system from event
   * 5. Executes hook with proper error handling
   * 6. Throws error if hook fails to propagate back to plugin
   *
   * @param event - Installation event containing type, tool name, and context
   * @throws Error if hook execution fails
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
    if (!this.isAsyncInstallHook(hook)) {
      return;
    }

    // Create enhanced context with fileSystem from event
    const toolFs = (event.context['fileSystem'] as typeof this.fs) || this.fs;
    const enhancedContext = this.hookExecutor.createEnhancedContext(event.context, toolFs);

    // Execute the hook with the enhanced context
    const result = await this.hookExecutor.executeHook(event.type, hook, enhancedContext);

    // If hook failed, throw error to propagate back to plugin
    if (!result.success) {
      const errorMessage = result.error ? `${event.type} hook failed: ${result.error}` : `Hook ${event.type} failed`;
      throw new Error(errorMessage);
    }
  }

  /**
   * Determines if installation should be skipped based on existing installation and version.
   * Returns true when tool is already installed at target version and force option is not used.
   *
   * Logic:
   * 1. Returns false if force option is enabled (always install)
   * 2. Queries tool installation registry for existing installation
   * 3. Returns false if tool is not currently installed
   * 4. Gets target version from resolved tool config
   * 5. Compares existing version with target version
   * 6. Returns true if versions match (skip installation)
   * 7. Returns false if versions differ (outdated, needs update)
   *
   * @param toolName - Name of the tool to check
   * @param resolvedToolConfig - Platform-resolved tool configuration
   * @param options - Installation options (checks force flag)
   * @param parentLogger - Logger for diagnostic messages
   * @returns True if installation should be skipped, false otherwise
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
   * Executes the beforeInstall hook if defined in tool configuration.
   * Returns InstallResult with failure if hook fails, null if hook succeeds or doesn't exist.
   *
   * The beforeInstall hook runs before any installation steps and can be used for:
   * - Pre-installation validation
   * - Environment setup
   * - Custom preparation tasks
   *
   * @param resolvedToolConfig - Platform-resolved tool configuration with hooks
   * @param context - Base install context with paths and system info
   * @param toolFs - Tool-specific file system instance for tracking
   * @param parentLogger - Logger for hook execution messages
   * @returns Null if hook succeeds or doesn't exist, InstallResult with error on failure
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
      const failureResult: InstallResult = {
        success: false,
        error: `beforeInstall hook failed: ${result.error}`,
      };
      return failureResult;
    }

    return null;
  }

  /**
   * Executes the afterInstall hook if defined in tool configuration.
   * Runs regardless of installation success or failure to allow cleanup tasks.
   * Uses continueOnError option so hook failures don't stop the installation flow.
   *
   * The afterInstall hook receives enhanced context including:
   * - binaryPath: Path to first binary if installation succeeded
   * - version: Installed version if installation succeeded
   *
   * Common uses:
   * - Post-installation configuration
   * - Cleanup of temporary files
   * - Additional binary setup
   * - Environment modifications
   *
   * @param resolvedToolConfig - Platform-resolved tool configuration with hooks
   * @param context - Base install context with paths and system info
   * @param result - Installation result with success status and binary paths
   * @param toolFs - Tool-specific file system instance for tracking
   * @param parentLogger - Logger for hook execution messages
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
   * Records successful installation in the tool installation registry with comprehensive metadata.
   * Only records when installation succeeds and version information is available.
   *
   * Extracts and stores metadata based on installation method:
   * - github-release: downloadUrl, assetName
   * - cargo: downloadUrl
   * - Other methods: basic installation info
   *
   * Recorded information includes:
   * - Tool name and installed version
   * - Installation path and timestamp
   * - Binary paths created
   * - Download URL (if applicable)
   * - Asset name (if applicable)
   * - Configured version from tool config
   * - Original tag from release (if applicable)
   *
   * @param toolName - Name of the installed tool
   * @param resolvedToolConfig - Platform-resolved tool configuration
   * @param context - Base install context with paths
   * @param result - Installation result with success status and metadata
   * @param parentLogger - Logger for registry operations
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: metadata extraction logic requires checking multiple installation methods
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
   * Delegates installation to the appropriate plugin based on installation method.
   * Calls `registry.install()` which routes to the registered plugin for the method.
   * The plugin returns a result that conforms to the InstallResult union type.
   *
   * @param toolName - Name of the tool being installed
   * @param resolvedToolConfig - Platform-resolved tool configuration
   * @param context - Base install context with paths and system info
   * @param options - Installation options (force, quiet, verbose, shimMode)
   * @param _logger - Unused logger parameter (plugins use context.logger)
   * @returns Installation result from the plugin
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
   * Installs a tool based on its configuration through a multi-stage process.
   * Main entry point that coordinates the entire installation flow.
   *
   * @param toolName - Name of the tool to install
   * @param toolConfig - Tool configuration with installation method and parameters
   * @param options - Optional installation options (force, quiet, verbose, shimMode)
   * @returns Installation result with success status, binary paths, version, and metadata
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multiple stages require sequential checks
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
        const skipResult: InstallResult = {
          success: false,
          error: `Tool ${toolName} is already installed at the target version. Use --force to reinstall.`,
        };
        return skipResult;
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
      const errorResult: InstallResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      return errorResult;
    }
  }

  /**
   * Determines the target version that would be installed for a tool.
   * Used by `shouldSkipInstallation` to compare with existing installation.
   *
   * Logic:
   * - Returns explicit version if set and not 'latest'
   * - Returns null for 'latest' or unspecified (requires plugin execution to determine)
   *
   * Most version resolution is handled by plugins during actual installation.
   * This method provides a quick check for explicit version matches.
   *
   * @param _toolName - Tool name (unused, reserved for future use)
   * @param toolConfig - Tool configuration with version information
   * @returns Target version string or null if cannot be determined without plugin execution
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
   * Creates a complete BaseInstallContext with all required properties for installation.
   * Includes properties from BaseToolContext plus installation-specific fields.
   *
   * The context provides plugins with:
   * - Tool identification (toolName)
   * - Directory paths (installDir, toolDir, binDir, etc.)
   * - System information (platform, arch)
   * - Application configuration
   * - Logger instance
   * - Helper functions (getToolDir)
   * - Event emitter for triggering hooks
   *
   * @param toolName - Name of the tool being installed
   * @param installDir - Timestamped installation directory path
   * @param timestamp - Installation timestamp string
   * @param toolConfig - Tool configuration
   * @param parentLogger - Parent logger for creating context logger
   * @returns Complete install context with all required properties and event emitter
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

    const context: BaseInstallContext & { emitEvent?: (type: string, data: Record<string, unknown>) => Promise<void> } =
      {
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
    return context;
  }

  /**
   * Returns the system information used for platform-specific configuration resolution.
   * Provides platform and architecture details needed for asset selection and binary matching.
   *
   * @returns System information with platform and architecture
   */
  private getSystemInfo(): SystemInfo {
    return this.systemInfo;
  }
}
