import path from 'node:path';
import type { ProjectConfig } from '@dotfiles/config';
import type {
  AsyncInstallHook,
  BaseInstallContext,
  InstallerPluginRegistry,
  PluginEmittedHookEvent,
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
  private readonly projectConfig: ProjectConfig;
  private readonly hookExecutor: HookExecutor;
  private readonly toolInstallationRegistry: IToolInstallationRegistry;
  private readonly systemInfo: SystemInfo;
  private readonly registry: InstallerPluginRegistry;
  private currentToolConfig?: ToolConfig;

  constructor(
    parentLogger: TsLogger,
    fileSystem: IFileSystem,
    projectConfig: ProjectConfig,
    toolInstallationRegistry: IToolInstallationRegistry,
    systemInfo: SystemInfo,
    registry: InstallerPluginRegistry
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'Installer' });
    this.fs = fileSystem;
    this.projectConfig = projectConfig;
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
   * Handles installation events emitted by plugins by executing corresponding hooks.
   * Registered with the plugin registry during constructor initialization.
   *
   * Flow:
   * 1. Checks if current tool config exists
   * 2. Extracts hooks from tool config install params
   * 3. Maps plugin event names to hook keys
   * 4. Finds hook function array matching the key
   * 5. Creates enhanced context with file system from event
   * 6. Executes hook(s) with proper error handling
   * 7. Throws error if hook execution fails to propagate back to plugin
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

    const hooks = this.currentToolConfig['installParams']?.['hooks'] as Record<string, AsyncInstallHook[]> | undefined;
    if (!hooks) {
      return;
    }

    const hookArray = hooks[event.type];
    if (!hookArray) {
      return;
    }

    // Create enhanced context with fileSystem from event
    const toolFs = (event.context['fileSystem'] as typeof this.fs) || this.fs;
    const enhancedContext = this.hookExecutor.createEnhancedContext(event.context, toolFs);

    // Execute all hooks in sequence
    for (const hook of hookArray) {
      const result = await this.hookExecutor.executeHook(event.type, hook, enhancedContext);

      // If hook failed, throw error to propagate back to plugin
      if (!result.success) {
        const errorMessage = result.error ? `${event.type} hook failed: ${result.error}` : `Hook ${event.type} failed`;
        throw new Error(errorMessage);
      }
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
    const hooks = resolvedToolConfig['installParams']?.['hooks'] as Record<string, AsyncInstallHook[]> | undefined;
    const beforeInstallHooks = hooks?.['before-install'];

    if (!beforeInstallHooks) {
      return null;
    }

    logger.debug(messages.lifecycle.hookExecution('before-install'));
    const enhancedContext = this.hookExecutor.createEnhancedContext(context, toolFs);

    // Execute all hooks in sequence
    for (const hook of beforeInstallHooks) {
      const result = await this.hookExecutor.executeHook('before-install', hook, enhancedContext);

      if (!result.success) {
        const failureResult: InstallResult = {
          success: false,
          error: `beforeInstall hook failed: ${result.error}`,
        };
        return failureResult;
      }
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
    const hooks = resolvedToolConfig['installParams']?.['hooks'] as Record<string, AsyncInstallHook[]> | undefined;
    const afterInstallHooks = hooks?.['after-install'];

    if (!afterInstallHooks) {
      return;
    }

    logger.debug(messages.lifecycle.hookExecution('after-install'));

    const enhancedContext = this.hookExecutor.createEnhancedContext(context, toolFs);
    enhancedContext.binaryPath = result.success && result.binaryPaths.length > 0 ? result.binaryPaths[0] : undefined;
    enhancedContext.version = result.success && 'version' in result ? result.version : undefined;

    // Execute all hooks in sequence
    for (const hook of afterInstallHooks) {
      await this.hookExecutor.executeHook('after-install', hook, enhancedContext, { continueOnError: true });
    }
  }

  /**
   * Records successful installation in the tool installation registry.
   * Only records when installation succeeds and version information is available.
   *
   * Combines base installation details with plugin-specific metadata:
   * - Base fields: toolName, version, installPath, timestamp, binaryPaths, configuredVersion, originalTag
   * - Plugin metadata: Spread from result.metadata (plugins extending Partial<ToolInstallationDetails>)
   *
   * The Installer is plugin-agnostic and simply spreads whatever metadata the plugin provides.
   * Plugins can include optional fields like downloadUrl, assetName, or any method-specific data.
   *
   * @param toolName - Name of the installed tool
   * @param resolvedToolConfig - Platform-resolved tool configuration
   * @param context - Base install context with paths
   * @param result - Installation result with success status and metadata
   * @param parentLogger - Logger for registry operations
   * @see {@link ToolInstallationDetails} for the complete field structure
   */
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
      const version = result.version;
      if (!version) {
        return;
      }

      // Extract configured version from tool config
      const installParams: unknown = resolvedToolConfig.installParams;
      const configuredVersion: string | undefined =
        installParams &&
        typeof installParams === 'object' &&
        'version' in installParams &&
        typeof installParams.version === 'string'
          ? installParams.version
          : undefined;

      // Extract original tag if provided by plugin
      const originalTag: string | undefined =
        'originalTag' in result && typeof result.originalTag === 'string' ? result.originalTag : undefined;

      // Spread metadata - installers now extend ToolInstallationDetails so they provide the right fields
      await this.toolInstallationRegistry.recordToolInstallation({
        toolName,
        version,
        installPath: context.installDir,
        timestamp: context.timestamp,
        binaryPaths: result.binaryPaths,
        configuredVersion,
        originalTag,
        ...(result.metadata as unknown as Record<string, unknown>),
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
          installationMethod: resolvedToolConfig.installationMethod,
        };
        return skipResult;
      }

      // Check if plugin is externally managed (e.g., Homebrew, apt)
      const plugin = this.registry.get(resolvedToolConfig.installationMethod);
      const isExternallyManaged: boolean = plugin?.externallyManaged === true;

      // Create timestamped installation directory (skip for externally managed plugins)
      const binariesDir = path.join(this.projectConfig.paths.generatedDir, 'binaries');
      const timestamp = generateTimestamp();
      const installDir: string = isExternallyManaged ? '' : path.join(binariesDir, toolName, timestamp);

      if (!isExternallyManaged) {
        await toolFs.ensureDir(installDir);
        logger.debug(messages.lifecycle.directoryCreated(installDir));
      }

      // Create context for installation hooks
      const { context, logger: contextLogger } = this.createBaseInstallContext(
        toolName,
        installDir,
        timestamp,
        resolvedToolConfig,
        logger
      );

      // Run beforeInstall hook if defined
      const beforeInstallResult = await this.executeBeforeInstallHook(
        resolvedToolConfig,
        context,
        toolFs,
        contextLogger
      );
      if (beforeInstallResult) {
        return beforeInstallResult;
      }

      let result: InstallResult;
      try {
        // Install based on the installation method
        result = await this.executeInstallationMethod(toolName, resolvedToolConfig, context, options, contextLogger);
      } catch (error) {
        // If installation method throws (e.g., from hook failure), create failure result
        result = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }

      // Add the resolved installation method to the result
      result.installationMethod = resolvedToolConfig.installationMethod;

      // For externally managed tools, create symlinks to the actual binaries
      if (isExternallyManaged && result.success && result.binaryPaths) {
        await this.createExternalBinarySymlinks(toolName, result.binaryPaths, toolFs, logger);
      }

      // If installation failed, clean up the empty installation directory (skip for externally managed)
      if (!isExternallyManaged && !result.success && (await toolFs.exists(installDir))) {
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
      await this.executeAfterInstallHook(resolvedToolConfig, context, result, toolFs, contextLogger);

      // Record successful installation in the registry
      await this.recordInstallation(toolName, resolvedToolConfig, context, result, contextLogger);

      return result;
    } catch (error) {
      logger.error(messages.outcome.installFailed('install', toolName), error);
      const errorResult: InstallResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        installationMethod: resolvedToolConfig.installationMethod,
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
   * Creates symlinks for externally-managed binaries (e.g., Homebrew).
   * Since externally-managed tools don't create timestamped directories,
   * we create direct symlinks in binaries/<toolName>/ pointing to the actual binaries.
   *
   * @param toolName - Name of the tool
   * @param binaryPaths - Array of absolute paths to the actual binaries
   * @param fs - File system instance for creating symlinks
   * @param parentLogger - Logger for diagnostic messages
   */
  private async createExternalBinarySymlinks(
    toolName: string,
    binaryPaths: string[],
    fs: IFileSystem,
    parentLogger: TsLogger
  ): Promise<void> {
    const logger = parentLogger.getSubLogger({ name: 'createExternalBinarySymlinks' });
    const binariesDir = path.join(this.projectConfig.paths.generatedDir, 'binaries');
    const toolDir = path.join(binariesDir, toolName);

    // Ensure tool directory exists
    await fs.ensureDir(toolDir);

    // Create symlink for each binary
    for (const binaryPath of binaryPaths) {
      const binaryName = path.basename(binaryPath);
      const symlinkPath = path.join(toolDir, binaryName);

      // Verify the target binary exists
      if (!(await fs.exists(binaryPath))) {
        logger.error(messages.lifecycle.externalBinaryMissing(toolName, binaryName, binaryPath));
        throw new Error(`Cannot create symlink: external binary does not exist at ${binaryPath}`);
      }

      // Remove existing symlink if it exists
      if (await fs.exists(symlinkPath)) {
        logger.debug(messages.lifecycle.removingExistingSymlink(symlinkPath));
        await fs.rm(symlinkPath, { force: true });
      }

      // Create symlink pointing to the external binary
      logger.debug(messages.lifecycle.creatingExternalSymlink(symlinkPath, binaryPath));
      await fs.symlink(binaryPath, symlinkPath);

      // Verify symlink was created
      if (!(await fs.exists(symlinkPath))) {
        logger.error(messages.lifecycle.symlinkVerificationFailed(symlinkPath));
        throw new Error(`Symlink creation failed: ${symlinkPath}`);
      }

      logger.debug(messages.lifecycle.externalSymlinkCreated(symlinkPath, binaryPath));
    }
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
  ): {
    context: BaseInstallContext & { emitEvent?: (type: string, data: Record<string, unknown>) => Promise<void> };
    logger: TsLogger;
  } {
    const methodLogger = parentLogger.getSubLogger({ name: 'createBaseInstallContext' });
    const getToolDir = (name: string): string => {
      return path.join(this.projectConfig.paths.binariesDir, name);
    };

    const contextLogger = methodLogger.getSubLogger({ name: `install-${toolName}` });

    const context: BaseInstallContext & { emitEvent?: (type: string, data: Record<string, unknown>) => Promise<void> } =
      {
        toolName,
        installDir,
        timestamp,
        systemInfo: this.getSystemInfo(),
        toolConfig,
        projectConfig: this.projectConfig,
        // BaseToolContext properties
        toolDir: getToolDir(toolName),
        getToolDir,
        homeDir: this.projectConfig.paths.homeDir,
        binDir: this.projectConfig.paths.targetDir,
        shellScriptsDir: this.projectConfig.paths.shellScriptsDir,
        dotfilesDir: this.projectConfig.paths.dotfilesDir,
        generatedDir: this.projectConfig.paths.generatedDir,
        // Event emitter for plugins to trigger hooks
        emitEvent: async (type: string, data: Record<string, unknown>) => {
          await this.registry.emitEvent({
            type: type as PluginEmittedHookEvent,
            toolName,
            context: {
              ...this.createBaseInstallContext(toolName, installDir, timestamp, toolConfig, parentLogger).context,
              ...data,
              logger: contextLogger,
            },
          });
        },
      };
    return { context, logger: contextLogger };
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
