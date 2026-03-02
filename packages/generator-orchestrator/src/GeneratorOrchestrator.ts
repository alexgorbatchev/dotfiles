import type { ProjectConfig } from '@dotfiles/config';
import type {
  BaseInstallParams,
  ICompletionContext,
  ISystemInfo,
  ShellCompletionConfig,
  ShellCompletionConfigInput,
  ShellCompletionConfigValue,
  ShellType,
  ToolConfig,
} from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import type { IFileRegistry, IFileState, TrackedFileSystem } from '@dotfiles/registry/file';
import type {
  ICompletionGenerationContext,
  ICompletionGenerator,
  IGenerateShellInitOptions,
  IShellInitGenerator,
  PluginShellInitMap,
} from '@dotfiles/shell-init-generator';
import type { IGenerateShimsOptions, IShimGenerator } from '@dotfiles/shim-generator';
import type { IGenerateSymlinksOptions, ISymlinkGenerator, SymlinkOperationResult } from '@dotfiles/symlink-generator';
import { resolveValue } from '@dotfiles/unwrap-value';
import { resolvePlatformConfig } from '@dotfiles/utils';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { IAutoInstaller, IGenerateAllOptions, IGeneratorOrchestrator } from './IGeneratorOrchestrator';
import { messages } from './log-messages';
import { orderToolConfigsByDependencies } from './orderToolConfigsByDependencies';

/**
 * File types that should be cleaned up when a tool is disabled.
 * Binary files are intentionally excluded to preserve downloaded tools.
 */
const CLEANABLE_FILE_TYPES: Set<IFileState['fileType']> = new Set(['shim', 'symlink', 'completion']);

/**
 * Orchestrates the generation of all dotfiles artifacts.
 *
 * This class coordinates the generation of shims, shell initialization scripts,
 * and symlinks by delegating to the respective generator services. It ensures
 * that all artifacts are created in the correct order and that file operations
 * are properly tracked for cleanup and auditing purposes.
 */
export class GeneratorOrchestrator implements IGeneratorOrchestrator {
  private readonly logger: TsLogger;
  private readonly shimGenerator: IShimGenerator;
  private readonly shellInitGenerator: IShellInitGenerator;
  private readonly symlinkGenerator: ISymlinkGenerator;
  private readonly completionGenerator: ICompletionGenerator;
  private readonly systemInfo: ISystemInfo;
  private readonly projectConfig: ProjectConfig;
  private readonly fileRegistry: IFileRegistry;
  private readonly fs: IFileSystem;
  private readonly completionTrackedFs: TrackedFileSystem;

  /**
   * Creates a new GeneratorOrchestrator instance.
   *
   * @param parentLogger - The parent logger for creating sub-loggers.
   * @param shimGenerator - The shim generator service.
   * @param shellInitGenerator - The shell initialization generator service.
   * @param symlinkGenerator - The symlink generator service.
   * @param completionGenerator - The completion generator service.
   * @param systemInfo - System information for platform-specific operations.
   * @param projectConfig - Project configuration containing paths and settings.
   * @param fileRegistry - Registry for tracking file operations.
   * @param fs - Filesystem interface for file operations.
   * @param completionTrackedFs - Tracked filesystem for completion operations.
   */
  constructor(
    parentLogger: TsLogger,
    shimGenerator: IShimGenerator,
    shellInitGenerator: IShellInitGenerator,
    symlinkGenerator: ISymlinkGenerator,
    completionGenerator: ICompletionGenerator,
    systemInfo: ISystemInfo,
    projectConfig: ProjectConfig,
    fileRegistry: IFileRegistry,
    fs: IFileSystem,
    completionTrackedFs: TrackedFileSystem,
  ) {
    this.logger = parentLogger.getSubLogger({ name: 'GeneratorOrchestrator' });
    const logger = this.logger.getSubLogger({ name: 'constructor' });
    logger.debug(messages.constructor.initialized());
    this.shimGenerator = shimGenerator;
    this.shellInitGenerator = shellInitGenerator;
    this.symlinkGenerator = symlinkGenerator;
    this.completionGenerator = completionGenerator;
    this.systemInfo = systemInfo;
    this.projectConfig = projectConfig;
    this.fileRegistry = fileRegistry;
    this.fs = fs;
    this.completionTrackedFs = completionTrackedFs;
  }

  /**
   * Checks if the current hostname matches the tool's hostname pattern.
   * @param pattern - The hostname pattern (literal string or regex pattern)
   * @returns true if the hostname matches, false otherwise
   */
  private matchesHostname(pattern: string): boolean {
    const currentHostname = this.systemInfo.hostname;

    // Check if pattern is a regex (starts and ends with /)
    if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
      const lastSlash = pattern.lastIndexOf('/');
      const regexBody = pattern.slice(1, lastSlash);
      const flags = pattern.slice(lastSlash + 1);
      try {
        const regex = new RegExp(regexBody, flags);
        return regex.test(currentHostname);
      } catch {
        // Invalid regex, treat as literal string
        return currentHostname === pattern;
      }
    }

    // Treat as regex source if it looks like a regex pattern
    try {
      const regex = new RegExp(pattern);
      return regex.test(currentHostname);
    } catch {
      // If regex compilation fails, do exact match
      return currentHostname === pattern;
    }
  }

  /**
   * @inheritdoc IGeneratorOrchestrator.generateAll
   */
  async generateAll(toolConfigs: Record<string, ToolConfig>, options?: IGenerateAllOptions): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'generateAll' });

    // Filter out disabled tools and hostname mismatches, cleanup their artifacts
    const enabledToolConfigs: Record<string, ToolConfig> = {};
    for (const [name, config] of Object.entries(toolConfigs)) {
      if (config.disabled) {
        logger.warn(messages.generateAll.toolDisabled(name));
        // Clean up artifacts for disabled tools
        await this.cleanupToolArtifacts(name);
        continue;
      }

      // Check hostname restriction
      if (config.hostname && !this.matchesHostname(config.hostname)) {
        logger.warn(messages.generateAll.toolHostnameMismatch(name, config.hostname, this.systemInfo.hostname));
        // Clean up artifacts for hostname-mismatched tools
        await this.cleanupToolArtifacts(name);
        continue;
      }

      enabledToolConfigs[name] = config;
    }

    // Clean up orphaned tools (tools that exist in the registry but no longer have config files)
    await this.cleanupOrphanedTools(toolConfigs);

    const orderedToolConfigs: Record<string, ToolConfig> = orderToolConfigsByDependencies(
      this.logger,
      enabledToolConfigs,
      this.systemInfo,
    );

    const toolConfigsCount = Object.keys(orderedToolConfigs).length;
    logger.debug(messages.generateAll.parsedOptions(toolConfigsCount));

    // 0. Auto-install tools with auto: true in their install params
    const pluginShellInit: PluginShellInitMap = await this.runAutoInstalls(orderedToolConfigs, options?.installer);

    // 1. Generate Shims
    const shimOptions: IGenerateShimsOptions = { overwrite: true, overwriteConflicts: options?.overwrite };
    logger.debug(messages.generateAll.shimGenerate());
    const generatedShimsPaths = await this.shimGenerator.generate(orderedToolConfigs, shimOptions);
    const shimCount = generatedShimsPaths?.length ?? 0;
    logger.debug(messages.generateAll.shimGenerationComplete(shimCount));

    // 2. Generate Shell Init for all supported shells
    const shellInitOptions: IGenerateShellInitOptions = {
      shellTypes: ['zsh', 'bash', 'powershell'],
      systemInfo: this.systemInfo,
      pluginShellInit,
    };
    logger.debug(messages.generateAll.shellGenerate());
    const shellInitResult = await this.shellInitGenerator.generate(orderedToolConfigs, shellInitOptions);
    const primaryPath = shellInitResult?.primaryPath ?? 'null';
    logger.debug(messages.generateAll.shellInitComplete(primaryPath));

    // 3. Generate Symlinks
    const symlinkOptions: IGenerateSymlinksOptions = { overwrite: true, backup: true };
    const symlinkResults: SymlinkOperationResult[] = await this.symlinkGenerator.generate(
      orderedToolConfigs,
      symlinkOptions,
    );
    const symlinkResultCount = symlinkResults?.length ?? 0;
    logger.debug(messages.generateAll.symlinkGenerationComplete(symlinkResultCount));

    // 4. Clean up stale symlinks for enabled tools
    await this.cleanupStaleSymlinks(orderedToolConfigs, symlinkResults);
  }

  /**
   * Runs auto-install for tools that have `auto: true` in their install params.
   * Returns a map of shellInit content emitted by installers for use in shell init generation.
   *
   * @param toolConfigs - The tool configurations to process.
   * @param installer - Optional installer for auto-install operations.
   * @returns Map of tool names to their emitted shellInit content.
   */
  private async runAutoInstalls(
    toolConfigs: Record<string, ToolConfig>,
    installer?: IAutoInstaller,
  ): Promise<PluginShellInitMap> {
    const logger = this.logger.getSubLogger({ name: 'runAutoInstalls' });
    const pluginShellInit: PluginShellInitMap = {};

    if (!installer) {
      return pluginShellInit;
    }

    for (const [toolName, toolConfig] of Object.entries(toolConfigs)) {
      const installParams = toolConfig.installParams as BaseInstallParams | undefined;
      const shouldAutoInstall = installParams?.auto === true;

      if (!shouldAutoInstall) {
        continue;
      }

      // Call installer - it will return "already-installed" with shellInit if already installed
      const result = await installer.install(toolName, toolConfig);

      if (!result.success) {
        continue;
      }

      // Only log when actually installed (not when already-installed)
      if (result.installationMethod !== 'already-installed') {
        logger.info(messages.autoInstall.completed(toolName));
      }

      // Collect shellInit from successful install
      if (result.shellInit) {
        pluginShellInit[toolName] = result.shellInit;
      }
    }

    return pluginShellInit;
  }

  /**
   * @inheritdoc IGeneratorOrchestrator.generateCompletionsForTool
   */
  async generateCompletionsForTool(
    toolName: string,
    toolConfig: ToolConfig,
    version?: string,
    binaryPaths?: string[],
  ): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'generateCompletionsForTool' }).setPrefix(toolName);
    const resolvedConfig = resolvePlatformConfig(toolConfig, this.systemInfo);
    const shellTypes: ShellType[] = ['zsh', 'bash', 'powershell'];
    // Use provided version, or fall back to toolConfig.version
    const resolvedVersion = version ?? resolvedConfig.version;

    for (const shellType of shellTypes) {
      const shellConfig = resolvedConfig.shellConfigs?.[shellType];
      // Cast from unknown (Zod schema) to ShellCompletionConfigInput (runtime type)
      const completionInput = shellConfig?.completions as ShellCompletionConfigInput | undefined;

      if (!completionInput) {
        continue;
      }

      try {
        const currentDir = path.join(this.projectConfig.paths.binariesDir, toolName, 'current');

        // Build context for resolving completions callback (only version is exposed to user)
        const completionContext: ICompletionContext = {
          version: resolvedVersion,
        };

        // Resolve the completion config (handles static values and callbacks)
        const resolvedCompletionValue: ShellCompletionConfigValue = await resolveValue(
          completionContext,
          completionInput,
        );

        // Convert to ShellCompletionConfig format
        const completionConfig = this.normalizeCompletionConfig(resolvedCompletionValue);

        // Skip if no valid completion config after resolution
        if (!completionConfig.cmd && !completionConfig.source && !completionConfig.url) {
          continue;
        }

        // Build full generation context with internal fields
        const generationContext: ICompletionGenerationContext = {
          ...completionContext,
          homeDir: this.projectConfig.paths.homeDir,
          shellScriptsDir: this.projectConfig.paths.shellScriptsDir,
          toolInstallDir: currentDir,
          toolName,
          configFilePath: toolConfig.configFilePath,
          binaryPaths,
        };

        // Create a per-tool tracked filesystem for proper attribution
        const toolTrackedFs = this.completionTrackedFs.withContext({ toolName });

        const completionResult = await this.completionGenerator.generateAndWriteCompletionFile({
          config: completionConfig,
          toolName,
          shellType,
          context: generationContext,
          fs: toolTrackedFs,
        });

        logger.info(messages.generateAll.completionGeneratedAtPath(completionResult.targetPath));
      } catch {
        logger.warn(messages.generateAll.completionGenerationFailed(toolName, shellType));
      }
    }
  }

  /**
   * Normalizes a resolved completion config value to the internal config format.
   */
  private normalizeCompletionConfig(value: ShellCompletionConfigValue): ShellCompletionConfig {
    if (typeof value === 'string') {
      const result: ShellCompletionConfig = { source: value };
      return result;
    }

    // Determine which discriminated union variant we have
    if ('cmd' in value) {
      // IShellCompletionCmdConfig
      const result: ShellCompletionConfig = {
        cmd: value.cmd,
        ...(value.bin && { bin: value.bin }),
      };
      return result;
    }

    if ('url' in value) {
      // IShellCompletionUrlConfig
      const result: ShellCompletionConfig = {
        url: value.url,
        ...(value.source && { source: value.source }),
        ...(value.bin && { bin: value.bin }),
      };
      return result;
    }

    // IShellCompletionSourceConfig
    const result: ShellCompletionConfig = {
      source: value.source,
      ...(value.bin && { bin: value.bin }),
    };
    return result;
  }

  /**
   * Cleans up artifacts for tools that exist in the registry but no longer have configuration files.
   * These are "orphaned" tools whose tool.ts files were removed.
   *
   * @param toolConfigs - The current set of all tool configurations (including disabled ones).
   */
  private async cleanupOrphanedTools(toolConfigs: Record<string, ToolConfig>): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'cleanupOrphanedTools' });

    const registeredTools = await this.fileRegistry.getRegisteredTools();
    const configuredToolNames = new Set(Object.keys(toolConfigs));

    const orphanedTools = registeredTools.filter(
      (toolName) => toolName !== 'system' && !configuredToolNames.has(toolName),
    );

    if (orphanedTools.length === 0) {
      return;
    }

    logger.warn(messages.orphanCleanup.found(orphanedTools.length));

    for (const toolName of orphanedTools) {
      const toolLogger: TsLogger = logger.getSubLogger({ name: 'cleanupOrphanedTools', context: toolName });
      toolLogger.warn(messages.orphanCleanup.cleaningUp());
      await this.cleanupToolArtifacts(toolName);
    }
  }

  /**
   * Cleans up generated artifacts for a tool.
   *
   * This removes shims, symlinks, and completions that were generated for the tool,
   * while preserving downloaded binaries. Used when a tool is disabled to ensure
   * its contributions are removed from the system.
   *
   * @param toolName - The name of the tool to clean up.
   */
  async cleanupToolArtifacts(toolName: string): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'cleanupToolArtifacts', context: toolName });
    logger.debug(messages.cleanup.started(toolName));

    // Get all file states for this tool from the registry
    const fileStates = await this.fileRegistry.getFileStatesForTool(toolName);

    // Filter for cleanable file types (shims, symlinks, completions - NOT binaries)
    const filesToCleanup = fileStates.filter((state) => CLEANABLE_FILE_TYPES.has(state.fileType));

    if (filesToCleanup.length === 0) {
      logger.debug(messages.cleanup.noFilesToCleanup(toolName));
      return;
    }

    logger.debug(messages.cleanup.filesFound(toolName, filesToCleanup.length));

    // Delete each file
    for (const fileState of filesToCleanup) {
      try {
        const fileExists = await this.fs.exists(fileState.filePath);
        if (fileExists) {
          await this.fs.rm(fileState.filePath);
          logger.warn(messages.cleanup.fileDeleted(fileState.filePath, fileState.fileType));
        }
      } catch (error) {
        logger.debug(messages.cleanup.deleteError(fileState.filePath, error));
      }
    }

    logger.debug(messages.cleanup.completed(toolName, filesToCleanup.length));
  }

  /**
   * Cleans up stale symlinks for enabled tools.
   *
   * After symlinks are generated, this method compares the set of currently declared
   * symlinks against previously tracked symlinks in the FileRegistry. Any tracked
   * symlink that is no longer declared is removed from disk.
   *
   * @param toolConfigs - The enabled tool configurations that were just processed.
   * @param symlinkResults - The results from symlink generation.
   */
  private async cleanupStaleSymlinks(
    toolConfigs: Record<string, ToolConfig>,
    symlinkResults: SymlinkOperationResult[],
  ): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'cleanupStaleSymlinks' });

    const generatedTargetPaths: Set<string> = new Set(
      symlinkResults.filter((r) => r.success).map((r) => r.targetPath),
    );

    const binariesDir = this.projectConfig.paths.binariesDir;

    for (const toolName of Object.keys(toolConfigs)) {
      const fileStates = await this.fileRegistry.getFileStatesForTool(toolName);
      const trackedSymlinks = fileStates.filter(
        (state) =>
          state.fileType === 'symlink' &&
          state.lastOperation === 'symlink' &&
          !state.filePath.startsWith(binariesDir),
      );

      for (const trackedSymlink of trackedSymlinks) {
        if (generatedTargetPaths.has(trackedSymlink.filePath)) {
          continue;
        }

        logger.warn(messages.staleSymlinkCleanup.removing(trackedSymlink.filePath, toolName));

        try {
          // Use lstat (not exists) to detect broken symlinks — exists follows
          // the symlink and returns false when the target is missing.
          try {
            await this.fs.lstat(trackedSymlink.filePath);
            await this.fs.rm(trackedSymlink.filePath);
          } catch {
            // File/symlink doesn't exist on disk, nothing to delete
          }
          await this.fileRegistry.recordOperation({
            toolName,
            operationType: 'rm',
            filePath: trackedSymlink.filePath,
            fileType: 'symlink',
            operationId: randomUUID(),
          });
        } catch (error) {
          logger.debug(messages.cleanup.deleteError(trackedSymlink.filePath, error));
        }
      }
    }
  }
}
