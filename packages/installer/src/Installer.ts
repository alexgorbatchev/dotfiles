import path from 'node:path';
import type { ProjectConfig } from '@dotfiles/config';
import type {
  $extended,
  AsyncInstallHook,
  IInstallContext,
  InstallEvent,
  InstallerPluginRegistry,
  ISystemInfo,
  PluginEmittedHookEvent,
  ToolConfig,
} from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { TrackedFileSystem } from '@dotfiles/registry/file';
import type { IToolInstallationRegistry } from '@dotfiles/registry/tool';
import type { ISymlinkGenerator } from '@dotfiles/symlink-generator';
import { generateTimestamp, resolvePlatformConfig } from '@dotfiles/utils';
import type { IInstaller, IInstallOptions, InstallResult } from './types';
import { createConfiguredShell, type HookExecutor, messages } from './utils';

type UnknownRecord = Record<string, unknown>;

type InstallHooks = Record<string, AsyncInstallHook[]>;

type EmitEvent = (type: PluginEmittedHookEvent, data: UnknownRecord) => Promise<void>;

type InstallContextWithEmitter = IInstallContext & { emitEvent?: EmitEvent };

interface ICreateBaseInstallContextResult {
  context: InstallContextWithEmitter;
  logger: TsLogger;
}

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAsyncInstallHookArray(value: unknown): value is AsyncInstallHook[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'function');
}

function getInstallHooksFromToolConfig(toolConfig: unknown): InstallHooks | undefined {
  if (!isUnknownRecord(toolConfig)) {
    return undefined;
  }

  const installParams: unknown = toolConfig['installParams'];
  if (!isUnknownRecord(installParams)) {
    return undefined;
  }

  const hooks: unknown = installParams['hooks'];
  if (!isUnknownRecord(hooks)) {
    return undefined;
  }

  const hookEntries: [string, unknown][] = Object.entries(hooks);
  if (hookEntries.length === 0) {
    return undefined;
  }

  const normalizedHooks: InstallHooks = {};
  for (const [hookName, maybeHookArray] of hookEntries) {
    if (!isAsyncInstallHookArray(maybeHookArray)) {
      return undefined;
    }
    normalizedHooks[hookName] = maybeHookArray;
  }

  return normalizedHooks;
}

function getPluginMetadataRecord(result: InstallResult): UnknownRecord {
  const empty: UnknownRecord = {};
  if (!result.success) {
    return empty;
  }

  if (!('metadata' in result)) {
    return empty;
  }

  const metadata: unknown = result.metadata;
  if (!isUnknownRecord(metadata)) {
    return empty;
  }

  return metadata;
}

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
  public readonly hookExecutor: HookExecutor;
  private readonly toolInstallationRegistry: IToolInstallationRegistry;
  private readonly systemInfo: ISystemInfo;
  private readonly registry: InstallerPluginRegistry;
  private readonly symlinkGenerator: ISymlinkGenerator;
  private readonly $: typeof import('bun').$;
  private currentToolConfig?: ToolConfig;

  constructor(
    parentLogger: TsLogger,
    fileSystem: IFileSystem,
    projectConfig: ProjectConfig,
    toolInstallationRegistry: IToolInstallationRegistry,
    systemInfo: ISystemInfo,
    registry: InstallerPluginRegistry,
    symlinkGenerator: ISymlinkGenerator,
    $shell: typeof import('bun').$,
    hookExecutor: HookExecutor
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'Installer' });
    this.fs = fileSystem;
    this.projectConfig = projectConfig;
    this.hookExecutor = hookExecutor;
    this.toolInstallationRegistry = toolInstallationRegistry;
    this.systemInfo = systemInfo;
    this.registry = registry;
    this.symlinkGenerator = symlinkGenerator;
    this.$ = $shell;

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
  private async handleInstallEvent(event: InstallEvent): Promise<void> {
    if (!this.currentToolConfig) {
      return;
    }

    const hooks = getInstallHooksFromToolConfig(this.currentToolConfig);
    if (!hooks) {
      return;
    }

    const hookArray = hooks[event.type];
    if (!hookArray) {
      return;
    }

    // Create enhanced context with fileSystem from event
    const toolFs = event.context.fileSystem;
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
    options: IInstallOptions | undefined,
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
    if (targetVersion) {
      if (existingInstallation.version === targetVersion) {
        logger.debug(messages.outcome.installSuccess(toolName, targetVersion, 'already-installed'));
        return true;
      }
      logger.debug(messages.outcome.outdatedVersion(toolName, existingInstallation.version, targetVersion));
      return false;
    }

    // If target version is NOT explicit (e.g. 'latest'), and we have an installation
    // We should skip unless we want to force update.
    // Since we don't support update checks for some plugins (like curl-script),
    // assuming "installed is good enough" prevents the infinite reinstall loop.
    // Users can use --force to update.
    logger.debug(messages.outcome.installSuccess(toolName, existingInstallation.version, 'already-installed-latest'));
    return true;
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
    context: IInstallContext,
    toolFs: IFileSystem,
    parentLogger: TsLogger
  ): Promise<InstallResult | null> {
    const logger = parentLogger.getSubLogger({ name: 'executeBeforeInstallHook' });
    const hooks = getInstallHooksFromToolConfig(resolvedToolConfig);
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
    context: IInstallContext,
    result: InstallResult,
    toolFs: IFileSystem,
    parentLogger: TsLogger
  ): Promise<void> {
    const logger = parentLogger.getSubLogger({ name: 'executeAfterInstallHook' });
    const hooks = getInstallHooksFromToolConfig(resolvedToolConfig);
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
   * - Plugin metadata: Spread from result.metadata (plugins extending Partial<IToolInstallationDetails>)
   *
   * The Installer is plugin-agnostic and simply spreads whatever metadata the plugin provides.
   * Plugins can include optional fields like downloadUrl, assetName, or any method-specific data.
   *
   * @param toolName - Name of the installed tool
   * @param resolvedToolConfig - Platform-resolved tool configuration
   * @param context - Base install context with paths
   * @param result - Installation result with success status and metadata
   * @param parentLogger - Logger for registry operations
   * @see {@link IToolInstallationDetails} for the complete field structure
   */
  private async recordInstallation(
    toolName: string,
    resolvedToolConfig: ToolConfig,
    context: IInstallContext,
    result: InstallResult,
    parentLogger: TsLogger
  ): Promise<void> {
    const logger = parentLogger.getSubLogger({ name: 'recordInstallation' });
    if (!result.success) {
      return;
    }

    try {
      // Use detected version if available, otherwise fall back to timestamp
      const version: string = 'version' in result && result.version ? result.version : context.timestamp;

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

      // Spread metadata - installers now extend IToolInstallationDetails so they provide the right fields
      await this.toolInstallationRegistry.recordToolInstallation({
        toolName,
        version,
        installPath: context.installDir,
        timestamp: context.timestamp,
        binaryPaths: result.binaryPaths,
        configuredVersion,
        originalTag,
        ...getPluginMetadataRecord(result),
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
    context: IInstallContext,
    options?: IInstallOptions,
    _logger?: TsLogger
  ): Promise<InstallResult> {
    const result: InstallResult = await this.registry.install(
      resolvedToolConfig.installationMethod,
      toolName,
      resolvedToolConfig,
      context,
      options
    );
    return result;
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
  async install(toolName: string, toolConfig: ToolConfig, options?: IInstallOptions): Promise<InstallResult> {
    const logger = this.logger.getSubLogger({ name: 'install', context: toolName });

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

      // Try to resolve version before creating installation directory
      // Fall back to timestamp if version cannot be resolved
      const binariesDir = path.join(this.projectConfig.paths.generatedDir, 'binaries');
      const timestamp = generateTimestamp();
      let versionOrTimestamp: string = timestamp;

      if (!isExternallyManaged && plugin?.resolveVersion) {
        // Create minimal context for version resolution
        const tempContext: IInstallContext = this.createMinimalContext(toolName, resolvedToolConfig);

        try {
          const resolvedVersion: string | null = await plugin.resolveVersion(
            toolName,
            resolvedToolConfig,
            tempContext,
            logger
          );

          if (resolvedVersion) {
            versionOrTimestamp = resolvedVersion;
            logger.debug(messages.lifecycle.versionResolved(resolvedVersion));
          } else {
            logger.debug(messages.lifecycle.versionFallbackToTimestamp());
          }
        } catch (error) {
          logger.debug(messages.lifecycle.versionResolutionFailed(error));
        }
      }

      // Create installation directory with version or timestamp (skip for externally managed plugins)
      const installDir: string = isExternallyManaged ? '' : path.join(binariesDir, toolName, versionOrTimestamp);

      if (!isExternallyManaged) {
        await toolFs.ensureDir(installDir);
        logger.debug(messages.lifecycle.directoryCreated(installDir));
      }

      // Create context for installation hooks
      // Create a configured shell that automatically includes the current environment variables
      // This ensures that plugins don't need to manually call .env({ ...process.env })
      // to pick up the modified PATH and recursion guard variables.
      const configuredShell = createConfiguredShell(this.$, process.env);

      const { context, logger: contextLogger } = this.createBaseInstallContext(
        toolName,
        installDir,
        versionOrTimestamp,
        resolvedToolConfig,
        logger,
        configuredShell
      ); // Run beforeInstall hook if defined
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
      // Set recursion guard environment variable
      // Sanitize tool name to ensure valid env var name (replace non-alphanumeric chars with _)
      const envVarName = `DOTFILES_INSTALLING_${toolName.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
      process.env[envVarName] = 'true';

      // Prepend installDir to PATH to allow scripts/hooks to find the newly installed binary
      // This prevents recursion (finding the shim) and allows post-install steps to run the tool
      const originalPath = process.env['PATH'] || '';
      const pathSeparator = process.platform === 'win32' ? ';' : ':';
      if (installDir) {
        process.env['PATH'] = `${installDir}${pathSeparator}${originalPath}`;
      }

      try {
        // Install based on the installation method
        result = await this.executeInstallationMethod(toolName, resolvedToolConfig, context, options, contextLogger);
      } catch (error) {
        // If installation method throws (e.g., from hook failure), create failure result
        result = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        // Restore PATH
        if (installDir) {
          process.env['PATH'] = originalPath;
        }
        // Clean up recursion guard
        delete process.env[envVarName];
      }

      // Add the resolved installation method to the result
      result.installationMethod = resolvedToolConfig.installationMethod;

      // If we have a detected version and the install directory is a timestamp,
      // rename the directory to the version
      const detectedVersion = result.success && 'version' in result ? result.version : undefined;
      const shouldRename =
        !isExternallyManaged &&
        result.success &&
        !!detectedVersion &&
        versionOrTimestamp === timestamp &&
        detectedVersion !== timestamp;

      if (shouldRename && detectedVersion) {
        const newInstallDir = path.join(binariesDir, toolName, detectedVersion);
        if (await toolFs.exists(newInstallDir)) {
          // If version directory already exists, remove it first (or maybe we should have skipped?)
          // But since we are here, we probably want to overwrite or use it.
          // For safety, let's remove the timestamp dir and use the existing version dir
          // if it seems valid. But simpler is to remove existing and rename new.
          await toolFs.rm(newInstallDir, { recursive: true, force: true });
        }

        await toolFs.rename(installDir, newInstallDir);
        logger.debug(messages.lifecycle.directoryRenamed(installDir, newInstallDir));

        // Update context and result with new path
        context.installDir = newInstallDir;
        // Update binary paths to point to new location
        if (result.success && 'binaryPaths' in result && result.binaryPaths) {
          result.binaryPaths = result.binaryPaths.map((p: string) =>
            p.startsWith(installDir) ? p.replace(installDir, newInstallDir) : p
          );
        }
      }

      // Create stable binary entrypoints for all tools.
      // Shims always execute via toolDir/current/<binary>, so <binary> must be a direct executable file.
      // Filter out paths that don't exist - these may have been handled by setupBinariesFromArchive
      const binaryPaths = result.success && 'binaryPaths' in result ? result.binaryPaths : undefined;
      if (result.success && binaryPaths) {
        const existingPaths: string[] = [];
        for (const binaryPath of binaryPaths) {
          const exists = await toolFs.exists(binaryPath);
          if (exists) {
            existingPaths.push(binaryPath);
          }
        }
        if (existingPaths.length > 0) {
          await this.createBinaryEntrypoints(
            toolName,
            existingPaths,
            toolFs,
            logger,
            context.installDir,
            isExternallyManaged
          );
        }
      }

      // Update current symlink after installation and any rename.
      // This provides a stable directory for shims: {binariesDir}/{toolName}/current/...
      if (result.success) {
        await this.updateCurrentSymlink(toolName, toolFs, logger, context.installDir, isExternallyManaged);
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
      const errorResult: InstallResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        installationMethod: resolvedToolConfig.installationMethod,
      };
      logger.error(messages.outcome.installFailed('install', toolName), errorResult.error);
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
   * Creates symlinks for binaries in the tool directory.
   * This ensures that shims always point to a stable location in the tool directory
   * regardless of whether the tool is versioned (timestamped) or externally managed.
   *
   * @param toolName - Name of the tool
   * @param binaryPaths - Array of absolute paths to the actual binaries
   * @param fs - File system instance for creating symlinks
   * @param parentLogger - Logger for diagnostic messages
   */
  private async createBinaryEntrypoints(
    toolName: string,
    binaryPaths: string[],
    fs: IFileSystem,
    parentLogger: TsLogger,
    installDir: string,
    isExternallyManaged: boolean
  ): Promise<void> {
    const logger = parentLogger.getSubLogger({ name: 'createBinaryEntrypoints' });
    const binariesDir = path.join(this.projectConfig.paths.generatedDir, 'binaries');
    const toolDir = path.join(binariesDir, toolName);

    // Ensure tool directory exists
    await fs.ensureDir(toolDir);

    if (isExternallyManaged) {
      const externalDir = path.join(toolDir, 'external');
      await fs.ensureDir(externalDir);

      for (const binaryPath of binaryPaths) {
        const binaryName = path.basename(binaryPath);
        const symlinkPath = path.join(externalDir, binaryName);

        try {
          await this.symlinkGenerator.createBinarySymlink(binaryPath, symlinkPath, logger);
        } catch (error) {
          logger.error(messages.lifecycle.externalBinaryMissing(toolName, binaryName, binaryPath));
          throw error;
        }
      }

      return;
    }

    for (const binaryPath of binaryPaths) {
      const binaryName = path.basename(binaryPath);
      const entrypointPath = path.join(installDir, binaryName);

      if (binaryPath === entrypointPath) {
        continue;
      }

      try {
        if (await fs.exists(entrypointPath)) {
          await fs.rm(entrypointPath, { force: true });
        }
      } catch (error) {
        logger.error(messages.binarySymlink.removeExistingFailed(entrypointPath), error);
        throw error;
      }

      try {
        await fs.copyFile(binaryPath, entrypointPath);

        const binaryStats = await fs.stat(binaryPath);
        const binaryMode: number = binaryStats.mode & 0o777;
        await fs.chmod(entrypointPath, binaryMode);
      } catch (error) {
        logger.error(messages.binarySymlink.creationFailed(entrypointPath, binaryPath), error);
        throw error;
      }
    }
  }

  private async updateCurrentSymlink(
    toolName: string,
    fs: IFileSystem,
    parentLogger: TsLogger,
    installDir: string,
    isExternallyManaged: boolean
  ): Promise<void> {
    const logger = parentLogger.getSubLogger({ name: 'updateCurrentSymlink' });
    const binariesDir = path.join(this.projectConfig.paths.generatedDir, 'binaries');
    const toolDir = path.join(binariesDir, toolName);
    const currentSymlinkPath = path.join(toolDir, 'current');

    await fs.ensureDir(toolDir);

    const currentTarget: string = isExternallyManaged ? 'external' : path.basename(installDir);

    try {
      if (await fs.exists(currentSymlinkPath)) {
        await fs.rm(currentSymlinkPath, { force: true, recursive: true });
      }
    } catch (error) {
      logger.error(messages.lifecycle.removingExistingSymlink(currentSymlinkPath), error);
      throw error;
    }

    try {
      await fs.symlink(currentTarget, currentSymlinkPath, 'dir');
    } catch (error) {
      logger.error(messages.lifecycle.creatingExternalSymlink(currentSymlinkPath, currentTarget), error);
      throw error;
    }

    try {
      const linkTarget = await fs.readlink(currentSymlinkPath);
      if (linkTarget !== currentTarget) {
        logger.error(messages.lifecycle.symlinkVerificationFailed(currentSymlinkPath));
        throw new Error(
          `Symlink verification failed: ${currentSymlinkPath} points to ${linkTarget}, expected ${currentTarget}`
        );
      }
    } catch (error) {
      logger.error(messages.lifecycle.symlinkVerificationFailed(currentSymlinkPath), error);
      throw error;
    }
  }

  /**
   * Creates a minimal installation context for version resolution.
   * This lightweight context contains only system information needed
   * to resolve versions before installation directories are created.
   *
   * Note: `toolDir` is derived from `toolConfig.configFilePath` when available.
   *
   * @param toolName - Tool name
   * @param toolConfig - Complete tool configuration
   * @returns Minimal context with system info
   */
  private createMinimalContext(toolName: string, toolConfig: ToolConfig): IInstallContext {
    const toolDir: string = toolConfig.configFilePath
      ? path.dirname(toolConfig.configFilePath)
      : this.projectConfig.paths.toolConfigsDir;

    const currentDir: string = path.join(this.projectConfig.paths.binariesDir, toolName, 'current');

    const minimalContext: IInstallContext = {
      toolName,
      toolDir,
      currentDir,
      installDir: '',
      timestamp: '',
      systemInfo: this.getSystemInfo(),
      toolConfig,
      projectConfig: this.projectConfig,
      $: createConfiguredShell(this.$, process.env),
      fileSystem: this.fs,
    };
    return minimalContext;
  }

  /**
   * Creates a complete InstallContext with all required properties for installation.
   * Includes properties from IBaseToolContext plus installation-specific fields.
   *
   * The context provides plugins with:
   * - Tool identification (toolName)
   * - Directory paths (installDir, etc.)
   * - System information (platform, arch)
   * - Application configuration
   * - Logger instance
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
    parentLogger: TsLogger,
    $shell: $extended = createConfiguredShell(this.$, process.env)
  ): ICreateBaseInstallContextResult {
    const methodLogger = parentLogger.getSubLogger({ name: 'createBaseInstallContext' });

    const toolDir: string = toolConfig.configFilePath
      ? path.dirname(toolConfig.configFilePath)
      : this.projectConfig.paths.toolConfigsDir;

    const currentDir: string = path.join(this.projectConfig.paths.binariesDir, toolName, 'current');

    const contextLogger = methodLogger.getSubLogger({ name: `install-${toolName}` });

    const context: InstallContextWithEmitter = {
      toolName,
      toolDir,
      currentDir,
      installDir,
      timestamp,
      systemInfo: this.getSystemInfo(),
      toolConfig,
      projectConfig: this.projectConfig,
      $: $shell,
      fileSystem: this.fs,
      // Event emitter for plugins to trigger hooks
      emitEvent: async (type: PluginEmittedHookEvent, data: UnknownRecord) => {
        await this.registry.emitEvent({
          type,
          toolName,
          context: {
            ...this.createBaseInstallContext(toolName, installDir, timestamp, toolConfig, parentLogger, $shell).context,
            ...data,
            logger: contextLogger,
          },
        });
      },
    };

    const result: ICreateBaseInstallContextResult = {
      context,
      logger: contextLogger,
    };
    return result;
  }

  /**
   * Returns the system information used for platform-specific configuration resolution.
   * Provides platform and architecture details needed for asset selection and binary matching.
   *
   * @returns System information with platform and architecture
   */
  private getSystemInfo(): ISystemInfo {
    return this.systemInfo;
  }
}
