import type { ProjectConfig } from "@dotfiles/config";
import type {
  IAfterInstallContext,
  ICompletionContext,
  IInstallContext,
  InstallerPluginRegistry,
  ISystemInfo,
  IShell,
  ShellCompletionConfig,
  ShellCompletionConfigInput,
  ShellCompletionConfigValue,
  ShellType,
  ToolConfig,
} from "@dotfiles/core";
import { Platform } from "@dotfiles/core";
import type { IResolvedFileSystem } from "@dotfiles/file-system";
import { createSafeLogMessage, type TsLogger } from "@dotfiles/logger";
import type { TrackedFileSystem } from "@dotfiles/registry/file";
import type { IToolInstallationRecord, IToolInstallationRegistry } from "@dotfiles/registry/tool";
import type { ICompletionGenerationContext, ICompletionGenerator } from "@dotfiles/shell-init-generator";
import type { ISymlinkGenerator } from "@dotfiles/symlink-generator";
import { resolveValue } from "@dotfiles/unwrap-value";
import { generateTimestamp, normalizeVersion, resolvePlatformConfig } from "@dotfiles/utils";
import { randomUUID } from "node:crypto";
import path from "node:path";
import semver from "semver";
import { type ICreateBaseInstallContextResult, InstallContextFactory } from "./context";
import { HookLifecycle } from "./hooks/HookLifecycle";
import { InstallationStateWriter } from "./state";
import type { IInstaller, IInstallOptions, InstallResult } from "./types";
import { createConfiguredShell, getBinaryPaths, type HookExecutor, messages } from "./utils";

const EXACT_INSTALL_PARAM_VERSION_METHODS = new Set<string>(["apt", "dnf"]);

function isExactTopLevelVersion(version: string): boolean {
  if (semver.valid(version)) {
    return true;
  }

  if (semver.validRange(version)) {
    return false;
  }

  return true;
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
  private readonly fs: TrackedFileSystem;
  private readonly resolvedFs: IResolvedFileSystem;
  private readonly projectConfig: ProjectConfig;
  public readonly hookExecutor: HookExecutor;
  private readonly hookLifecycle: HookLifecycle;
  private readonly toolInstallationRegistry: IToolInstallationRegistry;
  private readonly systemInfo: ISystemInfo;
  private readonly registry: InstallerPluginRegistry;
  private readonly installationStateWriter: InstallationStateWriter;
  private readonly $: IShell;
  private readonly completionGenerator?: ICompletionGenerator;
  private readonly installContextFactory: InstallContextFactory;
  private currentToolConfig?: ToolConfig;

  constructor(
    parentLogger: TsLogger,
    fileSystem: TrackedFileSystem,
    resolvedFileSystem: IResolvedFileSystem,
    projectConfig: ProjectConfig,
    toolInstallationRegistry: IToolInstallationRegistry,
    systemInfo: ISystemInfo,
    registry: InstallerPluginRegistry,
    symlinkGenerator: ISymlinkGenerator,
    $shell: IShell,
    hookExecutor: HookExecutor,
    completionGenerator?: ICompletionGenerator,
  ) {
    this.logger = parentLogger.getSubLogger({ name: "Installer" });
    this.fs = fileSystem;
    this.resolvedFs = resolvedFileSystem;
    this.projectConfig = projectConfig;
    this.hookExecutor = hookExecutor;
    this.hookLifecycle = new HookLifecycle(hookExecutor);
    this.toolInstallationRegistry = toolInstallationRegistry;
    this.systemInfo = systemInfo;
    this.registry = registry;
    this.installationStateWriter = new InstallationStateWriter({
      projectConfig: this.projectConfig,
      toolInstallationRegistry: this.toolInstallationRegistry,
      symlinkGenerator,
    });
    this.$ = $shell;
    this.completionGenerator = completionGenerator;
    this.installContextFactory = new InstallContextFactory({
      projectConfig: this.projectConfig,
      systemInfo: this.systemInfo,
      resolvedFileSystem: this.resolvedFs,
      fileSystem: this.fs,
      $shell: this.$,
      emitInstallEvent: async (event) => {
        await this.registry.emitEvent(event);
      },
    });

    // Register event handler for installation events to execute hooks
    this.registry.onEvent(async (event) => {
      await this.hookLifecycle.handleInstallEvent(event, this.currentToolConfig, this.logger);
    });
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
  private async isExistingInstallationHealthy(
    toolName: string,
    existingInstallation: IToolInstallationRecord,
    resolvedToolConfig: ToolConfig,
    parentLogger: TsLogger,
  ): Promise<boolean> {
    const logger = parentLogger.getSubLogger({ name: "isExistingInstallationHealthy" });

    const installPathExists = await this.resolvedFs.exists(existingInstallation.installPath);
    if (!installPathExists) {
      logger.warn(messages.lifecycle.existingInstallPathMissing(existingInstallation.installPath));
      return false;
    }

    const expectedBinaryPaths = getBinaryPaths(
      resolvedToolConfig.binaries,
      path.join(this.projectConfig.paths.binariesDir, toolName, "current"),
    );

    if (expectedBinaryPaths.length === 0) {
      return true;
    }

    const currentDir = path.join(this.projectConfig.paths.binariesDir, toolName, "current");
    const currentDirExists = await this.resolvedFs.exists(currentDir);
    if (!currentDirExists) {
      logger.warn(messages.lifecycle.currentDirMissing(currentDir));
      return false;
    }

    for (const binaryPath of expectedBinaryPaths) {
      const binaryExists = await this.resolvedFs.exists(binaryPath);
      if (!binaryExists) {
        logger.warn(messages.lifecycle.currentBinaryMissing(binaryPath));
        return false;
      }
    }

    return true;
  }

  private async shouldSkipInstallation(
    toolName: string,
    resolvedToolConfig: ToolConfig,
    options: IInstallOptions | undefined,
    parentLogger: TsLogger,
  ): Promise<InstallResult | null> {
    const logger = parentLogger.getSubLogger({ name: "shouldSkipInstallation" });
    if (options?.force || options?.skipVersionCheck) {
      return null;
    }

    const existingInstallation = await this.toolInstallationRegistry.getToolInstallation(toolName);
    if (!existingInstallation) {
      return null;
    }

    const isHealthy = await this.isExistingInstallationHealthy(
      toolName,
      existingInstallation,
      resolvedToolConfig,
      logger,
    );
    if (!isHealthy) {
      return null;
    }

    // Compute binaryPaths for already-installed case
    // This is needed for completion generation to know where binaries are
    const currentDir = path.join(this.projectConfig.paths.binariesDir, toolName, "current");
    const binaryPaths = getBinaryPaths(resolvedToolConfig.binaries, currentDir);

    // Get shellInit from plugin if available (for plugins like zsh-plugin that emit shellInit)
    const plugin = this.registry.get(resolvedToolConfig.installationMethod);
    const shellInit = plugin?.getShellInit?.(toolName, resolvedToolConfig, currentDir);

    const targetVersion = await this.getTargetVersion(toolName, resolvedToolConfig);
    if (targetVersion) {
      if (existingInstallation.version === targetVersion) {
        logger.debug(messages.outcome.installSuccess(toolName, targetVersion, "already-installed"));
        // Use type assertion: "already-installed" is a skip scenario, not a real plugin execution
        const result = {
          success: true,
          version: existingInstallation.version,
          installationMethod: "already-installed",
          binaryPaths,
          shellInit,
        } as InstallResult;
        return result;
      }
      logger.debug(messages.outcome.outdatedVersion(toolName, existingInstallation.version, targetVersion));
      return null;
    }

    // If target version is NOT explicit (e.g. 'latest'), and we have an installation
    // We should skip unless we want to force update.
    // Since we don't support update checks for some plugins (like curl-script),
    // assuming "installed is good enough" prevents the infinite reinstall loop.
    // Users can use --force to update.
    logger.debug(messages.outcome.installSuccess(toolName, existingInstallation.version, "already-installed-latest"));
    // Use type assertion: "already-installed" is a skip scenario, not a real plugin execution
    const result = {
      success: true,
      version: existingInstallation.version,
      installationMethod: "already-installed",
      binaryPaths,
      shellInit,
    } as InstallResult;
    return result;
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
   * @param parentLogger - Logger with tool context for plugin operations
   * @returns Installation result from the plugin
   */
  private async executeInstallationMethod(
    toolName: string,
    resolvedToolConfig: ToolConfig,
    context: IInstallContext,
    options: IInstallOptions | undefined,
    parentLogger: TsLogger,
  ): Promise<InstallResult> {
    const result: InstallResult = await this.registry.install(
      parentLogger,
      resolvedToolConfig.installationMethod,
      toolName,
      resolvedToolConfig,
      context,
      options,
    );
    return result;
  }

  private isShellCompletionConfigInput(value: unknown): value is ShellCompletionConfigInput {
    if (typeof value === "string" || typeof value === "function") {
      return true;
    }

    if (typeof value !== "object" || value === null) {
      return false;
    }

    return "source" in value || "cmd" in value || "url" in value;
  }

  private normalizeCompletionConfig(value: ShellCompletionConfigValue): ShellCompletionConfig {
    if (typeof value === "string") {
      return { source: value };
    }

    if ("cmd" in value) {
      return {
        cmd: value.cmd,
        ...(value.bin ? { bin: value.bin } : {}),
      };
    }

    if ("url" in value) {
      return {
        url: value.url,
        ...(value.source ? { source: value.source } : {}),
        ...(value.bin ? { bin: value.bin } : {}),
      };
    }

    return {
      source: value.source,
      ...(value.bin ? { bin: value.bin } : {}),
    };
  }

  private async prepareUrlCompletionAssets(
    toolName: string,
    toolConfig: ToolConfig,
    installedDir: string,
    version: string | undefined,
    parentLogger: TsLogger,
  ): Promise<void> {
    const logger = parentLogger.getSubLogger({ name: "prepareUrlCompletionAssets" });

    if (!this.completionGenerator?.prepareUrlCompletionSource) {
      return;
    }

    const shellTypes: ShellType[] = ["zsh", "bash", "powershell"];
    const completionVersion = version ?? toolConfig.version ?? "latest";

    for (const shellType of shellTypes) {
      const completionInputValue = toolConfig.shellConfigs?.[shellType]?.completions;
      if (!this.isShellCompletionConfigInput(completionInputValue)) {
        continue;
      }

      const completionContext: ICompletionContext = { version: completionVersion };
      const resolvedCompletionValue: ShellCompletionConfigValue = await resolveValue(
        completionContext,
        completionInputValue,
      );
      const completionConfig = this.normalizeCompletionConfig(resolvedCompletionValue);

      if (!completionConfig.url) {
        continue;
      }

      const generationContext: ICompletionGenerationContext = {
        ...completionContext,
        toolName,
        toolInstallDir: installedDir,
        shellScriptsDir: this.projectConfig.paths.shellScriptsDir,
        homeDir: this.projectConfig.paths.homeDir,
        configFilePath: toolConfig.configFilePath,
      };

      try {
        const sourcePath = await this.completionGenerator.prepareUrlCompletionSource(
          completionConfig,
          toolName,
          generationContext,
        );
        logger.debug(messages.completion.preparedFromUrl(shellType, sourcePath));
      } catch (error) {
        logger.warn(messages.completion.prepareFailed(shellType), error);
      }
    }
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
  async install(toolName: string, toolConfig: ToolConfig, options?: IInstallOptions): Promise<InstallResult> {
    const logger = this.logger.getSubLogger({ name: "install", context: toolName });

    // Resolve platform-specific configuration
    const systemInfo = this.getSystemInfo();
    const resolvedToolConfig = resolvePlatformConfig(toolConfig, systemInfo);

    // Store current tool config for event handler access
    this.currentToolConfig = resolvedToolConfig;

    // Create a tool-specific TrackedFileSystem
    const toolFs = this.fs.withToolName(toolName);

    // Suppress logging in shim mode
    if (options?.shimMode) {
      toolFs.setSuppressLogging(true);
    }

    try {
      // Check if tool is already installed (unless force option is used)
      const skipResult = await this.shouldSkipInstallation(toolName, resolvedToolConfig, options, logger);
      if (skipResult) {
        return skipResult;
      }

      // Check if plugin is externally managed (e.g., Homebrew, apt)
      const plugin = this.registry.get(resolvedToolConfig.installationMethod);
      const isExternallyManaged: boolean = plugin?.externallyManaged === true;

      if (resolvedToolConfig.sudo && plugin && plugin.supportsSudo?.() !== true) {
        const error = `\`${resolvedToolConfig.installationMethod}\` doesn't support \`sudo()\``;
        logger.error(messages.outcome.sudoUnsupported(resolvedToolConfig.installationMethod));
        return {
          success: false,
          error,
          installationMethod: resolvedToolConfig.installationMethod,
        };
      }

      // Try to resolve version before creating installation directory
      // Fall back to timestamp if version cannot be resolved
      const binariesDir: string = this.projectConfig.paths.binariesDir;
      const toolRootDir: string = path.join(binariesDir, toolName);
      await toolFs.ensureDir(toolRootDir);

      const timestamp: string = generateTimestamp();
      let versionOrTimestamp: string = timestamp;

      if (resolvedToolConfig.version && resolvedToolConfig.version !== "latest") {
        versionOrTimestamp = resolvedToolConfig.version;
      }

      if (!isExternallyManaged && plugin?.resolveVersion) {
        // Create minimal context for version resolution
        const tempContext: IInstallContext = this.createMinimalContext(toolName, resolvedToolConfig, logger);

        try {
          const resolvedVersion: string | null = await plugin.resolveVersion(
            toolName,
            resolvedToolConfig,
            tempContext,
            options,
            logger,
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

      // Create staging directory for the install attempt (skip creating for externally managed plugins)
      const stagingId: string = randomUUID();
      const stagingDir: string = path.join(toolRootDir, stagingId);

      if (!isExternallyManaged) {
        await toolFs.ensureDir(stagingDir);
        logger.debug(messages.lifecycle.directoryCreated(stagingDir));
      }

      // Build installation environment with recursion guard and modified PATH
      // This environment is passed to the configured shell so all commands inherit it.
      // We avoid modifying process.env directly as that's a global mutation.
      const envVarName = `DOTFILES_INSTALLING_${toolName.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`;
      const originalPath = process.env["PATH"] || "";
      const pathSeparator = systemInfo.platform === Platform.Windows ? ";" : ":";
      const installPath: string = isExternallyManaged ? originalPath : `${stagingDir}${pathSeparator}${originalPath}`;

      const installEnv: Record<string, string | undefined> = {
        ...process.env,
        [envVarName]: "true",
        PATH: installPath,
      };

      // Create a configured shell with the installation environment
      // This ensures plugins and hooks see the recursion guard and modified PATH
      const configuredShell = createConfiguredShell(this.$, installEnv);

      const { context, logger: contextLogger } = this.createBaseInstallContext(
        toolName,
        stagingDir,
        timestamp,
        resolvedToolConfig,
        logger,
        configuredShell,
        installEnv,
      );

      // Run beforeInstall hook if defined
      const beforeInstallResult = await this.hookLifecycle.executeBeforeInstallHook(
        resolvedToolConfig,
        context,
        toolFs,
        contextLogger,
      );
      if (beforeInstallResult) {
        return beforeInstallResult;
      }

      let result: InstallResult;

      try {
        // Install based on the installation method
        result = await this.executeInstallationMethod(toolName, resolvedToolConfig, context, options, contextLogger);

        // Add the resolved installation method to the result
        result.installationMethod = resolvedToolConfig.installationMethod;

        const detectedVersion: string | undefined = result.success && "version" in result ? result.version : undefined;
        const shouldUseDetectedVersion =
          detectedVersion !== undefined &&
          detectedVersion !== timestamp &&
          (options?.force === true || versionOrTimestamp === timestamp);
        const finalVersionOrTimestamp: string = shouldUseDetectedVersion ? detectedVersion : versionOrTimestamp;

        const installedDir: string = isExternallyManaged
          ? path.join(toolRootDir, "external")
          : path.join(toolRootDir, finalVersionOrTimestamp);

        if (result.success && !isExternallyManaged) {
          if (await toolFs.exists(installedDir)) {
            await toolFs.rm(installedDir, { recursive: true, force: true });
          }

          await toolFs.rename(stagingDir, installedDir);
          logger.debug(messages.lifecycle.directoryRenamed(stagingDir, installedDir));

          if (result.success && "binaryPaths" in result && result.binaryPaths) {
            result.binaryPaths = result.binaryPaths.map((p: string) =>
              p.startsWith(stagingDir) ? p.replace(stagingDir, installedDir) : p,
            );
          }
        }

        if (result.success && isExternallyManaged) {
          await toolFs.ensureDir(installedDir);
        }

        // Create stable binary entrypoints for all tools.
        // Shims always execute via toolDir/current/<binary>, so <binary> must be a direct executable file.
        // Filter out paths that don't exist - these may have been handled by setupBinariesFromArchive
        const binaryPaths = result.success && "binaryPaths" in result ? result.binaryPaths : undefined;
        if (result.success && binaryPaths) {
          const existingPaths: string[] = [];
          for (const binaryPath of binaryPaths) {
            const exists = await toolFs.exists(binaryPath);
            if (exists) {
              existingPaths.push(binaryPath);
            }
          }
          if (existingPaths.length > 0) {
            await this.installationStateWriter.createBinaryEntrypoints(
              toolName,
              existingPaths,
              toolFs,
              logger,
              installedDir,
              isExternallyManaged,
            );
          }
        }

        // Update current symlink after installation and any rename.
        // This provides a stable directory for shims: {binariesDir}/{toolName}/current/...
        if (result.success) {
          await this.installationStateWriter.updateCurrentSymlink(
            toolName,
            toolFs,
            logger,
            installedDir,
            isExternallyManaged,
          );
        }

        // If installation failed, clean up the empty installation directory (skip for externally managed)
        if (!isExternallyManaged && !result.success && (await toolFs.exists(stagingDir))) {
          logger.debug(messages.lifecycle.cleaningFailedInstallDir(stagingDir));
          await toolFs.rm(stagingDir, { recursive: true, force: true });

          // Also try to remove the parent tool directory if it's now empty
          const toolDir = path.dirname(stagingDir);
          try {
            const entries = await toolFs.readdir(toolDir);
            if (entries.length === 0) {
              await toolFs.rmdir(toolDir);
            }
          } catch {
            // Parent directory might not be empty or might not exist, which is fine
          }
        }

        // Log the error message when installation fails
        if (!result.success && result.error) {
          logger.error(createSafeLogMessage(result.error));
        }

        if (result.success) {
          const resultBinaryPaths: string[] =
            "binaryPaths" in result && Array.isArray(result.binaryPaths) ? result.binaryPaths : [];
          const version: string | undefined = "version" in result ? result.version : undefined;

          await this.prepareUrlCompletionAssets(toolName, resolvedToolConfig, installedDir, version, logger);

          // Create after-install environment with PATH pointing to installedDir
          // This ensures after-install hooks can find the freshly installed binaries
          const afterInstallPath: string = isExternallyManaged
            ? originalPath
            : `${installedDir}${pathSeparator}${originalPath}`;
          const afterInstallEnv: Record<string, string | undefined> = {
            ...process.env,
            [envVarName]: "true",
            PATH: afterInstallPath,
          };
          const afterInstallShell = createConfiguredShell(this.$, afterInstallEnv);

          const afterInstallContext: IAfterInstallContext = {
            ...context,
            $: afterInstallShell,
            installedDir,
            binaryPaths: resultBinaryPaths,
            version,
            installEnv: afterInstallEnv,
          };

          await this.hookLifecycle.executeAfterInstallHook(
            resolvedToolConfig,
            afterInstallContext,
            toolFs,
            contextLogger,
          );

          // Record successful installation in the registry
          await this.installationStateWriter.recordInstallation(
            toolName,
            resolvedToolConfig,
            installedDir,
            context,
            result,
            contextLogger,
          );
        }

        return result;
      } catch (error) {
        // If installation method throws (e.g., from hook failure), create failure result
        result = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          installationMethod: resolvedToolConfig.installationMethod,
        };
        logger.error(createSafeLogMessage(result.error));
        return result;
      }
      // No finally block needed - we don't modify process.env, so no cleanup required.
      // The recursion guard and PATH modifications are scoped to the shell environment.
    } catch (error) {
      const errorResult: InstallResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        installationMethod: resolvedToolConfig.installationMethod,
      };
      logger.error(createSafeLogMessage(errorResult.error));
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
    if (EXACT_INSTALL_PARAM_VERSION_METHODS.has(toolConfig.installationMethod)) {
      const installParams = toolConfig.installParams;
      if (
        typeof installParams === "object" &&
        installParams !== null &&
        "version" in installParams &&
        typeof installParams.version === "string" &&
        installParams.version !== "latest"
      ) {
        return normalizeVersion(installParams.version);
      }

      return null;
    }

    // If the version is explicitly set and not 'latest', return it
    if (toolConfig.version && toolConfig.version !== "latest" && isExactTopLevelVersion(toolConfig.version)) {
      return normalizeVersion(toolConfig.version);
    }

    // For 'latest' or unspecified versions, we can't determine the target version
    // without executing the plugin logic, so return null to skip the version check
    return null;
  }

  /**
   * Creates a minimal installation context for version resolution.
   * This lightweight context contains only system information needed
   * to resolve versions before installation directories are created.
   *
   * @param toolName - Tool name
   * @param toolConfig - Complete tool configuration
   * @param parentLogger - Parent logger for context creation
   * @returns Minimal context with system info
   */
  private createMinimalContext(toolName: string, toolConfig: ToolConfig, parentLogger: TsLogger): IInstallContext {
    return this.installContextFactory.createMinimalContext({
      toolName,
      toolConfig,
      parentLogger,
    });
  }

  /**
   * Creates a complete InstallContext with all required properties for installation.
   * Includes properties from IBaseToolContext plus installation-specific fields.
   *
   * @param toolName - Name of the tool being installed
   * @param stagingDir - Per-attempt staging directory path
   * @param timestamp - Installation timestamp string
   * @param toolConfig - Tool configuration
   * @param parentLogger - Parent logger for creating context logger
   * @returns Complete install context with all required properties and event emitter
   */
  private createBaseInstallContext(
    toolName: string,
    stagingDir: string,
    timestamp: string,
    toolConfig: ToolConfig,
    parentLogger: TsLogger,
    $shell: IShell = createConfiguredShell(this.$, process.env),
    installEnv?: Record<string, string | undefined>,
  ): ICreateBaseInstallContextResult {
    const methodLogger = parentLogger.getSubLogger({ name: "createBaseInstallContext" });

    return this.installContextFactory.createBaseInstallContext({
      toolName,
      stagingDir,
      timestamp,
      toolConfig,
      parentLogger: methodLogger,
      $shell,
      installEnv,
    });
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
