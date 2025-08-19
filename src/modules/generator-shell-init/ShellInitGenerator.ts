import path from 'node:path';
import type { YamlConfig } from '@modules/config';
import type { IFileSystem } from '@modules/file-system';
import type { TsLogger } from '@modules/logger';
import { logs } from '@modules/logger';
import type { ShellType, ToolConfig } from '@types';
import { resolvePlatformConfig } from '@utils';
import type { GenerateShellInitOptions, IShellInitGenerator, ShellInitGenerationResult } from './IShellInitGenerator';
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
    this.logger.debug(logs.shellInit.debug.constructorDebug(), fileSystem, appConfig);
    this.fs = fileSystem;
    this.appConfig = appConfig;
  }

  async generate(
    toolConfigs: Record<string, ToolConfig>,
    options?: GenerateShellInitOptions
  ): Promise<ShellInitGenerationResult | null> {
    this.logger.debug(logs.shellInit.debug.generateDebug(), toolConfigs, options, this.fs.constructor.name);

    const shellTypes: ShellType[] = options?.shellTypes ?? ['zsh'];
    const generatedFiles = new Map<ShellType, string>();
    let primaryPath: string | null = null;

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
    try {
      const generator = createGenerator(shellType, this.appConfig);
      const outputPath = options?.outputPath ?? generator.getDefaultOutputPath();
      this.logger.debug(logs.shellInit.debug.outputPath(), outputPath);

      const toolContents = await this.extractToolContents(toolConfigs, generator, options);
      const fileContent = generator.generateFileContent(toolContents);

      await this.cleanupOnceScriptsDirectory(shellType);
      const additionalFiles = generator.getAdditionalFiles(toolContents);

      const writeResult = await this.writeShellFiles(outputPath, fileContent, additionalFiles);
      return writeResult ? { outputPath } : null;
    } catch (error: unknown) {
      this.logger.debug(
        logs.shellInit.debug.writeError(),
        shellType,
        this.fs.constructor.name,
        (error as Error).message
      );
      return null;
    }
  }

  private async extractToolContents(
    toolConfigs: Record<string, ToolConfig>,
    generator: IShellGenerator,
    options?: GenerateShellInitOptions
  ): Promise<Map<string, ShellInitContent>> {
    const toolContents = new Map<string, ShellInitContent>();

    for (const toolName in toolConfigs) {
      const config = toolConfigs[toolName];
      this.logger.debug(logs.shellInit.debug.processingTool(), toolName, config);

      if (!config) {
        this.logger.debug(logs.shellInit.debug.skippingUndefined(), toolName);
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
    try {
      await this.fs.ensureDir(path.dirname(outputPath));
      await this.fs.writeFile(outputPath, fileContent);

      for (const additionalFile of additionalFiles) {
        await this.writeAdditionalFile(additionalFile);
      }

      return true;
    } catch (error: unknown) {
      this.logger.debug(
        logs.shellInit.debug.writeError(),
        outputPath,
        this.fs.constructor.name,
        (error as Error).message
      );
      return false;
    }
  }

  private async writeAdditionalFile(additionalFile: AdditionalShellFile): Promise<void> {
    try {
      await this.fs.ensureDir(path.dirname(additionalFile.outputPath));
      await this.fs.writeFile(additionalFile.outputPath, additionalFile.content);
    } catch (error: unknown) {
      this.logger.debug(
        logs.shellInit.debug.writeError(),
        additionalFile.outputPath,
        this.fs.constructor.name,
        (error as Error).message
      );
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
        yamlConfigPath: this.appConfig.userConfigPath,
      });
    }

    logger.debug(
      logs.shellInit.debug.updatingProfiles(),
      configs.map((c) => ({ shellType: c.shellType, path: c.generatedScriptPath }))
    );

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
        logger.debug(logs.shellInit.debug.outputPath(), `Once directory does not exist: ${onceDir}`);
        return;
      }

      // Get file extension for this shell type
      const extension = this.getShellExtension(shellType);

      // Read all files in the once directory
      const files = await this.fs.readdir(onceDir);

      // Filter to only files matching this shell type and remove them
      for (const file of files) {
        if (file.endsWith(`.${extension}`)) {
          const filePath = path.join(onceDir, file);
          await this.fs.rm(filePath);
          logger.debug(logs.shellInit.debug.outputPath(), `Removed stale once script: ${filePath}`);
        }
      }
    } catch (error: unknown) {
      logger.debug(logs.shellInit.debug.writeError(), onceDir, this.fs.constructor.name, (error as Error).message);
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
