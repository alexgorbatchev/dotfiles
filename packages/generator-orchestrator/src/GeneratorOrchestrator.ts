import path from 'node:path';
import type { ProjectConfig } from '@dotfiles/config';
import type {
  ICompletionContext,
  ISystemInfo,
  ShellCompletionConfig,
  ShellCompletionConfigInput,
  ShellCompletionConfigValue,
  ShellType,
  ToolConfig,
} from '@dotfiles/core';
import type { TsLogger } from '@dotfiles/logger';
import type {
  ICompletionGenerationContext,
  ICompletionGenerator,
  IGenerateShellInitOptions,
  IShellInitGenerator,
} from '@dotfiles/shell-init-generator';
import type { IGenerateShimsOptions, IShimGenerator } from '@dotfiles/shim-generator';
import type { IGenerateSymlinksOptions, ISymlinkGenerator, SymlinkOperationResult } from '@dotfiles/symlink-generator';
import { resolveValue } from '@dotfiles/unwrap-value';
import { resolvePlatformConfig } from '@dotfiles/utils';
import type { IGenerateAllOptions, IGeneratorOrchestrator } from './IGeneratorOrchestrator';
import { messages } from './log-messages';
import { orderToolConfigsByDependencies } from './orderToolConfigsByDependencies';

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
   */
  constructor(
    parentLogger: TsLogger,
    shimGenerator: IShimGenerator,
    shellInitGenerator: IShellInitGenerator,
    symlinkGenerator: ISymlinkGenerator,
    completionGenerator: ICompletionGenerator,
    systemInfo: ISystemInfo,
    projectConfig: ProjectConfig
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
  }

  /**
   * @inheritdoc IGeneratorOrchestrator.generateAll
   */
  async generateAll(toolConfigs: Record<string, ToolConfig>, options?: IGenerateAllOptions): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'generateAll' });

    // Filter out disabled tools with warning
    const enabledToolConfigs: Record<string, ToolConfig> = {};
    for (const [name, config] of Object.entries(toolConfigs)) {
      if (config.disabled) {
        logger.warn(messages.generateAll.toolDisabled(name));
        continue;
      }
      enabledToolConfigs[name] = config;
    }

    const orderedToolConfigs: Record<string, ToolConfig> = orderToolConfigsByDependencies(
      this.logger,
      enabledToolConfigs,
      this.systemInfo
    );

    const toolConfigsCount = Object.keys(orderedToolConfigs).length;
    logger.debug(messages.generateAll.parsedOptions(toolConfigsCount));

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
    };
    logger.debug(messages.generateAll.shellGenerate());
    const shellInitResult = await this.shellInitGenerator.generate(orderedToolConfigs, shellInitOptions);
    const primaryPath = shellInitResult?.primaryPath ?? 'null';
    logger.debug(messages.generateAll.shellInitComplete(primaryPath));

    // 3. Generate Symlinks
    const symlinkOptions: IGenerateSymlinksOptions = { overwrite: true, backup: true };
    const symlinkResults: SymlinkOperationResult[] = await this.symlinkGenerator.generate(
      orderedToolConfigs,
      symlinkOptions
    );
    const symlinkResultCount = symlinkResults?.length ?? 0;
    logger.debug(messages.generateAll.symlinkGenerationComplete(symlinkResultCount));
  }

  /**
   * @inheritdoc IGeneratorOrchestrator.generateCompletionsForTool
   */
  async generateCompletionsForTool(toolName: string, toolConfig: ToolConfig, version?: string): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'generateCompletionsForTool', context: toolName });
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
          completionInput
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
        };

        const completionResult = await this.completionGenerator.generateAndWriteCompletionFile(
          completionConfig,
          toolName,
          shellType,
          generationContext
        );

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

    const result: ShellCompletionConfig = {
      ...(value.source && { source: value.source }),
      ...(value.url && { url: value.url }),
      ...(value.cmd && { cmd: value.cmd }),
      ...(value.bin && { bin: value.bin }),
      ...(value.name && { name: value.name }),
      ...(value.targetDir && { targetDir: value.targetDir }),
    };
    return result;
  }
}
