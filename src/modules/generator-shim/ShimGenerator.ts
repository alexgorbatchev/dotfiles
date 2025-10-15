import path from 'node:path';
import type { YamlConfig } from '@modules/config';
import { TrackedFileSystem } from '@modules/file-registry';
import type { IFileSystem } from '@modules/file-system';
import type { TsLogger } from '@modules/logger';
import type { ToolConfig } from '@types';
import { dedentString, getCliBinPath } from '@utils';
import type { GenerateShimsOptions, IShimGenerator } from './IShimGenerator';
import { shimGeneratorLogMessages } from './log-messages';

/**
 * Generates executable shims for tools.
 *
 * The core logic of the generated Bash shims is to first check for the
 * existence of the target binary. If it's not found, the shim executes the main
 * generator CLI's `install` command to perform an on-demand installation.
 * After a successful installation, it proceeds to execute the actual tool.
 * This ensures that tools are available when needed without requiring
 * them to be installed beforehand.
 */
export class ShimGenerator implements IShimGenerator {
  private readonly fs: IFileSystem;
  private readonly config: YamlConfig;
  private readonly logger: TsLogger;

  constructor(parentLogger: TsLogger, fileSystem: IFileSystem, config: YamlConfig) {
    const logger = parentLogger.getSubLogger({ name: 'ShimGenerator' });
    this.logger = logger;
    const constructorLogger = logger.getSubLogger({ name: 'constructor' });
    constructorLogger.debug(shimGeneratorLogMessages.constructor.initialized(), fileSystem, config);
    this.fs = fileSystem;
    this.config = config;
  }

  async generate(toolConfigs: Record<string, ToolConfig>, options?: GenerateShimsOptions): Promise<string[]> {
    const logger = this.logger.getSubLogger({ name: 'generate' });
    const fileSystemName = this.fs.constructor.name;
    logger.debug(shimGeneratorLogMessages.generate.started(fileSystemName), toolConfigs, options);
    const generatedShimPaths: string[] = [];

    for (const toolName in toolConfigs) {
      if (Object.hasOwn(toolConfigs, toolName)) {
        const toolConfig = toolConfigs[toolName];
        if (toolConfig) {
          const shimPaths = await this.generateForTool(toolName, toolConfig, options);
          generatedShimPaths.push(...shimPaths);
        } else {
          logger.debug(shimGeneratorLogMessages.generate.missingToolConfig(toolName));
        }
      }
    }
    return generatedShimPaths;
  }

  async generateForTool(toolName: string, toolConfig: ToolConfig, options?: GenerateShimsOptions): Promise<string[]> {
    const logger = this.logger.getSubLogger({ name: 'generateForTool' });
    // Create a tool-specific TrackedFileSystem if we have a TrackedFileSystem instance
    const toolFs = this.fs instanceof TrackedFileSystem ? this.fs.withToolName(toolName) : this.fs;

    const toolFileSystemName = toolFs.constructor.name;
    logger.debug(
      shimGeneratorLogMessages.generateForTool.started(toolName, toolFileSystemName),
      toolConfig,
      options
    );

    const generatedShimPaths: string[] = [];
    const overwrite = options?.overwrite ?? false;

    // Get list of binaries to generate shims for
    const binaries = toolConfig.binaries && toolConfig.binaries.length > 0 ? toolConfig.binaries : [toolName]; // Fallback to toolName if no binaries specified
    const binaryNames = binaries.map((binary) => (typeof binary === 'string' ? binary : binary.name));

    // Generate a shim for each binary
    for (const binaryName of binaryNames) {
      const shimPath = await this.generateShimForBinary(toolFs, toolName, toolConfig, binaryName, overwrite);
      if (shimPath) {
        generatedShimPaths.push(shimPath);
      }
    }

    return generatedShimPaths;
  }

  private async generateShimForBinary(
    toolFs: IFileSystem,
    toolName: string,
    _toolConfig: ToolConfig,
    binaryName: string,
    overwrite: boolean
  ): Promise<string | null> {
    const logger = this.logger.getSubLogger({ name: 'generateShimForBinary' });
    const shimDir = this.config.paths.targetDir;
    const shimFilePath = path.join(shimDir, binaryName);

    logger.debug(shimGeneratorLogMessages.generateShim.resolvedShimPath(shimFilePath));

    if (await toolFs.exists(shimFilePath)) {
      // Check if the existing file is one of our shims
      const isOurShim = await this.isGeneratedShim(toolFs, shimFilePath);

      if (!isOurShim) {
        // Not our shim - log error and skip
        logger.error(shimGeneratorLogMessages.generateShim.conflictingFile(toolName, shimFilePath));
        return null;
      }

      if (!overwrite) {
        // It's our shim but overwrite is false - skip silently
        logger.debug(shimGeneratorLogMessages.generateShim.existingShim(shimFilePath));
        return null;
      }

      // It's our shim and overwrite is true - continue to overwrite
    }

    // Use the new symlink-based path structure
    const toolBinaryPath = path.join(this.config.paths.binariesDir, toolName, binaryName);

    logger.debug(
      shimGeneratorLogMessages.generateShim.resolvedBinaryPath(toolName, binaryName, toolBinaryPath)
    );

    const shimContent = dedentString(`
      #!/usr/bin/env bash
      # Shim for ${binaryName}
      # Generated by Dotfiles Management Tool

      set -euo pipefail

      TOOL_NAME="${toolName}"
      TOOL_EXECUTABLE="${toolBinaryPath}"
      GENERATOR_CLI_EXECUTABLE="${getCliBinPath()}"
      CONFIG_PATH="${this.config.userConfigPath}"

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
  logger.debug(shimGeneratorLogMessages.generateShim.generatedContent(binaryName), shimContent);

    // File system operations' behavior (dry or real) is determined by the injected IFileSystem.
    await toolFs.ensureDir(path.dirname(shimFilePath));
    await toolFs.writeFile(shimFilePath, shimContent);

    // Only chmod if file doesn't already have the correct permissions
    const desiredMode = 0o755; // rwxr-xr-x
    try {
      const stats = await toolFs.stat(shimFilePath);
      const currentMode = stats.mode & 0o777; // Extract permission bits
      if (currentMode !== desiredMode) {
        await toolFs.chmod(shimFilePath, desiredMode);
      }
    } catch (_error) {
      // If we can't check permissions, try to set them anyway
      await toolFs.chmod(shimFilePath, desiredMode);
    }
    logger.debug(
      shimGeneratorLogMessages.generateShim.success(binaryName, shimFilePath, toolFs.constructor.name),
      toolFs
    );
    return shimFilePath;
  }

  /**
   * Checks if a file is a shim generated by our dotfiles management tool.
   * @param fs The filesystem interface to use
   * @param filePath The path to the file to check
   * @returns true if the file is one of our generated shims, false otherwise
   */
  private async isGeneratedShim(fs: IFileSystem, filePath: string): Promise<boolean> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      // Check for our distinctive header comment
      return content.includes('# Generated by Dotfiles Management Tool');
    } catch (_error) {
      // If we can't read the file, assume it's not our shim
      return false;
    }
  }
}
