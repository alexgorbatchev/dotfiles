import type { ProjectConfig } from '@dotfiles/config';
import type { ISystemInfo, ToolConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { TrackedFileSystem } from '@dotfiles/registry/file';
import type { IToolInstallationRegistry } from '@dotfiles/registry/tool';
import { dedentString, getCliBinPath, resolvePlatformConfig } from '@dotfiles/utils';
import path from 'node:path';
import type { IGenerateShimsOptions, IShimGenerator } from './IShimGenerator';
import { messages } from './log-messages';

/**
 * Generates executable shims for tools.
 *
 * The core logic of the generated Bash shims is to first check for the
 * existence of the target binary. If it's not found, the shim executes the main
 * generator CLI's `install` command to perform an on-demand installation.
 * After a successful installation, it proceeds to execute the actual tool.
 * This ensures that tools are available when needed without requiring
 * them to be installed beforehand.
 *
 * For externally managed tools (e.g., Homebrew), symlinks to the real binaries
 * are created instead of bash shim scripts. This avoids PATH clobbering issues
 * where the shim would intercept the binary lookup.
 */
export class ShimGenerator implements IShimGenerator {
  private readonly fs: IFileSystem;
  private readonly config: ProjectConfig;
  private readonly logger: TsLogger;
  private readonly systemInfo: ISystemInfo;
  private readonly externallyManagedMethods: Set<string>;
  private readonly toolInstallationRegistry?: IToolInstallationRegistry;

  private isConfigurationOnlyToolConfig(toolConfig: ToolConfig): boolean {
    const isManual = toolConfig.installationMethod === 'manual';
    const hasNoInstallParams = !toolConfig.installParams || Object.keys(toolConfig.installParams).length === 0;
    const hasNoBinaries = !toolConfig.binaries || toolConfig.binaries.length === 0;
    const result: boolean = isManual && hasNoInstallParams && hasNoBinaries;
    return result;
  }

  /**
   * Creates a new ShimGenerator instance.
   *
   * @param parentLogger - The parent logger for creating sub-loggers.
   * @param fileSystem - The file system interface for file operations.
   * @param config - The YAML configuration containing paths and settings.
   * @param systemInfo - The current system information for platform resolution.
   * @param externallyManagedMethods - Set of installation method names that are externally managed.
   * @param toolInstallationRegistry - Registry for checking if tools are already installed.
   */
  constructor(
    parentLogger: TsLogger,
    fileSystem: IFileSystem,
    config: ProjectConfig,
    systemInfo: ISystemInfo,
    externallyManagedMethods?: Set<string>,
    toolInstallationRegistry?: IToolInstallationRegistry,
  ) {
    const logger = parentLogger.getSubLogger({ name: 'ShimGenerator' });
    this.logger = logger;
    const constructorLogger = logger.getSubLogger({ name: 'constructor' });
    constructorLogger.debug(messages.constructor.initialized());
    this.fs = fileSystem;
    this.config = config;
    this.systemInfo = systemInfo;
    this.externallyManagedMethods = externallyManagedMethods ?? new Set();
    this.toolInstallationRegistry = toolInstallationRegistry;
  }

  /**
   * @inheritdoc IShimGenerator.generate
   */
  async generate(toolConfigs: Record<string, ToolConfig>, options?: IGenerateShimsOptions): Promise<string[]> {
    const logger = this.logger.getSubLogger({ name: 'generate' });
    const generatedShimPaths: string[] = [];

    for (const toolName in toolConfigs) {
      if (Object.hasOwn(toolConfigs, toolName)) {
        const toolConfig = toolConfigs[toolName];
        if (toolConfig) {
          const shimPaths = await this.generateForTool(toolName, toolConfig, options);
          generatedShimPaths.push(...shimPaths);
        } else {
          logger.debug(messages.generate.missingToolConfig(toolName));
        }
      }
    }
    return generatedShimPaths;
  }

  /**
   * @inheritdoc IShimGenerator.generateForTool
   */
  async generateForTool(toolName: string, toolConfig: ToolConfig, options?: IGenerateShimsOptions): Promise<string[]> {
    const logger = this.logger.getSubLogger({ name: 'generateForTool', context: toolName });
    // Create a tool-specific TrackedFileSystem if we have a TrackedFileSystem instance
    const toolFs = this.fs instanceof TrackedFileSystem ? this.fs.withToolName(toolName) : this.fs;

    const toolFileSystemName = toolFs.constructor.name;
    logger.debug(messages.generateForTool.started(toolName, toolFileSystemName));

    // Resolve platform-specific configurations before processing
    const resolvedConfig = resolvePlatformConfig(toolConfig, this.systemInfo);

    const generatedShimPaths: string[] = [];
    const overwrite = options?.overwrite ?? false;
    const overwriteConflicts = options?.overwriteConflicts ?? false;

    if (this.isConfigurationOnlyToolConfig(resolvedConfig)) {
      return generatedShimPaths;
    }

    // Manual tools without binaryPath can't produce binaries in the staging dir.
    // The command should come from shell functions, not a shim.
    if (resolvedConfig.installationMethod === 'manual' && !resolvedConfig.installParams?.binaryPath) {
      logger.warn(messages.generateForTool.skippedManualNoBinaryPath());
      return generatedShimPaths;
    }

    // For externally managed tools (e.g., Homebrew), only generate shims if not yet installed.
    // After installation, the tool's binaries are in their own PATH location (e.g., /opt/homebrew/bin).
    if (this.externallyManagedMethods.has(resolvedConfig.installationMethod)) {
      if (!this.toolInstallationRegistry) {
        logger.debug(messages.generateForTool.skippedExternallyManaged(toolName, resolvedConfig.installationMethod));
        return generatedShimPaths;
      }
      const isInstalled = await this.toolInstallationRegistry.isToolInstalled(toolName);
      if (isInstalled) {
        logger.debug(messages.generateForTool.skippedAlreadyInstalled(toolName));
        return generatedShimPaths;
      }
    }

    // Get list of binaries to generate shims for
    // If no binaries are defined (i.e., .bin() was never called), skip shim generation entirely
    const binaries = resolvedConfig.binaries && resolvedConfig.binaries.length > 0
      ? resolvedConfig.binaries
      : [];

    if (binaries.length === 0) {
      logger.debug(messages.generateForTool.skippedNoBinaries(toolName));
      return generatedShimPaths;
    }

    const binaryNames = binaries.map((binary) => (typeof binary === 'string' ? binary : binary.name));

    // Generate a shim for each binary
    for (const binaryName of binaryNames) {
      const shimPath = await this.generateShimForBinary(
        toolFs,
        toolName,
        toolConfig,
        binaryName,
        overwrite,
        overwriteConflicts,
      );
      if (shimPath) {
        generatedShimPaths.push(shimPath);
      }
    }

    return generatedShimPaths;
  }

  /**
   * Generates a shim file for a specific binary.
   *
   * @param toolFs - The file system interface (may be tool-specific tracked FS).
   * @param toolName - The name of the tool.
   * @param _toolConfig - The tool configuration (unused currently).
   * @param binaryName - The name of the binary to generate a shim for.
   * @param overwrite - Whether to overwrite existing shims created by the generator.
   * @param overwriteConflicts - Whether to overwrite conflicting files not created by the generator.
   * @returns The path to the generated shim, or null if generation was skipped.
   */
  private async generateShimForBinary(
    toolFs: IFileSystem,
    toolName: string,
    _toolConfig: ToolConfig,
    binaryName: string,
    overwrite: boolean,
    overwriteConflicts: boolean,
  ): Promise<string | null> {
    const logger = this.logger.getSubLogger({ name: 'generateShimForBinary' });
    const shimDir = this.config.paths.targetDir;
    const shimFilePath = path.join(shimDir, binaryName);

    logger.debug(messages.generateShim.resolvedShimPath(shimFilePath));

    if (await toolFs.exists(shimFilePath)) {
      // Check if the existing file is one of our shims
      const isOurShim = await this.isGeneratedShim(toolFs, shimFilePath);

      if (!isOurShim) {
        if (!overwriteConflicts) {
          // Not our shim and overwriteConflicts is false - log error and skip
          logger.error(messages.generateShim.conflictingFile(toolName, shimFilePath));
          return null;
        }
        // overwriteConflicts is true - continue to overwrite the conflicting file
        logger.debug(messages.generateShim.overwritingConflict(shimFilePath));
      } else if (!overwrite) {
        // It's our shim but overwrite is false - skip silently
        logger.debug(messages.generateShim.existingShim(shimFilePath));
        return null;
      }

      // It's our shim and overwrite is true - continue to overwrite
    }

    // Use the stable current symlink folder for execution
    const toolBinaryPath = path.join(this.config.paths.binariesDir, toolName, 'current', binaryName);

    logger.debug(messages.generateShim.resolvedBinaryPath(toolName, binaryName, toolBinaryPath));

    const envVarSuffix = toolName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

    const shimContent = dedentString(`
      #!/usr/bin/env bash
      # Shim for ${binaryName}
      # Generated by Dotfiles Management Tool

      set -euo pipefail

      TOOL_NAME="${toolName}"
      BINARY_NAME="${binaryName}"
      TOOL_EXECUTABLE="${toolBinaryPath}"
      GENERATOR_CLI_EXECUTABLE="${getCliBinPath()}"
      CONFIG_PATH="${this.config.configFilePath}"

      # Check for recursion
      RECURSION_ENV_VAR="DOTFILES_INSTALLING_${envVarSuffix}"

      if [ -n "\${!RECURSION_ENV_VAR:-}" ]; then
        echo "Recursive installation detected for $TOOL_NAME. Aborting to prevent infinite loop." >&2
        exit 1
      fi

      # Record shim usage in the background (non-blocking)
      if [ "\${DOTFILES_USAGE_TRACKING:-1}" != "0" ]; then
        # Use eval to properly handle GENERATOR_CLI_EXECUTABLE with spaces
        eval "$GENERATOR_CLI_EXECUTABLE" @track-usage '"$TOOL_NAME"' '"$BINARY_NAME"' --config '"$CONFIG_PATH"' >/dev/null 2>&1 &
      fi

      # Check if the first argument is @update
      if [ $# -gt 0 ] && [ "$1" = "@update" ]; then
        echo "Updating $TOOL_NAME to latest version..."
        # Use eval to properly handle GENERATOR_CLI_EXECUTABLE with spaces
        eval "$GENERATOR_CLI_EXECUTABLE" update --shim-mode --config '"$CONFIG_PATH"' '"$TOOL_NAME"'
        exit $?
      fi

      # Check if tool exists and execute it
      if [ -x "$TOOL_EXECUTABLE" ]; then
        exec "$TOOL_EXECUTABLE" "$@"
      else
        # Tool not found, try to install it
        # Use eval to properly handle GENERATOR_CLI_EXECUTABLE with spaces
        # Let stderr (progress bars) pass through to the user
        # Temporarily disable set -e to handle install failures gracefully
        set +e
        eval "$GENERATOR_CLI_EXECUTABLE" install --shim-mode --config '"$CONFIG_PATH"' '"$TOOL_NAME"'
        install_exit_code=$?
        set -e

        if [ $install_exit_code -eq 0 ]; then
          # Installation successful, try to execute binary again
          if [ -x "$TOOL_EXECUTABLE" ]; then
            exec "$TOOL_EXECUTABLE" "$@"
          else
            echo "Installation completed but binary not found at: $TOOL_EXECUTABLE" >&2
            exit 1
          fi
        else
          # Installation failed, exit with the same code
          exit $install_exit_code
        fi
      fi
    `);

    logger.debug(messages.generateShim.generatedContent(binaryName));

    // Directory creation must be attributed to the system, not the tool.
    // This enables clean undo semantics (a future delete command can replay tool changes separately).
    await this.fs.ensureDir(path.dirname(shimFilePath));
    await toolFs.writeFile(shimFilePath, shimContent);

    // Only chmod if file doesn't already have the correct permissions
    const desiredMode = 0o755; // rwxr-xr-x
    try {
      const stats = await toolFs.stat(shimFilePath);
      const currentMode = stats.mode & 0o777; // Extract permission bits
      if (currentMode !== desiredMode) {
        await toolFs.chmod(shimFilePath, desiredMode);
      }
    } catch {
      // If we can't check permissions, try to set them anyway
      await toolFs.chmod(shimFilePath, desiredMode);
    }
    logger.debug(messages.generateShim.success(binaryName, shimFilePath, toolFs.constructor.name));
    return shimFilePath;
  }

  /**
   * Checks if a file is a shim generated by the dotfiles management tool.
   *
   * @param fs - The filesystem interface to use.
   * @param filePath - The path to the file to check.
   * @returns True if the file is one of our generated shims, false otherwise.
   */
  private async isGeneratedShim(fs: IFileSystem, filePath: string): Promise<boolean> {
    try {
      // Symlinks created by installer plugins at install time are also "ours"
      try {
        const stats = await fs.lstat(filePath);
        if (stats.isSymbolicLink()) {
          return true;
        }
      } catch {
        // lstat failed — fall through to content check
      }

      const content = await fs.readFile(filePath, 'utf8');
      // Check for our distinctive header comment
      return content.includes('# Generated by Dotfiles Management Tool');
    } catch {
      // If we can't read the file, assume it's not our shim
      return false;
    }
  }
}
