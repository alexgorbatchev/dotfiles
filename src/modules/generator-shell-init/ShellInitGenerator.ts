import path from 'node:path';
import type { ToolConfig, ShellType } from '@types';
import type { IFileSystem } from '@modules/file-system';
import type { IShellInitGenerator, GenerateShellInitOptions, ShellInitGenerationResult } from './IShellInitGenerator';
import type { TsLogger } from '@modules/logger';
import type { YamlConfig } from '@modules/config';
import { DebugTemplates } from '@modules/shared/ErrorTemplates';
import { ShellGeneratorFactory, type ShellInitContent } from './shell-generators';
import { ProfileUpdater, type ProfileUpdateConfig } from './profile-updater';
import { resolvePlatformConfig } from '@utils';

export class ShellInitGenerator implements IShellInitGenerator {
  private readonly fs: IFileSystem;
  private readonly appConfig: YamlConfig;
  private readonly logger: TsLogger;

  constructor(parentLogger: TsLogger, fileSystem: IFileSystem, appConfig: YamlConfig) {
    this.logger = parentLogger.getSubLogger({ name: 'ShellInitGenerator' });
    this.logger.debug(DebugTemplates.shellInit.constructorDebug(), fileSystem, appConfig);
    this.fs = fileSystem;
    this.appConfig = appConfig;
  }

  async generate(
    toolConfigs: Record<string, ToolConfig>,
    options?: GenerateShellInitOptions
  ): Promise<ShellInitGenerationResult | null> {
    this.logger.debug(DebugTemplates.shellInit.generateDebug(), toolConfigs, options, this.fs.constructor.name);
    
    // Default to zsh for backward compatibility
    const shellTypes: ShellType[] = options?.shellTypes ?? ['zsh'];
    const generatedFiles = new Map<ShellType, string>();
    let primaryPath: string | null = null;

    for (const shellType of shellTypes) {
      try {
        const generator = ShellGeneratorFactory.createGenerator(shellType, this.appConfig);
        const outputPath = options?.outputPath ?? generator.getDefaultOutputPath();
        
        this.logger.debug(DebugTemplates.shellInit.outputPath(), outputPath);

        // Extract shell content from all tools
        const toolContents = new Map<string, ShellInitContent>();
        
        for (const toolName in toolConfigs) {
          const config = toolConfigs[toolName];
          this.logger.debug(DebugTemplates.shellInit.processingTool(), toolName, config);

          if (!config) {
            this.logger.debug(DebugTemplates.shellInit.skippingUndefined(), toolName);
            continue;
          }

          // Resolve platform-specific configuration if systemInfo is provided
          const resolvedConfig = options?.systemInfo ? resolvePlatformConfig(config, options.systemInfo) : config;

          // Extract shell content using the generator
          const shellContent = generator.extractShellContent(toolName, resolvedConfig);
          
          // Process completions if they exist
          if (resolvedConfig.completions) {
            const completionSetup = generator.processCompletions(toolName, resolvedConfig.completions);
            shellContent.completionSetup.push(...completionSetup);
          }

          if (this.hasContent(shellContent)) {
            toolContents.set(toolName, shellContent);
          }
        }

        // Generate file content using the shell-specific generator
        const fileContent = generator.generateFileContent(toolContents);
        
        // Clean up once scripts directory before writing new ones
        await this.cleanupOnceScriptsDirectory(shellType);

        // Get additional files (e.g., once scripts)
        const additionalFiles = generator.getAdditionalFiles(toolContents);

        // Write the main file
        try {
          await this.fs.ensureDir(path.dirname(outputPath));
          await this.fs.writeFile(outputPath, fileContent);
          generatedFiles.set(shellType, outputPath);
          
          // Set primary path to the first generated file (for backward compatibility)
          if (primaryPath === null) {
            primaryPath = outputPath;
          }
          
          // Write additional files
          for (const additionalFile of additionalFiles) {
            try {
              await this.fs.ensureDir(path.dirname(additionalFile.outputPath));
              await this.fs.writeFile(additionalFile.outputPath, additionalFile.content);
            } catch (error: any) {
              this.logger.debug(DebugTemplates.shellInit.writeError(), additionalFile.outputPath, this.fs.constructor.name, error.message);
              // Continue with other additional files even if one fails
            }
          }
        } catch (error: any) {
          this.logger.debug(DebugTemplates.shellInit.writeError(), outputPath, this.fs.constructor.name, error.message);
          // Continue with other shell types even if one fails
        }
      } catch (error: any) {
        this.logger.debug(DebugTemplates.shellInit.writeError(), shellType, this.fs.constructor.name, error.message);
        // Continue with other shell types even if one fails
      }
    }

    if (generatedFiles.size === 0) {
      return null;
    }

    const result: ShellInitGenerationResult = {
      files: generatedFiles,
      primaryPath,
    };

    // Update profile files if requested (defaults to true)
    const shouldUpdateProfiles = options?.updateProfileFiles ?? true;
    if (shouldUpdateProfiles) {
      result.profileUpdates = await this.updateProfileFiles(generatedFiles);
    }

    return result;
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
    
    logger.debug(DebugTemplates.shellInit.updatingProfiles(), configs.map(c => ({ shellType: c.shellType, path: c.generatedScriptPath })));
    
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
        logger.debug(DebugTemplates.shellInit.outputPath(), `Once directory does not exist: ${onceDir}`);
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
          logger.debug(DebugTemplates.shellInit.outputPath(), `Removed stale once script: ${filePath}`);
        }
      }
    } catch (error: any) {
      logger.debug(DebugTemplates.shellInit.writeError(), onceDir, this.fs.constructor.name, error.message);
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