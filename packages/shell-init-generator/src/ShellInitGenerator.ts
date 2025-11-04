import path from 'node:path';
import type { YamlConfig } from '@dotfiles/config';
import type { ShellType, ToolConfig } from '@dotfiles/core';
import type { IFileSystem } from '@dotfiles/file-system';
import type { TsLogger } from '@dotfiles/logger';
import { resolvePlatformConfig } from '@dotfiles/utils';
import type { GenerateShellInitOptions, IShellInitGenerator, ShellInitGenerationResult } from './IShellInitGenerator';
import { messages } from './log-messages';
import { type ProfileUpdateConfig, ProfileUpdater } from './profile-updater';
import {
  type AdditionalShellFile,
  createGenerator,
  type IShellGenerator,
  type ShellInitContent,
} from './shell-generators';

export class ShellInitGenerator implements IShellInitGenerator {
  private readonly fs: IFileSystem;
  private readonly appConfig: YamlConfig;
  private readonly logger: TsLogger;

  constructor(parentLogger: TsLogger, fileSystem: IFileSystem, appConfig: YamlConfig) {
    this.logger = parentLogger.getSubLogger({ name: 'ShellInitGenerator' });
    const logger = this.logger.getSubLogger({ name: 'constructor' });
    logger.debug(messages.constructor.initialized());
    this.fs = fileSystem;
    this.appConfig = appConfig;
  }

  async generate(
    toolConfigs: Record<string, ToolConfig>,
    options?: GenerateShellInitOptions
  ): Promise<ShellInitGenerationResult | null> {
    const logger = this.logger.getSubLogger({ name: 'generate' });
    const fileSystemName = this.fs.constructor.name;
    logger.debug(messages.generate.started(fileSystemName));

    const shellTypes: ShellType[] = options?.shellTypes ?? ['zsh'];
    const generatedFiles = new Map<ShellType, string>();
    let primaryPath: string | null = null;

    const toolConfigsCount = toolConfigs ? Object.keys(toolConfigs).length : 0;
    logger.debug(messages.generate.parsedToolCount(toolConfigsCount));

    for (const shellType of shellTypes) {
      const result = await this.generateForShellType(shellType, toolConfigs, options);
      if (result) {
        generatedFiles.set(shellType, result.outputPath);
        if (primaryPath === null) {
          primaryPath = result.outputPath;
        }
      }
    }

    if (generatedFiles.size === 0) {
      return null;
    }

    const result: ShellInitGenerationResult = {
      files: generatedFiles,
      primaryPath,
    };

    const shouldUpdateProfiles = options?.updateProfileFiles ?? true;
    if (shouldUpdateProfiles) {
      result.profileUpdates = await this.updateProfileFiles(generatedFiles);
    }

    return result;
  }

  private async generateForShellType(
    shellType: ShellType,
    toolConfigs: Record<string, ToolConfig>,
    options?: GenerateShellInitOptions
  ): Promise<{ outputPath: string } | null> {
    const logger = this.logger.getSubLogger({ name: 'generateForShellType' });
    try {
      const generator = createGenerator(shellType, this.appConfig);
      const outputPath = options?.outputPath ?? generator.getDefaultOutputPath();
      logger.debug(messages.generate.resolvedOutputPath(outputPath));

      const toolContents = await this.extractToolContents(toolConfigs, generator, options);
      const fileContent = generator.generateFileContent(toolContents);

      await this.cleanupOnceScriptsDirectory(shellType);
      const additionalFiles = generator.getAdditionalFiles(toolContents);

      const writeResult = await this.writeShellFiles(outputPath, fileContent, additionalFiles);
      return writeResult ? { outputPath } : null;
    } catch (error: unknown) {
      logger.debug(messages.generate.shellTypeFailure(shellType), error);
      return null;
    }
  }

  private async extractToolContents(
    toolConfigs: Record<string, ToolConfig>,
    generator: IShellGenerator,
    options?: GenerateShellInitOptions
  ): Promise<Map<string, ShellInitContent>> {
    const logger = this.logger.getSubLogger({ name: 'extractToolContents' });
    const toolContents = new Map<string, ShellInitContent>();

    for (const toolName in toolConfigs) {
      const config = toolConfigs[toolName];
      if (config) {
        logger.debug(messages.generate.processingTool(toolName));
      } else {
        logger.debug(messages.generate.skippingTool(toolName));
        continue;
      }

      const resolvedConfig = options?.systemInfo ? resolvePlatformConfig(config, options.systemInfo) : config;
      const shellContent = generator.extractShellContent(toolName, resolvedConfig);

      if (this.hasContent(shellContent)) {
        toolContents.set(toolName, shellContent);
      }
    }

    return toolContents;
  }

  private async writeShellFiles(
    outputPath: string,
    fileContent: string,
    additionalFiles: AdditionalShellFile[]
  ): Promise<boolean> {
    const logger = this.logger.getSubLogger({ name: 'writeShellFiles' });
    try {
      await this.fs.ensureDir(path.dirname(outputPath));
      await this.fs.writeFile(outputPath, fileContent);

      for (const additionalFile of additionalFiles) {
        await this.writeAdditionalFile(additionalFile);
      }

      return true;
    } catch (error: unknown) {
      logger.debug(messages.generate.writeFailure(outputPath), error);
      return false;
    }
  }

  private async writeAdditionalFile(additionalFile: AdditionalShellFile): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'writeAdditionalFile' });
    try {
      await this.fs.ensureDir(path.dirname(additionalFile.outputPath));
      await this.fs.writeFile(additionalFile.outputPath, additionalFile.content);
    } catch (error: unknown) {
      logger.debug(messages.generate.writeFailure(additionalFile.outputPath), error);
    }
  }

  /**
   * Updates shell profile files to source the generated shell scripts.
   * @param generatedFiles - Map of shell type to generated file path
   * @returns Promise resolving to array of profile update results
   */
  private async updateProfileFiles(generatedFiles: Map<ShellType, string>) {
    const logger = this.logger.getSubLogger({ name: 'updateProfileFiles' });
    const profileUpdater = new ProfileUpdater(this.fs, this.appConfig.paths.homeDir);

    const configs: ProfileUpdateConfig[] = [];
    for (const [shellType, scriptPath] of generatedFiles) {
      configs.push({
        shellType,
        generatedScriptPath: scriptPath,
        onlyIfExists: true, // Only update profile files if they already exist
        yamlConfigPath: this.appConfig.configFilePath,
      });
    }

    logger.debug(messages.profiles.starting(configs.length));
    return await profileUpdater.updateProfiles(configs);
  }

  /**
   * Cleans up the once scripts directory for a specific shell type by removing all existing files.
   * This ensures that removed or changed once scripts don't remain from previous generations.
   * @param shellType - The shell type to clean up once scripts for
   */
  private async cleanupOnceScriptsDirectory(shellType: ShellType): Promise<void> {
    const logger = this.logger.getSubLogger({ name: 'cleanupOnceScriptsDirectory' });
    const onceDir = path.join(this.appConfig.paths.shellScriptsDir, '.once');

    try {
      const onceDirExists = await this.fs.exists(onceDir);
      if (!onceDirExists) {
        return;
      }

      const extension = this.getShellExtension(shellType);
      const files = await this.fs.readdir(onceDir);

      // Filter to only files matching this shell type and remove them
      for (const file of files) {
        if (file.endsWith(`.${extension}`)) {
          const filePath = path.join(onceDir, file);
          await this.fs.rm(filePath);
          logger.debug(messages.cleanup.onceScriptRemoved(filePath));
        }
      }
    } catch (error: unknown) {
      logger.debug(messages.cleanup.failure(onceDir), error);
      // Continue generation even if cleanup fails
    }
  }

  /**
   * Gets the file extension for a shell type
   * @param shellType - The shell type
   * @returns The file extension for the shell
   */
  private getShellExtension(shellType: ShellType): string {
    switch (shellType) {
      case 'zsh':
        return 'zsh';
      case 'bash':
        return 'bash';
      case 'powershell':
        return 'ps1';
      default:
        throw new Error(`Unsupported shell type: ${shellType}`);
    }
  }

  /**
   * Checks if shell content has any meaningful content to generate.
   * @param content - Shell content to check
   * @returns True if content has meaningful data
   */
  private hasContent(content: ShellInitContent): boolean {
    return (
      content.toolInit.length > 0 ||
      content.pathModifications.length > 0 ||
      content.environmentVariables.length > 0 ||
      content.completionSetup.length > 0 ||
      content.onceScripts.length > 0 ||
      content.alwaysScripts.length > 0
    );
  }
}
